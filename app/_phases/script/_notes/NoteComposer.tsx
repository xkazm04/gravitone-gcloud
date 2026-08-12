"use client";

// Stacking a bullet against one track: a preset, or free text.
//
// The presets are what makes feedback actionable — a note whose KIND is known
// can move the weights. Free text is kept and sent, but it moves nothing, and
// each free-text bullet carries that on its own row rather than in a paragraph.

import { useState } from "react";

import { NOTE_KINDS, type NoteKind } from "../versions";
import { useNotes } from "./NotesContext";
import PresetSelect from "./PresetSelect";

export default function NoteComposer({ cardId, title }: { cardId: string; title?: string }) {
  const ctx = useNotes();
  const [free, setFree] = useState("");
  if (!ctx) return null;
  const { api } = ctx;

  const add = (kind: NoteKind, text?: string) => {
    if (!api.addNote(cardId, kind, text)) return;
    if (kind === "custom") setFree("");
  };

  return (
    <div
      data-testid={`composer-${cardId}`}
      className="rounded-xl border border-amber-400/30 bg-amber-400/[0.05] p-2.5"
    >
      <p className="font-jetbrains text-[10px] text-amber-200/70">{cardId}</p>
      {title && <p className="mt-0.5 mb-1.5 text-[12px] leading-snug text-slate-300">{title}</p>}

      {api.running ? (
        <p className="font-jetbrains text-[11px] text-amber-200/90">notes locked while recalibrating</p>
      ) : (
        <>
          <PresetSelect cardId={cardId} onPick={(k) => add(k)} />
          <div className="mt-1.5 flex gap-1.5">
            <input
              data-testid={`note-free-${cardId}`}
              value={free}
              onChange={(e) => setFree(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && free.trim() && add("custom", free.trim())}
              placeholder="something else…"
              className="font-hanken min-w-0 flex-1 rounded-lg border border-white/12 bg-white/[0.03] px-2 py-1 text-[12px] text-slate-200 placeholder:text-white/25"
            />
            <button
              onClick={() => free.trim() && add("custom", free.trim())}
              disabled={!free.trim()}
              className="font-jetbrains rounded-lg border border-amber-400/35 px-2 py-1 text-[10px] text-amber-100/80 transition hover:bg-amber-400/10 disabled:opacity-30"
            >
              add
            </button>
          </div>
        </>
      )}

      <NoteList cardId={cardId} />
    </div>
  );
}

/** The bullets already stacked against a track. */
export function NoteList({ cardId, compact }: { cardId: string; compact?: boolean }) {
  const ctx = useNotes();
  if (!ctx) return null;
  const { api } = ctx;
  const mine = api.notesFor(cardId);
  if (!mine.length) return null;

  return (
    <ul className={compact ? "space-y-0.5" : "mt-2 space-y-0.5 border-t border-amber-400/20 pt-1.5"}>
      {mine.map((n) => (
        <li key={n.id} className="flex items-start gap-1.5">
          <span aria-hidden className="font-jetbrains mt-px text-[10px] text-amber-300">
            •
          </span>
          <span className="font-jetbrains min-w-0 flex-1 text-[11px] leading-snug text-amber-100/85">
            {n.kind === "custom" ? n.text : NOTE_KINDS.find((k) => k.kind === n.kind)?.label}
            {n.kind === "custom" && <span className="ml-1 text-white/30">· no weight change</span>}
          </span>
          <button
            onClick={() => api.removeNote(n.id)}
            disabled={api.running}
            aria-label="remove note"
            className="font-jetbrains shrink-0 text-[10px] text-white/25 transition hover:text-rose-300 disabled:opacity-30"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
