"""The ruler: two shots, two questions, and a scale built from real film.

    python identity.py                       # calibrate and print the scale
    python identity.py --set shots/baseline  # score a lane against it
    python identity.py --set shots/baseline --contact out/baseline.jpg

Consistency is the easiest thing in this project to fool yourself about. The eye
forgives a lot in motion and nothing in a still; a vision model asked "is this
the same character?" while shown both images and the answer you want will agree
with you (+11 points of suppressed disagreement, measured here already); and a
cosine distance printed on its own is a number with no units.

So nothing here reports a distance without the scale it sits on, and the scale
comes from real film -- the Duel of the Fates, where the same characters recur
across real cuts and two of them wear the same robes in the same corridor under
the same light.

TWO AXES, because "the same scene" is two claims and they fail separately.

  IDENTITY (FaceNet/VGGFace2 on an MTCNN face crop) -- is it the same person?
      floor       the same actor across a real cut, through a framing change
                  and a lighting change. The number to reach.
      hard ceil   two different actors in the same robes, same corridor, same
                  light. The failure that actually happens. The number to beat.

  LOOK (DINOv2 on a DETR person box) -- is it the same world, costume, grade?
      floor only. This axis is confounded by framing on purpose: its anchor is
      a wide-to-close pair of one character in real film, so "no worse than the
      floor" means "our framing change costs no more than a real film's does".
      It has no usable ceiling -- see THE INVERTED RULER below.

THE INVERTED RULER, measured here on 2026-08-26 and the reason this file exists
in this shape. Run on person-box crops, DINOv2 put two *different* actors in the
same robes at 0.28 and the *same* actor across a cut at 0.50-0.59. Inverted:
generic image embeddings read costume, palette and framing loudly and identity
quietly. Anyone who had skipped the anchors and scored generated shots with
DINOv2 would have published numbers that mean the opposite of what they claim.
The anchors paid for themselves before a single frame was generated.

WHERE THE RULER GOES BLIND, also measured, also worth knowing:
  - No face, no identity score. Maul's prosthetics and a back-to-camera Obi-Wan
    both return zero detections. A shot that cannot be scored is reported as
    unscored, never quietly dropped.
  - Helmets, crowds and motion blur degrade it badly. On Pelennor Fields the
    same character across two shots reached 0.70 -- worse than the Duel set's
    *different-character* ceiling. The scale below holds for clean frames with
    one clear face, which is what the generated shots are, and not beyond.
"""

import argparse
import itertools
import logging
import warnings
from pathlib import Path

# Loading a checkpoint into a meta-device module and MTCNN's own chatter both
# emit hundreds of lines per run and none of them are about the measurement.
warnings.filterwarnings("ignore")
logging.getLogger("transformers").setLevel(logging.ERROR)

import torch
from PIL import Image, ImageDraw

HERE = Path(__file__).parent
FRAMES = HERE / "frames"

DETECTOR = "facebook/detr-resnet-50"
LOOK_MODEL = "facebook/dinov2-base"

# Chosen before a single frame was generated. One sequence, one grade, one
# location, each frame holding exactly one unambiguous face.
ANCHORS = {
    "qui-gon@005": "sw-duel-of-fates-005.jpg",   # medium-close, warm key, facing left
    "qui-gon@023": "sw-duel-of-fates-023.jpg",   # medium, red corridor, hands folded
    "qui-gon@024": "sw-duel-of-fates-024.jpg",   # close-up, red key, eyes down
    "obi-wan@028": "sw-duel-of-fates-028.jpg",   # medium, red corridor -- same robes
}

ANCHOR_PAIRS = [
    ("floor", "qui-gon@005", "qui-gon@024", "same actor, medium-close -> close-up, warm -> red"),
    ("floor", "qui-gon@005", "qui-gon@023", "same actor, medium-close -> medium"),
    ("floor", "qui-gon@023", "qui-gon@024", "same actor, medium -> close-up"),
    ("hard-ceil", "qui-gon@023", "obi-wan@028", "different actor, same robes, same corridor, same light"),
    ("hard-ceil", "qui-gon@024", "obi-wan@028", "different actor, same robes, different framing"),
]

_m = {}


def _load(kind):
    if kind in _m:
        return _m[kind]
    if kind == "detr":
        from transformers import AutoImageProcessor, AutoModelForObjectDetection
        _m[kind] = (AutoImageProcessor.from_pretrained(DETECTOR),
                    AutoModelForObjectDetection.from_pretrained(DETECTOR).eval())
    elif kind == "dino":
        from transformers import AutoImageProcessor, AutoModel
        _m[kind] = (AutoImageProcessor.from_pretrained(LOOK_MODEL),
                    AutoModel.from_pretrained(LOOK_MODEL).eval())
    else:
        from facenet_pytorch import MTCNN, InceptionResnetV1
        _m[kind] = (MTCNN(image_size=160, margin=20, keep_all=True, select_largest=True),
                    InceptionResnetV1(pretrained="vggface2").eval())
    return _m[kind]


def person_box(path, threshold=0.5):
    """The most confident person in the frame, as (l, t, r, b), plus its score.

    Most confident rather than largest: on a wide shot the largest box is often
    a foreground extra clipped by the frame edge, while the character the shot
    is about is the one the detector is sure of.
    """
    p, m = _load("detr")
    im = Image.open(path).convert("RGB")
    with torch.no_grad():
        out = m(**p(images=im, return_tensors="pt"))
    r = p.post_process_object_detection(
        out, target_sizes=torch.tensor([im.size[::-1]]), threshold=threshold)[0]
    best, score = None, 0.0
    for s, l, b in zip(r["scores"], r["labels"], r["boxes"]):
        if m.config.id2label[l.item()] == "person" and s.item() > score:
            score, best = s.item(), b.tolist()
    if best is None:
        return None, 0.0
    w, h = im.size
    l, t, rr, bb = (max(0, round(x)) for x in best)
    return (min(l, w - 1), min(t, h - 1), min(rr, w), min(bb, h)), round(score, 3)


def look_vec(path):
    """DINOv2 over the person box -- costume, palette, silhouette, and framing."""
    p, m = _load("dino")
    im = Image.open(path).convert("RGB")
    box, _ = person_box(path)
    if box:
        im = im.crop(box)
    with torch.no_grad():
        out = m(**p(images=im, return_tensors="pt"))
    return torch.nn.functional.normalize(out.last_hidden_state[0, 0], dim=0)


def face_vec(path):
    """(embedding, detector confidence) for the largest face, or (None, 0.0).

    None is a result, not an error: it means this shot cannot be scored for
    identity, and the caller must say so rather than skip the row.
    """
    mt, net = _load("face")
    im = Image.open(path).convert("RGB")
    boxes, probs = mt.detect(im)
    if boxes is None or len(boxes) == 0:
        return None, 0.0
    faces = mt(im)
    if faces is None:
        return None, 0.0
    if faces.ndim == 3:
        faces = faces.unsqueeze(0)
    with torch.no_grad():
        e = net(faces[:1])
    conf = round(float(probs[0]), 3) if probs is not None and probs[0] is not None else 0.0
    return torch.nn.functional.normalize(e[0], dim=0), conf


def cos(a, b):
    return round((1 - torch.dot(a, b)).item(), 4)


def vecs_for(paths):
    """name -> {'look': vec, 'face': vec|None, 'face_conf': float, 'path': str}."""
    out = {}
    for n, p in paths.items():
        f, c = face_vec(p)
        out[n] = {"path": p, "look": look_vec(p), "face": f, "face_conf": c}
    return out


def pair_rows(pairs, V):
    rows = []
    for kind, a, b, note in pairs:
        if a not in V or b not in V:
            continue
        fa, fb = V[a]["face"], V[b]["face"]
        rows.append((kind, a, b,
                     cos(fa, fb) if fa is not None and fb is not None else None,
                     cos(V[a]["look"], V[b]["look"]), note))
    return rows


def show(rows, title):
    print(f"\n{title}")
    print("-" * len(title))
    print(f"  {'identity':>9}  {'look':>6}  {'kind':10} pair")
    for kind, a, b, idn, lk, note in rows:
        i = f"{idn:9.4f}" if idn is not None else "   no face"
        print(f"  {i}  {lk:6.4f}  {kind:10} {a} / {b}" + (f"   {note}" if note else ""))
    return rows


def scale_from(rows):
    def agg(kind, key, fn):
        v = [r[key] for r in rows if r[0] == kind and r[key] is not None]
        return fn(v) if v else None
    return {
        "id_floor": agg("floor", 3, max),
        "id_ceil": agg("hard-ceil", 3, min),
        "look_floor": agg("floor", 4, max),
    }


def verdict(idn, look, s):
    if idn is None:
        return "unscored (no face detected)"
    if s["id_ceil"] is not None and idn >= s["id_ceil"]:
        v = "READS AS A DIFFERENT PERSON"
    elif s["id_floor"] is not None and idn <= s["id_floor"]:
        v = "same person, as tight as real film"
    else:
        v = "same person, looser than real film"
    if s["look_floor"] is not None:
        v += "; world " + ("holds" if look <= s["look_floor"] else "drifts")
    return v


def contact_sheet(items, path, size=256):
    """Crops as the machine saw them. The naive human check happens here."""
    sheet = Image.new("RGB", (size * max(1, len(items)), size + 18), (15, 15, 15))
    dr = ImageDraw.Draw(sheet)
    for i, (n, p) in enumerate(items):
        box, _ = person_box(p)
        im = Image.open(p).convert("RGB")
        sheet.paste((im.crop(box) if box else im).resize((size, size)), (i * size, 18))
        dr.text((i * size + 4, 4), n[:34], fill=(255, 220, 80))
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, quality=92)
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--set", help="directory of shots to score, every pair against every other")
    ap.add_argument("--contact", help="write a contact sheet of the crops here")
    args = ap.parse_args()

    A = vecs_for({k: str(FRAMES / v) for k, v in ANCHORS.items()})
    for n, d in A.items():
        print(f"  {n:16} face conf {d['face_conf'] or 'NONE'}")
    rows = show(pair_rows(ANCHOR_PAIRS, A), "ANCHORS -- the scale, from real film")
    s = scale_from(rows)
    print(f"\n  identity floor (same actor, real cut)      {s['id_floor']}")
    print(f"  identity ceiling (same robes, diff actor)  {s['id_ceil']}")
    gap = (s["id_ceil"] or 0) - (s["id_floor"] or 0)
    print(f"  separation                                 {gap:+.4f}"
          + ("   RULER IS BLIND -- do not read distances from it" if gap <= 0 else ""))
    print(f"  look floor (same scene across a real cut)  {s['look_floor']}")

    if not args.set:
        return
    d = Path(args.set)
    shots = {f.stem: str(f) for f in sorted(d.glob("*.png")) + sorted(d.glob("*.jpg"))}
    if not shots:
        print(f"\nno shots in {d}")
        return
    S = vecs_for(shots)
    print()
    for n, v in S.items():
        print(f"  {n:24} face conf {v['face_conf'] or 'NONE'}")
    names = list(S)
    trows = show(pair_rows([("test", a, b, "") for a, b in itertools.combinations(names, 2)], S),
                 f"LANE -- {d.name}")
    print()
    for _, a, b, idn, lk, _ in trows:
        print(f"  {a} / {b}: {verdict(idn, lk, s)}")
    scored = [r[3] for r in trows if r[3] is not None]
    if scored:
        print(f"\n  worst identity pair {max(scored):.4f}"
              f"   -> {verdict(max(scored), max(r[4] for r in trows), s)}")
    if len(scored) < len(trows):
        print(f"  {len(trows) - len(scored)} of {len(trows)} pairs unscored -- no face detected")

    if args.contact:
        print(f"\n  contact sheet -> "
              f"{contact_sheet([(n, v['path']) for n, v in list(A.items()) + list(S.items())], args.contact)}")


if __name__ == "__main__":
    main()
