// THE CALENDAR'S STATE MACHINE — slots, their transitions, the missed window
// and the at-most-once claim. Server-only.
//
// PORTED FROM StatReel apps/server/src/calendar.ts (ADR 006). The transitions:
//
//   scheduled  -> publishing (a tick or publish-now CLAIMS it)
//              |  missed     (overdue past the window — never published late)
//              |  cancelled
//              |  scheduled  (reschedule)
//   publishing -> published | failed           (follows the publish)
//   missed     -> scheduled (reschedule) | cancelled
//   failed     -> scheduled (reschedule) | cancelled      ← NOT in StatReel
//
// The last line is a deliberate addition. In StatReel a failed slot was
// terminal because the publish job could be retried on its own; here there is
// no job queue, so a failed upload (a 5xx storm, an expired refresh token)
// would otherwise need a brand-new slot — and the persisted resumable session
// (sessions/<slotId>.json) is keyed by slot, so retrying the SAME slot is what
// lets a live retry resume instead of creating a second private video.
//
// MISSED-RUN POLICY (calendar.ts header, verbatim in spirit): a slot overdue
// by more than PUBLISH_MISSED_MIN (default 60) is NOT published late — a stale
// upload after downtime is worse than none. It becomes `missed` with
// `missedAt` and waits for the owner to reschedule or cancel it.
//
// DRIFT. StatReel's drift was "the render was superseded / the gate flipped".
// Gravitone has no render gate; the two ways a scheduled slot can become
// unfireable here are that its export file is gone, or its channel stopped
// being wired. A drifted slot is never fired; it stays `scheduled` with the
// reason in `error` (ScheduleSlot has no drift field — the contract is fixed)
// and the reason clears itself when the cause does.
//
// AT-MOST-ONCE. A slot is claimed (scheduled -> publishing, plus a claim
// record naming this process) under the store lock BEFORE anything is
// uploaded, so two ticks — two processes, even — can never both publish it.
// The price, as in StatReel: a process that dies mid-publish leaves the slot
// `publishing`. The next sweep sees a claim whose process is gone and marks the
// slot `failed` ("interrupted"), visibly, instead of publishing it again.

import { randomUUID } from "node:crypto";

import { channelReadiness, isChannelId, missedWindowMs } from "./channels";
import { listExports } from "./exports";
import { withStore, type ScheduleFile } from "./store";
import type { ChannelId, ScheduleSlot, SlotStatus } from "./types";
import { snippetProblem } from "./youtube";

/** An error that already knows its HTTP status (the routes) and exit code (the CLI). */
export class PublishError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 500 = 409) {
    super(message);
    this.name = "PublishError";
  }
}

const ACTIVE: readonly SlotStatus[] = ["scheduled", "publishing", "published"];
const RESCHEDULABLE: readonly SlotStatus[] = ["scheduled", "missed", "failed"];
const CANCELLABLE: readonly SlotStatus[] = ["scheduled", "missed", "failed"];
/** A claim this old is stale even if its pid is alive — pids are reused. */
const CLAIM_MAX_MS = 6 * 60 * 60_000;

export type SlotDrift = "export_missing" | "channel_not_wired";
export const DRIFT_TEXT: Record<SlotDrift, string> = {
  export_missing: "the export this slot publishes no longer exists",
  channel_not_wired: "this channel is not wired",
};
const DRIFT_TEXTS = new Set(Object.values(DRIFT_TEXT));
export const INTERRUPTED_TEXT = "interrupted before the publish finished";

const iso = (at: string | number | Date) => new Date(at).toISOString();

export interface ScheduleInput {
  projectId: string;
  exportId: string;
  channelId: ChannelId;
  publishAt: string;
  title: string;
  description: string;
  tags: string[];
}

/** Body validation for `POST /api/publish/schedule` and `publish.mts schedule`. */
export function parseScheduleInput(body: unknown): ScheduleInput {
  if (!body || typeof body !== "object") throw new PublishError("body must be a JSON object", 400);
  const b = body as Record<string, unknown>;
  const str = (k: string, required = true): string => {
    const v = b[k];
    if (v === undefined || v === null) {
      if (required) throw new PublishError(`${k} is required`, 400);
      return "";
    }
    if (typeof v !== "string") throw new PublishError(`${k} must be a string`, 400);
    return v;
  };
  const projectId = str("projectId").trim();
  if (!projectId) throw new PublishError("projectId is required", 400);
  const exportId = str("exportId").trim();
  if (!exportId) throw new PublishError("exportId is required", 400);
  if (!isChannelId(b.channelId)) throw new PublishError(`channelId must be one of youtube, tiktok, instagram`, 400);
  const publishAt = str("publishAt");
  if (Number.isNaN(Date.parse(publishAt))) throw new PublishError(`publishAt is not a date: ${publishAt}`, 400);
  const title = str("title").trim();
  const description = str("description", false);
  const rawTags = b.tags ?? [];
  if (!Array.isArray(rawTags) || rawTags.some((t) => typeof t !== "string")) throw new PublishError("tags must be an array of strings", 400);
  const tags = (rawTags as string[]).map((t) => t.trim()).filter(Boolean);
  // the platform's own limits, checked when the slot is made rather than when it fires at 3 a.m.
  const problem = snippetProblem({ title, description, tags });
  if (problem) throw new PublishError(problem, 400);
  return { projectId, exportId, channelId: b.channelId, publishAt: iso(publishAt), title, description, tags };
}

function findSlot(file: ScheduleFile, id: string): ScheduleSlot {
  const s = file.slots.find((x) => x.id === id);
  if (!s) throw new PublishError(`no slot ${id}`, 404);
  return s;
}

/** A different slot already holding this export on this channel. */
function clashOf(file: ScheduleFile, exportId: string, channelId: ChannelId, exceptId?: string): ScheduleSlot | undefined {
  return file.slots.find((s) => s.id !== exceptId && s.exportId === exportId && s.channelId === channelId && ACTIVE.includes(s.status));
}

export async function createSlot(input: ScheduleInput, now: Date = new Date()): Promise<ScheduleSlot> {
  const channel = channelReadiness().channels.find((c) => c.id === input.channelId)!;
  if (channel.status === "not_wired") throw new PublishError(`${channel.name} is not wired (${channel.note ?? "no adapter"})`, 409);
  const exports = await listExports();
  if (!exports.some((e) => e.id === input.exportId)) throw new PublishError(`unknown export ${input.exportId}`, 409);
  return withStore(async (tx) => {
    const file = await tx.get("schedule");
    const clash = clashOf(file, input.exportId, input.channelId);
    if (clash) throw new PublishError(`export ${input.exportId} is already on ${input.channelId} (slot ${clash.id}, ${clash.status} for ${clash.publishAt})`, 409);
    const slot: ScheduleSlot = {
      id: `sl-${randomUUID().slice(0, 8)}`,
      projectId: input.projectId,
      exportId: input.exportId,
      channelId: input.channelId,
      publishAt: input.publishAt,
      status: "scheduled",
      title: input.title,
      description: input.description,
      tags: input.tags,
      publicationId: null,
      error: null,
      createdAt: iso(now),
      missedAt: null,
    };
    file.slots.push(slot);
    tx.touch("schedule");
    return slot;
  });
}

export interface SlotPatch {
  publishAt?: string;
  status?: "scheduled" | "cancelled";
}

export function parseSlotPatch(body: unknown): SlotPatch {
  if (!body || typeof body !== "object") throw new PublishError("body must be a JSON object", 400);
  const b = body as Record<string, unknown>;
  const out: SlotPatch = {};
  if (b.publishAt !== undefined) {
    if (typeof b.publishAt !== "string" || Number.isNaN(Date.parse(b.publishAt))) throw new PublishError(`publishAt is not a date: ${String(b.publishAt)}`, 400);
    out.publishAt = iso(b.publishAt);
  }
  if (b.status !== undefined) {
    if (b.status !== "scheduled" && b.status !== "cancelled") throw new PublishError(`status may only be "scheduled" or "cancelled"`, 400);
    out.status = b.status;
  }
  if (out.publishAt === undefined && out.status === undefined) throw new PublishError("nothing to change: give publishAt and/or status", 400);
  if (out.status === "cancelled" && out.publishAt !== undefined) throw new PublishError("a cancel does not take a publishAt", 400);
  return out;
}

/** Reschedule (publishAt and/or status "scheduled") or cancel (status "cancelled"). */
export async function updateSlot(id: string, patch: SlotPatch, now: Date = new Date()): Promise<ScheduleSlot> {
  if (patch.status === "cancelled") return cancelSlot(id);
  return withStore(async (tx) => {
    const file = await tx.get("schedule");
    const s = findSlot(file, id);
    if (!RESCHEDULABLE.includes(s.status)) throw new PublishError(`a ${s.status} slot cannot be rescheduled`, 409);
    const publishAt = patch.publishAt ?? s.publishAt;
    // rescheduling INTO the missed window would be marked missed by the very next sweep
    if (now.getTime() - Date.parse(publishAt) > missedWindowMs()) {
      throw new PublishError(`publishAt ${publishAt} is already past the missed window; give a new publishAt`, 409);
    }
    const clash = clashOf(file, s.exportId, s.channelId, s.id);
    if (clash) throw new PublishError(`export ${s.exportId} is already on ${s.channelId} (slot ${clash.id}, ${clash.status})`, 409);
    Object.assign(s, { publishAt, status: "scheduled", error: null, missedAt: null } satisfies Partial<ScheduleSlot>);
    tx.touch("schedule");
    return { ...s };
  });
}

/** Never a hard delete: the slot stays, `cancelled`, so the history reads true. */
export async function cancelSlot(id: string): Promise<ScheduleSlot> {
  return withStore(async (tx) => {
    const file = await tx.get("schedule");
    const s = findSlot(file, id);
    if (s.status === "cancelled") return { ...s };
    if (!CANCELLABLE.includes(s.status)) throw new PublishError(`a ${s.status} slot cannot be cancelled`, 409);
    s.status = "cancelled";
    tx.touch("schedule");
    return { ...s };
  });
}

/** Is the process that holds a claim still running? EPERM means it exists but
 *  belongs to someone else — still alive. */
function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

interface SweepContext {
  exportIds: Set<string>;
  wired: Set<ChannelId>;
}

async function sweepContext(): Promise<SweepContext> {
  const [exports, readiness] = await Promise.all([listExports(), Promise.resolve(channelReadiness())]);
  return {
    exportIds: new Set(exports.map((e) => e.id)),
    wired: new Set(readiness.channels.filter((c) => c.status !== "not_wired").map((c) => c.id)),
  };
}

export function driftOf(s: ScheduleSlot, ctx: SweepContext): SlotDrift | null {
  if (s.status !== "scheduled" && s.status !== "missed") return null;
  if (!ctx.wired.has(s.channelId)) return "channel_not_wired";
  if (!ctx.exportIds.has(s.exportId)) return "export_missing";
  return null;
}

export interface SweepResult {
  missed: string[];
  interrupted: string[];
  drifted: string[];
  claimed: ScheduleSlot[];
}

/**
 * One pass over the calendar under the lock. Always: stale `publishing`
 * claims -> failed, overdue `scheduled` -> missed, drift annotated/cleared.
 * With `claim: true` (a tick) it also claims every due, undrifted slot —
 * scheduled -> publishing — and returns them for the caller to publish.
 * A GET runs it with `claim: false`, so reading the calendar can mark a slot
 * missed but can never publish one.
 */
export async function sweep(now: Date = new Date(), opts: { claim?: boolean } = {}): Promise<SweepResult> {
  const ctx = await sweepContext();
  const window = missedWindowMs();
  return withStore(async (tx) => {
    const file = await tx.get("schedule");
    const out: SweepResult = { missed: [], interrupted: [], drifted: [], claimed: [] };
    let changed = false;
    const set = (s: ScheduleSlot, patch: Partial<ScheduleSlot>) => {
      Object.assign(s, patch);
      changed = true;
    };
    for (const s of file.slots) {
      if (s.status === "publishing") {
        const c = file.claims[s.id];
        const stale = !c || !processAlive(c.pid) || now.getTime() - Date.parse(c.at) > CLAIM_MAX_MS;
        if (stale) {
          set(s, { status: "failed", error: INTERRUPTED_TEXT });
          delete file.claims[s.id];
          out.interrupted.push(s.id);
        }
        continue;
      }
      if (s.status !== "scheduled" && s.status !== "missed") continue;

      const drift = driftOf(s, ctx);
      if (drift) {
        if (s.error !== DRIFT_TEXT[drift]) set(s, { error: DRIFT_TEXT[drift] });
        out.drifted.push(s.id);
      } else if (s.error && DRIFT_TEXTS.has(s.error)) {
        set(s, { error: null }); // the cause went away; so does the reason
      }
      if (s.status !== "scheduled") continue;

      const overdue = now.getTime() - Date.parse(s.publishAt);
      if (!(overdue >= 0)) continue;
      if (overdue > window) {
        set(s, { status: "missed", missedAt: iso(now), error: drift ? DRIFT_TEXT[drift] : null });
        out.missed.push(s.id);
        continue;
      }
      if (drift || !opts.claim) continue;
      set(s, { status: "publishing", error: null });
      file.claims[s.id] = { pid: process.pid, at: iso(now) };
      out.claimed.push({ ...s });
    }
    if (changed) tx.touch("schedule");
    return out;
  });
}

/** Claim ONE slot for an explicit publish-now, whatever its time. The owner's
 *  conscious act overrides the missed window; it never overrides a claim. */
export async function claimSlot(id: string, now: Date = new Date()): Promise<ScheduleSlot> {
  const ctx = await sweepContext();
  return withStore(async (tx) => {
    const file = await tx.get("schedule");
    const s = findSlot(file, id);
    if (!RESCHEDULABLE.includes(s.status)) throw new PublishError(`a ${s.status} slot cannot be published`, 409);
    const drift = driftOf({ ...s, status: "scheduled" }, ctx);
    if (drift) throw new PublishError(DRIFT_TEXT[drift], 409);
    Object.assign(s, { status: "publishing", error: null, missedAt: null } satisfies Partial<ScheduleSlot>);
    file.claims[s.id] = { pid: process.pid, at: iso(now) };
    tx.touch("schedule");
    return { ...s };
  });
}

/** Every slot, earliest first, after a non-claiming sweep. */
export async function listSlots(now: Date = new Date()): Promise<ScheduleSlot[]> {
  await sweep(now, { claim: false });
  return withStore(async (tx) => [...(await tx.get("schedule")).slots].sort((a, b) => a.publishAt.localeCompare(b.publishAt)));
}
