"use server";

// THE RELEASE ACTS (spark studio-to-release): the operator's writes to a stored release, as Server Actions through the
// one action core (app/_server/action.ts: who, the input door, the body, the envelope; `money` key use, because an act
// mutates). The bodies and their doors are ./actsCore.ts's; the store is lib/release/store.ts - one transaction per
// act, the version checked (compare-and-swap), one `release.*` event per act, carrying the operator as the actor.
//
// The answer is the action core's envelope (./act.ts ReleaseAnswer): an Error does not survive the action boundary,
// and a stale write is an answer (`stale: true` with the stored record), not an error.
import type { ActionResult } from "../../../_server/actionCore.ts";
import { action } from "../../../_server/action.ts";
import { actorOf } from "../../../../lib/principal.ts";
import type { ReleaseAct, ReleaseOutcome } from "./act.ts";
import { applyBody, applyInput, createBody, createInput, releaseThisBody, releaseThisInput } from "./actsCore.ts";

const releaseThisAction = action("audio release this", releaseThisInput, (i, who) => releaseThisBody(i, actorOf(who)));
const createAction = action("audio release create", createInput, (i, who) => createBody(i, actorOf(who)));
const applyAction = action("audio release apply", applyInput, (i, who) => applyBody(i, actorOf(who)));

export async function releaseThisAct(input: { readonly takeId: string; readonly sessionId: string | null; readonly token?: string }): Promise<ActionResult<ReleaseOutcome>> {
  return releaseThisAction(input);
}

export async function createReleaseAct(input: { readonly takeIds: readonly string[]; readonly token?: string }): Promise<ActionResult<ReleaseOutcome>> {
  return createAction(input);
}

export async function applyReleaseAct(input: { readonly id: string; readonly version: number; readonly act: ReleaseAct; readonly token?: string }): Promise<ActionResult<ReleaseOutcome>> {
  return applyAction(input);
}
