"use client";

// The seam between the matrix and the sticky notebook.
//
// A matrix row does not know WHERE notes are shown — it only knows that its id
// is clickable and how many notes it already carries. That is what lets the same
// three matrix variants sit under three different notebook placements without
// any of them being rewritten.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { VersionsApi } from "../useVersions";

interface NotesCtx {
  api: VersionsApi;
  /** The card whose composer is open, if any. */
  active: string | null;
  open: (cardId: string) => void;
  close: () => void;
  toggle: (cardId: string) => void;
  count: (cardId: string) => number;
}

const Ctx = createContext<NotesCtx | null>(null);

export function NotesProvider({
  api,
  placement,
  children,
}: {
  api: VersionsApi;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<string | null>(null);

  const open = useCallback((id: string) => setActive(id), []);
  const close = useCallback(() => setActive(null), []);
  const toggle = useCallback((id: string) => setActive((a) => (a === id ? null : id)), []);
  const count = useCallback((id: string) => api.notesFor(id).length, [api]);

  const value = useMemo<NotesCtx>(
    () => ({ api, active, open, close, toggle, count }),
    [api, active, open, close, toggle, count],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null outside a provider — the matrix must still render in a context that has
 *  no notebook, so this is optional by design rather than a throwing hook. */
export function useNotes(): NotesCtx | null {
  return useContext(Ctx);
}

/** The clickable track id. This is the single affordance the user asked for:
 *  click an id, stack a bullet against it. */
export function NoteHandle({ cardId }: { cardId: string }) {
  const ctx = useNotes();
  if (!ctx)
    return <span className="font-jetbrains text-[10px] text-white/25">{cardId}</span>;

  const n = ctx.count(cardId);
  const isOpen = ctx.active === cardId;
  return (
    <button
      data-testid={`note-handle-${cardId}`}
      onClick={() => ctx.toggle(cardId)}
      disabled={ctx.api.running}
      title={
        ctx.api.running
          ? "A recalibration is running — notes are locked until it lands."
          : n
            ? `${n} note${n === 1 ? "" : "s"} on this track`
            : "Add a note to this track"
      }
      className={`font-jetbrains rounded px-1 text-[10px] transition disabled:cursor-not-allowed ${
        isOpen
          ? "bg-cyan-400/20 text-cyan-100"
          : n
            ? "bg-amber-400/15 text-amber-200"
            : "text-white/25 hover:bg-white/10 hover:text-white/70"
      }`}
    >
      {cardId}
      {n > 0 && <span className="ml-1 font-semibold">{n}</span>}
    </button>
  );
}
