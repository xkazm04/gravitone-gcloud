"use server";

// THE COVER'S ACTS - a cover priced then launched, its brief priced then queued, a winner picked and exported, the back-filled styles saved -
// as Server Actions through the one action core (app/_server/action.ts: who, the input door, the body, the
// envelope; `money` key use, because an action mutates). The bodies are ./actsCore.ts's; this file binds the
// kernel, the actor and GRAVITONE_DRY_ONLY.
//
// A LAUNCH IS A RECEIPT, THEN A CONFIRM (lib/producers/cover.ts, on scoutSheet's shape): no token answers the
// $0 receipt and queues nothing; the receipt's token queues the one job, `job:cover:<id>`, for the worker.
//
// The answer is the action core's envelope (./contract.ts CoverActs): an Error does not survive the action boundary.
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import type { Result } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { briefCoverBody, briefInput, launchCoverBody, launchInput, pickCoverBody, pickInput, saveCoverStylesBody, stylesInput } from "./actsCore.ts";
import type { CoverLaunch, CoverPlan } from "./contract.ts";

const launchAction = action("audio cover launch", launchInput, async (i, who): Promise<Result<CoverLaunch>> => {
  const k = kernel();
  if (!k.ok) return k;
  return launchCoverBody(i, k.value.store, actorOf(who), dryOnlyFrom(process.env));
});
const briefAction = action("audio cover brief", briefInput, async (i, who): Promise<Result<CoverLaunch>> => {
  const k = kernel();
  if (!k.ok) return k;
  return briefCoverBody(i, k.value.store, actorOf(who), dryOnlyFrom(process.env));
});
const pickAction = action("audio cover pick", pickInput, async (i) => pickCoverBody(i));
const stylesAction = action("audio cover styles", stylesInput, async (i) => saveCoverStylesBody(i));


export async function launchCoverAct(plan: CoverPlan, token?: string): Promise<ActionResult<CoverLaunch>> {
  return launchAction({ plan, ...(token === undefined ? {} : { token }) });
}
export async function briefCoverAct(id: string, token?: string): Promise<ActionResult<CoverLaunch>> {
  return briefAction({ id, ...(token === undefined ? {} : { token }) });
}
export async function pickCoverAct(id: string, seed: number): Promise<ActionResult<{ readonly winnerUrl: string }>> {
  return pickAction({ id, seed });
}
export async function saveCoverStylesAct(id: string, styles: { readonly sourceStyle?: string; readonly remixStyle?: string }): Promise<ActionResult<void>> {
  return stylesAction({ id, styles });
}
