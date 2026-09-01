"use client";

// THE STICKY PAD — a fixed corner notepad that collects feedback across tracks.
//
// Consolidated from three prototype placements (dock / margin / pad). The pad
// won because it is the only one that keeps Recalibrate permanently in reach
// without taking a column away from the grid: the matrix is the thing you are
// reading, and the notepad should be beside it, not in it.
//
// Click any track id in any tab to open the composer for that track.

import { useState } from "react";

import { NotesProvider, useNotes } from "./NotesContext";
import NoteComposer, { NoteList } from "./NoteComposer";
import RecalibrateControl from "./RecalibrateControl";
import type { GateRollup } from "../gate";
import type { VersionsApi } from "../useVersions";

export default function StickyNotebook({
  api,
  gate,
  children,
}: {
  api: VersionsApi;
  /** The gate, re-run over the chain on screen (ScriptStep). Threaded rather
   *  than recomputed here: the verdict and the accept button must be the same
   *  verdict, and a second `gateChains` call is a second answer waiting to
   *  disagree with the first. */
  gate?: GateRollup;
  children: React.ReactNode;
}) {
  return (
    <NotesProvider api={api}>
      {children}
      <Pad api={api} gate={gate} />
    </NotesProvider>
  );
}

function Pad({ api, gate }: { api: VersionsApi; gate?: GateRollup }) {
  const [open, setOpen] = useState(true);
  const ctx = useNotes();
  const cards = [...new Set(api.notes.map((n) => n.cardId))];

  return (
    <div
      data-testid="sticky-pad"
      className="fixed right-5 bottom-5 z-40 w-[22.8rem] max-w-[calc(100vw-2.5rem)]"
    >
      <div className="gt-float rounded-2xl border border-amber-400/35 bg-[var(--gt-ink)]/95 p-3 backdrop-blur-xl">
        <button
          data-testid="pad-toggle"
          // Collapsed or not was a ▾/▸ glyph, which is decoration in an
          // accessibility tree, not state.
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="font-jetbrains flex w-full items-center justify-between text-label tracking-[0.16em] text-amber-200/90 uppercase"
        >
          <span>notes · {api.notes.length}</span>
          <span aria-hidden className="text-white/35">{open ? "▾" : "▸"}</span>
        </button>

        {open && (
          <>
            <div className="mt-2 max-h-[17rem] space-y-2 overflow-y-auto scroll-y">
              {cards.length === 0 ? (
                <p className="font-jetbrains text-content text-white/30">no notes yet</p>
              ) : (
                cards.map((id) => (
                  <div key={id}>
                    <p className="font-jetbrains text-content text-white/45">{id}</p>
                    <NoteList cardId={id} compact />
                  </div>
                ))
              )}
            </div>

            {ctx?.active && (
              <div className="mt-2.5">
                <NoteComposer cardId={ctx.active} />
              </div>
            )}

            <div className="mt-2.5 border-t border-white/10 pt-2.5">
              <RecalibrateControl api={api} gate={gate} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
