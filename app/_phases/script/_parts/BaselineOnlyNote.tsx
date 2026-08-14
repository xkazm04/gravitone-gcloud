"use client";

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
      className="font-jetbrains mb-3 space-y-1 rounded-xl border border-amber-400/25 bg-amber-400/[0.04] px-3 py-2 text-[11px] leading-snug text-amber-200/90"
    >
      {api.candidate &&
        (readingCandidate && ownChain ? (
          <p data-testid="reading-candidate">
            You are reading <span className="text-white/80">{api.candidate.label}</span>&rsquo;s own
            beat chain — what the engine actually wrote. Changes are marked against{" "}
            {api.baseline.label}, and nothing is committed until you accept it.
          </p>
        ) : (
          <p>
            A recalibration is staged. {what} It re-weights the research rather than rewriting beats,
            so compare it in Coverage or the Spend bar.
          </p>
        ))}

      {/* THE GATE, WHERE THE DECISION IS. A verdict that lives three tabs away
          from the accept button is a verdict nobody reads before deciding. */}
      {gate && (
        <p
          data-testid="chain-gate"
          className={gate.blocked ? "text-rose-200" : "text-emerald-200/90"}
        >
          {gate.blocked
            ? `The gate re-ran on this chain and found ${gate.violations} blocking finding${
                gate.violations === 1 ? "" : "s"
              } — ${gate.blocking.join(", ")}. Read them in the render gate below before accepting.`
            : "The gate re-ran clean on this chain."}{" "}
          <span className="text-white/50">
            {gate.enforced}% enforced on the weakest render
            {gate.unmeasured > 0 ? ` · ${gate.unmeasured} rules could not be tested at all` : ""}.
          </span>
        </p>
      )}

      {rebalanced &&
        (ownChain ? (
          <p data-testid="stale-verification">
            Weights and beats are {api.baseline.label}&rsquo;s, and the gate was re-run on them. The
            craft checks and the constraint ledger beside the chain were <span className="text-rose-200">not</span>{" "}
            — those were computed against the original script and no longer describe it.
          </p>
        ) : (
          <p data-testid="stale-verification">
            Weights are {api.baseline.label}; the beat chain below and every check beside it were
            computed against the original script and have <span className="text-rose-200">not</span>{" "}
            been re-verified for it.
          </p>
        ))}
    </div>
  );
}
