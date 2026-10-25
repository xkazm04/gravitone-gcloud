import { randomUUID } from "node:crypto";
import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { metricSnapshotSchema, publicationSchema, type MetricSnapshot, type Publication } from "@gt/domain/publication";
import type { Lease } from "@gt/domain/job";
import { append } from "../events.ts";
import { assertFence, heartbeatIn, processHolder, releaseIn } from "../lease.ts";
import type { Store, Tx } from "../store.ts";
import { publishedText, toFailed, toPublished, toPublishing } from "./core.ts";
import { instantOf, priorPublicationIn, publicationOfIn, readPublicationIn, readSlotIn } from "./read.ts";
import { claimResource, type SlotRow } from "./schema.ts";
import { ACT_CHANNELS } from "./sweep-core.ts";
import { putSlotIn } from "./write.ts";

// WHAT A CLAIM ENDS IN - published or failed - written by the claimant, FENCED. The publisher
// (wave B's producer, v1 lib/publish/publisher.ts runClaimed) presents the fence the sweep
// handed it; `assertFence` reads the lease row inside this same write transaction, so a claimant
// the sweep has since declared interrupted (its lease taken over) is refused at its own write
// and the sweep's verdict stands (delivery-guarantees: atomic-claiming, "complete with the same
// conditionality"). The lease is released in the same commit as the verdict.
//
// ONE PUBLICATION PER SLOT is the table's UNIQUE (slot_id); ONE PER ITEM x CHANNEL x MODE is v1's
// rule (publisher.ts: "a dry run does not block the live upload that follows it"), checked here
// in words and backed by `slots_one_publication`. A dry-published slot holds nothing (./core.ts
// clashOf), so the live slot that follows a rehearsal can be made at all; a second rehearsal of
// the same item is refused at its landing, and the publisher asks first (priorPublicationIn) so
// it says so before it plans.

function claimedIn(t: Tx, slotId: string, fence: number): SlotRow {
  const row = readSlotIn(t, slotId);
  if (row === undefined) throw new AppError("not-found", `no slot ${slotId}`);
  assertFence(t, claimResource(slotId), fence);
  if (row.slot.state !== "publishing" || row.fence !== fence) throw new AppError("conflict", `slot ${slotId} is ${row.slot.state}; fence ${fence} does not hold its claim`);
  return row;
}

export type PublicationDraft = Omit<Publication, "slotId" | "channel" | "id"> & { readonly id?: string };

function admitPublication(row: SlotRow, draft: PublicationDraft): Publication {
  const p = parseAt("publication", publicationSchema, { ...draft, id: draft.id ?? `pub-${randomUUID().slice(0, 8)}`, slotId: row.slot.id, channel: row.slot.channel });
  if (!p.ok) throw p.error;
  return { ...p.value, publishedAt: instantOf(p.value.publishedAt) };
}

/** The slot, marked dry when its publication is (./schema.ts steps 2-4), and its publication. */
function landIn(t: Tx, row: SlotRow, pub: Publication, by: Actor): SlotRow {
  if (publicationOfIn(t, row.slot.id) !== undefined) throw new AppError("conflict", `slot ${row.slot.id} already has a publication`);
  const prior = priorPublicationIn(t, row.slot.libraryItemId, row.slot.channel, pub.dry);
  if (prior !== undefined) throw new AppError("conflict", publishedText(row.slot.libraryItemId, row.slot.channel, prior.id, pub.dry));
  const slot = putSlotIn(t, row, toPublished(row.slot, pub.id), null, {
    by,
    type: "publish",
    subject: { kind: "publication", id: pub.id },
    data: { dry: pub.dry, platformId: pub.platformId, ...(pub.url === undefined ? {} : { url: pub.url }) },
  }, pub.dry);
  t.run("INSERT INTO publications (id, slot_id, record, published_at) VALUES (?, ?, ?, ?)", pub.id, pub.slotId, JSON.stringify(pub), pub.publishedAt);
  return slot;
}

/** The claimant's success: the publication and `published`, in one commit, lease released. */
export function recordPublication(store: Store, slotId: string, fence: number, draft: PublicationDraft, by: Actor): Result<{ slot: SlotRow; publication: Publication }> {
  return store.tx((t) => {
    const row = claimedIn(t, slotId, fence);
    const pub = admitPublication(row, draft);
    const slot = landIn(t, row, pub, by);
    releaseIn(t, claimResource(slotId), fence);
    return { slot, publication: pub };
  });
}

/** The claimant's failure: the channel's sentence verbatim, lease released. */
export function recordFailure(store: Store, slotId: string, fence: number, error: string, by: Actor): Result<SlotRow> {
  return store.tx((t) => {
    const row = claimedIn(t, slotId, fence);
    const slot = putSlotIn(t, row, toFailed(row.slot, error), null, { by, type: "slot.fail", data: { error } });
    releaseIn(t, claimResource(slotId), fence);
    return slot;
  });
}

/** Keep a claim alive through a long upload; `conflict` once it was lost. */
export function heartbeatClaim(store: Store, slotId: string, fence: number): Result<Lease> {
  return store.tx((t) => heartbeatIn(t, claimResource(slotId), fence));
}

/**
 * A publication that is an ACT, not an upload (owner ruling 4: a blog slot goes out by its
 * article's approve, which opens the pull request). Claim and land in one transaction - no
 * window in which a second act could also claim it, so no lease is needed to hold one.
 */
export function publishByAct(store: Store, slotId: string, draft: PublicationDraft, by: Actor): Result<{ slot: SlotRow; publication: Publication }> {
  return store.tx((t) => {
    const row = readSlotIn(t, slotId);
    if (row === undefined) throw new AppError("not-found", `no slot ${slotId}`);
    if (!ACT_CHANNELS.has(row.slot.channel)) throw new AppError("refused", `a ${row.slot.channel} slot goes out by upload under a claim, not by an act`);
    if (row.slot.state !== "scheduled") throw new AppError("conflict", `a ${row.slot.state} slot cannot be published`);
    if (row.slot.drift !== undefined) throw new AppError("refused", `slot ${slotId} cannot go out: ${row.slot.drift}`, { detail: row.slot.drift });
    // The acting process holds the claim for the instant between the two halves of one commit.
    const claimed = { ...row, slot: toPublishing(row.slot, processHolder(), t.at) };
    const pub = admitPublication(claimed, draft);
    return { slot: landIn(t, claimed, pub, by), publication: pub };
  });
}

/** One lifetime reading. A dry publication has none to take (v1 refreshMetrics: live only). */
export function recordMetric(store: Store, snapshot: MetricSnapshot, by: Actor): Result<MetricSnapshot> {
  const s = parseAt("metric snapshot", metricSnapshotSchema, snapshot);
  if (!s.ok) return s;
  // Ordered as TEXT (snapshotsIn): held in the instant's one shape, as the v1 import writes it.
  const snap = { ...s.value, at: instantOf(s.value.at) };
  return store.tx((t) => {
    const pub = readPublicationIn(t, snap.publicationId);
    if (pub === undefined) throw new AppError("not-found", `no publication ${snap.publicationId}`);
    if (pub.dry) throw new AppError("refused", `publication ${pub.id} was a dry run; it has no numbers to read`);
    t.run("INSERT INTO metric_snapshots (publication_id, at, record) VALUES (?, ?, ?)", snap.publicationId, snap.at, JSON.stringify(snap));
    const { publicationId: _p, at: _a, ...numbers } = snap;
    // v1's kind and subject (lib/ledger/v1/sources/publish.ts), so the ledger reads one history.
    append(t, { actor: by, type: "metric.snapshot", subject: { kind: "publication", id: pub.id }, data: { ...numbers, slotId: pub.slotId, readAt: snap.at } });
    return snap;
  });
}
