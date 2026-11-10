"use server";

// A COVER'S SUNO ACTS (spark suno-covers) - the winner sent to Suno (a receipt, then a confirm that queues
// `job:cover-suno:<id>:<n>`), and one take kept (Suno's download quote, then a confirm that spends the credit and
// files it as the remix). Server Actions through the one action core, as ./acts.ts's are; the bodies are
// lib/producers/coverSuno.ts and lib/sound/cover/suno.ts.
//
// WP0: the doors with their final signatures; WP1 binds the bodies.
import { err, type Result } from "@gt/domain/errors";
import { coverSunoFileSchema, coverSunoPlanSchema } from "@gt/domain/cover.suno.schema";
import { z } from "zod";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import type { CoverSunoFiled, CoverSunoLaunch, CoverSunoPlan, SunoCoverTakeN } from "./contract.ts";

const sendInput = z.strictObject({ plan: coverSunoPlanSchema, token: z.string().min(1).max(200).optional() });

const sendAction = action("audio cover suno send", sendInput, async (): Promise<Result<CoverSunoLaunch>> => err("unavailable", "suno covers: not built yet"));
const fileAction = action("audio cover suno file", coverSunoFileSchema, async (): Promise<Result<CoverSunoFiled>> => err("unavailable", "suno covers: not built yet"));

export async function sendSunoCoverAct(plan: CoverSunoPlan, token?: string): Promise<ActionResult<CoverSunoLaunch>> {
  return sendAction({ plan, ...(token === undefined ? {} : { token }) });
}
export async function fileSunoCoverAct(i: { readonly id: string; readonly send: number; readonly take: SunoCoverTakeN; readonly confirm?: boolean }): Promise<ActionResult<CoverSunoFiled>> {
  return fileAction(i);
}
