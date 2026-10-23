import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { writeJsonAtomic } from "../runStore.ts";
import { driveIdeas, launchIdeas, LIVE_IDEA_ENGINES } from "../../producers/scoutIdea.ts";
import type { IdeaEngines } from "../../producers/scoutIdeaActs.ts";
import { launchReels, reelFiles, SCOUT_REELS_LANE } from "../../producers/scoutReel.ts";
import { launchable, Refusal, type ActContext } from "./acts.ts";
import { listSeedBatches } from "./seedStore.ts";
import { seedsInForce, usableSeed } from "./seeds.ts";
import { mutateNight, nextCandidateId, readNight, resolveInNight, withCandidate } from "./store.ts";
import { DEFAULT_IDEA_CAP, DEFAULT_REEL_CAP, GENRE_MAX, IDEA_ANCHORS, REEL_DENSITIES, REEL_GRAMMARS, REEL_MEDIA, IDEA_PROMPT_MAX, IDEA_TARGETS, IDEA_TITLE_MAX, REEL_KINDS, SEED_REF_RE, USE_MAX, type CandidateId, type IdeaCandidate, type Night, type NightId, type ReelBrief, type SeedRef } from "./types.ts";

// THE NIGHT'S IDEAS - what `pipeline/scout.mts ideas <night> --json <file|->` does (spark
// scout-idea-artboards WP-I2, stats-reels WP-R2). The skill writes a batch of briefs in its own words -
// `{title, target, genre, prompt, anchor: {kind, ref}, use?, reel?}` - and this act turns each into an `idea`
// candidate (no source: the words are ours). The batch splits by target into at most two jobs:
//
//   scene, style, asset3d   ONE scout-ideas job that draws every such idea as one rough still in the
//                           operator's Leonardo studio (lib/producers/scoutIdea.ts), driven here
//                           unless --detach.
//   stats                   ONE scout-reels job on the Claude seat that authors every stats idea as a
//                           full strip in code and renders its frame 120 as the tile
//                           (lib/producers/scoutReel.ts) - ALWAYS left queued for the worker: an
//                           author turn is ~15 min an idea, and the night's discovery goes on meanwhile.
//
// The night's rules are the other launches' (./acts.ts): refused when the night is not open or past
// its deadline - and three of its own:
//
//   THE DOOR IS THE BATCH'S. One bad brief refuses the whole batch, naming its place (1-based) and the
//   reason, before a candidate exists - a night never holds half of what the skill meant to draw.
//   The words are craft, not content: like the game asset's brief (./concept.ts), no door here reads
//   a name out of a prompt - the skill writes the brief, and docs/scout.md holds it to that.
//
//   TWO CAPS. A night draws at most `ideaCap` studio ideas (DEFAULT_IDEA_CAP when the night predates
//   the field) and authors at most `reelCap` stats ideas (DEFAULT_REEL_CAP likewise); each idea counts
//   toward its own cap only. Every candidate counts, a failed one too: a studio failure may still have
//   spent its credits, a failed author turn its seat minutes. Both checks and the candidates' rows are
//   one write under the night's lock, so two batches at once cannot both take the last places, and a
//   batch over EITHER cap writes nothing.
//
//   A STATS IDEA'S BRIEF IS ILLUSTRATIVE. Its `reel` holds plausible numbers in a strips fixture's
//   shape (pipeline/strips/data/*.json) and must say `illustrative: true`: the night triages ideas, not
//   datasets, and a kept reel's real data is researched on a later night and swapped into the strip's
//   one data block whole (./types.ts ReelBrief, REEL_DATA_ID). The brief and the approach are written
//   to `ideas/<c-NN>/` before the reel job is launched - the job reads them there.
//
//   AN IDEA GROWS FROM A SEED (spark scout-decision-graph). A brief may name the kept seed it develops,
//   `seed: <batch>/sd-NNN` (./seeds.ts usableSeed: kept on a live batch, under no paused branch), and the
//   candidate carries it as `fromSeed`. Once any live batch has kept a seed, every new brief must name one
//   - an idea from nowhere would be work the branch graph cannot place. Checked with the rest of the door,
//   before a candidate exists.
//
// NO MONEY REFUSAL. The studio bills prepaid credits and the seat is reported uncapped; the night's
// ceiling caps Gemini only (./budget.ts), so a batch is never refused for the dollars the night has
// left - its receipts are unpriced, and say so.

const text = (max: number) => z.string().trim().min(1).max(max);

/** A reel's JSON, serialized, is held under this: the strip carries its data inline, in one block. */
export const REEL_JSON_MAX = 60_000;
const REEL_LINE_MAX = 200;
const REEL_PARA_MAX = 400;
const REEL_STEPS_MAX = 12;

const reelSchema = z
  .object({
    brief: z
      .object({
        /** The fixture's name once kept: `pipeline/strips/data/<case>.json`. */
        case: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "a lower-case slug of at most 80 characters (the fixture's file name once kept)"),
        title: text(REEL_LINE_MAX),
        hook: text(REEL_LINE_MAX),
        unit: text(REEL_LINE_MAX),
        kind: z.enum(REEL_KINDS),
        /** The numbers, in the fixture's shape: any JSON but null. */
        data: z.unknown().refine((v) => v !== undefined && v !== null, { message: "the brief's numbers, in a strips fixture's shape (pipeline/strips/data/*.json)" }),
        steps: z.array(text(REEL_PARA_MAX)).min(1).max(REEL_STEPS_MAX).optional(),
        illustrative: z.literal(true, { message: "a night's stats brief is illustrative: `illustrative: true` (its real data is researched once kept)" }),
      })
      .strict(),
    /** The seat's own design, in a strips approach card's fields (pipeline/strips/approaches.json). */
    approach: z
      .object({ name: text(REEL_LINE_MAX), medium: z.enum(REEL_MEDIA), grammar: z.enum(REEL_GRAMMARS), density: z.enum(REEL_DENSITIES), direction: text(REEL_PARA_MAX), falsifier: text(REEL_PARA_MAX) })
      .strict(),
  })
  .strict()
  .refine((r) => Buffer.byteLength(JSON.stringify(r), "utf8") <= REEL_JSON_MAX, { message: `a reel is at most ${REEL_JSON_MAX / 1000} KB of JSON: a reel's data, not a dataset` });

const ideaSchema = z
  .object({
    /** The idea's headline on the Board. */
    title: text(IDEA_TITLE_MAX),
    target: z.enum(IDEA_TARGETS),
    /** The genre it tries (`animated comedy sketch`, `music video`): what a night spreads its ideas across before a
     *  direction is confirmed (WP-I4a). Required on every new brief; the first batch's candidates hold none. */
    genre: text(GENRE_MAX).refine((s) => !/[\r\n]/.test(s), { message: "one line" }),
    /** The studio prompt, verbatim. A stats idea's is the seat's one-paragraph direction for its author turn. */
    prompt: text(IDEA_PROMPT_MAX),
    anchor: z
      .object({ kind: z.enum(IDEA_ANCHORS), ref: z.string().trim().max(300) })
      .strict()
      .refine((a) => a.kind === "free" || a.ref !== "", { message: "a watch or gap anchor quotes its watchlist line or registry gap in `ref`", path: ["ref"] }),
    use: text(USE_MAX).optional(),
    /** The kept seed this idea grows from (spark scout-decision-graph); required once a seed has been kept. */
    seed: z.string().trim().regex(SEED_REF_RE, "a kept seed's <batch>/sd-NNN").optional(),
    /** A stats idea's illustrative brief and its approach: required on target `stats`, refused on any other. */
    reel: reelSchema.optional(),
  })
  .strict()
  .refine((b) => b.target !== "stats" || b.reel !== undefined, { message: "a stats idea carries its reel: {brief, approach}", path: ["reel"] })
  .refine((b) => b.target === "stats" || b.reel === undefined, { message: "only a stats idea carries a reel", path: ["reel"] });

export type IdeaBrief = Pick<IdeaCandidate, "title" | "target" | "prompt" | "anchor" | "use"> & { readonly genre: string; readonly reel?: ReelBrief; readonly seed?: SeedRef };

/** The skill's batch as briefs, or the first bad brief's place and reason; nothing is written here. */
export function parseIdeas(raw: unknown): Result<IdeaBrief[]> {
  if (!Array.isArray(raw)) return err("invalid", "ideas: the input is a JSON array of briefs {title, target, genre, prompt, anchor: {kind, ref}, use?, reel?}");
  if (raw.length === 0) return err("invalid", "ideas: the batch holds no brief");
  const out: IdeaBrief[] = [];
  for (const [i, item] of raw.entries()) {
    const r = parseAt(`idea ${i + 1}`, ideaSchema, item);
    if (!r.ok) return r;
    const b = r.value;
    out.push({ title: b.title, target: b.target, genre: b.genre, prompt: b.prompt, anchor: { kind: b.anchor.kind, ref: b.anchor.ref }, ...(b.use === undefined ? {} : { use: b.use }), ...(b.reel === undefined ? {} : { reel: b.reel as ReelBrief }), ...(b.seed === undefined ? {} : { seed: b.seed }) });
  }
  return ok(out);
}

/**
 * Every brief's seed through the seed door, and - once a seed has been kept on a live batch - a seed on every
 * brief; the first refused one's place and why. Reads the seed batches and the steer; writes nothing.
 */
export async function checkIdeaSeeds(briefs: readonly IdeaBrief[]): Promise<Result<void>> {
  const batches = await listSeedBatches();
  const required = seedsInForce(batches);
  for (const [i, b] of briefs.entries()) {
    if (b.seed === undefined) {
      if (required) return err("invalid", `idea ${i + 1}: names no seed; a kept seed is in force, so every idea grows from one (seed: <batch>/sd-NNN)`);
      continue;
    }
    const u = await usableSeed(b.seed, batches);
    if (!u.ok) return err(u.error.code, `idea ${i + 1}: seed: ${u.error.message}`);
  }
  return ok(undefined);
}

const isReel = (c: Pick<IdeaCandidate, "target">): boolean => c.target === "stats";

/** Studio ideas the night holds, whatever became of them; a stats idea counts toward the reel cap only. */
export const ideasUsed = (n: Pick<Night, "candidates">): number => n.candidates.filter((c) => c.kind === "idea" && !isReel(c)).length;

export const ideaCapOf = (n: Pick<Night, "ideaCap">): number => n.ideaCap ?? DEFAULT_IDEA_CAP;

/** Stats ideas the night holds, whatever became of them. */
export const reelsUsed = (n: Pick<Night, "candidates">): number => n.candidates.filter((c) => c.kind === "idea" && isReel(c)).length;

export const reelCapOf = (n: Pick<Night, "reelCap">): number => n.reelCap ?? DEFAULT_REEL_CAP;

export type IdeasResult = { readonly candidates: readonly IdeaCandidate[]; readonly jobId?: string; readonly reelsJobId?: string; readonly outcome?: string };

/** What a test injects: the studio still, and the reels launcher (absent: lib/producers/scoutReel.ts's). */
export type IdeasEngines = Partial<IdeaEngines> & { readonly launchReels?: typeof launchReels };

/** Re-read the batch's candidates, in order. */
async function batchOf(id: NightId, cids: readonly string[]): Promise<IdeaCandidate[]> {
  const n = await readNight(id);
  return cids.map((cid) => n.candidates.find((c): c is IdeaCandidate => c.id === cid && c.kind === "idea")).filter((c): c is IdeaCandidate => c !== undefined);
}

const spanOf = (cids: readonly string[]): string => (cids.length === 1 ? (cids[0] ?? "") : `${cids[0] ?? ""}..${cids[cids.length - 1] ?? ""}`);

/** The cap a batch would cross, in the night's numbers, or undefined. */
function over(id: NightId, what: string, used: number, cap: number, asked: number): string | undefined {
  const left = Math.max(0, cap - used);
  return asked > left ? `night ${id} holds ${used} of its ${cap} ${what}; ${left} left, and the batch has ${asked} - nothing was drawn` : undefined;
}

/** The pending ones of `cids` failed with `why`: a launch that did not happen leaves no idea waiting on it. */
async function failPending(id: NightId, cids: readonly CandidateId[], why: string): Promise<void> {
  const ids = new Set(cids);
  await mutateNight(id, (n) => {
    let m = n;
    for (const c of n.candidates) if (ids.has(c.id) && c.kind === "idea" && c.status === "pending") m = withCandidate(m, { ...c, status: "failed", error: why });
    return m;
  });
}

type Launched = { readonly jobId: string } | { readonly why: string };

export async function ideasAct(ctx: ActContext, id: NightId, raw: unknown, engines: IdeasEngines = {}): Promise<IdeasResult> {
  const parsed = parseIdeas(raw);
  if (!parsed.ok) throw new Refusal(parsed.error.message);
  const briefs = parsed.value;
  const seeded = await checkIdeaSeeds(briefs);
  if (!seeded.ok) throw new Refusal(seeded.error.message);
  const { mode } = await launchable(ctx, id);
  const askedReels = briefs.filter(isReel).length;

  let made: IdeaCandidate[] = [];
  let full: string | undefined;
  await mutateNight(id, (n) => {
    full = over(id, "ideas", ideasUsed(n), ideaCapOf(n), briefs.length - askedReels) ?? over(id, "stats reels", reelsUsed(n), reelCapOf(n), askedReels);
    if (full !== undefined) return n;
    let next = n;
    made = [];
    for (const { reel, seed, ...b } of briefs) {
      const cid = nextCandidateId(next);
      const files = reelFiles(cid);
      const c: IdeaCandidate = { id: cid, kind: "idea", sourceIds: [], status: "pending", ...b, ...(seed === undefined ? {} : { fromSeed: seed }), ...(reel === undefined ? {} : { reel: { brief: files.brief, approach: files.approach } }) };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  if (full !== undefined) throw new Refusal(full);
  if (made.length === 0) throw new Error(`night ${id}: the idea candidates were not written`);
  const all = made.map((c) => c.id);
  const studio = made.filter((c) => !isReel(c)).map((c) => c.id);
  const reels = made.filter(isReel).map((c) => c.id);
  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly };

  // The reels' inputs, where their job reads them - before it is launched.
  try {
    for (const [k, b] of briefs.entries()) {
      const cid = all[k];
      if (b.reel === undefined || cid === undefined) continue;
      const files = reelFiles(cid);
      await writeJsonAtomic(resolveInNight(id, files.brief), b.reel.brief);
      await writeJsonAtomic(resolveInNight(id, files.approach), b.reel.approach);
    }
  } catch (e) {
    const why = `the stats ideas' briefs were not written: ${e instanceof Error ? e.message : String(e)}`;
    await failPending(id, all, why);
    throw new Refusal(why);
  }

  const launchStudio = async (): Promise<Launched> => {
    const span = spanOf(studio);
    const target = { nightId: id, candidateIds: studio };
    const r0 = await launchIdeas(ctx.store, target, opts);
    if (!r0.ok) return { why: r0.error.message };
    if (r0.value.kind !== "receipt") return { why: `ideas launch answered ${r0.value.kind} before its receipt` };
    const rc = r0.value.receipt;
    const line = rc.lines[0];
    ctx.say(`receipt (${rc.mode}): ideas ${span} · ${studio.length} artboard(s) on ${line?.lane ?? "box.chrome"} · ${line?.provider ?? "leonardo-studio"} · unpriced (${line?.unpricedReason ?? "studio credits"}) · ~${Math.ceil((line?.seconds ?? 0) / 60)} min`);
    const r1 = await launchIdeas(ctx.store, target, { ...opts, token: rc.token });
    if (!r1.ok) return { why: r1.error.message };
    if (r1.value.kind !== "launched") return { why: `the receipt moved while it was confirmed (${r1.value.kind}); nothing launched` };
    ctx.say(`launched ${span} as ${r1.value.jobId}`);
    return { jobId: r1.value.jobId };
  };
  const launchReelJob = async (): Promise<Launched> => {
    const launch = engines.launchReels ?? launchReels;
    const span = spanOf(reels);
    const target = { nightId: id, candidateIds: reels };
    const r0 = await launch(ctx.store, target, opts);
    if (!r0.ok) return { why: r0.error.message };
    if (r0.value.kind !== "receipt") return { why: `reels launch answered ${r0.value.kind} before its receipt` };
    const rc = r0.value.receipt;
    ctx.say(`receipt (${rc.mode}): reels ${span} · ${reels.length} strip(s) on ${rc.lines[0]?.lane ?? SCOUT_REELS_LANE} · claude seat · ~${Math.ceil(rc.totals.seconds / 60)} min`);
    const r1 = await launch(ctx.store, target, { ...opts, token: rc.token });
    if (!r1.ok) return { why: r1.error.message };
    if (r1.value.kind !== "launched") return { why: `the reels receipt moved while it was confirmed (${r1.value.kind}); nothing launched` };
    ctx.say(`launched ${span} as ${r1.value.jobId} · queued for the worker`);
    return { jobId: r1.value.jobId };
  };

  // Each job launches on its own: one that is refused fails its own ideas, never the other job's.
  const s = studio.length === 0 ? undefined : await launchStudio();
  const r = reels.length === 0 ? undefined : await launchReelJob();
  const jobId = s !== undefined && "jobId" in s ? s.jobId : undefined;
  const reelsJobId = r !== undefined && "jobId" in r ? r.jobId : undefined;
  const refused: string[] = [];
  for (const [l, cids, what] of [[s, studio, "ideas"], [r, reels, "reels"]] as const) {
    if (l === undefined || !("why" in l)) continue;
    await failPending(id, cids, l.why);
    // A batch of one target says its refusal verbatim; a split batch names whose it is.
    refused.push(studio.length === 0 || reels.length === 0 ? l.why : `${what} ${spanOf(cids)}: ${l.why}`);
  }
  if (refused.length > 0) throw new Refusal([...refused, ...[jobId, reelsJobId].filter((j) => j !== undefined).map((j) => `${j} launched`)].join("; "));
  const jobs = { ...(jobId === undefined ? {} : { jobId }), ...(reelsJobId === undefined ? {} : { reelsJobId }) };
  if (ctx.detach || jobId === undefined) return { candidates: await batchOf(id, all), ...jobs, outcome: "detached" };

  const d = await driveIdeas(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, engines: { generate: engines.generate ?? LIVE_IDEA_ENGINES.generate } });
  return { candidates: await batchOf(id, all), ...jobs, outcome: d.ok ? d.value.outcome : d.error.message };
}
