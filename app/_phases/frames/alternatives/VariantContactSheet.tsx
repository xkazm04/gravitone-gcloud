"use client";

// CONTACT SHEET — the cut as a strip of film on a light table.
//
// The assembly ledger asks "what is not done": one row per scene, columns for
// the layers, read DOWN. This asks a different question — "which picture, of
// the ones we paid for, is in the cut" — and that question is not vertical. So
// the sheet turns the cut on its side: one COLUMN per scene on a single
// horizontal rail, every kept alternative stacked inside it, the chosen one
// circled, and the whole cut scanned left→right the way you'd pull a physical
// contact sheet across a light box.
//
// At sixteen scenes that is a nicety. At a hundred and twelve (the stress
// toggle) it is the only readable shape — which is why the rail is virtualized
// by hand and the scrubber above it is O(n) divs rather than O(n) images.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { canRemoveAlt, type AltsColumn, type AltsCtl, type SceneAlt } from "./alts";
import type { Frame } from "../frames";
import { FrameCanvas, KindChip } from "../parts";

const COL_W = 248;
const GAP = 12;
const STRIDE = COL_W + GAP;
const OVERSCAN = 4;

/** Thumbnails compare PLATES, not compositions: the overlays are identical
 *  across a scene's alternatives, so drawing them only adds ink. */
const PLATE_ONLY = { plate: true, elements: false, texts: false };

export default function VariantContactSheet({ alts }: { alts: AltsCtl }) {
  const rail = useRef<HTMLDivElement>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = alts.columns;
  const { first, last } = useMemo(() => {
    if (!width) return { first: 0, last: Math.min(cols.length - 1, OVERSCAN * 2) };
    const f = Math.max(0, Math.floor(scrollLeft / STRIDE) - OVERSCAN);
    const l = Math.min(cols.length - 1, Math.ceil((scrollLeft + width) / STRIDE) + OVERSCAN);
    return { first: f, last: l };
  }, [scrollLeft, width, cols.length]);

  // The scrubber's viewport marker tracks what is actually READABLE, so it is
  // measured without the overscan the renderer pads itself with.
  const seen = useMemo(() => {
    if (!width || !cols.length) return { from: 0, to: 0 };
    return {
      from: Math.max(0, Math.floor(scrollLeft / STRIDE)),
      to: Math.min(cols.length, Math.ceil((scrollLeft + width) / STRIDE)),
    };
  }, [scrollLeft, width, cols.length]);

  const scrollTo = useCallback((i: number) => {
    rail.current?.scrollTo({ left: Math.max(0, i * STRIDE - STRIDE), behavior: "smooth" });
  }, []);

  if (!alts.loaded) {
    return (
      <p className="font-jetbrains py-16 text-center text-[11px] tracking-[0.18em] text-white/30 uppercase">
        loading the sheet…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cost, stress and errors live on the host header — the variant only
          owns the sheet itself. */}
      <Scrubber cols={cols} busy={alts.busy} from={seen.from} to={seen.to} onGo={scrollTo} />

      <div
        ref={rail}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        // A mouse wheel only emits deltaY; on a rail the axis it means is X.
        // Trackpads already emit deltaX and keep their native feel — only a
        // pure vertical tick is re-aimed.
        onWheel={(e) => {
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
        }}
        style={{ height: "68vh" }}
        className="scroll-x scroll-rail flex gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3"
      >
        {/* Spacers stand in for the unmounted columns. They carry one GAP less
            than the runs they replace, because the flex gap between the spacer
            and the first real column is already one of those gaps. */}
        {first > 0 && <div style={{ width: first * STRIDE - GAP }} className="shrink-0" aria-hidden />}
        {cols.slice(first, last + 1).map((col, k) => (
          <SheetColumn
            key={col.frame.id}
            col={col}
            index={first + k}
            busy={alts.busy.has(col.frame.id)}
            onSelect={(altId) => alts.select(col.frame.id, altId)}
            onRemove={(altId) => alts.remove(col.frame.id, altId)}
            onGenerate={() => void alts.generate(col.frame.id)}
          />
        ))}
        {last < cols.length - 1 && (
          <div style={{ width: (cols.length - 1 - last) * STRIDE - GAP }} className="shrink-0" aria-hidden />
        )}
      </div>

      <p className="font-jetbrains text-[10px] tracking-[0.12em] text-white/30 uppercase">
        scanning {seen.from + 1}–{Math.min(seen.to, cols.length)} of {cols.length} · mounted {last - first + 1}
      </p>
    </div>
  );
}

/* ── The strip above the rail ─────────────────────────────────────────────── */

/** One cell per scene, whatever the count. This is the "where am I in a hundred
 *  scenes" answer, and it is cheap divs on purpose — no images, no canvases. */
function Scrubber({
  cols,
  busy,
  from,
  to,
  onGo,
}: {
  cols: AltsColumn[];
  busy: ReadonlySet<string>;
  from: number;
  to: number;
  onGo: (i: number) => void;
}) {
  const n = cols.length || 1;
  return (
    <div className="relative">
      <div className="flex h-4 gap-[2px] rounded-md border border-white/8 bg-white/[0.02] p-[3px]">
        {cols.map((c, i) => (
          <button
            key={c.frame.id}
            onClick={() => onGo(i)}
            title={`${c.frame.at} · ${c.frame.title} · ${c.alts.length} alt${c.alts.length === 1 ? "" : "s"}`}
            aria-label={`Scroll to ${c.frame.title}`}
            className={`min-w-[2px] flex-1 rounded-[1px] transition ${
              busy.has(c.frame.id) ? "bg-amber-300/60" : c.alts.length ? "bg-cyan-400/40" : "bg-white/10"
            } hover:bg-white/60`}
          />
        ))}
      </div>
      {/* The viewport, drawn over the strip rather than beside it. */}
      <div
        aria-hidden
        style={{ left: `${(from / n) * 100}%`, width: `${(Math.max(to - from, 1) / n) * 100}%` }}
        className="pointer-events-none absolute inset-y-0 rounded-md border border-cyan-200/60 bg-cyan-200/[0.06]"
      />
    </div>
  );
}

/* ── One scene ────────────────────────────────────────────────────────────── */

function SheetColumn({
  col,
  index,
  busy,
  onSelect,
  onRemove,
  onGenerate,
}: {
  col: AltsColumn;
  index: number;
  busy: boolean;
  onSelect: (altId: string) => void;
  onRemove: (altId: string) => void;
  onGenerate: () => void;
}) {
  return (
    <section
      style={{ width: COL_W }}
      className="gt-rise flex h-full shrink-0 flex-col rounded-xl border border-white/8 bg-white/[0.02]"
    >
      <header className="space-y-1.5 border-b border-white/8 px-2.5 py-2">
        <div className="flex items-center gap-2">
          <span className="font-jetbrains text-[10px] text-white/25">{String(index + 1).padStart(2, "0")}</span>
          <span className="font-jetbrains text-[11px] text-white/55">{col.frame.at}</span>
          <KindChip kind={col.frame.kind} />
        </div>
        <div className="flex items-center gap-2">
          <p className="font-hanken min-w-0 flex-1 truncate text-[13px] text-white/85" title={col.frame.title}>
            {col.frame.title}
          </p>
          <span className="font-jetbrains shrink-0 text-[10px] tracking-[0.12em] text-white/35 uppercase">
            {col.alts.length} alt{col.alts.length === 1 ? "" : "s"}
          </span>
        </div>
      </header>

      <div className="scroll-y flex-1 space-y-2 p-2.5">
        {col.alts.length === 0 && (
          <div className="rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-6 text-center">
            <p className="font-jetbrains text-[10px] tracking-[0.12em] text-white/30 uppercase">no alternatives kept</p>
          </div>
        )}

        {col.alts.map((alt) => (
          <AltCard
            key={alt.id}
            frame={col.frame}
            alt={alt}
            active={col.activeId === alt.id}
            onSelect={() => onSelect(alt.id)}
            onRemove={() => onRemove(alt.id)}
            // The only kept picture cannot be discarded: the cut would go on
            // using it while this column reported none. `useAlternatives.remove`
            // refuses it — this is the same rule drawn, so the control explains
            // itself instead of doing nothing when pressed.
            removable={canRemoveAlt(col.frame.id, col.alts.length)}
          />
        ))}

        <button
          onClick={onGenerate}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-transparent px-2.5 py-4 transition hover:border-cyan-400/40 hover:bg-cyan-400/[0.04] disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-200" aria-hidden />
          ) : (
            <Plus className="h-3.5 w-3.5 text-white/40" aria-hidden />
          )}
          <span
            className={`font-jetbrains text-[10px] tracking-[0.12em] uppercase ${busy ? "text-cyan-100" : "text-white/45"}`}
          >
            {busy ? "generating…" : "alternative"}
          </span>
        </button>
      </div>
    </section>
  );
}

function AltCard({
  frame,
  alt,
  active,
  onSelect,
  onRemove,
  removable,
}: {
  frame: Frame;
  alt: SceneAlt;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  removable: boolean;
}) {
  return (
    <div className="group relative">
      <button
        onClick={active ? undefined : onSelect}
        aria-pressed={active}
        aria-label={active ? "In the cut" : "Use this alternative"}
        className={`block w-full rounded-xl transition ${
          active ? "ring-2 ring-cyan-400/70" : "opacity-80 hover:opacity-100"
        }`}
      >
        <FrameCanvas frame={{ ...frame, plate: alt.plate }} show={PLATE_ONLY} />
      </button>

      {active && (
        <span className="font-jetbrains pointer-events-none absolute bottom-1.5 left-1.5 rounded-full border border-cyan-400/40 bg-slate-950/80 px-2 py-0.5 text-[9px] tracking-[0.12em] text-cyan-100 uppercase">
          in the cut
        </span>
      )}

      {/* Deleting a kept alternative throws away money that was already spent,
          so the control hides until the card is under the pointer. */}
      <button
        onClick={onRemove}
        disabled={!removable}
        aria-label={removable ? "Discard this alternative" : "The only kept alternative cannot be discarded"}
        title={
          removable
            ? undefined
            : "This is the only picture kept for the scene, and the cut is using it. Generate another alternative first."
        }
        className="absolute top-1.5 right-1.5 rounded p-1 text-white/40 opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100 hover:text-rose-300 focus-visible:opacity-100 disabled:cursor-not-allowed disabled:text-white/15 disabled:hover:text-white/15"
      >
        <Trash2 className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
