"use client";

// WHAT IS CHOSEN AND WHERE THE KEYBOARD IS — two different things, and the
// distinction is the whole reason this is a file and not two `useState` calls.
//
//   `selected` is STATE. Changing it must re-render the cards entering and
//   leaving the selection, and nothing else.
//
//   `cursor` is a REF. It records where a POINTER last touched. It is not state
//   because a click that moved the keyboard cursor would re-render the card the
//   cursor left, for a ring nobody asked to see. The first key press adopts it.
//
//   `active` is the card the keyboard HAS, and it is state because it draws a
//   ring and because the viewport's `aria-activedescendant` names it.
//
// The two refs themselves live in `BoardRefs` (./canvasTypes.ts), because the
// drag, the keyboard and the delegated clicks all touch them. This hook is handed
// `cursorRef` and owns only the state.

import { useState } from "react";

import { NONE } from "./tunables";

export interface Selection {
  selected: ReadonlySet<string>;
  setSelected: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  active: string | null;
  setActive: React.Dispatch<React.SetStateAction<string | null>>;
  toggleSelect(id: string): void;
  /** A pointer touched a card: it becomes the cursor at the next key press, and
   *  the ring on whichever card the keyboard had is put out. */
  touch(id: string): void;
}

export function useSelection(cursorRef: React.RefObject<string | null>): Selection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(NONE);
  const [active, setActive] = useState<string | null>(null);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const touch = (id: string) => {
    cursorRef.current = id;
    if (active) setActive(null);
  };

  return { selected, setSelected, active, setActive, toggleSelect, touch };
}
