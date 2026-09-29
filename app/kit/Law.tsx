// VOICE AND LAW — twelve rules and where each is held. A table: the rule, and the
// gate or part that carries it. The reasoning lives in CLAUDE.md and
// components/ui/signal/README.md; this sheet is the checklist a builder holds a
// diff against.

import { DataTable, Kicker } from "@/components/kit";

import { RULES, WHEN_TO_USE } from "./catalog";

export function Law() {
  return (
    <div className="kr-page">
      <section className="kr-section" aria-labelledby="kr-rules">
        <Kicker>Voice</Kicker>
        <h2 id="kr-rules">Rules</h2>
        <DataTable
          head={["#", "Rule", "Held by"]}
          rows={RULES.map((r, i) => [<span key="n" className="k-num k-muted">{String(i + 1).padStart(2, "0")}</span>, r.rule, <span key="g" className="kr-out">{r.gate}</span>])}
        />
      </section>
      <section className="kr-section" aria-labelledby="kr-use">
        <Kicker>Use</Kicker>
        <h2 id="kr-use">Which part, never what</h2>
        <DataTable
          head={["Situation", "Use", "Never"]}
          rows={WHEN_TO_USE.map((w) => [w.situation, <code key="u">{w.use}</code>, <span key="n" className="k-muted">{w.never}</span>])}
        />
      </section>
    </div>
  );
}
