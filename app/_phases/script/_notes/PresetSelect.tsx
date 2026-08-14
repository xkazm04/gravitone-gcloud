"use client";

// The preset picker, in the notepad's own theme.
//
// Not a native <select>: its option list is drawn by the OS, so it would land as
// a grey system menu on top of an amber pad. This is a small listbox — same
// keyboard contract (Escape closes, arrows move, Enter picks), styled with the
// pad.

import { useEffect, useRef, useState } from "react";

import { NOTE_KINDS, type NoteKind } from "../versions";

/** Presets only — `custom` is the free-text field beneath, not a preset.
 *  Sorted by name, ascending. */
const PRESETS = NOTE_KINDS.filter((k) => k.kind !== "custom").sort((a, b) =>
  a.label.localeCompare(b.label),
);

export default function PresetSelect({
  cardId,
  onPick,
  disabled,
}: {
  cardId: string;
  onPick: (kind: NoteKind) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % PRESETS.length); }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + PRESETS.length) % PRESETS.length); }
      if (e.key === "Enter") { e.preventDefault(); pick(PRESETS[active].kind); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, active]);

  const pick = (k: NoteKind) => {
    onPick(k);
    setOpen(false);
    setActive(0);
  };

  return (
    <div ref={ref} className="relative">
      <button
        data-testid={`preset-open-${cardId}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="font-jetbrains flex w-full items-center justify-between gap-2 rounded-lg border border-amber-400/35 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] text-amber-100 transition hover:border-amber-400/60 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span>add a note</span>
        <span aria-hidden className="text-amber-300/70">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          data-testid={`preset-list-${cardId}`}
          className="gt-float absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-amber-400/35 bg-[var(--gt-ink)]/97 backdrop-blur-xl"
        >
          {PRESETS.map((k, i) => (
            <li key={k.kind} role="option" aria-selected={i === active}>
              <button
                data-testid={`note-${k.kind}-${cardId}`}
                onClick={() => pick(k.kind)}
                onMouseEnter={() => setActive(i)}
                title={k.hint}
                className={`font-jetbrains block w-full px-2.5 py-1.5 text-left text-[11px] transition ${
                  i === active ? "bg-amber-400/15 text-amber-100" : "text-amber-100/70"
                }`}
              >
                {k.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
