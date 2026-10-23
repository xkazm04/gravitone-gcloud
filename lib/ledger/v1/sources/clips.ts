import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseJsonAt, type Parsed } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";

import { clipRoot, isClipId } from "../../../../lib/imaging/video/store.ts";
import { bump, facts, instant, readEach } from "../facts.ts";
import type { IngestEvent, LiveJob, ProjectCtx, Projection, Skipped, Source } from "../types.ts";
import { universeRoot } from "./roots.ts";

// THE VIDEO CLIPS, PROJECTED - <clip dir>/<clipId>.json (lib/imaging/video/store.ts),
// the 12th source COMMON decision 5 allowed for if it carried live work. It
// does: a clip walks queued -> rendering -> done | failed | refused on the
// server (lib/imaging/video/clips.ts), detached from the request that
// started it, and minutes long - exactly what Runs must show.
//
// Read at the root roots.ts picks (clipRoot() ignores the fixture switch;
// CLIP_STORE_DIR wins) with v1's `isClipId`, one file per clip through the
// door; `listClipRecords` cannot be pointed at a root and swallows a damaged
// record into a bare count, where this names it.
//
// Recorded: clip.start (`createdAt`, epoch ms, written once with `queued`) and
// clip.end (`finishedAt`, with the terminal status and the vendor's words
// verbatim). Observed: clip.status for the two live statuses. Cost rides in
// `data.costUsd`: the clip's money is the video-usd spend class, which the
// spend source projects.
//
// LIVE: queued and rendering. Lane cloud.leonardo: v1's clip runner has one
// adapter, lib/imaging/video/leonardo.ts.

const STATUSES = ["queued", "rendering", "done", "failed", "refused"] as const;
const recordSchema = z.object({
  clipId: z.string().min(1),
  projectId: z.string(),
  status: z.enum(STATUSES),
  model: z.string(),
  durationS: z.number(),
  aspect: z.string(),
  vendorJobId: z.string().nullable(),
  costUsd: z.number().nullable(),
  costBasis: z.string(),
  error: z.string().nullable(),
  createdAt: z.number(),
  finishedAt: z.number().nullable(),
});

type Clip = Parsed<z.output<typeof recordSchema>>;
export type ClipsSnapshot = { readonly clips: readonly Clip[]; readonly skipped: readonly Skipped[] };

export const CLIPS_READ_CAP = 1000;
const RUNNER = { kind: "machine", id: "clip-runner" } as const;
const LIVE: readonly Clip["status"][] = ["queued", "rendering"];
const HREF = "/studio";

export const clipsRoot = (): string => universeRoot("clips", clipRoot, "CLIP_STORE_DIR");

export async function readClips(root: string): Promise<Result<ClipsSnapshot>> {
  let names: string[];
  try {
    names = await readdir(root);
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) return err("unavailable", `clips: listing ${root} failed: ${errorMessage(e)}`, { cause: e });
    names = [];
  }
  const ids = names.filter((n) => n.endsWith(".json") && isClipId(n.slice(0, -5))).map((n) => n.slice(0, -5)).sort().slice(-CLIPS_READ_CAP);
  const got = await readEach(ids, async (id) => ({ id, text: await readFile(path.join(root, `${id}.json`), "utf8") }));
  const clips: Clip[] = [];
  const skipped: Skipped[] = [...got.skipped];
  for (const d of got.items) {
    const p = parseJsonAt(`clip ${d.id}`, recordSchema, d.text);
    if (p.ok) clips.push(p.value);
    else skipped.push({ id: d.id, reason: p.error.message });
  }
  return ok({ clips, skipped });
}

function eventsOf(c: Clip, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("clips", ctx);
  const subject = { kind: "clip", id: c.clipId };
  const data: EventData = { runId: c.clipId, projectId: c.projectId, model: c.model, durationS: c.durationS, aspect: c.aspect };
  const at = { actor: RUNNER, subject, lane: "cloud.leonardo" } as const;
  const out: IngestEvent[] = [f.recorded(c.clipId, "start", c.createdAt, { ...at, type: "clip.start", data })];
  if (LIVE.includes(c.status)) out.push(f.observed(c.clipId, `status.${c.status}`, { ...at, type: "clip.status", data: { ...data, status: c.status } }));
  if (c.finishedAt !== null) {
    const end: EventData = { ...data, status: c.status, costBasis: c.costBasis, ...(c.costUsd === null ? {} : { costUsd: c.costUsd }), ...(c.error === null ? {} : { error: c.error }), ...(c.vendorJobId === null ? {} : { vendorJobId: c.vendorJobId }) };
    out.push(f.recorded(c.clipId, `end.${c.status}`, c.finishedAt, { ...at, type: "clip.end", data: end }));
  }
  return out;
}

function tallyOf(clips: readonly Clip[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const c of clips) {
    bump(records, `clip.${c.status}`);
    bump(fs, "clip.start");
    if (LIVE.includes(c.status)) bump(fs, "clip.status");
    if (c.finishedAt !== null) bump(fs, "clip.end");
  }
  return { records, facts: fs };
}

function liveOf(c: Clip): LiveJob | null {
  if (!LIVE.includes(c.status)) return null;
  const startedAt = instant(c.createdAt);
  return {
    source: "clips",
    id: c.clipId,
    title: `clip ${c.model} ${c.durationS}s · ${c.projectId}`,
    lane: "cloud.leonardo",
    media: "video",
    state: c.status === "rendering" ? "running" : "queued",
    ...(startedAt === null ? {} : { startedAt }),
    href: HREF,
  };
}

export function projectClips(s: ClipsSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.clips.flatMap((c) => eventsOf(c, ctx)),
    live: s.clips.map(liveOf).filter((j) => j !== null),
    weir: [],
    tally: tallyOf(s.clips),
    skipped: s.skipped,
  };
}

export const clipsSource: Source<ClipsSnapshot> = { id: "clips", read: () => readClips(clipsRoot()), project: projectClips };
