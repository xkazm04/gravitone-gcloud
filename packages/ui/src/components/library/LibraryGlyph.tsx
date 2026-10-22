// The Library's marks (prototype shell.js `I.ref|image|style|motion|audio|video|doc|grid|list|
// play|pause|retry`). A kind is drawn by its mark everywhere it appears - rail row, tile corner,
// list row, detail head, lineage link - so the mark lives with the kind table, not per site.
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

export type LibraryGlyphName = KindId | "list" | "play" | "pause" | "retry" | "pin";

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
    case "list":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <rect x="1" y="2" width="12" height="2" rx="1" />
          <rect x="1" y="6" width="12" height="2" rx="1" />
          <rect x="1" y="10" width="12" height="2" rx="1" />
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
    case "retry":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M11.5 5A5 5 0 102.5 8" />
          <path d="M11.5 1.5V5H8" />
        </svg>
      );
    case "pin":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M5 1.5h4l-.5 4 2 2h-7l2-2z" />
          <path d="M7 7.5v5" />
        </svg>
      );
  }
}
