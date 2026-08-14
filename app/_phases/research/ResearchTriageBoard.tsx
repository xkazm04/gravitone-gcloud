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
import { stateOf } from "./scope";
import {
  UNTAGGED_DIMENSION_ID,
  columnsFor,
  emptyMeansOf,
  type Dimension,
} from "../_shared/notebook/dimensions";
import CardTile from "./_parts/CardTile";
import { Consequences, ScopeBar } from "./_parts/ScopeBar";

export default function ResearchTriageBoard({ api }: { api: ScopeApi }) {
  const [focus, setFocus] = useState<string | null>(null);
  const woundOf = (id: string) => api.summary.wounds.find((w) => w.cardId === id);

  /** THE COLUMN THAT ONLY EXISTS WHEN IT HAS TO. `columnsFor` shipped with no
   *  callers, so a card nobody tagged rendered in NO column — not filed wrongly,
   *  simply absent, with nothing on the screen saying so. The condition comes
   *  off the cards this board is about to draw, which is the same test the
   *  matrix uses, so a card cannot be visible on one surface and invisible on
   *  the other. Zero untagged cards means zero extra columns: the bucket's
   *  emptiness is its success condition, and drawing an always-empty alarm is
   *  how an alarm stops being read. */
  const hasUntagged = api.cards.some((c) => c.dimension === UNTAGGED_DIMENSION_ID);
  const columns = columnsFor({ hasUntagged });
  const shown = focus ? columns.filter((d) => d.id === focus) : columns;

  /** `summary.byDim` is built from `DIMENSIONS` and so has no row for the
   *  untagged bucket. Counting here covers every column the board can draw —
   *  the alternative is a `.find(…)!` that returns undefined on exactly the
   *  column this change exists to show. */
  const countOf = (d: Dimension) => {
    const inColumn = api.cards.filter((c) => c.dimension === d.id);
    return {
      total: inColumn.length,
      kept: inColumn.filter((c) => !stateOf(api.scope, c.id).descoped).length,
    };
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>triage board</Eyebrow>
          {/* The count is read off the columns rather than typed. It said "six"
              against seven for as long as it was a literal, and the untagged
              bucket makes the number conditional as well as wrong. */}
          <p className="font-hanken mt-2 max-w-2xl text-sm text-slate-400">
            Every card the run produced, in the {columns.length - (hasUntagged ? 1 : 0)} domains the
            research brief requires
            {hasUntagged ? ", plus the queue of cards nobody filed" : ""}. Sweep the columns, cut
            what you do not want, and watch what it costs.
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
          all {columns.length}
        </button>
        {columns.map((d) => {
          const n = countOf(d);
          const orphan = d.id === UNTAGGED_DIMENSION_ID;
          return (
            <button
              key={d.id}
              onClick={() => setFocus(focus === d.id ? null : d.id)}
              className={`rounded-full border px-2.5 py-1 tracking-[0.1em] transition ${
                focus === d.id
                  ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
                  : orphan
                    ? "border-amber-400/35 text-amber-200/85 hover:text-amber-100"
                    : "border-white/10 text-white/40 hover:text-white/70"
              }`}
            >
              {d.label} <span className={orphan ? "text-amber-200/50" : "text-white/30"}>{n.kept}/{n.total}</span>
            </button>
          );
        })}
      </div>

      <div className={`grid gap-4 ${focus ? "" : "lg:grid-cols-2 xl:grid-cols-3"}`}>
        {shown.map((d) => {
          const cards = api.cards.filter((c) => c.dimension === d.id);
          const n = countOf(d);
          // "Empty" means the run produced nothing here — NOT that everything
          // is descoped. Conflating the two hid the Conclusions column entirely,
          // because conclusions start out of scope by design and so could never
          // be opted in. Cards are always rendered; the warning sits above them.
          const empty = cards.length === 0;
          const noneKept = cards.length > 0 && n.kept === 0;
          // The untagged bucket is the inverse of every other column: it is
          // drawn only when it is OCCUPIED, and each card in it is a filing
          // mistake rather than a finding. So it is ringed like a problem even
          // when it is full — the state a domain column signals by being empty.
          const orphan = d.id === UNTAGGED_DIMENSION_ID;
          return (
            <section
              key={d.id}
              data-testid={`column-${d.id}`}
              className={`rounded-2xl border p-4 ${
                empty || orphan
                  ? "border-amber-400/25 bg-amber-400/[0.03]"
                  : "border-white/8 bg-white/[0.015]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                {/* Title carries the section's identity — Conclusions in the app
                    accent, everything else plain white. Cheaper and clearer than
                    wrapping a whole column in a coloured border. */}
                <h3
                  className={`font-jetbrains text-[13px] tracking-[0.16em] uppercase ${
                    d.id === "conclusions" ? "text-cyan-300" : orphan ? "text-amber-200" : "text-white"
                  }`}
                >
                  {d.label}
                </h3>
                <span className="font-jetbrains text-[10px] text-white/30">
                  {n.kept}/{n.total}
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">{d.purpose}</p>

              {/* A card lands here because CARD_DIMENSION has no row for its id.
                  Saying so names the fix instead of leaving the reviewer to
                  wonder what they did — and it is the same sentence
                  check-notebook.mts prints, so the two reports agree. */}
              {orphan && (
                <p className="font-jetbrains mt-3 text-[11px] leading-relaxed text-amber-200/85">
                  {cards.length === 1 ? "this card has" : `these ${cards.length} cards have`} no
                  dimension — tag {cards.length === 1 ? "it" : "them"} in
                  dimensions.ts::CARD_DIMENSION. Until then no domain column shows{" "}
                  {cards.length === 1 ? "it" : "them"}.
                </p>
              )}

              {empty ? (
                <p className="font-jetbrains mt-3 text-[11px] leading-relaxed text-amber-200/85">
                  the run produced nothing here — {emptyMeansOf(d)}
                </p>
              ) : (
                <>
                  {noneKept && !orphan && (
                    <p className="font-jetbrains mt-3 text-[11px] leading-relaxed text-amber-200/85">
                      {d.id === "conclusions"
                        ? "none taken — conclusions are reasoned, not researched, so they stay out until you take one"
                        : `nothing in scope — ${emptyMeansOf(d)}`}
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
