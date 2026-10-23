import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import type { PacketSource } from "@gt/domain/source";

import { dojoAdapter } from "./sources/dojo.ts";
import { extractAdapter } from "./sources/extract.ts";
import { forgeAdapter } from "./sources/forge.ts";
import { stripsAdapter } from "./sources/strips.ts";
import { articleAdapter } from "./sources/article.ts";
import { audioAdapter } from "./sources/audio.ts";
import { mvAdapter } from "./sources/mv.ts";
import { proofAdapter } from "./sources/proof.ts";
import { scoutAdapter } from "./sources/scout.ts";
import { seedsAdapter } from "./sources/seeds.ts";
import { sunoAdapter } from "./sources/suno.ts";
import type { DecisionAdapter } from "./types.ts";
import { stepAdapter } from "@/lib/parts/gates";

// EVERY PACKET SOURCE, AND WHO DECIDES IT - one line each (Phase 3 wave B).
// The table is checked against @gt/domain/source's PACKET_SOURCES by
// `satisfies`, so a source the domain grows without a line here is a compile
// error, not a pile that opens and then has nowhere to apply.
//
// A source with no v1 surface is not left out: it is NAMED as not decidable,
// with the reason, so a caller that meets it says why instead of guessing.
//
// SHARED FILE: Lot 22 (forge, extract, dojo, strips) and Lot 23 (article,
// audio, suno, mv) each own their four lines; edit only your own.

export type AdapterEntry =
  | { readonly kind: "adapter"; readonly adapter: DecisionAdapter<unknown> }
  | { readonly kind: "not-decidable"; readonly why: string };

const adapter = (a: DecisionAdapter<unknown>): AdapterEntry => ({ kind: "adapter", adapter: a });
const notDecidable = (why: string): AdapterEntry => ({ kind: "not-decidable", why });

export const DECISION_ADAPTERS = {
  // Lot 22
  forge: adapter(forgeAdapter),
  extract: adapter(extractAdapter),
  dojo: adapter(dojoAdapter),
  strips: adapter(stripsAdapter),
  // Lot 23
  article: adapter(articleAdapter),
  audio: adapter(audioAdapter),
  suno: adapter(sunoAdapter),
  mv: adapter(mvAdapter),
  // No v1 surface
  trials: notDecidable("the prototype's mechanism trials have no v1 store; nothing opens a trials packet from v1"),
  step: adapter(stepAdapter),
  // Phase 5 (L56): a style's pending proofs, from the Style table
  proof: adapter(proofAdapter),
  // spark media-training-loop: one /scout night, a row per candidate (./sources/scout.ts).
  scout: adapter(scoutAdapter),
  // spark scout-decision-graph: a batch of one-sentence seeds, a row per seed (./sources/seeds.ts).
  seeds: adapter(seedsAdapter),
} as const satisfies { readonly [S in PacketSource]: AdapterEntry };

/** The adapter that decides `source`, or `refused` with the reason none does. */
export function adapterFor(source: PacketSource): Result<DecisionAdapter<unknown>> {
  const e: AdapterEntry = DECISION_ADAPTERS[source];
  return e.kind === "adapter" ? ok(e.adapter) : err("refused", `a ${source} packet is not decidable here: ${e.why}`);
}
