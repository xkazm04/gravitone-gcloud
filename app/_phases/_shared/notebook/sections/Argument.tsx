"use client";

// The half of the notebook that IS the video: the tension it turns on, the
// mechanisms that explain it, the turns those mechanisms buy, and the strongest
// case against the whole thing.

import { ConnectorChip } from "../Chips";
import { NOTEBOOK } from "../notebook";
import { H, chainLink } from "./H";

export default function ArgumentSections() {
  const n = NOTEBOOK;
  return (
    <>
      <section className="space-y-2">
        <H id="tension">tension — the load-bearing field</H>
        <div className="grid gap-3 sm:grid-cols-2">
          <p className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-sm leading-relaxed text-slate-300">
            <span className="font-jetbrains block text-[10px] tracking-[0.14em] text-white/35 uppercase">expectation</span>
            {n.tension.expectation}
          </p>
          <p className="rounded-xl border border-violet-400/25 bg-violet-400/[0.05] p-3 text-sm leading-relaxed text-slate-200">
            <span className="font-jetbrains block text-[10px] tracking-[0.14em] text-violet-300/80 uppercase">reality</span>
            {n.tension.reality}
          </p>
        </div>
        <p className="text-sm leading-relaxed text-slate-400">{n.tension.whyItIsATension}</p>
        <p className="font-jetbrains text-[11px] text-emerald-300/80">strength: {n.tension.strength}</p>
      </section>

      <section className="space-y-3">
        <H id="mechanisms">mechanisms — the beat chain, pre-authored</H>
        {n.mechanisms.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
            <p className="text-sm font-medium text-white">{m.name}</p>
            <p className="font-jetbrains text-[11px] text-white/40">
              {m.id} · explains: {m.explains}
              {m.needsAnalogy ? " · needs an analogy" : ""}
            </p>
            <ol className="mt-2.5 space-y-1.5">
              {m.chain.map((step, i) => {
                const { connector, text } = chainLink(step);
                return (
                  <li key={i} className="flex flex-wrap items-baseline gap-2 text-[13px] leading-relaxed">
                    <ConnectorChip connector={connector} />
                    <span className="text-slate-300">{text}</span>
                  </li>
                );
              })}
            </ol>
            {m.note && <p className="mt-2 text-[13px] text-cyan-200/80 italic">{m.note}</p>}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <H id="reversals">reversals — the turns, pre-computed</H>
        {n.reversals.map((r) => (
          <div key={r.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3.5">
            <p className="font-jetbrains text-[10px] tracking-[0.14em] text-white/35 uppercase">
              {r.id} · obvious reading, stated generously
            </p>
            <p className="mt-1 text-sm text-slate-300">“{r.obviousReading}”</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-2 text-sm text-white">
              <ConnectorChip connector="BUT" />
              {r.whyWrong}
            </p>
            <p className="mt-2 text-[13px] text-white/55">escalation — {r.escalation}</p>
            <p className="font-jetbrains mt-2 text-[11px] text-white/30">
              evidence: {r.evidence.join(", ")}
              {r.mechanismId ? ` · via ${r.mechanismId}` : " · no mechanism — argued from evidence alone"}
            </p>
            {r.note && <p className="mt-1.5 text-[13px] text-cyan-200/80 italic">{r.note}</p>}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <H id="steelman">steel-man — mandatory, not optional</H>
        <p className="text-sm leading-relaxed text-slate-200">{n.steelMan.statement}</p>
        <p className="text-[13px] leading-relaxed text-white/50">{n.steelMan.whyInclude}</p>
        <p className="font-jetbrains text-[11px] text-white/30">evidence: {n.steelMan.evidence.join(", ")}</p>
      </section>
    </>
  );
}
