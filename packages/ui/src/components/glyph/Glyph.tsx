// The design's glyphs (shell.js `I`), as components instead of SVG strings spliced into
// innerHTML. Only the ones a shared primitive draws live here; a page's own glyphs arrive
// with its page (wave 3+). Size and colour are the caller's class: every glyph paints from
// currentColor except the warning's cut-out, which is a token. The three actor marks
// (operator, agent, machine) are the ledger's vocabulary and travel with ActorKind, so any
// surface that names who acted draws the same mark (Phase 2, the Ledger).
import s from "./Glyph.module.css";

export type GlyphName = "ledger" | "search" | "warn" | "down" | "up" | "chevR" | "grid" | "doc" | "operator" | "agent" | "machine";

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
    case "up":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M3 8.5L7 4.5l4 4" />
        </svg>
      );
    case "chevR":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M5.5 3l4 4-4 4" />
        </svg>
      );
    case "grid":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <rect x="1" y="1" width="5" height="5" rx="1" />
          <rect x="8" y="1" width="5" height="5" rx="1" />
          <rect x="1" y="8" width="5" height="5" rx="1" />
          <rect x="8" y="8" width="5" height="5" rx="1" />
        </svg>
      );
    case "doc":
      return (
        <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
          <path d="M12 2.5V6h3.5" />
        </svg>
      );
    case "operator":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
          <circle cx="7" cy="4.5" r="2.6" />
          <path d="M2 13c0-3 2.2-4.8 5-4.8s5 1.8 5 4.8z" />
        </svg>
      );
    case "agent":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="2.5" y="4" width="9" height="7.5" rx="2" />
          <path d="M7 1.5V4M5 7.5h.01M9 7.5h.01" />
        </svg>
      );
    case "machine":
      return (
        <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="2" y="2" width="10" height="10" rx="1.5" />
          <path d="M5 5h4v4H5z" fill="currentColor" />
        </svg>
      );
  }
}
