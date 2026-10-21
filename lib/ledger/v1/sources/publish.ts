import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt, parseJsonAt, type Parsed } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import { listSlots } from "@gt/kernel/slots/read";
import type { Store } from "@gt/kernel/store";

import { outPath } from "../../../../lib/fixtures/roots.ts";
import { storeLocation } from "../../../../lib/kernelStore.ts";
import { bump, facts } from "../facts.ts";
import type { IngestEvent, LiveSlot, ProjectCtx, Projection, Source } from "../types.ts";

// THE CALENDAR, PROJECTED - <publish store>/schedule.json, publications.json
// and metrics.json (v1 lib/publish/store.ts's three files), read as they stand.
//
// PHASE 6 (L63): THE CALENDAR IS THE KERNEL'S. Once the importer has taken v1's
// files in (pipeline/import/slots.mts, MIGRATED beside them) they are frozen
// history, and this adapter keeps projecting them only so the ledger's v1 facts
// stay reconcilable. The LIVE slots - what Runs pins on its calendar row - are
// the kernel's own rows (@gt/kernel/slots), read from the process's open kernel
// (a reader never opens a store: ./articles.ts heldByJobs says why). A process
// with no kernel open (a test over its own files) falls back to v1's unsettled
// slots, as before. Every slot links to its record on the Floor
// (`/floor?cal=1&slot=<id>`), which replaced v1's /calendar. The files are read
// here with fs, not through v1's writer (lib/publish/store.ts, which went at L75
// with the rest of the v1 calendar code).
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

/** v1's files, and - when this process holds the kernel open - the kernel's unsettled slots. */
export type PublishSnapshot = Parsed<z.output<typeof snapshotSchema>> & { readonly kernel?: readonly LiveSlot[] };
type Slot = PublishSnapshot["schedule"]["slots"][number];

const CALENDAR: Actor = { kind: "machine", id: "calendar" };
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const PUBLISHER: Actor = { kind: "machine", id: "publisher" };
/** A slot's own record, over the month (app/(studio)/_shell/links.ts calendarFor's address). */
const hrefOf = (slotId: string): string => `/floor?cal=1&slot=${encodeURIComponent(slotId)}`;
const UNSETTLED: readonly Slot["status"][] = ["scheduled", "publishing", "missed", "failed"];

/** v1's publish root: PUBLISH_STORE_DIR, else <out>/publish (v1 lib/publish/store.ts storeRoot). */
export function publishRoot(): string {
  const env = process.env["PUBLISH_STORE_DIR"]?.trim();
  return env !== undefined && env !== "" ? path.resolve(env) : outPath("publish");
}

const anyObject = z.record(z.string(), z.unknown());
const EMPTY = { "schedule.json": { slots: [] }, "publications.json": { publications: [] }, "metrics.json": { snapshots: [] } } as const;

/** One file as it stands; absent is the empty calendar, unreadable or corrupt is an error (never reset). */
async function readOne(name: keyof typeof EMPTY): Promise<Result<unknown>> {
  const file = path.join(publishRoot(), name);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if (e instanceof Error && "code" in e && e.code === "ENOENT") return ok(EMPTY[name]);
    return err("unavailable", `publish: reading ${file} failed: ${errorMessage(e)}`, { cause: e });
  }
  return parseJsonAt(file, anyObject, text);
}

const UNSETTLED_STATES = ["scheduled", "publishing", "missed", "failed"] as const;

/** The kernel's unsettled slots, when this process holds the kernel open; undefined otherwise. */
export function kernelSlots(store: Store | undefined): Result<LiveSlot[] | undefined> {
  if (store === undefined) return ok(undefined);
  const rows = listSlots(store, { states: [...UNSETTLED_STATES] });
  if (!rows.ok) return rows;
  const parts = [...new Set(rows.value.flatMap((r) => (r.slot.partId === undefined ? [] : [r.slot.partId])))];
  const projects = parts.length === 0 ? ok(new Map<string, string>()) : store.read((r) => new Map(r.all(`SELECT part_id, project_id FROM parts WHERE part_id IN (${parts.map(() => "?").join(", ")})`, ...parts).map((x) => [String(x["part_id"]), String(x["project_id"])] as const)));
  if (!projects.ok) return projects;
  return ok(
    rows.value.map(({ slot: s }) => ({
      source: "publish",
      id: s.id,
      title: s.title,
      channel: s.channel,
      projectId: (s.partId === undefined ? undefined : projects.value.get(s.partId)) ?? "",
      publishAt: s.at,
      status: s.state === "scheduled" || s.state === "publishing" || s.state === "missed" ? s.state : "failed",
      ...(s.error === undefined ? {} : { error: s.error }),
      href: hrefOf(s.id),
    })),
  );
}

function openStore(): Store | undefined {
  const open = globalThis.__gravitoneKernel;
  return open === undefined || open.location !== storeLocation() ? undefined : open.kernel.store;
}

async function read(): Promise<Result<PublishSnapshot>> {
  const [schedule, publications, metrics] = await Promise.all([readOne("schedule.json"), readOne("publications.json"), readOne("metrics.json")]);
  if (!schedule.ok) return schedule;
  if (!publications.ok) return publications;
  if (!metrics.ok) return metrics;
  const files = parseAt("publish store", snapshotSchema, { schedule: schedule.value, publications: publications.value, metrics: metrics.value });
  if (!files.ok) return files;
  const kernel = kernelSlots(openStore());
  if (!kernel.ok) return err(kernel.error.code, `publish: reading the kernel's slots failed: ${kernel.error.message}`, { cause: kernel.error });
  return ok(kernel.value === undefined ? files.value : { ...files.value, kernel: kernel.value });
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
      href: hrefOf(slot.id),
    }));
}

export function projectPublish(s: PublishSnapshot, ctx: ProjectCtx): Projection {
  return { events: eventsOf(s, ctx), live: [], weir: [], slots: s.kernel ?? slotsOf(s), tally: tallyOf(s), skipped: [] };
}

export const publishSource: Source<PublishSnapshot> = { id: "publish", read, project: projectPublish };
