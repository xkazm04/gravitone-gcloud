"use client";

// One render, scored against the limits the research declared.

import { Fold, Hint } from "@/components/ui/signal";

import { handLedgerFor, type EffectiveState } from "../constraints";

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
  const { rows, dangling, atRisk, superseded } = handLedgerFor(renderId);

  return (
    <div className="mt-3" data-testid={`ledger-${renderId}`}>
      {/* The verdict rides the header; the rows — sentences a person typed about
          this render — are one press down. The header's "not re-scored" is the
          whole statement when stale: the ledger has no probe, and the computed
          gate below carries the verdict instead. */}
      <Fold
        title="constraint ledger"
        level={4}
        tally={{ value: rows.length, label: "rows" }}
        marks={
          stale ? (
            <span
              data-testid={`ledger-stale-${renderId}`}
              className="font-jetbrains text-label tracking-[0.14em] text-amber-200 uppercase"
            >
              not re-scored
            </span>
          ) : (
            <span
              className={`font-jetbrains text-label tracking-[0.14em] uppercase ${atRisk ? "text-amber-200" : superseded ? "text-cyan-200" : "text-emerald-300"}`}
            >
              {atRisk ? `${atRisk} at risk` : superseded ? `${superseded} superseded` : "clean"}
            </span>
          )
        }
      >
      <ul className={`space-y-1.5 ${stale ? "opacity-45" : ""}`}>
        {rows.map((r) => {
          const m = MARK[r.effective];
          return (
            <li key={r.unknownId} className="text-label leading-snug">
              <span aria-hidden className={`font-jetbrains mr-1.5 text-label tracking-[0.1em] ${m.cls}`}>
                {m.glyph}
              </span>
              <span className="sr-only">{m.label}: </span>
              <span className="text-white/45">{r.unknown.impact}</span>
              <span className="block pl-4 text-white/35">{r.how}</span>
              {/* A superseded limit is a chip, not a sentence: the ~ glyph and
                  its spoken "superseded" already name the state, and the reason
                  the render is now over-cautious is one clause behind it. */}
              {r.effective === "superseded" && (
                <span className="ml-1.5 inline-flex items-baseline">
                  <Hint label="Why superseded">
                    this limit was lifted — the render is more cautious than the notebook now requires
                  </Hint>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      </Fold>

      {/* A row whose unknown no longer exists means this render was scored
          against a rule that has vanished. Saying so beats rendering three rows
          where the ledger has four and calling it clean. */}
      {dangling.length > 0 && (
        <p
          data-testid="ledger-dangling"
          className="font-jetbrains mt-2 text-label leading-snug text-rose-300"
        >
          {dangling.length} ledger row{dangling.length === 1 ? "" : "s"} name an unknown the notebook no
          longer has ({dangling.join(", ")}) — this score is incomplete
        </p>
      )}
    </div>
  );
}
