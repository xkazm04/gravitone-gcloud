// THE VISUALIZER ACT - server only (spark scout-decision-graph WP-S3). A kept track clip rendered as a full-song
// visualizer through the existing music-video pipeline (lib/sound/mv: one still, particles, low-band edge light,
// 1080p), the mp4 collected into the night as `visualizers/<c-id>/visualizer.mp4`. It is rung 1 of the music ladder
// (operator, 2026-10-23): kept, the full video and its Short are built on it by the sibling spark music-video-ladder;
// a Short is never cut from a visualizer alone.
//
// THE JOB IS THE MV PRODUCER'S OWN (lib/producers/mv.ts): the clip is enqueued as an mv record (`enqueueMv`, never
// launched by the Settled column's switch), launched through its receipt and driven on box.render. Its two text turns
// are metered inside that job, so a Gemini fallback books a spend row on a job the night lists - the night's money
// reads it. Launched with no job ceiling, an open job holds none of the night (./budget.ts, as a track).
//
// THE STILL. A kept idea artboard under the same seed (OURS: drawn in the operator's studio) is copied to
// `visualizers/<c-id>/still.<ext>` and handed over as the record's `stillFrom` - no studio credits are spent. With
// none, the studio buys one as the Settled column does, and collect copies it to `visualizers/<c-id>/studio.<ext>`;
// the two names are how the packet says which (`stillOf`).

import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { errorMessage } from "@gt/domain/errors";

import { driveMv, launchMvNow, mvKernelId } from "../../producers/mv.ts";
import { collectJob } from "../../sound/mv/batch.ts";
import { enqueueMv, readMvLive } from "../../sound/mv/queue.ts";
import type { MvEngines } from "../../sound/mv/steps.ts";
import { filePathAbs } from "../../sound/store.ts";
import { launchable, Refusal, setCandidate, type ActContext } from "./acts";
import { listSeedBatches, seedOf } from "./seedStore";
import { mutateNight, readAllNights, readNight, resolveInNight } from "./store";
import { keptClips, playedClips } from "./track";
import { DEFAULT_VISUALIZER_CAP, NIGHT_ID_RE, USE_MAX, cellId, type IdeaCandidate, type Night, type NightId, type SeedRef, type VisualizerCandidate } from "./types";

/** What a test hands in place of the music-video job's engines (default lib/sound/mv/steps.ts DEFAULT_ENGINES). */
export type VisualizerEngines = {
  readonly mv?: Partial<MvEngines>;
};

export type VisualizerResult = { readonly candidate: VisualizerCandidate; readonly outcome?: string };

export const visualizersUsed = (n: Night): number => n.candidates.filter((c) => c.kind === "visualizer").length;
export const visualizerCapOf = (n: Night): number => n.visualizerCap ?? DEFAULT_VISUALIZER_CAP;

const TRACK_REF_RE = /^(\d{4}-\d{2}-\d{2}(?:-\d{1,2})?)\/(c-\d{2,3})\/(a\d{1,2})$/;

/** `<night>/<c-id>/<aN>` in its parts; null for anything else. */
export function parseTrackRef(ref: string): { readonly night: NightId; readonly candidate: string; readonly part: string } | null {
  const m = TRACK_REF_RE.exec(ref);
  return m === null || !NIGHT_ID_RE.test(m[1] ?? "") ? null : { night: m[1] ?? "", candidate: m[2] ?? "", part: m[3] ?? "" };
}

/** Which still a visualizer played over, read off its file's name (the header's THE STILL). */
export function stillOf(c: Pick<VisualizerCandidate, "still">): "idea" | "studio" | undefined {
  const base = c.still === undefined ? "" : path.posix.basename(c.still);
  return base.startsWith("still.") ? "idea" : base.startsWith("studio.") ? "studio" : undefined;
}

/** A visualizer's use: `a music video: synthwave › darksynth`. */
function visualizerUse(genre: string, subgenre: string): string {
  const u = `a music video: ${genre} › ${subgenre}`;
  return u.length <= USE_MAX ? u : `${u.slice(0, USE_MAX - 1)}…`;
}

/** The newest kept idea artboard grown from `seed` on a live night, with the night that holds it. */
export function keptIdeaUnder(nights: readonly Night[], seed: SeedRef | undefined): { readonly night: Night; readonly idea: IdeaCandidate & { readonly image: string } } | undefined {
  if (seed === undefined) return undefined;
  for (const n of nights) {
    const r = n.committed;
    if (r === undefined || r.dry || n.dry) continue;
    const idea = n.candidates.find((c): c is IdeaCandidate & { readonly image: string } => c.kind === "idea" && c.fromSeed === seed && c.image !== undefined && r.kept.includes(cellId(c.id, "board")));
    if (idea !== undefined) return { night: n, idea };
  }
  return undefined;
}

/** Why `ref` is not a kept track clip, or undefined when it is. */
function notKept(ref: string, n: Night | undefined, cell: string): string | undefined {
  if (n === undefined) return `${ref}: no night ${ref.slice(0, ref.indexOf("/"))}`;
  const r = n.committed;
  if (r === undefined) return `${ref} is not decided yet: night ${n.id} is ${n.state}`;
  if (r.dry || n.dry) return `${ref} was kept on a dry night; nothing is rendered from it`;
  if (r.rejected.includes(cell)) return `${ref} was rejected${(r.reasons[cell] ?? []).length > 0 ? ` (${(r.reasons[cell] ?? []).join(", ")})` : ""}; only a kept track clip gets a visualizer`;
  if (!r.kept.includes(cell)) return `${ref} was not kept on night ${n.id}; only a kept track clip gets a visualizer`;
  return undefined;
}

/**
 * A kept track clip's visualizer: the clip as a kept cell of a LIVE committed night, the night's visualizer cap, no
 * second visualizer of one clip, the candidate and its still, then the mv record, its receipt and confirm, the drive
 * and the collect unless `--detach`.
 */
export async function visualizerAct(ctx: ActContext, id: NightId, track: string, engines: VisualizerEngines = {}): Promise<VisualizerResult> {
  const { night, mode } = await launchable(ctx, id);
  const ref = parseTrackRef(track);
  if (ref === null) throw new Refusal(`not a track clip: ${track} (want <night>/<c-id>/<aN>)`);
  const nights = await readAllNights();
  const cell = cellId(ref.candidate, ref.part);
  const why = notKept(track, nights.find((n) => n.id === ref.night), cell);
  if (why !== undefined) throw new Refusal(why);
  const kept = keptClips(nights).find((k) => k.ref === track);
  if (kept === undefined) throw new Refusal(`${track} names no clip of a track on night ${ref.night}`);
  if (visualizersUsed(night) >= visualizerCapOf(night)) throw new Refusal(`night ${id} rendered ${visualizersUsed(night)} of its ${visualizerCapOf(night)} visualizer(s); nothing launched`);
  if (playedClips(nights).has(track)) throw new Refusal(`${track} already plays in a visualizer; one clip, one visualizer`);
  const seed = kept.track.fromSeed;
  const s = seed === undefined ? undefined : seedOf(await listSeedBatches(), seed)?.seed;
  const still = keptIdeaUnder(nights, seed);

  // The cap and the one-visualizer-a-clip rule again, under the night's lock: two acts at once cannot both pass.
  let made: VisualizerCandidate | undefined;
  await mutateNight(id, (n) => {
    if (visualizersUsed(n) >= visualizerCapOf(n)) throw new Refusal(`night ${id} rendered ${visualizersUsed(n)} of its ${visualizerCapOf(n)} visualizer(s); nothing launched`);
    if (playedClips([n]).has(track)) throw new Refusal(`${track} already plays in a visualizer; one clip, one visualizer`);
    made = { id: `c-${String(n.candidates.length + 1).padStart(2, "0")}`, kind: "visualizer", sourceIds: [], status: "pending", track, ...(seed === undefined ? {} : { fromSeed: seed }), ...(s === undefined ? {} : { use: visualizerUse(s.genre, s.subgenre) }) };
    return { ...n, candidates: [...n.candidates, made] };
  });
  if (made === undefined) throw new Error(`night ${id}: the visualizer was not written`);
  let c: VisualizerCandidate = made;
  const fail = async (why: string): Promise<never> => {
    await setCandidate(id, { ...c, status: "failed", error: why });
    throw new Refusal(why);
  };

  let jobId: string;
  try {
    let stillFrom: string | undefined;
    if (still !== undefined) {
      const rel = `visualizers/${c.id}/still${path.extname(still.idea.image).toLowerCase() || ".png"}`;
      const abs = resolveInNight(id, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await copyFile(resolveInNight(still.night.id, still.idea.image), abs);
      stillFrom = abs;
      c = { ...c, still: rel };
      ctx.say(`still: the kept idea ${still.night.id}/${still.idea.id} "${still.idea.title}"`);
    }
    const [rec] = await enqueueMv([{ kind: "clip", id: kept.clip.clipId, title: kept.clip.title }], Date.now(), { ...(stillFrom === undefined ? {} : { stillFrom }), launch: false });
    if (rec === undefined) return await fail(`no music-video record was written for ${track}`);
    const launched = await launchMvNow([rec.id], { mode, actor: ctx.actor, dryOnly: ctx.dryOnly, store: ctx.store });
    jobId = launched.jobIds[0] ?? mvKernelId(rec);
    ctx.say(`receipt (${launched.receipt.mode}): visualizer ${c.id} of ${track} · box.render · queue #${launched.receipt.queuePos} · ${still === undefined ? "a studio still, credits" : "our still, no credits"} · its text turns metered on the job`);
    c = { ...c, mvId: rec.id, jobId };
  } catch (e) {
    if (e instanceof Refusal) throw e;
    return fail(errorMessage(e));
  }
  await setCandidate(id, c, jobId);
  ctx.say(`launched ${c.id}: music video ${c.mvId ?? "?"} as ${jobId}`);
  if (ctx.detach) return { candidate: c, outcome: "detached" };
  const d = await driveMv([jobId], { ...(engines.mv === undefined ? {} : { engines: engines.mv }), dryOnly: ctx.dryOnly });
  const report = d.reports[0]?.report;
  const outcome = d.stopped ?? (report === undefined ? "not driven" : report.ok ? report.value.outcome : report.error.message);
  return { candidate: await collectVisualizer(id, c.id), outcome };
}

/* ── collect ───────────────────────────────────────────────────────────────── */

/**
 * A visualizer's video into the night, once its mv job finished: pending while it runs, failed with the job's
 * sentence verbatim, else `visualizers/<c-id>/visualizer.mp4` and its `visualizer - youtube.txt` (lib/sound/mv/batch.ts
 * `collectJob`), the studio's still beside it when the record bought one, and the song's length.
 */
export async function collectVisualizer(id: NightId, cid: string): Promise<VisualizerCandidate> {
  const n = await readNight(id);
  const c = n.candidates.find((x): x is VisualizerCandidate => x.id === cid && x.kind === "visualizer");
  if (c === undefined) throw new Refusal(`night ${id} has no visualizer ${cid}`);
  if (c.status !== "pending" || c.mvId === undefined) return c;
  const settle = async (next: VisualizerCandidate): Promise<VisualizerCandidate> => {
    await setCandidate(id, next);
    return next;
  };
  const j = (await readMvLive()).jobs.find((x) => x.id === c.mvId);
  if (j === undefined) return settle({ ...c, status: "failed", error: `the music-video record ${c.mvId} is not in mv.json` });
  if (j.state === "failed") return settle({ ...c, status: "failed", error: j.error ?? `the music-video job ${j.id} failed` });
  if (j.state === "cancelled") return settle({ ...c, status: "failed", error: `the music-video job ${j.id} was cancelled` });
  if (j.state !== "done") return c;
  if (j.files.video === undefined) return settle({ ...c, status: "failed", error: `the music-video job ${j.id} finished with no video` });
  const dir = resolveInNight(id, `visualizers/${cid}`);
  await mkdir(dir, { recursive: true });
  try {
    await collectJob(j, path.join(dir, "visualizer.mp3"));
    let still = c.still;
    if (still === undefined && j.files.still !== undefined) {
      still = `visualizers/${cid}/studio${path.extname(j.files.still).toLowerCase() || ".jpg"}`;
      await copyFile(filePathAbs(j.files.still), resolveInNight(id, still));
    }
    const durationS = j.analysis?.durationS;
    return settle({ ...c, status: "rendered", video: `visualizers/${cid}/visualizer.mp4`, ...(still === undefined ? {} : { still }), ...(durationS === undefined ? {} : { durationS }) });
  } catch (e) {
    return settle({ ...c, status: "failed", error: errorMessage(e) });
  }
}

/** `visualizer <night> --collect`: every pending visualizer with an mv record, collected; each one's state after. */
export async function collectVisualizers(id: NightId): Promise<VisualizerCandidate[]> {
  const n = await readNight(id);
  if (n.state === "committed") throw new Refusal(`night ${id} is committed; its packet is decided and nothing more is collected into it`);
  const out: VisualizerCandidate[] = [];
  for (const c of n.candidates) if (c.kind === "visualizer" && c.status === "pending" && c.mvId !== undefined) out.push(await collectVisualizer(id, c.id));
  return out;
}
