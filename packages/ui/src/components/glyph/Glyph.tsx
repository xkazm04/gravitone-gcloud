// The design's glyphs (shell.js `I`), as components instead of SVG strings spliced into
// innerHTML. Only the ones a shared primitive draws live here; a page's own glyphs arrive
// with its page (wave 3+). Size and colour are the caller's class: every glyph paints from
// currentColor except the warning's cut-out, which is a token.
import s from "./Glyph.module.css";

export type GlyphName = "ledger" | "search" | "warn" | "down";

export function Glyph({ name, className }: { readonly name: GlyphName; readonly className?: string | undefined }) {
  switch (name) {
    case "ledger":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="M3 2.5h10v11H3z" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
        </svg>
      );
    case "search":
      return (
        <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" />
        </svg>
      );
    case "warn":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <path d="M7 1l6.5 12h-13z" />
          <rect className={s.cut} x="6.3" y="5" width="1.4" height="4" />
          <rect className={s.cut} x="6.3" y="10" width="1.4" height="1.4" />
        </svg>
      );
    case "down":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M3 5.5L7 9.5l4-4" />
        </svg>
      );
  }
}
