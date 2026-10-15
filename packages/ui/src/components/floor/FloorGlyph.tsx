// The Floor's own marks (prototype shell.js `I.image|article|audio|video`, `I.cull|pair|review`,
// `I.expand|collapse|lock`, `I.chevL|chevR`). They live beside the Floor rather than in
// glyph/Glyph.tsx, whose rule is "only the glyphs a primitive draws": these are drawn by the
// Floor's compositions alone. Each paints from currentColor; size is the caller's class.
// Always decorative (aria-hidden): the control or row around a glyph carries the name.

import type { MediaLane } from "@gt/domain/lane";

import type { PileMode } from "./floor.ts";

export type FloorGlyphName = MediaLane | PileMode | "expand" | "collapse" | "lock" | "chevL" | "chevR";

export function FloorGlyph({ name, className }: { readonly name: FloorGlyphName; readonly className?: string | undefined }) {
  switch (name) {
    case "image":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
          <circle cx="7" cy="8" r="1.6" />
          <path d="M3 15l4.5-4.5 3 3 2.5-2.5L17 15" />
        </svg>
      );
    case "article":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
          <path d="M8 9h5M8 12h5M8 15h3" />
        </svg>
      );
    case "audio":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M2 10h2l2-5 3 10 3-12 2.5 9 1.5-2h2" />
        </svg>
      );
    case "video":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="2.5" y="4" width="11" height="12" rx="2" />
          <path d="M13.5 8.5l4-2.5v8l-4-2.5" />
        </svg>
      );
    case "matrix-cull":
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="0" y="0" width="5" height="5" rx="1" />
          <rect x="7" y="0" width="5" height="5" rx="1" />
          <rect x="0" y="7" width="5" height="5" rx="1" />
          <rect x="7" y="7" width="5" height="5" rx="1" opacity=".4" />
        </svg>
      );
    case "blind-pair":
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="0" y="1" width="5" height="10" rx="1" />
          <rect x="7" y="1" width="5" height="10" rx="1" />
        </svg>
      );
    case "packet-review":
      return (
        <svg className={className} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="1" y="0" width="10" height="12" rx="1" opacity=".35" />
          <rect x="3" y="3" width="6" height="1.4" />
          <rect x="3" y="6" width="6" height="1.4" />
          <rect x="3" y="9" width="4" height="1.4" />
        </svg>
      );
    case "expand":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" />
        </svg>
      );
    case "collapse":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M5 2v3H2M9 2v3h3M5 12V9H2M9 12V9h3" />
        </svg>
      );
    case "lock":
      return (
        <svg className={className} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" />
          <path d="M4 5.5V4a2 2 0 014 0v1.5" />
        </svg>
      );
    case "chevL":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M8.5 3L4.5 7l4 4" />
        </svg>
      );
    case "chevR":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M5.5 3l4 4-4 4" />
        </svg>
      );
  }
}
