// A NIGHT'S LOAD ON ITS DESK (spark night-load-band WP-L2) - the scout adapter puts the night's load on the
// packet it plans (`present.load`), and the real Board port carries it to the DECIDED desk too: a committed
// night is refused by the adapter's `packet`, so the port reads the night's load itself
// (app/(studio)/board/_port/real.ts decidedExtras). The samples table is WP-L1's: @gt/kernel/resources/load's
// reader is a fake over the samples below. Every store is a temp directory set below.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fake = vi.hoisted(() => ({ samples: [] as import("@gt/domain/load").LoadSample[] }));
vi.mock("@gt/kernel/resources/load", async (actual) => ({
  ...(await actual<typeof import("@gt/kernel/resources/load")>()),
  readLoadSamples: (_r: unknown, fromMs: number, toMs: number) => fake.samples.filter((s) => s.atMs >= fromMs && s.atMs <= toMs),
}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-scout-load-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "foundry-out", "extract");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  process.env["MESH_STORE_DIR"] = path.join(dir, "foundry-out", "mesh");
  process.env["SCOUT_KNOWLEDGE_DIR"] = path.join(dir, "knowledge");
  delete process.env["NEXT_PUBLIC_GRAVITONE_DATA"];
  return dir;
});

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { ok } from "@gt/domain/errors";

import { makeRealBoard } from "../../app/(studio)/board/_port/real.ts";
import { scoutAdapter } from "../../lib/decision/v1/sources/scout.ts";
import { mutateNight } from "../../lib/foundry/scout/store.ts";
import type { IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { must } from "./decision-v1-harness.ts";

const NIGHT = "2026-10-21";
const T0 = Date.parse(`${NIGHT}T00:00:00.000Z`);
const MIN = 60_000;
const out = path.join(ROOT, "foundry-out");

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const idea = (id: string): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `idea ${id}`, target: "scene", prompt: `prompt ${id}`, anchor: { kind: "free", ref: "" }, image: `ideas/${id}.png` });

function seed(): void {
  closeKernel();
  for (const d of ["store", "foundry-out", "catalogue", "knowledge"]) rmSync(path.join(ROOT, d), { recursive: true, force: true });
  mkdirSync(path.join(ROOT, "catalogue"), { recursive: true });
  writeFileSync(path.join(ROOT, "catalogue", "styles.json"), JSON.stringify({ styles: [] }));
  const dir = path.join(out, "scout", NIGHT);
  mkdirSync(path.join(dir, "ideas"), { recursive: true });
  writeFileSync(path.join(dir, "ideas", "c-01.png"), "png c-01");
  const night: Night = { id: NIGHT, startedAt: new Date(T0).toISOString(), ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", stop: "target", closedAt: new Date(T0 + 60 * MIN).toISOString(), sources: [], candidates: [idea("c-01")], jobs: [] };
  writeFileSync(path.join(dir, "night.json"), JSON.stringify(night));
}

/** An hour at 70% on every resource. */
const hour = () => Array.from({ length: 61 }, (_, i) => ({ atMs: T0 + i * MIN, load: { cpuBusy: 0.7, gpuBusy: 0.7 }, ramUsedGb: 44.8, ramTotalGb: 64 }));

describe("scout adapter - the night's load on its packet", () => {
  it("present.load is the night's summary; absent when the night has no samples", async () => {
    seed();
    fake.samples = hour();
    const plan = must(scoutAdapter.packet(must(await scoutAdapter.read({ runId: NIGHT }))));
    expect(plan.present.load).toMatchObject({ fromMs: T0, toMs: T0 + 60 * MIN, samples: 61, cpu: { avg: 0.7, inBand: 1, read: 61 } });
    fake.samples = [];
    expect(must(scoutAdapter.packet(must(await scoutAdapter.read({ runId: NIGHT })))).present).not.toHaveProperty("load");
  });
});

describe("the real Board port - the committed scout desk still receives present.load", () => {
  it("an open packet carries the adapter's load; once the night is committed and v1 refuses to plan it, the port reads it", async () => {
    seed();
    fake.samples = hour();
    const board = makeRealBoard({
      store: () => {
        const k = kernel();
        return k.ok ? ok(k.value.store) : k;
      },
      weir: async () => [],
      kick: () => undefined,
    });
    const id = `pkt:scout:${NIGHT}`;
    const open = must(await board.loadPacket({ id }));
    expect(open.view.state).toBe("open");
    expect(open.present.load).toMatchObject({ samples: 61, ram: { avg: 0.7, read: 61 } });

    await mutateNight(NIGHT, (n) => ({ ...n, state: "committed", committed: { at: new Date(T0 + 7 * 60 * MIN).toISOString(), by: "operator", kept: ["c-01/board"], rejected: [], reasons: {}, notes: {}, dry: false } }));
    // The adapter refuses the committed night: no words, no rows - the decided desk's fallback.
    expect(scoutAdapter.packet(must(await scoutAdapter.read({ runId: NIGHT }))).ok).toBe(false);
    const decided = must(await board.loadPacket({ id }));
    expect(decided.present.items).toEqual({});
    expect(decided.present.load).toMatchObject({ fromMs: T0, toMs: T0 + 60 * MIN, samples: 61, gpu: { avg: 0.7, inBand: 1 } });

    // A night before the sampler: the decided desk gets no load at all, not a summary of zeros.
    fake.samples = [];
    expect(must(await board.loadPacket({ id })).present).not.toHaveProperty("load");
  });
});
