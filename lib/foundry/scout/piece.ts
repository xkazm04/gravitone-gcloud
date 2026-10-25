// A GENRE'S PIECE (spark scout-vision S2): the best kept trial rendered in full - only the clips the operator rejected
// on it re-made on LTX - and cut with the clips' own audio into one 15-30 s mp4 (`pieces/c-NN/piece.mp4`). Kept on the
// Board, the genre is publishable. WP0 stub: the signatures are final; WP3 writes the act, the cut and the collect.

import type { Store } from "@gt/kernel/store";

import type { ActContext } from "./acts";
import type { NightId, PieceCandidate } from "./types";

/** The piece's local engines, injectable for tests: one clip of a still, and the cut of clips into one video. */
export type PieceEngines = {
  /** One LTX clip of a still (PNG bytes): the mp4 bytes and its length. */
  readonly clip?: (still: Uint8Array, prompt: string, seed: number) => Promise<{ readonly bytes: Uint8Array; readonly durationS: number }>;
  /** Cut the clips (absolute paths, in order) into `out`, audio kept: the cut's length. */
  readonly cut?: (clips: readonly string[], out: string) => Promise<{ readonly durationS: number }>;
};

export type PieceResult = {
  readonly candidates: readonly PieceCandidate[];
  readonly jobIds: readonly string[];
  readonly outcome?: string;
  readonly dry?: boolean;
};

/** Every due piece (genres.ts piecesDue), or only `genre`'s: one candidate and one job each. */
export async function pieceAct(_ctx: ActContext, _id: NightId, _o: { readonly genre?: string }, _engines: PieceEngines = {}): Promise<PieceResult> {
  throw new Error("pieceAct: WP3");
}

/** A detached piece job's results into the night. */
export async function collectPieces(_id: NightId, _o: { readonly store?: Store } = {}): Promise<PieceCandidate[]> {
  throw new Error("collectPieces: WP3");
}
