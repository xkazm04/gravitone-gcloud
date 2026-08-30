"use client";

// How a card's art zone is DRAWN, per art variant — the render half of the
// bake-off useArtVariant.ts holds the switch for.
//
// WP1 implements: gradient fully; image as a plain <img> (the sources are
// data: URLs out of IndexedDB proof sheets — there is nothing for next/image
// to optimise or cache there); emblem as a placeholder — the gradient ground
// plus the card title's initial glyph, which WP2 replaces with real emblems.
//
// Selecting "illustrated" when a card has no image art falls back to the
// gradient — honestly, not blankly: the card still has a ground, and the
// variant switcher is a global comparison control, not a per-card promise.

import type { DeckArt } from "./DeckCard";
import { ART_VARIANTS, useArtVariant } from "./useArtVariant";

/** The neutral ground for a card whose data brought no tone of its own. */
const DEFAULT_TONE = "from-cyan-400/20 via-white/[0.04] to-transparent";

/** Inline gradient off runtime data (a style's palette). Inline because a
 *  Tailwind class composed at runtime gets no CSS from the JIT — and the hex
 *  values are CONTENT (what a generated image looks like), never chrome, per
 *  the scoped colour-literal rule in tokens.ts. */
function swatchGradient(hexes: string[]): string {
  const last = Math.max(hexes.length - 1, 1);
  const stops = hexes.map((h, i) => `${h} ${Math.round((i / last) * 100)}%`).join(", ");
  return `linear-gradient(135deg, ${stops})`;
}

function GradientArt({ tone, hexes }: { tone?: string; hexes?: string[] }) {
  if (hexes && hexes.length > 0) {
    return (
      <div aria-hidden className="absolute inset-0 opacity-60" style={{ background: swatchGradient(hexes) }} />
    );
  }
  return <div aria-hidden className={`absolute inset-0 bg-gradient-to-br ${tone || DEFAULT_TONE}`} />;
}

/** What the gradient/emblem variants stand on, whatever the art's kind. */
function groundOf(art: DeckArt): { tone?: string; hexes?: string[] } {
  switch (art.kind) {
    case "gradient":
      return { tone: art.tone, hexes: art.hexes };
    case "image":
      return art.fallback ?? {};
    case "emblem":
      return { tone: art.tone };
  }
}

/** WP1 emblem placeholder: the title's first glyph. `emblemId` is carried on
 *  the art but not yet consumed — WP2's renderer keys on it. */
function glyphOf(title: string): string {
  return [...title.trim()][0]?.toUpperCase() ?? "·";
}

export function DeckArtView({ art, title }: { art: DeckArt; title: string }) {
  const [variant] = useArtVariant();

  if (variant === "illustrated" && art.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data: URL out of an IndexedDB proof sheet; next/image has nothing to fetch, optimise or cache
      <img src={art.src} alt={art.alt ?? ""} className="absolute inset-0 h-full w-full object-cover" />
    );
  }

  if (variant === "emblem") {
    return (
      <>
        <GradientArt {...groundOf(art)} />
        <span
          aria-hidden
          className="font-instrument absolute inset-0 grid place-items-center text-6xl text-white/50"
        >
          {glyphOf(title)}
        </span>
      </>
    );
  }

  // "gradient" — and the honest fallback for "illustrated" without an image.
  return <GradientArt {...groundOf(art)} />;
}

/** The bake-off switch. A prototype control (WP2 retires it with a verdict), so
 *  it is discreet — mono, small, corner of the Deck shell — but labelled, so it
 *  is discoverable rather than secret. */
export function ArtVariantSwitcher() {
  const [variant, setVariant] = useArtVariant();
  return (
    <div role="group" aria-label="Card art variant (prototype)" className="flex items-center gap-1.5">
      <span className="font-jetbrains text-[10px] tracking-[0.14em] text-white/25 uppercase">art</span>
      {ART_VARIANTS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={variant === v}
          onClick={() => setVariant(v)}
          className={`font-jetbrains rounded-full border px-2 py-0.5 text-[10px] tracking-[0.08em] transition ${
            variant === v
              ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200"
              : "border-white/10 text-white/35 hover:border-white/25 hover:text-white/65"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}
