"""packages/kernel/spec/styles.json's Python half: one door call per invocation, as JSON.

    python -I styles_spec.py put <store> <entry-json> <force 0|1>
    python -I styles_spec.py export <store> <file>

Prints {"result": ...} or {"refused": ...}; the Node test (test/styles.python.test.ts) drives the
table and compares. Standard library only."""
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.append(_HERE)
from kernel_store import StoreError  # noqa: E402
from styles import StyleRefused, Styles  # noqa: E402
from verify_events import usage  # noqa: E402

ARGC = {"put": 5, "export": 4}


def main(argv):
    if len(argv) < 2 or ARGC.get(argv[1]) != len(argv):
        print(usage(__doc__), file=sys.stderr)
        return 2
    op, store = argv[1], argv[2]
    st = Styles(store, host="spec-host", pid=4242)
    try:
        if op == "put":
            out = {"result": st.put_readback(json.loads(argv[3]), force=argv[4] == "1", by="spec")}
        else:
            st.export(argv[3])
            out = {"result": "exported"}
    except (StyleRefused, StoreError) as e:
        out = {"refused": str(e)}
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
