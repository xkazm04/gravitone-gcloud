"use client";

// THE RENDER-BOUNDARY GATE, on screen.
//
// Its sibling `ConstraintLedger` renders `CONSTRAINT_LEDGER` — a hand-authored
// table of claims ABOUT this render, typed by a person. This panel renders
// `runGate()`, which read the render's own text. They sit next to each other on
// purpose: where they disagree, the computed one is the true one, and the
// disagreement is the most useful thing this surface can show.
//
// Design rule this panel exists to honour — DESIGN.md's honest-failure clause,
// applied to a checker rather than to a fetch: **`unmeasured` is rendered as
// loudly as `violation`.** A gate that greys out what it could not test is
// telling the same lie the ledger told, in a nicer font. The `enforced` figure
// is deliberately the largest number here, because a creator's real question is
// not "did it pass" but "how much of this was actually checked".

import { useMemo } from "react";

import { RENDER_BY_ID } from "../renders";
import { runGate, type GateFinding, type Verdict } from "../gate";
import { CONCLUSIONS } from "../../_shared/notebook/conclusions";
import type { Beat } from "../types";

const MARK: Record<Verdict, { glyph: string; cls: string; label: string }> = {
  violation: { glyph: "✕", cls: "text-rose-300", label: "violation" },
  pass: { glyph: "✓", cls: "text-emerald-300", label: "checked" },
  // Amber, not grey. Not-checked is a state the creator must see, not a
  // cosmetic absence — this is the whole reason the file has four verdicts.
  unmeasured: { glyph: "?", cls: "text-amber-300", label: "not checked" },
  "not-engaged": { glyph: "—", cls: "text-white/25", label: "n/a" },
};

/** `beats` is the chain to gate. Omitted, the fixture's own chain is used — and
 *  the panel says which it read, because a verdict is only worth as much as the
 *  script it was computed against. That attribution is the whole difference
 *  between this panel and the ledger above it. */
export default function GatePanel({
  renderId,
  beats,
  chainLabel,
}: {
  renderId: string;
  beats?: Beat[];
  chainLabel?: string;
}) {
  const report = useMemo(() => {
    const chain = beats ?? RENDER_BY_ID[renderId]?.beats;
    return chain ? runGate({ id: renderId, beats: chain }, { conclusions: CONCLUSIONS }) : null;
  }, [renderId, beats]);

  if (!report) return null;

  const shown: GateFinding[] = report.findings.filter((f) => f.verdict !== "not-engaged");

  return (
    <div className="mt-3 border-t border-white/8 pt-3" data-testid={`gate-${renderId}`}>
      <p className="font-jetbrains flex items-baseline justify-between text-content tracking-[0.14em] uppercase">
        <span className="text-white/35">render gate · computed</span>
        <span
          data-testid={`gate-verdict-${renderId}`}
          className={report.blocked ? "text-rose-300" : "text-emerald-300"}
        >
          {report.blocked ? `${report.violations} blocking` : "clear"}
        </span>
      </p>

      {/* The honest headline. A creator reading a green tick deserves to know
          what fraction of the declared rules were executable at all. */}
      <p className="font-jetbrains mt-1.5 text-content text-white/40">
        <span className="text-white/70">{report.enforced}% enforced</span>
        {" · "}
        {report.passes} checked · {report.violations} failed
        {report.unmeasured > 0 && (
          <span className="text-amber-200/80"> · {report.unmeasured} not checked</span>
        )}
      </p>

      {/* WHICH SCRIPT THIS VERDICT IS ABOUT. A gate re-run on a recalibrated
          chain and a gate inherited from the original are worth different
          amounts, and the difference is invisible without this line. */}
      {chainLabel && (
        <p data-testid={`gate-chain-${renderId}`} className="font-jetbrains mt-1 text-content text-white/30">
          read the {chainLabel} chain
        </p>
      )}

      <ul className="mt-2 space-y-1.5">
        {shown.map((f, i) => {
          const m = MARK[f.verdict];
          return (
            <li key={`${f.rule}-${f.subject}-${i}`} className="text-label leading-snug">
              {/* The verdict was a bare glyph in a colour. `MARK.label` has
                  carried the word for each verdict since this file was written
                  and nothing ever rendered it — so a screen reader got "✓" or
                  nothing at all, and the amber that makes `unmeasured` louder
                  than a violation (the whole design rule in the header) does not
                  reach anyone reading without colour. */}
              <span aria-hidden className={`font-jetbrains mr-1.5 text-label tracking-[0.1em] ${m.cls}`}>
                {m.glyph}
              </span>
              <span className="sr-only">{m.label}: </span>
              <span className="font-jetbrains text-label tracking-[0.1em] text-white/30">
                {f.rule}/{f.subject}
                {f.at && ` @${f.at}`}
              </span>
              <span className="block pl-4 text-white/45">{f.detail}</span>
              {f.quote && (
                <span className="block pl-4 text-label text-white/30 italic">“{f.quote}”</span>
              )}
            </li>
          );
        })}
      </ul>

      {report.unmeasured > 0 && (
        <p className="font-jetbrains mt-2 text-content leading-snug text-amber-200/70">
          Amber rows were not tested. They are not passes — a constraint with no probe is a rule
          nobody is enforcing, and the ledger above will happily call it honoured.
        </p>
      )}
    </div>
  );
}
