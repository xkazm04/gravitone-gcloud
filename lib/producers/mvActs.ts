import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError, err, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { slotItemId, type Channel } from "@gt/domain/slot";
import { listSlots } from "@gt/kernel/slots/read";
import type { SlotRow } from "@gt/kernel/slots/schema";
import { createSlot } from "@gt/kernel/slots/write";
import type { Store } from "@gt/kernel/store";

import { channelReadiness } from "@/lib/publish/channels";
import { exportsRoot } from "@/lib/publish/exports";
import { snippetProblem } from "@/lib/publish/youtube";
import { parseRegenerate, regeneratedRecord } from "@/lib/sound/mv/queue";
import { readMv, withMv } from "@/lib/sound/mv/store";
import type { MvJob } from "@/lib/sound/mv/types";
import { filePathAbs, safeId } from "@/lib/sound/store";

import { cancelMvJob, mvJobOf, mvLine, mvSpec, MV_PRODUCER } from "./mv.ts";
import { launchJobs, soundKernel, type LaunchOptions, type LaunchResult } from "./sound.ts";

// THE PIPELINE CANVAS'S TWO ACTS, IN THE NEW WORLD (owner ruling 2) - v1's Regenerate
// (lib/sound/mv/queue.ts regenerateMv) and Send to Calendar (lib/sound/mv/calendar.ts
// sendMvToCalendar, gone at L75) had one UI, the v1 Foundry's Pipeline canvas, which Phase 6 deletes. Both
// are kernel acts now, answered from the Runs inspector of an mv job.
//
// REGENERATE IS A RECEIPT FIRST. v1's regenerateMv re-queued the record and, while the column's
// switch was on, launched it at once in the column's mode - live unless GRAVITONE_DRY_ONLY - with
// no receipt: a re-rolled still is a Leonardo studio still, and nobody was shown that. Here the
// read prices the attempt the regenerate WILL make (its stamp is fixed by the read and carried
// back with the token, so the receipt and the confirm name one kernel job), and only the confirm
// writes: the record's redo, then the job through the same `launchJobs` every launch takes. The
// record edit is queue.ts's `regeneratedRecord`, the one pure edit regenerateMv also writes (L75
// folded the copy this file carried back into it); the act calls the edit, not regenerateMv,
// because that function's receipt-less launch is the defect.
// IDEMPOTENT ON THE STAMP: a confirm that finds the record already at its stamp skips the edit
// and adopts the job; a record restamped since by someone else is a conflict, never a second
// re-roll.
//
// SEND TO CALENDAR keeps v1's intelligence and moves the slot into the kernel: the video is
// COPIED into the exports root as `mv-<id>.mp4` (+ the `audio-mv` sidecar), staged `.partial`
// and renamed, so Drop or a later Regenerate never changes what a slot publishes; the slot names
// the Library's `video:export:mv-<id>`; a video already held on that channel is refused BEFORE
// anything is copied (v1's 409, now the kernel's own clash rule, checked again in the write);
// the platform's limits (lib/publish/youtube.ts snippetProblem) and the channel's wiring are
// checked when the slot is made, not when it fires at 3 a.m. DROPPED from v1: the `slotId` the
// record carried - the kernel calendar answers "is this video slotted" by its item, and a second
// copy of that fact in mv.json is one that can disagree.

export const MV_PROJECT_ID = "audio-mv";
export const mvExportId = (id: string): string => `mv-${id}`;

export type RegenerateResult = LaunchResult & { readonly at: number };

const SETTLED = new Set(["done", "failed", "cancelled"]);

async function recordOf(id: string): Promise<MvJob> {
  safeId(id);
  const j = (await readMv()).jobs.find((x) => x.id === id);
  if (j === undefined) throw new AppError("not-found", `no music-video job ${id}`);
  return j;
}

/** v1's guard (regenerateMv): a finished or failed video, whose attempt's job is not running. */
function regenerable(j: MvJob, store: Store): void {
  const k = mvJobOf(j, store);
  if ((j.state !== "done" && j.state !== "failed") || (k !== undefined && !SETTLED.has(k.state))) {
    throw new AppError("conflict", `this job is ${k !== undefined && !SETTLED.has(k.state) ? k.state : j.state}; only a finished or failed video can be regenerated`);
  }
}

/**
 * Regenerate one part of a finished or failed video. Without `token`: the receipt of the attempt
 * it would make, and that attempt's stamp `at`. With `token` and that `at`: the record is
 * re-queued and the job launched, or the fresh receipt when the queue moved (`stale`).
 */
export async function regenerateMvAct(id: string, body: unknown, o: LaunchOptions & { readonly at?: number }): Promise<RegenerateResult> {
  const ask = parseRegenerate(body);
  const store = o.store ?? soundKernel().store;
  const j = await recordOf(id);
  if (o.token === undefined) {
    regenerable(j, store);
    const at = Math.max(o.now ?? Date.now(), j.enqueuedAt + 1);
    return { ...launchJobs({ producer: MV_PRODUCER, media: "video", lines: [mvLine(regeneratedRecord(j, ask, at), [])] }, { ...o, store }), at };
  }
  const at = o.at;
  if (at === undefined) throw new AppError("invalid", "a regenerate confirm carries the stamp its receipt was read at");
  if (j.enqueuedAt > at) throw new AppError("conflict", `video ${id} was re-queued since this receipt was read; read it again`);
  if (j.enqueuedAt < at) {
    regenerable(j, store);
    // The failed attempt's job is closed, so nobody retries it into a record that has moved on (v1).
    const k = mvJobOf(j, store);
    if (k !== undefined && k.state === "failed") cancelMvJob(k.id, o.actor, store);
    await withMv((f) => {
      const i = f.jobs.findIndex((x) => x.id === id);
      const cur = f.jobs[i];
      if (cur === undefined) throw new AppError("not-found", `no music-video job ${id}`);
      if (cur.enqueuedAt !== j.enqueuedAt) throw new AppError("conflict", `video ${id} was re-queued while this one was confirmed`);
      f.jobs[i] = regeneratedRecord(cur, ask, at);
      delete f.progress[id];
    });
  }
  const r = launchJobs(await mvSpec([id]), { ...o, store });
  return { ...r, at };
}

/* ── send to calendar ─────────────────────────────────────────────────────── */

export type MvSlotAsk = { readonly channel: Channel; readonly publishAt: string };

const ACTIVE = ["scheduled", "publishing", "published"] as const;

/** Put a finished video on the kernel calendar (v1 sendMvToCalendar, absorbed - see the header). */
export async function sendMvToCalendarAct(id: string, ask: MvSlotAsk, by: Actor, store: Store = soundKernel().store): Promise<Result<SlotRow>> {
  const j = await recordOf(id);
  const meta = j.metadata;
  if (j.state !== "done" || j.files.video === undefined || meta === undefined) return err("conflict", "only a finished video with its metadata can go to the calendar");
  if (ask.channel === "blog") return err("invalid", "a blog slot is made by an article's approve, not by a video");
  const problem = snippetProblem({ title: meta.title, description: meta.description, tags: meta.tags });
  if (problem !== null) return err("invalid", problem);
  const wired = new Set<Channel>(channelReadiness().channels.filter((c) => c.status !== "not_wired").map((c) => c.id));
  if (!wired.has(ask.channel)) return err("conflict", `${ask.channel} is not wired`, { detail: "channel_not_wired" });
  const exportId = mvExportId(id);
  const item = slotItemId.export(exportId);
  const held = listSlots(store, { states: [...ACTIVE] });
  if (!held.ok) return held;
  const active = held.value.find((r) => r.slot.libraryItemId === item && r.slot.channel === ask.channel);
  if (active !== undefined) return err("conflict", `this video is already on the calendar (slot ${active.slot.id}, ${active.slot.state} for ${active.slot.at})`);

  const dir = exportsRoot();
  await mkdir(dir, { recursive: true });
  const staged = path.join(dir, `${exportId}.partial.mp4`);
  try {
    await copyFile(filePathAbs(j.files.video), staged);
    await writeFile(path.join(dir, `${exportId}.json`), `${JSON.stringify({ projectId: MV_PROJECT_ID }, null, 2)}\n`, "utf8");
    await rename(staged, path.join(dir, `${exportId}.mp4`));
  } catch (e) {
    await rm(staged, { force: true });
    return err("unavailable", `the video could not be copied to the exports: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
  }
  return createSlot(store, { libraryItemId: item, channel: ask.channel, at: ask.publishAt, title: meta.title, description: meta.description, tags: meta.tags }, by, { wired, itemExists: (x) => x === item });
}

