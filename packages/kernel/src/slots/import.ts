import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { METRIC_KEYS, metricSnapshotSchema, publicationSchema, type MetricSnapshot, type Publication } from "@gt/domain/publication";
import { INTERRUPTED_TEXT, slotItemId, slotSchema, type Slot, type SlotDrift } from "@gt/domain/slot";
import { SLOT_HOLDS } from "@gt/domain/slot.machine";
import { append } from "../events.ts";
import type { Reader, Store, Tx } from "../store.ts";
import { clashOf, clashText, publishedText, toCancelled, type Holding } from "./core.ts";
import { listSlotsIn, priorPublicationIn, publicationOfIn, readPublicationIn, readSlotIn, snapshotsIn } from "./read.ts";
import { putSlotIn } from "./write.ts";

// THE ONE-TIME IMPORT of v1's calendar (owner ruling 3; plan §5.3) - schedule.json,
// publications.json and metrics.json, as lib/publish/store.ts wrote them, into the slot tables.
// The file reading and the MIGRATED marker are lib/publish/import.ts; this is the part that
// decides, run once in a read snapshot for a dry run and once inside the write for a real one,
// so the dry report and the write cannot disagree.
//
// WHAT CHANGES SHAPE, and why each is honest:
//   exportId -> libraryItemId   `video:export:<exportId>`, the id the Library feeds the export by.
//   error on a waiting slot     v1 wrote drift as a sentence in `error` (DRIFT_TEXT); it becomes the
//                               `drift` field. Any other sentence on a waiting slot was a cleared
//                               failure v1 forgot to clear - dropped, and counted.
//   publishing                  v1's claim was {pid, at} in a claim file; no lease can be minted for
//                               a process of the old world, so the slot lands `failed` with v1's
//                               INTERRUPTED_TEXT - exactly what v1's own next sweep would have
//                               concluded once that process was gone - and is reported as such.
//   drift on a cancelled slot   v1 cancelSlot kept `error` as it stood, so a slot cancelled while
//                               drifted carries the drift sentence; it never becomes `error` (drift
//                               is a field, and only a waiting slot's) - it rides the import event.
//   several holders             v1 let more than one active slot hold an export on a channel; the
//                               store does not. Never refused for it (the L63 ruling): the earliest
//                               holds - a live publication before any waiting slot, because it went
//                               out - and the rest land `cancelled`, the holder and the reason on
//                               their import event, never in `error`. A slot published DRY holds
//                               nothing (the L62 ruling), so it is no one's rival.
//   projectId                   not a slot field in the new record; kept on the import event.
// HISTORY IS NOT RE-EMITTED. v1's calendar facts are already in the ledger through the Phase 2
// projection (lib/ledger/v1/sources/publish.ts: slot.create, slot.schedule, slot.status, publish,
// metric.snapshot); the import writes one `slot.import` / `publication.import` / `metric.import`
// event per row it creates - the act of importing, not a second copy of the past.
// IDEMPOTENT: a slot or publication already in the store (by its v1 id) is skipped, and a
// reading already held (same publication, instant and numbers) is not inserted again.

const V1_DRIFT_TEXT: Readonly<Record<string, SlotDrift>> = {
  "the export this slot publishes no longer exists": "export_missing",
  "this channel is not wired": "channel_not_wired",
};

const v1Slot = z.object({
  id: z.string().min(1),
  projectId: z.string(),
  exportId: z.string().min(1),
  channelId: z.string(),
  publishAt: z.string(),
  status: z.enum(["scheduled", "publishing", "published", "failed", "missed", "cancelled"]),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  publicationId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  missedAt: z.string().nullable(),
});
const v1Publication = z.object({
  id: z.string().min(1),
  slotId: z.string().min(1),
  channelId: z.string(),
  platformVideoId: z.string().nullable(),
  visibility: z.literal("private"),
  dry: z.boolean(),
  publishedAt: z.string(),
});
const n = z.number().nullable();
const v1Snapshot = z.object({ publicationId: z.string().min(1), at: z.string(), views: n, watchTimeS: n, avgViewDurationS: n, likes: n, comments: n, shares: n, subsDelta: n });

/** The three files, as one value (a missing file is its empty shape, as v1's store read it). */
export const v1CalendarSchema = z.object({
  schedule: z.object({ slots: z.array(v1Slot) }),
  publications: z.object({ publications: z.array(v1Publication) }),
  metrics: z.object({ snapshots: z.array(v1Snapshot) }),
});
export type V1Calendar = z.output<typeof v1CalendarSchema>;

export type ImportOutcome = {
  readonly kind: "slot" | "publication" | "metrics";
  readonly id: string;
  readonly outcome: "imported" | "would-import" | "skipped" | "refused";
  readonly reason?: string;
};

export const IMPORT_SLOTS_ACTOR: Actor = { kind: "machine", id: "v1-import" };

const iso = (s: string): string | undefined => {
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

type V1Slot = z.output<typeof v1Slot>;
type V1Publication = z.output<typeof v1Publication>;

/** v1's three record shapes as its files held them, for what still WRITES a v1 calendar (the
 *  fixture writer, pipeline/fixtures/publish.ts) once lib/publish/types.ts is gone. */
export type V1SlotRecord = z.input<typeof v1Slot>;
export type V1SlotStatus = V1SlotRecord["status"];
export type V1PublicationRecord = z.input<typeof v1Publication>;
export type V1SnapshotRecord = z.input<typeof v1Snapshot>;

/** A v1 slot as the new record, or the reason it cannot be one. `note` names a lossy step;
 *  `v1Drift` is a drift sentence v1 left in `error` that the record does not carry. */
export function slotFromV1(s: V1Slot): { slot: Slot; note?: string; v1Drift?: SlotDrift } | { refused: string } {
  const at = iso(s.publishAt);
  if (at === undefined) return { refused: `publishAt is not a date: ${s.publishAt}` };
  const waiting = s.status === "scheduled" || s.status === "missed";
  // v1 cancelSlot kept whatever `error` held, so a slot cancelled while drifted carries the drift
  // sentence; a drift is a field (and only of a waiting slot), never an `error` (the L63 ruling).
  const v1Drift = s.error === null ? undefined : V1_DRIFT_TEXT[s.error];
  const drift = waiting ? v1Drift : undefined;
  let note: string | undefined;
  const state = s.status === "publishing" ? "failed" : s.status;
  const kept = s.error === null || v1Drift !== undefined ? undefined : s.error;
  const error = s.status === "publishing" ? INTERRUPTED_TEXT : state === "failed" || state === "cancelled" ? kept : undefined;
  if (s.status === "publishing") note = "claimed by a v1 process; imported as interrupted";
  else if (waiting && s.error !== null && drift === undefined) note = `a stale reason on a ${s.status} slot was dropped: ${s.error}`;
  else if (!waiting && v1Drift !== undefined) note = `the drift it was ${s.status} under (${v1Drift}) is on the import event, not the record`;
  const missedAt = s.status === "missed" ? (iso(s.missedAt ?? "") ?? at) : undefined;
  const draft = {
    id: s.id,
    libraryItemId: slotItemId.export(s.exportId),
    channel: s.channelId,
    at,
    state,
    title: s.title,
    description: s.description,
    tags: s.tags,
    ...(drift === undefined ? {} : { drift }),
    ...(missedAt === undefined ? {} : { missedAt }),
    ...(s.status === "published" && s.publicationId !== null ? { publicationId: s.publicationId } : {}),
    ...(error === undefined ? {} : { error }),
  };
  const p = parseAt(`v1 slot ${s.id}`, slotSchema, draft);
  if (!p.ok) return { refused: p.error.message };
  return { slot: p.value, ...(note === undefined ? {} : { note }), ...(!waiting && v1Drift !== undefined ? { v1Drift } : {}) };
}

function publicationFromV1(p: V1Publication): Result<Publication> {
  const { platformVideoId, channelId, publishedAt, ...rest } = p;
  return parseAt(`v1 publication ${p.id}`, publicationSchema, { ...rest, channel: channelId, platformId: platformVideoId, publishedAt: iso(publishedAt) ?? publishedAt });
}

const sameReading = (a: MetricSnapshot, b: MetricSnapshot): boolean => a.publicationId === b.publicationId && a.at === b.at && METRIC_KEYS.every((k) => a[k] === b[k]);

type Mapped = { readonly v1: V1Slot; readonly slot: Slot; readonly note?: string; readonly v1Drift?: SlotDrift; readonly dry: boolean };

/**
 * The order the slots are written in, which IS the one-holder rule's tie-break (the L63 ruling:
 * v1 allowed several active slots per export x channel, and the import must not refuse them).
 * Published slots first - a publication is a fact, and a dry one must be marked before a waiting
 * slot for the same item lands - then by time, so the EARLIEST waiting slot is the one that holds
 * and the later ones are imported `cancelled`, the reason on their import event.
 */
const writeOrder = (a: Mapped, b: Mapped): number =>
  Number(b.slot.state === "published") - Number(a.slot.state === "published") || a.slot.at.localeCompare(b.slot.at) || a.slot.id.localeCompare(b.slot.id);

/** Decide, and when `t` is a write transaction, write. A read snapshot decides for a dry run. */
function run(r: Reader, t: Tx | null, v1: V1Calendar): ImportOutcome[] {
  const out: ImportOutcome[] = [];
  const done = t === null ? "would-import" : "imported";
  const imported = new Map<string, Slot>();
  const holding: Holding[] = listSlotsIn(r, { states: ["scheduled", "publishing", "published"] });
  const projectOf = new Map(v1.schedule.slots.map((s) => [s.id, s.projectId]));
  const pubsOf = new Map<string, V1Publication[]>();
  for (const p of v1.publications.publications) pubsOf.set(p.slotId, [...(pubsOf.get(p.slotId) ?? []), p]);
  const pubs = new Set<string>();
  const madeInMode = new Map<string, string>();
  const handled = new Set<string>();

  const importPublication = (p: V1Publication): void => {
    handled.add(p.id);
    if (readPublicationIn(r, p.id) !== undefined) {
      pubs.add(p.id);
      out.push({ kind: "publication", id: p.id, outcome: "skipped", reason: "already in the store" });
      return;
    }
    const slot = imported.get(p.slotId) ?? readSlotIn(r, p.slotId)?.slot;
    const pub = publicationFromV1(p);
    const key = slot === undefined ? "" : JSON.stringify([slot.libraryItemId, slot.channel, p.dry]);
    // This run's own first (so a dry run and the write it rehearses name the same publication), then the store's.
    const prior = slot === undefined ? undefined : (madeInMode.get(key) ?? priorPublicationIn(r, slot.libraryItemId, slot.channel, p.dry)?.id);
    const reason =
      slot === undefined
        ? `its slot ${p.slotId} is not in the store`
        : !pub.ok
          ? pub.error.message
          : publicationOfIn(r, p.slotId) !== undefined
            ? `slot ${p.slotId} already has a publication`
            : prior !== undefined
              ? publishedText(slot.libraryItemId, slot.channel, prior, p.dry)
              : undefined;
    if (reason !== undefined || !pub.ok) {
      out.push({ kind: "publication", id: p.id, outcome: "refused", reason: reason ?? "unreadable" });
      return;
    }
    if (t !== null) {
      t.run("INSERT INTO publications (id, slot_id, record, published_at) VALUES (?, ?, ?, ?)", pub.value.id, pub.value.slotId, JSON.stringify(pub.value), pub.value.publishedAt);
      const projectId = projectOf.get(p.slotId);
      append(t, { actor: IMPORT_SLOTS_ACTOR, type: "publication.import", subject: { kind: "publication", id: p.id }, data: { slotId: p.slotId, dry: p.dry, ...(projectId === undefined ? {} : { projectId }) } });
    }
    pubs.add(p.id);
    madeInMode.set(key, p.id);
    out.push({ kind: "publication", id: p.id, outcome: done });
  };

  const mapped: Mapped[] = [];
  for (const s of v1.schedule.slots) {
    if (readSlotIn(r, s.id) !== undefined) {
      out.push({ kind: "slot", id: s.id, outcome: "skipped", reason: "already in the store" });
      continue;
    }
    const m = slotFromV1(s);
    if ("refused" in m) out.push({ kind: "slot", id: s.id, outcome: "refused", reason: m.refused });
    else mapped.push({ v1: s, ...m, dry: m.slot.state === "published" && pubsOf.get(s.id)?.find((p) => p.id === s.publicationId)?.dry === true });
  }
  for (const m of mapped.sort(writeOrder)) {
    let slot = m.slot;
    const clash = m.dry ? undefined : clashOf(holding, slot.libraryItemId, slot.channel, slot.id);
    if (clash !== undefined && slot.state === "published") {
      // Two live publications of one item on one channel: v1's publisher refused the second, so
      // this calendar was edited by hand. Not a one-holder question; said, and left out.
      out.push({ kind: "slot", id: slot.id, outcome: "refused", reason: `a second live publication: ${clashText(slot.libraryItemId, slot.channel, clash)}` });
      continue;
    }
    let cancelled: string | undefined;
    if (clash !== undefined && SLOT_HOLDS.includes(slot.state)) {
      cancelled = `cancelled on import: ${clashText(slot.libraryItemId, slot.channel, clash)}`;
      slot = toCancelled(slot);
    }
    const data = {
      v1State: m.v1.status,
      projectId: m.v1.projectId,
      createdAt: m.v1.createdAt,
      // A typed token beside the sentence (delivery-guarantees: non-delivery-ledgers), so "how
      // many slots did the import set aside, and for what" is a query, not string forensics.
      ...(cancelled === undefined || clash === undefined ? {} : { cancelledFor: "one-holder", heldBy: clash.id, reason: cancelled }),
      ...(m.v1Drift === undefined ? {} : { v1Drift: m.v1Drift }),
    };
    if (t !== null) putSlotIn(t, null, slot, null, { by: IMPORT_SLOTS_ACTOR, type: "slot.import", data }, m.dry);
    imported.set(slot.id, slot);
    out.push({ kind: "slot", id: slot.id, outcome: done, ...(cancelled !== undefined ? { reason: cancelled } : m.note === undefined ? {} : { reason: m.note }) });
    for (const p of pubsOf.get(slot.id) ?? []) importPublication(p);
    if (SLOT_HOLDS.includes(slot.state)) holding.push(m.dry ? { slot, dry: true } : { slot });
  }
  for (const p of v1.publications.publications) if (!handled.has(p.id)) importPublication(p);
  const byPub = new Map<string, { readings: MetricSnapshot[]; unreadable: string[] }>();
  for (const m of v1.metrics.snapshots) {
    const g = byPub.get(m.publicationId) ?? { readings: [], unreadable: [] };
    const p = parseAt(`v1 reading ${m.publicationId}@${m.at}`, metricSnapshotSchema, { ...m, at: iso(m.at) ?? m.at });
    if (p.ok) g.readings.push(p.value);
    else g.unreadable.push(p.error.message);
    byPub.set(m.publicationId, g);
  }
  for (const [pubId, { readings, unreadable }] of byPub) {
    if (!pubs.has(pubId)) {
      out.push({ kind: "metrics", id: pubId, outcome: "refused", reason: `${readings.length + unreadable.length} reading(s) for a publication that is not in the store` });
      continue;
    }
    if (unreadable.length > 0) out.push({ kind: "metrics", id: pubId, outcome: "refused", reason: `${unreadable.length} unreadable reading(s): ${unreadable[0] ?? ""}` });
    const held = snapshotsIn(r, pubId);
    const fresh = readings.filter((s) => !held.some((h) => sameReading(h, s)));
    if (fresh.length === 0) {
      out.push({ kind: "metrics", id: pubId, outcome: "skipped", reason: "every reading already in the store" });
      continue;
    }
    if (t !== null) {
      for (const s of fresh) t.run("INSERT INTO metric_snapshots (publication_id, at, record) VALUES (?, ?, ?)", s.publicationId, s.at, JSON.stringify(s));
      append(t, { actor: IMPORT_SLOTS_ACTOR, type: "metric.import", subject: { kind: "publication", id: pubId }, data: { readings: fresh.length } });
    }
    out.push({ kind: "metrics", id: pubId, outcome: done, reason: `${fresh.length} reading(s)` });
  }
  return out;
}

/** Import v1's calendar. `dry` decides in a read snapshot and writes nothing. */
export function importV1Calendar(store: Store, raw: unknown, opts: { readonly dry: boolean }): Result<ImportOutcome[]> {
  const v1 = parseAt("v1 calendar", v1CalendarSchema, raw);
  if (!v1.ok) return v1;
  if (opts.dry) return store.read((r) => run(r, null, v1.value));
  return store.tx((t) => run(t, t, v1.value));
}
