"use client";

// V3 · PIVOT BOARD — the shelf as a two-way table: columns are where a project
// stands (draft → working → needs a call → blocked → delivered), rows are what
// kind of project it is. Reading a column answers "what is stuck"; reading a row
// answers "how is the trailer slate doing". Cards are compact and selectable, so
// the board is also where a shelf gets thinned in bulk.
//
// VOLUME is held by a card budget, not by a scroll box: the board shows at most
// ~56 cards at rest, shared out over the non-empty cells, and each cell says how
// many it is not showing and opens them on request. A collapsed row costs one
// heading.

import { ArrowRight, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PHASES, PHASE_STATE_WORD, PHASE_TITLE, projectState, type PhaseState, type Project, type ProjectState } from "@/lib/projects";
import { Tally } from "@/components/ui/signal";

import { RowActions, STATE_TONE } from "./parts";
import ShelfHeader, { NoMatch, ProjectMarks, STATE_SIGNAL, groupLabel } from "./ShelfHeader";
import { BOARD_ORDER, clearFilters, nextAction, type ShelfDefaults, type ShelfGroup } from "./shelf";
import type { SurfaceProps } from "./surface";
import { useShelf, useShelfKeys } from "./useShelf";
import { MOVE_INK } from "./Ledger";

const DEFAULTS: ShelfDefaults = { group: "discipline", sort: "needs-you" };
/** A state grouping would put every card on the diagonal of a state-columned board. */
const BOARD_GROUPS: readonly ShelfGroup[] = ["none", "discipline", "template"];

/** Cards on the board at rest, shared across the non-empty cells. */
const BUDGET = 56;
/** What one "+N" press adds to a cell. */
const STEP = 12;

const PIP: Record<PhaseState, string> = {
  done: "bg-emerald-300/60",
  working: "bg-cyan-300/55",
  review: "bg-amber-300/60",
  blocked: "bg-rose-400/70",
  empty: "border border-white/[0.12]",
};

const KEYS = [
  { keys: ["J", "K"], does: "next · previous" },
  { keys: ["Enter"], does: "open" },
  { keys: ["X"], does: "select" },
  { keys: ["Esc"], does: "clear selection" },
  { keys: ["/"], does: "search" },
];

export default function PivotBoard({ projects, onOpen, onEdit, onDelete, onDeleteMany, onCreate, aside }: SurfaceProps) {
  const shelf = useShelf(projects, DEFAULTS);
  const { setQuery, rows, counts, total } = shelf;
  const group: ShelfGroup = shelf.query.group === "state" ? "none" : shelf.query.group;
  const query = useMemo(() => ({ ...shelf.query, group }), [shelf.query, group]);
  // Regrouped here rather than read from `shelf.groups`, which honoured the
  // state grouping this board declines.
  const groups = useMemo(() => {
    if (group === shelf.query.group) return shelf.groups;
    return [{ key: "all", projects: rows }];
  }, [group, shelf.query.group, shelf.groups, rows]);

  const columns = query.states.length > 0 ? BOARD_ORDER.filter((s) => query.states.includes(s)) : BOARD_ORDER;

  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [extra, setExtra] = useState<ReadonlyMap<string, number>>(new Map());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  // group → column → projects, in the shelf's sort order.
  const cells = useMemo(() => {
    const m = new Map<string, Map<ProjectState, Project[]>>();
    for (const g of groups) {
      const row = new Map<ProjectState, Project[]>(BOARD_ORDER.map((s) => [s, []]));
      for (const p of g.projects) row.get(projectState(p))!.push(p);
      m.set(g.key, row);
    }
    return m;
  }, [groups]);

  const open = groups.filter((g) => !collapsed.has(g.key));
  const filled = open.reduce(
    (n, g) => n + columns.filter((s) => (cells.get(g.key)?.get(s)?.length ?? 0) > 0).length,
    0,
  );
  const perCell = Math.max(1, Math.min(STEP, Math.floor(BUDGET / Math.max(1, filled))));
  const cellKey = (g: string, s: ProjectState) => `${g}|${s}`;
  const showing = (g: string, s: ProjectState) => perCell + (extra.get(cellKey(g, s)) ?? 0);

  // Reading order for J/K: row by row, column by column, card by card.
  const order = useMemo(() => {
    const out: string[] = [];
    for (const g of groups) {
      if (collapsed.has(g.key)) continue;
      for (const s of columns) {
        const list = cells.get(g.key)?.get(s) ?? [];
        const n = perCell + (extra.get(`${g.key}|${s}`) ?? 0);
        for (const p of list.slice(0, n)) out.push(p.id);
      }
    }
    return out;
  }, [groups, collapsed, columns, cells, perCell, extra]);

  const byId = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows]);
  const openId = useCallback(
    (id: string) => {
      const p = byId.get(id);
      if (p) onOpen(p);
    },
    [byId, onOpen],
  );
  const toggleSel = useCallback(
    (id: string) =>
      setSelected((cur) => {
        const n = new Set(cur);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [setSelected],
  );
  const clearSel = useCallback(() => setSelected(new Set()), [setSelected]);
  const { activeId, setActiveId, moved, searchRef } = useShelfKeys(order, {
    onOpen: openId,
    onToggle: toggleSel,
    onEscape: clearSel,
  });

  // Page scroll here, not a box: focusing the card lets the browser bring it in.
  const handled = useRef(0);
  useEffect(() => {
    if (moved === handled.current) return;
    handled.current = moved;
    if (!activeId) return;
    const el = document.querySelector<HTMLElement>(`[data-shelf-id="${CSS.escape(activeId)}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "nearest" });
  }, [moved, activeId]);

  // Only what the filter shows can be acted on: a selection the filter hid is
  // not something the user can see they are about to delete.
  const chosen = useMemo(() => rows.filter((p) => selected.has(p.id)), [rows, selected]);

  const set = useCallback(
    (patch: Parameters<typeof setQuery>[0]) => {
      setQuery(patch);
      setExtra(new Map());
    },
    [setQuery, setExtra],
  );

  const toggleGroup = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const tabTarget = activeId && order.includes(activeId) ? activeId : (order[0] ?? null);

  return (
    <div className={chosen.length > 0 ? "pb-20" : ""}>
      <ShelfHeader
        query={query}
        setQuery={set}
        counts={counts}
        shown={rows.length}
        total={total}
        searchRef={searchRef}
        keys={KEYS}
        groups={BOARD_GROUPS}
        onCreate={onCreate}
        aside={aside}
      />

      {rows.length === 0 ? (
        <NoMatch onClear={() => set(clearFilters(query))} />
      ) : (
        <div className="scroll-x">
          <div
            role="table"
            aria-label="Projects by state"
            className="grid min-w-[60rem] gap-x-2"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            <div role="row" className="contents">
              {columns.map((s) => (
                <div
                  role="columnheader"
                  key={s}
                  className={`flex items-center justify-between rounded-t-xl border-t-2 bg-white/[0.02] px-3 py-2 ${STATE_TONE[s].rule}`}
                >
                  <span className={`font-jetbrains text-label tracking-[0.14em] uppercase ${STATE_TONE[s].text}`}>
                    {STATE_TONE[s].word}
                  </span>
                  <Tally value={counts[s]} tone={STATE_SIGNAL[s]} />
                </div>
              ))}
            </div>

            {groups.map((g) => {
              const shut = collapsed.has(g.key);
              return (
                <div role="rowgroup" key={g.key} className="contents">
                  {group !== "none" && (
                    <div role="row" className="col-span-full mt-3 flex items-center gap-3 border-b border-white/8 pb-1.5">
                      <button
                        type="button"
                        role="rowheader"
                        aria-expanded={!shut}
                        onClick={() => toggleGroup(g.key)}
                        className="font-jetbrains flex cursor-pointer items-center gap-2 text-label tracking-[0.14em] text-white/70 uppercase transition hover:text-white"
                      >
                        <span aria-hidden className={`inline-block transition ${shut ? "-rotate-90" : ""}`}>
                          ▾
                        </span>
                        {groupLabel(group, g.key)}
                        <span className="tracking-normal text-white/40">{g.projects.length}</span>
                      </button>
                    </div>
                  )}
                  {!shut && (
                    <div role="row" className="contents">
                      {columns.map((s) => {
                        const list = cells.get(g.key)?.get(s) ?? [];
                        const n = showing(g.key, s);
                        const hidden = Math.max(0, list.length - n);
                        return (
                          <div
                            role="cell"
                            key={s}
                            className="min-h-[3rem] space-y-1.5 border-x border-white/[0.04] bg-white/[0.012] p-1.5 pt-2"
                          >
                            {list.slice(0, n).map((p) => (
                              <Card
                                key={p.id}
                                p={p}
                                active={p.id === activeId}
                                tabbable={p.id === tabTarget}
                                checked={selected.has(p.id)}
                                onFocus={() => setActiveId(p.id)}
                                onToggle={() => toggleSel(p.id)}
                                onOpen={onOpen}
                                onEdit={onEdit}
                                onDelete={onDelete}
                              />
                            ))}
                            {hidden > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExtra((m) => new Map(m).set(cellKey(g.key, s), (m.get(cellKey(g.key, s)) ?? 0) + STEP))
                                }
                                aria-label={`Show ${Math.min(STEP, hidden)} more of ${hidden} hidden`}
                                className="font-jetbrains w-full cursor-pointer rounded-lg border border-dashed border-white/12 py-1 text-label text-white/45 transition hover:border-white/25 hover:text-white/75"
                              >
                                +{hidden}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {chosen.length > 0 && <BulkBar chosen={chosen} onClear={clearSel} onDeleteMany={onDeleteMany} />}
    </div>
  );
}

function Card({
  p,
  active,
  tabbable,
  checked,
  onFocus,
  onToggle,
  onOpen,
  onEdit,
  onDelete,
}: {
  p: Project;
  active: boolean;
  tabbable: boolean;
  checked: boolean;
  onFocus: () => void;
  onToggle: () => void;
  onOpen: SurfaceProps["onOpen"];
  onEdit: SurfaceProps["onEdit"];
  onDelete: SurfaceProps["onDelete"];
}) {
  const next = nextAction(p);
  return (
    <div
      data-shelf-id={p.id}
      tabIndex={tabbable ? 0 : -1}
      aria-label={`${p.title}, next: ${next.verb}`}
      onFocus={(e) => e.target === e.currentTarget && onFocus()}
      onClick={() => onOpen(p)}
      className={`group cursor-pointer rounded-lg border px-2.5 py-1.5 transition outline-none hover:border-white/20 focus-visible:border-cyan-300/60 ${
        checked ? "border-cyan-400/50 bg-cyan-400/[0.07]" : "border-white/8 bg-white/[0.025]"
      } ${active ? "ring-1 ring-cyan-300/60" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <input
          type="checkbox"
          tabIndex={-1}
          checked={checked}
          aria-label={`Select ${p.title}`}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-cyan-400"
        />
        <span className="truncate text-label font-medium text-white">{p.title}</span>
        <ProjectMarks p={p} />
        <span className="ml-auto shrink-0">
          <RowActions title={p.title} onEdit={() => onEdit(p)} onDelete={() => onDelete(p)} />
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span aria-hidden className="flex shrink-0 gap-0.5">
          {PHASES.map((k) => (
            <span key={k} className={`h-1.5 w-3 rounded-[2px] ${PIP[p.progress[k]]}`} />
          ))}
        </span>
        <span className="sr-only">
          {PHASES.map((k) => `${PHASE_TITLE[k]} ${PHASE_STATE_WORD[p.progress[k]]}`).join(", ")}
        </span>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(p, next.step);
          }}
          className={`font-jetbrains inline-flex min-w-0 cursor-pointer items-center gap-1 truncate text-label transition hover:underline ${MOVE_INK[p.progress[next.step]]}`}
        >
          <span className="truncate">{next.verb}</span>
          {next.tone !== "done" && <ArrowRight aria-hidden className="h-3 w-3 shrink-0" />}
        </button>
      </div>
    </div>
  );
}

/**
 * The selection's verbs. Delete only — "archive" has nowhere to land: the
 * project record (lib/projects.ts:299) has no archived field, and a bar that
 * offered it would be a button that does nothing.
 *
 * Two-step and inline, the way the demo strip's "clear the examples" is
 * (app/projects/ProjectsView.tsx): several records at once, which no single
 * row's confirmation covers. Sequential through the same `remove` the single
 * delete uses, so the board visibly thins and a failure stops nothing that
 * already went.
 */
function BulkBar({
  chosen,
  onClear,
  onDeleteMany,
}: {
  chosen: Project[];
  onClear: () => void;
  onDeleteMany: (ps: Project[]) => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await onDeleteMany(chosen);
    setBusy(false);
    setAsking(false);
    onClear();
  };
  return (
    <div
      role="region"
      aria-label="Selection"
      className="glass-panel gt-float fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/12 px-4 py-2"
    >
      <Tally label="selected" value={chosen.length} tone="cyan" />
      {asking ? (
        <>
          <span className="font-hanken text-label text-slate-300">
            Delete {chosen.length === 1 ? "it" : `all ${chosen.length}`}?
          </span>
          <button
            type="button"
            autoFocus
            onClick={go}
            disabled={busy}
            className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 px-3 py-0.5 text-label text-rose-200 transition hover:bg-rose-400/10 disabled:cursor-default disabled:opacity-50"
          >
            {busy ? "deleting…" : "yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            disabled={busy}
            className="font-jetbrains cursor-pointer rounded-full border border-white/12 px-3 py-0.5 text-label text-white/55 transition hover:text-white/80 disabled:opacity-50"
          >
            keep
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="font-jetbrains inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-rose-400/35 px-3 py-0.5 text-label text-rose-200 transition hover:bg-rose-400/10"
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            delete
          </button>
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear selection"
            className="cursor-pointer rounded-full border border-white/12 p-1 text-white/50 transition hover:text-white/80"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
