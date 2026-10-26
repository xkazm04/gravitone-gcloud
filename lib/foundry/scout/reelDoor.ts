import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { EPISODE_ID_RE } from "@gt/domain/channel";
import { reelApproachSchema, reelBriefSchema, type ReelApproachIn, type ReelBriefIn } from "@gt/producers/scout-reels/define";

import { IDEA_REF_RE } from "./direction";
import { sourceLine } from "./reelTaste";
import { MAX_REEL_CAP, QUOTE_MAX, REEL_SOURCE_KINDS, type ReelSource } from "./types";

// THE REEL DOORS, PURE (spark scout-vision S5) - what `scout reel` and `scout reel-cut` take, validated before anything
// is read or written, and the briefs ./reel.ts writes for the author turn.
//
// A SOURCE IS WHERE THE NUMBERS CAME FROM, NOT A DATASET. The operator, 2026-10-26: "Do not stick with public datasets,
// we often need one wiki table, an article, or derived data from 'what if' fantasy scenarios. We are not doing academic
// research but entertaining video content with educative flavor." So a source is one of three kinds and nothing asks it
// to be public, complete or official:
//
//   table    a page holding the numbers (a wiki table): its https url.
//   article  a page that states them: its https url and its words, verbatim (<= 400) - the claim the numbers stand on.
//   what-if  a premise played out (<= 400), labelled fiction on screen; a url is optional (what it was derived from).
//
// THE BRIEF the author turn reads is the kept idea's own shape - case, title, hook, unit, kind, steps - with its numbers
// replaced whole by the real `data` (REEL.md: the strip-data block is replaced whole), `illustrative` gone and `source`
// in its place: `source.name` is the on-screen source line verbatim (./reelTaste.ts sourceLine), `cut` the beats the 8 s
// strip keeps. A cut's brief is the kept reel's, with `frames` (seconds * 30) and `seconds`.

/** A reel's JSON is held under this, as a night's stats brief is (./idea.ts REEL_JSON_MAX). */
export const REAL_DATA_MAX = 60_000;
export const SOURCE_TITLE_MAX = 200;
export const PREMISE_TEXT_MAX = 400;
export const CUT_BEATS_MAX = 12;
export const CUT_BEAT_MAX = 200;
/** A full cut: 30 s to 2 min. */
export const REEL_CUT_SECONDS = { min: 30, max: 120 } as const;
export const STRIP_FPS_OF_CUT = 30;

const text = (max: number) => z.string().trim().min(1).max(max);
const https = z
  .string()
  .trim()
  .max(2000)
  .refine((u) => {
    try {
      return new URL(u).protocol === "https:";
    } catch {
      return false;
    }
  }, "an https url");

export const reelSourceSchema = z
  .object({ kind: z.enum(REEL_SOURCE_KINDS), title: text(SOURCE_TITLE_MAX), url: https.optional(), quote: text(QUOTE_MAX).optional(), premise: text(PREMISE_TEXT_MAX).optional() })
  .strict()
  .superRefine((s, ctx) => {
    if (s.kind !== "what-if" && s.url === undefined) ctx.addIssue({ code: "custom", path: ["url"], message: `a ${s.kind} is cited by its https page` });
    if (s.kind === "article" && s.quote === undefined) ctx.addIssue({ code: "custom", path: ["quote"], message: "an article is cited by its words, verbatim (<= 400)" });
    if (s.kind === "what-if" && s.premise === undefined) ctx.addIssue({ code: "custom", path: ["premise"], message: "a what-if states its premise (<= 400); it is labelled fiction on screen" });
  });

export const parseReelSource = (raw: unknown): Result<ReelSource> => parseAt("reel source", reelSourceSchema, raw);

const reelAskSchema = z
  .object({
    fromIdea: z.string().trim().regex(IDEA_REF_RE, "a kept stats idea's <night>/<c-id>"),
    source: reelSourceSchema,
    data: z.unknown().refine((v) => v !== undefined && v !== null, { message: "the real numbers, in the kept idea's brief shape" }),
    cut: z.array(text(CUT_BEAT_MAX)).min(1, "the beats the 8 s strip keeps: at least one").max(CUT_BEATS_MAX),
  })
  .strict()
  .refine((a) => Buffer.byteLength(JSON.stringify(a.data), "utf8") <= REAL_DATA_MAX, { message: `a reel's data is at most ${REAL_DATA_MAX / 1000} KB of JSON`, path: ["data"] });

/** A kept stats idea on real data: the idea lends its brief's shape and its approach. */
export type IdeaReelAsk = { readonly fromIdea: string; readonly source: ReelSource; readonly data: unknown; readonly cut: readonly string[] };

// A CHANNEL EPISODE ON REAL DATA (spark project-baseline): an episode has no kept idea to inherit from, so the ask
// carries what the idea would have lent - the brief's shape {case, title, hook, unit, kind, steps?} and the approach the
// seat writes - and both are held here to the reels producer's own schemas (reelBriefSchema, reelApproachSchema): the
// brief is composed real (its numbers `data`, its source line, its cut) and must pass whole.
const episodeAskSchema = z
  .object({
    fromEpisode: z.string().trim().regex(EPISODE_ID_RE, "a channel episode's id (D1-04)"),
    brief: z.object({ case: z.unknown(), title: z.unknown(), hook: z.unknown(), unit: z.unknown(), kind: z.unknown(), steps: z.unknown().optional() }).strict(),
    approach: z.unknown(),
    source: reelSourceSchema,
    data: z.unknown().refine((v) => v !== undefined && v !== null, { message: "the real numbers, in the brief's shape" }),
    cut: z.array(text(CUT_BEAT_MAX)).min(1, "the beats the 8 s strip keeps: at least one").max(CUT_BEATS_MAX),
  })
  .strict()
  .refine((a) => Buffer.byteLength(JSON.stringify(a.data), "utf8") <= REAL_DATA_MAX, { message: `a reel's data is at most ${REAL_DATA_MAX / 1000} KB of JSON`, path: ["data"] });

/** A channel episode on real data: its brief already real, its approach the seat's. */
export type EpisodeReelAsk = { readonly fromEpisode: string; readonly brief: ReelBriefIn; readonly approach: ReelApproachIn; readonly source: ReelSource; readonly data: unknown; readonly cut: readonly string[] };

export type ReelAsk = IdeaReelAsk | EpisodeReelAsk;

/** What an ask makes: `<night>/<c-id>` of its idea, or its episode's id. */
export const askRef = (a: ReelAsk): string => ("fromEpisode" in a ? a.fromEpisode : a.fromIdea);

function episodeAsk(at: string, x: unknown): Result<EpisodeReelAsk> {
  const p = parseAt(at, episodeAskSchema, x);
  if (!p.ok) return p;
  const source = p.value.source as ReelSource;
  const brief = parseAt(`${at}: brief`, reelBriefSchema, { ...p.value.brief, data: p.value.data, source: briefSource(source), cut: p.value.cut });
  if (!brief.ok) return brief;
  const approach = parseAt(`${at}: approach`, reelApproachSchema, p.value.approach);
  if (!approach.ok) return approach;
  return ok({ fromEpisode: p.value.fromEpisode, brief: brief.value, approach: approach.value, source, data: p.value.data, cut: p.value.cut });
}

/**
 * `[{fromIdea, source, data, cut} | {fromEpisode, brief, approach, source, data, cut}]`: the batch, or the first bad
 * entry's place and why. One idea, or one episode, at most once.
 */
export function parseReelAsks(raw: unknown): Result<ReelAsk[]> {
  if (!Array.isArray(raw) || raw.length === 0) return err("invalid", "reel: the input is a JSON array of [{fromIdea | fromEpisode, brief? (an episode's), approach? (an episode's), source: {kind: table|article|what-if, title, url?, quote?, premise?}, data, cut}]");
  if (raw.length > MAX_REEL_CAP) return err("invalid", `reel: at most ${MAX_REEL_CAP} reels a batch, got ${raw.length}`);
  const out: ReelAsk[] = [];
  for (const [i, x] of raw.entries()) {
    const at = `reel ${i + 1}`;
    const named = typeof x === "object" && x !== null ? x : {};
    if (("fromIdea" in named) === ("fromEpisode" in named)) return err("invalid", `${at}: an ask names exactly one of fromIdea (a kept stats idea) and fromEpisode (a reel channel's episode)`);
    let ask: ReelAsk;
    if ("fromEpisode" in named) {
      const e = episodeAsk(at, x);
      if (!e.ok) return e;
      ask = e.value;
    } else {
      const p = parseAt(at, reelAskSchema, x);
      if (!p.ok) return p;
      ask = { fromIdea: p.value.fromIdea, source: p.value.source as ReelSource, data: p.value.data, cut: p.value.cut };
    }
    if (out.some((o) => askRef(o) === askRef(ask))) return err("invalid", `${at}: ${askRef(ask)} is already in this batch`);
    out.push(ask);
  }
  return ok(out);
}

const cutAskSchema = z
  .object({
    fromReel: z.string().trim().regex(IDEA_REF_RE, "a kept reel's <night>/<c-id>"),
    seconds: z.number().int().min(REEL_CUT_SECONDS.min).max(REEL_CUT_SECONDS.max),
  })
  .strict();

export type CutAsk = { readonly fromReel: string; readonly seconds: number };

/** `[{fromReel, seconds}]`: the batch, or the first bad entry's place and why. One reel at most once. */
export function parseCutAsks(raw: unknown): Result<CutAsk[]> {
  if (!Array.isArray(raw) || raw.length === 0) return err("invalid", `reel-cut: the input is a JSON array of [{fromReel: <night>/<c-id>, seconds: ${REEL_CUT_SECONDS.min}-${REEL_CUT_SECONDS.max}}]`);
  if (raw.length > MAX_REEL_CAP) return err("invalid", `reel-cut: at most ${MAX_REEL_CAP} cuts a batch, got ${raw.length}`);
  const out: CutAsk[] = [];
  for (const [i, x] of raw.entries()) {
    const p = parseAt(`cut ${i + 1}`, cutAskSchema, x);
    if (!p.ok) return p;
    if (out.some((o) => o.fromReel === p.value.fromReel)) return err("invalid", `cut ${i + 1}: ${p.value.fromReel} is already in this batch`);
    out.push(p.value);
  }
  return ok(out);
}

/** The source as the brief carries it: its kind, the on-screen line verbatim, and what cites it. */
export function briefSource(s: ReelSource): NonNullable<ReelBriefIn["source"]> {
  return { kind: s.kind, name: sourceLine(s), ...(s.url === undefined ? {} : { url: s.url }), ...(s.quote === undefined ? {} : { quote: s.quote }), ...(s.premise === undefined ? {} : { premise: s.premise }) };
}

/** The real brief: the kept idea's shape, its numbers replaced whole, its source line and its cut. */
export function realBrief(idea: ReelBriefIn, ask: Pick<IdeaReelAsk, "source" | "data" | "cut">): ReelBriefIn {
  const { illustrative: _i, data: _d, source: _s, cut: _c, frames: _f, seconds: _x, ...shape } = idea;
  return { ...shape, data: ask.data as ReelBriefIn["data"], source: briefSource(ask.source), cut: [...ask.cut] };
}

/** A full cut's brief: the kept reel's real brief, at `seconds` * 30 frames. */
export function cutBrief(reel: ReelBriefIn, seconds: number): ReelBriefIn {
  return { ...reel, frames: seconds * STRIP_FPS_OF_CUT, seconds };
}
