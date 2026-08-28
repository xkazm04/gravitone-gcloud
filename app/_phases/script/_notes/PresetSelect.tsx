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
  a.label.localeCompare(b.label) || a.kind.localeCompare(b.kind),
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

  // OUTSIDE-CLICK ONLY. The key handling deliberately does NOT live on
  // `document`: while the list was open, an `Enter` anywhere on the page was
  // preventDefault-ed and spent on the active preset. The free-text field sits
  // three lines below this component and outside it, so a keyboard user who
  // tabbed off the trigger, typed a sentence and pressed Enter added their custom
  // note AND a preset note they never chose. A listbox owns the keys inside
  // itself; it does not own the document.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (k: NoteKind) => {
    onPick(k);
    setOpen(false);
    setActive(0);
  };

  /** The same contract as before — Escape closes, arrows move, Enter picks — but
   *  scoped to this component's own subtree. Closed, it returns immediately so
   *  the trigger's native Enter/Space still opens the list. */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % PRESETS.length); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + PRESETS.length) % PRESETS.length); return; }
    if (e.key === "Enter") { e.preventDefault(); pick(PRESETS[active].kind); }
  };

  /** Tabbing out of the list closes it, which is what makes the scoping above
   *  complete: an open list that has lost focus can no longer answer a key, so it
   *  must not stay on screen claiming it can. */
  const onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div ref={ref} onKeyDown={onKeyDown} onBlur={onBlur} className="relative">
      <button
        data-testid={`preset-open-${cardId}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        // A button that keeps focus while arrows move an active option in a
        // popup listbox IS the APG select-only combobox — and `combobox` is the
        // role that supports aria-activedescendant; the implicit `button` role
        // does not, and screen readers ignore the attribute there.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`preset-list-${cardId}`}
        // The trigger keeps focus while the list is open, so the active option is
        // announced from here — now that the role permits it.
        aria-activedescendant={open ? `preset-${cardId}-${PRESETS[active].kind}` : undefined}
        className="font-jetbrains flex w-full items-center justify-between gap-2 rounded-lg border border-amber-400/35 bg-amber-400/[0.06] px-2.5 py-1.5 text-[11px] text-amber-100 transition hover:border-amber-400/60 hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span>add a note</span>
        <span aria-hidden className="text-amber-300/70">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          id={`preset-list-${cardId}`}
          data-testid={`preset-list-${cardId}`}
          className="gt-float absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-amber-400/35 bg-[var(--gt-ink)]/97 backdrop-blur-xl"
        >
          {PRESETS.map((k, i) => (
            <li key={k.kind} id={`preset-${cardId}-${k.kind}`} role="option" aria-selected={i === active}>
              <button
                data-testid={`note-${k.kind}-${cardId}`}
                onClick={() => pick(k.kind)}
                onMouseEnter={() => setActive(i)}
                // Not a tab stop: the trigger owns focus and the arrows move the
                // selection, which is the listbox contract. Leaving these in the
                // tab order also put the free-text field one Tab further away
                // behind five options nobody wanted to walk through.
                tabIndex={-1}
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
