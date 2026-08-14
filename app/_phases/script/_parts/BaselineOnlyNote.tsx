"use client";

import type { VersionsApi } from "../useVersions";

/** Version attribution for the two baseline-only tabs.
 *
 *  Two different lies this prevents, both found by the UAT pass:
 *
 *  1. A staged candidate makes these tabs look stale without saying so.
 *  2. Worse — once a recalibration is ACCEPTED, the weights are the new
 *     baseline's but the beat chain and every check drawn beside it
 *     (craft checks, constraint ledger, gate) are still the ORIGINAL script's,
 *     recomputed against nothing. A tick computed against a previous version and
 *     displayed against the current one manufactures confidence. Say it. */
export default function BaselineOnlyNote({ api, what }: { api: VersionsApi; what: string }) {
  const rebalanced = api.baseline.basedOn !== null;

  if (!api.candidate && !rebalanced) return null;

  return (
    <div
      data-testid="baseline-only"
      className="font-jetbrains mb-3 space-y-1 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] px-3 py-2 text-[11px] leading-snug text-amber-200/90"
    >
      {api.candidate && (
        <p>
          A recalibration is staged. {what} It re-weights the research rather than rewriting beats, so
          compare it in Coverage or the Spend bar.
        </p>
      )}
      {rebalanced && (
        <p data-testid="stale-verification">
          Weights are {api.baseline.label}; the beat chain below and every check beside it were
          computed against the original script and have <span className="text-rose-200">not</span>{" "}
          been re-verified for it.
        </p>
      )}
    </div>
  );
}
