"""The Python side of packages/kernel/spec/job.json: a line-protocol server the Vitest driver
(test/job.python.test.ts) sends each `"by": "py"` step to, in order, interleaved with the
Node steps it runs itself - one store file, two languages, one table.

    python job_spec.py <spec.json> <store.sqlite>     # stdin: one JSON op per line; stdout: one reply per line

Each op names its actor (`as`), the instant (`at`, the driver's clock) and the job; the
reply is {"got": <the outcome in the spec's words>} or {"error": "<unexpected>"}. Every
actor gets its own connection and its own JobRun per job, so a zombie is a real second
holder of the same rows, not a flag.
"""

import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from job import FenceConflict, Jobs, LaneHeld, LeaseLost, NotQueued, Refused, SlotsBusy, Stopped, connect  # noqa: E402
from verify_events import BASE_COLUMNS, OPTIONAL, verify  # noqa: E402


def main(argv):
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[4].strip(), file=sys.stderr)
        return 2
    with open(argv[1], encoding="utf-8") as f:
        spec = json.load(f)
    store = argv[2]
    now = [datetime.now(timezone.utc)]
    killed = set()
    alive = lambda pid: pid not in killed  # noqa: E731
    jobs = {}
    runs = {}
    # The settles a worker would pass (L41): `settles` records what it was told, `settle-raises` raises -
    # so the table can hold both the once-per-ending rule and Node's settle-failed record.
    told = []

    def tell(job, ending):
        told.append([job["id"], ending])

    def refuse(job, ending):
        raise RuntimeError("the cycle's files are not writable")

    def jobs_of(name):
        if name not in jobs:
            jobs[name] = Jobs(store, holder=spec["actors"][name], alive=alive, clock=lambda: now[0], settles={"settles": tell, "settle-raises": refuse})
        return jobs[name]

    def fenced(fn):
        try:
            fn()
            return "ok"
        except (FenceConflict, LeaseLost):
            return "conflict"
        except Stopped as e:
            return {"stopped": e.state}
        except Refused:
            return {"refused": True}

    for raw in sys.stdin:
        if not raw.strip():
            continue
        op = json.loads(raw)
        now[0] = datetime.strptime(op["at"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        kind = op["op"]
        key = (op.get("as"), op.get("job"))
        try:
            if kind == "claim":
                try:
                    runs[key] = jobs_of(op["as"]).claim(op["job"], ttl_s=spec["ttlS"], dry_only=op.get("dryOnly", False))
                    got = "granted"
                except NotQueued as e:
                    got = {"notQueued": e.state}
                except LaneHeld as e:
                    got = {"held": e.job_id}
                except SlotsBusy:
                    got = "busy"
                except Refused:
                    got = {"refused": True}
            elif kind == "start":
                got = fenced(lambda: runs[key].start(op["step"]))
            elif kind == "book":
                got = fenced(lambda: runs[key].book(op["step"], {"made": op["step"], "by": op["as"]}))
            elif kind == "failStep":
                got = fenced(lambda: runs[key].fail_step(op["step"], op["message"]))
            elif kind == "fail":
                got = fenced(lambda: runs[key].fail(op["code"], op["message"]))
            elif kind == "finish":
                got = fenced(lambda: runs[key].finish())
            elif kind == "park":
                got = fenced(lambda: runs[key].park())
            elif kind == "heartbeat":
                got = fenced(lambda: runs[key].heartbeat())
            elif kind == "recover":
                got = jobs_of(op["as"]).recover(op["producers"])
            elif kind == "settled":
                got = list(told)
            elif kind == "kill":
                killed.add(spec["actors"][op["as"]]["pid"])
                got = "ok"
            elif kind == "verify":
                conn = connect(store)
                try:
                    have = {r[1] for r in conn.execute("PRAGMA table_info(events)")}
                    extra = [(c, n) for c, n in OPTIONAL if c in have]
                    cols = BASE_COLUMNS + [c for c, _ in extra]
                    got = verify(conn.execute("SELECT %s FROM events ORDER BY seq" % ", ".join(cols)), None, extra)["state"]
                finally:
                    conn.close()
            else:
                got = None
                raise ValueError("unknown op %r" % kind)
            reply = {"got": got}
        except Exception as e:  # noqa: BLE001 - reported to the driver verbatim, which fails the step
            reply = {"error": "%s: %s" % (type(e).__name__, e)}
        sys.stdout.write(json.dumps(reply) + "\n")
        sys.stdout.flush()
    for j in jobs.values():
        j.close()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
