import "server-only";

import { z } from "zod";

import { coverSunoFileSchema, coverSunoPlanSchema } from "@gt/domain/cover.suno.schema";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Store } from "@gt/kernel/store";

import { launchCoverSuno } from "../../../../lib/producers/coverSuno.ts";
import { fileSunoTake, type FileSunoDeps } from "../../../../lib/sound/cover/suno.ts";
import type { CoverSunoFiled, CoverSunoLaunch } from "./contract.ts";

// A COVER'S SUNO ACTS, BODIES (spark suno-covers): what ./sunoActs.ts's Server Actions run once the action core has
// resolved who and held the input to the schemas below. Pure over the kernel store, the actor and the download's
// dependencies, so the tests run them without a request. The send is lib/producers/coverSuno.ts's, the keep
// lib/sound/cover/suno.ts's; each refuses a cover that is not picked in its own words.

export const sendInput = z.strictObject({ plan: coverSunoPlanSchema, token: z.string().min(1).max(200).optional() });
export const fileInput = coverSunoFileSchema;

/** The winner to Suno: its receipt with no token, its job with the receipt's token. */
export function sendSunoBody(i: z.output<typeof sendInput>, store: Store, actor: Actor, dryOnly: boolean): Promise<Result<CoverSunoLaunch>> {
  return launchCoverSuno(store, i.plan, { actor, dryOnly, ...(i.token === undefined ? {} : { token: i.token }) });
}

/** One take kept: Suno's download quote, or (confirmed) the take filed as the cover's remix. */
export function fileSunoBody(i: z.output<typeof fileInput>, deps: FileSunoDeps): Promise<Result<CoverSunoFiled>> {
  return fileSunoTake({ id: i.id, send: i.send, take: i.take, ...(i.confirm === undefined ? {} : { confirm: i.confirm }) }, deps);
}
