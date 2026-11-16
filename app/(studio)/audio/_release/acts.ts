"use server";

// THE RELEASE ACTS (spark studio-to-release): the operator's writes to a stored release. STUBS with the final
// signatures (WP0); WP1 builds the bodies on the kernel `releases` module - each one an `action()` over a zod door,
// one transaction per act, the version checked (compare-and-swap), one `release.*` event per act.
import type { ActionResult } from "../../../_server/actionCore.ts";
import type { ReleaseAct, ReleaseOutcome } from "./act.ts";

const NOT_BUILT: ActionResult<ReleaseOutcome> = { ok: false, error: { error: "release acts are not built yet", code: "unavailable" } };

export async function releaseThisAct(_input: { readonly takeId: string; readonly sessionId: string | null; readonly token?: string }): Promise<ActionResult<ReleaseOutcome>> {
  return NOT_BUILT;
}

export async function createReleaseAct(_input: { readonly takeIds: readonly string[]; readonly token?: string }): Promise<ActionResult<ReleaseOutcome>> {
  return NOT_BUILT;
}

export async function applyReleaseAct(_input: { readonly id: string; readonly version: number; readonly act: ReleaseAct; readonly token?: string }): Promise<ActionResult<ReleaseOutcome>> {
  return NOT_BUILT;
}
