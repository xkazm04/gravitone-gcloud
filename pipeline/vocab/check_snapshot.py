"""Snapshot gate: schema.py / style.py must emit exactly what the snapshot recorded.

    python pipeline/vocab/check_snapshot.py          # compare (exit 1 on any difference)
    python pipeline/vocab/check_snapshot.py --write  # re-record after a deliberate vocab change

The first snapshot was taken BEFORE schema.py and style.py were migrated onto
cinematography.json, so it proves the migration changed no field, enum, order
or description. After that it does a second job: changing an enum without
bumping `version` in the vocab file is a red gate, because the snapshot is only
compared at the version it was recorded for.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "vlm-probe"))
import schema  # noqa: E402
import style  # noqa: E402
import vocab  # noqa: E402

SNAP = HERE / "snapshots" / "pre-migration.json"


def current():
    return {
        "vocabVersion": vocab.version(),
        "craft_json_schema": schema.json_schema(),
        "craft_gemini_schema": schema.gemini_schema(),
        "craft_ordinal": schema.ORDINAL,
        "craft_prompt": schema.PROMPT,
        "style_json_schema": style.json_schema(),
        "style_gemini_schema": style.gemini_schema(),
    }


def main():
    now = current()
    if "--write" in sys.argv:
        SNAP.write_text(json.dumps(now, indent=1, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n")
        print(f"snapshot re-recorded at vocab version {now['vocabVersion']}")
        return 0
    snap = json.loads(SNAP.read_text(encoding="utf-8"))
    if snap.get("vocabVersion") != now["vocabVersion"]:
        print(f"check-vocab: snapshot is for vocab v{snap.get('vocabVersion')}, file is v{now['vocabVersion']}; "
              "review the diff and re-record with --write")
        return 1
    bad = [k for k in now if json.dumps(now[k], sort_keys=False) != json.dumps(snap.get(k), sort_keys=False)]
    if bad:
        print("check-vocab: schema output changed without a version bump: " + ", ".join(bad))
        return 1
    print(f"snapshot ok (vocab v{now['vocabVersion']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
