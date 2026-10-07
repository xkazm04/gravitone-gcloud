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

import { Tally } from "@/components/ui/signal";
import { NotesProvider, useNotes } from "./NotesContext";
import NoteComposer, { NoteList } from "./NoteComposer";
import RecalibrateControl from "./RecalibrateControl";
import type { Card } from "../../_shared/notebook/cards";
import type { Scope } from "../../research/scope";
import type { GateRollup } from "../gate";
import type { VersionsApi } from "../useVersions";

export default function StickyNotebook({
  api,
  gate,
  cards,
  scope,
  optIn,
  children,
}: {
  api: VersionsApi;
  /** The gate, re-run over the chain on screen (ScriptStep). Threaded rather
   *  than recomputed here: the verdict and the accept button must be the same
   *  verdict, and a second `gateChains` call is a second answer waiting to
   *  disagree with the first. */
  gate?: GateRollup;
  cards?: Card[];
  scope?: Scope;
  optIn?: ReadonlySet<string>;
  children: React.ReactNode;
}) {
  return (
    <NotesProvider api={api}>
      {children}
      <Pad api={api} gate={gate} cards={cards} scope={scope} optIn={optIn} />
    </NotesProvider>
  );
}

function Pad({
  api,
  gate,
  cards,
  scope,
  optIn,
}: {
  api: VersionsApi;
  gate?: GateRollup;
  cards?: Card[];
  scope?: Scope;
  optIn?: ReadonlySet<string>;
}) {
  const [open, setOpen] = useState(true);
  const ctx = useNotes();
  // A handle click on a collapsed pad must show its composer: the pad
  // opens whenever a card becomes active. Synced during render (not an effect)
  // so the composer is in the same paint as the tint.
  const [seenActive, setSeenActive] = useState<string | null>(null);
  const active = ctx?.active ?? null;
  if (active !== seenActive) {
    setSeenActive(active);
    if (active) setOpen(true);
  }
  const notedCardIds = [...new Set(api.notes.map((n) => n.cardId))];

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
          <span className="flex items-center gap-2">
            <span>notes · {api.notes.length}</span>
            {!open && api.running && (
              <Tally label="recalibrating" value={api.notes.length} tone="amber" />
            )}
            {!open && !api.running && api.candidate && (
              <Tally label="candidate" value={api.candidate.notes.length} tone="cyan" />
            )}
          </span>
          <span aria-hidden className="text-white/35">{open ? "▾" : "▸"}</span>
        </button>

        {open && (
          <>
            <div className="mt-2 max-h-[17rem] space-y-2 overflow-y-auto scroll-y">
              {notedCardIds.length === 0 ? (
                <p className="font-jetbrains text-content text-white/30">no notes yet</p>
              ) : (
                notedCardIds.map((id) => (
                  <div key={id}>
                    <p className="font-jetbrains text-content text-white/45">{id}</p>
                    <NoteList cardId={id} compact />
                  </div>
                ))
              )}
            </div>

            {ctx?.active && (
              <div className="mt-2.5">
                <NoteComposer key={ctx.active} cardId={ctx.active} />
              </div>
            )}

            <div className="mt-2.5 border-t border-white/10 pt-2.5">
              <RecalibrateControl api={api} gate={gate} cards={cards} scope={scope} optIn={optIn} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
