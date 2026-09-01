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

import type { Aspect, ImageRef } from "@/lib/imaging/types";

import { NO_TEXT, TRANSFER_SCENES, critiqueInstruction, readbackInstruction, replicaPrompt, singletonInstruction, synthesisPrompt, transferPrompt } from "./prompts";
import type {
  Critique,
  SettleReason,
  ExtractManifest,
  ExtractOptions,
  ExtractedStyle,
  Observables,
  Readback,
  ReplicaRound,
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
}

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
 *  a bad parameter, an expired key, a budget ceiling — that every further
 *  unit would also hit. */
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
 *  puts the run back in a live stage. */
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
  m.fail_streak = 0;
  delete m.error;
  delete m.finished;
  if (m.status === "failed" || m.status === "done") m.status = m.styles.length ? "replicating" : "reading";
  m.progress = { stage: m.status, done: doneUnits(m), total: totalUnits(m) };
  return n;
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

  switch (unit.kind) {
    case "read": {
      setStage(m, "reading");
      const s = m.sources.find((x) => x.id === unit.source)!;
      const singleton = m.options.grouping === "none";
      try {
        const img = await io.readImage(s.file);
        const r = await io.recognize(img, singleton ? singletonInstruction() : readbackInstruction(), singleton ? SINGLETON_SCHEMA : READBACK_SCHEMA);
        if (!isReadback(r.value)) throw new Error("the readback did not carry every observable");
        s.readback = { ...r.value, dominant_colours: Array.isArray(r.value.dominant_colours) ? r.value.dominant_colours.slice(0, 5).map(String) : [] };
        m.engines.vision = r.model;
        log(m, io, `read ${s.id} (${s.name}): ${s.readback.render_mode}, ${s.readback.palette_strategy}`);
      } catch (e) {
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
        await io.writeImage(file, g.value);
        round.file = file;
        round.generator = g.model;
        m.engines.generator = g.model;
      } catch (e) {
        round.error = `generate: ${msg(e)}`;
        log(m, io, `${unitLabel(unit)} — ${round.error}`);
        tripped(m, io, round.error);
        break;
      }
      try {
        const img = await io.readImage(file);
        const c = await io.recognize(img, critiqueInstruction(st, recipe), CRITIQUE_SCHEMA);
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
        tripped(m, io, round.error);
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
        await io.writeImage(file, g.value);
        t.file = file;
        t.generator = g.model;
      } catch (e) {
        t.error = `generate: ${msg(e)}`;
        log(m, io, `${unitLabel(unit)} — ${t.error}`);
        tripped(m, io, t.error);
        break;
      }
      try {
        const img = await io.readImage(file);
        const r = await io.recognize(img, readbackInstruction(), READBACK_SCHEMA);
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
        tripped(m, io, t.error);
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
        for (const [a, b] of nearDuplicates(m.styles)) {
          const sa = m.styles.find((s) => s.id === a)!;
          const sb = m.styles.find((s) => s.id === b)!;
          sa.similar_to = [...(sa.similar_to ?? []), b];
          sb.similar_to = [...(sb.similar_to ?? []), a];
          log(m, io, `warning: ${a} and ${b} differ by at most one minor observable — the generator likely renders them identically; consider keeping one`);
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
