"use client";

// The half of the notebook that keeps the argument honest: the evidence it
// rests on, the limits it declared, how long it stays true, and what the run
// never looked at.

import FactRow from "../FactRow";
import { NOTEBOOK, NOTEBOOK_COUNTS } from "../notebook";
import { H } from "./H";
import { CurrencyBody, SourcesBody } from "./Shared";

export default function ApparatusSections() {
  const n = NOTEBOOK;
  return (
    <>
      <section className="space-y-2">
        <H id="facts">
          facts — {NOTEBOOK_COUNTS.loadBearing} load-bearing, {NOTEBOOK_COUNTS.lowConfidence} at low
          confidence
        </H>
        <ul className="space-y-2">
          {n.facts.map((f) => (
            <FactRow key={f.id} f={f} />
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <H id="numbers">numbers made felt · analogies</H>
        <ul className="space-y-1.5">
          {n.scaleConversions.map((s) => (
            <li key={s.raw} className="text-[13px] leading-relaxed">
              <span className="font-jetbrains text-white/45">{s.raw}</span>
              <span className="text-white/25"> → </span>
              <span className="text-slate-300">{s.felt}</span>
            </li>
          ))}
        </ul>
        <ul className="mt-2 space-y-2">
          {n.analogyCandidates.map((a) => (
            <li key={a.for} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <p className="font-jetbrains text-[10px] tracking-[0.14em] text-white/35">
                for {a.for} · {a.quality}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{a.analogy}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <H id="unknowns">
          unknowns — {NOTEBOOK_COUNTS.unknownsOpen} still constrain the script
        </H>
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
                <span className="font-jetbrains text-[10px] tracking-[0.12em] text-white/30">{u.id}</span>
                {resolved && (
                  <span className="font-jetbrains rounded border border-emerald-400/30 bg-emerald-400/[0.07] px-1.5 py-0.5 text-[10px] tracking-[0.1em] text-emerald-200">
                    resolved
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-slate-200">{u.what}</p>
              <p className="mt-1 text-[13px] text-white/45">{u.why}</p>
              <p
                className={`font-jetbrains mt-1.5 text-[12px] ${
                  resolved ? "text-white/35 line-through" : "text-amber-200/90"
                }`}
              >
                impact — {u.impact}
              </p>
              {/* A resolved unknown is kept rather than deleted. Deleting one is
                  what shifted every index in the constraint ledger and crashed
                  the Script step; keeping it also preserves the fact that a
                  render written before the resolution is now over-hedged. */}
              {u.resolvedBy && (
                <p className="font-jetbrains mt-1.5 text-[12px] leading-relaxed text-emerald-200/85">
                  resolved by {u.resolvedBy}
                </p>
              )}
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <H id="fit">engine fit — reported, never chosen here</H>
        {n.engineFit.map((e) => (
          <div key={e.engine} className="flex gap-3 text-[13px] leading-relaxed">
            <span
              className={`font-jetbrains mt-px w-20 shrink-0 text-[11px] tracking-[0.1em] ${
                e.fit === "excellent" ? "text-emerald-300" : e.fit === "good" ? "text-cyan-300/80" : "text-white/30"
              }`}
            >
              {e.fit}
            </span>
            <span>
              <span className="text-white">{e.label}</span>
              {e.recommended && <span className="font-jetbrains ml-2 text-[10px] text-emerald-300">recommended</span>}
              <span className="block text-white/45">{e.why}</span>
            </span>
          </div>
        ))}
      </section>

      <section className="space-y-1.5">
        <H id="currency">currency — how long is this true for</H>
        {/* Inlined here: this artifact has no stat tile to carry it. */}
        <CurrencyBody withHalfLife />
      </section>

      <section className="space-y-1.5">
        <H id="sources">sources</H>
        <SourcesBody />
      </section>

      <section className="space-y-1.5">
        <H id="gaps">gaps — what this run did not do</H>
        <ul className="space-y-1.5">
          {n.researchGaps.map((g) => (
            <li key={g} className="flex gap-2 text-[13px] leading-relaxed text-amber-200/80">
              <span aria-hidden>—</span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
        <p className="font-jetbrains pt-1 text-[11px] text-white/30">
          a notebook claiming no gaps did not look hard enough
        </p>
      </section>
    </>
  );
}
