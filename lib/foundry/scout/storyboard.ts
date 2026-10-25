// A KEPT IDEA COMPOSED AS A VIDEO before any video is made (spark scout-storyboards, 2026-10-24).
//
// The operator: "clips are generated in isolation and full videos are following only short idea approved in
// the beginning. We will need concept in graph/pipeline to create video composition proving idea can become
// final content." A storyboard is that proof: up to five rough frames drawn by the local Flux model from the
// seat's words, a paragraph and bullets saying the vision, judged whole on the night's packet. A kept one is
// the root every full-video act must name (`keptStoryboardFor`); nothing here makes the video.
//
// THE ACT - `pipeline/scout.mts storyboard <night> --json <file|->`. The skill writes a batch of briefs, one
// per kept idea - `{fromIdea, title, paragraph, bullets, panels, use?, aim?}` - and each becomes a `storyboard`
// candidate drawn as ONE scout-storyboard job on gpu.local (lib/producers/scoutStoryboard.ts). The night's
// rules are the other launches' (./acts.ts `launchable`): refused when the night is not open or is past its
// deadline. And its own:
//
//   THE DOOR IS THE BATCH'S (./idea.ts's rule). One bad brief refuses the whole batch, naming its place and
//   why, before a candidate exists: its shape and bounds (types.ts STORYBOARD_*), then no names in the
//   panel prompts - what the model draws is craft, not content, held by ./scene.ts `namesIn` (a capital
//   mid-sentence or nothing). The title, paragraph and bullets are the operator's reading, as an idea's are.
//
//   A KEPT IDEA, LIVE AND COMMITTED (./direction.ts `keptIdea`): `fromIdea` is `<night>/<c-id>` of an idea a
//   live night kept. The artboard is read as WORDS only - the idea's prompt, in the brief the skill writes -
//   never handed to the model as a reference. The candidate copies the idea's `fromSeed`, and its aspect: a
//   portrait idea (9:16, 4:5) draws 9:16 frames, any other 16:9.
//
//   ONE STORYBOARD PER IDEA. A brief for an idea some night already holds a storyboard for is refused, unless
//   that one failed (a failed storyboard drew nothing to judge).
//
//   THE CAP. A night holds at most `storyboardCap` storyboards (DEFAULT_STORYBOARD_CAP on a night opened
//   before the field); every one counts, a failed one too - it held the card. The check and the rows are one
//   write under the night's lock, so two batches at once cannot both take the last places.
//
//   A TECHNIQUE, OPTIONAL (spark scout-vision): `technique` {claim, quote, url, template, step} is the way of
//   executing the genre the night researched and the panels apply - a finding's shape, its template and step held
//   to the finding door's rule (./knowledge.ts TEMPLATE_NAME_RE, STEP_NAME_RE, templateProblem). Kept on the Board,
//   the storyboard files it as one line in that step's PATTERNS.md, exactly as a kept finding is filed
//   (./knowledge.ts appendTechnique); not kept, nothing is written.
//
//   A TRIAL, OPTIONAL (spark scout-vision S2): `genre: "gn-..."` makes the storyboard a trial of that genre. The
//   genre must be LIVE in the kernel (./genres.ts: perfecting or piece-due - never retired, never publishable), and a
//   night takes at most TRIALS_PER_GENRE trials of each (./genres.ts trialSlots), counted under the lock with the cap.
//   Trials come FIRST from the cap: a plain storyboard may not take a place a live genre's unused trial slot still
//   holds. Any kept idea may become a trial of any live genre - one trial per idea per genre, and a plain storyboard
//   and a trial of one idea never refuse each other. A trial's job clips every drawn panel on LTX after its frames
//   (lib/producers/scoutStoryboardActs.ts), the clips judged as `c-NN/clip-N` cells beside the frames.
//
//   A CAST, OPTIONAL (spark scout-vision S3): `cast: [<name>]` - kept characters (./cast.ts castOf: each kept, the
//   audience rule read off the idea's seed). Their names and declared parody origins may stand mid-sentence in the
//   panels (./scene.ts namesIn `allow`); every panel is then COMPILED here - each member's identity block verbatim,
//   then the panel's own words (./characters.ts castPrompt) - and that is what the candidate holds and Flux draws. A member
//   with a kept sheet rides it as a late-admitted reference (lib/producers/scoutStoryboardActs.ts); one without is
//   identity block only, and the receipt line says which.
//
//   A DRY NIGHT DRAWS NOTHING. Its storyboards are written `rendered` with no frame (`images: []`), so the
//   Board triages the words alone, and no job is launched - a dry night spends nothing, and a stand-in frame
//   would be judged as if it were the plan.
//
// The frames cost $0 (a local model); the night's Gemini ceiling is never asked.

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { GENRE_ID_RE, TRIALS_PER_GENRE, VENTURE_ID_RE } from "@gt/domain/genre";
import type { Store } from "@gt/kernel/store";
import { get } from "@gt/kernel/job";
import { jobIdSchema } from "@gt/domain/ids";

import { kernel } from "../../kernelProcess.ts";
import { driveStoryboard, launchStoryboard } from "../../producers/scoutStoryboard.ts";
import { settledBoard, type StoryboardClip, type StoryboardDraw } from "../../producers/scoutStoryboardActs.ts";
import { launchable, Refusal, type ActContext } from "./acts";
import { castAllow, castLine, castOf, CAST_MAX, CAST_PROMPT_MAX, rootedNights } from "./cast";
import { castPrompt, keptCharacters, type KeptCharacter } from "./characters";
import { IDEA_REF_RE, keptIdea, type KeptIdea } from "./direction";
import { genreViews, headsOf, takesTrials, trialSlots, trialsOn, ventureRefusal, type GenreView } from "./genres";
import { STEP_NAME_RE, STEP_RULE, TEMPLATE_NAME_RE, TEMPLATE_RULE, templateProblem } from "./knowledge";
import { namesIn } from "./scene";
import { listSeedBatches, seedOf } from "./seedStore";
import { mutateNight, nextCandidateId, readAllNights, readNight, withCandidate } from "./store";
import { storyboardOf } from "./storyboardKept";
import { activeWing } from "./wingScope";
import {
  AIM_MAX,
  CLAIM_MAX,
  DEFAULT_STORYBOARD_CAP,
  IDEA_PROMPT_MAX,
  IDEA_TITLE_MAX,
  QUOTE_MAX,
  STORYBOARD_BULLET_MAX,
  STORYBOARD_BULLETS_MAX,
  STORYBOARD_BULLETS_MIN,
  STORYBOARD_PANELS_MAX,
  STORYBOARD_PARAGRAPH_MAX,
  USE_MAX,
  type CandidateId,
  type Night,
  type NightId,
  type StoryboardCandidate,
} from "./types";

export { keptStoryboardFor } from "./storyboardKept";

/** What a test injects in place of the Flux producer's drive; production passes none. */
export type StoryboardEngines = {
  /** Draw one frame: the PNG bytes and the seed it drew with. */
  readonly draw?: StoryboardDraw;
  /** Clip one panel still (a trial's): the mp4 bytes and their length. */
  readonly clip?: StoryboardClip;
};

export type StoryboardResult = {
  readonly candidates: readonly StoryboardCandidate[];
  readonly jobIds: readonly string[];
  readonly outcome?: string;
  /** True on a dry night: the storyboards were written as words only and nothing was launched. */
  readonly dry?: boolean;
};

export const storyboardsUsed = (n: Night): number => n.candidates.filter((c) => c.kind === "storyboard").length;

export function storyboardCapOf(n: Night): number {
  return n.storyboardCap ?? DEFAULT_STORYBOARD_CAP;
}

/* ── The door ─────────────────────────────────────────────────────────────── */

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), { message: "one line" });

const briefSchema = z
  .object({
    /** `<night>/<c-id>` of the kept idea it composes. */
    fromIdea: z.string().trim().regex(IDEA_REF_RE, "a kept idea's <night>/<c-id>"),
    title: line(IDEA_TITLE_MAX),
    /** The vision, one short paragraph. */
    paragraph: z.string().trim().min(1).max(STORYBOARD_PARAGRAPH_MAX),
    /** Beats, format and length, audience, the look in words, the hook. */
    bullets: z.array(line(STORYBOARD_BULLET_MAX)).min(STORYBOARD_BULLETS_MIN).max(STORYBOARD_BULLETS_MAX),
    /** One Flux prompt per frame, in order. */
    panels: z.array(z.string().trim().min(1).max(IDEA_PROMPT_MAX)).min(1).max(STORYBOARD_PANELS_MAX),
    use: line(USE_MAX).optional(),
    aim: line(AIM_MAX).optional(),
    /** The execution technique the panels apply; filed as a finding when the storyboard is kept. */
    technique: z
      .object({
        claim: line(CLAIM_MAX),
        quote: z.string().trim().min(1).max(QUOTE_MAX),
        url: z.string().trim().max(2048).regex(/^https?:\/\/\S+$/i, "an http(s) page"),
        template: z.string().regex(TEMPLATE_NAME_RE, TEMPLATE_RULE),
        step: z.string().regex(STEP_NAME_RE, STEP_RULE),
      })
      .strict()
      .optional(),
    /** The live venture the storyboard is made inside (spark scout-vision S2). */
    venture: z.string().trim().regex(VENTURE_ID_RE, "a venture id vn-...").optional(),
    /** The live genre this storyboard is a TRIAL of (spark scout-vision S2): its panels are clipped. */
    genre: z.string().trim().regex(GENRE_ID_RE, "a genre id gn-...").optional(),
    /** Kept characters it casts, by name (spark scout-vision S3): each panel leads with their identity blocks. */
    cast: z.array(line(80)).min(1).max(CAST_MAX).optional(),
  })
  .strict();

export type StoryboardBrief = z.output<typeof briefSchema>;

/**
 * The skill's batch as briefs, or the first bad brief's place and reason; nothing is read or written here. `kept` (the
 * kept characters) only widens the panels' name rule to a brief's cast and their parody origins.
 */
export function parseStoryboards(raw: unknown, kept: readonly KeptCharacter[] = []): Result<StoryboardBrief[]> {
  if (!Array.isArray(raw)) return err("invalid", "storyboard: the input is a JSON array of briefs {fromIdea, title, paragraph, bullets, panels, use?, aim?, technique?, venture?, genre?, cast?}");
  if (raw.length === 0) return err("invalid", "storyboard: the batch holds no brief");
  const out: StoryboardBrief[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `storyboard ${i + 1}`;
    const r = parseAt(at, briefSchema, item);
    if (!r.ok) return r;
    const b = r.value;
    // The panel prompts are what the model draws, so a name there is refused; the title, paragraph and bullets are read by
    // the operator only and follow the idea door's rule (the skill writes them, docs/scout.md holds it to that).
    const names = namesIn(b.panels, [], castAllow(b.cast ?? [], kept));
    if (names.length > 0) return err("refused", `${at}: the panels name ${names.join(", ")}: craft, not content (no person, studio or franchise)`);
    const twice = out.findIndex((x) => x.fromIdea === b.fromIdea && x.genre === b.genre);
    if (twice >= 0) return err("invalid", `${at}: fromIdea: ${b.fromIdea} is storyboard ${twice + 1}'s too; one ${b.genre === undefined ? "storyboard" : `trial of ${b.genre}`} per idea`);
    out.push(b);
  }
  return ok(out);
}

/** The aspect a storyboard draws at, from its idea's: a portrait idea (9:16, 4:5) is drawn 9:16, any other 16:9. */
export const boardAspect = (ideaAspect: string | undefined): "16:9" | "9:16" => (ideaAspect === "9:16" || ideaAspect === "4:5" ? "9:16" : "16:9");

/** The trial of `genre` some night already holds for `ref` (any status but failed): one trial per idea per genre. */
function trialOf(nights: readonly Night[], ref: string, genre: string): { readonly night: NightId; readonly candidate: StoryboardCandidate } | undefined {
  for (const n of nights) for (const c of n.candidates) if (c.kind === "storyboard" && c.fromIdea === ref && c.genre === genre && c.status !== "failed") return { night: n.id, candidate: c };
  return undefined;
}

/** Why a brief cannot be written over `nights`, or undefined: one plain storyboard per idea, one trial per idea per genre. */
function heldFor(nights: readonly Night[], b: Pick<StoryboardBrief, "fromIdea" | "genre">, place: number): string | undefined {
  const ref = b.fromIdea;
  if (b.genre !== undefined) {
    const had = trialOf(nights, ref, b.genre);
    return had === undefined ? undefined : `storyboard ${place}: idea ${ref} already has trial ${had.night}/${had.candidate.id} of ${b.genre} (${had.candidate.status}); one trial per idea per genre, unless that one failed`;
  }
  const plain = nights.map((n) => ({ ...n, candidates: n.candidates.filter((c) => c.kind !== "storyboard" || c.genre === undefined) }));
  const had = storyboardOf(plain, ref);
  return had === undefined ? undefined : `storyboard ${place}: idea ${ref} already has storyboard ${had.night}/${had.candidate.id} (${had.candidate.status}); one storyboard per idea, unless that one failed`;
}

/** Why the briefs' genres cannot take trials, or undefined: each names a genre the kernel holds that is still live. */
function genreRefusal(briefs: readonly StoryboardBrief[], views: readonly GenreView[]): string | undefined {
  for (const [i, b] of briefs.entries()) {
    if (b.genre === undefined) continue;
    const v = views.find((x) => x.id === b.genre);
    if (v === undefined) return `storyboard ${i + 1}: genre: no genre ${b.genre}`;
    if (!takesTrials(v.state)) return `storyboard ${i + 1}: genre: ${b.genre} is ${v.state}${v.retiredAt === undefined ? "" : ` (${v.retiredAt.slice(0, 10)})`}; only a perfecting or piece-due genre takes trials`;
  }
  return undefined;
}

/**
 * Why the batch does not fit night `n`, or undefined: the cap, each genre's trial slots, and the places the live genres'
 * unused slots hold (trials come first: a plain storyboard takes only what the cap has left past them).
 */
function capRefusal(n: Night, briefs: readonly StoryboardBrief[], slots: ReadonlyMap<string, number>): string | undefined {
  const used = storyboardsUsed(n);
  const cap = storyboardCapOf(n);
  const left = Math.max(0, cap - used);
  if (briefs.length > left) return `night ${n.id} holds ${used} of its ${cap} storyboards; ${left} left, and the batch has ${briefs.length} - nothing was drawn`;
  const asked = new Map<string, number>();
  for (const b of briefs) if (b.genre !== undefined) asked.set(b.genre, (asked.get(b.genre) ?? 0) + 1);
  for (const [g, want] of asked) {
    const free = slots.get(g) ?? 0;
    if (want > free) return `genre ${g} holds ${trialsOn(n, g)} of its ${TRIALS_PER_GENRE} trials on night ${n.id}; ${free} left, and the batch has ${want} - nothing was drawn`;
  }
  const held = [...slots.values()].reduce((a, x) => a + x, 0);
  const plain = briefs.length - [...asked.values()].reduce((a, x) => a + x, 0);
  if (plain > Math.max(0, left - held)) {
    const which = [...slots].filter(([, x]) => x > 0).map(([g, x]) => `${g} ${x}`).join(", ");
    return `night ${n.id} holds ${used} of its ${cap} storyboards; ${left} left, ${Math.min(held, left)} of them held for genre trials (${which}), and the batch has ${plain} plain - nothing was drawn`;
  }
  return undefined;
}

/* ── The act ──────────────────────────────────────────────────────────────── */

async function batchOf(id: NightId, cids: readonly string[]): Promise<StoryboardCandidate[]> {
  const n = await readNight(id);
  return cids.map((cid) => n.candidates.find((c): c is StoryboardCandidate => c.id === cid && c.kind === "storyboard")).filter((c): c is StoryboardCandidate => c !== undefined);
}

async function failPending(id: NightId, cid: CandidateId, why: string): Promise<void> {
  await mutateNight(id, (n) => {
    const c = n.candidates.find((x) => x.id === cid);
    return c?.kind === "storyboard" && c.status === "pending" ? withCandidate(n, { ...c, status: "failed", error: why }) : n;
  });
}

/** The `storyboard` act: briefs (JSON, one per kept idea) through the door, each drawn as one gpu.local job. */
export async function storyboardAct(ctx: ActContext, id: NightId, input: unknown, engines: StoryboardEngines = {}): Promise<StoryboardResult> {
  if (activeWing() !== "scout") throw new Refusal(`the ${activeWing()} wing draws no storyboard`);
  // The kept characters are read only for a batch that casts: a plain batch never touches the archive.
  const casts = Array.isArray(input) && input.some((x) => typeof x === "object" && x !== null && "cast" in x);
  const kept = casts ? keptCharacters(await rootedNights()) : [];
  const parsed = parseStoryboards(input, kept);
  if (!parsed.ok) throw new Refusal(parsed.error.message);
  const briefs = parsed.value;
  for (const [i, b] of briefs.entries()) {
    const nowhere = b.technique === undefined ? undefined : await templateProblem(b.technique.template);
    if (nowhere !== undefined) throw new Refusal(`storyboard ${i + 1}: technique: ${nowhere}`);
    const unborn = b.venture === undefined ? undefined : ventureRefusal(b.venture, ctx.store);
    if (unborn !== undefined) throw new Refusal(`storyboard ${i + 1}: venture: ${unborn}`);
  }
  const cache = new Map<NightId, Night | string>();
  const ideas: KeptIdea[] = [];
  for (const [i, b] of briefs.entries()) {
    const k = await keptIdea(b.fromIdea, cache);
    if (!k.ok) throw new Refusal(`storyboard ${i + 1}: fromIdea: ${k.error.message}`);
    ideas.push(k.value);
  }
  const casted = await castPanels(briefs, ideas, kept);
  const all = await readAllNights();
  const others = all.filter((n) => n.id !== id);
  for (const [i, b] of briefs.entries()) {
    const held = heldFor(others, b, i + 1);
    if (held !== undefined) throw new Refusal(held);
  }
  // The kernel's genres: every live one holds its trial slots, so a plain batch reads them too.
  const heads = headsOf(ctx.store);
  if (!heads.ok) throw new Refusal(`storyboard: the genres did not read: ${heads.error.message}`);
  const genres = heads.value.genres;
  const unfit = genreRefusal(briefs, genreViews(all, genres));
  if (unfit !== undefined) throw new Refusal(unfit);
  const { mode } = await launchable(ctx, id);

  let made: StoryboardCandidate[] = [];
  let full: string | undefined;
  await mutateNight(id, (n) => {
    full = briefs.map((b, i) => heldFor([n], b, i + 1)).find((x) => x !== undefined) ?? capRefusal(n, briefs, trialSlots([...others, n], genres, id));
    if (full !== undefined) return n;
    let next = n;
    made = [];
    for (const [i, b] of briefs.entries()) {
      const idea = ideas[i]?.idea;
      const aspect = boardAspect(idea?.aspect);
      const cast = casted[i];
      const use = b.use !== undefined ? { use: b.use } : { ...(idea?.use === undefined ? {} : { use: idea.use }), ...(idea?.app === undefined ? {} : { app: idea.app }) };
      const c: StoryboardCandidate = {
        id: nextCandidateId(next),
        kind: "storyboard",
        sourceIds: [],
        status: n.dry ? "rendered" : "pending",
        fromIdea: b.fromIdea,
        ...(idea?.fromSeed === undefined ? {} : { fromSeed: idea.fromSeed }),
        title: b.title,
        paragraph: b.paragraph,
        bullets: b.bullets,
        panels: cast?.panels ?? b.panels,
        ...(aspect === "16:9" ? {} : { aspect }),
        ...use,
        ...(b.aim === undefined ? {} : { aim: b.aim }),
        ...(b.technique === undefined ? {} : { technique: { claim: b.technique.claim, quote: b.technique.quote, url: b.technique.url, template: b.technique.template, step: b.technique.step } }),
        ...(b.venture === undefined ? {} : { venture: b.venture }),
        ...(b.genre === undefined ? {} : { genre: b.genre }),
        ...(cast === undefined ? {} : { cast: cast.members.map((m) => m.card.name) }),
        ...(n.dry ? { images: [] } : {}),
      };
      next = { ...next, candidates: [...next.candidates, c] };
      made.push(c);
    }
    return next;
  });
  if (full !== undefined) throw new Refusal(full);
  if (made.length === 0) throw new Error(`night ${id}: the storyboard candidates were not written`);
  const cids = made.map((c) => c.id);
  made.forEach((c, i) => {
    const cast = casted[i];
    if (cast !== undefined) ctx.say(`${c.id} cast: ${castLine(cast.members)}`);
  });
  if (mode === "dry") {
    ctx.say(`night ${id} is dry: ${made.length} storyboard(s) written as words only; no frame is drawn and nothing is launched`);
    return { candidates: await batchOf(id, cids), jobIds: [], dry: true };
  }

  const opts = { mode, actor: ctx.actor, dryOnly: ctx.dryOnly };
  const jobIds: string[] = [];
  const refused: string[] = [];
  for (const c of made) {
    const target = { nightId: id, candidateId: c.id };
    const r0 = await launchStoryboard(ctx.store, target, opts);
    const why0 = !r0.ok ? r0.error.message : r0.value.kind !== "receipt" ? `storyboard launch answered ${r0.value.kind} before its receipt` : undefined;
    if (why0 !== undefined || !r0.ok || r0.value.kind !== "receipt") {
      await failPending(id, c.id, why0 ?? "no receipt");
      refused.push(`${c.id}: ${why0 ?? "no receipt"}`);
      continue;
    }
    const rc = r0.value.receipt;
    const l = rc.lines[0];
    ctx.say(`receipt (${rc.mode}): storyboard ${c.id} · ${c.panels.length} frame(s) on ${l?.lane ?? "gpu.local"} · comfyui · $0 (free: a local model) · ~${Math.ceil(rc.totals.seconds / 60)} min`);
    const r1 = await launchStoryboard(ctx.store, target, { ...opts, token: rc.token });
    const why1 = !r1.ok ? r1.error.message : r1.value.kind !== "launched" ? `the receipt moved while it was confirmed (${r1.value.kind}); nothing launched` : undefined;
    if (why1 !== undefined || !r1.ok || r1.value.kind !== "launched") {
      await failPending(id, c.id, why1 ?? "not launched");
      refused.push(`${c.id}: ${why1 ?? "not launched"}`);
      continue;
    }
    ctx.say(`launched ${c.id} as ${r1.value.jobId}`);
    jobIds.push(r1.value.jobId);
  }
  if (refused.length > 0) throw new Refusal([...refused, ...jobIds.map((j) => `${j} launched`)].join("; "));
  if (ctx.detach) return { candidates: await batchOf(id, cids), jobIds, outcome: "detached" };

  let outcome = "done";
  for (const jobId of jobIds) {
    const d = await driveStoryboard(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, ...(engines.draw === undefined ? {} : { engines: { draw: engines.draw, ...(engines.clip === undefined ? {} : { clip: engines.clip }) } }) });
    const o = d.ok ? d.value.outcome : d.error.message;
    if (outcome === "done" && o !== "done") outcome = o;
  }
  return { candidates: await batchOf(id, cids), jobIds, outcome };
}

/* ── The cast ─────────────────────────────────────────────────────────────── */

/**
 * Each brief's cast (by place; undefined: none) and its COMPILED panels - every member's identity block verbatim, then
 * the panel's own words. Refused - nothing written - when a member is not kept, breaks the audience rule (the work's
 * audience is its idea's seed's), or a compiled panel is past what Flux takes.
 */
async function castPanels(briefs: readonly StoryboardBrief[], ideas: readonly KeptIdea[], kept: readonly KeptCharacter[]): Promise<({ readonly members: readonly KeptCharacter[]; readonly panels: readonly string[] } | undefined)[]> {
  if (!briefs.some((b) => b.cast !== undefined)) return briefs.map(() => undefined);
  const batches = await listSeedBatches();
  return briefs.map((b, i) => {
    if (b.cast === undefined) return undefined;
    const ref = ideas[i]?.idea.fromSeed;
    const audience = ref === undefined ? undefined : seedOf(batches, ref)?.seed.audience;
    const members = castOf(b.cast, kept, audience);
    if (!members.ok) throw new Refusal(`storyboard ${i + 1}: ${members.error.message}`);
    const cards = members.value.map((m) => m.card);
    const panels = b.panels.map((p) => castPrompt(cards, p));
    const long = panels.findIndex((p) => p.length > CAST_PROMPT_MAX);
    if (long >= 0) throw new Refusal(`storyboard ${i + 1}: panel ${long + 1} with its cast's identity blocks is ${panels[long]?.length} characters; a Flux prompt is at most ${CAST_PROMPT_MAX}`);
    return { members: members.value, panels };
  });
}

/* ── Collect ──────────────────────────────────────────────────────────────── */

/**
 * Collect detached storyboard jobs into the night. The job writes each frame into the night itself
 * (`storyboards/<c-NN>/panel-N.png`, fenced), so collecting is settling: every pending storyboard whose
 * job has finished is told its ending (lib/producers/scoutStoryboardActs.ts `settledBoard`) - a job the
 * worker drove while no one waited ends exactly as one driven here would. A cancelled job is a failure.
 */
export async function collectStoryboards(id: NightId, o: { readonly store?: Store } = {}): Promise<StoryboardCandidate[]> {
  const n = await readNight(id);
  if (n.state === "committed") throw new Refusal(`night ${id} is committed; its packet is decided and nothing more is collected into it`);
  const waiting = n.candidates.filter((c): c is StoryboardCandidate & { readonly jobId: string } => c.kind === "storyboard" && c.status === "pending" && c.jobId !== undefined);
  if (waiting.length === 0) return [];
  const store = o.store ?? (() => {
    const k = kernel();
    if (!k.ok) throw k.error;
    return k.value.store;
  })();
  const out: CandidateId[] = [];
  for (const c of waiting) {
    out.push(c.id);
    const jid = parseAt("job id", jobIdSchema, c.jobId);
    if (!jid.ok) continue;
    const r = get(store, jid.value);
    if (!r.ok) continue;
    const job = r.value.job;
    const ending = job.state === "cancelled" ? "failed" : job.state;
    const said = job.state === "cancelled" ? { id: job.id, error: { message: `job ${job.id} was cancelled` } } : { id: job.id, ...(job.error === undefined ? {} : { error: job.error }) };
    await mutateNight(id, (m) => {
      const now = m.candidates.find((x): x is StoryboardCandidate => x.id === c.id && x.kind === "storyboard");
      const next = now === undefined || now.status !== "pending" ? null : settledBoard(now, ending, said);
      return next === null ? m : withCandidate(m, next);
    });
  }
  return batchOf(id, out);
}
