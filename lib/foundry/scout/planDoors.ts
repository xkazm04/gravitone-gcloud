import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";

import { extractProducer } from "../../producers/extract.ts";
import { SCOUT_ASSET_LANE } from "../../producers/scoutAsset.ts";
import { SCOUT_IDEAS_LANE } from "../../producers/scoutIdea.ts";
import { SCOUT_REELS_LANE } from "../../producers/scoutReel.ts";
import { sceneLane } from "../../producers/scoutScene.ts";
import { SCOUT_SHEET_LANE } from "../../producers/scoutSheet.ts";
import { SCOUT_STORYBOARD_LANE } from "../../producers/scoutStoryboard.ts";
import { markOrigin, sceneAct, styleAct, type ActContext } from "./acts.ts";
import { assetAct } from "./asset.ts";
import { keptCharacters } from "./characters.ts";
import { rootedNights } from "./cast.ts";
import { parseBrief } from "./concept.ts";
import { briefFromIdea, originWith } from "./direction.ts";
import { draftOf, DRAFT_LANE, writeDraft, type DraftText } from "./draft.ts";
import { parseReelAsks } from "./reelDoor";
import { ideasAct, parseIdeas } from "./idea.ts";
import type { PlanItem, PlanKind } from "./plan.ts";
import { reelAct } from "./reel.ts";
import { sheetAct } from "./sheet.ts";
import { parseStoryboards, storyboardAct } from "./storyboard.ts";
import { SEED_REF_RE, SOURCE_ID_RE, USE_MAX, type NightId } from "./types.ts";

// EACH PLAN KIND'S DOOR (spark scout-vision S6) - for every kind a plan item may name, three things read from
// the code that already owns them, never restated:
//
//   parse   the door's OWN parser, run without launching: what `plan` refuses at plan time is what the CLI verb
//           would refuse at its door. Where the verb's door is its flags (`style`, `scene`, `sheet`), there was
//           no parse-only entry, and the flags are given one here as a strict object of the same names
//           (`sources`, `source`, `frames`, `use`, `slug`, `seed`, `character`). The ideas, storyboards and
//           asset doors are theirs (parseIdeas, parseStoryboards, briefFromIdea + parseBrief). Checks that read
//           the world at launch (seed in force, kept idea still kept, a cap, the money) stay at launch: the
//           world may move between the plan and the tick, and the door says so then.
//   lanes   the kernel lanes a launch occupies, read from the producers' constants - the night-fill launches an
//           item only when every one of them holds no queued or running job. A scene's lane is the clip's or
//           the stills' (sceneLane), decided at launch by the clip cap, so both are asked.
//   launch  the SAME function the CLI verb calls, in detach - the worker drives the job, the tick returns.
//
// The asset launch repeats what pipeline/scout.mts `asset` does around assetAct (fromIdea taken off, the
// origin set once the candidate is written), because the verb holds it inline; a plan's asset payload is
// the `--brief` JSON, and an origin is the brief's fromIdea's (no `--seed`).

/** What a launch hands back: the job it queued, when it queued one (a dry night's storyboards queue none). */
export type Launched = { readonly jobId?: string };

export type PlanDoor = {
  readonly parse: (payload: unknown) => Promise<Result<unknown>>;
  readonly lanes: () => readonly ResourceLane[];
  readonly launch: (ctx: ActContext, id: NightId, item: PlanItem) => Promise<Launched>;
};

export type PlanDoors = { readonly [K in PlanKind]: PlanDoor };

const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s), { message: "one line" });

const seed = z.string().trim().regex(SEED_REF_RE, "a kept seed's <batch>/sd-NNN").optional();

/** `style <night> --sources s-01,s-03 --use ... [--slug x] [--seed ...]` as an object. */
const extractSchema = z
  .object({ sources: z.array(z.string().trim().regex(SOURCE_ID_RE, "a source id s-NN")).min(1), use: line(USE_MAX).optional(), slug: line(80).optional(), seed })
  .strict();

/** `scene <night> --source s-NN --use ... [--frames k-012.jpg] [--seed ...]` as an object. */
const sceneSchema = z.object({ source: z.string().trim().regex(SOURCE_ID_RE, "a source id s-NN"), frames: z.array(line(200)).min(1).optional(), use: line(USE_MAX).optional(), seed }).strict();

/** `sheet <night> [--character <name>]` as an object. */
const sheetSchema = z.object({ character: line(80).optional() }).strict();

const parsed = <T>(r: Result<T>): Result<unknown> => (r.ok ? ok(r.value) : r);

/** The outcomes a detached launch ends on that are not a failure (pipeline/scout.mts reads the same set). */
const GOOD = new Set(["done", "detached", "enqueued", "launched", "queued", "running"]);

/** A launch that answered without throwing but did not launch: its own sentence, thrown for the tick to record. */
function failedUnless(outcome: string | undefined, error?: string): void {
  if (error !== undefined) throw new Error(error);
  if (outcome !== undefined && !GOOD.has(outcome)) throw new Error(outcome);
}

const first = (ids: readonly string[]): Launched => (ids[0] === undefined ? {} : { jobId: ids[0] });

/** The doors as production binds them; `draftText` is the one seam a test replaces (the text router's `draft` turn), `signal` the tick's stop. */
export function planDoors(o: { readonly draftText?: DraftText; readonly signal?: AbortSignal } = {}): PlanDoors {
  return {
    storyboards: {
      async parse(p) {
        // The kept characters are read only for a batch that casts, as the act reads them.
        const casts = Array.isArray(p) && p.some((x) => typeof x === "object" && x !== null && "cast" in x);
        return parsed(parseStoryboards(p, casts ? keptCharacters(await rootedNights()) : []));
      },
      lanes: () => [SCOUT_STORYBOARD_LANE],
      async launch(ctx, id, item) {
        const r = await storyboardAct(ctx, id, item.payload);
        failedUnless(r.outcome);
        return first(r.jobIds);
      },
    },
    ideas: {
      parse: async (p) => parsed(parseIdeas(p)),
      lanes: () => [SCOUT_IDEAS_LANE],
      async launch(ctx, id, item) {
        const r = await ideasAct(ctx, id, item.payload);
        failedUnless(r.outcome);
        const jobId = r.jobId ?? r.reelsJobId;
        return jobId === undefined ? {} : { jobId };
      },
    },
    extract: {
      parse: async (p) => parsed(parseAt("extract", extractSchema, p)),
      lanes: () => [extractProducer().lane],
      async launch(ctx, id, item) {
        const p = extractSchema.parse(item.payload);
        const r = await styleAct(ctx, id, p.sources, p.slug, p.use, p.seed);
        failedUnless(r.outcome, r.candidate.status === "failed" ? (r.candidate.error ?? `${r.candidate.id} failed`) : undefined);
        return r.candidate.jobId === undefined ? {} : { jobId: r.candidate.jobId };
      },
    },
    scenes: {
      parse: async (p) => parsed(parseAt("scene", sceneSchema, p)),
      lanes: () => [...new Set([sceneLane(true), sceneLane(false)])],
      async launch(ctx, id, item) {
        const p = sceneSchema.parse(item.payload);
        const r = await sceneAct(ctx, id, p.source, p.frames, p.use, p.seed);
        failedUnless(r.outcome, r.candidate.status === "failed" ? (r.candidate.error ?? `${r.candidate.id} failed`) : undefined);
        return r.candidate.jobId === undefined ? {} : { jobId: r.candidate.jobId };
      },
    },
    assets: {
      async parse(p) {
        const from = await briefFromIdea(p);
        if (!from.ok) return from;
        return parsed(parseBrief(from.value.brief));
      },
      lanes: () => [SCOUT_ASSET_LANE],
      async launch(ctx, id, item) {
        const from = await briefFromIdea(item.payload);
        if (!from.ok) throw new Error(from.error.message);
        const { brief, ...idea } = from.value;
        const origin = await originWith(idea, undefined);
        if (!origin.ok) throw new Error(origin.error.message);
        const r = await assetAct(ctx, id, brief);
        if (origin.value.fromIdea !== undefined || origin.value.fromSeed !== undefined) await markOrigin(id, r.candidate.id, origin.value);
        failedUnless(r.outcome, r.candidate.status === "failed" ? (r.candidate.error ?? `${r.candidate.id} failed`) : undefined);
        return r.candidate.jobId === undefined ? {} : { jobId: r.candidate.jobId };
      },
    },
    sheets: {
      parse: async (p) => parsed(parseAt("sheet", sheetSchema, p)),
      lanes: () => [SCOUT_SHEET_LANE],
      async launch(ctx, id, item) {
        const r = await sheetAct(ctx, id, sheetSchema.parse(item.payload));
        failedUnless(r.outcome);
        return first(r.jobIds);
      },
    },
    reels: {
      // The reel door's own parser (./reelDoor.ts); whether the idea is kept is the act's, at launch.
      parse: async (p) => parsed(parseReelAsks(p)),
      lanes: () => [SCOUT_REELS_LANE],
      async launch(ctx, id, item) {
        const r = await reelAct(ctx, id, item.payload);
        failedUnless(r.outcome);
        return first(r.jobIds);
      },
    },
    draft: {
      parse: async (p) => parsed(draftOf(p)),
      lanes: () => [DRAFT_LANE],
      async launch(ctx, id, item) {
        const d = draftOf(item.payload);
        if (!d.ok) throw new Error(d.error.message);
        await writeDraft(id, item.id, d.value, { ...(o.draftText === undefined ? {} : { text: o.draftText }), ...(o.signal === undefined ? {} : { signal: o.signal }), now: ctx.now?.() ?? new Date() });
        return {};
      },
    },
  };
}
