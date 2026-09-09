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
    ap.add_argument("--prompt", default=None)
    ap.add_argument("--resolution", default="RESOLUTION_720")
    ap.add_argument("--model", default=None, help="e.g. VEO3, VEO3_1, Kling2_5; omit for the default")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    image = Path(a.image)
    key = api_key()
    OUT.mkdir(parents=True, exist_ok=True)
    dest = Path(a.out) if a.out else OUT / f"{image.stem}-leonardo.mp4"

    prompt = a.prompt
    if prompt is None:
        # The same intent the local stack was given, so the comparison is about
        # the pipeline and not about two different asks.
        rec = OUT / f"{image.stem}-compose" / "author.json"
        if rec.exists():
            k = json.loads(rec.read_text(encoding="utf-8"))["keyframe"]
            prompt = (f"The {k['moving']} {k['path']}. Everything else in the drawing "
                      f"holds perfectly still, and the camera does not move.")
        else:
            raise SystemExit("no --prompt and no cached author.json to take the intent from")

    print(f"leonardo · {image.name} · {a.resolution}{' · ' + a.model if a.model else ''}")
    print(f"  prompt: {prompt}")

    image_id = upload(image, key)
    print(f"  uploaded -> {image_id}")

    body = {
        "imageType": "UPLOADED",
        "imageId": image_id,
        "prompt": prompt,
        "resolution": a.resolution,
        "frameInterpolation": True,
        # OFF on purpose. The whole question is what the pipeline does with OUR
        # intent; letting the vendor rewrite the prompt would answer a different
        # one, and quietly.
        "promptEnhance": False,
        "isPublic": False,
    }
    if a.model:
        body["model"] = a.model

    t0 = time.time()
    start = req("POST", f"{BASE}/generations-image-to-video", key, body)
    job = start.get("motionVideoGenerationJob") or start.get("sdGenerationJob") or start
    gid = job.get("generationId") or job.get("id")
    if not gid:
        raise SystemExit(f"no generation id in the reply: {json.dumps(start)[:400]}")
    print(f"  queued -> {gid}")

    url = None
    for i in range(MAX_POLLS):
        time.sleep(POLL_SECONDS)
        try:
            res = req("GET", f"{BASE}/generations/{gid}", key)
        except Exception as e:  # noqa: BLE001
            print(f"    poll {i + 1} error: {str(e)[:80]}")
            continue
        pk = res.get("generations_by_pk") or {}
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

    with urllib.request.urlopen(url, timeout=600) as r:
        dest.write_bytes(r.read())
    print(f"  done in {time.time() - t0:.0f}s -> {dest} ({dest.stat().st_size / 1024:.0f}KB)")
    (dest.with_suffix(".json")).write_text(json.dumps(
        {"vendor": "leonardo", "model": a.model, "resolution": a.resolution,
         "prompt": prompt, "generation_id": gid, "source": str(image), "url": url},
        indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
