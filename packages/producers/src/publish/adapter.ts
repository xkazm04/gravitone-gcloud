import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Channel, Slot } from "@gt/domain/slot";

// THE CHANNEL SEAM - what differs per publishing channel, behind one trait, so the pipeline
// around it (claim, dry run, record, heartbeat, fail verbatim) is written once in ./publish.ts
// (outbound-notifications: channel-adapter-traits). v1 had no seam: lib/publish/publisher.ts
// `runClaimed` opened with `if (claimed.channelId !== "youtube") throw` and then spoke YouTube
// inline, so a second channel meant a second copy of the claim-record-release discipline.
//
// THE OUTCOME IS DATA. Every method answers a Result; a channel's refusal is the sentence the
// slot will carry verbatim (the Calendar shows publish errors as they came), never control flow
// for the tick. A throw out of an adapter is still caught by the pipeline - and recorded the
// same way - because an adapter written later by someone who did not read this is the case the
// pipeline must not depend on.
//
// BOOKKEEPING IS NOT THE ADAPTER'S. Recording the publication or the failure, releasing the
// claim, booking the would-call: all of it is ./publish.ts's, so no adapter can forget it and
// go invisible exactly when it starts failing.

/** What one publish will send, built WITHOUT the network: the would-call's payload in a dry run,
 *  the receipt a dry run leaves behind, and the pinned subject a live run uploads. */
export type PublishPlan = {
  /** The plan document (v1 publisher.ts `plans/<slotId>.json`, its content): plain JSON. */
  readonly doc: EventData;
  /** The id a dry run reports in place of a platform's (v1 youtube.ts `dryVideoId`). */
  readonly dryId: string;
};

/** What a live publish made on the platform. */
export type Delivered = { readonly platformId: string; readonly url?: string };

/** Lifetime totals as the platform reports them; null where it withheld a number. */
export type LifetimeStats = {
  readonly platformId: string;
  readonly views: number | null;
  readonly likes: number | null;
  readonly comments: number | null;
};

export type UploadHooks = {
  /** Called as bytes are accepted (per chunk). It throws once the claim is lost, and an adapter
   *  lets that throw end the upload: a claimant without its fence must stop sending. */
  readonly progress: () => Promise<void>;
};

export type ChannelAdapter = {
  readonly channel: Channel;
  /** The plan for `slot`, with `publicationId` named in it so the receipt and the record join. */
  plan(slot: Slot, publicationId: string, at: string): Promise<Result<PublishPlan>>;
  /** The live act. Reached only through the DryRun port, so a dry run never enters it. */
  upload(slot: Slot, plan: PublishPlan, hooks: UploadHooks): Promise<Result<Delivered>>;
  /** The publication is recorded: drop what was kept to resume this slot's upload (v1 removed
   *  sessions/<slotId>.json only once the video was recorded, so a lost record can still resume). */
  forget?(slotId: string): Promise<Result<void>>;
  /** Lifetime statistics for live publications; absent on a channel that has none to read. */
  stats?(platformIds: readonly string[]): Promise<Result<readonly LifetimeStats[]>>;
};

export type Adapters = ReadonlyMap<Channel, ChannelAdapter>;

/** The one selection door: a channel with no adapter answers v1's sentence, never a guess. */
export function adapterFor(adapters: Adapters, channel: Channel): Result<ChannelAdapter> {
  const a = adapters.get(channel);
  if (a === undefined) return err("refused", `${channel} has no publishing adapter`);
  if (a.channel !== channel) return err("internal", `the ${channel} adapter is bound to ${a.channel}`);
  return ok(a);
}
