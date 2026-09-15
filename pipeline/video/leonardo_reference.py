"""Buy one reference clip from Leonardo, to see what a polished i2v pipeline does.

    python pipeline/video/leonardo_reference.py public/presets/blueprint.jpg
    python pipeline/video/leonardo_reference.py public/presets/blueprint.jpg \
        --prompt "..." --resolution RESOLUTION_720

WHY. The local stack produces two failures on flat vector art and no successes:
Wan 2.2 TI2V-5B either leaves the drawing alone and moves the camera, or moves an
element and destroys the drawing (pipeline/video/README.md carries the six
renders). What that does NOT establish is whether the ceiling is the CONTENT --
a video model cannot animate a technical drawing -- or OUR HANDLING of it.

This buys the control. Leonardo runs hosted video models behind a pipeline that
has been tuned by people whose job it is; feeding it the same swatch and the same
intent isolates the variable. If Leonardo's clip is good, the ceiling is ours and
the local graph is worth more work. If Leonardo's clip fails the same way, the
ceiling is the content, and the compositor in compose_clip.py is the answer
rather than a workaround.

COSTS REAL MONEY, one clip at a time, and never runs from a gate or a build.

The key is read from the personas checkout's .env (LEONARDO_API_KEY), which is
where this machine keeps it; override with the environment variable of the same
name. Output lands in pipeline/runs/preset-clips/, which is gitignored.
"""
import argparse
import json
import mimetypes
import os
import sys
import time
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent.parent
OUT = ROOT / "pipeline" / "runs" / "preset-clips"
BASE = "https://cloud.leonardo.ai/api/rest/v1"
BASE2 = "https://cloud.leonardo.ai/api/rest/v2"

# THE MODEL IS NAMED, ALWAYS. The first run of this file posted to v1
# /generations-image-to-video with no model field and took whatever the default
# was; the reply came back `motionModel: "WAN21"`, so the "hosted control" was
# the same model family as the local stack and proved less than it looked like.
# v2 takes an explicit id, and these are the ones worth asking for.
MODELS = {
    "hailuo-03": "MiniMax Hailuo 03 (H3) — the local stack's other engine, hosted",
    "veo-3": "Google Veo 3",
    "kling-2-5": "Kling 2.5 Turbo",
}
ENV_FILE = Path(r"C:\Users\kazda\kiro\personas\.env")

POLL_SECONDS = 10
MAX_POLLS = 90  # 15 minutes; a hosted video job is minutes, not seconds


def api_key():
    k = os.environ.get("LEONARDO_API_KEY")
    if k:
        return k
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8", errors="replace").splitlines():
            line = line.strip()
            if line.startswith("LEONARDO_API_KEY=") and "=" in line:
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no LEONARDO_API_KEY in the environment or the personas .env")


def req(method, url, key, body=None, timeout=120):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method, headers={
        "accept": "application/json",
        "authorization": f"Bearer {key}",
        **({"content-type": "application/json"} if data else {}),
    })
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def upload(image, key):
    """Leonardo's two-step upload: ask for a presigned slot, then POST the file.

    The id it returns is what `imageType: "UPLOADED"` refers to.
    """
    ext = image.suffix.lstrip(".").lower()
    slot = req("POST", f"{BASE}/init-image", key, {"extension": ext})["uploadInitImage"]
    fields = json.loads(slot["fields"]) if isinstance(slot["fields"], str) else slot["fields"]

    boundary = uuid.uuid4().hex
    payload = bytearray()
    for k, v in fields.items():
        payload += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n"
                    f"{v}\r\n").encode()
    mime = mimetypes.guess_type(image.name)[0] or "application/octet-stream"
    payload += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; "
                f"filename=\"{image.name}\"\r\nContent-Type: {mime}\r\n\r\n").encode()
    payload += image.read_bytes() + f"\r\n--{boundary}--\r\n".encode()

    up = urllib.request.Request(slot["url"], data=bytes(payload), method="POST",
                                headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(up, timeout=300) as r:
        if r.status not in (200, 201, 204):
            raise SystemExit(f"upload rejected: {r.status}")
    return slot["id"]


def find_video_url(obj):
    """The response shape is not documented; walk it for the first video URL.

    Written this way ON PURPOSE rather than guessing a path: a wrong guess here
    fails after the money is already spent.
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, str) and v.startswith("http") and (".mp4" in v or "video" in k.lower()):
                return v
            got = find_video_url(v)
            if got:
                return got
    elif isinstance(obj, list):
        for v in obj:
            got = find_video_url(v)
            if got:
                return got
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--prompt", default="Animate the image",
                    help="deliberately short by default; see the note in main()")
    ap.add_argument("--model", default="hailuo-03", help=" | ".join(f"{k}: {v}" for k, v in MODELS.items()))
    ap.add_argument("--width", type=int, default=856)
    ap.add_argument("--height", type=int, default=480)
    ap.add_argument("--duration", type=int, default=5)
    ap.add_argument("--seed", type=int, default=586956)
    ap.add_argument("--audio", action="store_true", help="H3 can score its own clip; off here")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    image = Path(a.image)
    key = api_key()
    OUT.mkdir(parents=True, exist_ok=True)
    dest = Path(a.out) if a.out else OUT / f"{image.stem}-{a.model}.mp4"

    # THE PROMPT IS SHORT ON PURPOSE, and that is a finding rather than a
    # shortcut. The first run sent the authored sentence -- "The circle with
    # arrow slides left across the top. Everything else in the drawing holds
    # perfectly still, and the camera does not move." -- and got a camera drift.
    # A bare "Animate the image" is reported to do better on the same hosted
    # stack. A long instruction is not a stronger instruction: most of that
    # sentence is a list of things NOT to do, and a model that cannot ground
    # "the circle with arrow" reads the rest as a description of stillness.
    prompt = a.prompt

    print(f"leonardo · {image.name} · {a.model} · {a.width}x{a.height} · {a.duration}s")
    print(f"  prompt: {prompt}")

    image_id = upload(image, key)
    print(f"  uploaded -> {image_id}")

    body = {
        "model": a.model,
        "public": False,
        "parameters": {
            "duration": a.duration,
            # OFF. The whole question is what the pipeline does with OUR intent;
            # letting the vendor rewrite the prompt answers a different one.
            "prompt_enhance": "OFF",
            "quantity": 1,
            "seed": a.seed,
            "prompt": prompt,
            "width": a.width,
            "height": a.height,
            "audio": bool(a.audio),
            "guidances": {
                "start_frame": [{"image": {"id": image_id, "type": "UPLOADED"}}],
            },
        },
    }

    t0 = time.time()
    start = req("POST", f"{BASE2}/generations", key, body)
    # v2 nests the job under `generate`, alongside what it just charged.
    gen = start.get("generate") or start
    gid = gen.get("generationId") or gen.get("id")
    cost = (gen.get("cost") or {}).get("amount") or gen.get("apiCreditCost")
    if cost:
        print(f"  cost -> {cost} credits")
    if not gid:
        raise SystemExit(f"no generation id in the reply: {json.dumps(start)[:500]}")
    print(f"  queued -> {gid}")

    url = None
    for i in range(MAX_POLLS):
        time.sleep(POLL_SECONDS)
        try:
            res = req("GET", f"{BASE2}/generations/{gid}", key)
        except Exception as e:  # noqa: BLE001
            print(f"    poll {i + 1} error: {str(e)[:80]}")
            continue
        pk = res.get("generation") or res.get("generations_by_pk") or res
        status = str(pk.get("status", "")).upper()
        if status == "FAILED":
            raise SystemExit(f"leonardo reported FAILED: {json.dumps(res)[:400]}")
        url = find_video_url(res)
        if url:
            break
        if i % 3 == 0:
            print(f"    {status or 'PENDING'} … {time.time() - t0:.0f}s")
    if not url:
        raise SystemExit(f"no video url after {MAX_POLLS * POLL_SECONDS}s")

    # A plain urlopen on the CDN answers 403; it wants a browser-ish agent.
    dl = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
    with urllib.request.urlopen(dl, timeout=600) as r:
        dest.write_bytes(r.read())
    print(f"  done in {time.time() - t0:.0f}s -> {dest} ({dest.stat().st_size / 1024:.0f}KB)")
    (dest.with_suffix(".json")).write_text(json.dumps(
        {"vendor": "leonardo", "model": a.model, "size": [a.width, a.height],
         "duration": a.duration, "seed": a.seed, "prompt": prompt,
         "generation_id": gid, "source": str(image), "url": url},
        indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
