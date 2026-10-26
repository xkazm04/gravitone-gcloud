import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { EventInput } from "@gt/domain/event";
import { append, chainHead, eventsMigrations, verify } from "../src/events.ts";
import { findPython, must, scratch, templateStores } from "./helpers.ts";

// Node writes, Python checks: the chain must verify in the second language with
// the standard library alone (packages/kernel/py/verify_events.py), byte for
// byte, including the numbers where the two languages' JSON printers disagree.

const here = path.dirname(fileURLToPath(import.meta.url));
const verifier = path.join(here, "..", "py", "verify_events.py");
const tpl = templateStores([eventsMigrations]);
afterAll(() => tpl.dispose());

const python = findPython();
if (python === undefined) console.warn("[events.python] SKIPPED: no Python 3 on PATH (tried python, python3, py); the cross-language check did not run");

function runVerifier(db: string, anchor?: string): { status: number | null; report: unknown } {
  const args = ["-I", verifier, db, ...(anchor === undefined ? [] : ["--anchor", anchor])];
  const r = spawnSync(python ?? "python", args, { encoding: "utf8" });
  const line = r.stdout.trim();
  return { status: r.status, report: line === "" ? r.stderr : must(parseJsonAt("verifier output", z.unknown(), line)) };
}

// Every number shape where Python's json and ECMAScript print differently.
const tricky: EventInput = {
  actor: { kind: "agent", id: "claude" },
  type: "judge.pick",
  subject: { kind: "packet", id: "pk-1" },
  lane: "seat.text",
  cost: { usd: 0.0123, src: "model" },
  data: {
    integral: 1.0,
    tiny: 1e-7,
    huge: 1e21,
    big: 1e20,
    neg0: -0,
    third: 333333333.3333333,
    denormal: 5e-324,
    max: 1.7976931348623157e308,
    nested: [0.1, 2.5, -3, { "\u{1f600}": "astral key", "～": "bmp key" }],
    text: "quote\" backslash\\ newline\n control\u0001 é 中",
  },
};

describe.skipIf(python === undefined)("events verified by Python", () => {
  it("re-derives every hash Node wrote, including non-integer and exponent numbers", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      append(t, tricky);
      append(t, { ...tricky, cost: { usd: 2, src: "real" }, data: { refund: -0.5 } });
      for (let i = 0; i < 20; i++) append(t, { actor: { kind: "machine", id: "box" }, type: "job.done", subject: { kind: "job", id: `j${i}` }, data: { i, ratio: i / 7 } });
    }));
    const head = must(chainHead(s));
    s.close();
    const out = runVerifier(s.location);
    expect(out.report).toEqual({ state: "intact", count: 22, head });
    expect(out.status).toBe(0);
  }, 30_000);

  it("re-derives the projection's fields (occurredAt, atSrc, key) and sees an edit to them", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      append(t, tricky);
      append(t, { ...tricky, occurredAt: "2026-08-26T12:00:00.000Z", atSrc: "recorded", key: "forge:2026-08-26-sweep-01:run.start" });
      append(t, { ...tricky, occurredAt: "2026-10-15T09:30:00.123Z", atSrc: "derived", key: "forge:2026-08-26-sweep-01:status.done" });
    }));
    const head = must(chainHead(s));
    expect(runVerifier(s.location).report).toEqual({ state: "intact", count: 3, head });
    must(s.tx((t) => t.exec("DROP TRIGGER events_no_update; UPDATE events SET at_src = 'recorded' WHERE seq = 3;")));
    const node = must(verify(s));
    s.close();
    const out = runVerifier(s.location);
    expect(node).toMatchObject({ state: "tampered", seq: 3 });
    expect(out.report).toEqual(node);
  }, 30_000);

  it("finds the same broken link Node finds", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      for (let i = 0; i < 4; i++) append(t, { ...tricky, data: { i, x: i + 0.25 } });
    }));
    must(s.tx((t) => t.exec(`DROP TRIGGER events_no_update; UPDATE events SET data = '{"i":2,"x":2.5}' WHERE seq = 3;`)));
    const node = must(verify(s));
    s.close();
    const out = runVerifier(s.location);
    expect(out.status).toBe(1);
    expect(out.report).toEqual(node);
    expect(node).toMatchObject({ state: "tampered", seq: 3 });
  }, 30_000);

  it("reports a cut tail against an anchor, as Node does", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      for (let i = 0; i < 3; i++) append(t, { ...tricky, data: { i } });
    }));
    const head = must(chainHead(s));
    if (head === null) throw new Error("expected a head");
    must(s.tx((t) => t.exec("DROP TRIGGER events_no_delete; DELETE FROM events WHERE seq = 3;")));
    const node = must(verify(s, head));
    s.close();
    const out = runVerifier(s.location, `${head.seq}:${head.hash}`);
    expect(out.report).toEqual(node);
  }, 30_000);

  it("reads a store whose path carries URI characters (# and %) read-only, and writes no file beside it", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      for (let i = 0; i < 3; i++) append(t, { ...tricky, data: { i } });
    }));
    const node = must(verify(s));
    s.close();
    const dir = scratch("events-uri");
    try {
      const odd = path.join(dir.dir, "a#b%41");
      mkdirSync(odd);
      const db = path.join(odd, "s.sqlite");
      copyFileSync(s.location, db);
      expect(runVerifier(db)).toEqual({ status: 0, report: node });
      // kernel_store.missing_tables (the job protocol's tables, and styles.py's) opens the same read-only URI form.
      const code = [
        "import json, sys",
        `sys.path.append(${JSON.stringify(path.join(here, "..", "py"))})`,
        "import kernel_store, styles",
        `print(json.dumps([kernel_store.missing_tables(${JSON.stringify(db)}), kernel_store.missing_tables(${JSON.stringify(s.location)}), kernel_store.missing_tables(${JSON.stringify(db)}, styles.STYLE_TABLES)]))`,
      ].join("\n");
      const r = spawnSync(python ?? "python", ["-I", "-c", code], { encoding: "utf8" });
      expect(r.stderr).toBe("");
      const [odd1, plain, stylesOdd] = must(parseJsonAt("missing_tables", z.tuple([z.array(z.string()), z.array(z.string()), z.array(z.string())]), r.stdout.trim()));
      expect(odd1).toEqual(plain);
      expect(odd1).not.toContain("events");
      expect(stylesOdd).toEqual(["styles", "style_ops"]);
      expect(readdirSync(dir.dir)).toEqual(["a#b%41"]);
    } finally {
      dir.dispose();
    }
  }, 30_000);

  it("answers an anchor that is not SEQ:HASH with 2 (could not run), never 1 (tampered)", () => {
    const s = tpl.fresh();
    must(s.tx((t) => {
      for (let i = 0; i < 3; i++) append(t, { ...tricky, data: { i } });
    }));
    const head = must(chainHead(s));
    if (head === null) throw new Error("expected a head");
    s.close();
    expect(runVerifier(s.location, `${head.seq}:${head.hash}`).status).toBe(0);
    // A typo in the anchor is the operator's, not the ledger's: the chain above is intact.
    for (const bad of ["abc", `${head.seq}`, `${head.seq}:`, `${head.seq}:${head.hash.slice(1)}`, `x:${head.hash}`, `0:${head.hash}`]) {
      const out = runVerifier(s.location, bad);
      expect({ anchor: bad, status: out.status, said: JSON.stringify(out.report).includes("tampered") }).toEqual({ anchor: bad, status: 2, said: false });
    }
  }, 30_000);
});
