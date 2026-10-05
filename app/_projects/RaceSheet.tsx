"use client";

// V2 · RACE SHEET — StatReel's rundown (apps/studio/src/routes/Projects.tsx
// RaceSheet/RaceLane) re-drawn for five steps: one lane per project, the five
// steps as gates on a track, a marker where the next move is, and that move as
// the lane's one button. Ordered "needs you next" unless the URL says otherwise.
//
// The track replaces the matrix's five cells with a position: a project is a
// runner that has got SO FAR, and the lanes read as a field — who is near the
// line, who is stopped at a gate — before any one of them is read.

import { ArrowRight, Flag } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { DISCIPLINE_LABEL, PHASES, PHASE_STATE_WORD, PHASE_TITLE, disciplineOf, projectState, templateOf, type PhaseState, type Project } from "@/lib/projects";

import { RowActions, STATE_TONE, fmtDur, relTime } from "./parts";
import ShelfHeader, { NoMatch, ProjectMarks, STATE_SIGNAL, groupLabel } from "./ShelfHeader";
import {
  GATE_POS,
  STATE_ORDER,
  clearFilters,
  compareNeedsYou,
  flattenGroups,
  lockedRun,
  nextAction,
  stateCounts,
  type ShelfDefaults,
} from "./shelf";
import type { SurfaceProps } from "./surface";
import { useRevealOnMove, useShelf, useShelfKeys, useVirtual } from "./useShelf";
import { StackBar } from "@/components/ui/signal";

const DEFAULTS: ShelfDefaults = { group: "none", sort: "needs-you" };

const LANE = 64;
const HEAD = 44;

const GATE: Record<PhaseState, string> = {
  done: "border-emerald-300/80 bg-emerald-300/80",
  working: "border-cyan-300/80 bg-cyan-300/40",
  review: "border-amber-300/90 bg-amber-300/50",
  blocked: "border-rose-400 bg-rose-400/70",
  empty: "border-white/25 bg-[var(--gt-ink)]",
};

// Marker and button take the state of the step the move opens on, like the
// ledger's next-move column (Ledger.tsx MOVE_INK): a field of "Start Research"
// stays quiet so the calls and the stops stand out of it.
const MARKER: Record<PhaseState, string> = {
  review: "border-amber-200 shadow-[0_0_0_4px_var(--gt-wash)]",
  blocked: "border-rose-300 shadow-[0_0_0_4px_var(--gt-wash)]",
  working: "border-cyan-200",
  empty: "border-white/45",
  done: "border-emerald-200",
};

const CTA: Record<PhaseState, string> = {
  review: "border-amber-400/45 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20",
  blocked: "border-rose-400/45 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20",
  working: "border-cyan-400/40 bg-cyan-400/[0.07] text-cyan-100 hover:bg-cyan-400/15",
  empty: "border-white/15 text-white/65 hover:bg-white/[0.05]",
  done: "border-emerald-400/30 text-emerald-200/85 hover:bg-emerald-400/10",
};

const GRID = "gt-race";
const GRID_CSS = `
.gt-race{
  display:grid; align-items:center; column-gap:1rem; min-width:56rem;
  grid-template-columns:minmax(14rem,1fr) minmax(24rem,1.6fr) 12rem 4.5rem;
}`;

const KEYS = [
  { keys: ["J", "K"], does: "next · previous" },
  { keys: ["Enter"], does: "do the next move" },
  { keys: ["/"], does: "search" },
];

export default function RaceSheet({ projects, onOpen, onEdit, onDelete, onCreate, aside }: SurfaceProps) {
  const { query, setQuery, rows, groups, counts, total } = useShelf(projects, DEFAULTS);
  const grouped = query.group !== "none";
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const flat = useMemo(() => flattenGroups(groups, collapsed, grouped), [groups, collapsed, grouped]);
  const heights = useMemo(() => flat.map((r) => (r.kind === "group" ? HEAD : LANE)), [flat]);
  const order = useMemo(() => flat.flatMap((r) => (r.kind === "project" ? [r.project.id] : [])), [flat]);
  const byId = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows]);
  const indexOf = useCallback(
    (id: string) => flat.findIndex((r) => r.kind === "project" && r.project.id === id),
    [flat],
  );
  const groupCounts = useMemo(() => new Map(groups.map((g) => [g.key, stateCounts(g.projects)])), [groups]);

  // Enter on a lane does what its button says — the lane IS its next move.
  const open = useCallback(
    (id: string) => {
      const p = byId.get(id);
      if (p) onOpen(p, nextAction(p).step);
    },
    [byId, onOpen],
  );
  const { activeId, setActiveId, moved, searchRef } = useShelfKeys(order, { onOpen: open });

  const box = useRef<HTMLDivElement | null>(null);
  const v = useVirtual(box, heights, 4);
  useRevealOnMove(moved, activeId, indexOf, v.reveal);
  const { toTop } = v;
  const set = useCallback(
    (patch: Parameters<typeof setQuery>[0]) => {
      setQuery(patch);
      toTop();
    },
    [setQuery, toTop],
  );

  // The one lane the sheet would call out, whatever the sort: StatReel's
  // `sayLine` without the sentence — the first project that is waiting on you.
  const up = useMemo(() => {
    let best: Project | null = null;
    for (const p of rows) {
      const t = nextAction(p).tone;
      if ((t === "you" || t === "blocked") && (!best || compareNeedsYou(p, best) < 0)) best = p;
    }
    return best;
  }, [rows]);

  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

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
          {up && <UpNext p={up} onOpen={onOpen} />}
          <div role="table" aria-label="Projects by step" aria-rowcount={rows.length}>
            <div
              role="row"
              className={`${GRID} font-jetbrains overflow-hidden border-b border-white/8 bg-white/[0.02] px-4 py-2 text-label text-white/35 [scrollbar-gutter:stable] [scrollbar-width:thin]`}
            >
              <span role="columnheader" className="tracking-[0.18em] uppercase">
                Project
              </span>
              <div role="columnheader" aria-label="Steps, five gates" className="relative h-6">
                {PHASES.map((k, i) => (
                  <span
                    key={k}
                    aria-hidden
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${GATE_POS(i)}%` }}
                  >
                    <span className="text-cyan-200">{i + 1}</span>{" "}
                    <span className="text-cyan-300/75">{PHASE_TITLE[k]}</span>
                  </span>
                ))}
                <Flag aria-hidden className="absolute top-0.5 right-0 h-4 w-4 text-emerald-200/50" />
              </div>
              <span role="columnheader" className="tracking-[0.18em] uppercase">
                Next
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
              style={{ maxHeight: "max(22rem, calc(100dvh - 27rem))" }}
            >
              <div style={{ height: v.padTop }} />
              {flat.slice(v.start, v.end).map((r) =>
                r.kind === "group" ? (
                  <Swimlane
                    key={`g:${r.key}`}
                    label={groupLabel(query.group, r.key)}
                    count={r.count}
                    collapsed={r.collapsed}
                    counts={groupCounts.get(r.key)}
                    onToggle={() => toggleGroup(r.key)}
                  />
                ) : (
                  <Lane
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
          </div>
        </div>
      )}
    </div>
  );
}

function UpNext({ p, onOpen }: { p: Project; onOpen: SurfaceProps["onOpen"] }) {
  const next = nextAction(p);
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-white/8 px-4 py-2.5">
      <span className="font-jetbrains text-label tracking-[0.18em] text-amber-200/80 uppercase">Up next</span>
      <span className="text-content font-medium text-white">{p.title}</span>
      <button
        type="button"
        onClick={() => onOpen(p, next.step)}
        className={`font-jetbrains inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-0.5 text-label transition ${CTA[p.progress[next.step]]}`}
      >
        {next.verb}
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Swimlane({
  label,
  count,
  collapsed,
  counts,
  onToggle,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  counts?: ReturnType<typeof stateCounts>;
  onToggle: () => void;
}) {
  return (
    <div role="row" className="flex h-11 items-center gap-4 border-b border-white/8 bg-white/[0.025] px-4">
      <button
        type="button"
        role="rowheader"
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="font-jetbrains flex shrink-0 cursor-pointer items-center gap-2 text-label tracking-[0.14em] text-white/70 uppercase transition hover:text-white"
      >
        <span aria-hidden className={`inline-block transition ${collapsed ? "-rotate-90" : ""}`}>
          ▾
        </span>
        {label}
        <span className="tracking-normal text-white/40">{count}</span>
      </button>
      {counts && (
        <StackBar
          className="max-w-[16rem] flex-1"
          showCounts={false}
          label={`${label} by state`}
          segments={STATE_ORDER.map((s) => ({ n: counts[s], tone: STATE_SIGNAL[s], label: STATE_TONE[s].word }))}
        />
      )}
    </div>
  );
}

function Lane({
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
  const run = lockedRun(p);
  const at = PHASES.indexOf(next.step);
  const done = next.tone === "done";
  const kind = DISCIPLINE_LABEL[p.discipline ?? disciplineOf(p.template)];
  const tpl = templateOf(p.template).label;
  return (
    <div
      role="row"
      data-shelf-id={p.id}
      tabIndex={tabbable ? 0 : -1}
      onFocus={(e) => e.target === e.currentTarget && onFocus()}
      onClick={() => onOpen(p)}
      aria-label={`${p.title}, ${STATE_TONE[state].word}, next: ${next.verb}`}
      className={`${GRID} group h-16 cursor-pointer overflow-hidden border-b border-white/[0.05] px-4 transition outline-none hover:bg-white/[0.03] focus-visible:bg-cyan-400/[0.06] ${
        active ? "bg-white/[0.04] shadow-[inset_2px_0_0_var(--gt-accent-cyan)]" : ""
      }`}
    >
      <div role="cell" className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_TONE[state].dot}`} />
          <span className="truncate text-content font-medium text-white">{p.title}</span>
          <ProjectMarks p={p} />
        </div>
        <div className="font-jetbrains mt-0.5 flex min-w-0 items-center gap-2 truncate text-label text-white/35">
          {/* Music video's one template is called "Music video": the pair would
              print the same words twice. */}
          {kind !== tpl && (
            <>
              <span className="truncate">{kind}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="truncate">{tpl}</span>
          <span aria-hidden>·</span>
          <span>{fmtDur(p.targetS)}</span>
          <span aria-hidden>·</span>
          <span className="whitespace-nowrap">{relTime(p.updatedAt)}</span>
        </div>
      </div>

      {/* The track. Rail across, trail over the unbroken run of locked steps,
          a gate per step in its reported state, a ring where the next move is,
          and the finish line past Cut. */}
      <div role="cell" className="relative h-full" aria-label={`${PHASE_TITLE[next.step]}: ${PHASE_STATE_WORD[p.progress[next.step]]}`}>
        <span aria-hidden className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-white/10" />
        {run >= 0 && (
          <span
            aria-hidden
            className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-emerald-300/55"
            style={{ width: `${done ? 100 : GATE_POS(run)}%` }}
          />
        )}
        <span aria-hidden className="absolute top-2 right-0 bottom-2 border-r border-dashed border-emerald-300/35" />
        {PHASES.map((k, i) => (
          <button
            key={k}
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              onOpen(p, k);
            }}
            aria-label={`Open ${p.title} at ${PHASE_TITLE[k]} (${PHASE_STATE_WORD[p.progress[k]]})`}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border transition hover:ring-2 hover:ring-cyan-300/50 ${GATE[p.progress[k]]}`}
            style={{ left: `${GATE_POS(i)}%` }}
          />
        ))}
        {!done && (
          <span
            aria-hidden
            className={`pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${MARKER[p.progress[next.step]]}`}
            style={{ left: `${GATE_POS(at)}%` }}
          />
        )}
        {done && (
          <Flag aria-hidden className="absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-emerald-200" />
        )}
      </div>

      <span role="cell">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(p, next.step);
          }}
          className={`font-jetbrains inline-flex max-w-full cursor-pointer items-center gap-1.5 truncate rounded-full border px-3 py-1 text-label transition ${CTA[p.progress[next.step]]}`}
        >
          <span className="truncate">{next.verb}</span>
          {!done && <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0" />}
        </button>
      </span>

      <span role="cell" className="flex justify-end">
        <RowActions title={p.title} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
      </span>
    </div>
  );
}
