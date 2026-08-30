"use client";

// How a card's art zone is DRAWN, per art variant — the render half of the
// bake-off useArtVariant.ts holds the switch for.
//
// WP2 makes all three variants real:
//  · gradient — unchanged (WP1).
//  · illustrated — kind:"image" cards draw their own picture (a theme's
//    approved proof, in every variant the proof stays the face); every other
//    card resolves a MANIFEST KEY against app/_studio/deckArt.ts (the fixture
//    seam — 13 generated faces, one style brief, provenance in that file) and
//    draws the illustration over its gradient ground. No key, or no entry for
//    it → the gradient stands, honestly: the switcher is a global comparison
//    control, not a per-card promise.
//  · emblem — a stroke motif per card-family member (emblems.tsx), drawn in
//    the family's accent over the gradient ground. A card with no motif keeps
//    the WP1 glyph placeholder rather than borrowing a wrong emblem.
//
// HOW A CARD NAMES ITS ART — `manifestKey`, carried on the art itself:
// gradient-kind art declares it (`DeckCard.tsx` owns the union; the wizard's
// stages and the candidates duel pass `discipline-*` / `template-*` /
// `engine-*` keys), and an emblem's `emblemId` IS a manifest key by
// convention. A card without a key degrades to the gradient — never to
// wrong art.

import { DECK_ART } from "@/app/_studio/deckArt";

import type { DeckArt } from "./DeckCard";
import { DeckEmblem, emblemToneClass, hasEmblem } from "./emblems";
import { ART_VARIANTS, useArtVariant } from "./useArtVariant";

/** Which deck-art/emblem key this art names, or undefined — never a guess. */
function manifestKeyOf(art: DeckArt): string | undefined {
  if (art.kind === "gradient") return art.manifestKey;
  if (art.kind === "emblem") return art.emblemId;
  return undefined;
}

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

/** The glyph placeholder — now only the emblem variant's fallback for a card
 *  whose key has no drawn motif. */
function glyphOf(title: string): string {
  return [...title.trim()][0]?.toUpperCase() ?? "·";
}

export function DeckArtView({ art, title }: { art: DeckArt; title: string }) {
  const [variant] = useArtVariant();
  const key = manifestKeyOf(art);

  if (variant === "illustrated") {
    if (art.kind === "image") {
      return (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL out of an IndexedDB proof sheet; next/image has nothing to fetch, optimise or cache
        <img src={art.src} alt={art.alt ?? ""} className="absolute inset-0 h-full w-full object-cover" />
      );
    }
    const entry = key ? DECK_ART[key] : undefined;
    if (entry) {
      return (
        <>
          {/* the gradient stands underneath — the ground while the file
              streams in, and the honest face if it never arrives */}
          <GradientArt {...groundOf(art)} />
          {/* eslint-disable-next-line @next/next/no-img-element -- a static fixture under public/deck-art at final display weight; the deck's art zone is object-cover, there is nothing for next/image to size */}
          <img
            src={entry.src}
            alt={entry.alt}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        </>
      );
    }
    // no illustration exists for this card — the gradient, honestly.
    return <GradientArt {...groundOf(art)} />;
  }

  if (variant === "emblem") {
    return (
      <>
        <GradientArt {...groundOf(art)} />
        {key && hasEmblem(key) ? (
          <span aria-hidden className={`absolute inset-0 grid place-items-center ${emblemToneClass(key)}`}>
            <DeckEmblem emblemKey={key} className="h-16 w-16" />
          </span>
        ) : (
          <span
            aria-hidden
            className="font-instrument absolute inset-0 grid place-items-center text-6xl text-white/50"
          >
            {glyphOf(title)}
          </span>
        )}
      </>
    );
  }

  // "gradient" — the WP1 baseline.
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
