// GENRE AND VENTURE HEADS (spark scout-vision S2) - the kernel's half: who was born from which kept proposal, and
// who was retired. What a genre has proven is derived from the scout nights on read (lib/foundry/scout/genres.ts),
// never written here. WP0 stub: the signatures are final; WP1 adds schema.ts (the `ventures` module: `genres`,
// `ventures`, the append-only `venture_ops`), its DECLARED entry in kernel.ts, and these bodies.

import type { Actor } from "@gt/domain/event";
import type { Genre, Venture, VentureFrame, VentureKind } from "@gt/domain/genre";

import type { Reader, Tx } from "../store.ts";

/** What a kept `genre` proposal births; the id is minted from the name (mintSlugId), bornAt/by from the act. */
export type GenreBirth = Pick<Genre, "name" | "bornFrom" | "proposal" | "use" | "look" | "grammar">;
/** What a kept `venture` proposal births; a channel's frame names the genre(s) it is born from. */
export type VentureBirth = { readonly name: string; readonly kind: VentureKind; readonly frame: VentureFrame; readonly proposal: string };

/**
 * Births a genre. Idempotent on `proposal`: a second call for the same kept proposal returns the genre it already
 * birthed and writes nothing (the Board's apply may be redelivered). Emits `genre.born`.
 */
export function bornGenre(_t: Tx, _birth: GenreBirth, _actor: Actor): Genre {
  throw new Error("bornGenre: WP1");
}

/**
 * Births a venture; idempotent on `proposal` like bornGenre. A channel ties each genre in `frame.genres` to it
 * (Genre.ventureId) in the same transaction. Refuses kind `game` until S4. Emits `venture.born`.
 */
export function bornVenture(_t: Tx, _birth: VentureBirth, _actor: Actor): Venture {
  throw new Error("bornVenture: WP1");
}

/** Retires a live genre (terminal); retiring a retired one refuses. Operator actors only. Emits `genre.retired`. */
export function retireGenre(_t: Tx, _id: string, _actor: Actor): Genre {
  throw new Error("retireGenre: WP1");
}

/** Retires a live venture (terminal); operator actors only. Emits `venture.retired`. */
export function retireVenture(_t: Tx, _id: string, _actor: Actor): Venture {
  throw new Error("retireVenture: WP1");
}

export function readGenre(_r: Reader, _id: string): Genre | undefined {
  throw new Error("readGenre: WP1");
}

/** Every genre, oldest birth first, retired ones included. */
export function listGenres(_r: Reader): readonly Genre[] {
  throw new Error("listGenres: WP1");
}

export function readVenture(_r: Reader, _id: string): Venture | undefined {
  throw new Error("readVenture: WP1");
}

/** Every venture, oldest birth first, retired ones included. */
export function listVentures(_r: Reader): readonly Venture[] {
  throw new Error("listVentures: WP1");
}
