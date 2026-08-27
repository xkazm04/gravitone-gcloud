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

import {
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
    grid-template-columns:minmax(0,1fr) repeat(5,4.25rem) 3.5rem 5.5rem 4.5rem;
  }
}`;

export default function ProjectsMatrix({
  projects,
  onOpen,
  onEdit,
  onDelete,
  onCreate,
}: ShelfProps) {
  if (projects.length === 0) return <EmptyShelf onCreate={onCreate} />;

  const rows = [...projects].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));

  return (
    <div>
      <style>{GRID_CSS}</style>

      <div className="mb-3 flex justify-end">
        <NewProjectButton onClick={onCreate} />
      </div>

      <div className="scroll-x rounded-2xl border border-white/8 bg-white/[0.015]">
        {/* column heads. The five steps are the spine of this surface, so they
            are the accent and everything else on this row recedes. */}
        <div
          className={`${GRID} font-jetbrains border-b border-white/8 bg-white/[0.02] px-3 py-2 text-[10px] tracking-[0.18em] text-white/35 uppercase`}
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
                className="truncate text-sm font-medium text-white"
                title={`${p.title} — ${DISCIPLINE_LABEL[p.discipline ?? disciplineOf(p.template)]} · ${templateOf(p.template).label}`}
              >
                {p.title}
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_TONE[projectState(p)].dot}`}
                title={STATE_TONE[projectState(p)].word}
              />
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
                  title={`${PHASE_TITLE[k]} — ${PHASE_STATE_WORD[p.progress[k]]} · open here`}
                  aria-label={`Open ${p.title} at ${PHASE_TITLE[k]} (${PHASE_STATE_WORD[p.progress[k]]})`}
                  className={`h-3 w-full rounded-[3px] transition hover:ring-2 hover:ring-cyan-300/50 focus-visible:outline-2 focus-visible:outline-offset-2 ${CELL[p.progress[k]]}`}
                />
              </span>
            ))}

            <span className="font-jetbrains text-right text-[11px] text-white/45">
              {fmtDur(p.targetS)}
            </span>
            <span className="font-jetbrains text-right text-[10px] text-white/30">
              {relTime(p.updatedAt)}
            </span>
            <span className="flex justify-end">
              <RowActions title={p.title} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
            </span>
          </div>
        ))}

        {/* the payoff: each step totalled down its own column */}
        <div
          className={`${GRID} font-jetbrains border-t border-white/8 bg-white/[0.02] px-3 py-2 text-[10px]`}
        >
          <span className="tracking-[0.18em] text-white/25 uppercase">Locked · stopped</span>
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

      <div className="font-jetbrains mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-[10px] text-white/35">
        {LEGEND.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-4 rounded-[3px] ${CELL[s]}`} />
            {PHASE_STATE_WORD[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
