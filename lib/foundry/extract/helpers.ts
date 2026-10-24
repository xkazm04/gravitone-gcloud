// PURE HELPERS — the best-scoring round, a style's score for a recipe, the seed
// hash, and newManifest. Nothing here touches the IO; they are read by the
// perform files and by the manifest's creation.
//
// Its own file because none of them is a unit or a rule of the loop, and
// newManifest is the only place a run's options are clamped.

/* ── Helpers ──────────────────────────────────────────────────────────────── */

import { PROVIDER_IDS } from "@/lib/imaging/types";

import { DEFAULT_OPTIONS } from "./engine";
import { TRANSFER_SCENES } from "./prompts";
import { clampCeiling } from "./spend";
import type { ExtractManifest, ExtractOptions, ExtractedStyle, ReplicaRound } from "./types";
import { totalUnits } from "./units";

/** A round whose image read back carrying text is VETOED: text is the veto in
 *  every grader this repo runs (prompts.ts NO_TEXT), so its score elsewhere buys
 *  nothing back - it neither wins the recipe in force nor counts toward one. */
export const textVetoed = (round: Pick<ReplicaRound, "critique">): boolean => round.critique?.has_text === true;

export function bestRound(st: ExtractedStyle): ReplicaRound | null {
  let best: ReplicaRound | null = null;
  for (const r of st.replicas) for (const round of r.rounds) if (typeof round.score === "number" && !textVetoed(round) && (best === null || round.score > best.score!)) best = round;
  return best;
}

/** Mean score of every unvetoed round generated with this exact recipe, or null. */
export function scoreOf(st: ExtractedStyle, recipe: string): number | null {
  const xs: number[] = [];
  for (const r of st.replicas) for (const round of r.rounds) if (round.recipe === recipe && typeof round.score === "number" && !textVetoed(round)) xs.push(round.score);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/** Small stable hash → 0..999, for per-image seed offsets. */
export function hash(s: string): number {
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
  // Same rule: an unset generator leaves the plan to the router, and the key is not written.
  if (options.generator !== undefined && (PROVIDER_IDS as readonly string[]).includes(options.generator)) opts.generator = options.generator;
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
