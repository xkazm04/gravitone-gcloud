import "server-only";

import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { err, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";

import { readMetrics, readPublications, readSchedule } from "../../../../lib/publish/store.ts";
import { bump, facts, words } from "../facts.ts";
import type { IngestEvent, LiveSlot, ProjectCtx, Projection, Source } from "../types.ts";

// THE CALENDAR, PROJECTED - <publish store>/schedule.json, publications.json
// and metrics.json (lib/publish/store.ts), read through its unlocked snapshot
// readers `readSchedule`, `readPublications`, `readMetrics`.
//
// NOT through `listSlots`, which the brief names: it SWEEPS first
// (lib/publish/schedule.ts sweep, claim: false) - marking overdue slots
// `missed` and stale `publishing` claims `failed`, and writing schedule.json.
// A projection that read through it would be a v1 writer. The adapter reads
// the file as it stands; v1's own next GET does the sweep.
//
// Event-grade, recorded: slot.create (`createdAt`, written once), publish
// (each publication's `publishedAt`; publications are appended, never
// rewritten), metric.snapshot (each snapshot's `at`, appended by the metrics
// pull). Observed, because v1 rewrites them in place:
//   slot.schedule  `publishAt`, keyed by its value: a reschedule is a NEW fact
//                  observed when the sync sees it, carrying the new planned
//                  time in `data.publishAt` - never back-dated to when the
//                  operator moved it, which v1 did not record;
//   slot.status    `status`, keyed by value and publishAt, so a slot that fails,
//                  is rescheduled and fails again is two facts. `missedAt` is
//                  rewritten too (a claim clears it) and rides in the data.
// No `cost`: publishing spends no metered money in v1.
//
// LIVE: a slot is not a job (types.ts LiveSlot): the unsettled ones -
// scheduled, publishing, missed, failed - go to `slots`, which Runs draws on
// the Calendar row. No live jobs, no Weir piles.

const STATUSES = ["scheduled", "publishing", "published", "failed", "missed", "cancelled"] as const;
const slotSchema = z.object({
  id: z.string().min(1),
  projectId: z.string(),
  exportId: z.string(),
  channelId: z.string(),
  publishAt: z.string(),
  status: z.enum(STATUSES),
  title: z.string(),
  publicationId: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.string(),
  missedAt: z.string().nullable(),
});
const snapshotSchema = z.object({
  schedule: z.object({ slots: z.array(slotSchema) }),
  publications: z.object({
    publications: z.array(z.object({ id: z.string().min(1), slotId: z.string(), channelId: z.string(), platformVideoId: z.string().nullable(), dry: z.boolean(), publishedAt: z.string() })),
  }),
  metrics: z.object({
    snapshots: z.array(
      z.object({
        publicationId: z.string(),
        at: z.string(),
        views: z.number().nullable(),
        watchTimeS: z.number().nullable(),
        avgViewDurationS: z.number().nullable(),
        likes: z.number().nullable(),
        comments: z.number().nullable(),
        shares: z.number().nullable(),
        subsDelta: z.number().nullable(),
      }),
    ),
  }),
});

export type PublishSnapshot = Parsed<z.output<typeof snapshotSchema>>;
type Slot = PublishSnapshot["schedule"]["slots"][number];

const CALENDAR: Actor = { kind: "machine", id: "calendar" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const PUBLISHER: Actor = { kind: "machine", id: "publisher" };
const HREF = "/calendar";
const UNSETTLED: readonly Slot["status"][] = ["scheduled", "publishing", "missed", "failed"];

async function read(): Promise<Result<PublishSnapshot>> {
  let raw: unknown;
  try {
    const [schedule, publications, metrics] = await Promise.all([readSchedule(), readPublications(), readMetrics()]);
    raw = { schedule, publications, metrics };
  } catch (e) {
    return err("unavailable", `publish: reading the store failed: ${words(e)}`, { cause: e });
  }
  return parseAt("publish store", snapshotSchema, raw);
}

function eventsOf(s: PublishSnapshot, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("publish", ctx);
  const out: IngestEvent[] = [];
  const projectOf = new Map<string, string>();
  for (const slot of s.schedule.slots) {
    projectOf.set(slot.id, slot.projectId);
    const subject = { kind: "slot", id: slot.id };
    const data: EventData = { projectId: slot.projectId, channel: slot.channelId, exportId: slot.exportId, title: slot.title };
    out.push(f.recorded(slot.id, "create", slot.createdAt, { actor: OPERATOR, type: "slot.create", subject, data }));
    out.push(f.observed(slot.id, `at.${slot.publishAt}`, { actor: OPERATOR, type: "slot.schedule", subject, data: { ...data, publishAt: slot.publishAt } }));
    const status: EventData = { ...data, status: slot.status, publishAt: slot.publishAt, ...(slot.error === null ? {} : { error: slot.error }), ...(slot.missedAt === null ? {} : { missedAt: slot.missedAt }) };
    out.push(f.observed(slot.id, `status.${slot.status}.${slot.publishAt}`, { actor: CALENDAR, type: "slot.status", subject, data: status }));
  }
  for (const p of s.publications.publications) {
    const projectId = projectOf.get(p.slotId);
    const data: EventData = { slotId: p.slotId, channel: p.channelId, dry: p.dry, platformVideoId: p.platformVideoId, ...(projectId === undefined ? {} : { projectId }) };
    out.push(f.recorded(p.id, "publish", p.publishedAt, { actor: PUBLISHER, type: "publish", subject: { kind: "publication", id: p.id }, data }));
  }
  const seen = new Map<string, number>();
  for (const m of s.metrics.snapshots) {
    const id = `${m.publicationId}@${m.at}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    const { publicationId, at, ...numbers } = m;
    out.push(f.recorded(publicationId, `metric.${at}.${n}`, at, { actor: PUBLISHER, type: "metric.snapshot", subject: { kind: "publication", id: publicationId }, data: numbers }));
  }
  return out;
}

function tallyOf(s: PublishSnapshot): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const slot of s.schedule.slots) bump(records, `slot.${slot.status}`);
  bump(records, "publication", s.publications.publications.length);
  bump(records, "metric", s.metrics.snapshots.length);
  bump(fs, "slot.create", s.schedule.slots.length);
  bump(fs, "slot.schedule", s.schedule.slots.length);
  bump(fs, "slot.status", s.schedule.slots.length);
  bump(fs, "publish", s.publications.publications.length);
  bump(fs, "metric.snapshot", s.metrics.snapshots.length);
  return { records, facts: fs };
}

/** The Calendar's unsettled slots, earliest first, as listSlots orders them. */
function slotsOf(s: PublishSnapshot): LiveSlot[] {
  return s.schedule.slots
    .filter((slot) => UNSETTLED.includes(slot.status))
    .sort((a, b) => a.publishAt.localeCompare(b.publishAt))
    .map((slot) => ({
      source: "publish",
      id: slot.id,
      title: slot.title,
      channel: slot.channelId,
      projectId: slot.projectId,
      publishAt: slot.publishAt,
      // The filter above holds exactly these four; the cast-free narrowing is the guard below.
      status: slot.status === "scheduled" || slot.status === "publishing" || slot.status === "missed" ? slot.status : "failed",
      ...(slot.error === null ? {} : { error: slot.error }),
      href: HREF,
    }));
}

export function projectPublish(s: PublishSnapshot, ctx: ProjectCtx): Projection {
  return { events: eventsOf(s, ctx), live: [], weir: [], slots: slotsOf(s), tally: tallyOf(s), skipped: [] };
}

export const publishSource: Source<PublishSnapshot> = { id: "publish", read, project: projectPublish };
