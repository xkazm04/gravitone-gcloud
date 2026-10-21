import { randomUUID } from "node:crypto";
import { errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Holder, RunMode } from "@gt/domain/job";
import type { Publication } from "@gt/domain/publication";
import type { BlobRef } from "@gt/domain/blob";
import { canonical } from "@gt/kernel/canonical";
import { paid, withDryRun } from "@gt/kernel/dryrun";
import type { Effects } from "@gt/kernel/effects";
import { actorOf } from "@gt/kernel/lease";
import type { Alive } from "@gt/kernel/lease-core";
import type { Quote } from "@gt/kernel/pricing/quote";
import { publishedText } from "@gt/kernel/slots/core";
import { heartbeatClaim, recordFailure, recordPublication, type PublicationDraft } from "@gt/kernel/slots/outcome";
import { priorPublicationIn } from "@gt/kernel/slots/read";
import type { ClaimedSlot } from "@gt/kernel/slots/sweep";
import type { Store } from "@gt/kernel/store";
import { adapterFor, type Adapters, type ChannelAdapter, type Delivered } from "./adapter.ts";

// THE PUBLISH STEP - a claimed slot becomes a Publication or a failure, once (v1
// lib/publish/publisher.ts `runClaimed`, absorbed). The claim is the sweep's (a kernel lease on
// `slot:<id>`, @gt/kernel/slots/sweep); this file holds it while it sends and lets go of it in
// the same commit as the verdict (@gt/kernel/slots/outcome: recordPublication / recordFailure,
// both FENCED, so a claimant the sweep has since declared interrupted is refused at its own write
// and the sweep's verdict stands).
//
// Kept from v1: the pinned subject (the adapter plans exactly the item the slot names, never
// "whatever is latest"); the resumable session persisted before the first byte and dropped only
// once the publication is recorded (the adapter's, keyed by slot); privacy private; captions
// from a sidecar; a failure lands on the slot as the channel's own sentence and never throws out
// of the tick. Upgraded:
//   DRY IS THE KERNEL'S. The upload goes through the DryRun port as a declared call
//     (`paid`, priced at no charge with its quota stated), so under a dry mode the adapter's live
//     function is never entered and the ledger books a `dryrun.would-call` whose payloadDigest is
//     the plan's digest. The plan itself (v1's plans/<slotId>.json content) is written as a blob
//     whose bytes are the plan's canonical form - so its sha256 IS that digest, and the receipt
//     on the ledger names the blob it describes without a second id. v1's own PUBLISH_MODE switch
//     and its client-side "send() refuses outside live" stay as the second wall, not the first.
//   THE CLAIM IS KEPT ALIVE while bytes move: every chunk heartbeats this slot's claim, and the
//     claims this tick took but has not reached yet, so a long upload cannot age a waiting claim
//     past its TTL and hand it to another sweep as "interrupted" before a byte of it was sent.
//   A LOST CLAIM STOPS THE SENDER: the heartbeat throws, the adapter's upload ends, and nothing
//     more goes out under a fence that no longer holds.
//   ONE PUBLICATION PER ITEM x CHANNEL x MODE (v1's lookup over publications.json: "a dry run does
//     not block the live upload that follows it") is asked of the store before anything is
//     planned, in v1's words, and is a constraint behind that (@gt/kernel/slots/schema step 4).

/** YouTube's Data API charges nothing for an upload; what it spends is quota, said in words. */
const UPLOAD_QUOTE: Quote = { usd: 0, basis: "estimated", note: "a platform upload is not billed; videos.insert spends 1600 of the project's daily quota units" };

/** v1 publisher.ts had no stop: a kill was the only way out. A stop between a sweep's claims now
 *  fails the claims it had not started, in words, rather than leaving them to age into "interrupted". */
export const STOPPED_TEXT = "the worker stopped before this upload began";

export type PublishDeps = {
  readonly store: Store;
  /** The live port (store + blobs); the DryRun wraps it by `mode`. */
  readonly fx: Effects;
  readonly adapters: Adapters;
  readonly mode: RunMode;
  readonly holder: Holder;
  readonly alive?: Alive;
  readonly clock: () => Date;
  /** Where a blob's bytes live, for the operator to open a dry run's plan. */
  readonly pathOf?: (ref: BlobRef) => string | undefined;
};

export type PublishOutcome =
  | {
      readonly kind: "published";
      readonly slotId: string;
      readonly publication: Publication;
      readonly plan?: { readonly ref: BlobRef; readonly file?: string };
      /** The resume state could not be dropped (the adapter's words); harmless, and said. */
      readonly kept?: string;
    }
  | { readonly kind: "failed"; readonly slotId: string; readonly error: string }
  /** The claim was taken over (the sweep judged it interrupted): its verdict stands, not ours. */
  | { readonly kind: "lost"; readonly slotId: string; readonly error: string };

type Sent = { readonly kind: "dry" } | ({ readonly kind: "live" } & Delivered);


/** Keep claims alive: `conflict` (as a throw) when `current` was lost; a pending claim that was
 *  lost is dropped from the list - the tick will not start it. */
function keeper(store: Store, current: ClaimedSlot, pending: ClaimedSlot[], beat?: () => Promise<void>): () => Promise<void> {
  return async () => {
    const mine = heartbeatClaim(store, current.slot.id, current.fence);
    if (!mine.ok) throw mine.error;
    for (let i = pending.length - 1; i >= 0; i--) {
      const p = pending[i];
      if (p !== undefined && !heartbeatClaim(store, p.slot.id, p.fence).ok) pending.splice(i, 1);
    }
    if (beat !== undefined) await beat();
  };
}

/** Publish one claimed slot. Never throws: every ending is an outcome, and every outcome is on
 *  the slot. `pending` are the claims this tick holds and has not started (kept alive here). */
export async function publishClaimed(deps: PublishDeps, claimed: ClaimedSlot, pending: ClaimedSlot[] = [], beat?: () => Promise<void>): Promise<PublishOutcome> {
  const by = actorOf(deps.holder);
  const slot = claimed.slot;
  const fail = (error: string): PublishOutcome => {
    const r = recordFailure(deps.store, slot.id, claimed.fence, error, by);
    return r.ok ? { kind: "failed", slotId: slot.id, error } : { kind: "lost", slotId: slot.id, error: `${error} (not recorded: ${r.error.message})` };
  };
  const dry = deps.mode.kind !== "live";
  const prior = deps.store.read((r) => priorPublicationIn(r, slot.libraryItemId, slot.channel, dry));
  if (!prior.ok) return fail(prior.error.message);
  if (prior.value !== undefined) return fail(publishedText(slot.libraryItemId, slot.channel, prior.value.id, dry));
  const adapter = adapterFor(deps.adapters, slot.channel);
  if (!adapter.ok) return fail(adapter.error.message);
  const a = adapter.value;
  let delivered: Delivered | undefined;
  let out: PublishOutcome;
  try {
    out = await send(deps, claimed, a, by, fail, (d) => void (delivered = d), keeper(deps.store, claimed, pending, beat));
  } catch (e) {
    const what = delivered === undefined ? "" : ` (${slot.channel} holds it as ${delivered.platformId})`;
    return fail(`${errorMessage(e)}${what}`);
  }
  if (out.kind !== "published" || a.forget === undefined) return out;
  // After the commit and outside the catch: the publication stands whatever the clean-up says.
  const forgot = await a.forget(slot.id);
  return forgot.ok ? out : { ...out, kept: forgot.error.message };
}

async function send(
  deps: PublishDeps,
  claimed: ClaimedSlot,
  adapter: ChannelAdapter,
  by: Actor,
  fail: (error: string) => PublishOutcome,
  sentLive: (d: Delivered) => void,
  progress: () => Promise<void>,
): Promise<PublishOutcome> {
  const slot = claimed.slot;
  const publicationId = `pub-${randomUUID().slice(0, 8)}`;
  const at = deps.clock().toISOString();
  const plan = await adapter.plan(slot, publicationId, at);
  if (!plan.ok) return fail(plan.error.message);

  const port = withDryRun(deps.fx, deps.mode, by);
  const upload = paid<Result<Sent>>(
    { provider: slot.channel, model: "upload", usage: {}, quote: UPLOAD_QUOTE, payload: plan.value.doc, subject: { kind: "slot", id: slot.id }, stand: () => ok({ kind: "dry" }) },
    async () => {
      const r = await adapter.upload(slot, plan.value, { progress });
      return r.ok ? ok({ kind: "live", ...r.value }) : r;
    },
  );
  const sent = await port.effects.call(`${slot.channel}.upload`, upload);
  if (!sent.ok) return fail(sent.error.message);

  let receipt: { ref: BlobRef; file?: string } | undefined;
  let delivered: Delivered | undefined;
  const base = { id: publicationId, publishedAt: at, ...(slot.channel === "blog" ? {} : { visibility: "private" as const }) };
  let draft: PublicationDraft;
  if (sent.value.kind === "dry") {
    const ref = await deps.fx.blob(new TextEncoder().encode(canonical(plan.value.doc)), "application/json");
    if (!ref.ok) return fail(`the dry run's plan could not be kept: ${ref.error.message}`);
    const file = deps.pathOf?.(ref.value);
    receipt = { ref: ref.value, ...(file === undefined ? {} : { file }) };
    draft = { ...base, dry: true, platformId: null };
  } else {
    delivered = { platformId: sent.value.platformId, ...(sent.value.url === undefined ? {} : { url: sent.value.url }) };
    sentLive(delivered);
    draft = { ...base, dry: false, ...delivered };
  }
  const landed = recordPublication(deps.store, slot.id, claimed.fence, draft, by);
  if (!landed.ok) {
    // The upload happened; the claim did not survive it. Say what exists on the platform so the
    // operator can find it - the slot itself already carries the sweep's verdict.
    const what = delivered === undefined ? "" : ` - ${slot.channel} holds it as ${delivered.platformId}`;
    return { kind: "lost", slotId: slot.id, error: `${landed.error.message}${what}` };
  }
  return { kind: "published", slotId: slot.id, publication: landed.value.publication, ...(receipt === undefined ? {} : { plan: receipt }) };
}

/** Fail, in words, the claims a stop left unstarted. */
export function abandonClaimed(deps: PublishDeps, claims: readonly ClaimedSlot[]): PublishOutcome[] {
  const by = actorOf(deps.holder);
  return claims.map((c) => {
    const r = recordFailure(deps.store, c.slot.id, c.fence, STOPPED_TEXT, by);
    return r.ok ? { kind: "failed", slotId: c.slot.id, error: STOPPED_TEXT } : { kind: "lost", slotId: c.slot.id, error: r.error.message };
  });
}
