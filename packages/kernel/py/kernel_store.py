"""Where the kernel's store lives, and making sure it is there - packages/kernel/src/process.ts
for a Python process. Standard library only.

    from kernel_store import store_location, ensure_store, kernel_lease
    path = ensure_store(store_location())   # GRAVITONE_STORE_PATH, else <repo>/foundry-out/gravitone.sqlite

THE SAME RULE AS NODE'S, NOT A SECOND ONE (process.ts `storeLocation`, bound to v1's
universe by lib/fixtures/mode.ts): GRAVITONE_STORE_PATH overrides everything, a relative
value resolves against the working directory, ":memory:" is honoured; otherwise the file
is gravitone.sqlite under the universe's directory - `fixtures-out` when
NEXT_PUBLIC_GRAVITONE_DATA=fixtures, `foundry-out` else. One deviation, stated: Node's
default hangs off process.cwd(), because every Node process here is started from the
checkout; a Python script is started from anywhere (`python pipeline/foundry/dojo_run.py`
from the repo, `python dojo_video.py` from its own folder), so its default hangs off the
checkout root this file sits in - which is where v1's pipeline/gpu/lease.py put
foundry-out/gpu too. A GPU tenant and the Node worker therefore meet in one file.

PYTHON NEVER MIGRATES (plan §3.1: one schema, owned by the kernel's TypeScript modules).
A second copy of the DDL would be a second schema to drift. A store that is missing, or
that predates a table the Python protocol writes, is brought up to date by the Node
worker's `--migrate` - the same openKernel every Node process runs - spawned here with an
explicit argv and the store named in its environment, never through a shell
(subprocess-lifecycle: spawn-contract). Where Node is absent the caller gets StoreError
saying so, not a "no such table" from the middle of a claim.
"""

import importlib.util
import os
import shutil
import sys
import sqlite3
import subprocess
from pathlib import Path

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.append(_HERE)  # behind the caller's entries: kernel_ledger.py says why
from verify_events import ro_uri  # noqa: E402

STORE_FILE = "gravitone.sqlite"
STORE_PATH_VAR = "GRAVITONE_STORE_PATH"
REPO = Path(__file__).resolve().parents[3]
RUNNER = REPO / "workers" / "runner.mts"

# Every table the Python protocol (lease.py, job.py) reads or writes. `lane_holds` is the
# newest (jobs v2), so a store that has it has the queue columns too.
REQUIRED = ("events", "leases", "lease_waiters", "jobs", "job_outputs", "lane_holds", "spend_rows", "spend_unpriced")


def kernel_lease():
    """packages/kernel/py/lease.py, loaded under a name no other module here can take.

    `lease` is not a safe module name in this checkout: pipeline/gpu/lease.py is v1's GPU
    broker, imported as `lease` by every GPU tenant (guard, comfy, consistency, Dojo), and a
    process that holds a kernel job AND the card's broker would otherwise get whichever of
    the two Python found first - and a claim_in that is not there. The kernel's protocol
    modules (job.py, the GPU shim) therefore load the kernel lease by path, once per process,
    as `gt_kernel_lease`; its exception classes are that module's, re-exported by job.py."""
    mod = sys.modules.get("gt_kernel_lease")
    if mod is None:
        spec = importlib.util.spec_from_file_location("gt_kernel_lease", Path(__file__).resolve().parent / "lease.py")
        mod = importlib.util.module_from_spec(spec)
        sys.modules["gt_kernel_lease"] = mod
        spec.loader.exec_module(mod)
    return mod


class StoreError(RuntimeError):
    """The store cannot be located or brought up to date."""


def out_dirname(env=None):
    """lib/fixtures/mode.ts `OUT_DIRNAME`: the universe's directory."""
    env = os.environ if env is None else env
    return "fixtures-out" if env.get("NEXT_PUBLIC_GRAVITONE_DATA") == "fixtures" else "foundry-out"


def store_location(out_dir=None, override=None, cwd=None):
    """The store: `override` (default GRAVITONE_STORE_PATH), else <repo>/<universe>/gravitone.sqlite."""
    v = (os.environ.get(STORE_PATH_VAR, "") if override is None else override).strip()
    if v == "":
        return str(Path(cwd or REPO) / (out_dir or out_dirname()) / STORE_FILE)
    return v if v == ":memory:" else os.path.abspath(os.path.join(cwd or os.getcwd(), v))


def missing_tables(path):
    """The REQUIRED tables `path` lacks (all of them when the file does not exist)."""
    if not os.path.exists(path):
        return list(REQUIRED)
    db = sqlite3.connect(ro_uri(path), uri=True)
    try:
        have = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    finally:
        db.close()
    return [t for t in REQUIRED if t not in have]


def ensure_store(path, node=None, timeout_s=120):
    """Return `path` once it holds every table the Python protocol needs, running the Node
    worker's `--migrate` against it first when it does not."""
    if path == ":memory:":
        raise StoreError("a Python process cannot share an in-memory store with Node; name a file")
    if not missing_tables(path):
        return path
    node = node or shutil.which("node")
    if node is None:
        raise StoreError("store %s is not migrated (missing %s) and node is not on PATH to migrate it; "
                         "start the app or `npm run worker -- --migrate` once" % (path, ", ".join(missing_tables(path))))
    env = dict(os.environ, **{STORE_PATH_VAR: path})
    r = subprocess.run([node, str(RUNNER), "--migrate", "--json"], cwd=str(REPO), env=env,
                       capture_output=True, text=True, timeout=timeout_s)
    left = missing_tables(path)
    if r.returncode != 0 or left:
        raise StoreError("migrating %s through %s failed (exit %s): %s" % (
            path, RUNNER.name, r.returncode, (r.stderr or r.stdout).strip()[-400:] or "missing " + ", ".join(left)))
    return path
