// THE TRACK ACT - server only (spark scout-decision-graph WP-S3). A kept music seed's sentence made into a Suno
// track on the signed-in browser (both models, ~4 clips), each clip downloaded into the night as
// `tracks/<c-id>/a<N>.mp3` - the audio tab's cells. Kept, a clip is the next night's visualizer (./visualizer.ts):
// the song is the clock, and the video starts only once the track is final (registry music-video-production).
//
// THE JOB IS THE SUNO PRODUCER'S OWN (lib/producers/suno.ts `launchSunoDraft`), not a scout job around it:
// box.chrome is capacity 1 and shared with the night's idea artboards, and a wrapper job holding the lane while
// the inner Suno job waits for it would deadlock. Its id is minted from the candidate (`sj-scout-<night>-<c-id>`),
// so a launch that died between the two stores is adopted again, and a reader can tell a scout take by its id.
//
// THE MONEY. Suno bills subscription credits, which the night's ceiling does not cap; the job is launched with no
// job ceiling, so an open one holds none of the night's Gemini (./budget.ts: an unpriced job with a ceiling holds
// all of it). The one paid turn is the proposal - the sentence into Suno's form (lib/sound/suno/propose.ts) -
// which runs before the job exists, where no meter can book it: it is PINNED TO THE CLAUDE SEAT (`avoid:
// "google"`), so a seat that is down fails the track with the router's sentence instead of spending Gemini
// outside the night's books. A track is refused by the night's track cap, never by its money.
//
// A DRY NIGHT asks no turn (the sentence stands in as the style line, lib/sound/suno/draft.ts) and its job runs on
// the Suno producer's stand-in refs, which carry no audio: collect writes STAND_MP3 (one second of a 440 Hz tone,
// 8 kbit/s mono, made with ffmpeg once and held here) for each, so a dry packet plays and is plainly not a song.
//
// COLLECT is what turns a finished job into cells: every clip of the job downloaded in the job's clip order, a
// Suno failure keeping the candidate `failed` with the driver's sentence verbatim. A detached track waits for
// `track <night> --collect`, which collects every track whose job is done and whose clips are empty.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { errorMessage } from "@gt/domain/errors";

import { driveSuno, launchSunoDraft, sunoKernelId, sunoKernelJobs } from "../../producers/suno.ts";
import { fetchClipBytes, type FetchClipFn } from "../../sound/mv/fetchAudio.ts";
import { draftJobId } from "../../sound/suno/draft.ts";
import { FAKE_SUNO_DRIVER, REAL_SUNO, type SunoDriver } from "../../sound/suno/drivers.ts";
import type { ReasonFn } from "../../sound/suno/propose.ts";
import { readSuno } from "../../sound/suno/store.ts";
import { reason as routerReason } from "../../text/router.ts";
import { launchable, Refusal, setCandidate, type ActContext } from "./acts";
import { listSeedBatches, seedOf } from "./seedStore";
import { usableSeed } from "./seeds";
import { mutateNight, readNight, resolveInNight } from "./store";
import { DEFAULT_TRACK_CAP, USE_MAX, cellId, parseCellId, type Night, type NightId, type Seed, type SeedRef, type TrackCandidate, type TrackClip } from "./types";

/** What a test hands in place of the Suno browser, the proposal turn and the clip download. */
export type TrackEngines = {
  /** The browser driver a drive binds (default: the real one on a live night, the fake on a dry one). */
  readonly driver?: SunoDriver;
  /** The text router (default lib/text/router.ts); always asked with `avoid: "google"` (the header). */
  readonly reason?: ReasonFn;
  /** A clip's bytes from its audioUrl (default lib/sound/mv/fetchAudio.ts `fetchClipBytes`). */
  readonly fetchClip?: FetchClipFn;
};

export type TrackResult = { readonly candidate: TrackCandidate; readonly outcome?: string };

/** One second of a 440 Hz tone, mp3 (8 kHz mono, 8 kbit/s, no tags): a dry clip's bytes. */
export const STAND_MP3 = Buffer.from(
  "/+M4xAAAAAAAAAAAAEluZm8AAAAPAAAAEAAABVgANTU1NTU1Q0NDQ0NDUFBQUFBQXl5eXl5ea2tra2tra3l5eXl5eYaGhoaGhpSUlJSUlKGhoaGhoaGvr6+v" +
  "r6+8vLy8vLzKysrKysrX19fX19fX5eXl5eXl8vLy8vLy////////AAAAAExhdmYgbGFtZQAAAAAAAAAAAAAAAALygAAAAAAAAAVY41S2nAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+MYxAAMiJKoeUgAAA8Nv+Hd3d7/0REr+Xd3+UksG4C4C4C4Nz5QMcP8oc/9Hv6PfwcDGQB9" +
  "9YEOaAf5R3f0KoEJCkRYgRM//+MYxAgN8OqgwZQ4AOTJASaHO/xAYckDbBgDgUuAc8YKJKYGsSjTCEHIPR4bDb/8dGo1OBoS/4SBoSnQaneCAB/tv9tX2+r/" +
  "/+MYxAsMGJKO+dUAAlKSdIcoWUFugDVUAMDBBxFjcHTvk/u/r/0/P/+v6fs2b//7dv310//++BKlUCApiRRn0BsnJ5fRiADb/+MYxBUNyKYsAFa8YJx36Hmn" +
  "4KmYaoLxglALlADyBEGgAIBUvrH////f6P////Sqd4IAPAHH3y+f3/p5wBrZ8fjU8CWwQCzf/+MYxBgJKI6W+AiyRn////9P///9P//9X0XfgAD/AW7r19f7" +
  "nYs7qtoyAc6OhNGA0ogYAIOhUAXSUYG/b2Seif/z+7d/5P///+MYxC4NKKJWWA48YP9H/9f//2p3ggAcbb7bP4vIf+feqRCl2nVni0V5qIez7//7f6/q/+zf" +
  "u/9H/++v6WKAAJGxAM//l/gr/+MYxDQKQI6O+Am0YtJbpGtluDBUPTX6dTMsLQEDiP7EAQFaBf/2/d/7ft//9lUAgAAcDUfDX+KzDzurlRCEACpgBg/GHAiY" +
  "/+MYxEYLCKJiWA9SZmDiC8BAD1DnjkcJkU6/kf///b9n//s//3/+laMABaLBYO//f+eMtHxZBkHAp9auLdqLT2S+vcFvZ9v//+MYxFQM4KJa+AB8JP7ft//9" +
  "P279///tAz5cIuOAehTgIhwMMsMDsM0ytGhTF7CfMDICYwCwCSyCYi63Eh93//////////Uq/+MYxFsKwJp2WAs2YtugBt9vxsvl8/8Wykh0A0ZADNrwFEz+" +
  "0zTPq+v6Mn/u9P/2b63+nL7f//69NQKJAJfg5I+LpMGRZGgv/+MYxGsLyKJIEAU8RDFoCj7FBjggBA4lw4JC+a524QXHP/Z//6Pu/////V/9n2blgpAEgkEA" +
  "7f+3+syIoUB3hgcMVBaCBjyV/+MYxHYLGI6KWAo2YpgYWw6gYOwKgYDQBjDH2JTHPK/q+v//7vT//93qEAJAAYYIQYX9iKEeT5F/6h8DICtBWY6gMlQJ6QED" +
  "/+MYxIQMIKJMeAC6QF70eRBMBcOA00Akf//ARYUQKQHIGKJX//47ySHITC6S502///zQQhcCED//1gQgDoEDh//+VAhoPDjS/+MYxI4NQKZmWVYAAh///70K" +
  "C6pSlLxQoZXGMesiRRpEiashAKAF4hDJlYVNKilpVChQxpZEaFDcQbEFNCjYQViL6CuhVUxB/+MYxJQXWY6eMZRoAE1FNC4xIChhbHBoYSAwKVVVVVVVVVVV" +
  "VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV/+MYxHEMyLaIQckIAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV" +
  "VVVVVVVVVVVVVVVVVVVVVVVV",
  "base64",
);
/** What STAND_MP3 lasts, as ffprobe read it (1.066 s). */
export const STAND_SECONDS = 1;

/* ── the act ───────────────────────────────────────────────────────────────── */

/** Tracks the night has made (every `track` candidate, rendered or not): what its cap counts. */
export const tracksUsed = (n: Night): number => n.candidates.filter((c) => c.kind === "track").length;
export const trackCapOf = (n: Night): number => n.trackCap ?? DEFAULT_TRACK_CAP;

/** A track's use: `a short: music video - synthwave › darksynth`. */
export function trackUse(s: Pick<Seed, "format" | "type" | "genre" | "subgenre">): string {
  const u = `a ${s.format}: ${s.type} - ${s.genre} › ${s.subgenre}`;
  return u.length <= USE_MAX ? u : `${u.slice(0, USE_MAX - 1)}…`;
}

/** The scout's Suno job id for a candidate: `sj-scout-<night>-<c-id>`, a scout take named by its id. */
export const scoutSunoJobId = (night: NightId, candidate: string): string => draftJobId(`scout-${night}-${candidate}`);
/** True for a Suno job (`sj-...`) a scout night launched: its clips are judged on the night's packet. */
export { isScoutSunoJob } from "./types";

/** The proposal turn on the Claude seat only (the header's MONEY). */
export const seatOnly =
  (reason: ReasonFn): ReasonFn =>
  (req) =>
    reason({ ...req, avoid: "google" });

/** A new candidate, the cap counted under the night's lock: two acts at once cannot both take the last track. */
async function addTrack(id: NightId, make: (cid: string) => TrackCandidate): Promise<TrackCandidate> {
  let made: TrackCandidate | undefined;
  await mutateNight(id, (n) => {
    const used = tracksUsed(n);
    if (used >= trackCapOf(n)) throw new Refusal(`night ${id} made ${used} of its ${trackCapOf(n)} track(s); nothing launched`);
    made = make(`c-${String(n.candidates.length + 1).padStart(2, "0")}`);
    return { ...n, candidates: [...n.candidates, made] };
  });
  if (made === undefined) throw new Error(`night ${id}: the track was not written`);
  return made;
}

/**
 * One Suno create from a kept music seed's sentence: the seed through `usableSeed`, the night's track cap, the
 * candidate, the receipt and its confirm (a queue that moved is read again, the proposal reused), then the drive and
 * the collect unless `--detach`.
 */
export async function trackAct(ctx: ActContext, id: NightId, seed: SeedRef, engines: TrackEngines = {}): Promise<TrackResult> {
  const { night, mode } = await launchable(ctx, id);
  const batches = await listSeedBatches();
  const usable = await usableSeed(seed, batches);
  if (!usable.ok) throw new Refusal(usable.error.message);
  const s = seedOf(batches, seed)?.seed;
  if (s === undefined) throw new Refusal(`no seed ${seed}`);
  if (tracksUsed(night) >= trackCapOf(night)) throw new Refusal(`night ${id} made ${tracksUsed(night)} of its ${trackCapOf(night)} track(s); nothing launched`);
  let c = await addTrack(id, (cid) => ({ id: cid, kind: "track", sourceIds: [], status: "pending", sentence: s.sentence, fromSeed: seed, use: trackUse(s), clips: [] }));
  const fail = async (why: string): Promise<never> => {
    await setCandidate(id, { ...c, status: "failed", error: why });
    throw new Refusal(why);
  };
  const sj = scoutSunoJobId(id, c.id);
  const source = { kind: "sentence" as const, text: s.sentence };
  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly, store: ctx.store, reason: seatOnly(engines.reason ?? routerReason) };
  let launched = false;
  try {
    const r0 = await launchSunoDraft(sj, source, opts);
    if (r0.kind !== "receipt") return await fail(`the Suno launch answered ${r0.kind} before its receipt`);
    const rc = r0.receipt;
    ctx.say(`receipt (${rc.mode}): track ${c.id} · Suno v6 + v6-wild on box.chrome · queue #${rc.queuePos} · Suno credits, unpriced · its prompt on the Claude seat`);
    let token = rc.token;
    for (let tries = 0; tries < 3 && !launched; tries++) {
      const r = await launchSunoDraft(sj, source, { ...opts, token });
      if (r.kind === "launched") launched = true;
      else token = r.kind === "stale" ? r.fresh.token : r.receipt.token;
    }
  } catch (e) {
    if (e instanceof Refusal) throw e;
    return fail(errorMessage(e));
  }
  if (!launched) return fail("the box.chrome queue kept moving under three receipts in a row; nothing launched");
  const jobId = sunoKernelId({ id: sj });
  c = { ...c, sunoJobId: sj, jobId };
  await setCandidate(id, c, jobId);
  ctx.say(`launched ${c.id}: Suno ${sj} as ${jobId}`);
  if (ctx.detach) return { candidate: c, outcome: "detached" };
  const driver = engines.driver ?? (mode === "dry" ? FAKE_SUNO_DRIVER : REAL_SUNO);
  const d = await driveSuno([jobId], { driver, dryOnly: ctx.dryOnly });
  const report = d.reports[0]?.report;
  const outcome = d.stopped ?? (report === undefined ? "not driven" : report.ok ? report.value.outcome : report.error.message);
  return { candidate: await collectTrack(ctx, id, c.id, engines), outcome };
}

/* ── collect ───────────────────────────────────────────────────────────────── */

/** `m:ss`. */
export const mss = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * A track's clips into the night, once its job finished: pending while the job runs, failed with its sentence when
 * it failed, else every clip of the job as `tracks/<c-id>/a<N>.mp3` (a dry job's as STAND_MP3). A clip with no
 * audio is named in `error` and left out; a track that holds none is failed. A track that already holds clips, or
 * is no longer pending, is returned as it is.
 */
export async function collectTrack(ctx: Pick<ActContext, "store">, id: NightId, cid: string, engines: Pick<TrackEngines, "fetchClip"> = {}): Promise<TrackCandidate> {
  const n = await readNight(id);
  const c = n.candidates.find((x): x is TrackCandidate => x.id === cid && x.kind === "track");
  if (c === undefined) throw new Refusal(`night ${id} has no track ${cid}`);
  if (c.status !== "pending" || c.clips.length > 0 || c.sunoJobId === undefined) return c;
  const settle = async (next: TrackCandidate): Promise<TrackCandidate> => {
    await setCandidate(id, next);
    return next;
  };
  const f = await readSuno();
  const rec = f.jobs.find((j) => j.id === c.sunoJobId);
  const k = c.jobId === undefined ? undefined : sunoKernelJobs(ctx.store).get(c.jobId);
  if (rec === undefined) return settle({ ...c, status: "failed", error: `the Suno job ${c.sunoJobId} is not in suno.json` });
  if (k?.state === "failed" || rec.state === "failed") return settle({ ...c, status: "failed", error: rec.error ?? k?.error?.message ?? `the Suno job ${rec.id} failed` });
  if (k?.state === "cancelled" || rec.state === "cancelled") return settle({ ...c, status: "failed", error: `the Suno job ${rec.id} was cancelled` });
  if (k?.state !== "done" && rec.state !== "done") return c;
  const dry = k === undefined ? n.dry : k.mode.kind === "dry";
  const fetchClip = engines.fetchClip ?? fetchClipBytes;
  const dir = resolveInNight(id, `tracks/${cid}`);
  await mkdir(dir, { recursive: true });
  const clips: TrackClip[] = [];
  const missing: string[] = [];
  for (const [i, clipId] of rec.clipIds.entries()) {
    const clip = f.clips.find((x) => x.id === clipId);
    const part = `a${i + 1}`;
    if (clip === undefined) {
      missing.push(`${part}: the Suno clip ${clipId} is not in suno.json`);
      continue;
    }
    let bytes: Uint8Array;
    try {
      if (clip.audioUrl !== null) bytes = await fetchClip(clip.audioUrl);
      else if (dry) bytes = STAND_MP3;
      else {
        missing.push(`${part}: Suno clip "${clip.title}" has no audio URL`);
        continue;
      }
    } catch (e) {
      missing.push(`${part}: ${errorMessage(e)}`);
      continue;
    }
    const rel = `tracks/${cid}/${part}.mp3`;
    await writeFile(path.join(dir, `${part}.mp3`), bytes);
    const durationS = clip.durationS ?? (clip.audioUrl === null && dry ? STAND_SECONDS : undefined);
    clips.push({ part, path: rel, model: clip.model, title: clip.title, clipId: clip.id, ...(durationS === undefined || durationS === null ? {} : { durationS }) });
  }
  if (clips.length === 0) return settle({ ...c, status: "failed", error: missing.length > 0 ? missing.join("; ") : `the Suno job ${rec.id} made no clip` });
  return settle({ ...c, status: "rendered", clips, ...(missing.length === 0 ? {} : { error: missing.join("; ") }) });
}

/** `track <night> --collect`: every pending track with a job, collected; each one's state after. */
export async function collectTracks(ctx: Pick<ActContext, "store">, id: NightId, engines: Pick<TrackEngines, "fetchClip"> = {}): Promise<TrackCandidate[]> {
  const n = await readNight(id);
  if (n.state === "committed") throw new Refusal(`night ${id} is committed; its packet is decided and nothing more is collected into it`);
  const out: TrackCandidate[] = [];
  for (const c of n.candidates) if (c.kind === "track" && c.status === "pending" && c.clips.length === 0 && c.jobId !== undefined) out.push(await collectTrack(ctx, id, c.id, engines));
  return out;
}

/* ── the next night's brief ────────────────────────────────────────────────── */

/** A kept track clip, by its cell, with the visualizers that play it already left out. */
export type KeptClip = { readonly ref: string; readonly night: Night; readonly track: TrackCandidate; readonly clip: TrackClip };

/** `<night>/<c-id>/<aN>`. */
export const trackRef = (night: NightId, cid: string, part: string): string => `${night}/${cellId(cid, part)}`;

/** Every track clip a LIVE night's commit kept, newest night first. */
export function keptClips(nights: readonly Night[]): KeptClip[] {
  const out: KeptClip[] = [];
  for (const n of nights) {
    const r = n.committed;
    if (r === undefined || r.dry || n.dry) continue;
    for (const cell of r.kept) {
      const p = parseCellId(cell);
      const track = p === null ? undefined : n.candidates.find((x): x is TrackCandidate => x.id === p.candidate && x.kind === "track");
      const clip = track?.clips.find((x) => x.part === p?.part);
      if (p !== null && track !== undefined && clip !== undefined) out.push({ ref: trackRef(n.id, p.candidate, p.part), night: n, track, clip });
    }
  }
  return out;
}

/** The clips a visualizer that did not fail already plays, across every night. */
export function playedClips(nights: readonly Night[]): Set<string> {
  return new Set(nights.flatMap((n) => n.candidates.flatMap((c) => (c.kind === "visualizer" && c.status !== "failed" ? [c.track] : []))));
}

/** The taste brief's `## Tracks to visualize`: kept track clips no visualizer plays yet. */
export function tracksSection(nights: readonly Night[]): string[] {
  const played = playedClips(nights);
  const lines = keptClips(nights)
    .filter((k) => !played.has(k.ref))
    .map((k) => `- ${k.ref} · ${k.clip.model}${k.clip.durationS === undefined ? "" : ` · ${mss(k.clip.durationS)}`} - ${k.track.sentence}`);
  return lines.length === 0 ? [] : ["## Tracks to visualize", "", ...lines, ""];
}
