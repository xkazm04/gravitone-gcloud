"""Build data/gravitone.js + .json for round 2: styles, article topics, media, projects catalogue."""
import json, os, sys, glob, re

repo, reg, out = sys.argv[1], sys.argv[2], sys.argv[3]

styles = json.load(open(os.path.join(repo, "pipeline/foundry/styles.json"), encoding="utf-8"))
media = json.load(open(os.path.join(out, "media/MEDIA.json"), encoding="utf-8"))

topics = []
for idx in sorted(glob.glob(os.path.join(reg, "knowledge/*/index.json"))):
    bundle = os.path.basename(os.path.dirname(idx))
    d = json.load(open(idx, encoding="utf-8"))
    for slug, s in list(d.get("subjects", {}).items()):
        topics.append({
            "bundle": bundle, "slug": slug,
            "title": s.get("title") or slug.replace("-", " "),
            "summary": (s.get("summary") or s.get("description") or "")[:240],
            "techniques": len(s.get("techniques") or []),
        })
# Keep it a plausible "proposed" column: up to 12 per bundle.
by = {}
for t in topics:
    by.setdefault(t["bundle"], []).append(t)
topics = [t for b in sorted(by) for t in by[b][:12]]

# The project catalogue, read off lib/projects.ts text (disciplines + templates).
src = open(os.path.join(repo, "lib/projects.ts"), encoding="utf-8").read()
templates = sorted(set(re.findall(r'"((?:short-form-clip|short-educational-video|mid-educational-video|teaser|trailer|cinematic|free-form|music-video|ad-social-15|ad-spot-30))"', src)))

data = {
    "_about": "Real data read off the Gravitone repository on 2026-10-14. See SCHEMA.md.",
    "styles": styles,
    "topics": topics,
    "media": media,
    "projects": {
        "disciplines": ["educational", "trailer", "free", "music-video", "ads"],
        "templates": templates,
        "steps": ["research", "script", "frames", "motion", "score", "cut"],
    },
}
json.dump(data, open(os.path.join(out, "gravitone.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
with open(os.path.join(out, "gravitone.js"), "w", encoding="utf-8") as f:
    f.write("window.GRAVITONE = ")
    json.dump(data, f, ensure_ascii=False)
    f.write(";\n")
print("styles", len(styles.get("styles", styles)) if isinstance(styles, dict) else len(styles),
      "topics", len(topics), "bundles", len(by), "media", len(media), "templates", templates)
