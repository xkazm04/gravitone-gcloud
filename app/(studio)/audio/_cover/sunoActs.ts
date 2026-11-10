"use server";

// A COVER'S SUNO ACTS (spark suno-covers) - the winner sent to Suno (a receipt, then a confirm that queues
// `job:cover-suno:<id>:<n>`), and one take kept (Suno's download quote, then a confirm that spends the credit and
// files it as the remix). Server Actions through the one action core, as ./acts.ts's are; the bodies are
// lib/producers/coverSuno.ts and lib/sound/cover/suno.ts, run through ./sunoActsCore.ts.
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { err, type Result } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { storesDisagree } from "../../../../lib/sound/cover/reconcile.ts";
import { fileSunoDeps } from "../../../../lib/sound/cover/suno.ts";
import type { CoverSunoFiled, CoverSunoLaunch, CoverSunoPlan, SunoCoverTakeN } from "./contract.ts";
import { fileInput, fileSunoBody, sendInput, sendSunoBody } from "./sunoActsCore.ts";

const sendAction = action("audio cover suno send", sendInput, async (i, who): Promise<Result<CoverSunoLaunch>> => {
  const stores = storesDisagree(process.env);
  if (stores !== undefined) return err("refused", stores);
  const k = kernel();
  if (!k.ok) return k;
  return sendSunoBody(i, k.value.store, actorOf(who), dryOnlyFrom(process.env));
});
const fileAction = action("audio cover suno file", fileInput, async (i, who): Promise<Result<CoverSunoFiled>> => {
  const stores = storesDisagree(process.env);
  if (stores !== undefined) return err("refused", stores);
  return fileSunoBody(i, await fileSunoDeps(actorOf(who), dryOnlyFrom(process.env)));
});

export async function sendSunoCoverAct(plan: CoverSunoPlan, token?: string): Promise<ActionResult<CoverSunoLaunch>> {
  return sendAction({ plan, ...(token === undefined ? {} : { token }) });
}
export async function fileSunoCoverAct(i: { readonly id: string; readonly send: number; readonly take: SunoCoverTakeN; readonly confirm?: boolean }): Promise<ActionResult<CoverSunoFiled>> {
  return fileAction(i);
}
