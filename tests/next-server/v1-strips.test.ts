import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { projectStrips, readStrips, type StripsSnapshot } from "../../lib/ledger/v1/sources/strips.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The strips adapter over literal run.json records in pipeline/strips/run.mts's
// shape, and its reader over a temp root - the reason it takes one at all
// (lib/foundry/strips/store.ts hard-codes foundry-out/strips).

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
type Run = StripsSnapshot["runs"][number]["run"];
type Card = Run["cards"][number];
const card = (id: string, status: Card["status"]): Card => ({ id, lane: "edu", case: "edu-aqueduct", approach: "E11", status, costUsd: 1.5 });
const run = (over: Partial<Run> = {}): Run => ({
  id: "strips-r1",
  at: "2026-10-06T18:08:24.612Z",
  status: "awaiting-triage",
  cards: [card("edu-aqueduct--ctrl", "rendered"), card("edu-aqueduct--E11", "rendered"), card("edu-aqueduct--E12", "lint-failed")],
  ...over,
});
const snap = (runs: StripsSnapshot["runs"]): StripsSnapshot => ({ runs, skipped: [] });
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("strips projection", () => {
  it("counts the facts it projects, and every key is distinct", () => {
    const p = projectStrips(
      snap([
        { run: run(), verdicts: [{ key: "edu-aqueduct--ctrl", verdict: "keep", at: "2026-10-07T09:00:00.000Z", chips: ["concept"] }] },
        { run: run({ id: "strips-pilot", status: "committed" }), verdicts: [] },
        { run: run({ id: "strips-r2", status: "running" }), verdicts: [] },
      ]),
      ctx(),
    );
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "run.start": 3, "card.status": 9, "run.status": 2, commit: 1, "verdict.keep": 1 });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
  });

  it("a card's status is observed by value: pending then rendered is two facts, the first kept", () => {
    const before = projectStrips(snap([{ run: run({ cards: [card("c1", "pending")] }), verdicts: [] }]), ctx()).events.filter((e) => e.type === "card.status");
    const after = projectStrips(snap([{ run: run({ cards: [card("c1", "rendered")] }), verdicts: [] }]), ctx("2026-10-15T13:00:00.000Z")).events.filter((e) => e.type === "card.status");
    expect(before.map((e) => e.key)).toEqual(["strips:strips-r1:card.c1.pending"]);
    expect(after.map((e) => [e.key, e.atSrc, e.occurredAt])).toEqual([["strips:strips-r1:card.c1.rendered", "derived", "2026-10-15T13:00:00.000Z"]]);
  });

  it("the commit is observed, never back-dated: v1 writes its instant only into findings.md prose", () => {
    const [commit] = projectStrips(snap([{ run: run({ status: "committed" }), verdicts: [] }]), ctx()).events.filter((e) => e.type === "commit");
    expect(commit).toMatchObject({ atSrc: "derived", occurredAt: "2026-10-15T12:00:00.000Z", actor: { kind: "operator" } });
  });

  it("running is live on the text seat with its reason; awaiting-triage is a cull pile over the rendered cards", () => {
    const p = projectStrips(
      snap([
        { run: run({ id: "live", status: "running", cards: [card("a", "rendered"), card("b", "pending")] }), verdicts: [] },
        { run: run(), verdicts: [{ key: "edu-aqueduct--E11", verdict: "reject", at: "2026-10-07T09:00:00.000Z" }] },
      ]),
      ctx(),
    );
    expect(p.live).toEqual([
      expect.objectContaining({ id: "live", state: "running", lane: "seat.text", laneFrom: expect.stringContaining("authoring"), progress: { done: 1, total: 2 }, startedAt: "2026-10-06T18:08:24.612Z" }),
    ]);
    expect(p.weir).toEqual([expect.objectContaining({ id: "strips-r1", kind: "cull", decided: 1, pending: 1 })]);
  });
});

describe("strips reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-strips-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const put = (id: string, file: string, body: string) => {
    mkdirSync(path.join(root, id), { recursive: true });
    writeFileSync(path.join(root, id, file), body);
  };

  it("reads runs at the root it is given; a drifted manifest is skipped with the door's words", async () => {
    put("strips-ok", "run.json", JSON.stringify({ version: 1, ...run({ id: "strips-ok" }) }));
    put("strips-ok", "verdicts.json", JSON.stringify({ "edu-aqueduct--ctrl": { verdict: "keep", at: "2026-10-07T09:00:00.000Z" }, "edu-aqueduct--E11": null }));
    put("strips-bad", "run.json", JSON.stringify({ ...run({ id: "strips-bad" }), status: "exploded" }));
    put("_ws", "run.json", "{}");
    const r = await readStrips(root);
    if (!r.ok) throw r.error;
    expect(r.value.runs.map((x) => [x.run.id, x.verdicts.map((v) => v.key)])).toEqual([["strips-ok", ["edu-aqueduct--ctrl"]]]);
    expect(r.value.skipped).toEqual([{ id: "strips-bad", reason: expect.stringMatching(/^strip run strips-bad: status: /) }]);
  });
});
