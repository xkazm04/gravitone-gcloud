// The deck's illustrated card faces — the fixture seam for the art-variant
// bake-off (WP2). Surfaces resolve through DECK_ART / deckArtFor, never a raw
// path: a card whose id has no entry here HAS no illustration, and the renderer
// (components/ui/deck/artVariants.tsx) falls back to the gradient honestly
// rather than 404-ing an <img>.
//
// PROVENANCE — the generation record, kept beside the data it describes.
// Generated 2026-08-30 with gpt-image-2 (MEDIUM, 1024×768) via the Leonardo
// v2 API, then downscaled to 768×576 WebP for the card art zone (the top ~40%
// of a card, object-cover). One style brief across all 13, so the set reads as
// one deck rather than thirteen commissions:
//
//   "Premium trading-card key art for a dark cinematic video studio interface.
//    Abstract and symbolic — strictly no text, no letters, no numbers, no
//    logos, no watermark, no human figures. Near-black blue-tinted void ground
//    (deep ink #080a10) with fine film grain and soft atmospheric haze;
//    hairline glass geometry; a single luminous focal point; depth from
//    gradient falloff, not drop shadows; restrained instrument-panel futurism,
//    never neon arcade clutter. Composition reads clearly at small size, focal
//    point near center, generous dark margins."
//
// plus one accent family per card family — the same assignment the deck's
// chips and gradients already make (components/ui/tokens.ts ACCENT):
//   disciplines → cyan (#67e8f9) · templates → violet (#a78bfa) ·
//   engines → emerald (#6ee7b7)
// and one motif line per card (each alt below is that motif, compressed).
//
// The hex values in this comment are CONTENT — what the generated images look
// like — recorded so the brief can be re-run; chrome colour still lives only
// in components/ui/tokens.ts.

export type DeckArtFamily = "discipline" | "template" | "engine";

export interface DeckArtEntry {
  src: string;
  alt: string;
}

/** Keyed `<family>-<id>`: discipline ids from lib/projects DISCIPLINES,
 *  template ids from TEMPLATES, engine keys from the script render ids in
 *  app/_phases/script/renders.ts (reversal-chain · adjudication ·
 *  derived-short). */
export const DECK_ART: Record<string, DeckArtEntry> = {
  "discipline-educational": {
    src: "/deck-art/discipline-educational.webp",
    alt: "branching chains of glass nodes converging into one bright lens",
  },
  "discipline-trailer": {
    src: "/deck-art/discipline-trailer.webp",
    alt: "a dark monolith gate cracked open, one blade of light spilling through",
  },
  "discipline-free": {
    src: "/deck-art/discipline-free.webp",
    alt: "a lone pendulum beam of light over an empty stage floor",
  },
  "template-short-form-clip": {
    src: "/deck-art/template-short-form-clip.webp",
    alt: "a brilliant shard cleaved from a dark crystal, streaking away",
  },
  "template-short-educational-video": {
    src: "/deck-art/template-short-educational-video.webp",
    alt: "a single glowing orb held in a hairline armature",
  },
  "template-mid-educational-video": {
    src: "/deck-art/template-mid-educational-video.webp",
    alt: "an arched bridge of light spanning a dark chasm end to end",
  },
  "template-teaser": {
    src: "/deck-art/template-teaser.webp",
    alt: "a barely-open aperture leaking one sliver of light into mist",
  },
  "template-trailer": {
    src: "/deck-art/template-trailer.webp",
    alt: "a staircase of glass panels rising toward a radiant portal",
  },
  "template-cinematic": {
    src: "/deck-art/template-cinematic.webp",
    alt: "an anamorphic lens flare over a landscape of floating monoliths",
  },
  "template-free-form": {
    src: "/deck-art/template-free-form.webp",
    alt: "ribbons of light escaping an open wireframe rectangle",
  },
  "engine-reversal-chain": {
    src: "/deck-art/engine-reversal-chain.webp",
    alt: "a segmented path of light making one sharp hairpin reversal",
  },
  "engine-adjudication": {
    src: "/deck-art/engine-adjudication.webp",
    alt: "two beams of light on a balance settling into equilibrium",
  },
  "engine-derived-short": {
    src: "/deck-art/engine-derived-short.webp",
    alt: "two interlocked impossible rings resolving at one glowing junction",
  },
};

/** The lookup surfaces use. `undefined` is the honest answer for a card that
 *  was never illustrated — the caller falls back, it does not guess. */
export function deckArtFor(family: DeckArtFamily, id: string): DeckArtEntry | undefined {
  return DECK_ART[`${family}-${id}`];
}
