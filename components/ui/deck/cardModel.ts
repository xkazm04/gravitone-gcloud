// The pure model for deck cards: faces, springs, deal transitions, and pick targets.
// Neither skin (DeckCard in Obsidian, DeckCardAlmanac in Almanac) decides these;
// both draw what this model returns.

import type { DeckArtFamily } from "@/app/_studio/deckArt";
import type { DeckArt } from "./DeckCard";
import { hasEmblem } from "./emblems";

/** The deal: rise + settle from ~0.9 scale. Firm but not bouncy. Exported so
 *  a surface that mirrors the deal shares the numbers instead of copying them. */
export const DEAL_SPRING = { type: "spring", stiffness: 240, damping: 26, mass: 0.9 } as const;

/** The lift: quicker, so hover feels like the card answering the cursor. */
export const LIFT_SPRING = { type: "spring", stiffness: 340, damping: 24 } as const;

/** THE FACE EACH FAMILY DRAWS — the settled answer, per family, in one place. */
export const FAMILY_FACE: Record<DeckArtFamily, "emblem"> = {
  discipline: "emblem",
  template: "emblem",
  engine: "emblem",
};

/** Which deck-art/emblem key this art names, or undefined — never a guess. */
export function manifestKeyOf(art: DeckArt): string | undefined {
  if (art.kind === "gradient") return art.manifestKey;
  if (art.kind === "emblem") return art.emblemId;
  return undefined;
}

/** The family a manifest key belongs to (`<family>-<id>`), or undefined for a
 *  key naming no family this deck draws. */
export function familyOf(key: string): DeckArtFamily | undefined {
  const head = key.slice(0, key.indexOf("-"));
  return head in FAMILY_FACE ? (head as DeckArtFamily) : undefined;
}

/** What the card art stands on, whatever the art's kind. */
export function groundOf(art: DeckArt): { tone?: string; hexes?: string[] } {
  switch (art.kind) {
    case "gradient":
      return { tone: art.tone, hexes: art.hexes };
    case "image":
      return art.fallback ?? {};
    case "emblem":
      return { tone: art.tone };
  }
}

export type CardFace =
  | { face: "image"; src: string; alt?: string; ground: { tone?: string; hexes?: string[] } }
  | { face: "emblem"; key: string; ground: { tone?: string; hexes?: string[] } }
  | { face: "gradient"; ground: { tone?: string; hexes?: string[] } };

export interface PickTarget {
  next: string | null;
  pressed: boolean;
  label: string;
}

/** ONE decision for what a card draws on its face across all worlds and skins. */
export function faceOf(art: DeckArt): CardFace {
  if (art.kind === "image") {
    return {
      face: "image",
      src: art.src,
      alt: art.alt,
      ground: art.fallback ?? {},
    };
  }

  const key = manifestKeyOf(art);
  const ground = groundOf(art);

  if (key && familyOf(key) && hasEmblem(key)) {
    return {
      face: "emblem",
      key,
      ground,
    };
  }

  return {
    face: "gradient",
    ground,
  };
}

/** The pick-target contract: next id, pressed state, and accessible label.
 *  Returns null for a non-pickable card (no target element rendered). */
export function pickTarget(
  spec: { id: string; title: string; pickable?: boolean },
  state: { picked: boolean; noUnpick?: boolean }
): PickTarget | null {
  if (spec.pickable === false) return null;
  const unpick = state.picked && !state.noUnpick;
  return {
    next: unpick ? null : spec.id,
    pressed: state.picked,
    label: `${unpick ? "Unpick" : "Pick"}: ${spec.title}`,
  };
}

/** The deal transition configuration shared by both skins. */
export function dealTransition({ reduced, delay = 0 }: { reduced: boolean; delay?: number }) {
  if (reduced) {
    return { duration: 0.2 };
  }
  return {
    ...DEAL_SPRING,
    delay,
    opacity: { duration: 0.35, delay },
  };
}
