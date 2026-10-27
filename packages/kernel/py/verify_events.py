"""Verify the ledger's hash chain from Python, with the standard library only.

    python packages/kernel/py/verify_events.py <store.sqlite> [--anchor SEQ:HASH]

Prints one JSON line and exits 0 (intact), 1 (tampered) or 2 (could not run):
    {"state": "intact", "count": N, "head": {"seq": N, "hash": "..."} | null}
    {"state": "tampered", "seq": S, "reason": "..."}

This is the second implementation of packages/kernel/src/canonical.ts and
events.ts `verifyRows`, kept deliberately independent of the first: the forge
and Dojo workers open the same store with Python's sqlite3, and a ledger whose
integrity only Node can check is a ledger Python must take on trust. The Vitest
suite (packages/kernel/test/events.python.test.ts) writes events from Node and
runs this file over them, so the two cannot drift apart unnoticed.

Canonical JSON is RFC 8785. The two places Python's json module differs from
it are handled here: numbers (Python writes 1.0, 1e-07, -0.0; ECMAScript writes
1, 1e-7, 0) and key order (Python sorts by code point; RFC 8785 by UTF-16 code
unit, which sorting on the UTF-16-BE bytes reproduces).

Events v3 (Phase 2, the v1 projection) added three optional covered fields -
occurredAt, atSrc, key - each omitted from the hash input when NULL, exactly as
lane and cost are. A store migrated before v3 has no such columns; the verifier
reads the columns the file actually has, so it checks old and new stores alike.
"""

import hashlib
import json
import re
import sqlite3
import sys
import urllib.parse

GENESIS = "0" * 64
BASE_COLUMNS = ["seq", "at", "actor_kind", "actor_id", "type", "subject_kind", "subject_id", "lane", "cost_usd", "cost_src", "data", "prev_hash", "hash"]
# Optional covered fields: column -> the key it carries in the hash input.
OPTIONAL = [("occurred_at", "occurredAt"), ("at_src", "atSrc"), ("key", "key")]
_REPR = re.compile(r"^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$")
# An anchor is a row: a seq from 1 and its 64-hex hash. Anything else is a typo, and a typo read
# as an anchor would answer 1 (tampered) about an intact ledger, or, at seq 0, check nothing.
_ANCHOR = re.compile(r"^([1-9]\d*):([0-9a-f]{64})$")


def ro_uri(path):
    """A read-only SQLite URI for a file path. The path is percent-encoded: a raw `#`, `?` or `%`
    in it would end or reshape the URI, and SQLite would open (and create) a DIFFERENT file
    read-write - a truncated name beside the store - and report the store empty."""
    return "file:%s?mode=ro" % urllib.parse.quote(path.replace("\\", "/"), safe="/:")


def usage(doc):
    """The usage line(s) of a script's docstring: every line that starts `python `. Searched, not
    indexed - a docstring that gains a line above its usage would print a blank one instead."""
    return "\n".join(line.strip() for line in doc.splitlines() if line.strip().startswith("python "))


def es_number(x):
    """ECMAScript Number::toString for a finite float or an int."""
    if isinstance(x, bool):
        raise ValueError("a boolean is not a number")
    if isinstance(x, int):
        return str(x)
    if x != x or x in (float("inf"), float("-inf")):
        raise ValueError("not a finite number")
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    m = _REPR.match(repr(abs(x)))  # repr is the shortest round-trip digit string, as in ECMAScript
    if m is None:
        raise ValueError("unexpected float repr: " + repr(x))
    whole, frac, exp = m.group(1), m.group(2) or "", int(m.group(3) or 0)
    digits = whole + frac
    lead = len(digits) - len(digits.lstrip("0"))
    s = digits.strip("0")
    k = len(s)
    n = len(whole) + exp - lead  # value = 0.s * 10^n
    if k <= n <= 21:
        out = s + "0" * (n - k)
    elif 0 < n <= 21:
        out = s[:n] + "." + s[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * (-n) + s
    else:
        e = n - 1
        mant = s if k == 1 else s[0] + "." + s[1:]
        out = mant + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + out


def canonical(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return es_number(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ",".join(canonical(x) for x in v) + "]"
    if isinstance(v, dict):
        keys = sorted(v.keys(), key=lambda k: k.encode("utf-16-be"))
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonical(v[k]) for k in keys) + "}"
    raise ValueError("not JSON data: " + type(v).__name__)


def chain_hash(prev_hash, body):
    return hashlib.sha256((prev_hash + canonical(body)).encode("utf-8")).hexdigest()


def body_of(row, extra=OPTIONAL):
    seq, at, actor_kind, actor_id, typ, subject_kind, subject_id, lane, cost_usd, cost_src, data, prev_hash, _ = row[:13]
    body = {
        "seq": seq,
        "at": at,
        "actor": {"kind": actor_kind, "id": actor_id},
        "type": typ,
        "subject": {"kind": subject_kind, "id": subject_id},
        "data": json.loads(data),
        "prevHash": prev_hash,
    }
    if lane is not None:
        body["lane"] = lane
    if cost_usd is not None:
        body["cost"] = {"usd": cost_usd, "src": cost_src}
    for (_, name), value in zip(extra, row[13:]):
        if value is not None:
            body[name] = value
    return body


def verify(rows, anchor=None, extra=OPTIONAL):
    prev_seq, prev_hash = 0, GENESIS
    for row in rows:
        seq, stored_prev, stored_hash = row[0], row[11], row[12]
        if seq != prev_seq + 1:
            return {"state": "tampered", "seq": prev_seq + 1, "reason": "missing: the next row is seq %s" % seq}
        if stored_prev != prev_hash:
            return {"state": "tampered", "seq": seq, "reason": "prevHash does not match the hash of seq %d" % prev_seq}
        try:
            expect = chain_hash(stored_prev, body_of(row, extra))
        except (ValueError, TypeError) as e:
            return {"state": "tampered", "seq": seq, "reason": "unreadable: %s" % e}
        if expect != stored_hash:
            return {"state": "tampered", "seq": seq, "reason": "hash mismatch: the row's content changed after it was written"}
        if anchor is not None and seq == anchor[0] and stored_hash != anchor[1]:
            return {"state": "tampered", "seq": seq, "reason": "the row at the anchor's seq is not the anchored row"}
        prev_seq, prev_hash = seq, stored_hash
    if anchor is not None and prev_seq < anchor[0]:
        return {"state": "tampered", "seq": prev_seq + 1, "reason": "truncated: the ledger ends at seq %d, the anchor is at %d" % (prev_seq, anchor[0])}
    head = None if prev_seq == 0 else {"seq": prev_seq, "hash": prev_hash}
    return {"state": "intact", "count": prev_seq, "head": head}


def main(argv):
    if len(argv) not in (2, 4) or (len(argv) == 4 and argv[2] != "--anchor"):
        print(usage(__doc__), file=sys.stderr)
        return 2
    anchor = None
    if len(argv) == 4:
        m = _ANCHOR.match(argv[3])
        if m is None:
            print("%s\n--anchor %r is not SEQ:HASH (a seq from 1, a 64-hex hash)" % (usage(__doc__), argv[3]), file=sys.stderr)
            return 2
        anchor = (int(m.group(1)), m.group(2))
    try:
        # Read-only, through the URI form, so a verifier can never write the store it checks.
        db = sqlite3.connect(ro_uri(argv[1]), uri=True)
        try:
            have = {r[1] for r in db.execute("PRAGMA table_info(events)")}
            extra = [(c, n) for c, n in OPTIONAL if c in have]
            columns = BASE_COLUMNS + [c for c, _ in extra]
            report = verify(db.execute("SELECT %s FROM events ORDER BY seq" % ", ".join(columns)), anchor, extra)
        finally:
            db.close()
    except sqlite3.Error as e:
        print(json.dumps({"error": "cannot read %s: %s" % (argv[1], e)}))
        return 2
    print(json.dumps(report))
    return 0 if report["state"] == "intact" else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
