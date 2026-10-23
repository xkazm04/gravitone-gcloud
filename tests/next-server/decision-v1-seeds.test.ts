// A BATCH OF SEEDS ON THE BOARD (spark scout-decision-graph WP-S1) - lib/decision/v1/sources/seeds.ts through
// the REAL kernel: one words-only cell per seed whose id IS the seed id, the sentence its label, its facets the
// meta and a child's parent under it; the preview saying what each verdict does; the commit refused while a
// reject names no reason; the apply writing `batch.committed` once - idempotent, a different second outcome
// refused, and a reasonless reject refused by the apply too. The ledger's pile for an uncommitted batch.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-seeds-"));
  vi.spyOn(process, "cwd").mockReturnValue(dir);
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "store", "gravitone.sqlite");
  process.env["SCOUT_STORE_DIR"] = path.join(dir, "foundry-out", "scout");
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { adapterFor } from "../../lib/decision/v1/registry.ts";
import { seedsAdapter } from "../../lib/decision/v1/sources/seeds.ts";
import { weirPacketId } from "../../lib/ledger/v1/packet.ts";
import { projectSeeds } from "../../lib/ledger/v1/sources/seeds.ts";
import type { Seed, SeedBatch } from "../../lib/foundry/scout/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const BATCH = "2026-10-23";
const PARENT = "2026-10-20";
const blobDir = path.join(ROOT, "blobs");
const at = (id: string): string => path.join(ROOT, "foundry-out", "scout", "seeds", id, "batch.json");

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const seed = (id: string, sentence: string, o: Partial<Seed> = {}): Seed => ({ id, sentence, genre: "comedy", subgenre: "office sketch", type: "animated comedy sketch", audience: "adult", format: "short", ...o });

function write(b: SeedBatch): void {
  mkdirSync(path.dirname(at(b.id)), { recursive: true });
  writeFileSync(at(b.id), JSON.stringify(b));
}

function fresh(dry = false): void {
  rmSync(path.join(ROOT, "foundry-out"), { recursive: true, force: true });
  write({ id: PARENT, createdAt: `${PARENT}T09:00:00.000Z`, dry: false, seeds: [seed("sd-001", "A tired printer unionises every machine in the office, one jam at a time.")], committed: { at: `${PARENT}T10:00:00.000Z`, by: "operator", kept: ["sd-001"], rejected: [], reasons: {}, notes: {}, dry: false } });
  write({
    id: BATCH,
    createdAt: `${BATCH}T09:00:00.000Z`,
    dry,
    seeds: [
      seed("sd-001", "The printers' union holds a strike vote.", { parent: `${PARENT}/sd-001` }),
      seed("sd-002", "A lighthouse keeper rations the light.", { genre: "drama", subgenre: "character study", type: "animated short", format: "video" }),
      seed("sd-003", "A dog learns to whistle.", { audience: "kids", subgenre: "animal gag" }),
    ],
  });
}

const batchNow = (): SeedBatch => JSON.parse(readFileSync(at(BATCH), "utf8")) as SeedBatch;

describe("seeds adapter - one words cell per seed", () => {
  it("is the registry's seeds adapter; plans a row per seed, the cell id the seed id, filed under seeds", async () => {
    fresh();
    expect(adapterFor("seeds").ok).toBe(true);
    const flow = await openFlow(seedsAdapter, BATCH, blobDir);
    const { packet, present, initial, losses } = flow.plan;
    expect(packet.id).toBe(`pkt:seeds:${BATCH}`);
    expect([packet.source, packet.mode, packet.runId, packet.title]).toEqual(["seeds", "matrix-cull", BATCH, `seeds ${BATCH}`]);
    expect(packet.items.map((c) => [c.id, c.row, c.media.mime, c.jobId])).toEqual([
      ["sd-001", "sd-001", "text/plain", `seeds:${BATCH}`],
      ["sd-002", "sd-002", "text/plain", `seeds:${BATCH}`],
      ["sd-003", "sd-003", "text/plain", `seeds:${BATCH}`],
    ]);
    expect([initial, losses]).toEqual([[], []]);
    expect(present.rows[1]).toEqual({ id: "sd-002", label: "A lighthouse keeper rations the light.", group: "seeds" });
    expect(present.items["sd-002"]).toEqual({ label: "A lighthouse keeper rations the light.", meta: "adult · drama › character study · animated short · video" });
    // A child names its parent's sentence, cut at 60 on a word.
    expect(present.items["sd-001"]?.prompt).toBe("from: A tired printer unionises every machine in the office, one…");
    expect(present.meta).toBe("seeds · 3 · 1 children");
  });

  it("previews kept as a branch and rejected as a ban with its reasons; the kernel refuses a commit while a reject names none", async () => {
    fresh();
    const flow = await openFlow(seedsAdapter, BATCH, blobDir);
    flow.patch([
      { candidate: "sd-001", verdict: "keep", note: "the union arc is the channel" },
      { candidate: "sd-002", verdict: "reject" },
      { candidate: "sd-003", verdict: "reject", reasons: ["audience"], note: "too young" },
    ]);
    const p = must(flow.preview());
    expect(p.consequence.counts).toEqual({ kept: 1, rejected: 2, undecided: 0 });
    expect(p.consequence.writes.map((w) => [w.candidate ?? "", w.target, w.detail])).toEqual([
      ["sd-001", `foundry-out/scout/seeds/${BATCH}/batch.json`, "a branch: child seeds and ideas grow from it next night"],
      ["sd-002", `foundry-out/scout/seeds/${BATCH}/batch.json`, "banned from the next batch · needs a reason"],
      ["sd-003", `foundry-out/scout/seeds/${BATCH}/batch.json`, "banned from the next batch (audience)"],
      ["", `foundry-out/scout/seeds/${BATCH}/batch.json`, "committed: every verdict, its reasons and its note"],
    ]);
    const refused = flow.commit();
    expect(!refused.ok && refused.error.message).toBe("decision: 1 rejected need a reason: sd-002");
    flow.patch([{ candidate: "sd-002", verdict: "reject", reasons: ["generic", "done before"] }]);
    expect(flow.commit().ok).toBe(true);
    const claim = flow.claim();
    expect((await seedsAdapter.apply(claim)).ok).toBe(true);
    expect(batchNow().committed).toEqual({
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      by: "operator",
      kept: ["sd-001"],
      rejected: ["sd-002", "sd-003"],
      reasons: { "sd-002": ["generic", "done before"], "sd-003": ["audience"] },
      notes: { "sd-001": "the union arc is the channel", "sd-003": "too young" },
      dry: false,
    });
    // Idempotent: the same claim again writes nothing new.
    const was = readFileSync(at(BATCH), "utf8");
    expect((await seedsAdapter.apply(claim)).ok).toBe(true);
    expect(readFileSync(at(BATCH), "utf8")).toBe(was);
    // Decided, the batch opens no packet and previews nothing.
    expect(seedsAdapter.packet(must(await seedsAdapter.read({ runId: BATCH }))).ok).toBe(false);
  });

  it("refuses a different second outcome, naming each seed that differs, and a reasonless reject - writing nothing", async () => {
    fresh();
    const flow = await openFlow(seedsAdapter, BATCH, blobDir);
    flow.patch([
      { candidate: "sd-001", verdict: "keep" },
      { candidate: "sd-002", verdict: "keep" },
      { candidate: "sd-003", verdict: "reject", reasons: ["audience"] },
    ]);
    expect(flow.commit().ok).toBe(true);
    const claim = flow.claim();
    const other = { ...claim, decisions: claim.decisions.map((d) => (d.key.endsWith("::sd-002") ? { ...d, verdict: "reject" as const, reasons: [] } : d)) };
    expect(await seedsAdapter.apply(other)).toMatchObject({ ok: false, error: { code: "refused", message: `seeds batch ${BATCH}: 1 rejected need a reason: sd-002` } });
    expect(batchNow().committed).toBeUndefined();
    expect((await seedsAdapter.apply(claim)).ok).toBe(true);
    const flipped = { ...claim, decisions: claim.decisions.map((d) => (d.key.endsWith("::sd-002") ? { ...d, verdict: "reject" as const, reasons: ["generic"] } : d)) };
    expect(await seedsAdapter.apply(flipped)).toMatchObject({ ok: false, error: { code: "refused", message: `seeds batch ${BATCH} was committed with other verdicts: sd-002 is keep in v1, reject here` } });
    expect(batchNow().committed?.kept).toEqual(["sd-001", "sd-002"]);
  });

  it("a dry batch is triaged and committed like any other, its record saying dry", async () => {
    fresh(true);
    const flow = await openFlow(seedsAdapter, BATCH, blobDir);
    expect(flow.plan.present.meta).toBe("seeds · 3 · 1 children · dry");
    flow.patch([
      { candidate: "sd-001", verdict: "keep" },
      { candidate: "sd-002", verdict: "keep" },
      { candidate: "sd-003", verdict: "reject", reasons: ["format"] },
    ]);
    expect(must(flow.preview()).consequence.writes.at(-1)?.detail).toBe("committed · dry: the verdicts only; nothing derives from it");
    expect(flow.commit().ok).toBe(true);
    expect((await flow.deliver())?.result).toBe("applied");
    expect(batchNow().committed?.dry).toBe(true);
  });
});

describe("seeds projection", () => {
  const b = (id: string, o: Partial<SeedBatch> = {}): SeedBatch => ({ id, createdAt: `${id.slice(0, 10)}T09:00:00.000Z`, dry: false, seeds: [seed("sd-001", "s")], ...o });
  it("an uncommitted live batch is one Floor pile that opens pkt:seeds:<batch>; a committed or dry one is not", () => {
    const ctx = { now: new Date("2026-10-24T00:00:00.000Z"), universe: "real" as const };
    const done = b("2026-10-21", { committed: { at: "2026-10-21T10:00:00.000Z", by: "operator", kept: ["sd-001"], rejected: [], reasons: {}, notes: {}, dry: false } });
    const p = projectSeeds({ batches: [b("2026-10-23"), done, b("2026-10-22", { dry: true })] }, ctx);
    expect(p.weir.map((w) => [w.id, w.pending, weirPacketId(w)])).toEqual([["2026-10-23", 1, "pkt:seeds:2026-10-23"]]);
    expect(p.events.map((e) => e.type).sort()).toEqual(["commit", "run.start", "run.start", "run.start", "run.status", "run.status", "run.status"]);
    expect(p.tally.facts).toEqual({ "run.start": 3, "run.status": 3, commit: 1 });
  });
});
