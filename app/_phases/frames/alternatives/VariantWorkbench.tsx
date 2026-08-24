"use client";

// WORKBENCH — the cut as an editing bay.
//
// Metaphor: a master–detail bench. The whole cut is a dense INDEX down the left
// — one 44px row per scene, virtualized by hand — and exactly ONE scene sits on
// the bench at full attention on the right, its alternatives big enough to
// actually judge. Nothing else renders large, ever.
//
// This is the opposite trade from the assembly ledger, deliberately. The ledger
// answers "what is not done" by letting the eye run down a column of sixteen
// rows; choosing between five pictures is a different question, and it cannot be
// answered at row height. So the ledger gives every scene a little space and the
// bench gives one scene all of it — and because only one scene is ever mounted
// large, the view costs the same at 16 scenes and at 112 (the stress toggle).
//
// The cut stays a keystroke away: up/down walk scenes, left/right walk that
// scene's alternatives, Enter adopts, Delete discards, g generates. Judging
// pictures is a rhythm, and a rhythm dies at the mouse.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Trash2 } from "lucide-react";

import type { AltsColumn, AltsCtl, SceneAlt } from "./alts";
import { FrameCanvas, KindChip } from "../parts";

const ROW_H = 44;
const OVERSCAN = 8;
const PLATE_ONLY = { plate: true, elements: false, texts: false };
const COMPOSITE = { plate: true, elements: true, texts: true };

export default function VariantWorkbench({ alts }: { alts: AltsCtl }) {
  const { columns } = alts;
  const [selId, setSelId] = useState<string | null>(null);
  /** Which alternative the keyboard points at — not which one the cut adopted. */
  const [focus, setFocus] = useState(0);

  // Keep the selection valid across the stress toggle, which swaps the whole
  // column list under us and would otherwise leave the bench pointing at a
  // scene that no longer exists.
  const index = Math.max(0, columns.findIndex((c) => c.frame.id === selId));
  const col: AltsColumn | undefined = columns[index];
  useEffect(() => {
    if (columns.length && (!selId || !columns.some((c) => c.frame.id === selId))) {
      setSelId(columns[0].frame.id);
      setFocus(0);
    }
  }, [columns, selId]);

  const go = useCallback(
    (delta: number) => {
      const next = columns[Math.min(columns.length - 1, Math.max(0, index + delta))];
      if (!next) return;
      setSelId(next.frame.id);
      setFocus(0);
    },
    [columns, index],
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (!col) return;
    const n = col.alts.length;
    switch (e.key) {
      case "ArrowDown": go(1); break;
      case "ArrowUp": go(-1); break;
      case "ArrowRight": if (n) setFocus((f) => Math.min(n - 1, f + 1)); break;
      case "ArrowLeft": if (n) setFocus((f) => Math.max(0, f - 1)); break;
      case "Enter": if (col.alts[focus]) alts.select(col.frame.id, col.alts[focus].id); break;
      case "Delete":
      case "Backspace":
        if (col.alts[focus]) {
          alts.remove(col.frame.id, col.alts[focus].id);
          setFocus((f) => Math.max(0, Math.min(n - 2, f)));
        }
        break;
      case "g":
      case "G":
        if (!alts.busy.has(col.frame.id)) void alts.generate(col.frame.id);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="Alternatives workbench — arrow keys move between scenes and alternatives"
      className="grid h-[70vh] grid-cols-[280px_1fr] overflow-hidden rounded-xl border border-white/8 bg-white/[0.02]"
    >
      <SceneIndex
        columns={columns}
        selIndex={index}
        busy={alts.busy}
        onPick={(id) => {
          setSelId(id);
          setFocus(0);
        }}
      />
      {col ? (
        <Bench
          col={col}
          alts={alts}
          focus={focus}
          onFocus={setFocus}
          onStep={go}
          atStart={index === 0}
          atEnd={index === columns.length - 1}
        />
      ) : (
        <p className="font-jetbrains self-center text-center text-[11px] tracking-[0.18em] text-white/30 uppercase">
          no scenes in the cut
        </p>
      )}
    </div>
  );
}

/* ── Left: the index, virtualized by hand ─────────────────────────────────── */

function SceneIndex({
  columns,
  selIndex,
  busy,
  onPick,
}: {
  columns: AltsColumn[];
  selIndex: number;
  busy: ReadonlySet<string>;
  onPick: (frameId: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(600);

  // Height from a ResizeObserver rather than a one-shot measure: the host step
  // expands and collapses around this panel, and a stale viewport height renders
  // a window of rows that does not cover the box.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Keep the selected row on screen — the whole point of up/down is that the cut
  // scrolls itself while the hands stay on the keyboard.
  useEffect(() => {
    const el = box.current;
    if (!el || selIndex < 0) return;
    const y = selIndex * ROW_H;
    if (y < el.scrollTop) el.scrollTop = y;
    else if (y + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = y + ROW_H - el.clientHeight;
  }, [selIndex]);

  const { first, last } = useMemo(() => {
    const f = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
    const l = Math.min(columns.length, Math.ceil((top + height) / ROW_H) + OVERSCAN);
    return { first: f, last: l };
  }, [top, height, columns.length]);

  return (
    <div className="flex min-h-0 flex-col border-r border-white/8">
      <div className="font-jetbrains flex items-center justify-between border-b border-white/8 px-3 py-2 text-[10px] tracking-[0.14em] text-white/35 uppercase">
        <span>the cut</span>
        <span>{columns.length}</span>
      </div>
      <div ref={box} onScroll={(e) => setTop(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto">
        <div style={{ height: first * ROW_H }} aria-hidden />
        {columns.slice(first, last).map((c, i) => (
          <IndexRow
            key={c.frame.id}
            col={c}
            selected={first + i === selIndex}
            generating={busy.has(c.frame.id)}
            onPick={() => onPick(c.frame.id)}
          />
        ))}
        <div style={{ height: Math.max(0, (columns.length - last) * ROW_H) }} aria-hidden />
      </div>
    </div>
  );
}

function IndexRow({
  col,
  selected,
  generating,
  onPick,
}: {
  col: AltsColumn;
  selected: boolean;
  generating: boolean;
  onPick: () => void;
}) {
  // The only pulse in the file, and it is a state rather than a decoration: this
  // scene has a generation in flight.
  const dot = generating ? "animate-pulse bg-amber-300" : col.alts.length ? "bg-cyan-300" : "bg-white/20";
  return (
    <button
      onClick={onPick}
      style={{ height: ROW_H }}
      className={`flex w-full items-center gap-2 border-b border-white/6 px-3 text-left transition ${
        selected ? "bg-cyan-400/12 text-cyan-100" : "text-white/70 hover:bg-white/[0.03]"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="font-jetbrains w-9 shrink-0 text-[10px] text-white/35">{col.frame.at}</span>
      <span className="font-hanken min-w-0 flex-1 truncate text-[12px]">{col.frame.title}</span>
      <span
        className={`font-jetbrains shrink-0 rounded border px-1 text-[9px] ${
          col.alts.length ? "border-cyan-400/25 text-cyan-200/80" : "border-white/10 text-white/25"
        }`}
      >
        {col.alts.length}
      </span>
    </button>
  );
}

/* ── Right: one scene, at full attention ──────────────────────────────────── */

function Bench({
  col,
  alts,
  focus,
  onFocus,
  onStep,
  atStart,
  atEnd,
}: {
  col: AltsColumn;
  alts: AltsCtl;
  focus: number;
  onFocus: (i: number) => void;
  onStep: (d: number) => void;
  atStart: boolean;
  atEnd: boolean;
}) {
  const busy = alts.busy.has(col.frame.id);
  const active = col.alts.find((a) => a.id === col.activeId) ?? null;

  const generate = (
    <button
      onClick={() => void alts.generate(col.frame.id)}
      disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3.5 py-1.5 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
      {busy ? "generating…" : "generate alternative"}
    </button>
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-start gap-3 border-b border-white/8 px-4 py-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <KindChip kind={col.frame.kind} />
            <span className="font-hanken truncate text-[13px] text-white/85">{col.frame.title}</span>
            <span className="font-jetbrains text-[10px] text-white/35">{col.frame.at}</span>
            <span className="font-jetbrains text-[10px] tracking-[0.12em] text-white/35 uppercase">
              {col.alts.length} alternative{col.alts.length === 1 ? "" : "s"}
            </span>
          </div>
          <p className="font-hanken text-[13px] leading-snug text-slate-400">&ldquo;{col.frame.line}&rdquo;</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => onStep(-1)}
            disabled={atStart}
            aria-label="Previous scene"
            className="rounded-lg border border-white/10 p-1.5 text-white/50 transition hover:text-white/85 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            onClick={() => onStep(1)}
            disabled={atEnd}
            aria-label="Next scene"
            className="rounded-lg border border-white/10 p-1.5 text-white/50 transition hover:text-white/85 disabled:opacity-30"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          {generate}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {active ? (
          <div className="gt-rise space-y-2">
            <p className="font-jetbrains text-[10px] tracking-[0.12em] text-cyan-200/70 uppercase">in the cut</p>
            {/* The hero is the COMPOSITE — elements and texts included — because
                this is the only place the user sees what the cut actually uses.
                The cards below stay plate-only: comparing pictures through the
                same overlay compares the overlay. */}
            {/* Width-capped rather than height-capped: FrameCanvas is
                aspect-video with overflow hidden, so a max-height would crop the
                picture instead of scaling it. */}
            <div className="mx-auto w-full max-w-[820px]">
              <FrameCanvas frame={{ ...col.frame, plate: active.plate }} show={COMPOSITE} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] py-14">
            <p className="font-jetbrains text-[11px] tracking-[0.14em] text-white/35 uppercase">
              no alternatives kept — generate the first
            </p>
            {generate}
          </div>
        )}

        {col.alts.length > 0 && (
          <div>
            <p className="font-jetbrains mb-2 text-[10px] tracking-[0.14em] text-white/35 uppercase">kept</p>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
              {col.alts.map((a, i) => (
                <AltCard
                  key={a.id}
                  alt={a}
                  col={col}
                  n={i + 1}
                  active={a.id === col.activeId}
                  focused={i === focus}
                  onSelect={() => {
                    onFocus(i);
                    alts.select(col.frame.id, a.id);
                  }}
                  onRemove={() => alts.remove(col.frame.id, a.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="font-jetbrains border-t border-white/8 px-4 py-2 text-[10px] text-white/25">
        ↑↓ scene · ←→ alternative · enter adopt · del discard · g generate
      </p>
    </div>
  );
}

function AltCard({
  alt,
  col,
  n,
  active,
  focused,
  onSelect,
  onRemove,
}: {
  alt: SceneAlt;
  col: AltsColumn;
  n: number;
  active: boolean;
  focused: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`group relative rounded-xl border p-1.5 transition ${
        active ? "border-cyan-400/50 ring-1 ring-cyan-400/40" : "border-white/8 hover:border-white/20"
      } ${focused ? "bg-white/[0.05]" : "bg-white/[0.02]"}`}
    >
      <button onClick={onSelect} className="block w-full text-left" aria-label={`Use alternative ${n}`}>
        <FrameCanvas frame={{ ...col.frame, plate: alt.plate }} show={PLATE_ONLY} />
        <span className="font-jetbrains mt-1.5 flex items-center gap-1.5 px-0.5 text-[10px] text-white/35">
          <span className={active ? "text-cyan-200" : ""}>#{String(n).padStart(2, "0")}</span>
          {active && <span className="tracking-[0.12em] text-cyan-200/70 uppercase">in the cut</span>}
          {alt.plate.costUsd ? <span>${alt.plate.costUsd.toFixed(3)}</span> : null}
        </span>
      </button>
      <button
        onClick={onRemove}
        aria-label={`Discard alternative ${n}`}
        className="absolute top-2.5 right-2.5 rounded-md bg-slate-950/70 p-1 text-white/40 opacity-0 transition group-hover:opacity-100 hover:text-rose-300 focus:opacity-100"
      >
        <Trash2 className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
