import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { get } from "@gt/kernel/job";
import type { Store } from "@gt/kernel/store";
import { reelApproachSchema, reelBriefSchema, type ReelApproachIn, type ReelBriefIn } from "@gt/producers/scout-reels/define";

import { driveReels, launchReels, reelFiles, SCOUT_REELS_LANE } from "../../producers/scoutReel.ts";
import type { ReelEngines } from "../../producers/scoutReelActs.ts";
import { realReelFiles, reelCutFiles, reelCutRef } from "../../producers/scoutReelKinds.ts";
import { writeJsonAtomic } from "../runStore.ts";
import { launchable, Refusal, type ActContext } from "./acts";
import { keptIdea, splitRef } from "./direction";
import { storeOrProcess } from "./genres";
import { reelCapOf, reelsUsed } from "./idea";
import { followEpisodes } from "./episodeMoves";
import { askRef, cutBrief, parseCutAsks, parseReelAsks, realBrief, REEL_CUT_SECONDS, type CutAsk, type EpisodeReelAsk, type ReelAsk } from "./reelDoor";
import { dueEpisode, episodeReelOf, episodeUseAim } from "./storyboardEpisode";
import { cellVerdict, realReelOf, reelCell, reelCutOf } from "./reelTaste";
import { mutateNight, nextCandidateId, readAllNights, readNight, resolveInNight, withCandidate } from "./store";
import type { CandidateId, Night, NightId, ReelCandidate, ReelCutCandidate } from "./types";
import { activeWing } from "./wingScope";

// A KEPT STATS IDEA ON REAL DATA (spark scout-vision S5), and a kept real reel cut in full.
//
// Operator, 2026-10-26: "Research, keep 8s strip with cut content to approve reel first before full video, which would
// have often 30s to 2 minutes. Do not stick with public datasets, we often need one wiki table, an article, or derived
// data from 'what if' fantasy scenarios. We are not doing academic research but entertaining video content with
// educative flavor." The research is the seat's, in the skill; these acts take what it found.
//
//   `scout reel <night> --json`      [{fromIdea, source, data, cut}] -> one `reel` candidate each: the kept idea's own
//                                    approach and brief shape, its numbers replaced whole by `data`, the source line on
//                                    screen (./reelDoor.ts), authored as an 8 s strip that keeps the beats in `cut`.
//                                    REFUSED, naming the entry, before anything is written: an idea that is not kept on a
//                                    live committed night (./direction.ts keptIdea), that is not a stats idea, or that
//                                    already has a live (not failed) real reel on any night.
//                                    OR A CHANNEL EPISODE (spark project-baseline): {fromEpisode, brief, approach, source,
//                                    data, cut} - a reel channel's episode, outline-kept, with no live reel on any night;
//                                    it has no idea to inherit from, so the ask carries the brief's shape and the approach
//                                    (./reelDoor.ts). Its state follows the candidate (./episodeMoves.ts).
//   `scout reel-cut <night> --json`  [{fromReel, seconds}] -> one `reel-cut` candidate each: the kept reel's strip
//                                    re-authored at seconds * 30 frames from its strip (the style reference) and its
//                                    data, rendered to mp4. REFUSED: a reel that is not kept (cell `c-NN/reel` on a live
//                                    committed night), one with no strip, or one that already has a live cut.
//
// BOTH RIDE THE SCOUT-REELS JOB (lib/producers/scoutReel.ts), receipt then confirm, on the seat - no parallel producer.
// ONE CAP: a reel and a cut each count toward the night's reelCap with its stats ideas (./idea.ts reelsUsed); the cap
// check and the rows are one write under the night's lock, and a batch over it writes nothing. The inputs are written
// beside the candidate before the launch; a launch refused fails the batch's candidates with its sentence.

export { REEL_SOURCE_KINDS, type ReelSource, type ReelSourceKind } from "./types";
export { REEL_CUT_SECONDS };

export type ReelResult = { readonly candidates: readonly { readonly id: CandidateId; readonly status: string; readonly error?: string }[]; readonly jobIds: readonly string[]; readonly outcome?: string; readonly dry?: boolean };

/** What a test injects: the launcher (absent: lib/producers/scoutReel.ts's) and the drive's engines (absent: the live seat, frame and render). */
export type ReelActEngines = { readonly launch?: typeof launchReels; readonly engines?: ReelEngines };

type Held = ReelCandidate | ReelCutCandidate;
const isHeld = (x: { readonly kind: string }): x is Held => x.kind === "reel" || x.kind === "reel-cut";

async function batchOf(id: NightId, cids: readonly string[]): Promise<Held[]> {
  const n = await readNight(id);
  return cids.map((cid) => n.candidates.find((c): c is Held => c.id === cid && isHeld(c))).filter((c): c is Held => c !== undefined);
}

const say = (cs: readonly Held[]): ReelResult["candidates"] => cs.map((c) => ({ id: c.id, status: c.status, ...(c.error === undefined ? {} : { error: c.error }) }));

async function failPending(id: NightId, cids: readonly CandidateId[], why: string): Promise<void> {
  const ids = new Set(cids);
  await mutateNight(id, (n) => {
    let m = n;
    for (const c of n.candidates) if (ids.has(c.id) && isHeld(c) && c.status === "pending") m = withCandidate(m, { ...c, status: "failed", error: why });
    return m;
  });
  await followEpisodes(id, cids);
}

/** The cap a batch would cross, in the night's numbers, or undefined. */
function over(n: Night, asked: number): string | undefined {
  const used = reelsUsed(n);
  const cap = reelCapOf(n);
  const left = Math.max(0, cap - used);
  return asked > left ? `night ${n.id} holds ${used} of its ${cap} stats reels; ${left} left, and the batch has ${asked} - nothing was made` : undefined;
}

async function briefAt(nightId: NightId, rel: string): Promise<{ brief: ReelBriefIn } | { why: string }> {
  const abs = resolveInNight(nightId, rel);
  if (!existsSync(abs)) return { why: `${rel} is not in night ${nightId}` };
  const p = parseJsonAt(rel, reelBriefSchema, await readFile(abs, "utf8"));
  return p.ok ? { brief: p.value } : { why: p.error.message };
}

async function approachAt(nightId: NightId, rel: string): Promise<{ approach: ReelApproachIn } | { why: string }> {
  const abs = resolveInNight(nightId, rel);
  if (!existsSync(abs)) return { why: `${rel} is not in night ${nightId}` };
  const p = parseJsonAt(rel, reelApproachSchema, await readFile(abs, "utf8"));
  return p.ok ? { approach: p.value } : { why: p.error.message };
}

/** Receipt, confirm, and - unless detached - the drive: the shared tail of both acts. */
async function launchAndDrive(ctx: ActContext, id: NightId, cids: readonly CandidateId[], mode: "dry" | "live", what: string, o: ReelActEngines): Promise<ReelResult> {
  const launch = o.launch ?? launchReels;
  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly };
  const target = { nightId: id, candidateIds: [...cids] };
  const r0 = await launch(ctx.store, target, opts);
  const why0 = !r0.ok ? r0.error.message : r0.value.kind !== "receipt" ? `${what} launch answered ${r0.value.kind} before its receipt` : undefined;
  if (why0 !== undefined || !r0.ok || r0.value.kind !== "receipt") {
    await failPending(id, cids, why0 ?? "no receipt");
    throw new Refusal(why0 ?? "no receipt");
  }
  const rc = r0.value.receipt;
  ctx.say(`receipt (${rc.mode}): ${what} ${cids.join(", ")} · ${cids.length} strip(s) on ${rc.lines[0]?.lane ?? SCOUT_REELS_LANE} · claude seat · ~${Math.ceil(rc.totals.seconds / 60)} min`);
  const r1 = await launch(ctx.store, target, { ...opts, token: rc.token });
  const why1 = !r1.ok ? r1.error.message : r1.value.kind !== "launched" ? `the ${what} receipt moved while it was confirmed (${r1.value.kind}); nothing launched` : undefined;
  if (why1 !== undefined || !r1.ok || r1.value.kind !== "launched") {
    await failPending(id, cids, why1 ?? "not launched");
    throw new Refusal(why1 ?? "not launched");
  }
  const jobId = r1.value.jobId;
  ctx.say(`launched ${cids.join(", ")} as ${jobId}`);
  const dry = mode === "dry" ? { dry: true } : {};
  if (ctx.detach) return { candidates: say(await batchOf(id, cids)), jobIds: [jobId], outcome: "detached", ...dry };
  const d = await driveReels(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, ...(o.engines === undefined ? {} : { engines: o.engines }) });
  await followEpisodes(id, cids);
  return { candidates: say(await batchOf(id, cids)), jobIds: [jobId], outcome: d.ok ? d.value.outcome : d.error.message, ...dry };
}

/** What the candidate inherits from where it came from: a kept idea's seed, use, app, aim and venture, or a channel's use and aim. */
type Lent = Partial<Pick<ReelCandidate, "fromSeed" | "use" | "app" | "aim" | "venture">>;

/** A channel episode's ask, planned: a reel channel's, outline-kept, with no live reel on any night (./storyboardEpisode.ts). */
async function episodePlan(at: string, ask: EpisodeReelAsk, nights: readonly Night[]): Promise<{ readonly ask: ReelAsk; readonly brief: ReelBriefIn; readonly approach: ReelApproachIn; readonly lent: Lent }> {
  const held = await dueEpisode(at, ask.fromEpisode);
  if (held.channel.medium !== "reel") throw new Refusal(`${at}: fromEpisode: ${ask.fromEpisode} is channel ${held.channel.id}'s, made as a ${held.channel.medium}; only a reel channel's episode is a reel`);
  const had = episodeReelOf(nights, ask.fromEpisode);
  if (had !== undefined) throw new Refusal(`${at}: episode ${ask.fromEpisode} already has its reel ${had.night}/${had.candidate.id} (${had.candidate.status})`);
  return { ask, brief: ask.brief, approach: ask.approach, lent: episodeUseAim(held, {}) };
}

/** `scout reel <night> --json`: [{fromIdea | fromEpisode, ...}] -> `reel` candidates (8 s strips on real data). */
export async function reelAct(ctx: ActContext, id: NightId, input: unknown, o: ReelActEngines = {}): Promise<ReelResult> {
  if (activeWing() !== "scout") throw new Refusal(`the ${activeWing()} wing makes no reel; a reel is a scout night's`);
  const asks = parseReelAsks(input);
  if (!asks.ok) throw new Refusal(asks.error.message);
  const nights = await readAllNights();
  const cache = new Map<NightId, Night | string>();
  const planned: { readonly ask: ReelAsk; readonly brief: ReelBriefIn; readonly approach: ReelApproachIn; readonly lent: Lent }[] = [];
  for (const [i, ask] of asks.value.entries()) {
    const at = `reel ${i + 1}`;
    if ("fromEpisode" in ask) {
      planned.push(await episodePlan(at, ask, nights));
      continue;
    }
    const k = await keptIdea(ask.fromIdea, cache);
    if (!k.ok) throw new Refusal(`${at}: ${k.error.message}`);
    const idea = k.value.idea;
    if (idea.target !== "stats") throw new Refusal(`${at}: ${ask.fromIdea} is a ${idea.target} idea, not a stats idea; only a stats idea is a reel`);
    const held = realReelOf(nights, ask.fromIdea);
    if (held !== undefined) throw new Refusal(`${at}: ${ask.fromIdea} already has its real reel ${held.night}/${held.candidate.id} (${held.candidate.status})`);
    const files = idea.reel ?? reelFiles(idea.id);
    const b = await briefAt(k.value.night.id, files.brief);
    if ("why" in b) throw new Refusal(`${at}: the kept idea's brief: ${b.why}`);
    const a = await approachAt(k.value.night.id, files.approach);
    if ("why" in a) throw new Refusal(`${at}: the kept idea's approach: ${a.why}`);
    planned.push({ ask, brief: realBrief(b.brief, ask), approach: a.approach, lent: { ...(idea.fromSeed === undefined ? {} : { fromSeed: idea.fromSeed }), ...(idea.use === undefined ? {} : { use: idea.use }), ...(idea.app === undefined ? {} : { app: idea.app }), ...(idea.aim === undefined ? {} : { aim: idea.aim }), ...(idea.venture === undefined ? {} : { venture: idea.venture }) } });
  }
  const { mode } = await launchable(ctx, id);

  let made: ReelCandidate[] = [];
  let full: string | undefined;
  await mutateNight(id, (n) => {
    full = over(n, planned.length);
    const raced = planned.find((p) => ("fromEpisode" in p.ask ? episodeReelOf([n], p.ask.fromEpisode) : realReelOf([n], p.ask.fromIdea)) !== undefined);
    if (full === undefined && raced !== undefined) full = `${askRef(raced.ask)} was given a real reel while this batch was checked`;
    if (full !== undefined) return n;
    let next = n;
    made = [];
    for (const { ask, brief, lent } of planned) {
      const cid = nextCandidateId(next);
      const f = realReelFiles(cid);
      const c: ReelCandidate = {
        id: cid,
        kind: "reel",
        sourceIds: [],
        status: "pending",
        ...("fromEpisode" in ask ? { fromEpisode: ask.fromEpisode } : { fromIdea: ask.fromIdea }),
        title: brief.title,
        source: ask.source,
        cut: [...ask.cut],
        files: { brief: f.brief, approach: f.approach },
        ...lent,
      };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  if (full !== undefined) throw new Refusal(full);
  const cids = made.map((c) => c.id);
  await followEpisodes(id, cids);
  try {
    for (const [k, c] of made.entries()) {
      const p = planned[k];
      if (p === undefined) continue;
      await writeJsonAtomic(resolveInNight(id, c.files.brief), p.brief);
      await writeJsonAtomic(resolveInNight(id, c.files.approach), p.approach);
    }
  } catch (e) {
    const why = `the reels' briefs were not written: ${e instanceof Error ? e.message : String(e)}`;
    await failPending(id, cids, why);
    throw new Refusal(why);
  }
  return launchAndDrive(ctx, id, cids, mode, "reels", o);
}

/** The kept reel `ref` names, or why it is not one. */
async function keptReel(ref: string): Promise<{ readonly night: Night; readonly reel: ReelCandidate } | { readonly why: string }> {
  const p = splitRef(ref);
  if (p === null) return { why: `${ref} is not a kept reel's <night>/<c-id>` };
  const n = await readNight(p.night).catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
  if (typeof n === "string") return { why: n };
  const c = n.candidates.find((x) => x.id === p.rest);
  if (c?.kind !== "reel") return { why: `night ${n.id} has no reel ${p.rest}` };
  const v = cellVerdict(n, reelCell(c.id));
  if (v !== "kept") return { why: `reel ${ref} is not kept (${n.dry || n.committed?.dry === true ? "a dry night" : n.committed === undefined ? `night ${n.id} is ${n.state}` : v}); only a kept reel is cut in full` };
  if (c.files.strip === undefined || !existsSync(resolveInNight(n.id, c.files.strip))) return { why: `reel ${ref} was kept with no strip on disk` };
  return { night: n, reel: c };
}

/** `scout reel-cut <night> --json`: [{fromReel, seconds}] -> `reel-cut` candidates (the full reel). */
export async function reelCutAct(ctx: ActContext, id: NightId, input: unknown, o: ReelActEngines = {}): Promise<ReelResult> {
  if (activeWing() !== "scout") throw new Refusal(`the ${activeWing()} wing cuts no reel; a reel is a scout night's`);
  const asks = parseCutAsks(input);
  if (!asks.ok) throw new Refusal(asks.error.message);
  const nights = await readAllNights();
  const planned: { readonly ask: CutAsk; readonly night: Night; readonly reel: ReelCandidate; readonly brief: ReelBriefIn }[] = [];
  for (const [i, ask] of asks.value.entries()) {
    const at = `cut ${i + 1}`;
    const k = await keptReel(ask.fromReel);
    if ("why" in k) throw new Refusal(`${at}: ${k.why}`);
    const held = reelCutOf(nights, ask.fromReel);
    if (held !== undefined) throw new Refusal(`${at}: ${ask.fromReel} already has its cut ${held.night}/${held.candidate.id} (${held.candidate.status})`);
    const b = await briefAt(k.night.id, k.reel.files.brief);
    if ("why" in b) throw new Refusal(`${at}: the kept reel's brief: ${b.why}`);
    planned.push({ ask, night: k.night, reel: k.reel, brief: cutBrief(b.brief, ask.seconds) });
  }
  const { mode } = await launchable(ctx, id);

  let made: ReelCutCandidate[] = [];
  let full: string | undefined;
  await mutateNight(id, (n) => {
    full = over(n, planned.length);
    const raced = planned.find((p) => reelCutOf([n], p.ask.fromReel) !== undefined);
    if (full === undefined && raced !== undefined) full = `${raced.ask.fromReel} was given a cut while this batch was checked`;
    if (full !== undefined) return n;
    let next = n;
    made = [];
    for (const { ask, reel, brief } of planned) {
      const cid = nextCandidateId(next);
      const f = reelCutFiles(cid);
      const c: ReelCutCandidate = {
        id: cid,
        kind: "reel-cut",
        sourceIds: [],
        status: "pending",
        fromReel: ask.fromReel,
        title: brief.title,
        source: reel.source,
        seconds: ask.seconds,
        frames: ask.seconds * 30,
        files: { brief: f.brief, approach: f.approach },
        ...(reel.fromSeed === undefined ? {} : { fromSeed: reel.fromSeed }),
        ...(reel.use === undefined ? {} : { use: reel.use }),
        ...(reel.app === undefined ? {} : { app: reel.app }),
        ...(reel.aim === undefined ? {} : { aim: reel.aim }),
        ...(reel.venture === undefined ? {} : { venture: reel.venture }),
      };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  if (full !== undefined) throw new Refusal(full);
  const cids = made.map((c) => c.id);
  try {
    for (const [k, c] of made.entries()) {
      const p = planned[k];
      if (p === undefined) continue;
      await writeJsonAtomic(resolveInNight(id, c.files.brief), p.brief);
      await copyFile(resolveInNight(p.night.id, p.reel.files.approach), resolveInNight(id, c.files.approach));
      // The kept strip and its module, the author turn's style reference (lib/producers/scoutReelKinds.ts subjectOf).
      const ref = reelCutRef(c.id);
      const stripAbs = resolveInNight(p.night.id, p.reel.files.strip ?? "");
      const styleAbs = path.join(path.dirname(stripAbs), "style.json");
      await mkdir(path.dirname(resolveInNight(id, ref.html)), { recursive: true });
      await copyFile(stripAbs, resolveInNight(id, ref.html));
      if (existsSync(styleAbs)) await copyFile(styleAbs, resolveInNight(id, ref.style));
      else await writeJsonAtomic(resolveInNight(id, ref.style), { name: p.reel.title, notes: "the kept strip carried no style.json: its strip.html is the module" });
    }
  } catch (e) {
    const why = `the cuts' inputs were not written: ${e instanceof Error ? e.message : String(e)}`;
    await failPending(id, cids, why);
    throw new Refusal(why);
  }
  return launchAndDrive(ctx, id, cids, mode, "reel cuts", o);
}

/**
 * `--collect`: detached reel and reel-cut jobs' results into the night. The job writes each candidate itself (rendered or
 * failed, lib/producers/scoutReelActs.ts), so collecting is settling what it left: a candidate still pending whose job
 * has ended failed (a cancelled job, or one that ended without reaching it) is told why. Refused on a committed night.
 */
export async function collectReels(id: NightId, o: { readonly store?: Store } = {}): Promise<ReelResult["candidates"]> {
  const n = await readNight(id);
  if (n.state === "committed") throw new Refusal(`night ${id} is committed; its packet is decided and nothing more is collected into it`);
  const waiting = n.candidates.filter((c): c is Held & { readonly jobId: string } => isHeld(c) && c.status === "pending" && c.jobId !== undefined);
  if (waiting.length === 0) return [];
  const store = storeOrProcess(o.store);
  for (const c of waiting) {
    const jid = parseAt("job id", jobIdSchema, c.jobId);
    if (!jid.ok) continue;
    const r = get(store, jid.value);
    if (!r.ok) continue;
    const job = r.value.job;
    if (job.state !== "done" && job.state !== "failed" && job.state !== "cancelled") continue;
    const why = job.state === "cancelled" ? `job ${job.id} was cancelled` : job.state === "failed" ? (job.error?.message ?? `job ${job.id} failed`) : `job ${job.id} ended without this ${c.kind}`;
    await mutateNight(id, (m) => {
      const now = m.candidates.find((x): x is Held => x.id === c.id && isHeld(x));
      return now === undefined || now.status !== "pending" ? m : withCandidate(m, { ...now, status: "failed", error: why });
    });
  }
  await followEpisodes(id, waiting.map((c) => c.id));
  return say(await batchOf(id, waiting.map((c) => c.id)));
}
