"use client";

// THE STRUCTURE CHECK, on screen — `runStructureCheck` over the cut being edited.
//
// Same honesty rule as `../_parts/GatePanel.tsx`: `unmeasured` is rendered as
// loudly as `violation`, and the header says MALFORMED yes / no / unmeasured,
// never anything warmer. "A structural checker can establish that a cut is
// malformed; it cannot establish that a cut works" — so no word on this panel
// may claim it does. The advisory rules (`promise`, `efficacy`) never count
// toward malformed and are drawn in their own group so nobody reads a promise
// row as a structural failure.

import type { Verdict } from "../gate";

import { ADVISORY_RULES, type StructureReport, type StructureRule } from "./structure";
import type { TrailerCut } from "./types";

const RULE_ORDER: readonly StructureRule[] = [
  "graph",
  "connector",
  "spine",
  "escalation",
  "reset",
  "cue",
  "magnitude",
  "cards",
  "promise",
  "ladder",
  "withholding",
  "efficacy",
] as const;

const MARK: Record<Verdict, { glyph: string; cls: string; label: string }> = {
  violation: { glyph: "✕", cls: "text-rose-300", label: "violation" },
  pass: { glyph: "✓", cls: "text-emerald-300", label: "pass" },
  unmeasured: { glyph: "?", cls: "text-amber-300", label: "unmeasured" },
  "not-engaged": { glyph: "—", cls: "text-white/25", label: "not-engaged" },
};

export default function StructurePanel({ report, cut }: { report: StructureReport; cut: TrailerCut }) {
  const labelOf = new Map(cut.beats.map((b) => [b.id, b.label]));
  const malformed =
    report.malformed === null ? "unmeasured" : report.malformed ? "yes" : "no";
  const malformedCls =
    report.malformed === null ? "text-amber-300" : report.malformed ? "text-rose-300" : "text-white/70";

  const grouped = RULE_ORDER.map((rule) => ({
    rule,
    findings: report.findings.filter((f) => f.rule === rule),
  })).filter((g) => g.findings.length);
  const structural = grouped.filter((g) => !ADVISORY_RULES.includes(g.rule));
  const advisory = grouped.filter((g) => ADVISORY_RULES.includes(g.rule));

  const renderGroup = (g: (typeof grouped)[number]) => (
    <li key={g.rule} data-testid={`structure-rule-${g.rule}`}>
      <p className="font-jetbrains text-[10px] tracking-[0.14em] text-white/40 uppercase">{g.rule}</p>
      <ul className="mt-1 space-y-1.5">
        {g.findings.map((f, i) => {
          const m = MARK[f.verdict];
          const beatLabel = f.beatId ? labelOf.get(f.beatId) : undefined;
          return (
            <li key={`${f.subject}-${i}`} className="text-[12px] leading-snug">
              <span aria-hidden className={`font-jetbrains mr-1.5 text-[10px] tracking-[0.1em] ${m.cls}`}>
                {m.glyph}
              </span>
              <span className={`font-jetbrains text-[10px] tracking-[0.1em] ${m.cls}`}>{m.label}</span>
              <span className="font-jetbrains ml-2 text-[10px] tracking-[0.1em] text-white/30">
                {f.subject}
                {beatLabel && ` · “${beatLabel}”`}
                {f.at && ` @${f.at}`}
              </span>
              <span className="block pl-4 text-white/45">{f.detail}</span>
              <span className="block pl-4 text-[10px] text-white/25">{f.cites}</span>
            </li>
          );
        })}
      </ul>
    </li>
  );

  return (
    <section data-testid="structure-panel" className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <p className="font-jetbrains flex flex-wrap items-baseline justify-between gap-2 text-[11px] tracking-[0.14em] uppercase">
        <span className="text-white/35">structure · computed over the cut on screen</span>
        <span data-testid="structure-malformed" className={malformedCls}>
          malformed: {malformed}
        </span>
      </p>
      <p className="font-jetbrains mt-1.5 text-[10px] text-white/40">
        <span className="text-white/70">{report.enforced}% enforced</span>
        {" · "}
        {report.passes} pass · {report.violations} violation
        <span className="text-amber-200/80"> · {report.unmeasured} unmeasured</span>
        {report.notEngaged > 0 && <span> · {report.notEngaged} not-engaged</span>}
      </p>
      <p className="mt-1.5 text-[12px] leading-snug text-white/45">{report.malformedNote}</p>

      <ul className="mt-3 space-y-3">{structural.map(renderGroup)}</ul>

      {advisory.length > 0 && (
        <div className="mt-4 border-t border-dashed border-amber-400/25 pt-3">
          <p className="font-jetbrains text-[11px] tracking-[0.14em] text-amber-200/70 uppercase">
            advisory · never counts toward malformed
          </p>
          <ul className="mt-2 space-y-3">{advisory.map(renderGroup)}</ul>
        </div>
      )}
    </section>
  );
}
