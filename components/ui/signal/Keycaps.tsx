"use client";

// A KEYMAP BEHIND A DISCLOSURE, not printed on the page.
//
//   app/library/AssetsBrowser.tsx:478-481   a permanent four-clause keymap line
//                                           sitting above the grid on every
//                                           visit, read once and then never
//                                           again
//   app/foundry/FoundryView.tsx             "arrows move · K keep · X reject ·
//                                           U clear · Enter compare", likewise
//                                           permanent
//   app/library/AssetLightbox.tsx:93-95     and a third
//
// A keymap is reference material: needed exactly once, by the person who is
// looking for it, and furniture for everybody else for the rest of the session.
// At rest this is one glyph.
//
// THE TWELVE-WORD RULE DOES NOT APPLY HERE, and that is worth saying because
// <Hint> states it so firmly. That rule is about PROSE — a paragraph moved
// behind a glyph is still a paragraph. A keymap is a table: every row is a key
// and a verb, there is nothing to delete, and length is a function of how many
// keys the surface binds rather than of how much the app wants to explain
// itself. Keep each `does` to one or two words all the same.
//
// Real <kbd> elements, so the markup says "key" to anything reading it. The
// rows are spans rather than a <dl>: <HintPopover> is phrasing content (a
// <span>, so a hint can sit mid-sentence beside the word it qualifies), and a
// <dl> inside it would be flow content nested in phrasing. `display: grid` on a
// span gives the same two-column table without the content-model violation.

import { Hint } from "./Hint";

export interface KeyBinding {
  /** The caps, in press order — `["Ctrl", "K"]`, `["←", "→"]`. */
  keys: string[];
  /** What it does. One or two words. */
  does: string;
}

export function Keycaps({
  map,
  label = "Keyboard shortcuts",
  className = "",
}: {
  map: KeyBinding[];
  /** The glyph's accessible name. */
  label?: string;
  className?: string;
}) {
  return (
    <Hint variant="keys" label={label} className={className}>
      <span className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        {map.map((b, i) => (
          <span key={i} className="contents">
            <span className="flex items-center gap-1">
              {b.keys.map((k, j) => (
                <kbd
                  key={j}
                  className="font-jetbrains inline-flex min-w-[1.5rem] justify-center rounded border border-white/20 bg-white/[0.06] px-1.5 py-0.5 text-label text-white/85"
                >
                  {k}
                </kbd>
              ))}
            </span>
            <span className="text-label text-white/60">{b.does}</span>
          </span>
        ))}
      </span>
    </Hint>
  );
}
