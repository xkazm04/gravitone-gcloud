"use client";

// VARIANT A — the triage board.
//
// Mental model: SORTING. Every card is on the table at once, grouped into the
// columns the research brief itself defines, and you sweep across them. The
// column is the unit of attention, and an empty or thin column is the finding —
// which is why each one states what its emptiness would mean.
//
// Best when you already know the subject and want to see coverage.

import { useState } from "react";

import { Eyebrow } from "@/components/ui/Primitives";
import type { ScopeApi } from "./useScope";
import { DIMENSIONS } from "./scope";
import CardTile from "./_parts/CardTile";
import { Consequences, ScopeBar } from "./_parts/ScopeBar";

export default function ResearchTriageBoard({ api }: { api: ScopeApi }) {
  const [focus, setFocus] = useState<string | null>(null);
  const woundOf = (id: string) => api.summary.wounds.find((w) => w.cardId === id);
  const shown = focus ? DIMENSIONS.filter((d) => d.id === focus) : DIMENSIONS;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>triage board</Eyebrow>
          <p className="font-hanken mt-2 max-w-2xl text-sm text-slate-400">
            Every card the run produced, in the six domains the research brief requires. Sweep the
            columns, cut what you do not want, and watch what it costs.
          </p>
        </div>
        <ScopeBar api={api} />
      </header>

      {/* column filter — the board's one navigation affordance */}
      <div className="font-jetbrains flex flex-wrap gap-1.5 text-[10px]">
        <button
          onClick={() => setFocus(null)}
          className={`rounded-full border px-2.5 py-1 tracking-[0.1em] transition ${
            focus === null ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-white/40 hover:text-white/70"
          }`}
        >
          all six
        </button>
        {DIMENSIONS.map((d) => {
          const n = api.summary.byDim.find((b) => b.id === d.id)!;
          return (
            <button
              key={d.id}
              onClick={() => setFocus(focus === d.id ? null : d.id)}
              className={`rounded-full border px-2.5 py-1 tracking-[0.1em] transition ${
                focus === d.id ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-white/40 hover:text-white/70"
              }`}
            >
              {d.label} <span className="text-white/30">{n.kept}/{n.total}</span>
            </button>
          );
        })}
      </div>

      <div className={`grid gap-4 ${focus ? "" : "lg:grid-cols-2 xl:grid-cols-3"}`}>
        {shown.map((d) => {
          const cards = api.cards.filter((c) => c.dimension === d.id);
          const n = api.summary.byDim.find((b) => b.id === d.id)!;
          // "Empty" means the run produced nothing here — NOT that everything
          // is descoped. Conflating the two hid the Conclusions column entirely,
          // because conclusions start out of scope by design and so could never
          // be opted in. Cards are always rendered; the warning sits above them.
          const empty = cards.length === 0;
          const noneKept = cards.length > 0 && n.kept === 0;
          return (
            <section
              key={d.id}
              data-testid={`column-${d.id}`}
              className={`rounded-2xl border p-4 ${
                empty ? "border-amber-400/25 bg-amber-400/[0.03]" : "border-white/8 bg-white/[0.015]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                {/* Title carries the section's identity — Conclusions in the app
                    accent, everything else plain white. Cheaper and clearer than
                    wrapping a whole column in a coloured border. */}
                <h3
                  className={`font-jetbrains text-[13px] tracking-[0.16em] uppercase ${
                    d.id === "conclusions" ? "text-cyan-300" : "text-white"
                  }`}
                >
                  {d.label}
                </h3>
                <span className="font-jetbrains text-[10px] text-white/30">
                  {n.kept}/{n.total}
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">{d.purpose}</p>

              {empty ? (
                <p className="font-jetbrains mt-3 text-[11px] leading-relaxed text-amber-200/85">
                  the run produced nothing here — {d.emptyMeans}
                </p>
              ) : (
                <>
                  {noneKept && (
                    <p className="font-jetbrains mt-3 text-[11px] leading-relaxed text-amber-200/85">
                      {d.id === "conclusions"
                        ? "none taken — conclusions are reasoned, not researched, so they stay out until you take one"
                        : `nothing in scope — ${d.emptyMeans}`}
                    </p>
                  )}
                  <ul className="mt-3 space-y-2.5">
                    {cards.map((c) => (
                      <CardTile key={c.id} card={c} api={api} wound={woundOf(c.id)} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          );
        })}
      </div>

      <Consequences api={api} />
    </div>
  );
}
