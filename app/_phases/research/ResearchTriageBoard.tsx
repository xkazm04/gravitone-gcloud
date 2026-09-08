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

import { CircleSlash } from "lucide-react";

import { Eyebrow } from "@/components/ui/Primitives";
import { Hint, Tally } from "@/components/ui/signal";
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
        {/* THE COUNT RIDES ON THE FILTER CHIP, NOT A PARAGRAPH. It was prose —
            "in the six domains the research brief requires" — and it said six
            against seven for as long as it was a literal, with the untagged
            bucket making the number conditional as well as wrong. `all N`
            below is read off `columns`, so it cannot say the wrong number, and
            the grid IS the domains. */}
        <Eyebrow>triage board</Eyebrow>
        <ScopeBar api={api} />
      </header>

      {/* Column filter — the board's one navigation affordance. These are
          TOGGLES, so they carry `aria-pressed`: their only pressed signal is a
          cyan border, and every other toggle in this step already says it out
          loud (CardTile, beats/VariantTile). */}
      <div className="font-jetbrains flex flex-wrap gap-1.5 text-label" role="group" aria-label="Filter columns">
        <button
          type="button"
          onClick={() => setFocus(null)}
          aria-pressed={focus === null}
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
              type="button"
              onClick={() => setFocus(focus === d.id ? null : d.id)}
              aria-pressed={focus === d.id}
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

      {/* WHAT CHANGED, RATHER THAN EVERYTHING THERE IS. `aria-live="polite"`
          used to sit on the grid below, which put all 31 cards — every claim,
          confidence, source and wound warning on the board — inside one live
          region. Toggling a single card's scope mutates that region, so a
          screen reader re-announced the whole board for a click whose result
          the card's own control already states: the overlay button carries
          `aria-pressed` and an aria-label that names the action and the claim.
          A live region that fires on every sweep of a column is one a reader
          turns off, and then the announcement that IS worth having goes with
          it.

          Filtering is that announcement. It replaces the grid's contents while
          focus stays on the chip, so nothing else would say what happened — and
          it is a count, not a recital. */}
      <p aria-live="polite" className="sr-only">
        {focus === null
          ? `Showing all ${columns.length} columns.`
          : shown.length === 0
            ? "That column is no longer on the board."
            : `Showing ${shown[0].label} only — ${countOf(shown[0]).total} card(s).`}
      </p>

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
                {/* The column's PURPOSE is the research brief's own definition
                    of the domain — the work, not narration — but it was printed
                    under every one of seven headers, so the board read as seven
                    explanatory paragraphs. It moves behind the header's own
                    disclosure: one glyph, reachable by keyboard and announced
                    on focus. */}
                <h3
                  className={`font-jetbrains flex items-center gap-1 text-label tracking-[0.16em] uppercase ${
                    d.id === "conclusions" ? "text-cyan-300" : orphan ? "text-amber-200" : "text-white"
                  }`}
                >
                  {d.label}
                  {d.purpose && <Hint label={`What ${d.label} is for`}>{d.purpose}</Hint>}
                </h3>
                <Tally
                  value={n.kept}
                  of={n.total}
                  tone={empty || orphan ? "amber" : "neutral"}
                  label="kept"
                />
              </div>

              {/* A card lands here because CARD_DIMENSION has no row for its id.
                  Saying so names the fix instead of leaving the reviewer to
                  wonder what they did — and it is the same sentence
                  check-notebook.mts prints, so the two reports agree. */}
              {orphan && (
                <p className="font-jetbrains mt-3 text-content leading-relaxed text-amber-200/85">
                  {cards.length === 1 ? "this card has" : `these ${cards.length} cards have`} no
                  dimension — tag {cards.length === 1 ? "it" : "them"} in
                  dimensions.ts::CARD_DIMENSION. Until then no domain column shows{" "}
                  {cards.length === 1 ? "it" : "them"}.
                </p>
              )}

              {/* AN EMPTY COLUMN IS TWO DIFFERENT FACTS and this surface cannot
                  tell which. `emptyByOmission` is "the run did not look here";
                  `notApplicable` is "there is nothing here to look at", which
                  is a finding rather than a failure. Both strings are required
                  on every column precisely so the reviewer can decide — and
                  until now only the first was ever drawn, so a legitimately
                  empty column rendered an accusation, which is how a reviewer
                  learns to ignore the accusation. The board states the alarm
                  and then names the innocent reading rather than picking one it
                  has no way to know. */}
              {empty ? (
                <div className="mt-3 flex items-center gap-2">
                  <CircleSlash className="h-4 w-4 shrink-0 text-amber-300/80" aria-hidden />
                  <span className="font-jetbrains text-label tracking-[0.12em] text-amber-200/85">
                    nothing here
                  </span>
                  <Hint variant="warn" tone="amber" label={`What an empty ${d.label} column means`}>
                    <span className="block">omission — {emptyMeansOf(d)}</span>
                    <span className="mt-1.5 block text-white/60">
                      not applicable — {d.notApplicable}
                    </span>
                  </Hint>
                </div>
              ) : (
                <>
                  {noneKept && !orphan && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="font-jetbrains text-label tracking-[0.12em] text-amber-200/85">
                        {d.id === "conclusions" ? "none taken" : "nothing in scope"}
                      </span>
                      <Hint variant="warn" tone="amber" label={`Why ${d.label} has nothing in scope`}>
                        {d.id === "conclusions"
                          ? "conclusions are reasoned, not researched — they stay out until you take one"
                          : emptyMeansOf(d)}
                      </Hint>
                    </div>
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
