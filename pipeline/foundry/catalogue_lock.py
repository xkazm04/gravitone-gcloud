"""The catalogue lock, Python side: the same fence lib/foundry/catalogue.ts takes.

    from catalogue_lock import catalogue_lock, journal_intent
    with catalogue_lock(STYLES.parent):
        cat = json.loads(STYLES.read_text(encoding="utf-8"))
        ...                                   # decide what to change
        rev = journal_intent(STYLES.parent, cat, "acquire", source, [style_id])
        cat["_rev"] = rev
        save(cat)

WHY. pipeline/foundry/styles.json and its two sibling ledgers have five
writers: the forge, extract and Dojo commits in the app, and acquire.py (which
`intake.py --acquire` shells out to) here. Each was a bare read-modify-write,
so two that overlapped lost one write without an error. The app now commits
inside `withCatalogue`, which holds an exclusive-create lock file; a Python
writer that does not take the same file walks straight through that fence.

THE PROTOCOL, byte for byte the one lib/diskTx.ts speaks:

- the lock is `<foundry dir>/.catalogue.lock`, created with O_CREAT|O_EXCL
  (Node's `open(..., "wx")`); its existence IS the lock;
- its body is `{"pid", "at", "by"}` JSON, for a human reading a stuck lock;
- a lock whose mtime is older than STALE_S belongs to a dead holder and is
  broken; a live one held past WAIT_S is an error that names the file;
- release is unlink.

The two numbers are DEFAULT_LOCK_TIMING in lib/diskTx.ts; selftest.py reads
them out of that file and fails if this module disagrees.

THE JOURNAL. `<foundry dir>/catalogue-journal.jsonl` gets one line per
transaction, `{rev, at, op, run, ids, by}`, appended BEFORE the catalogue is
written (write-ahead), and styles.json `_rev` is that rev. A revision is minted
as max(styles._rev, newest journal rev) + 1, the same rule the app uses, so the
two languages share one revision sequence.
"""

import contextlib
import json
import os
import random
import time
from datetime import datetime, timezone
from pathlib import Path

LOCK_NAME = ".catalogue.lock"
JOURNAL_NAME = "catalogue-journal.jsonl"
STALE_S = 30.0
WAIT_S = 10.0


class CatalogueLocked(RuntimeError):
    """A live holder kept the lock past the wait bound."""


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@contextlib.contextmanager
def catalogue_lock(root, by="python", wait_s=WAIT_S, stale_s=STALE_S):
    """Hold the catalogue lock for the body of the `with`."""
    lock = Path(root) / LOCK_NAME
    lock.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        except FileExistsError:
            try:
                age = time.time() - lock.stat().st_mtime
            except FileNotFoundError:
                continue  # released between our open and our stat: try again
            if age > stale_s:
                with contextlib.suppress(FileNotFoundError):
                    lock.unlink()
                continue
            if time.monotonic() - started > wait_s:
                raise CatalogueLocked(
                    f"the style catalogue is locked ({lock}) and the holder did not release it in "
                    f"{int(wait_s * 1000)} ms; another commit or acquire is writing it -- try again, "
                    f"and if nothing is running, delete the lock file")
            time.sleep(0.02 + random.random() * 0.03)
            continue
        try:
            os.write(fd, json.dumps({"pid": os.getpid(), "at": _now(), "by": by}).encode("utf-8"))
        finally:
            os.close(fd)
        break
    try:
        yield lock
    finally:
        with contextlib.suppress(FileNotFoundError):
            lock.unlink()


def holds_lock(root):
    """True when THIS process holds the catalogue lock under `root`."""
    try:
        return json.loads((Path(root) / LOCK_NAME).read_text(encoding="utf-8")).get("pid") == os.getpid()
    except (FileNotFoundError, ValueError, AttributeError):
        return False


def newest_journal_rev(root):
    """The newest well-formed journal line's rev; 0 when there is none. A torn
    tail (a writer killed mid-append) is skipped, never fatal."""
    path = Path(root) / JOURNAL_NAME
    if not path.exists():
        return 0
    for line in reversed(path.read_text(encoding="utf-8").splitlines()):
        if not line.strip():
            continue
        try:
            return int(json.loads(line).get("rev") or 0)
        except (ValueError, AttributeError):
            continue
    return 0


def journal_intent(root, cat, op, run, ids, by="python"):
    """Mint the next revision and append its journal line. Call with the lock
    held, after deciding and before writing; set cat["_rev"] to the result."""
    rev = max(int(cat.get("_rev") or 0), newest_journal_rev(root)) + 1
    line = {"rev": rev, "at": _now(), "op": op, "run": run, "ids": list(ids), "by": by}
    with (Path(root) / JOURNAL_NAME).open("a", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(line, ensure_ascii=False) + "\n")
    return rev
