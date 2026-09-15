"use client";

// THE SHELF — a progress matrix.
//
// Metaphor: the wall chart. Rows are projects, columns are the five steps, and
// the cell is the whole record — which means the grid answers a question a list
// cannot: read DOWN a column and you see every project stuck at Frames, or that
// Score has never once been started. Prototype round 1 ran this against a
// ledger (sortable columns) and a call sheet (queued by urgency); the matrix
// won because it is the only one of the three that compares.
//
// ONE THIN ROW PER PROJECT is the constraint everything else answers to:
//  · the progress column IS the table, so nothing is spent drawing it twice
//  · runtime is its own column, so the title cell is a single line
//  · the template is not a column at all — it is on the title's tooltip, where
//    it costs no height (and the runtime beside it already implies it)
//  · the bars are half-height, because a bar that only has to be distinguished
//    by colour does not need to be tall
//
// ~32px a row, and the footer totals each step: five numbers that say where the
// whole shelf is jammed.

import {
  DISCIPLINE_LABEL,
  PHASES,
  PHASE_STATE_WORD,
  PHASE_TITLE,
  disciplineOf,
  projectState,
  templateOf,
  type PhaseState,
} from "@/lib/projects";

import { isSeeded } from "@/app/_studio/projectSeed";

import {
  DemoTag,
  EmptyShelf,
  NewProjectButton,
  RowActions,
  STATE_TONE,
  fmtDur,
  relTime,
  type ShelfProps,
} from "./parts";

/** Cell fills. Read as a heat grid: filled = work exists, hollow = it does not,
 *  rose = it stopped. Same four status colours as every phase surface. */
const CELL: Record<PhaseState, string> = {
  done: "bg-emerald-300/45",
  working: "bg-cyan-300/45",
  review: "bg-amber-300/45",
  blocked: "bg-rose-400/55",
  empty: "border border-white/[0.09]",
};

const LEGEND: PhaseState[] = ["done", "working", "review", "blocked", "empty"];

// One grid definition, used by the header, every row and the footer — they can
// only stay aligned if they read the same rule.
//
// Real CSS rather than a Tailwind arbitrary value: `md:grid-cols-[minmax(0,1fr)
// _repeat(5,4.25rem)_…]` silently failed to generate (measured — the breakpoint
// columns never applied and every cell rendered at the mobile track width), and
// a ten-track template with commas and decimals inside a variant is past what
// arbitrary values should be asked to carry. Declared per-surface, the way
// components/ui/Modal.tsx declares its keyframes.
//
// The min-width is why the narrow case stays honest: below it the whole chart
// scrolls sideways as one piece, header and footer included, instead of
// crushing the project names to nothing.
const GRID = "gt-matrix";
const GRID_CSS = `
.gt-matrix{
  display:grid; align-items:center; column-gap:.375rem; min-width:33rem;
  grid-template-columns:minmax(0,1fr) repeat(5,1.75rem) 3rem 3.5rem 2.5rem;
}
@media (min-width:768px){
  .gt-matrix{
    column-gap:.5rem;
    grid-template-columns:minmax(0,1fr) repeat(5,5.75rem) 3.75rem 6rem 4.5rem;
  }
}`;

// WHY THESE TRACKS ARE WIDER THAN THEY LOOK. They are `rem` — root-relative —
// so they do NOT follow the type scale, and when the scale went up 2px on
// 2026-09-08 the md set (5×4.25rem, 3.5rem, 5.5rem) stopped fitting the very
// labels it was cut for: measured in the browser, an untracked "1 RESEARCH" at
// text-label 16px needs 90px against a 68px track, and it bled through SCRIPT
// and FRAMES. `Run` and `Updated` fit to the exact pixel, which is not a fit —
// a two-digit run or "100d ago" would have gone the same way. The five phase
// tracks are now 92px (90 needed) and the two right-hand columns carry a
// visible margin. If the scale moves again, re-measure rather than re-reason:
// max scrollWidth per track across `.gt-matrix` rows is the whole check.

export default function ProjectsMatrix({
  projects,
  onOpen,
  onEdit,
  onDelete,
  onCreate,
  aside,
}: ShelfProps) {
  if (projects.length === 0) return <EmptyShelf onCreate={onCreate} aside={aside} />;

  const rows = [...projects].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  return (
    <div>
      <style>{GRID_CSS}</style>

      <div className="mb-3 flex items-center justify-end gap-2">
        {aside}
        <NewProjectButton onClick={onCreate} />
      </div>

      <div className="scroll-x rounded-2xl border border-white/8 bg-white/[0.015]">
        {/* column heads. The five steps are the spine of this surface, so they
            are the accent and everything else on this row recedes. */}
        <div
          className={`${GRID} font-jetbrains border-b border-white/8 bg-white/[0.02] px-3 py-2 text-label tracking-[0.18em] text-white/35 uppercase`}
        >
          <span>Project</span>
          {PHASES.map((k, i) => (
            // tracking is dropped here: at 68px a tracked "RESEARCH" runs into
            // its neighbour, and the column head is the one place in this grid
            // that cannot afford to bleed.
            <span key={k} className="text-center tracking-normal" title={PHASE_TITLE[k]}>
              <span className="text-cyan-200">{i + 1}</span>
              <span className="ml-1 hidden text-cyan-300/75 md:inline">{PHASE_TITLE[k]}</span>
            </span>
          ))}
          <span className="text-right tracking-normal">Run</span>
          <span className="text-right tracking-normal">
            Upd<span className="hidden md:inline">ated</span>
          </span>
          <span />
        </div>

        {rows.map((p) => (
          <div
            key={p.id}
            onClick={() => onOpen(p)}
            className={`${GRID} group cursor-pointer border-b border-white/[0.05] px-3 py-1.5 transition last:border-0 hover:bg-white/[0.035]`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="truncate text-label font-medium text-white"
                title={`${p.title} — ${DISCIPLINE_LABEL[p.discipline ?? disciplineOf(p.template)]} · ${templateOf(p.template).label}`}
              >
                {p.title}
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_TONE[projectState(p)].dot}`}
                title={STATE_TONE[projectState(p)].word}
              />
              {/* Seeded rows are the account's demo shelf, not its work. The
                  tag rides in the title cell — the only track that flexes
                  (`minmax(0,1fr)`), so no measured phase track moves. */}
              {isSeeded(p) && <DemoTag />}
            </div>

            {PHASES.map((k) => (
              <span key={k} className="flex justify-center">
                {/* The cell is the affordance. Reading DOWN a column is what this
                    surface is for, so the natural next move — "open THAT project
                    at THAT step" — has to be one click from the cell you are
                    already looking at, not a trip through the project's default
                    step. */}
                <button
                  data-testid={`cell-${p.id}-${k}`}
                  onClick={(e) => { e.stopPropagation(); onOpen(p, k); }}
                  // `· open here` used to close this tooltip. The cell grows a
                  // cyan ring under the pointer that is already over it — the
                  // hover state IS the sentence, and the aria-label below says
                  // "Open …" for anyone the ring cannot reach. What the tooltip
                  // owes is the two facts the colour alone cannot carry.
                  title={`${PHASE_TITLE[k]} — ${PHASE_STATE_WORD[p.progress[k]]}`}
                  aria-label={`Open ${p.title} at ${PHASE_TITLE[k]} (${PHASE_STATE_WORD[p.progress[k]]})`}
                  className={`h-3 w-full rounded-[3px] transition hover:ring-2 hover:ring-cyan-300/50 focus-visible:outline-2 focus-visible:outline-offset-2 ${CELL[p.progress[k]]}`}
                />
              </span>
            ))}

            <span className="font-jetbrains text-right text-label text-white/45">
              {fmtDur(p.targetS)}
            </span>
            <span className="font-jetbrains text-right text-label text-white/30">
              {relTime(p.updatedAt)}
            </span>
            <span className="flex justify-end">
              <RowActions title={p.title} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
            </span>
          </div>
        ))}

        {/* the payoff: each step totalled down its own column */}
        <div
          className={`${GRID} font-jetbrains border-t border-white/8 bg-white/[0.02] px-3 py-2 text-label`}
        >
          {/* THE KEY TO THE ROW, DRAWN. This cell read `Locked · stopped` over
              five pairs of numbers that are already emerald and rose — the
              words were a colour key printed in words, one column left of the
              colours themselves. Two dots in the same two tones ARE the key,
              and they sit in the reading order the pairs do. The words survive
              `sr-only`, because a dot is nothing to a screen reader. */}
          <span className="flex items-center gap-1.5">
            <span className="sr-only">Locked · stopped, per step</span>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-200/80" />
            <span aria-hidden className="text-white/20">·</span>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-300/80" />
          </span>
          {PHASES.map((k) => {
            const done = rows.filter((p) => p.progress[k] === "done").length;
            const stuck = rows.filter((p) => p.progress[k] === "blocked").length;
            return (
              <span key={k} className="text-center whitespace-nowrap">
                <span className={done ? "text-emerald-200/80" : "text-white/20"}>{done}</span>
                {stuck > 0 && <span className="text-rose-300/80"> · {stuck}</span>}
              </span>
            );
          })}
          <span />
          <span />
          <span />
        </div>
      </div>

      {/* THE LEGEND, PROGRESSIVELY DISCLOSED. Five swatches with their five
          words printed beside them is right the first time somebody reads this
          chart and dead weight on every visit after — and it was the last row
          on the page, so it was five words of chrome under every shelf forever.

          At rest it is one strip of colour, which is the same object the grid
          above is made of. The words come back on hover of the strip, in a row
          that occupies no height until then, so nothing on the page moves
          except below the pointer. The full key is `sr-only` and permanent: a
          strip of colour tells a screen reader nothing, and a hover is not a
          gesture every reader has. */}
      <div className="group mt-2.5 w-fit px-1">
        <p className="sr-only">
          Cell colours: {LEGEND.map((s) => PHASE_STATE_WORD[s]).join(", ")}.
        </p>
        {/* At rest: one strip, the swatches butted together so they read as a
            single band of the grid's own vocabulary rather than five chips. */}
        <div aria-hidden className="flex items-center gap-0.5 group-hover:hidden">
          {LEGEND.map((s) => (
            <span key={s} className={`h-2.5 w-8 rounded-[3px] ${CELL[s]}`} />
          ))}
        </div>
        {/* On hover: the named key, each word beside its own swatch. Swapped
            rather than revealed underneath — a word truncated to a swatch's
            width is worse than no word, and "in progress" / "not started" do
            not fit one. */}
        <div
          aria-hidden
          className="font-jetbrains hidden flex-wrap items-center gap-x-4 gap-y-1.5 text-label text-white/35 group-hover:flex"
        >
          {LEGEND.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className={`h-2.5 w-4 rounded-[3px] ${CELL[s]}`} />
              {PHASE_STATE_WORD[s]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
