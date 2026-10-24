import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { EventInput } from "@gt/domain/event";
import { append, chainHead, eventsMigrations, verify } from "../src/events.ts";
import { findPython, must, templateStores } from "./helpers.ts";

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
  });

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
  });

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
  });

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
  });
});
