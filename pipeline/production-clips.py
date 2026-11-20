"""THE PRODUCTION'S TAKES on MiniMax H3 reference mode (Ref2VA, 4-step turbo), film 5's method (spark character-cores S1.5, WP8).

One take is one job file (JSON), so the production CLI can write jobs and call this later:
  {"take": "K00", "out": ".../takes/unlatched/sofia/K00.mp4",
   "refs": [{"file": "sheet.png", "words": "Use <Picture 1> as the reference for ..."}, ...],   # at most 3, in picture order
   "guide": {"file": "K00.png"}  |  {"file": "K00.mp4", "start": 268, "length": 22},             # anchored at frame 0
   "control": "ctrl-K00.mp4", "prompt": "...", "frames": 311, "width": 1280, "height": 704, "seed": 7700,
   "grade": {"cube": "grade.cube", "from": 22}}                                                   # optional
The prompt H3 sees is every ref's words, then the prompt. The references ride every sampling step, so the room and who she
is hold without a last-frame anchor; the guide is the take's start (a still keyframe, or the previous take's frames: that
is the chain); the control is an OpenPose or depth-body video at strength 1.0 over the whole schedule.

Writes <out stem>-raw.mp4 (what H3 made) and <out> (graded from `grade.from`: controlled takes come out darker than their
seed, and the guide frames already have the right colours), and appends one line per take to <out dir>/ledger.jsonl with
the wall time and every input path. Skips a take whose raw exists. Waits while ComfyUI's queue holds another job (a box
held by another job is a wait, not a failure). Holds the box out of standby while it runs: display-off standby makes the
same H3 step 2.7x slower (measured 2026-11-06); the request ends with this process.

usage: python pipeline/production-clips.py <job.json> [<job.json> ...]   (in order; stops at the first failure, a chain needs it)
       python pipeline/production-clips.py --regrade <job.json> ...       (the graded mp4 again from the kept raw)
"""
import ctypes, json, os, shutil, subprocess, sys, time, urllib.request, uuid

BASE = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
OUTG = os.environ.get("COMFY_OUTPUT") or os.path.join(os.path.expanduser("~"), "ai", "ComfyUI", "ComfyUI", "output")
UNET = "minimax_h3_ref2va_pruned_int8_convrot.safetensors"
CLIP = "qwen3vl_32b_minimax_h3_int8_convrot.safetensors"
VAE = "minimax_h3_video_vae_int8_convrot.safetensors"
AVAE = "minimax_h3_audio_vae_fp32.safetensors"
LORA = "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors"
CNET = "minimax_h3_fun_controlnet_union_2.0_pruned_int8_convrot.safetensors"


def keep_awake():
    if os.name != "nt": return
    k = ctypes.windll.kernel32; k.SetThreadExecutionState.restype = ctypes.c_uint; k.SetThreadExecutionState.argtypes = [ctypes.c_uint]
    k.SetThreadExecutionState(0x80000000 | 0x1 | 0x2)   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED


def req(path, data=None, headers=None):
    with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=headers or {}), timeout=120) as f: return f.read()


def upload(path, name):
    b = "----pc" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode() + open(path, "rb").read() + f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{b}--\r\n".encode()
    return json.loads(req("/upload/image", body, {"content-type": f"multipart/form-data; boundary={b}"}))["name"]


def video(g, key, path, name, start=None, length=None):
    g[key + "v"] = {"class_type": "LoadVideo", "inputs": {"file": upload(path, name)}}
    g[key + "c"] = {"class_type": "GetVideoComponents", "inputs": {"video": [key + "v", 0]}}
    if start is None: return [key + "c", 0]
    g[key] = {"class_type": "ImageFromBatch", "inputs": {"image": [key + "c", 0], "batch_index": start, "length": length}}
    return [key, 0]


def tag(j): return "pc-" + os.path.basename(os.path.dirname(j["out"])) + "-" + j["take"]


def graph(j):
    t = tag(j); refs = j["refs"]
    if not 1 <= len(refs) <= 3: raise ValueError("a take takes 1 to 3 reference pictures")
    for f in [r["file"] for r in refs] + [j["guide"]["file"], j["control"]]:
        if not os.path.exists(f): raise RuntimeError(f"missing input {f}")
    g = {"unet": {"class_type": "UNETLoader", "inputs": {"unet_name": UNET, "weight_dtype": "default"}},
         "clip": {"class_type": "CLIPLoader", "inputs": {"clip_name": CLIP, "type": "minimax", "device": "default"}},
         "vae": {"class_type": "VAELoader", "inputs": {"vae_name": VAE}},
         "avae": {"class_type": "VAELoader", "inputs": {"vae_name": AVAE}},
         "lora": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["unet", 0], "lora_name": LORA, "strength_model": 1}}}
    c = {"clip": ["clip", 0], "vae": ["vae", 0], "audio_vae": ["avae", 0], "prompt": "".join(r["words"] for r in refs) + j["prompt"],
         "width": j.get("width", 1280), "height": j.get("height", 704), "length": j["frames"], "ref_image_size": "match"}
    for k, r in enumerate(refs):
        g[f"r{k}"] = {"class_type": "LoadImage", "inputs": {"image": upload(r["file"], f"{t}-ref{k}{os.path.splitext(r['file'])[1]}")}}; c[f"ref_images.ref_image_{k}"] = [f"r{k}", 0]
    g["cond"] = {"class_type": "MiniMaxH3ReferenceToVideo", "inputs": c}
    gd = j["guide"]
    if gd["file"].lower().endswith(".mp4"): start = video(g, "seed", gd["file"], f"{t}-seed.mp4", gd.get("start", 0), gd.get("length", 22))
    else: g["seedi"] = {"class_type": "LoadImage", "inputs": {"image": upload(gd["file"], f"{t}-start{os.path.splitext(gd['file'])[1]}")}}; start = ["seedi", 0]
    g["g0"] = {"class_type": "MiniMaxH3AddGuide", "inputs": {"positive": ["cond", 0], "latent": ["cond", 1], "frame_idx": 0, "vae": ["vae", 0], "image": start}}
    g["mp"] = {"class_type": "ModelPatchLoader", "inputs": {"name": CNET}}
    g["cn"] = {"class_type": "MiniMaxH3FunControlNetApply", "inputs": {"model": ["lora", 0], "model_patch": ["mp", 0], "vae": ["vae", 0], "strength": j.get("controlStrength", 1.0),
                                                                       "start_percent": 0.0, "end_percent": 1.0, "control_video": video(g, "ctl", j["control"], f"{t}-ctrl.mp4")}}
    g["ks"] = {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "res_multistep"}}
    g["sch"] = {"class_type": "BasicScheduler", "inputs": {"model": ["cn", 0], "scheduler": "simple", "steps": 4, "denoise": 1}}
    g["noise"] = {"class_type": "RandomNoise", "inputs": {"noise_seed": j.get("seed", 7700)}}
    g["gd"] = {"class_type": "BasicGuider", "inputs": {"model": ["cn", 0], "conditioning": ["g0", 0]}}
    g["sam"] = {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["noise", 0], "guider": ["gd", 0], "sampler": ["ks", 0], "sigmas": ["sch", 0], "latent_image": ["cond", 1]}}
    g["dec"] = {"class_type": "VAEDecode", "inputs": {"samples": ["sam", 0], "vae": ["vae", 0]}}
    g["cv"] = {"class_type": "CreateVideo", "inputs": {"images": ["dec", 0], "fps": 24, "bit_depth": 8, "color_space": "sRGB", "codec": "none"}}
    g["save"] = {"class_type": "SaveVideo", "inputs": {"video": ["cv", 0], "filename_prefix": f"gravitone/{t}-out", "format": "auto", "codec": "auto"}}
    return g


def run(j, g, raw):
    t = tag(j)
    while True:
        q = json.loads(req("/queue"))
        if not q["queue_running"] and not q["queue_pending"]: break
        print(time.strftime("%H:%M:%S"), "queue busy; waiting before", j["take"], flush=True); time.sleep(60)
    t0 = time.time(); r = json.loads(req("/prompt", json.dumps({"prompt": g, "client_id": t + "-" + uuid.uuid4().hex}).encode(), {"content-type": "application/json"}))
    if "prompt_id" not in r: raise RuntimeError(f"refused: {json.dumps(r)[:1200]}")
    pid = r["prompt_id"]; print(time.strftime("%H:%M:%S"), j["take"], "queued", pid, flush=True)
    while True:
        time.sleep(20); h = json.loads(req(f"/history/{pid}"))
        if pid not in h: continue
        st = h[pid].get("status", {})
        if st.get("status_str") == "error": raise RuntimeError(f"error: {json.dumps(st.get('messages'))[-1200:]}")
        if not st.get("completed", True) and st.get("status_str") != "success": continue
        for o in h[pid]["outputs"].values():
            for v in o.get("images", []) + o.get("videos", []):
                if v["filename"].startswith(f"{t}-out") and v["filename"].endswith(".mp4") and v.get("type") == "output":   # history also lists LoadVideo's inputs
                    shutil.copy(os.path.join(OUTG, v.get("subfolder", ""), v["filename"]), raw); return round(time.time() - t0), pid
        raise RuntimeError("finished with no mp4 of " + j["take"])


def grade(raw, cube, start, out):
    """The fixed LUT on the free frames only (film 4's method: tools/film4-lut.py apply). The switch reads the frame's time,
    not blend's N, which runs one ahead (measured 2026-11-20: film 5's K00 f21, a seed frame, came out graded)."""
    cu = cube.replace("\\", "/").replace(":", "\\:")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-filter_complex",
                    f"[0:v]split[a][b];[b]lut1d=file='{cu}'[g];[a][g]blend=all_expr='if(lt(T\\,{(start - 0.5) / 24:.5f})\\,A\\,B)',format=yuv420p[v]", "-map", "[v]",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "14", out], check=True)


def main(files):
    keep_awake()
    for jf in files:
        j = json.load(open(jf, encoding="utf8")); out = j["out"]; raw = os.path.splitext(out)[0] + "-raw.mp4"
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.exists(raw): print(j["take"], "exists"); continue
        inputs = {"job": os.path.abspath(jf), "refs": [r["file"] for r in j["refs"]], "guide": j["guide"], "control": j["control"], "grade": j.get("grade"),
                  "frames": j["frames"], "seed": j.get("seed", 7700)}
        try:
            wall, pid = run(j, graph(j), raw)
            if j.get("grade"): grade(raw, j["grade"]["cube"], j["grade"].get("from", 22), out)
            else: shutil.copy(raw, out)
            line = {"id": j["take"], "wallS": wall, "promptId": pid, "raw": raw, "out": out, **inputs, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        except Exception as e:
            line = {"id": j["take"], "error": str(e)[:1200], **inputs, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        open(os.path.join(os.path.dirname(out), "ledger.jsonl"), "a", encoding="utf8").write(json.dumps(line) + "\n"); print(json.dumps(line), flush=True)
        if "error" in line: print("stopping: the chain needs this take"); sys.exit(1)
    print("takes done")


if __name__ == "__main__":
    if len(sys.argv) < 2: sys.exit(__doc__)
    if sys.argv[1] == "--regrade":
        for jf in sys.argv[2:]:
            j = json.load(open(jf, encoding="utf8")); grade(os.path.splitext(j["out"])[0] + "-raw.mp4", j["grade"]["cube"], j["grade"].get("from", 22), j["out"]); print("graded", j["out"])
    else: main(sys.argv[1:])
