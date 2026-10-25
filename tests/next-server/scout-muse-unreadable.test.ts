// AN UNREADABLE MUSE ROOT DOES NOT HIDE THE SCOUT WING (ledger scout + seeds sources): the muse root is a FILE,
// so its listing throws ENOTDIR; the scout wing's night and seed batch still project their Weir piles and the
// muse failure is a skipped entry. The scout wing failing still fails the source.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-scout-muse-unreadable-"));
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "scout");
  process.env["SCOUT_MUSE_STORE_DIR"] = path.join(dir, "scout-muse-is-a-file");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Candidate, Night, SeedBatch } from "../../lib/foundry/scout/types.ts";
import { projectScout, scoutSource } from "../../lib/ledger/v1/sources/scout.ts";
import { projectSeeds, seedsSource } from "../../lib/ledger/v1/sources/seeds.ts";
import type { ProjectCtx } from "../../lib/ledger/v1/types.ts";

const DAY = "2026-10-24";
const ctx: ProjectCtx = { now: new Date("2026-10-25T09:00:00.000Z"), universe: "real" };
const idea: Candidate = { id: "c-01", kind: "idea", sourceIds: [], status: "rendered", title: "Lantern-lit stairwell", target: "scene", prompt: "p", anchor: { kind: "free", ref: "" }, image: "ideas/c-01.png" };
const night: Night = { id: DAY, startedAt: `${DAY}T00:00:00.000Z`, ceilingUsd: 2, target: 3, clipCap: 0, dry: false, state: "closed", closedAt: `${DAY}T04:00:00.000Z`, sources: [], candidates: [idea], jobs: [] };

beforeAll(() => {
  mkdirSync(path.join(ROOT, "scout", DAY), { recursive: true });
  writeFileSync(path.join(ROOT, "scout", DAY, "night.json"), JSON.stringify(night));
  const batch = { id: "2026-10-24-1", createdAt: `${DAY}T05:00:00.000Z`, dry: false, seeds: [{ id: "s-01" }] };
  mkdirSync(path.join(ROOT, "scout", "seeds", batch.id), { recursive: true });
  writeFileSync(path.join(ROOT, "scout", "seeds", batch.id, "batch.json"), JSON.stringify(batch satisfies Partial<SeedBatch> | object));
  writeFileSync(path.join(ROOT, "scout-muse-is-a-file"), "not a directory");
  // The seeds listing reads <root>/seeds: a muse root whose `seeds` is a file fails it with ENOTDIR on every platform.
  mkdirSync(path.join(ROOT, "scout-muse-seeds-file"), { recursive: true });
  writeFileSync(path.join(ROOT, "scout-muse-seeds-file", "seeds"), "not a directory");
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("the muse root cannot be listed", () => {
  it("scout source: the scout night keeps its Weir pile, the muse wing is a skip", async () => {
    const snap = await scoutSource.read();
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    const p = projectScout(snap.value, ctx);
    expect(p.weir.map((w) => w.id)).toEqual([DAY]);
    expect(p.skipped.map((s) => s.id)).toEqual(["muse"]);
  });

  it("seeds source: the scout batch keeps its Weir pile, the muse wing is a skip", async () => {
    process.env["SCOUT_MUSE_STORE_DIR"] = path.join(ROOT, "scout-muse-seeds-file");
    const snap = await seedsSource.read();
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    const p = projectSeeds(snap.value, ctx);
    expect(p.weir.map((w) => w.id)).toEqual(["2026-10-24-1"]);
    expect(p.skipped.map((s) => s.id)).toEqual(["muse"]);
  });
});
