"use server";

// LOCAL BAND SERVER ACTIONS — render 4-stem local ScoreSpec ($0), swap a single stem in ~1s
// (reusing the other 3 stems bit-for-bit), audition a catalog instrument, and promote to Arrange.

import { z } from "zod";

import { SCORE_ROLES } from "@gt/domain/audio.score";
import { ok, type Result } from "@gt/domain/errors";
import type { LocalAuditionState, LocalTakeView } from "@gt/ui/components/audio/localBand.ts";

import { action } from "../../../_server/action.ts";
import type { ActionResult } from "../../../_server/actionCore.ts";
import {
  auditionLocalInstrument,
  promoteLocalTakeToArrange,
  renderLocalScore,
  swapLocalTakeStem,
} from "../../../../lib/sound/localScore.ts";
import { toLocalTakeView } from "./localRead.ts";

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

const swapInputSchema = z.object({
  takeId: z.string().trim().min(1).max(80),
  role: z.enum(SCORE_ROLES),
  instrumentId: z.string().trim().min(1).max(80),
});

const swapLocalStemAction = action(
  "audio swap local stem",
  swapInputSchema,
  async (i): Promise<Result<LocalTakeView>> => {
    const r = await swapLocalTakeStem({
      takeId: i.takeId,
      role: i.role,
      instrumentId: i.instrumentId,
    });
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
      group: "electronic",
      finalize: true,
    });
    if (!r.ok) return r;
    return ok({ takeId: r.value.id, stage: r.value.stage });
  },
);

export async function renderLocalScoreAct(input: z.input<typeof renderInputSchema>): Promise<ActionResult<LocalTakeView>> {
  return renderLocalScoreAction(input);
}

export async function swapLocalStemAct(input: z.input<typeof swapInputSchema>): Promise<ActionResult<LocalTakeView>> {
  return swapLocalStemAction(input);
}

export async function auditionLocalInstrumentAct(input: z.input<typeof auditionInputSchema>): Promise<ActionResult<LocalAuditionState>> {
  return auditionLocalInstrumentAction(input);
}

export async function promoteLocalTakeAct(input: z.input<typeof promoteInputSchema>): Promise<ActionResult<{ readonly takeId: string; readonly stage: string | null }>> {
  return promoteLocalTakeAction(input);
}
