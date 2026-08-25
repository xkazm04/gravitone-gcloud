"use client";

// The layer list — select, reorder, hide, delete.
//
// Ordered TOP-DOWN, the way every compositor lists layers and the opposite of
// how the arrays are stored: the last-painted layer is the one nearest the
// viewer, so it belongs at the top of the list. Getting this backwards is the
// single most disorienting thing a layer panel can do.
//
// Texts are one group and elements another, and they never interleave. That is
// a legibility rule rather than a limitation — a caption behind an arrow is not
// a look, it is a bug — and stating it here is cheaper than an ordering control
// nobody should use.

import { ArrowDown, ArrowUp, Eye, EyeOff, Trash2 } from "lucide-react";

import { ClipStatusWord } from "@/app/_studio/projectParts";

import { isAuthoredClip, type Frame, type LayerRef } from "./frames";

export default function LayerPanel({
  frame,
  selected,
  onSelect,
  onReorder,
  onToggleHidden,
  onRemove,
}: {
  frame: Frame;
  selected: LayerRef;
  onSelect: (ref: LayerRef) => void;
  onReorder: (ref: NonNullable<LayerRef>, dir: -1 | 1) => void;
  onToggleHidden: (ref: NonNullable<LayerRef>) => void;
  onRemove: (ref: NonNullable<LayerRef>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-jetbrains text-[10px] tracking-[0.14em] text-white/40 uppercase">layers</p>

      <Group label="texts">
        {[...frame.texts].reverse().map((t, i, arr) => (
          <Row
            key={t.id}
            name={t.value || t.role}
            kind={t.role}
            hidden={t.hidden}
            selected={selected?.type === "text" && selected.id === t.id}
            first={i === 0}
            last={i === arr.length - 1}
            warn={t.role === "figure" && !t.factId}
            onSelect={() => onSelect({ type: "text", id: t.id })}
            // The list is reversed, so "up" in the list is "later" in the array.
            onUp={() => onReorder({ type: "text", id: t.id }, 1)}
            onDown={() => onReorder({ type: "text", id: t.id }, -1)}
            onHide={() => onToggleHidden({ type: "text", id: t.id })}
            onRemove={() => onRemove({ type: "text", id: t.id })}
          />
        ))}
        {!frame.texts.length && <Empty>no texts</Empty>}
      </Group>

      <Group label="elements">
        {[...frame.elements].reverse().map((e, i, arr) => (
          <Row
            key={e.id}
            name={e.label || e.kind}
            kind={e.kind}
            hidden={e.hidden}
            selected={selected?.type === "element" && selected.id === e.id}
            first={i === 0}
            last={i === arr.length - 1}
            onSelect={() => onSelect({ type: "element", id: e.id })}
            onUp={() => onReorder({ type: "element", id: e.id }, 1)}
            onDown={() => onReorder({ type: "element", id: e.id }, -1)}
            onHide={() => onToggleHidden({ type: "element", id: e.id })}
            onRemove={() => onRemove({ type: "element", id: e.id })}
          />
        ))}
        {!frame.elements.length && <Empty>no elements</Empty>}
      </Group>

      <Group label="plate">
        <p className="font-jetbrains px-1 py-1 text-[11px] text-white/40">
          {frame.plate.state === "ready" ? "rendered · always the ground" : "not rendered"}
        </p>
      </Group>

      {/* The clip sits beside the plate because it IS the plate, moving — not a
          fifth thing stacked over the other four. It is the one row in this
          panel with nothing to select, reorder or hide, and that asymmetry is
          the honest shape: there is no video provider in this app, so a clip is
          authored and never rendered. The line below says so every time rather
          than once in a tooltip. */}
      <Group label="clip">
        <div className="space-y-1 px-1 py-1">
          {isAuthoredClip(frame) ? (
            <>
              <p className="font-jetbrains flex items-center gap-1.5 text-[11px] text-white/40">
                authored ·<ClipStatusWord status={frame.clip.status} />
              </p>
              <p className="font-hanken text-[11px] leading-snug text-white/60">{frame.clip.motion}</p>
            </>
          ) : (
            <p className="font-jetbrains text-[11px] text-white/40">no motion authored</p>
          )}
          <p className="font-jetbrains text-[10px] leading-snug text-white/25">
            no video engine is wired here — the render seam is unbuilt
          </p>
        </div>
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/8 p-1.5">
      <p className="font-jetbrains mb-1 px-1 text-[9px] tracking-[0.12em] text-white/30 uppercase">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="px-1 py-1 text-[11px] text-white/25">{children}</p>
);

function Row({
  name,
  kind,
  hidden,
  selected,
  first,
  last,
  warn,
  onSelect,
  onUp,
  onDown,
  onHide,
  onRemove,
}: {
  name: string;
  kind: string;
  hidden?: boolean;
  selected: boolean;
  first: boolean;
  last: boolean;
  warn?: boolean;
  onSelect: () => void;
  onUp: () => void;
  onDown: () => void;
  onHide: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-0.5 rounded px-1 py-0.5 transition ${
        selected ? "bg-cyan-400/12" : "hover:bg-white/5"
      } ${hidden ? "opacity-45" : ""}`}
    >
      {/* Selected is a background tint and a text colour, and nothing else.
          `aria-pressed` is what makes the same fact available to a reader who
          gets no colour. */}
      <button
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
      >
        <span className="font-jetbrains w-11 shrink-0 text-[9px] text-white/35">{kind}</span>
        <span className={`font-hanken truncate text-[12px] ${selected ? "text-cyan-100" : "text-white/75"}`}>
          {name}
        </span>
        {warn && (
          <span className="shrink-0 text-[9px] text-amber-300" title="figure with no fact behind it">
            ●
          </span>
        )}
      </button>

      <button onClick={onUp} disabled={first} aria-label="Bring forward" className="rounded p-0.5 text-white/25 transition hover:text-white/80 disabled:opacity-20">
        <ArrowUp className="h-3 w-3" aria-hidden />
      </button>
      <button onClick={onDown} disabled={last} aria-label="Send backward" className="rounded p-0.5 text-white/25 transition hover:text-white/80 disabled:opacity-20">
        <ArrowDown className="h-3 w-3" aria-hidden />
      </button>
      <button onClick={onHide} aria-label={hidden ? "Show layer" : "Hide layer"} className="rounded p-0.5 text-white/25 transition hover:text-white/80">
        {hidden ? <EyeOff className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
      </button>
      <button onClick={onRemove} aria-label="Remove layer" className="rounded p-0.5 text-white/25 transition hover:text-rose-300">
        <Trash2 className="h-3 w-3" aria-hidden />
      </button>
    </div>
  );
}
