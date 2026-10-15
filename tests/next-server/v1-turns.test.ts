import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { laneOf, projectTurns, readTurns, type TurnsSnapshot } from "../../lib/ledger/v1/sources/turns.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// The turn ledger over literal records (lib/turns/ledger.ts TurnRecord), and
// the reader's ownership probe - v1's ownerAlive, which lib/ does not export.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
type Rec = TurnsSnapshot["turns"][number]["rec"];
const rec = (id: string, status: Rec["status"], over: Partial<Rec> = {}): Rec => ({
  id, kind: "recalibrate", turn: "edit-plan", projectId: "p1", slot: null, status, bootId: "b-x", pid: 4242, host: "box", startedAt: "2026-10-15T11:00:00.000Z", ...over,
});
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};
const done = rec("tn-000000000003", "done", { endedAt: "2026-10-15T11:02:00.000Z", receipt: { provider: "claude-cli", model: "claude-opus-5", costUsd: 0.37 } });
const failed = rec("tn-000000000004", "failed", {
  turn: "image-generate", endedAt: "2026-10-15T11:01:00+00:00",
  receipt: { lane: "imaging", provenance: { provider: "leonardo-studio", model: "phoenix", costUsd: 0.02 } },
  error: { kind: "refused", message: "the vendor refused the prompt" },
});

describe("turns projection", () => {
  it("counts the facts it projects; the end carries the error verbatim and the cost as data, never as money", () => {
    const p = projectTurns({ turns: [{ rec: rec("tn-000000000001", "running"), owner: "alive" }, { rec: done, owner: "gone" }, { rec: failed, owner: "gone" }], skipped: [] }, ctx());
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "turn.start": 3, "turn.status": 1, "turn.end": 2 });
    const end = p.events.find((e) => e.key === "turns:tn-000000000004:end.failed");
    expect(end).toMatchObject({ occurredAt: "2026-10-15T11:01:00.000Z", atSrc: "recorded", lane: "box.chrome", data: { error: "the vendor refused the prompt", errorKind: "refused", costUsd: 0.02, model: "phoenix" } });
    expect(end?.cost).toBeUndefined();
  });

  it("a live turn whose owner is gone is interrupted - v1's orphaned before the sweep has run", () => {
    const p = projectTurns({ turns: [{ rec: rec("tn-000000000001", "running"), owner: "alive" }, { rec: rec("tn-000000000002", "accepted"), owner: "alive" }, { rec: rec("tn-000000000005", "running"), owner: "gone" }, { rec: done, owner: "gone" }], skipped: [] }, ctx());
    expect(p.live.map((j) => [j.id, j.state])).toEqual([
      ["tn-000000000001", "running"],
      ["tn-000000000002", "queued"],
      ["tn-000000000005", "interrupted"],
    ]);
    expect(p.live[2]?.error).toMatch(/pid 4242 on box\) is gone/);
  });

  it("a settled turn's lane is its receipt's; an unsettled one says where it was drawn and why", () => {
    expect(laneOf(done)).toEqual({ lane: "seat.text" });
    expect(laneOf(rec("x", "done", { receipt: { provider: "google" } }))).toEqual({ lane: "cloud.google" });
    expect(laneOf(rec("x", "done", { turn: "local-render", receipt: { lane: "local" } }))).toEqual({ lane: "gpu.local" });
    expect(laneOf(rec("x", "running"))).toMatchObject({ lane: "seat.text", laneFrom: expect.stringContaining("no provider until its receipt") });
    expect(laneOf(rec("x", "running", { turn: "image-generate" }))).toMatchObject({ lane: "cloud.google", laneFrom: expect.stringContaining("PLAN") });
  });
});

describe("turns reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-turns-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reads tn-*.json at the root; owner by v1's rule; a damaged record is skipped and named", async () => {
    const put = (r: Record<string, unknown> & { id: string }) => writeFileSync(path.join(root, `${r.id}.json`), JSON.stringify({ v: 1, updatedAt: "x", promptDigest: "d", promptChars: 1, ...r }));
    put(rec("tn-00000000000a", "running", { host: hostname(), pid: process.ppid }));
    put(rec("tn-00000000000b", "running", { host: "elsewhere" }));
    put(rec("tn-00000000000c", "running", { host: hostname(), pid: process.pid }));
    put({ ...rec("tn-00000000000d", "running"), status: "exploded" });
    writeFileSync(path.join(root, "notes.json"), "{}");
    const r = await readTurns(root);
    if (!r.ok) throw r.error;
    expect(r.value.turns.map((t) => [t.rec.id, t.owner])).toEqual([
      ["tn-00000000000a", "alive"],
      ["tn-00000000000b", "gone"],
      ["tn-00000000000c", "gone"],
    ]);
    expect(r.value.skipped).toEqual([{ id: "tn-00000000000d", reason: expect.stringMatching(/^turn tn-00000000000d: status: /) }]);
  });
});
