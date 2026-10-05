"use client";

// POINTER DRAG for a slot card — the mouse path to a move. The keyboard path is
// the slot sheet's own Move field, reached by pressing the card.
//
// Not HTML5 drag-and-drop: its drag image is a translucent screenshot the page
// cannot style, and its drop target is a cell, so a time grid could only land
// on whole hours. A pointer drag lets the week draw its own landing card at
// the snapped minute and name the time it will land on before the drop.
//
// The caller's `resolve` turns a pointer into a landing (a time, a column) in
// the MOVE HANDLER, never during render: the geometry it needs is a DOM read,
// and a DOM read during render is the impurity the React Compiler rules refuse.
//
// A press that never travels four pixels is a click, and the card's native
// onClick handles it; a press that did travel swallows the click that follows.
// Escape mid-drag abandons it.

import { useRef, useState } from "react";

export interface Pointer {
  x: number;
  y: number;
  /** where the press began */
  x0: number;
  y0: number;
}

export function usePointerDrag<T, P>({
  canDrag,
  resolve,
  onDrop,
}: {
  canDrag: (item: T) => boolean;
  /** pointer -> landing; null = nowhere legal */
  resolve: (item: T, p: Pointer) => P | null;
  onDrop: (item: T, at: P) => void;
}) {
  const [drag, setDrag] = useState<{ item: T; at: P | null } | null>(null);
  const press = useRef<{ item: T; x0: number; y0: number; moved: boolean; at: P | null } | null>(null);
  const swallowClick = useRef(false);

  const bind = (item: T) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      // a drop whose click never arrived (the card moved out from under the
      // pointer) must not eat the next press
      swallowClick.current = false;
      if (e.button !== 0 || !canDrag(item)) return;
      press.current = { item, x0: e.clientX, y0: e.clientY, moved: false, at: null };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const p = press.current;
      if (!p) return;
      if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 4) return;
      p.moved = true;
      p.at = resolve(p.item, { x: e.clientX, y: e.clientY, x0: p.x0, y0: p.y0 });
      setDrag({ item: p.item, at: p.at });
    },
    onPointerUp: () => {
      const p = press.current;
      press.current = null;
      if (!p?.moved) return;
      swallowClick.current = true;
      setDrag(null);
      if (p.at !== null) onDrop(p.item, p.at);
    },
    onPointerCancel: () => {
      press.current = null;
      setDrag(null);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Escape" && press.current) {
        press.current = null;
        setDrag(null);
      }
    },
  });

  /** call first in a card's onClick; true = this click ended a drag */
  const endedDrag = () => {
    const was = swallowClick.current;
    swallowClick.current = false;
    return was;
  };

  return { drag, bind, endedDrag };
}
