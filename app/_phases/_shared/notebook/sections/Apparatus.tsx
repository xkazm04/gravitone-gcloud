"use client";

// The half of the notebook that keeps the argument honest: the evidence it
// rests on, the limits it declared, how long it stays true, and what the run
// never looked at.

import { HazardLine } from "../Chips";
import { countsOf } from "../counts";
import FactRow from "../FactRow";
import type { Fact, Notebook } from "../types";
import { H, sectionLabels, sectionRenders } from "./H";
import { CurrencyBody, SourcesBody } from "./Shared";

/** `facts` is the notebook's by-id index (`source.byId.facts`), which a fact's
 *  `contests`/`qualifies` edges resolve against. */
export default function ApparatusSections({ n, facts }: { n: Notebook; facts: Readonly<Record<string, Fact>> }) {
  const labels = sectionLabels(n);
  const counts = countsOf(n);
  return (
    <>
      <section className="space-y-2">
        <H id="facts">
          {labels.facts} · {counts.loadBearing} load-bearing ·{" "}
          {counts.lowConfidence} at low confidence
        </H>
        <ul className="space-y-2">
          {n.facts.map((f) => (
            <FactRow key={f.id} f={f} facts={facts} />
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <H id="numbers">{labels.numbers}</H>
        <ul className="space-y-1.5">
          {n.scaleConversions.map((s) => (
            <li key={s.raw} className="text-content leading-relaxed">
              <span className="font-jetbrains text-white/45">{s.raw}</span>
              <span aria-hidden className="text-white/25"> → </span>
              <span className="text-slate-300">{s.felt}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-2 space-y-2">
          {n.analogyCandidates.map((a) => (
            <li key={a.for} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="font-jetbrains text-content tracking-[0.14em] text-white/60">
                for {a.for} · {a.quality}
              </p>
              <p className="mt-1 text-content leading-relaxed text-slate-300">{a.analogy}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <H id="unknowns">{labels.unknowns}</H>
        {n.unknowns.map((u) => {
          const resolved = !!u.resolvedBy;
          return (
            <div
              key={u.id}
              data-testid={`unknown-${u.id}`}
              className={`rounded-xl border p-3 ${
                resolved
                  ? "border-emerald-400/20 bg-emerald-400/[0.03]"
                  : "border-amber-400/20 bg-amber-400/[0.04]"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-jetbrains text-label tracking-[0.12em] text-white/55">{u.id}</span>
                {resolved && (
                  <span className="font-jetbrains rounded border border-emerald-400/30 bg-emerald-400/[0.07] px-1.5 py-0.5 text-label tracking-[0.1em] text-emerald-200">
                    resolved
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-content text-slate-200">{u.what}</p>
              <p className="mt-1 text-content text-white/45">{u.why}</p>
              <p
                className={`font-jetbrains mt-1.5 text-label ${
                  resolved ? "text-white/60 line-through" : "text-amber-200/90"
                }`}
              >
                impact — {u.impact}
              </p>
              {/* A resolved unknown is kept rather than deleted. Deleting one is
                  what shifted every index in the constraint ledger and crashed
                  the Script step; keeping it also preserves the fact that a
                  render written before the resolution is now over-hedged. */}
              {u.resolvedBy && (
                <p className="font-jetbrains mt-1.5 text-content leading-relaxed text-emerald-200/85">
                  resolved by {u.resolvedBy}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* ALSO POPULATED AND ALSO DRAWN BY NOTHING until now. The questions the
          run considered are how a reader tells which video this notebook was
          aimed at — and the modal that promises to summarise nothing away was
          dropping all five. */}
      {sectionRenders(n, "questions") && (
        <section className="space-y-2">
          <H id="questions">{labels.questions}</H>
          <ul className="space-y-1.5">
            {n.candidateQuestions.map((q) => (
              <li key={q} className="flex gap-2 text-content leading-relaxed text-slate-300">
                <span aria-hidden className="text-white/25">—</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <H id="fit">{labels.fit}</H>
        {n.engineFit.map((e) => (
          <div key={e.engine} className="flex gap-3 text-content leading-relaxed">
            <span
              className={`font-jetbrains mt-px w-20 shrink-0 text-label tracking-[0.1em] ${
                e.fit === "excellent" ? "text-emerald-300" : e.fit === "good" ? "text-cyan-300/80" : "text-white/55"
              }`}
            >
              {e.fit}
            </span>
            <span>
              <span className="text-white">{e.label}</span>
              {e.recommended && <span className="font-jetbrains ml-2 text-label text-emerald-300">recommended</span>}
              <span className="block text-white/45">{e.why}</span>
              <HazardLine hazard={e.hazard} />
            </span>
          </div>
        ))}
      </section>

      <section className="space-y-1.5">
        <H id="currency">{labels.currency}</H>
        {/* Inlined here: this artifact has no stat tile to carry it. */}
        <CurrencyBody n={n} withHalfLife />
      </section>

      <section className="space-y-1.5">
        {/* Named "bibliography", not "sources", and in step with the rail pill
            by construction now — both read sectionLabels in ./H.tsx, where the
            reasoning lives. */}
        <H id="sources">{labels.sources}</H>
        <SourcesBody n={n} />
      </section>

      <section className="space-y-1.5">
        <H id="gaps">{labels.gaps}</H>
        <ul className="space-y-1.5">
          {n.researchGaps.map((g) => (
            <li key={g} className="flex gap-2 text-content leading-relaxed text-amber-200/80">
              <span aria-hidden>—</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
        {/* "a notebook claiming no gaps did not look hard enough" stood under
            this list as an aphorism. It is true and it is the app editorialising
            about its own artifact; the gaps themselves make the point. */}
      </section>
    </>
  );
}
