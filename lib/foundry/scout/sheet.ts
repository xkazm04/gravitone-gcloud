// A KEPT CHARACTER'S REFERENCE SHEET (spark scout-vision S3): one neutral 1:1 still on local Flux, her kept portrait
// admitted late as the reference (OUR picture - never a source file), the prompt her identity block plus the neutral
// framing (rest expression, three-quarter head, even light, plain field, invariant wardrobe). Judged on the Board; a
// kept sheet becomes her reference for every Flux frame she is cast in. WP0 stub: the signatures are final; WP3
// writes the act, its job and the collect.

import type { Store } from "@gt/kernel/store";

import type { ActContext } from "./acts";
import type { NightId, SheetCandidate } from "./types";

/** The sheet's local engine, injectable for tests: one Flux still from a prompt and our own reference stills. */
export type SheetEngines = {
  readonly draw?: (prompt: string, o: { readonly refs: readonly Uint8Array[]; readonly late: number; readonly seed?: number }) => Promise<{ readonly png: Uint8Array; readonly seed: number }>;
};

export type SheetResult = {
  readonly candidates: readonly SheetCandidate[];
  readonly jobIds: readonly string[];
  readonly outcome?: string;
  readonly dry?: boolean;
};

/** A sheet for every kept character with no kept sheet and none in flight (or only `character`'s): one candidate each. */
export async function sheetAct(_ctx: ActContext, _id: NightId, _o: { readonly character?: string }, _engines: SheetEngines = {}): Promise<SheetResult> {
  throw new Error("sheetAct: WP3");
}

/** A detached sheet job's results into the night. */
export async function collectSheets(_id: NightId, _o: { readonly store?: Store } = {}): Promise<SheetCandidate[]> {
  throw new Error("collectSheets: WP3");
}
