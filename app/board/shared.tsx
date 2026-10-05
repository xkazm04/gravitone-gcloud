"use client";

// What the three variants share beyond ./parts.tsx: their props, the default
// key bindings, the one compact bar above every variant (filter · progress ·
// undo · keys), the source dropdown V2 and V3 draw (V1 has the full rail), and
// the "what is in view, and what could not be read" arithmetic.
//
// THE BAR IS ONE ROW. /projects and /library open on content within ~150px of
// the nav (r2-baseline/projects.png); round 1 opened the Board on a 90px serif
// "Board" and an eyebrow, which the nav already says. The page name is an
// sr-only h1 in ./BoardView.tsx.

import { Undo2 } from "lucide-react";

import { Select, type SelectOption } from "@/components/ui/Select";
import { StackBar } from "@/components/ui/signal";
import { SOURCE_LABEL, type SourceState } from "@/lib/board/registry";
import { SOURCE_ORDER } from "@/lib/board/source";
import type { BoardSourceId } from "@/lib/board/types";
import { FILTERS, type BoardFilter } from "@/lib/board/url";

import { BoardKeymap, pendingWord, toneOf, TONE_DOT } from "./parts";
import type { BoardApi } from "./useBoard";
import type { BoardKeyHandlers } from "./useBoardKeys";

export interface VariantProps {
  api: BoardApi;
  openLoupe: () => void;
  loupeOpen: boolean;
  closeLoupe: () => void;
}

/** A, X, U on the selected item; J/K through the queue; Enter, Esc, Z.
 *  Under the Rejected filter the lane is read-only: the verdict keys do
 *  nothing there and Z is the way back. */
export function defaultHandlers({ api, openLoupe, closeLoupe }: VariantProps): BoardKeyHandlers {
  const sel = api.selected;
  const live = api.query.st !== "rejected";
  return {
    approve: () => live && sel && void api.decide(sel, "approve"),
    reject: () => live && sel && void api.decide(sel, "reject"),
    clear: () => live && sel && void api.decide(sel, null),
    next: () => api.move(1),
    prev: () => api.move(-1),
    loupe: () => sel && openLoupe(),
    close: closeLoupe,
    undo: () => void api.undo(),
  };
}

/* ── what is in view ──────────────────────────────────────────────────────── */

export function scopeOf(api: BoardApi) {
  const ids = api.query.src ? [api.query.src] : SOURCE_ORDER;
  const settling = ids.some((id) => ["idle", "loading", "counted"].includes(api.states[id].kind));
  // Unreadable sources always say so; an EMPTY one only when it is the one
  // picked — under "All" the rail / dropdown already reads "0" beside it.
  const absent = ids.filter((id) => {
    const k = api.states[id].kind;
    return k === "unavailable" || k === "error" || (k === "empty" && api.query.src === id);
  });
  return { ids, settling, absent };
}

export const FILTER_WORD: Record<BoardFilter, string> = { pending: "Pending", decided: "Decided", rejected: "Rejected" };

export function filterCount(api: BoardApi, st: BoardFilter): number {
  return api.inView.filter((e) => (st === "pending" ? e.item.verdict === null : st === "rejected" ? e.item.verdict === "reject" : e.item.verdict !== null)).length;
}

/* ── the bar ──────────────────────────────────────────────────────────────── */

const FILTER_TONE: Record<BoardFilter, string> = {
  pending: "text-amber-200",
  decided: "text-emerald-200",
  rejected: "text-rose-200",
};

/** Pending · Decided · Rejected, each with its count; the active one lit. */
export function FilterPills({ api }: { api: BoardApi }) {
  return (
    <div role="group" aria-label="Board filter" className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/[0.03] p-1">
      {FILTERS.map((st) => {
        const on = api.query.st === st;
        const n = filterCount(api, st);
        return (
          <button
            key={st}
            type="button"
            aria-pressed={on}
            onClick={() => api.setQuery({ st, i: null })}
            className={`font-jetbrains inline-flex items-center gap-2 rounded-full px-3.5 py-1 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
              on ? "bg-cyan-400/10 text-white ring-1 ring-cyan-400/35" : "text-white/55 hover:text-white/85"
            }`}
          >
            {FILTER_WORD[st]}
            <span className={`tabular-nums ${on || n ? FILTER_TONE[st] : "text-white/30"} ${n ? "" : "opacity-60"}`}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Kept · cut · open across what is in view, to scale. */
export function Progress({ api, className = "" }: { api: BoardApi; className?: string }) {
  let approve = 0;
  let reject = 0;
  for (const e of api.inView) {
    if (e.item.verdict === "approve") approve++;
    else if (e.item.verdict === "reject") reject++;
  }
  const open = api.inView.length - approve - reject;
  return (
    <StackBar
      className={className}
      showCounts={false}
      label="Decisions in view"
      segments={[
        { n: approve, tone: "emerald", label: "approved" },
        { n: reject, tone: "rose", label: "rejected" },
        { n: open, tone: "neutral", label: "pending" },
      ]}
    />
  );
}

export function UndoButton({ api }: { api: BoardApi }) {
  const n = api.undoDepth;
  return (
    <button
      type="button"
      disabled={!n}
      onClick={() => void api.undo()}
      aria-label={n ? `Undo the last decision (Z), ${n} in this session` : "Nothing to undo"}
      className="font-jetbrains inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-3.5 text-label text-white/75 transition hover:border-white/25 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Undo2 aria-hidden className="h-4 w-4" />
      Undo
      {n > 0 && <span className="tabular-nums text-cyan-200">{n}</span>}
      <kbd aria-hidden className="rounded-md border border-white/15 px-1.5 text-label leading-snug text-white/45">
        Z
      </kbd>
    </button>
  );
}

/** The one row above every variant. `lead` and `tail` are the variant's own
 *  controls (a source dropdown, a position, a batch toggle). */
export function BoardBar({ api, lead, tail }: { api: BoardApi; lead?: React.ReactNode; tail?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <FilterPills api={api} />
      {lead}
      <Progress api={api} className="min-w-[8rem] flex-1" />
      {tail}
      <UndoButton api={api} />
      <BoardKeymap />
    </div>
  );
}

/* ── the source dropdown ──────────────────────────────────────────────────── */

/**
 * The source picker for V2 and V3: every source with its pending figure and
 * its state's dot. The app's own Select (components/ui/Select.tsx), never a
 * native one.
 *
 * KEY ISOLATION. The Board binds bare letters on `window`, and the Select's
 * type-ahead takes the same letters while its list is open — "a" would both
 * jump to "Adoption" and approve the selected item. The keys a focused
 * combobox owns (all of them while open; Enter, Space and the arrows while
 * closed) stop here, before they reach the Board's listener. React dispatches
 * from the root container, which sits below `window`, so a stopped event
 * never arrives there.
 */
export function SourceSelect({ api, className = "w-64" }: { api: BoardApi; className?: string }) {
  const total = SOURCE_ORDER.reduce((s, id) => s + (api.countsOf(id)?.pending ?? 0), 0);
  const options: SelectOption<string>[] = [
    { value: "all", label: "All sources", meta: total, dot: total ? "bg-amber-400" : "bg-emerald-300" },
    ...SOURCE_ORDER.map((id) => {
      const s: SourceState = api.states[id];
      return { value: id, label: SOURCE_LABEL[id], meta: pendingWord(s), dot: TONE_DOT[toneOf(s)] };
    }),
  ];
  return (
    <span
      className={className}
      onKeyDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.getAttribute("role") !== "combobox") return;
        const open = t.getAttribute("aria-expanded") === "true";
        if (open || ["Enter", " ", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) e.stopPropagation();
      }}
    >
      <Select<string>
        label="Source"
        value={api.query.src ?? "all"}
        onChange={(v) => api.setQuery({ src: v === "all" ? null : (v as BoardSourceId), i: null })}
        options={options}
        minWidth={260}
      />
    </span>
  );
}
