"use client";

// One render, scored against the limits the research declared.

import { ledgerFor, type EffectiveState } from "../constraints";

/** The word beside the glyph, because the glyph and its colour are otherwise the
 *  only thing separating "honoured" from "at risk" — and `~` for superseded is
 *  not a symbol anyone can be expected to read. */
const MARK: Record<EffectiveState, { glyph: string; cls: string; label: string }> = {
  "at-risk": { glyph: "!", cls: "text-amber-300", label: "at risk" },
  honoured: { glyph: "✓", cls: "text-emerald-300", label: "honoured" },
  superseded: { glyph: "~", cls: "text-cyan-300", label: "superseded" },
  "not-applicable": { glyph: "—", cls: "text-white/25", label: "not applicable" },
};

/** `stale` — the chain on screen is not the one these rows were typed about.
 *
 *  Every row here is a sentence a person wrote about a specific script: "the
 *  93% / 7.6x vendor figures were cut entirely". Recalibrate that script and the
 *  sentence is a claim about a render that no longer exists — and the header's
 *  "clean" is then the most confident lie on the page. There is nothing to
 *  re-run: the ledger has no probe, which is exactly the defect `gate.ts` was
 *  built to answer. So it says it was not re-scored, and the computed gate below
 *  it carries the verdict instead. */
export default function ConstraintLedger({ renderId, stale }: { renderId: string; stale?: boolean }) {
  const { rows, dangling, atRisk, superseded } = ledgerFor(renderId);

  return (
    <div className="mt-3 border-t border-white/8 pt-3" data-testid={`ledger-${renderId}`}>
      <p className="font-jetbrains flex items-baseline justify-between text-[11px] tracking-[0.14em] uppercase">
        <span className="text-white/35">constraint ledger</span>
        {stale ? (
          <span data-testid={`ledger-stale-${renderId}`} className="text-amber-200">
            not re-scored
          </span>
        ) : (
          <span className={atRisk ? "text-amber-200" : superseded ? "text-cyan-200" : "text-emerald-300"}>
            {atRisk ? `${atRisk} at risk` : superseded ? `${superseded} superseded` : "clean"}
          </span>
        )}
      </p>

      {stale && (
        <p className="font-jetbrains mt-1 text-[10px] leading-snug text-amber-200/70">
          hand-written about the original chain. It has no probe, so it cannot follow a rewrite — read
          the computed gate below instead.
        </p>
      )}

      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => {
          const m = MARK[r.effective];
          return (
            <li key={r.unknownId} className="text-[12px] leading-snug">
              <span aria-hidden className={`font-jetbrains mr-1.5 text-[10px] tracking-[0.1em] ${m.cls}`}>
                {m.glyph}
              </span>
              <span className="sr-only">{m.label}: </span>
              <span className="text-white/45">{r.unknown.impact}</span>
              <span className="block pl-4 text-white/35">{r.how}</span>
              {r.effective === "superseded" && (
                <span className="block pl-4 text-cyan-200/70">
                  this limit has since been lifted — the render is more cautious than the notebook now
                  requires
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* A row whose unknown no longer exists means this render was scored
          against a rule that has vanished. Saying so beats rendering three rows
          where the ledger has four and calling it clean. */}
      {dangling.length > 0 && (
        <p
          data-testid="ledger-dangling"
          className="font-jetbrains mt-2 text-[11px] leading-snug text-rose-300"
        >
          {dangling.length} ledger row{dangling.length === 1 ? "" : "s"} name an unknown the notebook no
          longer has ({dangling.join(", ")}) — this score is incomplete
        </p>
      )}
    </div>
  );
}
