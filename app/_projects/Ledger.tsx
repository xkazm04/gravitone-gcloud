"use client";

// V1 · LEDGER — the matrix (./ProjectsMatrix.tsx) evolved for a shelf of
// hundreds: the same thin row and the same five heat cells, plus the next move
// as a column, groups with headings that stay pinned while their rows scroll,
// and a body that only ever holds the rows in view.
//
// The matrix's two load-bearing ideas are kept verbatim: reading DOWN a step
// column is the point (so the footer totals each step over what is shown), and
// a cell opens the project AT that step.

import { useCallback, useMemo, useRef, useState } from "react";

import { PHASES, PHASE_STATE_WORD, PHASE_TITLE, projectState, templateOf, type PhaseState, type Project } from "@/lib/projects";

import { RowActions, STATE_TONE, fmtDur, relTime } from "./parts";
import ShelfHeader, { NoMatch, ProjectMarks, groupLabel } from "./ShelfHeader";
import { clearFilters, flattenGroups, nextAction, rowAt, type ShelfDefaults, type ShelfRow } from "./shelf";
import type { SurfaceProps } from "./surface";
import { useRevealOnMove, useShelf, useShelfKeys, useVirtual } from "./useShelf";

const DEFAULTS: ShelfDefaults = { group: "none", sort: "updated" };

/** Every row is exactly this tall; the windowing arithmetic depends on it. */
const ROW = 32;
const HEAD = 32;

const CELL: Record<PhaseState, string> = {
  done: "bg-emerald-300/45",
  working: "bg-cyan-300/45",
  review: "bg-amber-300/45",
  blocked: "bg-rose-400/55",
  empty: "border border-white/[0.09]",
};

/** The next move is inked by the state of the step it opens on — the same four
 *  status colours as the cell it points at — so a shelf of "Start Research" reads
 *  quiet and the one "Decide Frames" in it does not. */
export const MOVE_INK: Record<PhaseState, string> = {
  blocked: "text-rose-300",
  review: "text-amber-200",
  working: "text-cyan-200",
  empty: "text-white/60",
  done: "text-emerald-200/80",
};

// The matrix's grid (ProjectsMatrix.tsx GRID_CSS) with one track added for the
// next move. Real CSS for the reason stated there: an arbitrary-value template
// this long inside a breakpoint variant silently failed to generate.
const GRID = "gt-ledger";
const GRID_CSS = `
.gt-ledger{
  display:grid; align-items:center; column-gap:.375rem; min-width:44rem;
  grid-template-columns:minmax(0,1fr) repeat(5,1.75rem) 10rem 3rem 3.5rem 3.5rem;
}
@media (min-width:1024px){
  .gt-ledger{
    column-gap:.5rem;
    grid-template-columns:minmax(0,1fr) repeat(5,5.75rem) 12rem 3.75rem 6rem 4.5rem;
  }
}`;

const KEYS = [
  { keys: ["J", "K"], does: "next · previous" },
  { keys: ["Enter"], does: "open" },
  { keys: ["/"], does: "search" },
];

export default function Ledger({ projects, onOpen, onEdit, onDelete, onCreate, aside }: SurfaceProps) {
  const { query, setQuery, rows, groups, counts, total } = useShelf(projects, DEFAULTS);
  const grouped = query.group !== "none";
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const flat = useMemo(() => flattenGroups(groups, collapsed, grouped), [groups, collapsed, grouped]);
  const heights = useMemo(() => flat.map((r) => (r.kind === "group" ? HEAD : ROW)), [flat]);
  const order = useMemo(
    () => flat.flatMap((r) => (r.kind === "project" ? [r.project.id] : [])),
    [flat],
  );
  const byId = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows]);
  const indexOf = useCallback(
    (id: string) => flat.findIndex((r) => r.kind === "project" && r.project.id === id),
    [flat],
  );

  const open = useCallback((id: string) => {
    const p = byId.get(id);
    if (p) onOpen(p);
  }, [byId, onOpen]);
  const { activeId, setActiveId, moved, searchRef } = useShelfKeys(order, { onOpen: open });

  const box = useRef<HTMLDivElement | null>(null);
  const v = useVirtual(box, heights);
  useRevealOnMove(moved, activeId, indexOf, v.reveal, grouped ? HEAD : 0);

  // A filter re-reads the shelf from its first row.
  const { toTop } = v;
  const set = useCallback(
    (patch: Parameters<typeof setQuery>[0]) => {
      setQuery(patch);
      toTop();
    },
    [setQuery, toTop],
  );

  // The heading pinned over the body: the group the top visible row belongs to.
  // Drawn only once its own heading has scrolled under the top edge — before
  // that the in-flow heading is already there.
  let pinned: Extract<ShelfRow, { kind: "group" }> | null = null;
  if (grouped && flat.length > 0) {
    const top = rowAt(v.offsets, v.scrollTop);
    for (let i = top; i >= 0; i--) {
      const r = flat[i];
      if (r.kind === "group") {
        if (v.offsets[i] < v.scrollTop) pinned = r;
        break;
      }
    }
  }

  const pinnedKey = pinned?.key ?? "";

  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  // Tab lands on the cursor's row, or on the first rendered one — never on
  // every row of the shelf.
  const firstShown = flat.slice(v.start, v.end).find((r) => r.kind === "project");
  const tabTarget =
    activeId && indexOf(activeId) >= v.start && indexOf(activeId) < v.end
      ? activeId
      : firstShown?.kind === "project"
        ? firstShown.project.id
        : null;

  return (
    <div>
      <style>{GRID_CSS}</style>
      <ShelfHeader
        query={query}
        setQuery={set}
        counts={counts}
        shown={rows.length}
        total={total}
        searchRef={searchRef}
        keys={KEYS}
        onCreate={onCreate}
        aside={aside}
      />

      {rows.length === 0 ? (
        <NoMatch onClear={() => set(clearFilters(query))} />
      ) : (
        <div className="scroll-x rounded-2xl border border-white/8 bg-white/[0.015]">
          <div role="table" aria-label="Projects" aria-rowcount={rows.length}>
            <div
              role="row"
              className={`${GRID} font-jetbrains border-b border-white/8 bg-white/[0.02] px-3 py-2 text-label tracking-[0.18em] text-white/35 uppercase overflow-hidden [scrollbar-gutter:stable] [scrollbar-width:thin]`}
            >
              <span role="columnheader">Project</span>
              {PHASES.map((k, i) => (
                <span role="columnheader" key={k} className="text-center tracking-normal">
                  <span className="text-cyan-200">{i + 1}</span>
                  <span className="ml-1 hidden text-cyan-300/75 lg:inline">{PHASE_TITLE[k]}</span>
                  <span className="sr-only lg:hidden">{PHASE_TITLE[k]}</span>
                </span>
              ))}
              <span role="columnheader" className="tracking-normal">Next</span>
              <span role="columnheader" className="text-right tracking-normal">Run</span>
              <span role="columnheader" className="text-right tracking-normal">
                Upd<span className="hidden lg:inline">ated</span>
              </span>
              <span role="columnheader">
                <span className="sr-only">Actions</span>
              </span>
            </div>

            <div
              ref={box}
              onScroll={v.onScroll}
              role="rowgroup"
              className="scroll-y relative overflow-y-auto [scrollbar-gutter:stable]"
              style={{ maxHeight: "max(20rem, calc(100dvh - 30rem))" }}
            >
              {pinned && (
                <div aria-hidden className="sticky top-0 z-10 -mb-8 h-8">
                  <GroupHeading
                    label={groupLabel(query.group, pinned.key)}
                    count={pinned.count}
                    collapsed={pinned.collapsed}
                    onToggle={() => toggleGroup(pinnedKey)}
                    pinned
                  />
                </div>
              )}
              <div style={{ height: v.padTop }} />
              {flat.slice(v.start, v.end).map((r) =>
                r.kind === "group" ? (
                  <GroupHeading
                    key={`g:${r.key}`}
                    label={groupLabel(query.group, r.key)}
                    count={r.count}
                    collapsed={r.collapsed}
                    onToggle={() => toggleGroup(r.key)}
                  />
                ) : (
                  <LedgerRow
                    key={r.project.id}
                    p={r.project}
                    active={r.project.id === activeId}
                    tabbable={r.project.id === tabTarget}
                    onFocus={() => setActiveId(r.project.id)}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ),
              )}
              <div style={{ height: v.padBottom }} />
            </div>

            <StepTotals rows={rows} />
          </div>
        </div>
      )}
    </div>
  );
}

function GroupHeading({
  label,
  count,
  collapsed,
  onToggle,
  pinned = false,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  pinned?: boolean;
}) {
  return (
    <div
      role={pinned ? undefined : "row"}
      className="flex h-8 items-center border-b border-white/8 bg-[var(--gt-ink)] px-3"
    >
      <button
        type="button"
        role={pinned ? undefined : "rowheader"}
        aria-expanded={!collapsed}
        tabIndex={pinned ? -1 : 0}
        onClick={onToggle}
        className="font-jetbrains flex cursor-pointer items-center gap-2 text-label tracking-[0.14em] text-white/60 uppercase transition hover:text-white/85"
      >
        <span aria-hidden className={`inline-block transition ${collapsed ? "-rotate-90" : ""}`}>
          ▾
        </span>
        {label}
        <span className="tracking-normal text-white/35">{count}</span>
      </button>
    </div>
  );
}

function LedgerRow({
  p,
  active,
  tabbable,
  onFocus,
  onOpen,
  onEdit,
  onDelete,
}: {
  p: Project;
  active: boolean;
  tabbable: boolean;
  onFocus: () => void;
  onOpen: SurfaceProps["onOpen"];
  onEdit: SurfaceProps["onEdit"];
  onDelete: SurfaceProps["onDelete"];
}) {
  const state = projectState(p);
  const next = nextAction(p);
  return (
    <div
      role="row"
      data-shelf-id={p.id}
      tabIndex={tabbable ? 0 : -1}
      onFocus={(e) => e.target === e.currentTarget && onFocus()}
      onClick={() => onOpen(p)}
      aria-label={`${p.title}, ${STATE_TONE[state].word}, next: ${next.verb}`}
      className={`${GRID} group h-8 cursor-pointer overflow-hidden border-b border-white/[0.05] px-3 transition outline-none hover:bg-white/[0.035] focus-visible:bg-cyan-400/[0.06] ${
        active ? "bg-white/[0.04] shadow-[inset_2px_0_0_var(--gt-accent-cyan)]" : ""
      }`}
    >
      <div role="cell" className="flex min-w-0 items-center gap-2">
        <span className="truncate text-label font-medium text-white">{p.title}</span>
        <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_TONE[state].dot}`} />
        <span className="font-jetbrains hidden truncate text-label text-white/30 xl:inline">
          {templateOf(p.template).label}
        </span>
        <ProjectMarks p={p} />
      </div>

      {PHASES.map((k) => (
        <span role="cell" key={k} className="flex justify-center">
          <button
            type="button"
            tabIndex={-1}
            data-testid={`cell-${p.id}-${k}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(p, k);
            }}
            aria-label={`Open ${p.title} at ${PHASE_TITLE[k]} (${PHASE_STATE_WORD[p.progress[k]]})`}
            className={`h-3 w-full rounded-[3px] transition hover:ring-2 hover:ring-cyan-300/50 ${CELL[p.progress[k]]}`}
          />
        </span>
      ))}

      <span role="cell" className="min-w-0">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(p, next.step);
          }}
          className={`font-jetbrains block max-w-full cursor-pointer truncate text-left text-label transition hover:underline ${MOVE_INK[p.progress[next.step]]}`}
        >
          {next.verb}
        </button>
      </span>

      <span role="cell" className="font-jetbrains text-right text-label text-white/45">
        {fmtDur(p.targetS)}
      </span>
      <span role="cell" className="font-jetbrains text-right text-label text-white/30">
        {relTime(p.updatedAt)}
      </span>
      <span role="cell" className="flex justify-end">
        <RowActions title={p.title} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
      </span>
    </div>
  );
}

/** Each step totalled down its own column, over every row the filter kept —
 *  not over the window, which would make the totals a function of scroll. */
function StepTotals({ rows }: { rows: Project[] }) {
  const totals = useMemo(
    () =>
      PHASES.map((k) => ({
        k,
        done: rows.filter((p) => p.progress[k] === "done").length,
        stuck: rows.filter((p) => p.progress[k] === "blocked").length,
      })),
    [rows],
  );
  return (
    <div
      role="row"
      className={`${GRID} font-jetbrains border-t border-white/8 bg-white/[0.02] px-3 py-2 text-label overflow-hidden [scrollbar-gutter:stable] [scrollbar-width:thin]`}
    >
      <span role="cell" className="flex items-center gap-1.5">
        <span className="sr-only">Locked · stopped, per step</span>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-200/80" />
        <span aria-hidden className="text-white/20">·</span>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-300/80" />
      </span>
      {totals.map(({ k, done, stuck }) => (
        <span role="cell" key={k} className="text-center whitespace-nowrap">
          <span className={done ? "text-emerald-200/80" : "text-white/20"}>{done}</span>
          {stuck > 0 && <span className="text-rose-300/80"> · {stuck}</span>}
        </span>
      ))}
      <span role="cell" />
      <span role="cell" />
      <span role="cell" />
      <span role="cell" />
    </div>
  );
}
