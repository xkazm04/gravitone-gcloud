import { z } from "zod";

import { parseAt, type Parsed } from "./door.ts";
import type { Result } from "./errors.ts";
import { YUE2_POST_STAGES, type Yue2PostStage } from "./audio.yue2.ts";
import { yue2ConditionSchema } from "./audio.yue2.schema.ts";

// THE SONG LAB'S JOB DOORS (spark yue2-song-lab WP3): what a launch of each of the three producers
// (`yue2-render`, `yue2-score`, `yue2-post`, lib/producers/yue2.ts) may ask, held once here and read
// by every caller - the Server Actions (app/(studio)/audio/_songlab/acts.ts), the agent door
// (app/_server/mcp/tools/songlab.ts) and the producer reading its job's request back off the ledger.
// A request is the launch input plus who asked (`by`); it rides an event beside the enqueue.

const id = z.string().min(1).max(80);
const words = (max: number) => z.string().trim().min(1).max(max);
const unique = <T>(xs: readonly T[]): boolean => new Set(xs).size === xs.length;

/** How many seeds one batch renders (one step each on gpu.local). */
export const YUE2_SEEDS_MAX = 16;
/** How many takes one score job reads. */
export const YUE2_SCORE_MAX = 64;
/** The blind window's length bounds, seconds. */
export const YUE2_WINDOW_RANGE = [5, 120] as const;

export const YUE2_ORIGINS = ["lab", "agent"] as const;
export const YUE2_POST_OPS = ["chain", "ab-window"] as const;
export type Yue2PostOp = (typeof YUE2_POST_OPS)[number];

const c = yue2ConditionSchema.shape;

const renderShape = {
  style: words(1000),
  lyrics: words(12000),
  seeds: z.array(c.seed).min(1).max(YUE2_SEEDS_MAX),
  cot: c.cot,
  cfg: c.cfg,
  adapter: c.adapter,
  adapterStrength: c.adapterStrength,
  origin: z.enum(YUE2_ORIGINS),
};
type RenderShape = { readonly seeds: readonly number[]; readonly adapter?: string | undefined; readonly adapterStrength?: number | undefined };
function renderRules(r: RenderShape, ctx: z.RefinementCtx): void {
  if (!unique(r.seeds)) ctx.addIssue({ code: "custom", path: ["seeds"], message: "a batch names each seed once" });
  if (r.adapterStrength !== undefined && r.adapter === undefined) ctx.addIssue({ code: "custom", path: ["adapterStrength"], message: "an adapter strength needs its adapter" });
}

const scoreShape = { takeIds: z.array(id).min(1).max(YUE2_SCORE_MAX) };
function scoreRules(r: { readonly takeIds: readonly string[] }, ctx: z.RefinementCtx): void {
  if (!unique(r.takeIds)) ctx.addIssue({ code: "custom", path: ["takeIds"], message: "a score job names each take once" });
}

const inOrder = (s: readonly Yue2PostStage[]): boolean => s.every((x, i) => i === 0 || YUE2_POST_STAGES.indexOf(s[i - 1]!) < YUE2_POST_STAGES.indexOf(x));

const postShape = {
  takeId: id,
  stages: z.array(z.enum(YUE2_POST_STAGES)).max(YUE2_POST_STAGES.length),
  referenceTakeId: id.optional(),
  op: z.enum(YUE2_POST_OPS).optional(),
  /** ab-window: the window's length in seconds (default AB_WINDOW_S), from the first vocal onset. */
  windowS: z.number().min(YUE2_WINDOW_RANGE[0]).max(YUE2_WINDOW_RANGE[1]).optional(),
  /** ab-window: the queued pair and the blind arm this take plays as. */
  pairId: z.string().regex(/^[0-9a-f]{16}$/).optional(),
  arm: z.enum(["a", "b"]).optional(),
  origin: z.enum(YUE2_ORIGINS).optional(),
};
type PostShape = {
  readonly takeId: string;
  readonly stages: readonly Yue2PostStage[];
  readonly referenceTakeId?: string | undefined;
  readonly op?: Yue2PostOp | undefined;
  readonly windowS?: number | undefined;
  readonly pairId?: string | undefined;
  readonly arm?: "a" | "b" | undefined;
};
function postRules(r: PostShape, ctx: z.RefinementCtx): void {
  const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
  if (!inOrder(r.stages)) issue("stages", `stages run once each, in the order ${YUE2_POST_STAGES.join(", ")}`);
  if ((r.op ?? "chain") === "chain") {
    if (r.stages.length === 0) issue("stages", "a post-chain names at least one stage");
    if (r.referenceTakeId !== undefined && !r.stages.includes("master")) issue("referenceTakeId", "a reference is matched only by the master stage");
    if (r.referenceTakeId === r.takeId) issue("referenceTakeId", "a take is not its own reference");
    if (r.pairId !== undefined || r.arm !== undefined || r.windowS !== undefined) issue("op", "pairId, arm and windowS belong to an ab-window");
  } else {
    if (r.pairId === undefined || r.arm === undefined) issue("pairId", "an ab-window names its pair and arm");
    if (r.stages.length > 0 || r.referenceTakeId !== undefined) issue("stages", "an ab-window runs no post stage and no reference");
  }
}

const by = { by: id };

export const yue2RenderInputSchema = z.strictObject(renderShape).superRefine(renderRules);
export const yue2ScoreInputSchema = z.strictObject(scoreShape).superRefine(scoreRules);
export const yue2PostInputSchema = z.strictObject(postShape).superRefine(postRules);
export const yue2RenderRequestSchema = z.strictObject({ ...renderShape, ...by }).superRefine(renderRules);
export const yue2ScoreRequestSchema = z.strictObject({ ...scoreShape, ...by }).superRefine(scoreRules);
export const yue2PostRequestSchema = z.strictObject({ ...postShape, ...by }).superRefine(postRules);

export type Yue2RenderInput = Parsed<z.output<typeof yue2RenderInputSchema>>;
export type Yue2ScoreInput = Parsed<z.output<typeof yue2ScoreInputSchema>>;
export type Yue2PostInput = Parsed<z.output<typeof yue2PostInputSchema>>;
export type Yue2RenderRequest = Yue2RenderInput & { readonly by: string };
export type Yue2ScoreRequest = Yue2ScoreInput & { readonly by: string };
export type Yue2PostRequest = Yue2PostInput & { readonly by: string };

export const parseYue2RenderInput = (raw: unknown): Result<Yue2RenderInput> => parseAt("yue2 render", yue2RenderInputSchema, raw) as Result<Yue2RenderInput>;
export const parseYue2ScoreInput = (raw: unknown): Result<Yue2ScoreInput> => parseAt("yue2 score", yue2ScoreInputSchema, raw) as Result<Yue2ScoreInput>;
export const parseYue2PostInput = (raw: unknown): Result<Yue2PostInput> => parseAt("yue2 post", yue2PostInputSchema, raw) as Result<Yue2PostInput>;
export const parseYue2RenderRequest = (raw: unknown): Result<Yue2RenderRequest> => parseAt("yue2 render request", yue2RenderRequestSchema, raw) as Result<Yue2RenderRequest>;
export const parseYue2ScoreRequest = (raw: unknown): Result<Yue2ScoreRequest> => parseAt("yue2 score request", yue2ScoreRequestSchema, raw) as Result<Yue2ScoreRequest>;
export const parseYue2PostRequest = (raw: unknown): Result<Yue2PostRequest> => parseAt("yue2 post request", yue2PostRequestSchema, raw) as Result<Yue2PostRequest>;
