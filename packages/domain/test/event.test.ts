import { describe, expect, it } from "vitest";
import { parseAt } from "../src/door.ts";
import { eventInputSchema, eventSchema } from "../src/event.ts";

const base = { actor: { kind: "agent", id: "claude" }, type: "job.lease", subject: { kind: "job", id: "j1" }, data: {} };

describe("event", () => {
  it("parses an act with absent lane and cost omitted", () => {
    const r = parseAt("event", eventInputSchema, { ...base, lane: undefined });
    expect(r.ok && r.value).toEqual(base);
    if (r.ok) expect("lane" in r.value).toBe(false);
  });

  it("a cost never travels without the word for where it came from", () => {
    expect(parseAt("event", eventInputSchema, { ...base, cost: { usd: 0.25 } }).ok).toBe(false);
    expect(parseAt("event", eventInputSchema, { ...base, cost: { usd: -0.25, src: "real" } }).ok).toBe(true);
    expect(parseAt("event", eventInputSchema, { ...base, cost: { usd: Number.NaN, src: "real" } }).ok).toBe(false);
  });

  it("closes the actor kinds and shapes the type", () => {
    expect(parseAt("event", eventInputSchema, { ...base, actor: { kind: "robot", id: "x" } }).ok).toBe(false);
    for (const t of ["commit", "job.fail", "publish.missed", "a-b.c-d"]) expect(parseAt("event", eventInputSchema, { ...base, type: t }).ok).toBe(true);
    for (const t of ["Job.fail", "job.", ".job", "job fail", "job.*"]) expect(parseAt("event", eventInputSchema, { ...base, type: t }).ok).toBe(false);
  });

  it("data is a JSON object: no bare scalar, no non-finite number, no class instance", () => {
    expect(parseAt("event", eventInputSchema, { ...base, data: { n: 1.5, deep: [{ ok: null }] } }).ok).toBe(true);
    for (const data of [7, "text", [1], { n: Number.POSITIVE_INFINITY }, { when: new Date(0) }, { deep: [Number.NaN] }]) {
      expect(parseAt("event", eventInputSchema, { ...base, data }).ok).toBe(false);
    }
  });

  it("drops an undefined key inside data, as the door does everywhere", () => {
    const r = parseAt("event", eventInputSchema, { ...base, data: { a: 1, b: undefined } });
    expect(r.ok && r.value.data).toEqual({ a: 1 });
  });

  it("a stored event carries seq, at and two 64-hex hashes", () => {
    const stored = { ...base, seq: 1, at: "2026-10-15T00:00:00.000Z", prevHash: "0".repeat(64), hash: "f".repeat(64) };
    expect(parseAt("event", eventSchema, stored).ok).toBe(true);
    expect(parseAt("event", eventSchema, { ...stored, hash: "F".repeat(64) }).ok).toBe(false);
    expect(parseAt("event", eventSchema, { ...stored, seq: 0 }).ok).toBe(false);
  });
});
