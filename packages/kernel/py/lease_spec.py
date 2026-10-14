"""Run packages/kernel/spec/lease.json against lease.py, the Python implementation of kernel/lease.

    python lease_spec.py <spec.json> <template.sqlite>    # exit 0 green, 1 red, 2 could not run

<template.sqlite> is a store Node migrated (events + lease); each scenario runs on its own copy,
so both languages are held to one table over one schema (test/lease.spec.test.ts spawns this).
"""

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lease import (FenceConflict, LeaseError, LeaseLost, Tx, assert_fence, claim_in, connect,  # noqa: E402
                   heartbeat_in, holder_data, leave_in, release_in, status_in)


def run_scenario(spec, sc, template, workdir, index):
    db = os.path.join(workdir, "spec-%d.sqlite" % index)
    shutil.copyfile(template, db)
    base = datetime.strptime(spec["base"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
    now = [base]
    killed = set()
    actors = spec["actors"]
    name_of = lambda h: next((k for k, a in actors.items() if a == holder_data(h)), "?") if h else None  # noqa: E731
    alive = lambda pid: pid not in killed  # noqa: E731
    conn = connect(db)
    resource = sc["resource"]
    ttl = spec["ttlS"]
    try:
        for i, st in enumerate(sc["steps"]):
            now[0] = base + timedelta(seconds=st["t"])
            op = st["op"]
            with Tx(conn, lambda: now[0]) as t:
                if op == "claim":
                    o = claim_in(t, resource, actors[st["as"]], st["ticket"], ttl, st["wait"], alive)
                    got = ({"granted": o["lease"]["fence"]} if o["kind"] == "granted"
                           else {"queued": o["position"]} if o["kind"] == "queued"
                           else {"busy": name_of(o["holder"]), "ahead": o["ahead"]})
                elif op == "heartbeat":
                    try:
                        heartbeat_in(t, resource, st["fence"])
                        got = "ok"
                    except LeaseLost as e:
                        got = {"lost": str(e)}
                elif op == "release":
                    got = "released" if release_in(t, resource, st["fence"]) else "not-held"
                elif op == "leave":
                    got = "left" if leave_in(t, resource, st["ticket"]) else "absent"
                elif op == "fence":
                    try:
                        assert_fence(t, resource, st["fence"])
                        got = "ok"
                    except FenceConflict:
                        got = "conflict"
                elif op == "status":
                    s = status_in(t, resource, actors[st["as"]], alive)
                    got = {"holder": name_of(s["holder"]["holder"]) if s["holder"] else None, "fence": s["fence"],
                           "queue": [name_of(w["holder"]) for w in s["queue"]], "reclaims": s["reclaims"], "stale": s["stale"]}
                elif op == "events":
                    got = [typ + ("@" + lane if lane else "") for typ, lane in
                           t.conn.execute("SELECT type, lane FROM events ORDER BY seq").fetchall()]
                elif op == "kill":
                    killed.add(actors[st["as"]]["pid"])
                    continue
                else:
                    raise LeaseError("unknown op %r" % op)
            if got != st["expect"]:
                return "step %d (%s at t=%s): got %s, want %s" % (i, op, st["t"], json.dumps(got), json.dumps(st["expect"]))
        return None
    finally:
        conn.close()


def run_spec(spec_path, template):
    with open(spec_path, encoding="utf-8") as f:
        spec = json.load(f)
    workdir = tempfile.mkdtemp(prefix="gt-lease-spec-")
    try:
        failures = []
        for i, sc in enumerate(spec["scenarios"]):
            why = run_scenario(spec, sc, template, workdir, i)
            if why is not None:
                failures.append({"scenario": sc["name"], "reason": why})
        print(json.dumps({"scenarios": len(spec["scenarios"]), "failures": failures}))
        return 1 if failures else 0
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        sys.exit(2)
    sys.exit(run_spec(sys.argv[1], sys.argv[2]))
