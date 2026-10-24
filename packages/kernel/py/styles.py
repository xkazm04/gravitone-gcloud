"""The style store's door for a Python WRITER (Phase 5 decision 3) - packages/kernel/src/styles
for acquire.py and `intake --acquire`, over the same tables in the same SQLite store, with the
standard library only.

    from styles import Styles, StyleRefused
    st = Styles(ensure_styles(store_location()))
    st.put_readback(entry, force=False, by="acquire.py")   # one transaction: row + op + event
    st.export(STYLES)                                       # re-export styles.json (one implementation: Node's)

WHY A DOOR AND NOT THE FILE. acquire.py used to read-modify-write pipeline/foundry/styles.json
under catalogue_lock.py and journal the intent first; the file is now an EXPORT of the store, and
a Python writer that edited it would be overwritten by the next export (or, worse, be the file an
export refuses to replace). So the write goes where Node's go: the `styles` row, its
`style_ops` log row and its ledger event, in one BEGIN IMMEDIATE transaction (kernel_ledger.py
says why the event belongs in it). The other indices catalogue_lock.py guards keep their lock.

THE RULES ARE NODE'S (packages/kernel/src/styles/writers.ts `createStyleIn`), held to it by
packages/kernel/spec/styles.json, which both languages run (test/styles.python.test.ts):
  - a style with evidence, proofs or a lock is never overwritten (acquire.py's own rule, and the
    ratchet's: overwriting it would demote it);
  - an unjudged one only with force;
  - the record must pass Node's door (@gt/domain/style): a non-empty name, family and recipe,
    observables keyed [a-z][a-z0-9_]* with non-empty values. Refused HERE, before the write - a
    row Node's door refuses would take the whole catalogue read down with it.
The status of a readback is `candidate`: it has no evidence, and status is derived.

THE EXPORT IS NOT RE-IMPLEMENTED. Writing styles.json byte-for-byte as Node does would be a second
copy of the format to drift; the door spawns `node pipeline/import/styles.mts --export-to <file>`
instead (an explicit argv, never a shell - kernel_store.py's rule for the migrator).
"""

import json
import os
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.append(_HERE)  # behind the caller's entries: kernel_ledger.py says why
from kernel_ledger import append  # noqa: E402
from kernel_store import REPO, RUNNER, STORE_PATH_VAR, StoreError, ensure_store  # noqa: E402
from verify_events import canonical, ro_uri  # noqa: E402

STYLE_TABLES = ("styles", "style_ops")
EXPORT_CLI = os.path.join(str(REPO), "pipeline", "import", "styles.mts")
KEY_RE = re.compile(r"^[a-z][a-z0-9_]*$")
BUSY_TIMEOUT_S = 10.0


class StyleRefused(RuntimeError):
    """The door or the ratchet said no; nothing was written. The message is the operator's."""


def _iso(dt=None):
    dt = dt or datetime.now(timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (dt.microsecond // 1000)


def _missing(path):
    db = sqlite3.connect(ro_uri(path), uri=True)
    try:
        have = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    finally:
        db.close()
    return [t for t in STYLE_TABLES if t not in have]


def ensure_styles(path, node=None, timeout_s=120):
    """kernel_store.ensure_store, plus the style tables: a store migrated before Phase 5 has
    every table the job protocol needs and none of these, so it is migrated once more by the
    same Node `--migrate` (Python never migrates - kernel_store.py says why)."""
    ensure_store(path, node=node, timeout_s=timeout_s)
    if not _missing(path):
        return path
    node = node or shutil.which("node")
    if node is None:
        raise StoreError("store %s has no style tables and node is not on PATH to migrate it" % path)
    env = dict(os.environ, **{STORE_PATH_VAR: path})
    r = subprocess.run([node, str(RUNNER), "--migrate", "--json"], cwd=str(REPO), env=env,
                       capture_output=True, text=True, timeout=timeout_s)
    if r.returncode != 0 or _missing(path):
        raise StoreError("migrating %s for the style tables failed (exit %s): %s" % (
            path, r.returncode, (r.stderr or r.stdout).strip()[-400:]))
    return path


def _check(record):
    """Node's door, for the fields a readback writes. Returns the refusal sentence or None."""
    for f in ("id", "name", "family", "recipe"):
        if not isinstance(record.get(f), str) or not record[f].strip():
            return "a style needs a non-empty %s" % f
    if not isinstance(record.get("negative"), str):
        return "a style's negative is a string"
    obs = record.get("observables")
    if not isinstance(obs, dict):
        return "observables are an object"
    for k, v in obs.items():
        if not KEY_RE.match(k):
            return "observable %r is not a [a-z][a-z0-9_]* key" % k
        if not isinstance(v, str) or not v:
            return "observable %s has no value" % k
    return None


class Styles:
    def __init__(self, path, clock=None, host=None, pid=None):
        if path == ":memory:":
            raise StoreError("a Python process cannot share an in-memory store with Node; name a file")
        self.path = path
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.actor_host = host or socket.gethostname()
        self.actor_pid = pid or os.getpid()

    def _connect(self):
        conn = sqlite3.connect(self.path, timeout=BUSY_TIMEOUT_S, isolation_level=None)
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA synchronous = FULL")
        return conn

    def get(self, style_id):
        """The stored record (a dict) and its rev, or None."""
        conn = self._connect()
        try:
            row = conn.execute("SELECT record, rev FROM styles WHERE id = ?", (style_id,)).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        return {"record": json.loads(row[0]), "rev": row[1]}

    def put_readback(self, entry, force=False, by="acquire.py"):
        """Land a readback as a CANDIDATE. `entry` is the v1 shape acquire.py builds (id, name,
        family, origin{kind:readback, source, models, signature}, observables, recipe, negative).
        Returns "created" or "replaced"; raises StyleRefused with the operator's sentence."""
        origin = {k: v for k, v in (entry.get("origin") or {}).items() if v is not None}
        origin["kind"] = "readback"
        record = {"id": entry["id"], "name": entry["name"].strip(), "family": entry["family"].strip(),
                  "status": "candidate", "origin": origin, "observables": dict(entry.get("observables") or {}),
                  "recipe": entry["recipe"].strip(), "negative": entry.get("negative", ""),
                  "elements": [], "evidence": [], "exemplars": [], "proofs": []}
        refusal = _check(record)
        if refusal:
            raise StyleRefused("%s: %s" % (entry.get("id"), refusal))
        actor = {"kind": "machine", "id": "%s/%s" % (self.actor_host, self.actor_pid)}
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            try:
                outcome = self._put_in(conn, record, force, by, actor)
                conn.execute("COMMIT")
                return outcome
            except BaseException:
                conn.execute("ROLLBACK")
                raise
        finally:
            conn.close()

    def _put_in(self, conn, record, force, by, actor):
        # kernel_ledger.append takes lease.py's Tx shape (get, run, at); this is that shape over
        # the transaction put_readback opened, so the event commits with the row.
        class T:
            at = _iso(self.clock())

            @staticmethod
            def get(sql, *params):
                return conn.execute(sql, params).fetchone()

            @staticmethod
            def run(sql, *params):
                return conn.execute(sql, params)

        sid = record["id"]
        row = T.get("SELECT record, rev, ord FROM styles WHERE id = ?", sid)
        if row is not None:
            old = json.loads(row[0])
            if old.get("evidence") or old.get("proofs") or old.get("lock"):
                raise StyleRefused("%s already has %d evidence row(s); refusing to overwrite a judged style"
                                   % (sid, len(old.get("evidence") or [])))
            if not force:
                raise StyleRefused("%s exists (no evidence yet); pass --force to replace it" % sid)
        rev = 1 if row is None else row[1] + 1
        text = canonical(record)
        if row is None:
            ord_ = T.get("SELECT coalesce(max(ord), 0) + 1 FROM styles")[0]
            T.run("INSERT INTO styles (id, rev, status, ord, record, updated_at) VALUES (?, 1, 'candidate', ?, ?, ?)",
                  sid, ord_, text, T.at)
        else:
            T.run("UPDATE styles SET rev = ?, status = 'candidate', record = ?, updated_at = ? WHERE id = ? AND rev = ?",
                  rev, text, T.at, sid, row[1])
        T.run("INSERT INTO style_ops (style_id, rev, kind, op, by, at) VALUES (?, ?, 'acquire', ?, ?, ?)",
              sid, rev, canonical({"id": sid}), by, T.at)
        typ = "style.created" if row is None else "style.replaced"
        append(T, actor, typ, {"kind": "style", "id": sid},
               data={"origin": "readback", "rev": rev, "status": "candidate"})
        return "created" if row is None else "replaced"

    def export(self, styles_file, node=None, timeout_s=120):
        """Re-export styles.json from the store through Node's one exporter. Returns its report
        line; raises StoreError when the export is refused or fails (the store still holds the write)."""
        node = node or shutil.which("node")
        if node is None:
            raise StoreError("the store holds the change, but node is not on PATH to re-export %s" % styles_file)
        env = dict(os.environ, **{STORE_PATH_VAR: self.path})
        r = subprocess.run([node, EXPORT_CLI, "--export-to", str(styles_file), "--json"], cwd=str(REPO), env=env,
                           capture_output=True, text=True, timeout=timeout_s)
        if r.returncode != 0:
            raise StoreError("the store holds the change, but re-exporting %s failed (exit %s): %s" % (
                styles_file, r.returncode, (r.stderr or r.stdout).strip()[-400:]))
        return r.stdout.strip()
