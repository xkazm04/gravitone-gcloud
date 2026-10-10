// THE ENGINE — one bounded unit of work per call, and a manifest that is the
// only state.
//
// WHY A STEP MACHINE AND NOT A LOOP. This module runs in two postures: on an
// operator's laptop, where the CLI (pipeline/foundry/extract.mts) can loop
// for an hour; and on Cloud Run, where a request handler has a duration
// ceiling and no background thread survives the response. The forge solves
// the same problem by being a Python process the page merely watches. There
// is no Python on Cloud Run, so the equivalent here is: the manifest on disk
// says what has been done, `next()` says what the next unit is, `perform()`
// does exactly one — one readback, one synthesis turn, one generate+critique
// round, one transfer — and writes the manifest back. The browser calls
// /step until `unit` is null; the CLI calls step() in a loop. Same code, same
// order, same files, and a run killed halfway resumes at its next unit.
//
// WHAT CROSSES OVER IS WORDS. A replica is generated from the recipe plus the
// source's `depiction` — never with the source as a reference image. A
// reference would let the generator copy the look off the pixels and the run
// would prove nothing about the RECIPE, which is the thing being extracted.
// (The forge's ref-early lane is the deliberate exception, and it is a
// different question.)
//
// THE CRITIQUE LOOP is readback → score → recipe_fix → regenerate, capped by
// `options.rounds` and cut short by `options.target`. The recipe in force is
// whichever round scored best; a fix that did not improve the score is kept in
// `recipe_history` and not adopted, so a wandering critic cannot walk a good
// recipe away from the look.
//
// SERVER ONLY, but through an IO interface so a test can drive it with fakes
// — the state machine's order is the thing worth pinning, and it is the same
// whether the images are real.

import type { Aspect, CostBasis, ImageRef } from "@/lib/imaging/types";

import { NO_TEXT, TRANSFER_SCENES, critiqueInstruction, readbackInstruction, replicaPrompt, singletonInstruction, synthesisPrompt, transferPrompt } from "./prompts";
import type {
  Critique,
  SettleReason,
  ExtractManifest,
  ExtractOptions,
  ExtractStop,
  ExtractedStyle,
  Observables,
  Readback,
  ReplicaRound,
  SpendStage,
  StepResult,
  Transfer,
} from "./types";
import { OBSERVABLE_FIELDS } from "./types";
import { CRITIQUE_SCHEMA, READBACK_SCHEMA, SINGLETON_SCHEMA, SYNTHESIS_SCHEMA, deriveFamily, fallbackStyle, nearDuplicates, partition, slugify, styleScore, usableFix, validateSynthesis } from "./vocabulary";

/* ── The IO the engine needs, and nothing more ────────────────────────────── */

export interface Served<T> {
  value: T;
  /** Which model served, for the manifest's `engines` block. */
  model: string;
  /** What the call cost, from the serving provenance. Undefined is UNPRICED,
   *  never free: the engine books the call's pre-call estimate instead. */
  costUsd?: number;
  /** How to read `costUsd` (lib/imaging/types.ts CostBasis). */
  basis?: CostBasis;
}

/** The three vendor calls a unit can make, priced separately. */
export type CallKind = "recognize" | "generate" | "reason";

/** Pre-call estimates when the IO declares none: what the ceiling compares
 *  against before a unit starts, and what an unpriced call is booked at. */
export const DEFAULT_CALL_ESTIMATE_USD: Readonly<Record<CallKind, number>> = { recognize: 0.002, generate: 0.04, reason: 0.01 };

/** Largest per-run ceiling accepted; anything above is clamped to it. */
export const MAX_CEILING_USD = 10_000;

export interface EngineIO {
  /** Read a run-relative image. */
  readImage(rel: string): Promise<ImageRef>;
  /** Write a run-relative image; returns nothing, the path is the caller's. */
  writeImage(rel: string, img: ImageRef): Promise<void>;
  /** Vision: an image and an instruction → JSON satisfying `schema`. */
  recognize(img: ImageRef, instruction: string, schema: Record<string, unknown>): Promise<Served<unknown>>;
  /** Generation: words → one image. Never given references here. */
  generate(prompt: string, negative: string, aspect: Aspect, seed: number): Promise<Served<ImageRef>>;
  /** Reasoning: a prompt → JSON satisfying `schema`. */
  reason(prompt: string, schema: Record<string, unknown>): Promise<Served<unknown>>;
  /** The pre-call estimate for one call of this kind, in USD. Optional; the
   *  engine falls back to DEFAULT_CALL_ESTIMATE_USD. */
  estimateUsd?(kind: CallKind): number | undefined;
  /** Persist the manifest. Called after every unit. */
  save(m: ExtractManifest): Promise<void>;
  now(): string;
}

export const DEFAULT_OPTIONS: ExtractOptions = {
  rounds: 2,
  replicas: 2,
  transfers: 1,
  target: 0.85,
  seed: 20260827,
  grouping: "engine",
};

/* ── The driver lease ─────────────────────────────────────────────────────── */

/** How long a driver's stamp is trusted. A unit is at most one generate
 *  (≤180 s) plus one recognise (≤120 s); a stamp older than this belongs to a
 *  driver that died mid-unit, and the run may be taken over. */
export const LEASE_TTL_MS = 6 * 60_000;

/** The lease currently in force, or null when there is none, it has expired,
 *  or the run is finished. Pure; the client reads it too. */
export function activeLease(m: ExtractManifest, nowMs: number): { owner: string; at: string } | null {
  if (!m.lease) return null;
  if (m.status === "done" || m.status === "failed" || m.status === "committed") return null;
  const at = Date.parse(m.lease.at);
  if (!Number.isFinite(at) || nowMs - at > LEASE_TTL_MS) return null;
  return m.lease;
}

/** Is someone ELSE driving this run right now? */
export function foreignLease(m: ExtractManifest, owner: string, nowMs: number): { owner: string; at: string } | null {
  const l = activeLease(m, nowMs);
  return l && l.owner !== owner ? l : null;
}

/* ── The circuit breaker ──────────────────────────────────────────────────── */

/** Consecutive vendor failures before the run stops. Three, because one is a
 *  refused frame (normal), two is bad luck, and three in a row is a wall —
 *  a bad parameter, an expired key — that every further unit would also hit.
 *
 *  A BUDGET CEILING IS NOT ONE OF THEM. It used to be named here, and an
 *  `over-budget` refusal went through tripped() like any vendor throw: an
 *  errored round appended, the streak bumped, and after three the run read
 *  "3 consecutive vendor failures". A refusal by our own meter is a named
 *  stop (`stopFor`, `m.stopped`), never a failure; see the spend section. */
export const BREAKER_LIMIT = 3;

function tripped(m: ExtractManifest, io: EngineIO, what: string): boolean {
  m.fail_streak = (m.fail_streak ?? 0) + 1;
  if (m.fail_streak < BREAKER_LIMIT) return false;
  m.status = "failed";
  m.error = `${BREAKER_LIMIT} consecutive vendor failures; the last: ${what}. Fix the cause, then retry — the failed units are pruned and taken again.`;
  log(m, io, `stopped: ${m.error}`);
  return true;
}

/** Drop every failed element so a retry takes it again: unread sources,
 *  rounds that produced no file, transfers that produced no file. A round
 *  whose image exists but whose critique failed is kept — the pixels cost
 *  money and the critique is retried by the next round's logic only if the
 *  loop is still open. Returns how many were pruned; resets the breaker and
 *  puts the run back in a live stage.
 *
 *  A run with NOTHING to prune is left exactly as it was. This used to fall
 *  through regardless — a clean `done` run lost its `finished` stamp, went
 *  back to `replicating`, and finished a second time with a second "done"
 *  line, while stepRun's comment called the retry a no-op. Zero pruned means
 *  zero touched. */
export function pruneFailures(m: ExtractManifest): number {
  let n = 0;
  for (const s of m.sources)
    if (s.error && !s.readback) {
      s.error = null;
      n++;
    }
  for (const st of m.styles) {
    for (const r of st.replicas) {
      const before = r.rounds.length;
      r.rounds = r.rounds.filter((x) => x.file);
      r.rounds.forEach((x, i) => (x.n = i + 1));
      n += before - r.rounds.length;
    }
    st.replicas = st.replicas.filter((r) => r.rounds.length);
    const before = st.transfers.length;
    st.transfers = st.transfers.filter((t) => t.file);
    n += before - st.transfers.length;
  }
  // A MONEY STOP leaves nothing to prune — a run-ceiling stop is taken before
  // the unit starts, and a period-ceiling refusal leaves no errored element —
  // so `stopped` is itself a resumable state, cleared here.
  if (n === 0 && !m.stopped) return 0;
  delete m.stopped;
  m.fail_streak = 0;
  delete m.error;
  delete m.finished;
  if (m.status === "failed" || m.status === "done") m.status = m.styles.length ? "replicating" : "reading";
  m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
  return n;
}

/* ── Spend ────────────────────────────────────────────────────────────────── */

/** Micro-dollar rounding, so a ceiling of $0.10 is not crossed by 1e-17. */
const usd6 = (x: number) => Math.round(x * 1e6) / 1e6;

function callEstimate(io: EngineIO, kind: CallKind): number {
  const v = io.estimateUsd?.(kind);
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_CALL_ESTIMATE_USD[kind];
}

/** What a unit is expected to cost before it starts: the calls it makes. */
function unitEstimate(m: ExtractManifest, u: Unit, io: EngineIO): number {
  switch (u.kind) {
    case "read":
      return callEstimate(io, "recognize");
    case "group":
      return m.options.grouping === "none" ? 0 : callEstimate(io, "reason");
    case "replica":
    case "transfer":
      return usd6(callEstimate(io, "generate") + callEstimate(io, "recognize"));
    case "finish":
      return 0;
  }
}

/** Book one SERVED call under its stage. A call with no cost books its
 *  estimate and is counted unpriced; a refused or failed call was not served
 *  and books nothing. */
function book(m: ExtractManifest, io: EngineIO, stage: SpendStage, kind: CallKind, s: Served<unknown>) {
  const sp = (m.spend ??= { usd: 0, by_stage: {}, unpriced: 0, basis: "reported" });
  let usd = s.costUsd;
  let estimated = s.basis === "estimated";
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) {
    usd = callEstimate(io, kind);
    sp.unpriced++;
    estimated = true;
  }
  if (estimated) sp.basis = "estimate";
  sp.usd = usd6(sp.usd + usd);
  sp.by_stage[stage] = usd6((sp.by_stage[stage] ?? 0) + usd);
}

/** An `over-budget` refusal from the imaging meter (lib/imaging/errors.ts).
 *  Matched by kind, not class, so the engine stays free of the vendor layer. */
const isOverBudget = (e: unknown) => !!e && typeof e === "object" && (e as { kind?: unknown }).kind === "over-budget";

/** Stop the run for money. Not a failure: the breaker is left alone. */
function stopFor(m: ExtractManifest, io: EngineIO, by: ExtractStop["by"], detail: string) {
  m.status = "failed";
  m.stopped = { by, spentUsd: m.spend?.usd ?? 0, ...(by === "run-ceiling" && m.options.ceilingUsd !== undefined ? { ceilingUsd: m.options.ceilingUsd } : {}), at: io.now() };
  m.error = detail;
  log(m, io, `stopped: ${detail}`);
}

/** Clamp a requested per-run ceiling; undefined (unlimited) for anything that
 *  is not a positive finite number. */
export function clampCeiling(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(MAX_CEILING_USD, v) : undefined;
}

/* ── Units ────────────────────────────────────────────────────────────────── */

export type Unit =
  | { kind: "read"; source: string }
  | { kind: "group" }
  | { kind: "replica"; style: string; source: string; round: number }
  | { kind: "transfer"; style: string; scene: number }
  | { kind: "finish" };

export const unitLabel = (u: Unit): string => {
  switch (u.kind) {
    case "read":
      return `read ${u.source}`;
    case "group":
      return "group into styles";
    case "replica":
      return `replicate ${u.style} on ${u.source}, round ${u.round}`;
    case "transfer":
      return `transfer ${u.style} onto scene ${u.scene + 1}`;
    case "finish":
      return "finish";
  }
};

function log(m: ExtractManifest, io: EngineIO, msg: string) {
  m.log.push({ at: io.now(), msg });
  if (m.log.length > 400) m.log.splice(0, m.log.length - 400);
}

/** Which sources a style replicates: its members in order, capped. */
function replicaSources(m: ExtractManifest, s: ExtractedStyle): string[] {
  return s.members.filter((id) => m.sources.find((x) => x.id === id)?.readback).slice(0, m.options.replicas);
}

/** WHY this replica's loop ended, or null while it is still running.
 *
 *  Same order and same conditions `replicaSettled` has always used — this
 *  function only stops throwing the reason away. A settled replica is settled
 *  for one of four reasons and two of them are the loop giving up; nothing
 *  downstream could tell them apart while this returned a boolean. */
export function settleReason(m: ExtractManifest, rounds: ReplicaRound[]): SettleReason | null {
  if (!rounds.length) return null;
  if (rounds.length >= m.options.rounds) return "round-cap";
  const last = rounds[rounds.length - 1];
  if (last.error && !last.file) return "generation-failed"; // do not burn rounds on a refusal
  if (typeof last.score === "number" && last.score >= m.options.target) return "target-met";
  if (!usableFix(last.critique, last.recipe)) return "no-usable-fix";
  return null;
}

/** Has this replica's loop ended? Either the round cap was reached, the
 *  target was met, or the last round produced no usable fix to try.
 *
 *  Deliberately unchanged in behaviour: the scheduler and the progress strip
 *  both want "will more work happen here", and for that question an abandoned
 *  replica is as finished as a successful one. */
function replicaSettled(m: ExtractManifest, rounds: ReplicaRound[]): boolean {
  return settleReason(m, rounds) !== null;
}

/** The next unit of work, or null when the run is finished. Pure over the
 *  manifest — this is the order a test pins. */
export function next(m: ExtractManifest): Unit | null {
  if (m.status === "done" || m.status === "failed" || m.status === "committed") return null;

  for (const s of m.sources) if (!s.readback && !s.error) return { kind: "read", source: s.id };
  if (!m.sources.some((s) => s.readback)) return { kind: "finish" }; // nothing readable: finish as failed
  if (!m.styles.length) return { kind: "group" };

  for (const st of m.styles) {
    for (const src of replicaSources(m, st)) {
      const rep = st.replicas.find((r) => r.source === src);
      if (!rep || !replicaSettled(m, rep.rounds)) return { kind: "replica", style: st.id, source: src, round: (rep?.rounds.length ?? 0) + 1 };
    }
  }
  for (const st of m.styles) {
    for (let k = 0; k < Math.min(m.options.transfers, TRANSFER_SCENES.length); k++) {
      if (!st.transfers.some((t) => t.scene === k)) return { kind: "transfer", style: st.id, scene: k };
    }
  }
  return { kind: "finish" };
}

/** Total units the run will take, for the progress strip. Replica ROUNDS are
 *  counted at their cap — a loop that meets the target early takes fewer, and
 *  `doneUnits` credits the cap for a settled replica, so the strip may finish
 *  early and never late.
 *
 *  REPLICAS THEMSELVES ARE COUNTED AT THE REAL NUMBER, not at the cap, and that
 *  is the half this used to get wrong. `options.replicas` is a CEILING on how
 *  many members a style replicates; a style with one member replicates once
 *  however high the ceiling is (`replicaSources`). Multiplying by the ceiling
 *  charged the strip for rounds nothing would ever take, so `done` could not
 *  reach `total` — measured on the probe's own fixture, the run stalled at 12 of
 *  15 and then jumped to 15 of 15 when `finish` set them equal. Under-reporting
 *  and then snapping is the specific dishonesty a progress strip must not have:
 *  it reads as a stall on the longest, most expensive stage.
 *
 *  Before grouping there is no member list to count, so the ceiling IS the only
 *  honest estimate and one style is the floor — that branch is unchanged. */
export function totalUnits(m: ExtractManifest): number {
  const reads = m.sources.length;
  const transfers = Math.min(m.options.transfers, TRANSFER_SCENES.length);
  if (!m.styles.length) return reads + 1 + (m.options.replicas * m.options.rounds + transfers) + 1;
  let work = 0;
  for (const st of m.styles) work += replicaSources(m, st).length * m.options.rounds + transfers;
  return reads + 1 + work + 1;
}

export function doneUnits(m: ExtractManifest): number {
  let n = m.sources.filter((s) => s.readback || s.error).length;
  if (m.styles.length) n += 1;
  for (const st of m.styles) {
    for (const r of st.replicas) n += replicaSettled(m, r.rounds) ? m.options.rounds : r.rounds.length;
    n += st.transfers.length;
  }
  return n;
}

/* ── Perform ──────────────────────────────────────────────────────────────── */

const isReadback = (v: unknown): v is Readback => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return OBSERVABLE_FIELDS.every((f) => typeof o[f] === "string") && typeof o.look === "string" && typeof o.depiction === "string";
};

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function setStage(m: ExtractManifest, stage: ExtractManifest["status"]) {
  m.status = stage;
  m.progress = { stage, done: doneUnits(m), total: totalUnits(m) };
}

/** Perform ONE unit and save. Returns what was done; `unit: null` means the
 *  run was already finished. Never throws for a vendor failure — that is
 *  recorded on the element and the run moves on, because a gallery of forty
 *  with one refused frame is a run of thirty-nine, not a failed run. */
export async function step(m: ExtractManifest, io: EngineIO): Promise<StepResult> {
  const unit = next(m);
  if (!unit) return { unit: null, status: m.status, progress: m.progress };

  // THE RUN CEILING. Checked before the unit starts, against its estimate: a
  // unit that would cross the line is not taken, so nothing is spent past it.
  const ceiling = m.options.ceilingUsd;
  if (ceiling !== undefined) {
    const est = unitEstimate(m, unit, io);
    const spent = m.spend?.usd ?? 0;
    if (est > 0 && usd6(spent + est) > ceiling) {
      stopFor(m, io, "run-ceiling", `Run ceiling reached: $${spent.toFixed(4)} of $${ceiling.toFixed(2)} spent, and ${unitLabel(unit)} is estimated at $${est.toFixed(4)}. Raise the ceiling and retry to continue.`);
      m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
      await io.save(m);
      return { unit: null, status: m.status, progress: m.progress };
    }
  }

  switch (unit.kind) {
    case "read": {
      setStage(m, "reading");
      const s = m.sources.find((x) => x.id === unit.source)!;
      const singleton = m.options.grouping === "none";
      try {
        const img = await io.readImage(s.file);
        const r = await io.recognize(img, singleton ? singletonInstruction() : readbackInstruction(), singleton ? SINGLETON_SCHEMA : READBACK_SCHEMA);
        book(m, io, "read", "recognize", r);
        if (!isReadback(r.value)) throw new Error("the readback did not carry every observable");
        s.readback = { ...r.value, dominant_colours: Array.isArray(r.value.dominant_colours) ? r.value.dominant_colours.slice(0, 5).map(String) : [] };
        m.engines.vision = r.model;
        log(m, io, `read ${s.id} (${s.name}): ${s.readback.render_mode}, ${s.readback.palette_strategy}`);
      } catch (e) {
        if (isOverBudget(e)) {
          stopFor(m, io, "period-ceiling", `The spend window refused ${unitLabel(unit)}: ${msg(e)}`);
          break;
        }
        s.error = msg(e);
        log(m, io, `read ${s.id} failed: ${s.error}`);
        if (tripped(m, io, s.error)) break;
        m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
        await io.save(m);
        return { unit: unitLabel(unit), status: m.status, progress: m.progress };
      }
      m.fail_streak = 0;
      break;
    }

    case "group": {
      setStage(m, "grouping");
      const readable = m.sources.filter((s) => s.readback) as { id: string; readback: Readback; name: string }[];
      if (m.options.grouping === "none") {
        // NO GROUPING: one style per readable source, entry written by the
        // vision model at read time. No reasoning turn at all.
        const ids = new Set<string>();
        m.styles = readable.map((s) => {
          let id = slugify(s.readback.style_name || s.readback.render_mode || "style") || "style";
          if (ids.has(id)) id = `${id}-${s.id}`;
          while (ids.has(id)) id = `${id}-x`;
          ids.add(id);
          const obs = {} as Observables;
          for (const f of OBSERVABLE_FIELDS) obs[f] = s.readback[f];
          const fb = fallbackStyle(0, [{ id: s.id, readback: s.readback }]);
          const recipe = s.readback.recipe && s.readback.recipe.trim().length >= 40 ? s.readback.recipe.trim() : fb.recipe;
          const negative = s.readback.negative?.trim() || fb.negative;
          return {
            id,
            name: s.readback.style_name?.trim() || fb.name,
            family: deriveFamily(obs),
            members: [s.id],
            observables: obs,
            recipe,
            negative: /\btext\b/i.test(negative) ? negative : `${negative}, text, watermark`,
            recipe_history: [recipe],
            grouped_by: "singleton" as const,
            replicas: [],
            transfers: [],
          };
        });
        log(m, io, `no grouping: ${m.styles.length} singleton style(s), entries written by the eye`);
        break;
      }
      const groups = partition(readable.map((s) => s.readback));
      const hint = groups.map((g) => g.map((i) => readable[i].id));
      let styles: Omit<ExtractedStyle, "replicas" | "transfers">[] | null = null;
      try {
        const r = await io.reason(synthesisPrompt(readable, hint), SYNTHESIS_SCHEMA);
        book(m, io, "group", "reason", r);
        m.engines.reasoner = r.model;
        const v = validateSynthesis(r.value, readable.map((s) => s.id));
        if ("styles" in v) {
          styles = v.styles;
          log(m, io, `grouped by the engine into ${styles.length} style(s): ${styles.map((s) => `${s.id} (${s.members.length})`).join(", ")}`);
        } else {
          log(m, io, `the engine's grouping was unusable (${v.error}); the partition stands`);
        }
      } catch (e) {
        log(m, io, `synthesis failed (${msg(e)}); the partition stands`);
      }
      if (!styles) {
        styles = groups.map((g, i) => fallbackStyle(i, g.map((k) => readable[k])));
        log(m, io, `partitioned into ${styles.length} style(s)`);
      }
      m.styles = styles.map((s) => ({ ...s, replicas: [], transfers: [] }));
      break;
    }

    case "replica": {
      setStage(m, "replicating");
      const st = m.styles.find((x) => x.id === unit.style)!;
      const src = m.sources.find((x) => x.id === unit.source)!;
      let rep = st.replicas.find((r) => r.source === unit.source);
      if (!rep) {
        rep = { source: unit.source, rounds: [] };
        st.replicas.push(rep);
      }
      // The recipe this round tries: the previous round's fix when there was
      // one, else the recipe in force.
      const prev = rep.rounds[rep.rounds.length - 1];
      const recipe = (prev && usableFix(prev.critique, prev.recipe)) || st.recipe;
      const prompt = replicaPrompt(recipe, src.readback!.depiction);
      const file = `styles/${st.id}/replica-${src.id}-r${unit.round}.jpg`;
      const round: ReplicaRound = {
        n: unit.round,
        file: null,
        recipe,
        prompt,
        critique: null,
        score: null,
        per_field: {},
        generator: null,
        vision: null,
        error: null,
      };
      rep.rounds.push(round);
      const seed = m.options.seed + hash(`${st.id}/${src.id}`) * 10 + unit.round;
      try {
        const g = await io.generate(prompt, st.negative, src.aspect, seed);
        book(m, io, "replica", "generate", g);
        await io.writeImage(file, g.value);
        round.file = file;
        round.generator = g.model;
        m.engines.generator = g.model;
      } catch (e) {
        if (isOverBudget(e)) {
          // Nothing was drawn and nothing billed: the round is withdrawn, not
          // left behind as an errored one for a retry to prune.
          rep.rounds.pop();
          if (!rep.rounds.length) st.replicas.splice(st.replicas.indexOf(rep), 1);
          stopFor(m, io, "period-ceiling", `The spend window refused ${unitLabel(unit)}: ${msg(e)}`);
          break;
        }
        round.error = `generate: ${msg(e)}`;
        log(m, io, `${unitLabel(unit)} — ${round.error}`);
        tripped(m, io, round.error);
        break;
      }
      try {
        const img = await io.readImage(file);
        const c = await io.recognize(img, critiqueInstruction(st, recipe), CRITIQUE_SCHEMA);
        book(m, io, "replica", "recognize", c);
        if (!isReadback(c.value)) throw new Error("the critique did not carry every observable");
        round.critique = c.value as Critique;
        round.vision = c.model;
        const sc = styleScore(st.observables, round.critique);
        round.score = sc.score;
        round.per_field = sc.per_field;
        if (!st.recipe_history.includes(recipe)) st.recipe_history.push(recipe);
        // Adopt the recipe that scored best across every round of every
        // replica of this style — the recipe in force is a measurement.
        const best = bestRound(st);
        if (best && best.recipe !== st.recipe && (best.score ?? 0) > (scoreOf(st, st.recipe) ?? -1)) st.recipe = best.recipe;
        log(m, io, `${unitLabel(unit)}: ${Math.round((round.score ?? 0) * 100)}%${round.critique.has_text ? " TEXT" : ""}${round.critique.critique ? ` — ${round.critique.critique.slice(0, 90)}` : ""}`);
        m.fail_streak = 0;
      } catch (e) {
        round.error = `critique: ${msg(e)}`;
        log(m, io, `${unitLabel(unit)} — ${round.error}`);
        // The pixels exist and are kept; a refused critique stops, not trips.
        if (isOverBudget(e)) stopFor(m, io, "period-ceiling", `The spend window refused the critique of ${unitLabel(unit)}: ${msg(e)}`);
        else tripped(m, io, round.error);
      }
      break;
    }

    case "transfer": {
      setStage(m, "transferring");
      const st = m.styles.find((x) => x.id === unit.style)!;
      const brief = TRANSFER_SCENES[unit.scene];
      const prompt = transferPrompt(st.recipe, brief);
      const file = `styles/${st.id}/transfer-${unit.scene + 1}.jpg`;
      const t: Transfer = { scene: unit.scene, brief, file: null, prompt, readback: null, score: null, per_field: {}, generator: null, vision: null, error: null };
      st.transfers.push(t);
      const seed = m.options.seed + hash(`${st.id}/transfer`) * 10 + unit.scene;
      try {
        const g = await io.generate(prompt, st.negative, "16:9", seed);
        book(m, io, "transfer", "generate", g);
        await io.writeImage(file, g.value);
        t.file = file;
        t.generator = g.model;
      } catch (e) {
        if (isOverBudget(e)) {
          st.transfers.pop();
          stopFor(m, io, "period-ceiling", `The spend window refused ${unitLabel(unit)}: ${msg(e)}`);
          break;
        }
        t.error = `generate: ${msg(e)}`;
        log(m, io, `${unitLabel(unit)} — ${t.error}`);
        tripped(m, io, t.error);
        break;
      }
      try {
        const img = await io.readImage(file);
        const r = await io.recognize(img, readbackInstruction(), READBACK_SCHEMA);
        book(m, io, "transfer", "recognize", r);
        if (!isReadback(r.value)) throw new Error("the readback did not carry every observable");
        t.readback = r.value;
        t.vision = r.model;
        const sc = styleScore(st.observables, t.readback);
        t.score = sc.score;
        t.per_field = sc.per_field;
        log(m, io, `${unitLabel(unit)}: ${Math.round((t.score ?? 0) * 100)}%${t.readback.has_text ? " TEXT" : ""}`);
        m.fail_streak = 0;
      } catch (e) {
        t.error = `readback: ${msg(e)}`;
        log(m, io, `${unitLabel(unit)} — ${t.error}`);
        if (isOverBudget(e)) stopFor(m, io, "period-ceiling", `The spend window refused the readback of ${unitLabel(unit)}: ${msg(e)}`);
        else tripped(m, io, t.error);
      }
      break;
    }

    case "finish": {
      const readable = m.sources.filter((s) => s.readback).length;
      if (!readable) {
        m.status = "failed";
        m.error = "No source could be read back.";
      } else {
        m.status = "done";
        // The convergence warning: styles whose declared observables sit
        // within one minor field of each other will come back from the
        // generator as twins. The synthesis rules try to prevent this; when
        // they fail, say so where the cull will read it.
        //
        // A run can FINISH MORE THAN ONCE — a retry prunes failed units and
        // walks back here — and this used to append the pair on every pass,
        // so a run retried twice carried `similar_to: [b, b, b]` and three
        // copies of the warning in its log. The pair is recorded once.
        for (const [a, b] of nearDuplicates(m.styles)) {
          const sa = m.styles.find((s) => s.id === a)!;
          const sb = m.styles.find((s) => s.id === b)!;
          const fresh = !(sa.similar_to ?? []).includes(b);
          sa.similar_to = [...new Set([...(sa.similar_to ?? []), b])];
          sb.similar_to = [...new Set([...(sb.similar_to ?? []), a])];
          if (fresh) log(m, io, `warning: ${a} and ${b} differ by at most one minor observable — the generator likely renders them identically; consider keeping one`);
        }
      }
      m.finished = io.now();
      m.progress = { stage: m.status, done: totalUnits(m), total: totalUnits(m) };
      log(m, io, m.status === "done" ? `done: ${m.styles.length} style(s) from ${readable} source(s)` : m.error!);
      await io.save(m);
      return { unit: "finish", status: m.status, progress: m.progress };
    }
  }

  m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
  await io.save(m);
  return { unit: unitLabel(unit), status: m.status, progress: m.progress };
}

/** Does this run hold anything a retry would take again? */
export function hasFailures(m: ExtractManifest): boolean {
  if (m.sources.some((s) => s.error && !s.readback)) return true;
  for (const st of m.styles) {
    if (st.replicas.some((r) => r.rounds.some((x) => !x.file))) return true;
    if (st.transfers.some((t) => !t.file)) return true;
  }
  return false;
}

/** Run to completion. The CLI's loop; also what a test drives. */
export async function runToEnd(m: ExtractManifest, io: EngineIO, onUnit?: (r: StepResult) => void): Promise<ExtractManifest> {
  for (;;) {
    const r = await step(m, io);
    if (r.unit === null) return m;
    onUnit?.(r);
    if (r.unit === "finish") return m;
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function bestRound(st: ExtractedStyle): ReplicaRound | null {
  let best: ReplicaRound | null = null;
  for (const r of st.replicas) for (const round of r.rounds) if (typeof round.score === "number" && (best === null || round.score > best.score!)) best = round;
  return best;
}

/** Mean score of every round generated with this exact recipe, or null. */
function scoreOf(st: ExtractedStyle, recipe: string): number | null {
  const xs: number[] = [];
  for (const r of st.replicas) for (const round of r.rounds) if (round.recipe === recipe && typeof round.score === "number") xs.push(round.score);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Small stable hash → 0..999, for per-image seed offsets. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 1000;
}

/** A fresh manifest around already-stored sources. */
export function newManifest(
  id: string,
  slug: string,
  sources: ExtractManifest["sources"],
  options: Partial<ExtractOptions>,
  now: string,
): ExtractManifest {
  const opts: ExtractOptions = {
    grouping: options.grouping === "none" ? "none" : "engine",
    rounds: clampInt(options.rounds, 1, 4, DEFAULT_OPTIONS.rounds),
    replicas: clampInt(options.replicas, 1, 4, DEFAULT_OPTIONS.replicas),
    transfers: clampInt(options.transfers, 0, TRANSFER_SCENES.length, DEFAULT_OPTIONS.transfers),
    target: typeof options.target === "number" && options.target > 0 && options.target <= 1 ? options.target : DEFAULT_OPTIONS.target,
    seed: Number.isInteger(options.seed) ? (options.seed as number) : DEFAULT_OPTIONS.seed,
  };
  // Absent stays absent: an unset ceiling is unlimited, and the key is not written.
  const ceilingUsd = clampCeiling(options.ceilingUsd);
  if (ceilingUsd !== undefined) opts.ceilingUsd = ceilingUsd;
  const m: ExtractManifest = {
    id,
    slug,
    created: now,
    status: "created",
    progress: { stage: "created", done: 0, total: 0 },
    options: opts,
    sources,
    styles: [],
    engines: {},
    log: [{ at: now, msg: `created with ${sources.length} source(s); ${opts.replicas} replica(s) × ${opts.rounds} round(s), ${opts.transfers} transfer(s) per style` }],
  };
  m.progress.total = totalUnits(m);
  return m;
}

function clampInt(v: unknown, lo: number, hi: number, d: number): number {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
}

export { NO_TEXT };
