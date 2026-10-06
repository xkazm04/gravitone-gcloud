// A SETTLED SCENE-DIRECTION TURN, TAKEN ONTO THE CUT. Pure.
//
// Lifted out of useFrames when the pass moved onto the server's turn ledger
// (AIO-A stage 3): the answer no longer arrives in the closure that asked for
// it, so the code that turns `{ raw, engine }` into frames, row findings and a
// summary has to run wherever the answer is picked up — on the watched turn
// ending, or on a remount that finds one done. One function, so both paths
// stage the same thing.

import type { SceneSpec, SceneSpecReport } from "./sceneSpec";
import { reviewSceneSpecs } from "./sceneSpec";
import type { DirectionSpend, Frame } from "./frames";
import type { Fact } from "../_shared/notebook/types";

/** The record's result for a `frames` turn — the route's old 200 body. */
export interface DirectionResult {
  raw?: unknown;
  engine?: { costUsd?: unknown; durationMs?: unknown };
}

export interface DirectionLanding {
  specs: SceneSpec[];
  /** Why a beat was refused, keyed by the beat it refused. */
  rejections: Record<string, string>;
  /** The pass's own summary — partial success — or null when it was whole. */
  notice: string | null;
}

/**
 * The bill, before the parse. A response this app cannot USE was still a
 * response the user PAID for, and a rejected pass that costs nothing on screen
 * is the same lie in a different direction. A pass the engine did not price is
 * COUNTED, not assumed free — it is what turns the total into a floor.
 */
export function addDirectionSpend(d: DirectionSpend | null, engine: DirectionResult["engine"], at: number): DirectionSpend {
  const e = engine ?? {};
  const costUsd = typeof e.costUsd === "number" && Number.isFinite(e.costUsd) ? e.costUsd : undefined;
  const durationMs = typeof e.durationMs === "number" && Number.isFinite(e.durationMs) ? e.durationMs : undefined;
  return {
    runs: (d?.runs ?? 0) + 1,
    costUsd: (d?.costUsd ?? 0) + (costUsd ?? 0),
    unpriced: (d?.unpriced ?? 0) + (costUsd === undefined ? 1 : 0),
    lastMs: durationMs,
    lastAt: at,
  };
}

/**
 * Review a pass's `raw` against the frames on screen. Throws SceneSpecError
 * when the answer cannot be used at all.
 *
 * The grade travels with the ids: passing only the id set proved a citation
 * resolved and let a `low` fact be drawn as an exact figure.
 */
export function landDirection(raw: string, frames: Frame[], facts: readonly Fact[]): DirectionLanding {
  const report: SceneSpecReport = reviewSceneSpecs(
    raw,
    frames,
    new Set(facts.map((f) => f.id)),
    new Map(facts.map((f) => [f.id, f.confidence])),
  );

  // Findings go to the rows they belong to. A rejection for a timestamp that
  // is not in this script has no row, so it goes to the summary.
  const inScript = new Set(frames.map((f) => f.at));
  const rejections: Record<string, string> = {};
  for (const r of report.rejected) if (inScript.has(r.beatAt)) rejections[r.beatAt] = r.reason;
  for (const at of report.missing) rejections[at] = "The pass returned no scene for this beat.";

  const orphans = report.rejected.filter((r) => !inScript.has(r.beatAt));
  let notice: string | null = null;
  if (report.rejected.length || report.missing.length) {
    const parts = [`${report.specs.length} of ${frames.length} beats directed`];
    if (report.rejected.length) parts.push(`${report.rejected.length} rejected`);
    if (report.missing.length) parts.push(`${report.missing.length} with no scene returned`);
    notice = `${parts.join(" · ")}. ${
      report.specs.length ? "The reasons are on those rows; every other beat was applied." : "Nothing was applied."
    }${orphans.length ? ` The engine also invented ${orphans.map((o) => `"${o.beatAt}"`).join(", ")}.` : ""}`;
  }
  return { specs: report.specs, rejections, notice };
}
