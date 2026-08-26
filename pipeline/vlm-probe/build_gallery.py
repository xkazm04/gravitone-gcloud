"""Build a local side-by-side gallery: source frame vs its replica.

    python build_gallery.py --run arcane-prompt-channel
    start gallery/index.html

Two outputs, because two ways of looking are useful.

**A paired naming convention.** Every pair is copied into gallery/ as
`pair-NNN-a-source.<ext>` and `pair-NNN-b-replica.png`, so any file browser,
image viewer or slideshow sorts the two halves adjacent to each other. Arrow
key alone gets you source, replica, source, replica down the whole set.

**An HTML sheet** that puts the two images side by side with the craft fields
under them, colour-coded by whether the property survived the round trip.

Local file, never published: the source frames are third-party material held
for evaluation. gallery/ is gitignored along with frames/ and replicas/.
"""

import argparse
import json
import shutil
import sys
from html import escape
from pathlib import Path

HERE = Path(__file__).parent
FRAMES_DIR = HERE / "frames"
REPLICA_DIR = HERE / "replicas"
GALLERY = HERE / "gallery"
OUT_ROOT = HERE.parent.parent / "vlm-probe-out"

CSS = """
:root{--bg:#0e1013;--panel:#171a1f;--line:#272c34;--fg:#e6e8eb;--dim:#9099a6;
--ok:#3fb950;--near:#d29922;--miss:#f85149}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:14px/1.5 ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif}
header{padding:28px 32px 8px;border-bottom:1px solid var(--line)}
h1{margin:0 0 6px;font-size:20px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:13px;max-width:70ch}
.legend{display:flex;gap:16px;margin-top:14px;flex-wrap:wrap;font-size:12px}
.legend span{display:flex;align-items:center;gap:6px;color:var(--dim)}
.dot{width:9px;height:9px;border-radius:2px;display:inline-block}
main{padding:24px 32px 64px;display:flex;flex-direction:column;gap:28px}
.pair{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.phead{display:flex;justify-content:space-between;align-items:baseline;
gap:12px;padding:12px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.pid{font:600 13px ui-monospace,SFMono-Regular,Consolas,monospace}
.score{font:600 13px ui-monospace,monospace}
.imgs{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}
.cell{background:var(--panel);padding:0}
.cell figcaption{padding:8px 14px;color:var(--dim);
font:11px ui-monospace,monospace;letter-spacing:.03em;text-transform:uppercase}
.cell img{width:100%;height:auto;display:block}
.fields{display:flex;flex-wrap:wrap;gap:6px;padding:14px 16px;border-top:1px solid var(--line)}
.f{border:1px solid var(--line);border-radius:6px;padding:5px 9px;
font:12px ui-monospace,monospace;display:flex;gap:7px;align-items:center}
.f b{font-weight:500;color:var(--dim)}
.f .v{color:var(--fg)}
.f.ok{border-color:#1c3d24}.f.ok .v{color:var(--ok)}
.f.near{border-color:#453611}.f.near .v{color:var(--near)}
.f.miss{border-color:#4a1d1d}.f.miss .v{color:var(--miss)}
details{border-top:1px solid var(--line)}
summary{padding:10px 16px;cursor:pointer;color:var(--dim);font-size:12px}
pre{margin:0;padding:0 16px 16px;white-space:pre-wrap;color:var(--dim);
font:12px/1.6 ui-monospace,monospace}
@media(max-width:860px){.imgs{grid-template-columns:1fr}}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    args = ap.parse_args()

    src = OUT_ROOT / args.run / "replication.jsonl"
    if not src.exists():
        sys.exit(f"no replication results at {src} -- run replicate.py first")
    rows = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    # One entry per frame; a re-run appends, so the last write wins.
    rows = list({r["frame"]: r for r in rows}.values())

    manifest = {}
    for mf in FRAMES_DIR.glob("*-manifest.json"):
        for e in json.loads(mf.read_text(encoding="utf-8")):
            manifest[e["frame"]] = e

    if GALLERY.exists():
        shutil.rmtree(GALLERY)
    GALLERY.mkdir(parents=True)

    cards = []
    for i, r in enumerate(sorted(rows, key=lambda x: x["frame"]), 1):
        source = FRAMES_DIR / r["frame"]
        replica = REPLICA_DIR / r["replica"]
        if not (source.exists() and replica.exists()):
            print(f"  skip {r['frame']}: missing image")
            continue

        a = GALLERY / f"pair-{i:03d}-a-source{source.suffix}"
        b = GALLERY / f"pair-{i:03d}-b-replica{replica.suffix}"
        shutil.copy2(source, a)
        shutil.copy2(replica, b)

        per = r["per_field"]
        chips = []
        for f, v in per.items():
            cls = "ok" if v == 1 else ("near" if v == 0.5 else "miss")
            got = r["replica_annotation"].get(f)
            want = r["original"].get(f)
            shown = escape(str(want)) if v == 1 else f"{escape(str(want))} &rarr; {escape(str(got))}"
            chips.append(f'<span class="f {cls}"><b>{escape(f)}</b>'
                         f'<span class="v">{shown}</span></span>')

        ts = manifest.get(r["frame"], {}).get("t_seconds")
        at = f" &middot; source t={ts}s" if ts is not None else ""
        pct = round(100 * r["score"])
        colour = "var(--ok)" if pct >= 85 else ("var(--near)" if pct >= 70 else "var(--miss)")

        cards.append(f"""
<section class="pair">
  <div class="phead">
    <span class="pid">pair-{i:03d}{at}</span>
    <span class="score" style="color:{colour}">craft fidelity {pct}%</span>
  </div>
  <div class="imgs">
    <figure class="cell"><img src="{a.name}" alt="source frame {i}" loading="lazy">
      <figcaption>A &middot; source &middot; {escape(r['frame'])}</figcaption></figure>
    <figure class="cell"><img src="{b.name}" alt="replica {i}" loading="lazy">
      <figcaption>B &middot; replica &middot; {escape(r['replica'])}</figcaption></figure>
  </div>
  <div class="fields">{''.join(chips)}</div>
  <details><summary>generation prompt (built from the source annotation)</summary>
    <pre>{escape(r['prompt'])}</pre></details>
</section>""")

    n = len(cards)
    mean = round(100 * sum(r["score"] for r in rows) / len(rows)) if rows else 0
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Replication gallery</title><style>{CSS}</style></head><body>
<header>
  <h1>Source vs replica &mdash; {n} pairs</h1>
  <p class="sub">Left is the frame we annotated. Right was generated from that
  annotation alone, with no access to the image. Content is expected to differ
  &mdash; only the craft properties were carried across, so different people in
  the same light is a pass. Mean craft fidelity {mean}%.</p>
  <div class="legend">
    <span><i class="dot" style="background:var(--ok)"></i>property survived</span>
    <span><i class="dot" style="background:var(--near)"></i>one step off</span>
    <span><i class="dot" style="background:var(--miss)"></i>lost</span>
  </div>
</header>
<main>{''.join(cards)}</main></body></html>"""

    (GALLERY / "index.html").write_text(html, encoding="utf-8")
    print(f"{n} pairs -> {GALLERY}")
    print(f"  naming: pair-NNN-a-source.*  /  pair-NNN-b-replica.png  (sort adjacent)")
    print(f"  open:   {GALLERY / 'index.html'}")


if __name__ == "__main__":
    main()
