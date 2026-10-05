"use client";

// THE RACE SHEET — StatReel's rundown (apps/studio/src/routes/Projects.tsx
// RaceSheet/RaceLane) re-drawn for five steps: one lane per project, the five
// steps as gates on a track, a marker where the next move is, and that move as
// the lane's one button. Ordered "needs you next" unless the URL says otherwise.
//
// The track replaces a matrix's five cells with a position: a project is a
// runner that has got SO FAR, and the lanes read as a field — who is near the
// line, who is stopped at a gate — before any one of them is read. It won the
// round-1 bake-off against a windowed ledger and a pivot board (2026-10-05) and
// is the shelf now.
//
// ── How a filter lands (round 2) ──────────────────────────────────────────
// Measured before this pass, on ?seed=300: a pick sat on the OLD rows for
// ~240ms (a router round trip — fixed in useShelf.ts#setQuery), then every row
// swapped in one frame, the panel snapped from 700px to 128px, and everything
// under it jumped up by the difference. Nothing remounted — the list was
// mounted throughout — so this was never a flash of empty; it was a hard cut
// plus a layout jump. Now:
//   · the lanes of a new arrangement ENTER: a 160ms fade-and-rise, staggered
//     12ms a lane down the window (≤ 8 steps, so the last starts by 96ms and
//     the wave is over by ~250ms). Search keystrokes do not restart the wave —
//     only lanes that were not on screen fade in — or typing would strobe;
//   · the scroller's height is DECLARED from the windowing offsets and eased,
//     so the panel and whatever sits under it settle rather than snap;
//   · lanes that mount because you SCROLLED do not animate. Entrance is for a
//     new answer, and a scroll is the same answer read further down.
// Reduced motion: none of it — `useReducedMotion` returns the plain cut.

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Flag, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { StackBar } from "@/components/ui/signal";
import { EASE } from "@/components/ui/tokens";
import {
  PHASES,
  PHASE_STATE_WORD,
  PHASE_TITLE,
  projectState,
  stateOf,
  templateOf,
  type PhaseState,
  type Project,
  type ProjectState,
} from "@/lib/projects";

import { HollowLane, RowActions, STATE_TONE, fmtDur, relTime } from "./parts";
import ShelfToolbar, { ProjectMarks, STATE_SIGNAL, groupLabel } from "./ShelfHeader";
import {
  GATE_POS,
  STATE_ORDER,
  clearFilters,
  compareNeedsYou,
  flattenGroups,
  lockedRun,
  nextAction,
  queryToParams,
  stateCounts,
  type StateCounts,
} from "./shelf";
import type { SurfaceProps } from "./surface";
import { useRevealOnMove, useShelf, useShelfKeys, useVirtual } from "./useShelf";

/** Row heights, px. The windowing arithmetic (useShelf.ts#useVirtual) is only
 *  as true as these: every lane and every swimlane is drawn at exactly this. */
export const LANE = 64;
export const HEAD = 44;
/** Rows rendered past each edge of the viewport. */
export const OVERSCAN = 4;
/** The no-match state stands where three lanes would. */
const NO_MATCH_H = LANE * 3;

/** The list never stands shorter than this, however short the window: 5½ lanes. */
export const LIST_MIN_PX = 352;
/** What sits under the list on the page: the sheet's bottom edge, the style
 *  line (ProjectsView.tsx, `gated`), and <main>'s bottom padding. */
const BELOW_PX = 112;

const GATE: Record<PhaseState, string> = {
  done: "border-emerald-300/80 bg-emerald-300/80",
  working: "border-cyan-300/80 bg-cyan-300/40",
  review: "border-amber-300/90 bg-amber-300/50",
  blocked: "border-rose-400 bg-rose-400/70",
  empty: "border-white/25 bg-[var(--gt-ink)]",
};

// Marker and button take the state of the step the move opens on: a field of
// "Start Research" stays quiet so the calls and the stops stand out of it.
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

/** StackBar's fills (components/ui/signal/StackBar.tsx FILL), per project state. */
const RULE_FILL: Record<ProjectState, string> = {
  blocked: "bg-rose-400/75",
  review: "bg-amber-300/80",
  working: "bg-cyan-300/80",
  draft: "bg-white/20",
  delivered: "bg-emerald-300/75",
};

const GRID = "gt-race";
const GRID_CSS = `
.gt-race{
  display:grid; align-items:center; column-gap:1rem; min-width:56rem;
  grid-template-columns:minmax(15rem,1.1fr) minmax(22rem,1.4fr) 13.5rem 4.5rem;
}`;

const KEYS = [
  { keys: ["J", "K"], does: "next · previous" },
  { keys: ["Enter"], does: "do the next move" },
  { keys: ["/"], does: "search" },
];

/** The settle window: lanes that mount inside it (a new answer) enter; lanes
 *  that mount after it (a scroll) do not. Comfortably past the last lane's end. */
const SETTLE_MS = 450;

export default function RaceSheet({ projects, onOpen: leave, onEdit, onDelete, onCreate, aside }: SurfaceProps) {
  const { query, setQuery, flush, rows, groups, counts, total, facets } = useShelf(projects);
  // Every way out of the shelf writes the URL first (useShelf.ts#flush).
  const onOpen = useCallback<SurfaceProps["onOpen"]>(
    (p, step) => {
      flush();
      leave(p, step);
    },
    [flush, leave],
  );
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
  const head = useRef<HTMLDivElement | null>(null);
  const v = useVirtual(box, heights, OVERSCAN);

  // THE LIST ENDS AT THE WINDOW'S FOOT. It was `calc(100dvh - 27rem)`, a guess
  // at the chrome above it, and the guess was wrong the moment that chrome
  // changed height — measured 2026-10-05, the page scrolled 100px at 1920 as
  // well as the list, two scrollbars for one shelf. Measured instead: the box's
  // own top, read again whenever the toolbar re-wraps or the window resizes.
  const [cap, setCap] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const bar = head.current;
    if (!el || !bar || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      setCap(Math.max(LIST_MIN_PX, Math.floor(window.innerHeight - top - BELOW_PX)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useRevealOnMove(moved, activeId, indexOf, v.reveal);
  const { toTop } = v;
  const set = useCallback(
    (patch: Parameters<typeof setQuery>[0]) => {
      setQuery(patch);
      toTop();
    },
    [setQuery, toTop],
  );

  /* ── The entrance wave ──────────────────────────────────────────────────
   *
   * `arrangement` is every part of the query but the search text. When it
   * changes, `wave` ticks and every lane in the window is re-keyed, so the
   * new answer enters as a whole. A search change only opens the settle
   * window: lanes keep their keys, and only the ones new to the window fade in.
   * Adjusted during render (the `prevQ` idiom ShelfHeader.tsx#SearchBox uses)
   * so the first paint of a new answer is already the first frame of its
   * entrance, never one frame of the plain list first. Opens settled-in on
   * mount, so the first visit enters too. */
  const arrangement = queryToParams({ ...query, q: "" }).toString();
  const [wave, setWave] = useState({ key: arrangement, n: 0 });
  const [seenQ, setSeenQ] = useState(query.q);
  const [settling, setSettling] = useState(true);
  if (wave.key !== arrangement) {
    setWave({ key: arrangement, n: wave.n + 1 });
    setSettling(true);
  }
  if (seenQ !== query.q) {
    setSeenQ(query.q);
    setSettling(true);
  }
  useEffect(() => {
    if (!settling) return;
    const t = window.setTimeout(() => setSettling(false), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, [settling, wave.n, seenQ]);
  const reduce = useReducedMotion();
  const enter = settling && !reduce;

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

  const empty = rows.length === 0;
  const contentH = empty ? NO_MATCH_H : (v.offsets[v.offsets.length - 1] ?? 0);

  return (
    <div>
      <style>{GRID_CSS}</style>
      <div ref={head}>
        <ShelfToolbar
          query={query}
          setQuery={set}
          counts={counts}
          facets={facets}
          shown={rows.length}
          total={total}
          searchRef={searchRef}
          keys={KEYS}
          onCreate={onCreate}
          aside={aside}
        />
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.035] to-white/[0.01] backdrop-blur-[14px]">
        <StateRule counts={counts} picked={query.states} />
        <div className="scroll-x">
          <UpNext p={up} onOpen={onOpen} />
          <div role="table" aria-label="Projects by step" aria-rowcount={flat.length + 1}>
            <div
              role="row"
              aria-rowindex={1}
              className={`${GRID} font-jetbrains overflow-hidden border-b border-white/[0.07] px-4 py-2 text-label text-white/35 [scrollbar-gutter:stable] [scrollbar-width:thin]`}
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

            {/* The height is DECLARED — the sum of the rows, capped — rather
                than left to the content, so a filter's change of size can be
                eased instead of snapped. The ResizeObserver in useVirtual reads
                the box as it eases, so the window follows it. */}
            <div
              ref={box}
              onScroll={v.onScroll}
              role="rowgroup"
              className="scroll-y relative overflow-y-auto transition-[height] duration-200 ease-[var(--gt-ease)] [scrollbar-gutter:stable] motion-reduce:transition-none"
              style={{ height: Math.min(contentH, cap ?? 720) }}
            >
              {empty ? (
                <NoMatch onClear={() => set(clearFilters(query))} />
              ) : (
                <>
                  <div style={{ height: v.padTop }} />
                  {flat
                    .slice(v.start, v.end)
                    .map((r, i) =>
                      r.kind === "group" ? (
                        <Swimlane
                          key={`${wave.n}:g:${r.key}`}
                          label={groupLabel(query.group, r.key)}
                          count={r.count}
                          collapsed={r.collapsed}
                          counts={groupCounts.get(r.key)}
                          onToggle={() => toggleGroup(r.key)}
                          rowIndex={v.start + i + 2}
                          delay={enter ? Math.min(i, 8) * 0.012 : null}
                        />
                      ) : (
                        <Lane
                          key={`${wave.n}:${r.project.id}`}
                          p={r.project}
                          active={r.project.id === activeId}
                          tabbable={r.project.id === tabTarget}
                          onFocus={() => setActiveId(r.project.id)}
                          onOpen={onOpen}
                          onEdit={onEdit}
                          onDelete={onDelete}
                          rowIndex={v.start + i + 2}
                          delay={enter ? Math.min(i, 8) * 0.012 : null}
                        />
                      ),
                    )}
                  <div style={{ height: v.padBottom }} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** THE STATE RULE — what the stack bar over the shelf said, as the sheet's top
 *  edge: 2px, no height of its own, segments to scale over the same facet the
 *  State dropdown counts. A state the filter leaves out stays drawn, dimmed, so
 *  the rule still says where the shown slice sits in the whole. Widths ease, so
 *  a filter's new proportions slide rather than jump. The counts are spoken by
 *  the State dropdown's options; this is their picture, and `aria-hidden`. */
function StateRule({ counts, picked }: { counts: StateCounts; picked: readonly ProjectState[] }) {
  return (
    <div aria-hidden className="flex h-0.5 w-full bg-white/[0.04]">
      {counts.total > 0 &&
        STATE_ORDER.map((s) => (
          <span
            key={s}
            className={`${RULE_FILL[s]} transition-[flex-grow,opacity] duration-300 ease-[var(--gt-ease)] motion-reduce:transition-none ${
              picked.length > 0 && !picked.includes(s) ? "opacity-25" : ""
            }`}
            style={{ flexGrow: counts[s], flexBasis: 0 }}
          />
        ))}
    </div>
  );
}

/** The first project waiting on you. Always a row — when nothing is waiting it
 *  says so in the row's own place, so the column heads under it never jump as
 *  a filter brings a caller in or takes the last one out. */
function UpNext({ p, onOpen }: { p: Project | null; onOpen: SurfaceProps["onOpen"] }) {
  const next = p ? nextAction(p) : null;
  return (
    <div className="flex h-11 items-center gap-3 border-b border-white/[0.07] px-4">
      <span className="font-jetbrains text-label tracking-[0.18em] text-amber-200/80 uppercase">Up next</span>
      {p && next ? (
        <>
          <span className="truncate text-content font-medium text-white">{p.title}</span>
          <button
            type="button"
            onClick={() => onOpen(p, next.step)}
            className={`font-jetbrains inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 py-0.5 text-label transition ${CTA[stateOf(p, next.step)]}`}
          >
            {next.verb}
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <span className="font-jetbrains text-label text-white/35">nothing waiting on you</span>
      )}
    </div>
  );
}

/** A filter that matched nothing: three hollow lanes where the rows would be,
 *  the headline over them, and the one move that brings them back. Inside the
 *  sheet, under the column heads, so the frame of the answer stays put. */
function NoMatch({ onClear }: { onClear: () => void }) {
  return (
    <div className="relative" style={{ height: NO_MATCH_H }}>
      <div aria-hidden className="absolute inset-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${GRID} h-16 border-b border-white/[0.04] px-4`}>
            <div className="space-y-2">
              <div className="h-2.5 w-40 rounded-full bg-white/[0.05]" />
              <div className="h-2 w-56 rounded-full bg-white/[0.03]" />
            </div>
            <HollowLane labels={false} dim />
            <div className="h-6 w-32 rounded-full border border-white/[0.06]" />
            <span />
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[radial-gradient(closest-side,var(--gt-ink),transparent)]">
        <p role="status" className="font-instrument text-2xl text-white/80">
          No project matches.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="font-jetbrains inline-flex cursor-pointer items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1.5 text-label text-cyan-200 transition hover:bg-cyan-400/20"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
          clear filters
        </button>
      </div>
    </div>
  );
}

/** motion's entrance for a row, or none: `delay` null means "mounted by a
 *  scroll, or reduced motion" and the row is simply there. */
function entrance(delay: number | null) {
  return delay === null
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.16, ease: EASE, delay },
      };
}

function Swimlane({
  label,
  count,
  collapsed,
  counts,
  onToggle,
  rowIndex,
  delay,
}: {
  label: string;
  count: number;
  collapsed: boolean;
  counts?: StateCounts;
  onToggle: () => void;
  /** 1-based position in the whole table (header = 1): the list is windowed, so
   *  the DOM position is not the real one. Optional for plain-function callers. */
  rowIndex?: number;
  delay: number | null;
}) {
  return (
    <motion.div
      role="row"
      aria-rowindex={rowIndex}
      {...entrance(delay)}
      className="flex h-11 items-center gap-4 border-b border-white/[0.07] bg-white/[0.025] px-4"
    >
      {/* role=rowheader on the <button> itself would replace its button role,
          so the toggle is announced as a heading cell and not as something
          that can be pressed. The cell carries the role; the button stays one. */}
      <span role="rowheader" className="shrink-0">
        <button
          type="button"
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
      </span>
      {counts && (
        <div role="cell" className="max-w-[16rem] flex-1">
          <StackBar
            className="w-full"
            showCounts={false}
            label={`${label} by state`}
            segments={STATE_ORDER.map((s) => ({ n: counts[s], tone: STATE_SIGNAL[s], label: STATE_TONE[s].word }))}
          />
        </div>
      )}
    </motion.div>
  );
}

/** One project's lane. Hook-free on purpose: tests/golden-path/render-budget
 *  calls it as a plain function to weigh the DOM a lane costs. */
export function Lane({
  p,
  active,
  tabbable,
  onFocus,
  onOpen,
  onEdit,
  onDelete,
  rowIndex,
  delay = null,
}: {
  p: Project;
  active: boolean;
  tabbable: boolean;
  onFocus: () => void;
  onOpen: SurfaceProps["onOpen"];
  onEdit: SurfaceProps["onEdit"];
  onDelete: SurfaceProps["onDelete"];
  /** 1-based position in the whole table (header = 1); see Swimlane. */
  rowIndex?: number;
  delay?: number | null;
}) {
  const state = projectState(p);
  const next = nextAction(p);
  const run = lockedRun(p);
  const at = PHASES.indexOf(next.step);
  const done = next.tone === "done";
  const tpl = templateOf(p.template).label;
  return (
    <motion.div
      role="row"
      data-shelf-id={p.id}
      aria-rowindex={rowIndex}
      tabIndex={tabbable ? 0 : -1}
      {...entrance(delay)}
      onFocus={(e) => e.target === e.currentTarget && onFocus()}
      onClick={() => onOpen(p, next.step)}
      aria-label={`${p.title}, ${STATE_TONE[state].word}, next: ${next.verb}`}
      className={`${GRID} group h-16 cursor-pointer overflow-hidden border-b border-white/[0.045] px-4 transition-colors outline-none hover:bg-white/[0.03] focus-visible:bg-cyan-400/[0.06] ${
        active ? "bg-white/[0.04] shadow-[inset_2px_0_0_var(--gt-accent-cyan)]" : ""
      }`}
    >
      <div role="cell" className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_TONE[state].dot}`} />
          <span className="truncate text-content font-medium text-white">{p.title}</span>
          <ProjectMarks p={p} />
        </div>
        <div className="font-jetbrains mt-0.5 flex min-w-0 items-center gap-2 truncate pl-3.5 text-label text-white/35">
          {/* The template, not the discipline as well: every template belongs
              to exactly one discipline (lib/projects.ts TEMPLATE_FAMILY), so the
              pair said one fact twice — and at 1280 it was the pair that got
              truncated to "Movie · game… · Tea…". The discipline is the Type
              dropdown's first group and a grouping of its own. */}
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
      <div role="cell" className="relative h-full" aria-label={`${PHASE_TITLE[next.step]}: ${PHASE_STATE_WORD[stateOf(p, next.step)]}`}>
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
            aria-label={`Open ${p.title} at ${PHASE_TITLE[k]} (${PHASE_STATE_WORD[stateOf(p, k)]})`}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border transition hover:ring-2 hover:ring-cyan-300/50 ${GATE[stateOf(p, k)]}`}
            style={{ left: `${GATE_POS(i)}%` }}
          />
        ))}
        {!done && (
          <span
            aria-hidden
            className={`pointer-events-none absolute top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${MARKER[stateOf(p, next.step)]}`}
            style={{ left: `${GATE_POS(at)}%` }}
          />
        )}
        {done && <Flag aria-hidden className="absolute top-1/2 right-1 h-4 w-4 -translate-y-1/2 text-emerald-200" />}
      </div>

      <span role="cell">
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(p, next.step);
          }}
          className={`font-jetbrains inline-flex max-w-full cursor-pointer items-center gap-1.5 truncate rounded-full border px-3 py-1 text-label transition ${CTA[stateOf(p, next.step)]}`}
        >
          <span className="truncate">{next.verb}</span>
          {!done && <ArrowRight aria-hidden className="h-3.5 w-3.5 shrink-0" />}
        </button>
      </span>

      <span role="cell" className="flex justify-end">
        <RowActions title={p.title} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
      </span>
    </motion.div>
  );
}
