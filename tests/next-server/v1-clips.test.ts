import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { projectClips, readClips, type ClipsSnapshot } from "../../lib/ledger/v1/sources/clips.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";

// Video clips (lib/imaging/video/store.ts ClipRecord): the twelfth source,
// included because a clip renders on the server for minutes, detached from
// the request that started it.

const ctx = (iso = "2026-10-15T12:00:00.000Z"): ProjectCtx => ({ now: new Date(iso), universe: "real" });
const T = Date.parse("2026-10-15T11:00:00.000Z");
type Clip = ClipsSnapshot["clips"][number];
const clip = (clipId: string, status: Clip["status"], over: Partial<Clip> = {}): Clip => ({
  clipId, projectId: "p1", status, model: "hailuo-03", durationS: 5, aspect: "16:9", vendorJobId: null, costUsd: null, costBasis: "unpriced", error: null, createdAt: T, finishedAt: null, ...over,
});
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("clips projection", () => {
  it("counts the facts it projects; the end keeps the vendor's words and its cost as data", () => {
    const p = projectClips(
      { clips: [clip("clip-aaaaaa1", "rendering"), clip("clip-aaaaaa2", "refused", { finishedAt: T + 60_000, error: "Leonardo: CONTENT_FILTER", costUsd: 0.75, costBasis: "vendor-reported" })], skipped: [] },
      ctx(),
    );
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "clip.start": 2, "clip.status": 1, "clip.end": 1 });
    const end = p.events.find((e) => e.type === "clip.end");
    expect(end).toMatchObject({ key: "clips:clip-aaaaaa2:end.refused", occurredAt: "2026-10-15T11:01:00.000Z", data: { error: "Leonardo: CONTENT_FILTER", costUsd: 0.75, projectId: "p1" } });
    expect(end?.cost).toBeUndefined();
  });

  it("queued waits and rendering runs, on the Leonardo lane", () => {
    const p = projectClips({ clips: [clip("clip-q00001", "queued"), clip("clip-r00001", "rendering"), clip("clip-d00001", "done", { finishedAt: T })], skipped: [] }, ctx());
    expect(p.live.map((j) => [j.id, j.state, j.lane, j.media])).toEqual([
      ["clip-q00001", "queued", "cloud.leonardo", "video"],
      ["clip-r00001", "running", "cloud.leonardo", "video"],
    ]);
  });
});

describe("clips reader", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gt-clips-"));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("reads clip records by v1's id rule; a damaged record is named, not just counted", async () => {
    writeFileSync(path.join(root, "clip-good0001.json"), JSON.stringify({ ...clip("clip-good0001", "queued"), motion: "push in" }));
    writeFileSync(path.join(root, "clip-bad00001.json"), "{");
    writeFileSync(path.join(root, "clip-good0001.mp4"), "");
    writeFileSync(path.join(root, "notes.json"), "{}");
    const r = await readClips(root);
    if (!r.ok) throw r.error;
    expect(r.value.clips.map((c) => c.clipId)).toEqual(["clip-good0001"]);
    expect(r.value.skipped).toEqual([{ id: "clip-bad00001", reason: expect.stringMatching(/^clip clip-bad00001: not valid JSON/) }]);
  });
});
