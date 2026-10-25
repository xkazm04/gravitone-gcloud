// KEPT CHARACTERS (spark scout-vision S3) - one reader over the scout nights and the muse ARCHIVE (the four muse nights,
// read-only since the wings merged): a kept character is a `character` idea kept on a live committed night of either
// root, grouped by her card's folded name, with her newest kept portrait and her newest KEPT reference sheet. Cast
// briefs, sheets, the taste brief and the Library read this; nothing writes it. WP0 stub: the signatures are final;
// identityBlock and characterKey are the contract's own, WP1 writes keptCharacters.

import type { CharacterCard } from "./muse";
import type { Night } from "./types";

/** A night as a reader sees it: which root it sits in (night ids COLLIDE across roots - key by both). */
export type RootedNight = { readonly root: "scout" | "archive"; readonly night: Night };

export type KeptCharacter = {
  /** characterKey(card.name). */
  readonly key: string;
  /** The newest kept card, as written. */
  readonly card: CharacterCard;
  /** Her newest kept portrait: `<runId>/<c-id>` (runId `muse:<night>` for the archive) and the night-relative file. */
  readonly portrait: { readonly ref: string; readonly root: "scout" | "archive"; readonly night: string; readonly file: string };
  /** Her newest KEPT reference sheet (scout root only); omitted until one is kept. */
  readonly sheet?: { readonly ref: string; readonly night: string; readonly file: string };
  /** Every `<runId>/<c-id>` she was kept on, oldest first. */
  readonly keptOn: readonly string[];
};

/** A card name folded for identity: case and runs of whitespace (`Mara  Vale` = `mara vale`). */
export function characterKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Her IDENTITY BLOCK - what is restated VERBATIM at the head of every prompt she is cast in, and nothing that varies
 * (registry image-prompt-composition / identity-split-from-state): name, stated age, look. The state (expression,
 * pose, situation, personality) goes in its own sentence after it.
 */
export function identityBlock(card: CharacterCard): string {
  return `${card.name}, aged ${card.age}: ${card.look.trim().replace(/\.$/, "")}.`;
}

/** Every kept character over both roots, oldest first by first keep. */
export function keptCharacters(_nights: readonly RootedNight[]): readonly KeptCharacter[] {
  throw new Error("keptCharacters: WP1");
}
