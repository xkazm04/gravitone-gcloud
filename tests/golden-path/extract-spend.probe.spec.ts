// EXTRACT SPEND — the extract engine meters what it spends, stops at a per-run
// ceiling, and books a budget refusal as a named stop instead of a vendor
// failure.
//
// Registry: software-engineering/cost-metering (#budget-enforcement - a
// refusal names the scope that refused; #spend-attribution; #usage-ledgers -
// an unpriced call still gets a row) and media-generation/
// generative-provider-routing#cost-per-usable-economics (what a KEPT style cost).
//
// WHY. The forge's two sibling gates (Dojo cycles, Strips cards) record
// costUsd; extract threw every call's provenance.costUsd away, had no ceiling
// of its own, and booked an `over-budget` refusal from the period meter as a
// vendor failure — an errored round appended, the breaker counted toward
// BREAKER_LIMIT. Today such a stop resumes only because its errored rounds get
// pruned; the new run-ceiling stop leaves nothing to prune, so its resume path
// (clear `stopped`, raise the ceiling) is built with it.
//
// Driven through the REAL engine with a priced fake IO (the style-extract
// probe's pattern), and the REAL stepRun on a run dir under EXTRACT_ROOT with
// only the vendor calls swapped through the store's IO seam.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { newManifest, next, runToEnd, step, type CallKind, type EngineIO } from "@/lib/foundry/extract/engine";
import { EXTRACT_ROOT, __setExtractIO, commitExtractRun, listExtractRuns, stepRun } from "@/lib/foundry/extract/store";
import { OBSERVABLE_FIELDS } from "@/lib/foundry/extract/types";
import type { ExtractManifest, ExtractSource, Observables, Readback } from "@/lib/foundry/extract/types";
import { CRITIQUE_SCHEMA } from "@/lib/foundry/extract/vocabulary";
import { overBudget } from "@/lib/imaging/errors";

import { probeFoundryDir, stripComments } from "./_helpers";

const foundryDir = probeFoundryDir();

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const painterly: Observables = {
  render_mode: "painterly",
  medium: "2d-digital-painting",
  detail_density: "moderate",
  surface_realism: "plausible",
  atmospherics: "heavy-haze",
  particle_fx: "heavy-debris",
  palette_strategy: "warm-cool-split",
  black_handling: "crushed",
  edge_treatment: "soft",
  finish: "painterly-textured",
  focus: "deep-focus",
};
const cel: Observables = {
  ...painterly,
  render_mode: "cel-shaded",
  detail_density: "sparse",
  surface_realism: "flat",
  atmospherics: "none",
  particle_fx: "none",
  palette_strategy: "saturated-vivid",
  black_handling: "deep-neutral",
  edge_treatment: "crisp",
  finish: "clean-smooth",
};
const rb = (o: Observables): Readback => ({
  ...o,
  has_text: false,
  dominant_colours: ["teal", "rust"],
  look: "painted matte surfaces under one hard key",
  depiction: "a lone figure on a ridge, full shot, low angle",
});

const PRICE: Record<CallKind, number> = { recognize: 0.002, generate: 0.04, reason: 0.01 };

interface Script {
  /** generate throws an over-budget refusal from this generate ordinal on. */
  overBudgetFrom?: number;
  /** generate serves with no cost at all — an unpriced vendor. */
  unpricedGenerate?: boolean;
}

interface Ledger {
  calls: string[];
  /** Sum of every SERVED call's reported cost, as the vendor reported it. */
  served: number;
}

function fakeIO(m: ExtractManifest, script: Script, ledger: Ledger): EngineIO {
  const images = new Map<string, string>();
  for (const s of m.sources) images.set(s.file, `src:${s.id}`);
  let gens = 0;
  return {
    async readImage(rel) {
      return { base64: images.get(rel) ?? `gen:${rel}`, mime: "image/jpeg" };
    },
    async writeImage(rel, img) {
      images.set(rel, img.base64);
    },
    async recognize(img, _instruction, schema) {
      ledger.calls.push("recognize");
      ledger.served += PRICE.recognize;
      if (img.base64.startsWith("src:")) return { value: rb(img.base64 === "src:s03" ? cel : painterly), model: "fake/eyes", costUsd: PRICE.recognize };
      // Two observables short of the target → every replica takes both rounds.
      const obs = { ...painterly, edge_treatment: "crisp", atmospherics: "none" };
      const value = schema === CRITIQUE_SCHEMA ? { ...rb(obs), critique: "edges too crisp", recipe_fix: "Revised recipe: softer edges and heavier haze throughout the frame, matte brushwork." } : rb(obs);
      return { value, model: "fake/eyes", costUsd: PRICE.recognize };
    },
    async generate() {
      gens++;
      if (script.overBudgetFrom !== undefined && gens >= script.overBudgetFrom) throw overBudget("The imaging spend ceiling for this window is reached.");
      ledger.calls.push("generate");
      if (script.unpricedGenerate) return { value: { base64: `gen:${gens}`, mime: "image/jpeg" }, model: "fake/pixels" };
      ledger.served += PRICE.generate;
      return { value: { base64: `gen:${gens}`, mime: "image/jpeg" }, model: "fake/pixels", costUsd: PRICE.generate, basis: "vendor-reported" };
    },
    async reason() {
      ledger.calls.push("reason");
      ledger.served += PRICE.reason;
      return {
        value: {
          styles: [
            { id: "painted-haze", name: "Painted Haze", family: "game", members: ["s01", "s02"], ...painterly, recipe: "Painterly rendering with matte brushwork, heavy haze, one hard key, crushed blacks, soft edges.", negative: "photo" },
            { id: "flat-cel", name: "Flat Cel", family: "animation", members: ["s03"], ...cel, recipe: "Cel-shaded flat fills with crisp ink lines, saturated palette, no atmosphere, deep neutral blacks.", negative: "grain" },
          ],
        },
        model: "fake/words",
        costUsd: PRICE.reason,
      };
    },
    estimateUsd: (kind) => PRICE[kind],
    async save() {},
    now: () => "2026-10-10T00:00:00.000Z",
  };
}

function manifest(opts: Partial<ExtractManifest["options"]> = {}, id = "2026-10-10-spend"): ExtractManifest {
  const src = (sid: string): ExtractSource => ({ id: sid, name: `${sid}.jpg`, file: `sources/${sid}.jpg`, mime: "image/jpeg", width: 1280, height: 720, aspect: "16:9", readback: null, error: null });
  return newManifest(id, "spend", [src("s01"), src("s02"), src("s03")], { rounds: 2, replicas: 2, transfers: 1, ...opts }, "2026-10-10T00:00:00.000Z");
}

const ledger = (): Ledger => ({ calls: [], served: 0 });
const sum = (xs: Record<string, number | undefined>) => Object.values(xs).reduce<number>((a, b) => a + (b ?? 0), 0);

/* ── 1. metering ──────────────────────────────────────────────────────────── */

test("1. spend: every served call is booked, by stage, and the stages sum to the total", async () => {
  const m = manifest();
  const l = ledger();
  await runToEnd(m, fakeIO(m, {}, l));
  expect(m.status).toBe("done");
  console.log(`[extract-spend] full run: ${l.calls.length} calls, served $${l.served.toFixed(6)}, booked $${m.spend?.usd}`);
  expect(m.spend).toBeDefined();
  expect(m.spend!.usd).toBeCloseTo(l.served, 9);
  expect(Object.keys(m.spend!.by_stage).sort()).toEqual(["group", "read", "replica", "transfer"]);
  expect(sum(m.spend!.by_stage)).toBeCloseTo(m.spend!.usd, 9);
  expect(m.spend!.by_stage.read).toBeCloseTo(3 * PRICE.recognize, 9);
  expect(m.spend!.by_stage.group).toBeCloseTo(PRICE.reason, 9);
  expect(m.spend!.unpriced).toBe(0);
});

/* ── 2. the run ceiling ───────────────────────────────────────────────────── */

test("2. ceiling: no unit starts once spend + its estimate would cross it; the stop is named, the breaker untouched", async () => {
  const m = manifest({ ceilingUsd: 0.1 });
  const l = ledger();
  const io = fakeIO(m, {}, l);
  await runToEnd(m, io);
  expect(m.status).toBe("failed");
  expect(m.stopped?.by).toBe("run-ceiling");
  expect(m.stopped?.ceilingUsd).toBe(0.1);
  expect(m.stopped?.spentUsd).toBe(m.spend!.usd);
  expect(m.spend!.usd).toBeLessThanOrEqual(0.1);
  // 3 reads + group + s01 r1 + s01 r2 = 0.1 exactly; s02 r1 would make 0.142.
  expect(m.spend!.usd).toBeCloseTo(0.1, 9);
  expect(m.fail_streak ?? 0).toBe(0);
  expect(m.error ?? "").not.toMatch(/consecutive vendor failures/);
  const before = l.calls.length;
  expect(next(m)).toBeNull();
  expect((await step(m, io)).unit).toBeNull();
  expect(l.calls.length, "a vendor was called after the ceiling stop").toBe(before);
  expect(m.spend!.usd).toBeCloseTo(l.served, 9);
});

/* ── 3. a period-budget refusal parks, it does not trip ───────────────────── */

test("3. over-budget: a refusal inside a unit stops the run as period-ceiling, with no errored round and no breaker count", async () => {
  const m = manifest();
  const l = ledger();
  await runToEnd(m, fakeIO(m, { overBudgetFrom: 1 }, l));
  expect(m.status).toBe("failed");
  expect(m.stopped?.by).toBe("period-ceiling");
  const rounds = m.styles.flatMap((s) => s.replicas.flatMap((r) => r.rounds));
  expect(rounds, "a refused generate left a ReplicaRound behind").toHaveLength(0);
  expect(m.fail_streak ?? 0).toBe(0);
  expect(m.error ?? "").not.toMatch(/consecutive vendor failures/);
  expect(l.calls.filter((c) => c === "generate")).toHaveLength(0);
});

/* ── 4. the run-ceiling stop resumes ──────────────────────────────────────── */

const made: string[] = [];
test.afterEach(() => {
  __setExtractIO(null);
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});
const uid = (p: string) => `probe-spend-${p}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

test("4. resume: a run stopped by its ceiling, with nothing failed, takes a raised ceiling and continues one unit", async () => {
  const id = uid("resume");
  const dir = path.join(EXTRACT_ROOT, id);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  const m = manifest({ ceilingUsd: 0.1 }, id);
  const l = ledger();
  await runToEnd(m, fakeIO(m, {}, l));
  expect(m.stopped?.by).toBe("run-ceiling");
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(m), "utf8");

  const vendor = fakeIO(m, {}, l);
  __setExtractIO((_id, live) => ({ ...live, recognize: vendor.recognize, generate: vendor.generate, reason: vendor.reason, readImage: vendor.readImage, writeImage: vendor.writeImage, estimateUsd: vendor.estimateUsd }));
  const before = l.calls.length;
  const r = await stepRun(id, 1, true, { ceilingUsd: 0.5 });
  const disk = JSON.parse(readFileSync(path.join(dir, "run.json"), "utf8")) as ExtractManifest;
  console.log(`[extract-spend] resumed: ${r.unit} -> ${disk.status}, $${disk.spend?.usd} of $${disk.options.ceilingUsd}`);
  expect(r.unit).toMatch(/^replicate painted-haze on s02/);
  expect(["replicating", "transferring"]).toContain(disk.status);
  expect(disk.stopped).toBeUndefined();
  expect(disk.options.ceilingUsd).toBe(0.5);
  expect(l.calls.length - before).toBe(2); // one generate + one critique
  expect(disk.spend!.usd).toBeCloseTo(0.142, 9);
});

/* ── 5. an unpriced call is booked at its estimate ────────────────────────── */

test("5. unpriced: a served call with no cost books its pre-call estimate and is counted, so it cannot run past the ceiling free", async () => {
  const m = manifest({ ceilingUsd: 0.1 });
  const l = ledger();
  await runToEnd(m, fakeIO(m, { unpricedGenerate: true }, l));
  expect(m.spend!.unpriced).toBe(2); // s01 r1, s01 r2 before the ceiling
  expect(m.spend!.basis).toBe("estimate");
  expect(m.spend!.usd).toBeCloseTo(0.1, 9);
  expect(m.stopped?.by).toBe("run-ceiling");
});

/* ── 6. list and commit carry the figure ──────────────────────────────────── */

function finishedRun(spendUsd: number): string {
  const id = uid("commit");
  const dir = path.join(EXTRACT_ROOT, id);
  made.push(dir);
  mkdirSync(dir, { recursive: true });
  const style = (sid: string) => ({
    id: sid,
    name: sid,
    family: "f",
    members: ["s01"],
    observables: Object.fromEntries(OBSERVABLE_FIELDS.map((f) => [f, `${sid}-x`])) as Observables,
    recipe: "r",
    negative: "n",
    recipe_history: ["r"],
    grouped_by: "singleton" as const,
    replicas: [],
    transfers: [],
  });
  const m = manifest({}, id);
  m.status = "done";
  m.styles = [style("styleA"), style("styleB")];
  m.spend = { usd: spendUsd, by_stage: { read: spendUsd }, unpriced: 0, basis: "reported" };
  writeFileSync(path.join(dir, "run.json"), JSON.stringify(m), "utf8");
  const at = new Date().toISOString();
  writeFileSync(path.join(dir, "verdicts.json"), JSON.stringify({ styleA: { verdict: "keep", at }, styleB: { verdict: "keep", at } }), "utf8");
  return id;
}

test("6. list + commit: summaries carry spendUsd; the commit stamps spendUsd and costPerKeptUsd", async () => {
  writeFileSync(path.join(foundryDir(), "styles.json"), JSON.stringify({ styles: [] }), "utf8");
  const id = finishedRun(0.3);
  const row = (await listExtractRuns()).find((s) => s.id === id);
  expect(row?.spendUsd).toBe(0.3);
  await commitExtractRun(id);
  const disk = JSON.parse(readFileSync(path.join(EXTRACT_ROOT, id, "run.json"), "utf8")) as ExtractManifest;
  expect(disk.committed?.spendUsd).toBe(0.3);
  expect(disk.committed?.costPerKeptUsd).toBeCloseTo(0.15, 9);
  expect(existsSync(path.join(foundryDir(), "styles.json"))).toBe(true);
});

/* ── 7. [guard] no ceiling changes nothing ────────────────────────────────── */

test("7. [guard] without ceilingUsd: same unit order, no ceiling key, no stop — every field but spend as before", async () => {
  const a = manifest();
  const b = manifest();
  expect("ceilingUsd" in a.options).toBe(false);
  const ua: string[] = [];
  const ub: string[] = [];
  await runToEnd(a, fakeIO(a, {}, ledger()), (r) => ua.push(r.unit!));
  // The same run, served by a vendor that prices nothing: metering must not steer the scheduler.
  await runToEnd(b, fakeIO(b, { unpricedGenerate: true }, ledger()), (r) => ub.push(r.unit!));
  expect(ua).toEqual(ub);
  expect(ua.slice(0, 5)).toEqual(["read s01", "read s02", "read s03", "group into styles", "replicate painted-haze on s01, round 1"]);
  expect(a.status).toBe("done");
  expect(a.stopped).toBeUndefined();
  const strip = (m: ExtractManifest) => {
    const { spend: _s, ...rest } = m;
    return rest;
  };
  expect(strip(a)).toEqual(strip(b));
});

/* ── wiring ───────────────────────────────────────────────────────────────── */

test("wiring: liveIO passes every call's provenance cost through, and /step hands ceilingUsd to stepRun", () => {
  const store = stripComments(readFileSync(path.join(process.cwd(), "lib/foundry/extract/store.ts"), "utf8"));
  const live = store.slice(store.indexOf("export function liveIO"), store.indexOf("export async function stepRun"));
  expect(live.match(/costUsd:\s*\w+\.provenance\.costUsd/g) ?? [], "liveIO drops a call's costUsd").toHaveLength(3);
  expect(store).toMatch(/__ioOverride\s*\?\s*__ioOverride\(id,\s*base\)/);
  const route = stripComments(readFileSync(path.join(process.cwd(), "app/api/foundry/extract/[id]/step/route.ts"), "utf8"));
  expect(route).toMatch(/stepRun\(id,\s*units,\s*retry,\s*\{\s*ceilingUsd\s*\}\)/);
});
