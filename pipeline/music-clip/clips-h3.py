"""Clips for a /music-clip film on the box's MiniMax H3 first-last-frame model (ComfyUI, $0).

    python -I pipeline/music-clip/clips-h3.py <clip dir> --plan <plan.json> [--only K21,K22] [--again] [--dry]

The plan (JSON) is a list of shots: {"id": "K24", "end": "K24b"} - the start frame is keyframes/<id>.jpg, the
end frame (optional) keyframes/<end>.jpg; the prompt is the shot's `motion` from keyframes.json, plus, when there
is an end frame, "The shot ends on: <the end keyframe's scene>". Each clip renders 124 frames (5.2 s at 24 fps,
the model's trained floor) at 1280x704 with the fl2v turbo LoRA (8 steps), and is written to clips/<id>.mp4;
music-clip/assembly.json gets {"<id>": {"in": 0, "out": <len>}} so assemble.mts plays the whole render inside
the shot's bar (x1.8 on a 2.9 s bar).

Why (Stay Here, 2026-11-01): LTX from a start frame alone invents each shot's action, and a run of 3 s shots
"lost any logic" (operator). With the next shot's keyframe as the end frame the action lands where the next
shot starts; on K25c the operator picked H3 at 5 s over LTX with an end guide ("C5 held the best").
Measured: ~20 min a clip alone on the card. A location change gets no end frame: the model would cut inside
the clip to reach it.

The queue is shared: a clip is only queued on an empty ComfyUI queue. The graph is pipeline/scout-nsfw/
h3-t2v-api.json (MiniMax H3 fl2va int8, Qwen3-VL text encoder) with first_frame / last_frame wired in.
"""
import json, os, sys, time, uuid, urllib.request

BASE = os.environ.get("COMFY_URL", "http://127.0.0.1:8188")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W, H, FPS, FRAMES = 1280, 704, 24, 124
SEED = 5000

args = sys.argv[1:]
def opt(n):
    if n in args:
        i = args.index(n); v = args[i + 1]; del args[i:i + 2]; return v
def flag(n):
    if n in args: args.remove(n); return True
    return False
plan_path, only, again, dry = opt("--plan"), opt("--only"), flag("--again"), flag("--dry")
if not args or not plan_path:
    sys.exit("usage: clips-h3.py <clip dir> --plan <plan.json> [--only K21] [--again] [--dry]")
clip = os.path.join(args[0], "music-clip")
kf = {f["id"]: f for f in json.load(open(os.path.join(clip, "keyframes.json"), encoding="utf8"))["frames"]}
plan = json.load(open(plan_path, encoding="utf8"))
only = set(only.split(",")) if only else None
out_dir = os.path.join(clip, "clips")
todo = [s for s in plan if (not only or s["id"] in only) and (again or not os.path.exists(os.path.join(out_dir, s["id"] + ".mp4")))]


def scene(prompt):
    """The scene sentence(s) of a keyframe prompt: after the gel sentence, before the shared 'Layers of' tail."""
    body = prompt.split(" Layers of black cardstock")[0]
    parts = body.split(". ", 2)
    return parts[2] if len(parts) == 3 else body


def prompt_for(s):
    p = kf[s["id"]]["motion"]
    if s.get("end"):
        p += " The shot ends on: " + scene(kf[s["end"]]["prompt"])
    return p


for s in todo:
    for k in [s["id"]] + ([s["end"]] if s.get("end") else []):
        if k not in kf or not os.path.exists(os.path.join(clip, "keyframes", k + ".jpg")):
            sys.exit(f"{s['id']}: no keyframe {k}")
print(f"{len(todo)} clip(s) on MiniMax H3 fl2v, {FRAMES} frames at {W}x{H}, ~20 min each alone on the card (~{len(todo) * 20 / 60:.1f} h): "
      + " ".join(f"{s['id']}{'->' + s['end'] if s.get('end') else ''}" for s in todo), flush=True)
if dry:
    for s in todo: print(f"\n{s['id']}: {prompt_for(s)}")
    sys.exit(0)


def req(path, data=None, headers=None):
    with urllib.request.urlopen(urllib.request.Request(BASE + path, data=data, headers=headers or {}), timeout=60) as f:
        return f.read()


def upload(k):
    b = "----h3" + uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"mc-{k}.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n").encode() \
        + open(os.path.join(clip, "keyframes", k + ".jpg"), "rb").read() \
        + f"\r\n--{b}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{b}--\r\n".encode()
    return json.loads(req("/upload/image", body, {"content-type": f"multipart/form-data; boundary={b}"}))["name"]


def queue_size():
    try:
        q = json.loads(req("/queue")); return len(q["queue_running"]) + len(q["queue_pending"])
    except Exception:
        return -1


def graph(s, start, end):
    g = json.load(open(os.path.join(REPO, "pipeline", "scout-nsfw", "h3-t2v-api.json"), encoding="utf8"))
    del g["115"], g["140:132"], g["140:133"]
    n = g["140:131"]["inputs"]
    n.update(prompt=prompt_for(s), width=W, height=H, length=FRAMES, first_frame=["s1", 0])
    g["s1"] = {"class_type": "LoadImage", "inputs": {"image": start}}
    if end:
        g["s2"] = {"class_type": "LoadImage", "inputs": {"image": end}}
        n["last_frame"] = ["s2", 0]
    g["140:139"]["inputs"]["value"] = True  # fl2v turbo LoRA, 8 steps
    g["140:129"]["inputs"]["noise_seed"] = SEED + sorted(kf).index(s["id"])
    g["140:130"]["inputs"]["fps"] = FPS
    g["92"]["inputs"]["filename_prefix"] = f"gravitone/mc-h3-{s['id']}"
    return g


def render(s):
    start = upload(s["id"]); end = upload(s["end"]) if s.get("end") else None
    r = json.loads(req("/prompt", json.dumps({"prompt": graph(s, start, end), "client_id": "mc-h3-" + uuid.uuid4().hex}).encode(), {"content-type": "application/json"}))
    if "prompt_id" not in r:
        raise RuntimeError(f"refused: {json.dumps(r)[:800]}")
    pid = r["prompt_id"]
    while True:
        time.sleep(10)
        h = json.loads(req(f"/history/{pid}"))
        if pid not in h: continue
        st = h[pid].get("status", {})
        if st.get("status_str") == "error":
            raise RuntimeError(f"error: {json.dumps(st.get('messages'))[:800]}")
        for o in h[pid]["outputs"].values():
            for k in ("images", "videos", "gifs"):
                for v in o.get(k, []):
                    if v["filename"].endswith(".mp4"):
                        return req(f"/view?filename={v['filename']}&subfolder={v.get('subfolder', '')}&type={v.get('type', 'output')}"), pid
        raise RuntimeError("finished with no mp4")


ov_path = os.path.join(clip, "assembly.json")
made = failed = 0
for s in todo:
    while (n := queue_size()) != 0:
        print(f"{time.strftime('%H:%M:%S')} queue {'unreachable' if n < 0 else f'busy ({n})'}; waiting 60 s before {s['id']}", flush=True)
        time.sleep(60)
    t0 = time.time()
    try:
        data, pid = render(s)
        open(os.path.join(out_dir, s["id"] + ".mp4"), "wb").write(data)
        ov = json.load(open(ov_path, encoding="utf8")) if os.path.exists(ov_path) else {}
        ov[s["id"]] = {"in": 0, "out": round(FRAMES / FPS, 3)}
        json.dump(ov, open(ov_path, "w", encoding="utf8"), indent=2)
        line = {"id": s["id"], "engine": "minimax-h3-fl2v-turbo", "end": s.get("end"), "frames": FRAMES, "size": f"{W}x{H}",
                "wallS": round(time.time() - t0), "promptId": pid, "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        made += 1
    except Exception as e:
        line = {"id": s["id"], "engine": "minimax-h3-fl2v-turbo", "error": str(e)[:400], "wallS": round(time.time() - t0), "at": time.strftime("%Y-%m-%dT%H:%M:%S")}
        failed += 1
    open(os.path.join(out_dir, "ledger.jsonl"), "a", encoding="utf8").write(json.dumps(line) + "\n")
    print(json.dumps(line), flush=True)
print(f"made {made}, failed {failed}")
sys.exit(1 if failed else 0)
