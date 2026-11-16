// THE RELEASE STORE'S DOOR FOR lib/ AND THE SERVER (spark studio-to-release). STUBS with the final signatures
// (WP0); WP1 builds them over the kernel `releases` module (packages/kernel/src/releases/). The Server Actions
// (app/(studio)/audio/_release/acts.ts), the real port (../_port/real.ts) and the agent's MCP ops
// (app/_server/mcp/tools/release.ts, WP2) all come through here, so there is one writer of the table.
//
// Every write names the version it was made against: a stale version writes nothing and answers the stored record
// with `stale: true`. Every write appends one `release.*` event in the same transaction, carrying the actor.
import { err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ReleaseRecord } from "@gt/domain/release.record";

/** What the agent sends for one field (the shape of @gt/domain/release.record.schema proposalInputSchema). */
export interface ProposalInput {
  readonly path: string;
  readonly value: unknown;
  readonly source: string;
}

export interface WriteOutcome {
  readonly record: ReleaseRecord;
  readonly stale: boolean;
}

const notBuilt = <T>(): Promise<Result<T>> => Promise.resolve(err("unavailable", "the release store is not built yet"));

/** Every release, newest first. */
export function listReleases(): Promise<Result<readonly ReleaseRecord[]>> {
  return notBuilt();
}

/** One release; `not-found` when no release has the id. */
export function readRelease(_id: string): Promise<Result<ReleaseRecord>> {
  return notBuilt();
}

/**
 * A release from takes in the sound store (their order is the track order). With `keepTake` (the studio's "Release
 * this"), each take is also filed kept and finalized with the release title as its label - the owner's ruling that
 * the press IS the keep.
 */
export function createRelease(_input: { readonly takeIds: readonly string[]; readonly sessionId: string | null; readonly keepTake: boolean; readonly by: Actor }): Promise<Result<ReleaseRecord>> {
  return notBuilt();
}

/** The agent's proposals, appended to `pending` (each refused whole when applying it would not pass the release door). */
export function proposeToRelease(_input: { readonly id: string; readonly version: number; readonly proposals: readonly ProposalInput[]; readonly turnId: string | null; readonly by: Actor }): Promise<Result<WriteOutcome>> {
  return notBuilt();
}
