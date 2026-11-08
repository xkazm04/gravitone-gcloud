"""LoRA / adapter support for gen.py, moved verbatim from kiro/yue2-lab gen.py (in memory only; the cached
base weights on disk are never written). Two formats, auto-detected from the key names (see Adapter)."""
from __future__ import annotations

import re
import time
from contextlib import contextmanager
from pathlib import Path

SV_KEY = re.compile(r"^(text_encoders|diffusion_model)\.model\.layers\.(\d+)\."
                    r"(self_attn\.(?:qkv_proj|o_proj)|mlp\.(?:gate_up_proj|down_proj))\.(lora_A\.weight|lora_B\.weight|alpha)$")
NTC_KEY = re.compile(r"^adapters\.model-layers-(\d+)-self_attn-(q_proj|k_proj|v_proj|o_proj)\.(lora_down\.weight|lora_up\.weight|alpha)$")


def _sv_targets(expert, layer, projection):
    """ComfyUI / Sound & Vision fused layout -> native split YuE2 params. Verified byte-exact against the
    Comfy-Org/YuE2 bf16 checkpoint: text_encoders = AR path (self_attn/mlp), diffusion_model = NAR path
    (nar_self_attn/nar_mlp), qkv_proj = [q;k;v] rows (2048/1024/1024), gate_up_proj = [gate;up] rows (6144/6144)."""
    family, name = projection.split(".")
    base = f"model.layers.{layer}.{'nar_' if expert == 'diffusion_model' else ''}{family}."
    if name == "qkv_proj":
        return [(base + "q_proj.weight", 2048), (base + "k_proj.weight", 1024), (base + "v_proj.weight", 1024)]
    if name == "gate_up_proj":
        return [(base + "gate_proj.weight", 6144), (base + "up_proj.weight", 6144)]
    return [(base + name + ".weight", None)]


class Adapter:
    """Two formats, auto-detected from key names.

    sv-fused   atomtanstudio "sound-vision-yue2-native-export-v1" (= ComfyUI LoRA key layout): AR + NAR. Merged as
               W' = W + strength * alpha/rank * B@A in float32 into the bf16 in-memory weights, as Sound & Vision's
               merge_adapter() does. Pristine copies of the touched weights are kept on CPU; every merge starts from
               them, so strengths never accumulate, and restore() puts them back. Active for ALL stages.
    ntc-native ntc-ai "conceptmod-yue2-ar-v1" ordinary LoRA on AR self_attn q/k/v/o. Applied as forward wrappers
               y = W x + strength * alpha/rank * up(down(x)) like ntc's slider_runtime.py, ONLY during plan + semantic
               generation, removed before acoustic synthesis (the card's acoustic_scale 0)."""

    def __init__(self, path):
        from safetensors import safe_open
        self.path = str(path)
        with safe_open(self.path, framework="pt", device="cpu") as f:
            keys = list(f.keys())
            self.metadata = f.metadata() or {}
            self.tensors = {k: f.get_tensor(k) for k in keys}
        if all(SV_KEY.match(k) for k in keys):
            self.format, self.stages = "sv-fused", "all"
        elif all(NTC_KEY.match(k) for k in keys):
            self.format, self.stages = "ntc-native", "plan+semantic"
        else:
            bad = [k for k in keys if not (SV_KEY.match(k) or NTC_KEY.match(k))][:5]
            raise ValueError(f"Unrecognised adapter layout, e.g. {bad}")
        self.name = Path(self.path).stem
        self._originals = None

    def plan(self, model):
        """Validate every tensor against the installed model before changing anything.
        Returns [(param_or_module_name, A, B_rows, alpha/rank)]."""
        ops = []
        if self.format == "sv-fused":
            prefixes = sorted({SV_KEY.match(k)[0].rsplit(".", 2 if k.endswith(".weight") else 1)[0] for k in self.tensors})
            for prefix in prefixes:
                m = SV_KEY.match(prefix + ".lora_A.weight")
                a, b = self.tensors[prefix + ".lora_A.weight"], self.tensors[prefix + ".lora_B.weight"]
                alpha = float(self.tensors[prefix + ".alpha"].item()) if prefix + ".alpha" in self.tensors else a.shape[0]
                offset = 0
                for target, rows in _sv_targets(m[1], m[2], m[3]):
                    w = model.get_parameter(target)
                    rows = rows or w.shape[0]
                    if list(w.shape) != [rows, a.shape[1]]:
                        raise ValueError(f"shape mismatch {prefix} -> {target}: {list(w.shape)} vs {[rows, a.shape[1]]}")
                    ops.append((target, a, b[offset:offset + rows], alpha / a.shape[0]))
                    offset += rows
                if offset != b.shape[0]:
                    raise ValueError(f"{prefix}: B has {b.shape[0]} rows, targets use {offset}")
        else:
            for k in self.tensors:
                m = NTC_KEY.match(k)
                if m[3] != "lora_down.weight":
                    continue
                pre = k.rsplit(".lora_down", 1)[0]
                target = f"model.layers.{m[1]}.self_attn.{m[2]}"
                mod = model.get_submodule(target)
                a, b = self.tensors[k], self.tensors[pre + ".lora_up.weight"]
                alpha = float(self.tensors[pre + ".alpha"].item())
                if a.shape[1] != mod.in_features or b.shape[0] != mod.out_features or b.shape[1] != a.shape[0]:
                    raise ValueError(f"shape mismatch {k} -> {target}")
                ops.append((target, a, b, alpha / a.shape[0]))
        return ops

    def merge(self, model, strength):
        import torch
        ops = self.plan(model)
        with torch.no_grad():
            if self._originals is None:
                self._originals = {t: model.get_parameter(t).detach().to("cpu", copy=True) for t, *_ in ops}
            for target, a, b, scale in ops:
                w = model.get_parameter(target)
                base = self._originals[target].to(w.device, torch.float32)
                delta = b.to(w.device, torch.float32) @ a.to(w.device, torch.float32)
                w.copy_((base + delta * (strength * scale)).to(w.dtype))
        return len(ops)

    def restore(self, model):
        import torch
        if self._originals and model is not None:
            with torch.no_grad():
                for t, orig in self._originals.items():
                    w = model.get_parameter(t)
                    w.copy_(orig.to(w.device))

    @contextmanager
    def hooks(self, model, strength):
        import torch
        ops = self.plan(model)
        mods = []
        try:
            for target, a, b, scale in ops:
                mod = model.get_submodule(target)
                dev = mod.weight.device
                down, up, gain = a.to(dev, torch.float32), b.to(dev, torch.float32), strength * scale

                def fwd(x, org=mod.forward, down=down, up=up, gain=gain):
                    delta = (x.to(torch.float32) @ down.T @ up.T).to(x.dtype)
                    return org(x) + delta * gain
                mod.forward = fwd
                mods.append(mod)
            yield len(ops)
        finally:
            for mod in mods:
                mod.__dict__.pop("forward", None)


def run_staged(pipe, style, lyrics, kwargs, ar_ctx):
    """Same stages and timing dict as YuE2Pipeline.__call__, with ar_ctx() active only around plan + semantic."""
    from yue2.pipeline import SongResult
    from yue2.storage import identity
    request = pipe._request(style, lyrics, **kwargs)
    config = pipe.effective_config(request)
    request_id = identity({"request": request.to_dict(), "config": config, "weights": pipe.weights})
    start = time.perf_counter()
    with ar_ctx():
        plan = pipe.plan(request=request)
        semantic = pipe.generate_semantic(plan)
    nar_start = time.perf_counter()
    latents = pipe.synthesize(semantic)
    nar_seconds = time.perf_counter() - nar_start
    vae_start = time.perf_counter()
    audio = pipe.decode(latents)
    timing = {"abc": plan.timing, "semantic": semantic.timing, "nar_seconds": nar_seconds,
              "vae_seconds": time.perf_counter() - vae_start, "load": dict(pipe.load_timing),
              "e2e_seconds": time.perf_counter() - start}
    return SongResult(audio, 48000, semantic, latents, config, pipe.weights, timing, request_id)


