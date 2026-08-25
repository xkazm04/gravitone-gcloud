"""Run every frame in frames/ past every model under test, one schema for all.

    python probe.py                      # all frames, all configured models
    python probe.py --models gemma4:12b gemini-3.7-flash
    python probe.py --frames arcane-vi-jinx.png --repeat 3

Writes ../../vlm-probe-out/<run-id>/results.jsonl -- one row per
(frame, model, repeat). Nothing lands inside the repo tree; the output
directory is gitignored, because these rows are evidence, not source.

The whole point is that both backends are held to the identical schema and
the identical prompt. Any quality gap that shows up is then a gap in the
model, not a gap in how we asked.
"""

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from schema import PROMPT, gemini_schema, json_schema  # noqa: E402

HERE = Path(__file__).parent
FRAMES_DIR = HERE / "frames"
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"
ENV_FILE = Path(r"C:\Users\kazda\kiro\personas\.env")

OLLAMA = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_CLOUD = "https://ollama.com"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

# The cast. Local models are the candidates; the Gemini row is the yardstick.
LOCAL_MODELS = ["gemma4:12b", "ornith-1.5:9b", "qwen3.8:27b", "muse-glimmer:30b"]
REMOTE_MODELS = ["gemini-3.7-flash"]

# The middle tier, opt-in only: open weights we could in principle host, run
# on someone else's GPU. It answers a different question from the local cast --
# not "can this box do it" but "is the open-weights *family* good enough at
# any size", which is what decides whether waiting for hardware is worth it.
# Prefixed `cloud/` so a tag can never be confused with its local namesake.
CLOUD_MODELS = ["cloud/gemma4:31b", "cloud/qwen3.5:397b", "cloud/minimax-m3"]

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def load_env():
    if not ENV_FILE.exists():
        return {}
    env = {}
    for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def post(url, payload, headers=None, timeout=900):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


# --- backends -------------------------------------------------------------

def run_ollama(model, b64, mime, base=OLLAMA, api_key=None):
    """One code path for local and cloud Ollama -- same API, different host."""
    body = {
        "model": model,
        "messages": [{"role": "user", "content": PROMPT, "images": [b64]}],
        "format": json_schema(),
        "stream": False,
        "options": {"temperature": 0, "num_ctx": 8192},
    }
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        # Reasoning models burn minutes on a frame description; ask them not
        # to. Models without a thinking mode reject the key outright.
        r = post(f"{base}/api/chat", dict(body, think=False), headers=headers)
    except urllib.error.HTTPError as e:
        if e.code != 400:
            raise
        r = post(f"{base}/api/chat", body, headers=headers)
    return r["message"]["content"], {
        "eval_count": r.get("eval_count"),
        "prompt_eval_count": r.get("prompt_eval_count"),
        "load_duration_ms": round((r.get("load_duration") or 0) / 1e6),
    }


def run_gemini(model, b64, mime, api_key):
    body = {
        "contents": [{"parts": [
            {"text": PROMPT},
            {"inline_data": {"mime_type": mime, "data": b64}},
        ]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": gemini_schema(),
        },
    }
    r = post(f"{GEMINI_BASE}/{model}:generateContent", body,
             headers={"x-goog-api-key": api_key})
    cand = r["candidates"][0]
    text = "".join(p.get("text", "") for p in cand["content"]["parts"])
    usage = r.get("usageMetadata", {})
    return text, {
        "eval_count": usage.get("candidatesTokenCount"),
        "prompt_eval_count": usage.get("promptTokenCount"),
        "finish_reason": cand.get("finishReason"),
    }


def extract_json(text):
    """Recover the JSON object from a reply that may be dressed up.

    Constrained decoding makes this unnecessary -- and the local Ollama
    endpoint honours `format`, so its replies are bare objects. The hosted
    endpoint at ollama.com does NOT: it ignores the schema and answers in a
    fenced markdown block with whatever shape it likes. We unwrap that rather
    than crash, so the mismatch lands in the structural-fault column where it
    belongs, as a fact about the tier instead of a traceback.
    """
    t = (text or "").strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[-1] if "\n" in t else t
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    t = t.strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        start, end = t.find("{"), t.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(t[start:end + 1])


def vram_now():
    """What Ollama currently holds resident -- the local cost of the answer."""
    try:
        with urllib.request.urlopen(f"{OLLAMA}/api/ps", timeout=10) as r:
            ps = json.loads(r.read().decode("utf-8"))
        return {m["name"]: round(m.get("size_vram", 0) / 1e9, 2) for m in ps.get("models", [])}
    except Exception:
        return {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", nargs="*", default=None)
    ap.add_argument("--frames", nargs="*", default=None)
    ap.add_argument("--repeat", type=int, default=1,
                    help="runs per (frame, model) -- above 1 measures self-consistency")
    ap.add_argument("--run-id", default=None)
    ap.add_argument("--require-vram", type=float, default=20.0,
                    help="GB of free VRAM to demand before loading a local model")
    args = ap.parse_args()

    env = load_env()
    api_key = env.get("GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY")
    ollama_key = env.get("OLLAMA_API_KEY") or os.environ.get("OLLAMA_API_KEY")

    models = args.models or (LOCAL_MODELS + REMOTE_MODELS)
    if args.frames:
        frames = [FRAMES_DIR / f for f in args.frames]
    else:
        frames = sorted(p for p in FRAMES_DIR.iterdir()
                        if p.is_file() and p.suffix.lower() in MIME)
    if not frames:
        sys.exit(f"no frames found in {FRAMES_DIR} -- drop images there first")

    # One 24 GB card, two engines that do not know about each other. The
    # annotator needs ~22.3 GB of it, so ComfyUI holding models is the
    # difference between a 7-second call and a spilled, minutes-long one.
    if any(m in LOCAL_MODELS or (not m.startswith(("gemini", "cloud/"))) for m in models):
        try:
            import guard
            for m in models:
                if not m.startswith(("gemini", "cloud/")):
                    guard.require_model(m, vram_gb=args.require_vram, free=["comfy"])
                    break
        except RuntimeError as e:
            sys.exit(f"GUARD: {e}")
        except ImportError:
            pass

    run_id = args.run_id or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")
    out_dir = OUT_ROOT / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    results_path = out_dir / "results.jsonl"

    print(f"run {run_id}: {len(frames)} frame(s) x {len(models)} model(s) x {args.repeat}")
    print(f"  -> {results_path}\n")

    with results_path.open("a", encoding="utf-8") as fh:
        for frame in frames:
            raw = frame.read_bytes()
            b64 = base64.b64encode(raw).decode("ascii")
            mime = MIME[frame.suffix.lower()]
            for model in models:
                for rep in range(args.repeat):
                    label = f"{frame.name:26s} {model:18s} #{rep + 1}"
                    t0 = time.time()
                    row = {
                        "run_id": run_id, "frame": frame.name, "model": model,
                        "repeat": rep + 1, "bytes": len(raw),
                    }
                    try:
                        if model in REMOTE_MODELS or model.startswith("gemini"):
                            if not api_key:
                                raise RuntimeError("GEMINI_API_KEY not in personas/.env")
                            text, meta = run_gemini(model, b64, mime, api_key)
                            row["tier"] = "remote"
                        elif model.startswith("cloud/"):
                            if not ollama_key:
                                raise RuntimeError("OLLAMA_API_KEY not in personas/.env")
                            text, meta = run_ollama(model[len("cloud/"):], b64, mime,
                                                    base=OLLAMA_CLOUD, api_key=ollama_key)
                            row["tier"] = "cloud"
                        else:
                            text, meta = run_ollama(model, b64, mime)
                            row["tier"] = "local"
                            row["vram_gb"] = vram_now().get(model)
                        row["latency_s"] = round(time.time() - t0, 2)
                        row["raw"] = text
                        row["meta"] = meta
                        try:
                            row["parsed"] = extract_json(text)
                            row["ok"] = True
                            print(f"  {label}  {row['latency_s']:7.2f}s  ok")
                        except json.JSONDecodeError as e:
                            row["ok"] = False
                            row["error"] = f"unparseable JSON: {e}"
                            print(f"  {label}  {row['latency_s']:7.2f}s  BAD JSON")
                    except Exception as e:
                        row["latency_s"] = round(time.time() - t0, 2)
                        row["ok"] = False
                        row["error"] = f"{type(e).__name__}: {e}"
                        print(f"  {label}  {row['latency_s']:7.2f}s  ERROR {e}")
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                    fh.flush()

    print(f"\ndone -> {results_path}")
    print(f"next: python score.py --run {run_id}")


if __name__ == "__main__":
    main()
