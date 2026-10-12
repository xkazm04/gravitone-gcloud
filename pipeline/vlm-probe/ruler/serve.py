"""Resident ruler worker: JSONL on stdin, JSONL on stdout, models load once.

    {"id": 1, "paths": ["a.png", "b.png", "c.png"]}
 -> {"id": 1, "verdicts": [...], "worst": {...}|null}
A bad request yields {"id": ..., "error": "..."} and the worker keeps serving.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from ruler import api  # noqa: E402


def serve(stdin, stdout, scale=None, backend=None):
    backend = backend or api.default_backend()
    scale = scale or api.load_scale(backend=backend)
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        rid = None
        try:
            req = json.loads(line)
            rid = req.get("id")
            vs = api.score_pairs(req["paths"], scale=scale, backend=backend)
            w = api.worst_pair(vs)
            resp = {"id": rid, "verdicts": [v.to_dict() for v in vs],
                    "worst": w.to_dict() if w else None}
        except Exception as e:  # one bad request must not kill the resident process
            resp = {"id": rid, "error": f"{type(e).__name__}: {e}"}
        stdout.write(json.dumps(resp) + "\n")
        stdout.flush()


if __name__ == "__main__":
    serve(sys.stdin, sys.stdout)
