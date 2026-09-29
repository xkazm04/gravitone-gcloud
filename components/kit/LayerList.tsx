"use client";

// A LAYER LIST: SideList rows that reorder. Select one, drag it, hide it, remove it.
//
// LISTED TOP-DOWN, the way every compositor lists layers: the last-painted layer
// is the one nearest the viewer, so it belongs at the top. The list does not
// reverse anything; the caller hands the layers in the order they are shown, and
// `onReorder` reports the index the layer should END at in that same order.
//
// Reordering has two hands and neither is the only one. The grip is draggable (the
// pointer), and it is a real button that takes ArrowUp / ArrowDown (the keyboard);
// a polite live region says where the layer went. Hidden is a dashed edge and a
// struck eye, never a dimmer word. The list holds no state but the drag in flight.

import { useRef, useState } from "react";

import { Ghost } from "@/components/ui/signal";

import { Ico } from "./Ico";
import { StatusGlyph } from "./StatusGlyph";

export interface Layer {
  id: string;
  /** What kind of layer: "title", "arrow", "figure". Caps, before the name. */
  kind: string;
  name: string;
  hidden?: boolean;
  /** A reason the layer needs a look; drawn as a gate mark named by this. */
  flag?: string;
}

export function LayerList({
  label,
  heading,
  layers,
  selectedId,
  emptyLabel,
  onSelect,
  onReorder,
  onToggleHidden,
  onRemove,
}: {
  /** The list's accessible name. */
  label: string;
  /** The caps heading over the list: "texts". */
  heading: string;
  layers: readonly Layer[];
  selectedId?: string | null;
  /** The word for an empty list: "no texts". */
  emptyLabel: string;
  onSelect: (id: string) => void;
  /** `toIndex` is where the layer ends, in the order the list is shown. */
  onReorder: (id: string, toIndex: number) => void;
  onToggleHidden: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  /** The same fact as `drag`, readable by the next event before React has re-rendered. */
  const dragRef = useRef<string | null>(null);
  /** The gap the drag would drop into: 0..layers.length. */
  const [gap, setGap] = useState<number | null>(null);
  const [said, setSaid] = useState("");

  const commit = (id: string, gapAt: number) => {
    const from = layers.findIndex((l) => l.id === id);
    if (from < 0) return;
    const to = gapAt > from ? gapAt - 1 : gapAt;
    if (to !== from) onReorder(id, to);
  };

  return (
    <section className="k-layers" aria-label={label}>
      <div className="k-layers__h k-caps">
        <span>{heading}</span>
        <span className="k-num">{layers.length}</span>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
      {layers.length === 0 ? (
        <Ghost shape="row" count={1} label={emptyLabel} />
      ) : (
        <ul className="k-layers__list" onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setGap(null)}>
          {layers.map((l, i) => {
            const on = l.id === selectedId;
            return (
              <li
                key={l.id}
                className={`k-layer${on ? " is-on" : ""}${l.hidden ? " is-hidden" : ""}${drag === l.id ? " is-drag" : ""}${
                  gap === i ? " gap-before" : gap === i + 1 && i === layers.length - 1 ? " gap-after" : ""
                }`}
                onDragOver={(e) => {
                  if (!dragRef.current) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  const r = e.currentTarget.getBoundingClientRect();
                  setGap(e.clientY > r.top + r.height / 2 ? i + 1 : i);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = dragRef.current;
                  const at = e.clientY > e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2 ? i + 1 : i;
                  if (from) commit(from, at);
                  dragRef.current = null;
                  setDrag(null);
                  setGap(null);
                }}
              >
                <button
                  type="button"
                  className="k-layer__grip"
                  draggable
                  aria-label={`Move ${l.name}`}
                  aria-keyshortcuts="ArrowUp ArrowDown"
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", l.id);
                    dragRef.current = l.id;
                    setDrag(l.id);
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                    setDrag(null);
                    setGap(null);
                  }}
                  onKeyDown={(e) => {
                    const to = e.key === "ArrowUp" ? i - 1 : e.key === "ArrowDown" ? i + 1 : null;
                    if (to === null) return;
                    e.preventDefault();
                    if (to < 0 || to >= layers.length) return;
                    onReorder(l.id, to);
                    setSaid(`${l.name} moved to position ${to + 1} of ${layers.length}`);
                  }}
                >
                  <Ico name="grip" />
                </button>
                <button
                  type="button"
                  className="k-layer__sel"
                  aria-pressed={on}
                  onClick={() => onSelect(l.id)}
                >
                  <span className="k-layer__kind k-caps">{l.kind}</span>
                  <span className="k-layer__nm">{l.name}</span>
                  {l.flag && <StatusGlyph kind="gate" label={l.flag} size={16} />}
                </button>
                <button
                  type="button"
                  className="k-layer__act"
                  aria-label={l.hidden ? `Show ${l.name}` : `Hide ${l.name}`}
                  aria-pressed={l.hidden ? true : undefined}
                  onClick={() => onToggleHidden(l.id)}
                >
                  <Ico name={l.hidden ? "eye-off" : "eye"} />
                </button>
                <button
                  type="button"
                  className="k-layer__act k-layer__act--danger"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => onRemove(l.id)}
                >
                  <Ico name="trash" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
