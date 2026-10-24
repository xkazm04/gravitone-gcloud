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
//   A DRY NIGHT DRAWS NOTHING. Its storyboards are written `rendered` with no frame (`images: []`), so the
//   Board triages the words alone, and no job is launched - a dry night spends nothing, and a stand-in frame
//   would be judged as if it were the plan.
//
// The frames cost $0 (a local model); the night's Gemini ceiling is never asked.

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";
import { get } from "@gt/kernel/job";
import { jobIdSchema } from "@gt/domain/ids";

import { kernel } from "../../kernelProcess.ts";
import { driveStoryboard, launchStoryboard } from "../../producers/scoutStoryboard.ts";
import { settledBoard, type StoryboardDraw } from "../../producers/scoutStoryboardActs.ts";
import { launchable, Refusal, type ActContext } from "./acts";
import { IDEA_REF_RE, keptIdea, type KeptIdea } from "./direction";
import { namesIn } from "./scene";
import { mutateNight, nextCandidateId, readAllNights, readNight, withCandidate } from "./store";
import { storyboardOf } from "./storyboardKept";
import { activeWing } from "./wingScope";
import {
  AIM_MAX,
  DEFAULT_STORYBOARD_CAP,
  IDEA_PROMPT_MAX,
  IDEA_TITLE_MAX,
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
  })
  .strict();

export type StoryboardBrief = z.output<typeof briefSchema>;

/** The skill's batch as briefs, or the first bad brief's place and reason; nothing is read or written here. */
export function parseStoryboards(raw: unknown): Result<StoryboardBrief[]> {
  if (!Array.isArray(raw)) return err("invalid", "storyboard: the input is a JSON array of briefs {fromIdea, title, paragraph, bullets, panels, use?, aim?}");
  if (raw.length === 0) return err("invalid", "storyboard: the batch holds no brief");
  const out: StoryboardBrief[] = [];
  for (const [i, item] of raw.entries()) {
    const at = `storyboard ${i + 1}`;
    const r = parseAt(at, briefSchema, item);
    if (!r.ok) return r;
    const b = r.value;
    // The panel prompts are what the model draws, so a name there is refused; the title, paragraph and bullets are read by
    // the operator only and follow the idea door's rule (the skill writes them, docs/scout.md holds it to that).
    const names = namesIn(b.panels, []);
    if (names.length > 0) return err("refused", `${at}: the panels name ${names.join(", ")}: craft, not content (no person, studio or franchise)`);
    const twice = out.findIndex((x) => x.fromIdea === b.fromIdea);
    if (twice >= 0) return err("invalid", `${at}: fromIdea: ${b.fromIdea} is storyboard ${twice + 1}'s too; one storyboard per idea`);
    out.push(b);
  }
  return ok(out);
}

/** The aspect a storyboard draws at, from its idea's: a portrait idea (9:16, 4:5) is drawn 9:16, any other 16:9. */
export const boardAspect = (ideaAspect: string | undefined): "16:9" | "9:16" => (ideaAspect === "9:16" || ideaAspect === "4:5" ? "9:16" : "16:9");

/** Why a brief for `ref` cannot be written over `nights`, or undefined: one storyboard per idea. */
function heldFor(nights: readonly Night[], ref: string, place: number): string | undefined {
  const had = storyboardOf(nights, ref);
  return had === undefined ? undefined : `storyboard ${place}: idea ${ref} already has storyboard ${had.night}/${had.candidate.id} (${had.candidate.status}); one storyboard per idea, unless that one failed`;
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
  const parsed = parseStoryboards(input);
  if (!parsed.ok) throw new Refusal(parsed.error.message);
  const briefs = parsed.value;
  const cache = new Map<NightId, Night | string>();
  const ideas: KeptIdea[] = [];
  for (const [i, b] of briefs.entries()) {
    const k = await keptIdea(b.fromIdea, cache);
    if (!k.ok) throw new Refusal(`storyboard ${i + 1}: fromIdea: ${k.error.message}`);
    ideas.push(k.value);
  }
  const others = (await readAllNights()).filter((n) => n.id !== id);
  for (const [i, b] of briefs.entries()) {
    const held = heldFor(others, b.fromIdea, i + 1);
    if (held !== undefined) throw new Refusal(held);
  }
  const { mode } = await launchable(ctx, id);

  let made: StoryboardCandidate[] = [];
  let full: string | undefined;
  await mutateNight(id, (n) => {
    full = briefs.map((b, i) => heldFor([n], b.fromIdea, i + 1)).find((x) => x !== undefined);
    const used = storyboardsUsed(n);
    const cap = storyboardCapOf(n);
    const left = Math.max(0, cap - used);
    if (full === undefined && briefs.length > left) full = `night ${id} holds ${used} of its ${cap} storyboards; ${left} left, and the batch has ${briefs.length} - nothing was drawn`;
    if (full !== undefined) return n;
    let next = n;
    made = [];
    for (const [i, b] of briefs.entries()) {
      const idea = ideas[i]?.idea;
      const aspect = boardAspect(idea?.aspect);
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
        panels: b.panels,
        ...(aspect === "16:9" ? {} : { aspect }),
        ...use,
        ...(b.aim === undefined ? {} : { aim: b.aim }),
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
    const d = await driveStoryboard(ctx.store, ctx.location, jobId, { dryOnly: ctx.dryOnly, ...(engines.draw === undefined ? {} : { engines: { draw: engines.draw } }) });
    const o = d.ok ? d.value.outcome : d.error.message;
    if (outcome === "done" && o !== "done") outcome = o;
  }
  return { candidates: await batchOf(id, cids), jobIds, outcome };
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
