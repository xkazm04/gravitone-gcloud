// The Library's marks (prototype shell.js `I.ref|image|style|motion|audio|video|doc|grid`), plus
// play and pause, which the Cull's VideoBar draws. The prototype's list, retry and pin marks had
// no caller and were dropped. A kind is drawn by its mark everywhere it appears - rail row, tile
// corner, list row, detail head, lineage link - so the mark lives with the kind table, not per site.
// Note the prototype's pairing, kept: an IMAGE item (a reference) wears the magnifier-on-paper
// mark and a PLATE (a made picture) the picture mark; a reference is what you look AT.
// Each paints from currentColor; size is the caller's class. Always decorative (aria-hidden):
// the control or row around a mark carries the name.

import { KIND_LABELS, type LibraryKindName } from "@gt/domain/library";

import { FloorGlyph } from "../floor/FloorGlyph.tsx";
import { Glyph } from "../glyph/Glyph.tsx";

export type KindId = LibraryKindName | "all";

/** The rail's kinds in order, with the words the prototype gave each (the contract's KIND_LABELS). */
export const KINDS: readonly { readonly id: KindId; readonly label: string; readonly short: string }[] = KIND_LABELS.map((k) => ({ id: k.kind, label: k.label, short: k.short }));

export const kindLabel = (k: KindId): string => KINDS.find((x) => x.id === k)?.label ?? k;
export const kindShort = (k: KindId): string => KINDS.find((x) => x.id === k)?.short ?? k;

export type LibraryGlyphName = KindId | "play" | "pause";

export function LibraryGlyph({ name, className }: { readonly name: LibraryGlyphName; readonly className?: string | undefined }) {
  switch (name) {
    case "all":
      return <Glyph name="grid" className={className} />;
    case "doc":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
          <path d="M12 2.5V6h3.5" />
        </svg>
      );
    case "image":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M4 3.5h9l3 3v10H4z" />
          <circle cx="9" cy="10" r="2.5" />
          <path d="M11 12l3 3" />
        </svg>
      );
    case "plate":
      return <FloorGlyph name="image" className={className} />;
    case "audio":
    case "video":
      return <FloorGlyph name={name} className={className} />;
    case "style":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <circle cx="7" cy="7" r="4" />
          <circle cx="13" cy="7" r="4" />
          <circle cx="10" cy="12.5" r="4" />
        </svg>
      );
    case "motion":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="2.5" y="5" width="15" height="10" rx="2" />
          <path d="M2.5 8h15M6 5v3M10 5v3M14 5v3" />
        </svg>
      );
    case "model":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M10 2.5l6.5 3.75v7.5L10 17.5l-6.5-3.75v-7.5z" />
          <path d="M3.5 6.25L10 10l6.5-3.75M10 10v7.5" />
        </svg>
      );
    case "character":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="10" cy="6.5" r="3" />
          <path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
        </svg>
      );
    case "genre":
      // A ladder: the rungs a genre climbs (perfecting, piece due, publishable).
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M6 2.5v15M14 2.5v15" />
          <path d="M6 6h8M6 10h8M6 14h8" />
        </svg>
      );
    case "venture":
      // A flag on its pole: a channel, an album or a game planted.
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 17.5v-15" />
          <path d="M5 3.5h10l-2.5 3.5 2.5 3.5H5" />
        </svg>
      );
    case "play":
      return (
        <svg className={className} viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <path d="M2 1l7 4-7 4z" />
        </svg>
      );
    case "pause":
      return (
        <svg className={className} viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
          <rect x="2" y="1" width="2.2" height="8" />
          <rect x="5.8" y="1" width="2.2" height="8" />
        </svg>
      );
  }
}
