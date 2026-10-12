// THE SPEND ACCOUNTING — what a unit is expected to cost, what a served call
// is booked at, and when the run is stopped for money.
//
// Its own file so the rule for when a charge is recorded can be read in one
// place. Money stops set `m.stopped` and never count toward the breaker
// (breaker.ts); the ceiling is clamped here.

import { DEFAULT_CALL_ESTIMATE_USD, MAX_CEILING_USD, type CallKind, type EngineIO, type Served } from "./engine";
import { log } from "./journal";
import type { ExtractManifest, ExtractStop, SpendStage } from "./types";
import type { Unit } from "./units";

/* ── Spend ────────────────────────────────────────────────────────────────── */

/** Micro-dollar rounding, so a ceiling of $0.10 is not crossed by 1e-17. */
export const usd6 = (x: number) => Math.round(x * 1e6) / 1e6;

function callEstimate(io: EngineIO, kind: CallKind): number {
  const v = io.estimateUsd?.(kind);
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : DEFAULT_CALL_ESTIMATE_USD[kind];
}

/** What a unit is expected to cost before it starts: the calls it makes. */
export function unitEstimate(m: ExtractManifest, u: Unit, io: EngineIO): number {
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
export function book(m: ExtractManifest, io: EngineIO, stage: SpendStage, kind: CallKind, s: Served<unknown>) {
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
export const isOverBudget = (e: unknown) => !!e && typeof e === "object" && (e as { kind?: unknown }).kind === "over-budget";

/** Stop the run for money. Not a failure: the breaker is left alone. */
export function stopFor(m: ExtractManifest, io: EngineIO, by: ExtractStop["by"], detail: string) {
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
