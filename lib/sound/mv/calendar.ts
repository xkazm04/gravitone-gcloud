// SEND TO CALENDAR — a finished video becomes a YouTube slot in /calendar.
// Server-only.
//
// THROUGH THE CALENDAR'S OWN DOOR, NOT A COPY OF IT. The slot is validated by
// lib/publish/schedule.ts parseScheduleInput (the platform's limits, checked
// when the slot is made) and created by createSlot (the channel's readiness,
// the export's existence, the one-slot-per-export-per-channel rule) - exactly
// what POST /api/publish/schedule runs. Whether the slot later publishes dry
// or live is the channel's own readiness at tick time; nothing here decides it.
//
// THE VIDEO IS COPIED into exportsRoot() as `mv-<jobId>.mp4`, with the
// `<id>.json` sidecar carrying projectId "audio-mv" (lib/publish/exports.ts
// reads exactly that). A copy, not a link: Drop deletes the job's render and a
// Regenerate replaces it, and neither may change what a scheduled slot
// publishes. It is staged as `.partial.mp4` (which the export lister never
// lists) and renamed, so a half-copied file is never an export.
//
// A video already on the calendar (an active slot on YouTube) is a 409 BEFORE
// anything is copied: overwriting the export would change what that slot
// publishes.

import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { exportsRoot } from "@/lib/publish/exports";
import { createSlot, parseScheduleInput, PublishError } from "@/lib/publish/schedule";
import { readSchedule } from "@/lib/publish/store";

import { filePathAbs, safeId, SoundError } from "../store";
import { readMv, withMv } from "./store";
import type { MvJob } from "./types";

export const MV_PROJECT_ID = "audio-mv";
const ACTIVE_SLOT = new Set(["scheduled", "publishing", "published"]);

export function parseCalendar(body: unknown): string {
  const at = body && typeof body === "object" ? (body as { publishAt?: unknown }).publishAt : undefined;
  if (typeof at !== "string" || Number.isNaN(Date.parse(at))) throw new SoundError('"publishAt" must be an ISO 8601 date', 400);
  return at;
}

const speak = (e: unknown): never => {
  if (e instanceof PublishError) throw new SoundError(e.message, e.status);
  throw e;
};

export async function sendMvToCalendar(id: string, publishAt: string): Promise<{ job: MvJob; slotId: string }> {
  safeId(id);
  const job = (await readMv()).jobs.find((j) => j.id === id);
  if (!job) throw new SoundError(`no music-video job ${id}`, 404);
  if (job.state !== "done" || !job.files.video || !job.metadata) throw new SoundError("only a finished video with its metadata can go to the calendar", 409);

  const exportId = `mv-${id}`;
  const input = (() => {
    try {
      return parseScheduleInput({ projectId: MV_PROJECT_ID, exportId, channelId: "youtube", publishAt, title: job.metadata.title, description: job.metadata.description, tags: job.metadata.tags });
    } catch (e) {
      return speak(e);
    }
  })();
  const active = (await readSchedule()).slots.find((s) => s.exportId === exportId && s.channelId === "youtube" && ACTIVE_SLOT.has(s.status));
  if (active) throw new SoundError(`this video is already on the calendar (slot ${active.id}, ${active.status} for ${active.publishAt})`, 409);

  const dir = exportsRoot();
  await mkdir(dir, { recursive: true });
  const staged = path.join(dir, `${exportId}.partial.mp4`);
  try {
    await copyFile(filePathAbs(job.files.video), staged);
    await writeFile(path.join(dir, `${exportId}.json`), `${JSON.stringify({ projectId: MV_PROJECT_ID }, null, 2)}\n`, "utf8");
    await rename(staged, path.join(dir, `${exportId}.mp4`));
  } catch (e) {
    await rm(staged, { force: true }).catch(() => {});
    throw e;
  }
  const slot = await createSlot(input).catch(speak);
  const updated = await withMv((f) => {
    const j = f.jobs.find((x) => x.id === id);
    if (!j) throw new SoundError(`no music-video job ${id}`, 404);
    j.slotId = slot.id;
    return { ...j };
  });
  return { job: updated, slotId: slot.id };
}
