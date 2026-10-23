// THE SEEDS DOOR - server only (spark scout-decision-graph WP-S1). WP-S0 STUB except `usableSeed` and `seedsInForce` (complete): the signatures are the contract;
// WP-S1 fills the bodies. A batch of ~100 one-sentence seeds is validated whole and written by one call; the
// CLI's `seeds` command and the night's step 0 both go through `addSeedBatch`.

import { err, ok, type Result } from "@gt/domain/errors";

import { ancestryOf, listSeedBatches, seedOf } from "./seedStore";
import { pausedUnder, readSteer } from "./steer";
import { SEED_REF_RE, type NightId, type SeedBatch, type SeedRef } from "./types";

export type SeedBatchOptions = {
  readonly dry: boolean;
  /** The night writing it at its start; absent for a batch written by day. */
  readonly night?: NightId;
  readonly now?: Date;
};

/** Validate a batch (`[{sentence, genre, subgenre, type, audience, format, parent?}]`) and write it whole. */
export async function addSeedBatch(_raw: unknown, _o: SeedBatchOptions): Promise<Result<SeedBatch>> {
  return err("refused", "the seeds door is being built (spark scout-decision-graph WP-S1)");
}

/** True once any LIVE batch committed a kept seed: from then on every new idea brief must name its seed. */
export function seedsInForce(batches: readonly SeedBatch[]): boolean {
  return batches.some((b) => b.committed !== undefined && !b.committed.dry && b.committed.kept.length > 0);
}

/**
 * The door every seed-taking act calls (ideas `seed`, track `--seed`, direction `seed`, a child seed's
 * `parent`): Ok when the ref names a kept seed of a live batch and no paused branch holds it; else the
 * refusal sentence naming the ref and why.
 */
export async function usableSeed(ref: SeedRef, batches?: readonly SeedBatch[]): Promise<Result<SeedRef>> {
  if (!SEED_REF_RE.test(ref)) return err("invalid", `not a seed ref: ${ref} (want <batch>/sd-NNN)`);
  const all = batches ?? (await listSeedBatches());
  const found = seedOf(all, ref);
  if (found === undefined) return err("refused", `no seed ${ref}`);
  const c = found.batch.committed;
  if (c === undefined) return err("refused", `seed ${ref} is not decided yet: its batch ${found.batch.id} is uncommitted`);
  if (c.dry) return err("refused", `seed ${ref} was kept on a dry batch; nothing derives from it`);
  if (!c.kept.includes(found.seed.id)) return err("refused", `seed ${ref} was not kept${c.rejected.includes(found.seed.id) ? ` (rejected: ${(c.reasons[found.seed.id] ?? []).join(", ") || "no reason"})` : ""}`);
  const paused = pausedUnder(await readSteer(), ancestryOf(all, ref));
  if (paused !== undefined) return err("refused", `seed ${ref} sits under the paused branch ${paused}; resume it on /scout first`);
  return ok(ref);
}

/** The CLI's `seeds` command: `new --json <file|-> [--dry]`, `status [<batch>]`. Lines to print and the --json doc. */
export async function seedsCommand(
  _sub: string | undefined,
  _o: { readonly batch?: string; readonly input: () => Promise<unknown>; readonly dry: boolean; readonly now: Date },
): Promise<{ readonly lines: string[]; readonly doc: Record<string, unknown>; readonly code: number }> {
  return { lines: ["the seeds command is being built (spark scout-decision-graph WP-S1)"], doc: { ok: false }, code: 1 };
}
