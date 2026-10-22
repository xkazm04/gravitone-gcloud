// THE /scout NIGHT, PROJECTED (lib/ledger/v1/sources/scout.ts) and SHELVED
// (lib/library/feeds/scout.ts): a closed night that rendered something is one
// Floor pile that opens pkt:scout:<night>; a committed night leaves the Weir
// and its kept scenes reach the Library as reference-only motion items; a dry
// night is neither. Literal nights; the feed's reader over a temp store.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { libraryItemSchema } from "@gt/domain/libraryItem";

import type { Night, SceneCandidate } from "../../lib/foundry/scout/types.ts";
import { weirPacketId } from "../../lib/ledger/v1/packet.ts";
import { projectScout } from "../../lib/ledger/v1/sources/scout.ts";
import type { IngestEvent, ProjectCtx } from "../../lib/ledger/v1/types.ts";
import { scoutFeed, shelveNight } from "../../lib/library/feeds/scout.ts";

const ctx: ProjectCtx = { now: new Date("2026-10-22T09:00:00.000Z"), universe: "real" };
const scene = (id: string, over: Partial<SceneCandidate> = {}): SceneCandidate => ({
  id,
  kind: "scene",
  sourceIds: ["s-01"],
  status: "rendered",
  keyframes: ["sources/s-01/k-001.jpg"],
  recipe: { shot: "wide", camera: "low angle, 24mm", motion: "slow push-in", composition: "lone figure on the left third", lighting: "hard key", palette: [], rhythm: "long holds", durationS: 4, prompt: "wide low-angle shot" },
  replicas: [`scenes/${id}/replica-1.jpg`, `scenes/${id}/replica-2.jpg`],
  clip: { path: `scenes/${id}/clip.mp4`, durationS: 5, from: `scenes/${id}/replica-1.jpg` },
  ...over,
});
const night = (over: Partial<Night> = {}): Night => ({
  id: "2026-10-21",
  startedAt: "2026-10-21T00:00:00.000Z",
  ceilingUsd: 15,
  target: 20,
  clipCap: 2,
  dry: false,
  state: "closed",
  stop: "target",
  closedAt: "2026-10-21T05:00:00.000Z",
  sources: [],
  candidates: [scene("c-01"), scene("c-02"), { id: "c-03", kind: "style", sourceIds: [], status: "failed", error: "quota" }],
  jobs: [],
  ...over,
});
const committed = (kept: string[], dry = false): Night["committed"] => ({ at: "2026-10-22T08:00:00.000Z", by: "operator", kept, rejected: [], reasons: {}, notes: {}, dry });
const byType = (events: readonly IngestEvent[]): Record<string, number> => {
  const m: Record<string, number> = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};

describe("scout projection", () => {
  it("a closed night is one pile that opens pkt:scout:<night>; a committed, a dry or an empty one is not", () => {
    const p = projectScout(
      {
        nights: [
          night(),
          night({ id: "2026-10-20", state: "committed", committed: committed(["c-01/clip"]) }),
          night({ id: "2026-10-19", dry: true }),
          night({ id: "2026-10-18", candidates: [] }),
          night({ id: "2026-10-22", state: "open" }),
        ],
        skipped: [],
      },
      ctx,
    );
    expect(p.weir).toEqual([{ source: "scout", id: "2026-10-21", title: "scout 2026-10-21", media: "image", kind: "cull", since: "2026-10-21T05:00:00.000Z", decided: 0, pending: 2, href: "/floor?lane=image" }]);
    expect(weirPacketId(p.weir[0] ?? { source: "", id: "" })).toBe("pkt:scout:2026-10-21");
    expect(p.live).toEqual([]);
    expect(byType(p.events)).toEqual(p.tally.facts);
    expect(p.tally.facts).toEqual({ "run.start": 5, "run.status": 5, "run.end": 5, commit: 1 });
    expect(new Set(p.events.map((e) => e.key)).size).toBe(p.events.length);
  });
});

describe("scout library feed", () => {
  it("a kept clip shelves the scene as a clip; a kept replica alone as a poster; reference-only, subject from the composition", () => {
    const n = night({ state: "committed", committed: committed(["c-01/replica-1", "c-01/clip", "c-02/replica-2"]) });
    const r = shelveNight(n, "real");
    expect(r.skipped).toEqual([]);
    expect(r.items.map((i) => [i.item.id, i.item.vocabulary, i.file?.mime])).toEqual([
      ["motion:scout:2026-10-21:c-01", { subject: "lone figure on the left third", format: "clip" }, "video/mp4"],
      ["motion:scout:2026-10-21:c-02", { subject: "lone figure on the left third", format: "poster" }, "image/jpeg"],
    ]);
    for (const i of r.items) {
      expect(i.item).toMatchObject({ kind: "motion", state: "ratified", rights: { use: "reference-only" } });
      expect(libraryItemSchema.safeParse(i.item).success).toBe(true);
    }
  });

  it("nothing from a night that is not committed, or was dry", () => {
    expect(shelveNight(night(), "real").items).toEqual([]);
    expect(shelveNight(night({ state: "committed", dry: true, committed: committed(["c-01/clip"], true) }), "real").items).toEqual([]);
  });

  describe("over a temp store", () => {
    let dir = "";
    const was = process.env["SCOUT_STORE_DIR"];
    beforeEach(() => {
      dir = mkdtempSync(path.join(tmpdir(), "gt-scout-feed-"));
      process.env["SCOUT_STORE_DIR"] = dir;
    });
    afterEach(() => {
      if (was === undefined) delete process.env["SCOUT_STORE_DIR"];
      else process.env["SCOUT_STORE_DIR"] = was;
      rmSync(dir, { recursive: true, force: true });
    });

    it("reads every committed night through the night store", async () => {
      for (const n of [night({ state: "committed", committed: committed(["c-02/replica-1"]) }), night({ id: "2026-10-22" })]) {
        mkdirSync(path.join(dir, n.id), { recursive: true });
        writeFileSync(path.join(dir, n.id, "night.json"), JSON.stringify(n));
      }
      const r = await scoutFeed.read({ universe: "fixture" });
      expect(r.items.map((i) => [i.item.id, i.item.source, i.file?.abs])).toEqual([["motion:scout:2026-10-21:c-02", "fixture", path.join(dir, "2026-10-21", "scenes", "c-02", "replica-1.jpg")]]);
    });
  });
});
