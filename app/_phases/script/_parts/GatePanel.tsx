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

import { Fold } from "@/components/ui/signal";

import { RENDER_BY_ID } from "../renders";
import { runGate, type GateFinding, type GateReport, type Verdict } from "../gate";
import type { NotebookSource } from "../../_shared/notebook/source";
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
  source,
  beats,
  chainLabel,
  report: given,
}: {
  renderId: string;
  source: NotebookSource;
  beats?: Beat[];
  chainLabel?: string;
  /** The report ScriptStep's `gateChains` already computed for this chain.
   *  Given, it is drawn as is: the column used to re-run `runGate` over the
   *  same chain the rollup had just read — three gate passes per render of the
   *  expert face, and a second answer beside the pad's. */
  report?: GateReport;
}) {
  const computed = useMemo(() => {
    if (given) return null;
    const chain = beats ?? RENDER_BY_ID[renderId]?.beats;
    return chain ? runGate({ id: renderId, beats: chain }, { source, conclusions: source.conclusions }) : null;
  }, [given, renderId, source, beats]);
  const report = given ?? computed;

  if (!report) return null;

  const shown: GateFinding[] = report.findings.filter((f) => f.verdict !== "not-engaged");

  // LAYERED: the verdict and its figures are the column's first read; the
  // findings — every detail and quote verbatim — are one press down, and open
  // by themselves when the gate blocks, because then they are the decision.
  return (
    <div className="mt-3" data-testid={`gate-${renderId}`}>
      <Fold
        title="render gate"
        level={4}
        defaultOpen={report.blocked}
        tally={shown.length ? { value: shown.length, label: "findings" } : undefined}
        marks={
          <>
          {/* The enforced figure and the untested count stay on the closed
              header: "how much of this was actually checked" is the first read,
              and amber is as loud as the verdict beside it. */}
          <span className="font-jetbrains text-label text-white/60">{report.enforced}% enforced</span>
          {report.unmeasured > 0 && (
            <span className="font-jetbrains text-label text-amber-300">
              <span aria-hidden>{report.unmeasured}?</span>
              <span className="sr-only">{report.unmeasured} not checked</span>
            </span>
          )}
          <span
            data-testid={`gate-verdict-${renderId}`}
            className={`font-jetbrains text-label tracking-[0.14em] uppercase ${report.blocked ? "text-rose-300" : "text-emerald-300"}`}
          >
            {report.blocked ? `${report.violations} blocking` : "clear"}
          </span>
          </>
        }
      >

      {/* The honest headline. A creator reading a green tick deserves to know
          what fraction of the declared rules were executable at all. */}
      <p className="font-jetbrains text-content text-white/40">
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

      {/* NO LEGEND FOR THE AMBER. Every unmeasured row already says "not
          checked" beside its own glyph and the headline already counts them, so
          a paragraph restating that an untested rule is not a pass was the
          third telling. The design rule it defends — amber is LOUDER than a
          violation here, because a constraint with no probe is a rule nobody is
          enforcing and the hand-written ledger above will happily call it
          honoured — lives in this file's header. */}
      </Fold>
    </div>
  );
}
