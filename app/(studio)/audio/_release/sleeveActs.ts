"use server";

// THE SLEEVE STEP'S ACTS (spark studio-to-release WP3): a run of sleeve takes launched (Codex: the press is the
// confirm; Leonardo: the press answers the receipt, the confirm carries its token), one sleeve job read back as
// candidates, and a release's newest run read back on load. Server Actions through the one action core; the bodies
// are lib/producers/releaseSleeve.ts's. The page imports this module lazily (a dynamic import from the step), so
// nothing here enters a client's first load. The fixture side never calls these: its takes act answers on the page.
import { z } from "zod";

import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { sleeveAskSchema, type SleeveLaunchAnswer, type SleeveTakesView } from "@gt/domain/release.sleeve";
import type { Result } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { actorOf } from "../../../../lib/principal.ts";
import { latestSleeveOf, launchSleeve, sleeveTakesOf } from "../../../../lib/producers/releaseSleeve.ts";

const launchInput = z.strictObject({ ask: sleeveAskSchema, token: z.string().min(1).max(200).optional() });
const readInput = z.strictObject({ jobId: z.string().min(1).max(200) });
const latestInput = z.strictObject({ releaseId: sleeveAskSchema.shape.releaseId });

const launchAction = action("release sleeve takes", launchInput, async (i, who): Promise<Result<SleeveLaunchAnswer>> => {
  const k = kernel();
  if (!k.ok) return k;
  return launchSleeve(k.value.store, i.ask, { actor: actorOf(who), dryOnly: dryOnlyFrom(process.env), ...(i.token === undefined ? {} : { token: i.token }) });
});
const readAction = action("release sleeve read", readInput, (i): Result<SleeveTakesView> => {
  const k = kernel();
  return k.ok ? sleeveTakesOf(k.value.store, i.jobId) : k;
});
const latestAction = action("release sleeve latest", latestInput, (i): Result<SleeveTakesView | null> => {
  const k = kernel();
  return k.ok ? latestSleeveOf(k.value.store, i.releaseId) : k;
});

export async function sleeveTakesAct(input: { readonly ask: { readonly releaseId: string; readonly prompt: string; readonly provider: "codex" | "leonardo"; readonly takes: number }; readonly token?: string }): Promise<ActionResult<SleeveLaunchAnswer>> {
  return launchAction(input);
}
export async function sleeveJobAct(input: { readonly jobId: string }): Promise<ActionResult<SleeveTakesView>> {
  return readAction(input);
}
export async function sleeveLatestAct(input: { readonly releaseId: string }): Promise<ActionResult<SleeveTakesView | null>> {
  return latestAction(input);
}
