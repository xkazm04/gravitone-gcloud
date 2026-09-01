// STYLE EXTRACTION — the arithmetic and the state machine, driven with fakes.
//
// The Extract module's value is in three decisions that never touch a vendor:
// how sources are grouped, how a generated image is scored against a style,
// and the ORDER the engine takes its units in — read everything, group once,
// replicate with critique rounds, transfer, finish — with a resumable manifest
// as the only state. This probe pins all three through the real code with an
// IO fake that returns scripted readbacks, so it runs in `npm test` for free.
//
// Live vendors are exercised by pipeline/foundry/extract.mts on purpose, not
// here: a suite that goes red when a vendor is busy teaches people to ignore
// red suites.
import { test, expect } from "@playwright/test";

import { doneUnits, totalUnits, BREAKER_LIMIT, hasFailures, newManifest, next, pruneFailures, runToEnd, settleReason, step, type EngineIO } from "@/lib/foundry/extract/engine";
import { CRITIQUE_SCHEMA, deriveFamily, nearDuplicates, partition, styleScore, usableFix, validateSynthesis } from "@/lib/foundry/extract/vocabulary";
import type { ExtractManifest, ExtractSource, Observables, Readback, ReplicaRound } from "@/lib/foundry/extract/types";

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
  render_mode: "cel-shaded",
  medium: "2d-digital-painting",
  detail_density: "sparse",
  surface_realism: "flat",
  atmospherics: "none",
  particle_fx: "none",
  palette_strategy: "saturated-vivid",
  black_handling: "deep-neutral",
  edge_treatment: "crisp",
  finish: "clean-smooth",
  focus: "deep-focus",
};

const rb = (o: Observables, extra: Partial<Readback> = {}): Readback => ({
  ...o,
  has_text: false,
  dominant_colours: ["teal", "rust"],
  look: "painted matte surfaces under one hard key",
  depiction: "a lone figure on a ridge, full shot, low angle",
  ...extra,
});

/* ── grouping ─────────────────────────────────────────────────────────────── */

test("partition: same render mode + medium + most observables → one group; a different render mode or medium never merges; every source placed once", () => {
  const near = { ...painterly, edge_treatment: "diffused" }; // 1 of 9 dressing fields differs → 12/13
  const far = { ...painterly, palette_strategy: "monochrome", atmospherics: "none", black_handling: "lifted-milky" }; // 3 differ → 10/13 < 0.8
  const otherMedium = { ...painterly, medium: "3d-render" }; // same seven, different medium → its own style
  const otherShot = { ...painterly, particle_fx: "none", focus: "shallow-bokeh" }; // particles and focus are per-SHOT → same style
  const groups = partition([painterly, near, cel, far, null, otherMedium, otherShot]);
  const flat = groups.flat().sort();
  expect(flat).toEqual([0, 1, 2, 3, 5, 6]); // the null (unread) source is not placed, nothing else is dropped or doubled
  expect(groups.find((g) => g.includes(0))).toEqual([0, 1, 6]);
  expect(groups.find((g) => g.includes(2))).toEqual([2]);
  expect(groups.find((g) => g.includes(3))).toEqual([3]);
  expect(groups.find((g) => g.includes(5))).toEqual([5]);
});

test("validateSynthesis: full coverage is accepted and normalised; a missing or doubled source is refused", () => {
  const ids = ["s01", "s02", "s03"];
  const good = {
    styles: [
      { id: "Painted Neon Noir", name: "Painted Neon Noir", family: "Game", members: ["s01", "s02"], ...painterly, recipe: "x".repeat(40), negative: "photo, grain" },
      { id: "soft-cel", name: "Soft Cel", family: "animation", members: ["s03"], ...cel, recipe: "y".repeat(40), negative: "text, watermark, photo" },
    ],
  };
  const ok = validateSynthesis(good, ids);
  expect("styles" in ok).toBe(true);
  if ("styles" in ok) {
    expect(ok.styles.map((s) => s.id)).toEqual(["painted-neon-noir", "soft-cel"]);
    expect(ok.styles[0].negative).toMatch(/text/); // the veto is always in the negative
    expect(ok.styles[0].family).toBe("game");
    expect(ok.styles[0].grouped_by).toBe("engine");
  }
  const missing = validateSynthesis({ styles: [good.styles[0]] }, ids);
  expect("error" in missing && missing.error).toMatch(/s03/);
  const doubled = validateSynthesis({ styles: [good.styles[0], { ...good.styles[1], members: ["s02", "s03"] }] }, ids);
  expect("error" in doubled && doubled.error).toMatch(/s02/);
  const badEnum = validateSynthesis({ styles: [{ ...good.styles[0], members: ids, render_mode: "watercolour" }] }, ids);
  expect("error" in badEnum && badEnum.error).toMatch(/render_mode/);
});

/* ── scoring ──────────────────────────────────────────────────────────────── */

test("styleScore: render_mode and medium count double; a null readback is unmeasured, not zero", () => {
  expect(styleScore(painterly, rb(painterly)).score).toBe(1);
  expect(styleScore(painterly, rb({ ...painterly, render_mode: "cel-shaded" })).score).toBe(0.846); // 11/13
  expect(styleScore(painterly, rb({ ...painterly, medium: "3d-render" })).score).toBe(0.846); // the medium slip the first live run missed
  expect(styleScore(painterly, rb({ ...painterly, edge_treatment: "crisp" })).score).toBe(0.923); // 12/13
  expect(styleScore(painterly, null).score).toBeNull();
  expect(usableFix({ ...rb(painterly), critique: "", recipe_fix: "short" }, "the recipe")).toBeNull();
  expect(usableFix({ ...rb(painterly), critique: "", recipe_fix: "The Recipe" }, "the recipe")).toBeNull(); // same words again
});

test("styleScore: a word OUTSIDE the vocabulary is unmeasured too — not a miss", () => {
  // The enum in READBACK_SCHEMA is a request, not a guarantee: the local engine
  // reports `enforcesSchema: false`, so a vision model may answer beside the
  // closed set. Scoring that as a miss is the same collapse a null readback is
  // already protected from — the field was not measured, and "unknown" is not
  // "wrong".
  const drifted = rb({ ...painterly, surface_realism: "semi-realistic" }); // not in ENUMS.surface_realism
  const scored = styleScore(painterly, drifted);
  console.log(`[foundry] off-vocabulary surface_realism -> score ${scored.score}, ${Object.keys(scored.per_field).length} field(s) measured`);
  // Every other field agrees, so what is left is a clean 12/12 rather than 12/13.
  expect(scored.score).toBe(1);
  // ...and the field that could not be read is ABSENT rather than recorded as a
  // zero, which is what stops a critique round chasing it.
  expect(scored.per_field.surface_realism).toBeUndefined();
  expect(Object.keys(scored.per_field).length).toBe(10);

  // A real disagreement is still a miss — the rule must not launder those.
  expect(styleScore(painterly, rb({ ...painterly, surface_realism: "flat" })).score).toBe(0.923);
  expect(styleScore(painterly, rb({ ...painterly, surface_realism: "flat" })).per_field.surface_realism).toBe(0);

  // A readback that drifted on EVERY field measures nothing, which is the
  // terminal answer the caller already knows how to read.
  const allDrifted = Object.fromEntries(Object.keys(painterly).map((f) => [f, "not-a-word"])) as typeof painterly;
  expect(styleScore(painterly, rb(allDrifted)).score).toBeNull();

  // The number decides things, which is why the collapse mattered: at the
  // default target of 0.85 the drifted readback settles the replica loop, and
  // scored as a miss it did not.
  expect(scored.score! >= 0.85).toBe(true);
});

/* ── the state machine ────────────────────────────────────────────────────── */

interface Script {
  /** Score a replica round will read back as, by round number. */
  roundScore: (round: number) => Observables;
  reasonFails?: boolean;
  /** Every generate throws — a bad parameter, an expired key. */
  generateFails?: boolean;
  /** The `recipe_fix` a critique comes back with, by round. Default is a real
   *  revision; return "" to script a critic that cannot say what to change. */
  recipeFix?: (round: number) => string;
  /** Singleton mode: the readback carries the style entry too. */
  singleton?: boolean;
}

function fakeIO(m: ExtractManifest, script: Script, calls: string[]): EngineIO {
  const images = new Map<string, string>();
  for (const s of m.sources) images.set(s.file, `src:${s.id}`);
  return {
    async readImage(rel) {
      const b = images.get(rel);
      if (!b) throw new Error(`no image at ${rel}`);
      return { base64: b, mime: "image/jpeg" };
    },
    async writeImage(rel, img) {
      images.set(rel, img.base64);
    },
    async recognize(img, _instruction, schema) {
      calls.push(`recognize:${img.base64}`);
      if (img.base64.startsWith("src:")) {
        // Sources s01/s02 are painterly, s03 is cel.
        const o = img.base64 === "src:s03" ? cel : painterly;
        const extra = script.singleton
          ? { style_name: `Look ${img.base64.slice(4)}`, recipe: `A 2D digital painting recipe written by the eye for ${img.base64.slice(4)}: ` + "airbrushed shading, warm-cool split, soft edges, painterly matte surfaces.", negative: "photo" }
          : {};
        return { value: { ...rb(o), ...extra }, model: "fake/eyes" };
      }
      // A generated image: scripted by the generate ordinal in its "pixels".
      const round = Number(/r(\d+)/.exec(img.base64)?.[1] ?? 1);
      const isCritique = schema === CRITIQUE_SCHEMA;
      const obs = script.roundScore(round);
      const fix = script.recipeFix ? script.recipeFix(round) : `Revised recipe ${round}: softer edges and heavier haze throughout the frame, matte brushwork.`;
      const value = isCritique ? { ...rb(obs), critique: "edges too crisp", recipe_fix: fix } : rb(obs);
      return { value, model: "fake/eyes" };
    },
    async generate(_prompt, _negative, aspect, seed) {
      if (script.generateFails) throw new Error("google returned 400: Unknown parameter 'seed'.");
      calls.push(`generate:${aspect}:${seed}`);
      // The "pixels" carry the generate call's ordinal, which is what the
      // scripted readback keys on.
      const n = calls.filter((c) => c.startsWith("generate:")).length;
      return { value: { base64: `gen:r${n}`, mime: "image/jpeg" }, model: "fake/pixels" };
    },
    async reason(_prompt, _schema) {
      calls.push("reason");
      if (script.reasonFails) throw new Error("engine down");
      return {
        value: {
          styles: [
            { id: "painted-haze", name: "Painted Haze", family: "game", members: ["s01", "s02"], ...painterly, recipe: "Painterly rendering with matte brushwork, heavy haze, one hard key, crushed blacks, soft edges.", negative: "photo" },
            { id: "flat-cel", name: "Flat Cel", family: "animation", members: ["s03"], ...cel, recipe: "Cel-shaded flat fills with crisp ink lines, saturated palette, no atmosphere, deep neutral blacks.", negative: "grain" },
          ],
        },
        model: "fake/words",
      };
    },
    async save() {},
    now: () => "2026-08-27T00:00:00.000Z",
  };
}

function manifest(opts: Partial<ExtractManifest["options"]> = {}): ExtractManifest {
  const src = (id: string, aspect: ExtractSource["aspect"]): ExtractSource => ({
    id,
    name: `${id}.jpg`,
    file: `sources/${id}.jpg`,
    mime: "image/jpeg",
    width: 1280,
    height: aspect === "9:16" ? 2276 : 720,
    aspect,
    readback: null,
    error: null,
  });
  return newManifest("2026-08-27-test", "test", [src("s01", "16:9"), src("s02", "9:16"), src("s03", "16:9")], { rounds: 2, replicas: 2, transfers: 1, ...opts }, "2026-08-27T00:00:00.000Z");
}

test("engine: reads every source, groups once, replicates per member with critique rounds, transfers, finishes — resumable at every unit", async () => {
  const m = manifest();
  const calls: string[] = [];
  // Every replica round reads back two observables short of the target (0.846 < 0.85) → a second round is taken; the cap ends it at 2.
  const io = fakeIO(m, { roundScore: () => ({ ...painterly, edge_treatment: "crisp", atmospherics: "none" }) }, calls);

  const units: string[] = [];
  await runToEnd(m, io, (r) => units.push(r.unit!));

  expect(m.status).toBe("done");
  expect(units.slice(0, 4)).toEqual(["read s01", "read s02", "read s03", "group into styles"]);
  expect(m.styles.map((s) => s.id)).toEqual(["painted-haze", "flat-cel"]);
  expect(m.styles[0].grouped_by).toBe("engine");
  // painted-haze has two members → two replicas × 2 rounds; flat-cel one member → one replica (replicas cap is 2, members are 1) × 2 rounds.
  const painted = m.styles[0];
  expect(painted.replicas.map((r) => r.source)).toEqual(["s01", "s02"]);
  expect(painted.replicas.every((r) => r.rounds.length === 2)).toBe(true);
  expect(m.styles[1].replicas.length).toBe(1);
  // Round 2 was generated with the critic's fix, and it is recorded in the history — but the recipe in force did not change, because the fix did not score higher.
  expect(painted.replicas[0].rounds[1].recipe).toMatch(/^Revised recipe/);
  expect(painted.recipe_history.length).toBeGreaterThan(1);
  expect(painted.recipe).toMatch(/^Painterly rendering/);
  // Aspect follows the SOURCE for a replica (s02 is portrait) and is 16:9 for a transfer.
  expect(calls.filter((c) => c.startsWith("generate:9:16")).length).toBe(2);
  expect(calls.filter((c) => c.startsWith("generate:16:9")).length).toBe(4 + 2); // s01 ×2, s03 ×2, transfers ×2
  expect(m.styles.every((s) => s.transfers.length === 1 && s.transfers[0].file)).toBe(true);
  // No unit taken after finish.
  expect(next(m)).toBeNull();
  expect((await step(m, io)).unit).toBeNull();
  // The words-only lane: the generator was never handed a reference (the IO has no such parameter, and the prompt carries the depiction).
  expect(painted.replicas[0].rounds[0].prompt).toMatch(/a lone figure on a ridge/);
  expect(painted.replicas[0].rounds[0].prompt).toMatch(/^Painterly rendering/); // style first
});

test("engine: a round at or over the target ends the loop early; the best-scoring recipe becomes the recipe in force", async () => {
  const m = manifest({ rounds: 3, replicas: 1 });
  const calls: string[] = [];
  // Round 1 misses two fields (0.846), round 2 is exact (1.0) → stop at 2 of 3.
  const io = fakeIO(m, { roundScore: (n) => (n % 2 === 1 ? { ...painterly, edge_treatment: "crisp", atmospherics: "none" } : painterly) }, calls);
  await runToEnd(m, io);
  const painted = m.styles[0];
  expect(painted.replicas[0].rounds.map((r) => r.score)).toEqual([0.846, 1]);
  expect(painted.recipe).toMatch(/^Revised recipe/); // the fix scored higher and was adopted
  expect(m.status).toBe("done");
});

test("engine: when the reasoning turn fails the deterministic partition stands and the run still completes", async () => {
  const m = manifest({ rounds: 1, replicas: 1, transfers: 0 });
  const calls: string[] = [];
  const io = fakeIO(m, { roundScore: () => painterly, reasonFails: true }, calls);
  await runToEnd(m, io);
  expect(m.status).toBe("done");
  expect(m.styles.length).toBe(2);
  expect(m.styles.every((s) => s.grouped_by === "partition")).toBe(true);
  expect(m.styles.flatMap((s) => s.members).sort()).toEqual(["s01", "s02", "s03"]);
  expect(m.styles[0].recipe.length).toBeGreaterThan(40);
  expect(m.log.some((l) => /partition stands/.test(l.msg))).toBe(true);
});

test("engine: three consecutive vendor failures trip the breaker — the run stops as failed instead of walking every unit; prune + resume takes them again", async () => {
  const m = manifest({ rounds: 2, replicas: 2, transfers: 1 });
  const calls: string[] = [];
  const script: Script = { roundScore: () => painterly, generateFails: true };
  const io = fakeIO(m, script, calls);
  await runToEnd(m, io);
  expect(m.status).toBe("failed");
  expect(m.error).toMatch(/consecutive vendor failures/);
  // Exactly BREAKER_LIMIT failed rounds exist — not one per remaining unit.
  const failedRounds = m.styles.flatMap((s) => s.replicas.flatMap((r) => r.rounds.filter((x) => !x.file)));
  expect(failedRounds.length).toBe(BREAKER_LIMIT);
  expect(m.styles.every((s) => s.transfers.length === 0)).toBe(true);
  expect(next(m)).toBeNull();
  expect(hasFailures(m)).toBe(true);

  // The cause is fixed; prune and resume. Every failed unit is taken again and the run completes.
  script.generateFails = false;
  const pruned = pruneFailures(m);
  expect(pruned).toBe(BREAKER_LIMIT);
  expect(m.status).toBe("replicating");
  expect(m.fail_streak).toBe(0);
  await runToEnd(m, io);
  expect(m.status).toBe("done");
  expect(hasFailures(m)).toBe(false);
  expect(m.styles.every((s) => s.transfers.length === 1 && s.transfers[0].file)).toBe(true);
  expect(m.styles[0].replicas.every((r) => r.rounds.length >= 1 && r.rounds[0].n === 1)).toBe(true);
});

test("progress: the strip can actually reach its total — replicas are counted at the real number, not at the ceiling", async () => {
  // `options.replicas` is a CEILING on how many members a style replicates. The
  // fixture's second style has ONE member, so it takes one replica however high
  // the ceiling is — and charging the strip for the ceiling made `done`
  // unreachable. Measured before the fix: the last real unit left the run at
  // 12 of 15, and `finish` then set them equal, so the longest stage of the run
  // read as a stall followed by a jump.
  const m = manifest();
  const io = fakeIO(m, { roundScore: () => ({ ...painterly, edge_treatment: "crisp", atmospherics: "none" }) }, []);

  let performed = 0;
  let lastDone = 0;
  let lastTotal = 0;
  for (;;) {
    const r = await step(m, io);
    if (r.unit === null || r.unit === "finish") break;
    performed++;
    lastDone = doneUnits(m);
    lastTotal = totalUnits(m);
    // The strip must never claim more work is done than the run will take.
    expect(lastDone).toBeLessThanOrEqual(lastTotal);
  }
  console.log(`[foundry] ${performed} unit(s) performed; strip stood at ${lastDone}/${lastTotal} before finish`);

  // `doneUnits` was always right: it equals what the engine actually did.
  expect(lastDone).toBe(performed);
  // And the only unit left uncounted at that moment is `finish` itself, so the
  // strip arrives at its total instead of jumping to it.
  expect(lastTotal - lastDone).toBe(1);
  expect(m.status).toBe("done");
  expect(m.progress.done).toBe(m.progress.total);
});

test("progress: before grouping the ceiling is still the estimate, because there are no members to count yet", () => {
  const m = manifest();
  expect(m.styles.length).toBe(0);
  // 3 reads + group + (2 replicas x 2 rounds + 1 transfer) + finish
  expect(totalUnits(m)).toBe(3 + 1 + (2 * 2 + 1) + 1);
});

/* ── why a replica stopped ────────────────────────────────────────────────── */

test("settleReason: four causes, two of which are the loop giving up — and the boolean could not tell them apart", async () => {
  const m = manifest();
  const opts = m.options; // rounds: 2, target: 0.85
  const recipe = "warm haze over crushed blacks, soft edges, painterly surfaces, muted warm-cool split";
  const round = (over: Partial<ReplicaRound>): ReplicaRound => ({
    n: 1, file: "r1.jpg", recipe, prompt: "p", critique: null, generator: "g", vision: "v", error: null,
    score: 0.5, per_field: {}, ...over,
  });
  const good = { ...rb(painterly), critique: "edges too crisp", recipe_fix: "Revised: softer edges and heavier haze throughout the frame, matte brushwork." };

  // Still running: a low score AND something concrete to try next.
  expect(settleReason(m, [])).toBeNull();
  expect(settleReason(m, [round({ critique: good })])).toBeNull();

  // The two OUTCOMES.
  expect(settleReason(m, [round({ score: 0.91 })])).toBe("target-met");
  expect(settleReason(m, [round({ critique: good }), round({ n: 2, critique: good })])).toBe("round-cap");

  // The two ABANDONMENTS — the loop stopped because it could not proceed.
  expect(settleReason(m, [round({ file: null, error: "provider refused", score: null })])).toBe("generation-failed");
  expect(settleReason(m, [round({ critique: { ...good, recipe_fix: "" } })])).toBe("no-usable-fix");
  // ...including a critic that answers with the recipe it was already given,
  // which would spend a round to learn nothing.
  expect(settleReason(m, [round({ critique: { ...good, recipe_fix: recipe } })])).toBe("no-usable-fix");

  expect(opts.rounds).toBe(2);
});

test("a replica the critic gave up on is marked in the run, not laundered into a clean stop", async () => {
  // The critic reads back short of the target every round AND has nothing to
  // propose. Before `settleReason` existed the loop stopped here exactly as it
  // does now — correctly — and nothing anywhere recorded that it had given up,
  // so the replica's best frame went into the catalogue as an exemplar of a
  // working recipe.
  const m = manifest();
  const io = fakeIO(m, {
    roundScore: () => ({ ...painterly, edge_treatment: "crisp", atmospherics: "none" }), // 0.8 < 0.85
    recipeFix: () => "",
  }, []);
  await runToEnd(m, io);
  expect(m.status).toBe("done");

  const reasons = m.styles.flatMap((s) => s.replicas.map((r) => settleReason(m, r.rounds)));
  const abandoned = reasons.filter((r) => r === "no-usable-fix").length;
  console.log(`[foundry] ${reasons.length} replica(s) settled: ${reasons.join(", ")}`);

  // Every replica stopped after ONE round rather than taking its two, because
  // the critique carried nothing to try — and every one of them is now legible
  // as an abandonment rather than as a stop.
  expect(abandoned).toBe(reasons.length);
  expect(abandoned).toBeGreaterThan(0);
  for (const s of m.styles) for (const r of s.replicas) expect(r.rounds.length).toBe(1);

  /* ── the paired arm ─────────────────────────────────────────────────────
   * A second run, same scores, same target, the ONLY difference being that
   * the critic can say what to change. It walks both rounds and stops at the
   * cap having never arrived. Both runs therefore end with every replica
   * BELOW target — which is what makes the score a useless discriminator.
   *
   *   arm A (what a consumer could do before): infer from the score.
   *   arm B (the settle reason): read it.
   */
  const capped = manifest();
  await runToEnd(capped, fakeIO(capped, { roundScore: () => ({ ...painterly, edge_treatment: "crisp", atmospherics: "none" }) }, []));
  const cappedReasons = capped.styles.flatMap((s) => s.replicas.map((r) => settleReason(capped, r.rounds)));

  const belowTarget = (mm: ExtractManifest) =>
    mm.styles.flatMap((s) => s.replicas).filter((r) => (Math.max(...r.rounds.map((x) => x.score ?? -1))) < mm.options.target).length;

  // ARM A — the score proxy gives the SAME answer for both runs.
  expect(belowTarget(m)).toBe(belowTarget(capped));
  // ARM B — the reason separates them cleanly.
  expect(new Set(reasons)).toEqual(new Set(["no-usable-fix"]));
  expect(new Set(cappedReasons)).toEqual(new Set(["round-cap"]));

  console.log(
    `[foundry] arm A (score<target): gave-up run ${belowTarget(m)}, capped run ${belowTarget(capped)} — indistinguishable. ` +
    `arm B (settle reason): ${new Set(reasons).size} vs ${new Set(cappedReasons).size} distinct cause(s), ` +
    `${reasons.length} of ${reasons.length} replicas classified.`,
  );
});

test("nearDuplicates: styles one minor field apart are flagged as twins; a major-field or two-minor difference is not", () => {
  const a = { id: "a", observables: painterly };
  const b = { id: "b", observables: { ...painterly, black_handling: "deep-neutral" } }; // one minor field
  const c = { id: "c", observables: { ...painterly, medium: "3d-render" } }; // a major field
  const d = { id: "d", observables: { ...painterly, black_handling: "deep-neutral", focus: "shallow-bokeh" } }; // two minors
  expect(nearDuplicates([a, b, c, d])).toEqual([
    ["a", "b"],
    ["b", "d"], // b and d differ only in focus — one minor field
  ]);
});

test("singleton mode: no grouping, no reasoning turn — one style per source with the eye-written recipe; unique ids; the twin flags still fire", async () => {
  const m = manifest({ rounds: 1, replicas: 1, transfers: 0 });
  m.options.grouping = "none";
  const calls: string[] = [];
  const io = fakeIO(m, { roundScore: () => painterly, singleton: true }, calls);
  await runToEnd(m, io);
  expect(m.status).toBe("done");
  expect(calls.filter((c) => c === "reason").length).toBe(0); // the whole point
  expect(m.styles.length).toBe(3);
  expect(m.styles.every((s) => s.grouped_by === "singleton" && s.members.length === 1)).toBe(true);
  expect(m.styles.map((s) => s.members[0])).toEqual(["s01", "s02", "s03"]);
  expect(m.styles[0].recipe).toMatch(/^A 2D digital painting recipe written by the eye/);
  // s01 and s02 share a style_name pattern but ids stay unique.
  expect(new Set(m.styles.map((s) => s.id)).size).toBe(3);
  // s01 and s02 are identical observables → flagged as twins; cel s03 is not.
  expect(m.styles[0].similar_to).toEqual([m.styles[1].id]);
  expect(m.styles[2].similar_to).toBeUndefined();
});

test("deriveFamily: every medium/render combination lands in a browse bucket; singleton styles carry it", async () => {
  expect(deriveFamily({ medium: "photograph" })).toBe("photo");
  expect(deriveFamily({ medium: "line-drawing" })).toBe("graphic");
  expect(deriveFamily({ medium: "2d-digital-painting", render_mode: "painterly" })).toBe("painterly");
  expect(deriveFamily({ medium: "2d-digital-painting", render_mode: "stylised-realistic" })).toBe("illustration");
  expect(deriveFamily({ medium: "3d-render", render_mode: "photoreal-cg" })).toBe("cinematic");
  expect(deriveFamily({ medium: "3d-render", render_mode: "cel-shaded" })).toBe("animation");
  expect(deriveFamily({})).toBe("unsorted");
  const m = manifest({ rounds: 1, replicas: 1, transfers: 0 });
  m.options.grouping = "none";
  await runToEnd(m, fakeIO(m, { roundScore: () => painterly, singleton: true }, []));
  expect(m.styles.map((s) => s.family)).toEqual(["painterly", "painterly", "illustration"]);
});
