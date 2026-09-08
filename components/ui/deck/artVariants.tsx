"use client";

// How a card's art zone is DRAWN — one DECLARED face per card family, and no
// switch anywhere.
//
// ── THE BAKE-OFF IS OVER (operator ruling, 2026-09-08) ──────────────────────
//
// Verbatim: *"Art tab switcher in app/_phases/research/ResearchStep.tsx:290
// does nothing visibly. Lets remove it from the codebase."* So the switcher,
// the `useArtVariant` store and its `gravitone.deck.art` localStorage key are
// gone — including from the identity-eviction owner's exception list
// (lib/identityEviction.ts) and the probe that walks it.
//
// A switch removed is a decision that has to be MADE rather than deferred, and
// there were two open:
//
//  · discipline + template — already settled. Both stages pinned `emblem` on
//    2026-08-30 and the pin was re-ruled permanent on 2026-09-08 after the
//    committed illustrations were compared against redrawn denotative emblems
//    and lost. That pin now lives here instead of on every card spec.
//
//  · engine-* (the script duel, app/_phases/script/candidates) — the one
//    comparison nobody had ruled on, which is why the 2026-09-08 gating stopped
//    short of deletion. RULED HERE, with both faces rendered at the real art-zone
//    size (500×128, object-cover) before choosing: **emblem**.
//
//    Both options are denotative — unlike the discipline set, the engine
//    illustrations really do read (a hairpin path, a balance, interlocked rings),
//    so legibility did not decide it. What decided it is the duel's own stated
//    law: "nothing here ranks the cards" (CandidatesDuel.tsx). The illustrations
//    rank them anyway, by accident of the crop — object-cover into a 128px band
//    keeps `adjudication` centred and blazing, cuts the arrowhead off
//    `reversal-chain`, and leaves the three at visibly unequal weight. A stroke
//    emblem is one accent, one stroke width, one optical size by construction,
//    so it identifies without weighting. Second reason: with all three families
//    on emblems the deck has ONE art vocabulary rather than two.
//
//    The three engine illustrations are NOT orphaned by this — public/deck-art
//    ships all 13 and the landing page's gate contact sheet draws them by path
//    (app/_landing/GateContactSheet.tsx).
//
// ── WHAT A CARD DRAWS, then ──────────────────────────────────────────────────
//  · kind:"image" — its own picture, always. A theme's approved proof or a
//    preset's committed render IS the card's face; a gradient of its palette
//    would sell the colours, not the style.
//  · a card whose art names a MANIFEST KEY in a family below — that family's
//    face over the gradient ground.
//  · anything else — the gradient, honestly. Never wrong art.
//
// HOW A CARD NAMES ITS ART — `manifestKey`, carried on the art itself:
// gradient-kind art declares it (`DeckCard.tsx` owns the union; the wizard's
// stages and the candidates duel pass `discipline-*` / `template-*` /
// `engine-*` keys), and an emblem's `emblemId` IS a manifest key by convention.

import type { DeckArtFamily } from "@/app/_studio/deckArt";

import type { DeckArt } from "./DeckCard";
import { DeckEmblem, emblemToneClass, hasEmblem } from "./emblems";

/** THE FACE EACH FAMILY DRAWS — the settled answer, per family, in one place.
 *
 *  Typed `Record<DeckArtFamily, "emblem">` rather than a wider union on purpose:
 *  today the answer is uniform, and the type says so. The day a family is ruled
 *  onto a different face, this annotation stops compiling and whoever widens it
 *  has to add the branch in `DeckArtView` in the same edit — which is the
 *  failure mode a `string` here would hide. */
const FAMILY_FACE: Record<DeckArtFamily, "emblem"> = {
  discipline: "emblem", // 2026-08-30, re-ruled permanent 2026-09-08
  template: "emblem", // 2026-08-30, the same ruling
  engine: "emblem", // 2026-09-08 — the last open comparison, closed above
};

/** Which deck-art/emblem key this art names, or undefined — never a guess. */
function manifestKeyOf(art: DeckArt): string | undefined {
  if (art.kind === "gradient") return art.manifestKey;
  if (art.kind === "emblem") return art.emblemId;
  return undefined;
}

/** The family a manifest key belongs to (`<family>-<id>`), or undefined for a
 *  key naming no family this deck draws. */
function familyOf(key: string): DeckArtFamily | undefined {
  const head = key.slice(0, key.indexOf("-"));
  return head in FAMILY_FACE ? (head as DeckArtFamily) : undefined;
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

/** What the emblem stands on, whatever the art's kind. */
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

export function DeckArtView({ art }: { art: DeckArt }) {
  const key = manifestKeyOf(art);

  // A real picture is the card's face whatever the family rule says — the
  // ground stands beneath while the file streams, and if it never arrives.
  if (art.kind === "image") {
    return (
      <>
        <GradientArt {...groundOf(art)} />
        {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL out of an IndexedDB proof sheet or a committed /presets file; next/image has nothing to fetch, optimise or cache */}
        <img src={art.src} alt={art.alt ?? ""} className="absolute inset-0 h-full w-full object-cover" />
      </>
    );
  }

  // ONE fallback, not two. A key naming no family, and a key whose family draws
  // emblems but which has no motif drawn for it, both land on the gradient —
  // the honest face for "this card was never given art", rather than a big
  // initial glyph duplicating the title printed directly underneath it.
  if (key && familyOf(key) && hasEmblem(key)) {
    return (
      <>
        <GradientArt {...groundOf(art)} />
        <span aria-hidden className={`absolute inset-0 grid place-items-center ${emblemToneClass(key)}`}>
          <DeckEmblem emblemKey={key} className="h-16 w-16" />
        </span>
      </>
    );
  }

  return <GradientArt {...groundOf(art)} />;
}
