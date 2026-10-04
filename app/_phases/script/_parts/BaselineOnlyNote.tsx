"use client";

import { StaleBadge } from "@/components/ui/signal";

import type { GateRollup } from "../gate";
import type { Version, VersionsApi } from "../useVersions";

/** WHAT THIS TAB IS SHOWING, AND WHAT HAS ACTUALLY BEEN VERIFIED ABOUT IT.
 *
 *  Two lies this prevents, both found by the UAT pass:
 *
 *  1. A staged candidate makes these tabs look stale without saying so.
 *  2. Worse — once a recalibration is ACCEPTED, the weights are the new
 *     baseline's but the beat chain and every check drawn beside it were still
 *     the ORIGINAL script's, recomputed against nothing. A tick computed
 *     against a previous version and displayed against the current one
 *     manufactures confidence. Say it.
 *
 *  The second disclosure has now been NARROWED, and only as far as the code
 *  earned. A model-path version carries its own beats, this tab draws them, and
 *  `gate.ts` is re-run over them — so "the beat chain below was computed against
 *  the original script" stopped being true for that path and saying it anyway
 *  would be its own dishonesty. What is still true, and still said, is that the
 *  craft checks and the hand-authored constraint ledger beside the chain are
 *  prose a person typed about a script that no longer exists. The simulated path
 *  rewrites nothing, so it keeps the disclosure whole.
 *
 *  `data-testid="stale-verification"` survives both branches — the UAT suite
 *  reads it, and the thing it is testing (that this tab admits what it did not
 *  re-verify) is exactly what both branches still do. */
export default function BaselineOnlyNote({
  api,
  what,
  showing,
  gate,
}: {
  api: VersionsApi;
  what: string;
  /** The version whose beat chain this tab is drawing, when it draws one at
   *  all. Tracks draws a running order, not a chain, and keeps the broad note. */
  showing?: Version | null;
  /** The gate, re-run over the chain being drawn. */
  gate?: GateRollup;
}) {
  const rebalanced = api.baseline.basedOn !== null;
  if (!api.candidate && !rebalanced) return null;

  const ownChain = Boolean(showing?.beats);
  const readingCandidate = Boolean(api.candidate) && showing === api.candidate;

  return (
    <div
      data-testid="baseline-only"
      className="font-jetbrains mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] px-3 py-2 text-label leading-snug text-amber-200/90"
    >
      {api.candidate &&
        (readingCandidate && ownChain ? (
          <span data-testid="reading-candidate" className="text-cyan-200/90">
            {api.candidate.label} · own chain
          </span>
        ) : (
          <span>
            staged · {what} shows {api.baseline.label}
          </span>
        ))}

      {/* THE GATE, WHERE THE DECISION IS. A verdict that lives three tabs away
          from the accept button is a verdict nobody reads before deciding. It
          is a mark and its figures now: "read them in the render gate below
          before accepting" was an instruction to scroll. */}
      {gate && (
        <span data-testid="chain-gate" className={gate.blocked ? "text-rose-200" : "text-emerald-200/90"}>
          <span aria-hidden>gate {gate.blocked ? "✕" : "✓"}</span>
          <span className="sr-only">gate {gate.blocked ? "blocked" : "clean"}</span>
          {gate.blocked && ` · ${gate.violations} blocking · ${gate.blocking.join(", ")}`}
          <span className="text-white/50">
            {" · "}
            {gate.enforced}% enforced on the weakest render
            {gate.unmeasured > 0 ? ` · ${gate.unmeasured} untestable` : ""}
          </span>
        </span>
      )}

      {rebalanced && (
        <span data-testid="stale-verification" className="inline-flex items-center gap-1.5">
          <span className="text-white/55">
            {ownChain ? "craft checks & ledger" : "chain, checks & ledger"}
          </span>
          <StaleBadge words="not re-run" why={`typed against the original script, not ${api.baseline.label}`} />
        </span>
      )}
    </div>
  );
}
