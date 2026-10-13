"""The foundry selftest cases that need Pillow and numpy.

    python selftest_pillow.py        (needs: pip install pillow numpy)

selftest.py is stdlib-only by construction, because the `python` job in
.github/workflows/gates.yml runs it with no pip step and can therefore block. These cases
build real JPEGs and hash them, so they cannot live there (selftest.py's docstring says
so). They run in their own, advisory step of the same job, after installing Pillow and
numpy; run them by hand after touching vlm-probe/materialize.py, frame_manifest.py or
forge.stage_annotate.
"""

import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

from selftest import FAILURES, check, load, load_vlm


def test_materialize_dry_lists_missing_and_flags_a_corrupt_frame():
    from PIL import Image
    fm, mat = load_vlm("frame_manifest"), load_vlm("materialize")
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        Image.effect_noise((64, 64), 60).convert("RGB").save(d / "a-001.jpg", quality=90)
        Image.linear_gradient("L").convert("RGB").save(d / "a-002.jpg", quality=90)
        rows = [{"frame": "a-001.jpg", "source": "a.mp4", "t_seconds": 1.0},
                {"frame": "a-002.jpg", "source": "a.mp4", "t_seconds": 2.0},
                {"frame": "a-003.jpg", "source": "a.mp4", "t_seconds": 3.0}]
        fm.stamp_frames(rows, d, source_id="vid")
        check("stamp adds sha256, phash, source_id", [k in rows[0] for k in ("sha256", "phash", "source_id")], [True] * 3)
        rows[2].update(sha256="0" * 64, phash="0" * 16)  # a frame this clone does not have
        fm.write(d / "a-manifest.json", "a", 10, "scene", 0.3, [], rows)
        lock = fm.build_lock(d)
        check("lock covers every stamped frame", sorted(lock["frames"]), ["a-001.jpg", "a-002.jpg", "a-003.jpg"])
        check("lock entry fields", sorted(lock["frames"]["a-001.jpg"]),
              ["extractor", "phash", "sha256", "slug", "source_id", "t_seconds"])
        check("lock holds no pixels", max(len(json.dumps(v)) for v in lock["frames"].values()) < 400, True)
        lp = d / "corpus.lock.json"
        lp.write_text(json.dumps(lock), encoding="utf-8")
        (d / "a-001.jpg").unlink()
        (d / "a-002.jpg").unlink()
        (d / "a-manifest.json").unlink()
        with contextlib.redirect_stdout(io.StringIO()) as out:
            rc = mat.main(["--dry", "--lock", str(lp), "--frames", str(d)])
        check("--dry on an empty clone: 3 missing, exit 0", (rc, "missing 3" in out.getvalue()), (0, True))
        Image.linear_gradient("L").convert("RGB").save(d / "a-001.jpg", quality=90)  # wrong pixels under a-001's name
        with contextlib.redirect_stdout(io.StringIO()) as out:
            rc = mat.main(["--dry", "--lock", str(lp), "--frames", str(d)])
        check("wrong picture: mismatch row, exit 1", (rc, "mismatch a-001.jpg" in out.getvalue()), (1, True))
        (d / "a-001.jpg").write_bytes(b"not a jpg")
        with contextlib.redirect_stdout(io.StringIO()):
            rc = mat.main(["--dry", "--lock", str(lp), "--frames", str(d)])
        check("corrupt jpg: exit 1", rc, 1)


def test_fetch_missing_keeps_exact_and_discards_a_foreign_extraction():
    from PIL import Image
    fm, mat = load_vlm("frame_manifest"), load_vlm("materialize")
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        good = d / "src.jpg"
        Image.effect_noise((64, 64), 60).convert("RGB").save(good, quality=90)
        row = [{"frame": "s-001.jpg", "source": "s.mp4", "t_seconds": 1.0}]
        fm.stamp_frames(row, d)
        row[0]["sha256"] = fm.sha256_file(good)
        row[0]["phash"] = fm.phash_file(good)
        entry = {"slug": "s", "t_seconds": 1.0, "sha256": row[0]["sha256"], "phash": row[0]["phash"]}
        corpus = d / "corpus.json"
        corpus.write_text(json.dumps({"sources": [{"slug": "s", "url": "u"}]}), encoding="utf-8")
        out_dir = d / "frames"

        def extract_good(video, t, dest):
            Path(dest).write_bytes(good.read_bytes())
            return True

        def extract_foreign(video, t, dest):
            Image.linear_gradient("L").convert("RGB").save(dest, quality=90)
            return True

        r = mat.fetch_missing([("s-001.jpg", entry, "missing")], out_dir, corpus, lambda u: "v.mp4", extract_good)
        check("re-extracted identical bytes -> exact", r[0][2], "exact")
        (out_dir / "s-001.jpg").unlink()
        r = mat.fetch_missing([("s-001.jpg", entry, "missing")], out_dir, corpus, lambda u: "v.mp4", extract_foreign)
        check("a different picture -> mismatch and not kept", (r[0][2], (out_dir / "s-001.jpg").exists()),
              ("mismatch", False))


def test_forge_stamps_the_hash_of_the_frame_it_read():
    from PIL import Image
    F = load("forge")
    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        src = d / "f.jpg"
        Image.effect_noise((64, 64), 60).convert("RGB").save(src, quality=90)
        m = {"scenes": [{"id": "s", "frame": "f.jpg", "annotation": {"x": 1}}], "progress": {}, "log": []}
        saved = (F.resolve_source, F.set_stage, F.save)
        F.resolve_source = lambda spec: src
        F.set_stage = lambda *a, **k: None
        F.save = lambda *a, **k: None
        try:
            (d / "scenes" / "s").mkdir(parents=True)
            F.stage_annotate(m, d, "model")
        finally:
            F.resolve_source, F.set_stage, F.save = saved
        check("run.json scene carries source_sha256",
              m["scenes"][0].get("source_sha256"), load_vlm("frame_manifest").sha256_file(src))


TESTS = [
    test_materialize_dry_lists_missing_and_flags_a_corrupt_frame,
    test_fetch_missing_keeps_exact_and_discards_a_foreign_extraction,
    test_forge_stamps_the_hash_of_the_frame_it_read,
]


def main():
    for t in TESTS:
        print(f"{t.__name__}")
        t()
    print()
    if FAILURES:
        sys.exit(f"selftest_pillow: {len(FAILURES)} failing check(s): {', '.join(FAILURES)}")
    print(f"selftest_pillow: {len(TESTS)} cases green")


if __name__ == "__main__":
    main()
