"use server";

// LOCAL BAND SERVER ACTIONS — $0 receipt door, render a local ScoreSpec ($0, up to 8 stems), swap /
// remix / rewrite one track by its id (reusing every other stem bit-for-bit), audition a catalog
// instrument, and promote to Arrange. Stage S2 (spark audio-agent-studio) added the track verbs
// (lib/sound/localScoreVerbs.ts) the studio's "keep this mix" and the MCP ops are written against.

import { z } from "zod";

import { fxChainSchema } from "@gt/domain/audio.fx";
import { SCORE_ROLES, TRACK_ID_RE, scoreNoteSchema, scoreTrackSchema } from "@gt/domain/audio.score";
import { ok, type Result } from "@gt/domain/errors";
import type { Receipt } from "@gt/domain/produce";
import { ceilingUsdSchema, receiptModeSchema } from "@gt/domain/produce.schema";
import type { LocalAuditionState, LocalTakeView } from "@gt/ui/components/audio/localBand.ts";

import { action } from "../../../_server/action.ts";
import type { ActionResult } from "../../../_server/actionCore.ts";
import {
  auditionLocalInstrument,
  buildLocalScoreReceipt,
  promoteLocalTakeToArrange,
  renderLocalScore,
  swapLocalTakeStem,
} from "../../../../lib/sound/localScore.ts";
import { mixLocalTake, rewriteLocalStem } from "../../../../lib/sound/localScoreVerbs.ts";
import { toLocalTakeView } from "./localRead.ts";

const receiptInputSchema = z.object({
  spec: z.unknown(),
  mode: receiptModeSchema.optional(),
  ceilingUsd: ceilingUsdSchema.optional(),
});

const localScoreReceiptAction = action(
  "audio local score receipt",
  receiptInputSchema,
  async (i): Promise<Result<Receipt>> => {
    return buildLocalScoreReceipt(i.spec, {
      ...(i.mode === undefined ? {} : { mode: i.mode }),
      ...(i.ceilingUsd === undefined ? {} : { ceilingUsd: i.ceilingUsd }),
    });
  },
);

const renderInputSchema = z.object({
  spec: z.unknown(),
});

const renderLocalScoreAction = action(
  "audio render local score",
  renderInputSchema,
  async (i): Promise<Result<LocalTakeView>> => {
    const r = await renderLocalScore(i.spec, { verifyDeterminism: true });
    if (!r.ok) return r;
    return ok(toLocalTakeView(r.value.take, r.value.plan));
  },
);

const trackIdSchema = z.string().regex(TRACK_ID_RE);
const takeIdSchema = z.string().trim().min(1).max(80);
const trackFields = scoreTrackSchema.shape;

/** A stem swap names its track by id (`track`), or - a one-per-role take - by `role`. */
const swapInputSchema = z
  .object({
    takeId: takeIdSchema,
    track: trackIdSchema.optional(),
    role: z.enum(SCORE_ROLES).optional(),
    instrumentId: z.string().trim().min(1).max(80),
    gainDb: trackFields.gainDb,
    pan: trackFields.pan,
    muted: z.boolean().optional(),
    solo: z.boolean().optional(),
    fx: fxChainSchema.optional(),
  })
  .refine((i) => i.track !== undefined || i.role !== undefined, { message: "name the track (or its role)", path: ["track"] });

const swapLocalStemAction = action(
  "audio swap local stem",
  swapInputSchema,
  async (i): Promise<Result<LocalTakeView>> => {
    const r = await swapLocalTakeStem({
      takeId: i.takeId,
      ...(i.track === undefined ? {} : { track: i.track }),
      ...(i.role === undefined ? {} : { role: i.role }),
      instrumentId: i.instrumentId,
      ...(i.gainDb === undefined ? {} : { gainDb: i.gainDb }),
      ...(i.pan === undefined ? {} : { pan: i.pan }),
      ...(i.muted === undefined ? {} : { muted: i.muted }),
      ...(i.solo === undefined ? {} : { solo: i.solo }),
      ...(i.fx === undefined ? {} : { fx: i.fx }),
    });
    if (!r.ok) return r;
    return ok(toLocalTakeView(r.value.take, r.value.plan));
  },
);

/** "Keep this mix": level / pan / mute / solo by track id re-render nothing; `enters` re-renders that track. */
const mixInputSchema = z.object({
  takeId: takeIdSchema,
  tracks: z.record(
    trackIdSchema,
    z.strictObject({ gainDb: trackFields.gainDb, pan: trackFields.pan, muted: z.boolean().optional(), solo: z.boolean().optional(), enters: trackFields.enters }),
  ),
});

const mixLocalTakeAction = action(
  "audio mix local take",
  mixInputSchema,
  async (i): Promise<Result<LocalTakeView>> => {
    const tracks = Object.fromEntries(
      Object.entries(i.tracks).flatMap(([id, c]) => (c === undefined ? [] : [[
        id,
        {
          ...(c.gainDb === undefined ? {} : { gainDb: c.gainDb }),
          ...(c.pan === undefined ? {} : { pan: c.pan }),
          ...(c.muted === undefined ? {} : { muted: c.muted }),
          ...(c.solo === undefined ? {} : { solo: c.solo }),
          ...(c.enters === undefined ? {} : { enters: c.enters }),
        },
      ]])),
    );
    const r = await mixLocalTake({ takeId: i.takeId, tracks });
    if (!r.ok) return r;
    return ok(toLocalTakeView(r.value.take, r.value.plan));
  },
);

/** Rewrite one track's notes (or its pattern); every other stem is reused bit-exact. */
const rewriteInputSchema = z.union([
  z.strictObject({ takeId: takeIdSchema, track: trackIdSchema, notes: z.array(scoreNoteSchema).min(1).max(512) }),
  z.strictObject({ takeId: takeIdSchema, track: trackIdSchema, pattern: z.string().trim().min(1).max(40) }),
]);

const rewriteLocalStemAction = action(
  "audio rewrite local stem",
  rewriteInputSchema,
  async (i): Promise<Result<LocalTakeView>> => {
    const r = await rewriteLocalStem("notes" in i ? { takeId: i.takeId, track: i.track, notes: i.notes } : { takeId: i.takeId, track: i.track, pattern: i.pattern });
    if (!r.ok) return r;
    return ok(toLocalTakeView(r.value.take, r.value.plan));
  },
);

const auditionInputSchema = z.object({
  instrumentId: z.string().trim().min(1).max(80),
});

const auditionLocalInstrumentAction = action(
  "audio audition local instrument",
  auditionInputSchema,
  async (i): Promise<Result<LocalAuditionState>> => {
    const r = await auditionLocalInstrument(i.instrumentId);
    if (!r.ok) return r;
    return ok({
      instrumentId: r.value.instrumentId,
      name: r.value.name,
      audioUrl: r.value.audioUrl,
      lufs: r.value.audition.lufsAtVel100,
      truePeakDb: r.value.audition.truePeakDb,
      renderMs: r.value.audition.renderMs,
    });
  },
);

const promoteInputSchema = z.object({
  takeId: z.string().trim().min(1).max(80),
});

const promoteLocalTakeAction = action(
  "audio promote local take",
  promoteInputSchema,
  async (i): Promise<Result<{ readonly takeId: string; readonly stage: string | null }>> => {
    const r = await promoteLocalTakeToArrange({
      takeId: i.takeId,
      finalize: true,
    });
    if (!r.ok) return r;
    return ok({ takeId: r.value.id, stage: r.value.stage });
  },
);

export async function localScoreReceiptAct(input: z.input<typeof receiptInputSchema>): Promise<ActionResult<Receipt>> {
  return localScoreReceiptAction(input);
}

export async function renderLocalScoreAct(input: z.input<typeof renderInputSchema>): Promise<ActionResult<LocalTakeView>> {
  return renderLocalScoreAction(input);
}

export async function swapLocalStemAct(input: z.input<typeof swapInputSchema>): Promise<ActionResult<LocalTakeView>> {
  return swapLocalStemAction(input);
}

export async function mixLocalTakeAct(input: z.input<typeof mixInputSchema>): Promise<ActionResult<LocalTakeView>> {
  return mixLocalTakeAction(input);
}

export async function rewriteLocalStemAct(input: z.input<typeof rewriteInputSchema>): Promise<ActionResult<LocalTakeView>> {
  return rewriteLocalStemAction(input);
}

export async function auditionLocalInstrumentAct(input: z.input<typeof auditionInputSchema>): Promise<ActionResult<LocalAuditionState>> {
  return auditionLocalInstrumentAction(input);
}

export async function promoteLocalTakeAct(input: z.input<typeof promoteInputSchema>): Promise<ActionResult<{ readonly takeId: string; readonly stage: string | null }>> {
  return promoteLocalTakeAction(input);
}
