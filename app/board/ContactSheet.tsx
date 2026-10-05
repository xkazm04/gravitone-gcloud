"use client";

// THE CONTACT SHEET — everything in view at once, the way a photographer
// reads a roll: frames in order, numbered, grouped by the run (or project) that
// made them, and marked in batches. Click a frame to point at it; tick it — or
// Shift-click a range — to gather a batch. With a batch gathered, A / X / U act
// on the whole batch and Z puts the whole batch back (one undo entry,
// ./useBoard.ts decideMany). With none, the keys act on the pointed frame,
// and Enter puts it in the loupe, where its reject reasons live.
//
// Uniform cells, not a justified wall: a contact sheet is a grid so that the
// eye compares like with like, and the frame number under each cell is how a
// batch is spoken about ("14 to 22").

import { ArrowUpRight, CheckSquare, ChevronsDown, Lock, Sparkles, Square, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { StackBar, Tally } from "@/components/ui/signal";
import { SOURCE_LABEL } from "@/lib/board/registry";
import { SOURCE_ORDER, type BoardEntry } from "@/lib/board/source";
import type { BoardSourceId } from "@/lib/board/types";

import { captionOf, SOURCE_ICON } from "./look";
import { Art, CommitLine, EmptyShape, SourceAbsence, VerdictBar, VerdictDot } from "./parts";
import { BoardBar, defaultHandlers, scopeOf, SourceSelect, type SheetProps } from "./shared";
import type { BoardApi } from "./useBoard";
import { useBoardKeys } from "./useBoardKeys";

const PER_GROUP = 48;
/** A roll this short shares its row with the next one. */
const SHORT_ROLL = 3;
const CELLS = "grid-cols-[repeat(auto-fill,minmax(13.5rem,14.75rem))]";

interface Roll {
  key: string;
  source: BoardSourceId;
  group: string | null;
  entries: BoardEntry[];
}

export default function ContactSheet(props: SheetProps) {
  const { api } = props;
  const [batch, setBatch] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, number>>({});
  const live = api.query.st !== "rejected";

  // A batch only ever holds what is on screen: a filter change that hides an
  // item takes it out of the batch rather than deciding it unseen.
  const visibleIds = useMemo(() => new Set(api.visible.map((e) => e.item.id)), [api.visible]);
  const picked = useMemo(() => api.visible.filter((e) => batch.has(e.item.id)), [api.visible, batch]);

  const base = defaultHandlers(props);
  useBoardKeys({
    ...base,
    approve: picked.length && live ? () => void decideBatch("approve") : base.approve,
    reject: picked.length && live ? () => void decideBatch("reject") : base.reject,
    clear: picked.length && live ? () => void decideBatch(null) : base.clear,
    close: () => {
      if (props.loupeOpen) props.closeLoupe();
      else setBatch(new Set());
    },
  });

  async function decideBatch(v: "approve" | "reject" | null) {
    const these = picked;
    setBatch(new Set());
    await api.decideMany(these, v);
  }

  const toggle = (id: string, range: boolean) => {
    setBatch((prev) => {
      const next = new Set([...prev].filter((x) => visibleIds.has(x)));
      if (range && anchor) {
        const ids = api.visible.map((e) => e.item.id);
        const [a, b] = [ids.indexOf(anchor), ids.indexOf(id)].sort((x, y) => x - y);
        if (a >= 0) for (const x of ids.slice(a, b + 1)) next.add(x);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  };

  /** Rolls: by source, then by the run / project / theme the item belongs to,
   *  in the queue's own order. The frame number runs across the whole sheet. */
  const rolls = useMemo(() => {
    const by = new Map<string, Roll>();
    for (const e of api.visible) {
      const key = `${e.item.source}\u0000${e.item.group ?? ""}`;
      let r = by.get(key);
      if (!r) {
        r = { key, source: e.item.source, group: e.item.group, entries: [] };
        by.set(key, r);
      }
      r.entries.push(e);
    }
    const order = (s: BoardSourceId) => SOURCE_ORDER.indexOf(s);
    return [...by.values()].sort((a, b) => order(a.source) - order(b.source));
  }, [api.visible]);
  const frameNo = useMemo(() => new Map(api.visible.map((e, i) => [e.item.id, i + 1])), [api.visible]);

  const { settling, absent } = scopeOf(api);
  const allOn = api.visible.length > 0 && picked.length === api.visible.length;

  return (
    <div className="pb-28">
      <BoardBar
        api={api}
        lead={<SourceSelect api={api} />}
        tail={
          live && api.visible.length > 0 ? (
            <button
              type="button"
              onClick={() => setBatch(allOn ? new Set() : new Set(api.visible.map((e) => e.item.id)))}
              className="font-jetbrains inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-3.5 text-label text-white/70 transition hover:border-white/25 hover:text-white"
            >
              {allOn ? <CheckSquare aria-hidden className="h-4 w-4 text-cyan-300" /> : <Square aria-hidden className="h-4 w-4" />}
              {allOn ? "Deselect all" : `Select all ${api.visible.length}`}
            </button>
          ) : null
        }
      />

      {absent.length > 0 && (
        <div className={`mb-6 grid gap-3 ${absent.length > 1 && api.visible.length ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}>
          {absent.map((id) => (
            // A roll-sized row between the rolls; the whole sheet when there
            // are no rolls to sit between.
            <SourceAbsence key={id} id={id} state={api.states[id]} api={api} compact={api.visible.length > 0} />
          ))}
        </div>
      )}

      {/* A short roll — an adoption pick is three engines — takes half the
          row, so two of them sit side by side instead of each leaving a
          strip of empty ground beside three frames. The cells keep one size
          across every roll (a capped track, not 1fr): a frame that grows
          because its roll is short is no longer compared like with like. */}
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        {rolls.map((roll, ri) => {
          const limit = open[roll.key] ?? PER_GROUP;
          const shown = roll.entries.slice(0, limit);
          return (
            <section key={roll.key} aria-label={`${SOURCE_LABEL[roll.source]}${roll.group ? ` · ${roll.group}` : ""}`} className={`gt-rise min-w-0 ${roll.entries.length > SHORT_ROLL ? "lg:col-span-2" : ""}`} style={{ ["--gt-rise-delay" as string]: `${Math.min(ri, 6) * 40}ms` }}>
              <RollHeader api={api} roll={roll} batch={batch} live={live} onPickAll={(ids, on) => setBatch((prev) => {
                const next = new Set(prev);
                for (const id of ids) {
                  if (on) next.add(id);
                  else next.delete(id);
                }
                return next;
              })} />
              <ol className={`grid ${CELLS} gap-3`}>
                {shown.map((e) => (
                  <Frame
                    key={e.item.id}
                    entry={e}
                    api={api}
                    n={frameNo.get(e.item.id) ?? 0}
                    focused={e.item.id === api.selected?.item.id}
                    inBatch={batch.has(e.item.id)}
                    batching={picked.length > 0}
                    live={live}
                    onToggle={(range) => toggle(e.item.id, range)}
                    onOpen={() => {
                      api.select(e.item.id);
                      props.openLoupe();
                    }}
                  />
                ))}
                {roll.entries.length > shown.length && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [roll.key]: limit + PER_GROUP * 2 }))}
                      className="font-jetbrains flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] text-label text-white/55 transition hover:border-white/20 hover:text-white"
                    >
                      <ChevronsDown aria-hidden className="h-5 w-5" />
                      {roll.entries.length - shown.length} more
                    </button>
                  </li>
                )}
              </ol>
            </section>
          );
        })}
      </div>

      {settling && !api.visible.length && (
        <div aria-hidden className={`grid ${CELLS} gap-3`}>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-xl border border-white/6 bg-white/[0.035]" style={{ opacity: 1 - i * 0.06 }} />
          ))}
        </div>
      )}
      {!settling && !api.visible.length && !absent.length && (
        <EmptyShape
          icon={api.query.src}
          title={api.query.st === "pending" && api.inView.length ? "All decided" : api.query.st === "rejected" ? "Nothing rejected" : "Nothing waiting"}
          label="sheet empty"
          native={api.query.src ? api.nativeOf(api.query.src) : null}
        />
      )}

      {picked.length > 0 && live && (
        <div
          role="toolbar"
          aria-label="Batch"
          className="gt-rise gt-float fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-cyan-400/25 bg-[var(--gt-ink)]/90 p-2 pl-4 backdrop-blur-xl"
        >
          <Tally value={picked.length} label="selected" tone="cyan" />
          <span className="mx-1 h-6 w-px bg-white/10" />
          <BatchButton tone="approve" onClick={() => void decideBatch("approve")} cap="A">
            Approve
          </BatchButton>
          <BatchButton tone="reject" onClick={() => void decideBatch("reject")} cap="X">
            Reject
          </BatchButton>
          <BatchButton tone="clear" onClick={() => void decideBatch(null)} cap="U">
            Clear
          </BatchButton>
          <button
            type="button"
            onClick={() => setBatch(new Set())}
            aria-label="Deselect the batch (Esc)"
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-white/50 transition hover:bg-white/5 hover:text-white"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function BatchButton({ tone, onClick, cap, children }: { tone: "approve" | "reject" | "clear"; onClick: () => void; cap: string; children: React.ReactNode }) {
  const cls =
    tone === "approve"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
      : tone === "reject"
        ? "border-rose-400/30 bg-rose-400/10 text-rose-100 hover:bg-rose-400/20"
        : "border-white/10 text-white/70 hover:border-white/25 hover:text-white";
  return (
    <button type="button" onClick={onClick} className={`font-hanken inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-content transition ${cls}`}>
      {children}
      <kbd aria-hidden className="font-jetbrains rounded-md border border-current/25 px-1.5 text-label leading-snug opacity-60">
        {cap}
      </kbd>
    </button>
  );
}

/* ── a roll's header ──────────────────────────────────────────────────────── */

function RollHeader({
  api,
  roll,
  batch,
  live,
  onPickAll,
}: {
  api: BoardApi;
  roll: Roll;
  batch: Set<string>;
  live: boolean;
  onPickAll: (ids: string[], on: boolean) => void;
}) {
  const Icon = SOURCE_ICON[roll.source];
  // Counted over the whole roll as loaded, not the filtered slice: "7/18
  // decided" is about the run.
  const s = api.states[roll.source];
  const all = s.kind === "loaded" ? s.entries.filter((e) => e.item.group === roll.group) : roll.entries;
  const kept = all.filter((e) => e.item.verdict === "approve").length;
  const cut = all.filter((e) => e.item.verdict === "reject").length;
  const ids = roll.entries.map((e) => e.item.id);
  const allIn = ids.every((id) => batch.has(id));
  return (
    <header className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/6 pb-3 lg:flex-nowrap">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-violet-400/15 via-white/[0.03] to-cyan-400/10">
        <Icon aria-hidden className="h-5 w-5 text-white/75" strokeWidth={1.75} />
      </span>
      {/* The source is the heading; the run or project under it is a name
          to read, so it is set in the body face and gives way first when a
          half-width roll runs short of room. */}
      <div className="min-w-0 shrink">
        <h2 className="font-instrument text-2xl leading-tight text-white">{SOURCE_LABEL[roll.source]}</h2>
        {roll.group && <p className="font-hanken max-w-[40rem] truncate text-label text-white/55">{roll.group}</p>}
      </div>
      <Tally value={roll.entries.length} label="frames" className="shrink-0" />
      <StackBar
        className="w-32 shrink-0"
        showCounts={false}
        label={`${SOURCE_LABEL[roll.source]} decisions`}
        segments={[
          { n: kept, tone: "emerald", label: "approved" },
          { n: cut, tone: "rose", label: "rejected" },
          { n: all.length - kept - cut, tone: "neutral", label: "pending" },
        ]}
      />
      <CommitLine api={api} source={roll.source} group={roll.group} />
      {live && (
        <button
          type="button"
          onClick={() => onPickAll(ids, !allIn)}
          className="font-jetbrains ml-auto inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-label whitespace-nowrap text-white/60 transition hover:border-white/25 hover:text-white"
        >
          {allIn ? <CheckSquare aria-hidden className="h-4 w-4 text-cyan-300" /> : <Square aria-hidden className="h-4 w-4" />}
          {allIn ? "Deselect roll" : "Select roll"}
        </button>
      )}
    </header>
  );
}

/* ── one frame ────────────────────────────────────────────────────────────── */

function Frame({
  entry,
  api,
  n,
  focused,
  inBatch,
  batching,
  live,
  onToggle,
  onOpen,
}: {
  entry: BoardEntry;
  api: BoardApi;
  n: number;
  focused: boolean;
  inBatch: boolean;
  /** A batch is being gathered: every tick shows, not only the hovered one. */
  batching: boolean;
  live: boolean;
  onToggle: (range: boolean) => void;
  onOpen: () => void;
}) {
  const { item } = entry;
  const caption = captionOf(entry);
  const ring = inBatch
    ? "border-cyan-300/80 ring-2 ring-cyan-300/50"
    : focused
      ? "border-cyan-400/50 ring-1 ring-cyan-300/30 shadow-lg shadow-cyan-500/10"
      : item.verdict === "approve"
        ? "border-emerald-400/45"
        : item.verdict === "reject"
          ? "border-rose-400/30"
          : "border-white/8 hover:border-white/20";
  return (
    <li data-board-selected={focused ? item.id : undefined} className={`group relative overflow-hidden rounded-xl border bg-white/[0.02] transition ${ring}`}>
      <button
        type="button"
        aria-current={focused ? "true" : undefined}
        aria-label={`${n}. ${item.title}${item.verdict ? `, ${item.verdict === "approve" ? "approved" : "rejected"}` : ""}`}
        onClick={(ev) => {
          if (ev.shiftKey && live) onToggle(true);
          else api.select(item.id);
        }}
        onDoubleClick={onOpen}
        className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
      >
        <Art entry={entry} className={`aspect-[4/3] w-full transition duration-300 ${item.verdict === "reject" ? "opacity-40 grayscale" : "group-hover:brightness-110"}`} />
        <span className="flex items-center gap-2 px-2.5 py-2">
          {/* The verdict sits beside the frame number, not on the art: on a
              words-only card the art's top-left corner is the card's own kind
              glyph, and a dot pinned there covered it. */}
          {item.verdict && <VerdictDot verdict={item.verdict} className="-my-1 -ml-0.5" />}
          <span className="font-jetbrains shrink-0 text-label tabular-nums text-white/35">{String(n).padStart(2, "0")}</span>
          <span className={`font-hanken min-w-0 flex-1 truncate text-label ${item.verdict === "reject" ? "text-white/45 line-through decoration-rose-300/40" : "text-white/80"}`}>{caption}</span>
          {item.reasons.length > 0 && <span className="font-jetbrains shrink-0 text-label text-rose-200/70">{item.reasons.join("·")}</span>}
          {/* The machine's answer stays sealed until the frame is decided —
              then it is read under the human's, which is the comparison the
              sheet exists to make. */}
          {item.machinePick && item.verdict === null && (
            <span className="shrink-0 text-white/30">
              <Lock aria-hidden className="h-3.5 w-3.5" />
              <span className="sr-only">machine pick sealed until you decide</span>
            </span>
          )}
        </span>
        {item.machinePick && item.verdict !== null && (
          <span className="gt-rise font-jetbrains -mt-1 flex items-center gap-1.5 truncate px-2.5 pb-2 text-label text-cyan-200/75">
            <Sparkles aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">machine pick:</span>
            <span className="truncate">{item.machinePick}</span>
          </span>
        )}
      </button>

      {live && (
        <button
          type="button"
          role="checkbox"
          aria-checked={inBatch}
          aria-label={`Add frame ${n}, ${item.title}, to the batch`}
          onClick={(ev) => {
            ev.stopPropagation();
            onToggle(ev.shiftKey);
          }}
          className={`absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-lg border backdrop-blur transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
            inBatch
              ? "border-cyan-200 bg-cyan-300 text-slate-950"
              : `border-white/50 bg-black/35 text-transparent hover:border-white ${batching ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`
          }`}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>
      )}

      {live && (
        <span
          className={`absolute right-2 bottom-12 rounded-full bg-[var(--gt-ink)]/70 p-1 backdrop-blur-md transition ${focused ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}
        >
          <VerdictBar entry={entry} api={api} size="icon" />
        </span>
      )}

      {/* The Rejected lane is read-only: a frame cut in this session offers
          its Undo, one cut earlier goes back to its native surface. */}
      {!live &&
        (api.canUndo(item.id) ? (
          <button
            type="button"
            onClick={() => void api.undoItem(item.id)}
            aria-label={`Undo the rejection of ${item.title}`}
            className="font-jetbrains absolute right-2 bottom-12 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-3 py-1 text-label text-white/85 backdrop-blur transition hover:border-white/40 hover:text-white"
          >
            <Undo2 aria-hidden className="h-3.5 w-3.5" />
            Undo
          </button>
        ) : (
          <Link
            href={entry.href}
            aria-label={`Open ${item.title} where it was decided`}
            className="font-jetbrains absolute right-2 bottom-12 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/55 px-3 py-1 text-label text-white/70 opacity-0 backdrop-blur transition group-hover:opacity-100 focus-visible:opacity-100 hover:text-white"
          >
            open
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        ))}
    </li>
  );
}
