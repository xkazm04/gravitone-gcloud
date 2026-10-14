import json, glob, os, sys, shutil
from collections import Counter
from PIL import Image

out = sys.argv[1]
man = []


def norm(p):
    return p.replace(os.sep, "/")


def put(src, name, meta, edge=960):
    dst = os.path.join(out, name)
    im = Image.open(src).convert("RGB")
    im.thumbnail((edge, edge))
    im.save(dst, "JPEG", quality=82)
    meta.update(file="media/" + name, w=im.width, h=im.height)
    man.append(meta)


# Forge sweep-01: per scene the source frame and up to 6 candidates with the human verdict.
run = "foundry-out/runs/2026-08-26-sweep-01"
V = json.load(open(f"{run}/verdicts.json", encoding="utf-8"))
for sc in sorted(glob.glob(f"{run}/scenes/*")):
    s = os.path.basename(sc)
    if os.path.exists(f"{sc}/source.jpg"):
        put(f"{sc}/source.jpg", f"forge-{s}-source.jpg", dict(kind="forge.source", run="2026-08-26-sweep-01", scene=s))
    cands = sorted(glob.glob(f"{sc}/candidates/*.png"))
    for c in cands[:: max(1, len(cands) // 6)][:6]:
        base = os.path.splitext(os.path.basename(c))[0]
        k = f"{s}/{base}"
        put(c, f"forge-{s}-{base}.jpg", dict(kind="forge.candidate", run="2026-08-26-sweep-01", scene=s, candidate=k, verdict=(V.get(k) or {}).get("verdict")))

# Extract: per run up to 5 styles, 2 images each, plus 3 sources.
for er in sorted(glob.glob("foundry-out/extract/*")):
    rid = os.path.basename(er)
    for st in sorted(glob.glob(f"{er}/styles/*"))[:5]:
        sname = os.path.basename(st)
        imgs = sorted(glob.glob(f"{st}/**/*.png", recursive=True) + glob.glob(f"{st}/**/*.jpg", recursive=True))
        for i in imgs[:2]:
            rel = norm(os.path.relpath(i, st))
            kind = "extract.transfer" if "transfer" in rel else "extract.replica"
            put(i, f"extract-{rid}-{sname}-{os.path.splitext(os.path.basename(i))[0]}.jpg", dict(kind=kind, run=rid, style=sname, path=rel))
    for s in sorted(glob.glob(f"{er}/sources/*"))[:3]:
        try:
            put(s, f"extract-{rid}-src-{os.path.splitext(os.path.basename(s))[0]}.jpg", dict(kind="extract.source", run=rid))
        except Exception as e:
            print("skip", s, e)

for t in sorted(glob.glob("pipeline/foundry/training/thumbs/*.png")):
    b = os.path.splitext(os.path.basename(t))[0]
    put(t, f"dojo-{b}.jpg", dict(kind="dojo.thumb", cycle=b))

n = 0
for d in sorted(glob.glob("foundry-out/strips/strips-r1/*")):
    j = glob.glob(f"{d}/*.jpg")
    if j and n < 12:
        put(j[0], f"strip-{os.path.basename(d)}.jpg", dict(kind="strip.poster", card=os.path.basename(d)))
        n += 1
for v in sorted(glob.glob("foundry-out/strips/strips-r1/*/strip.mp4"), key=os.path.getsize)[:3]:
    card = os.path.basename(os.path.dirname(v))
    name = f"strip-{card}.mp4"
    shutil.copy(v, os.path.join(out, name))
    man.append(dict(kind="strip.video", file="media/" + name, card=card))

json.dump(man, open(os.path.join(out, "MEDIA.json"), "w"), indent=1)
print(Counter(m["kind"] for m in man), len(man))
