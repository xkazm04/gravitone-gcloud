"""The Python side of packages/kernel/test/lease.mixed.test.ts (test/fixtures/lease-child.ts
is the Node side): take one lease N times; under each grant write `enter`, hold briefly,
write `exit` - both fenced - then release.

    python lease_contend.py <store.sqlite> <resource> <rounds> <name>

Not part of any worker; a fixture that proves Node and Python share one lease.
"""

import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lease import Leases, assert_fence  # noqa: E402


def main(argv):
    if len(argv) != 5:
        print(__doc__.strip().splitlines()[3].strip(), file=sys.stderr)
        return 2
    db, resource, rounds, name = argv[1], argv[2], int(argv[3]), argv[4]
    leases = Leases(db)
    try:
        for _ in range(rounds):
            lease = leases.acquire(resource, wait_s=60.0, ttl_s=30, poll_s=0.003)
            for phase in ("enter", "exit"):
                with leases.tx() as t:
                    assert_fence(t, resource, lease.fence)
                    t.run("INSERT INTO lease_probe (who, fence, phase) VALUES (?, ?, ?)", name, lease.fence, phase)
                if phase == "enter":
                    time.sleep(0.004)
            if not lease.release():
                print("%s release: not held" % name, file=sys.stderr)
                return 1
    finally:
        leases.close()
    print(json.dumps({"name": name, "rounds": rounds}))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
