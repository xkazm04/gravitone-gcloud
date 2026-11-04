import "server-only";

import type { LabDecision } from "@gt/domain/audio.yue2.lab";
import type { Actor } from "@gt/domain/event";
import { err, type Result } from "@gt/domain/errors";
import type { Store } from "@gt/kernel/store";

// KEEP / DROP OF THE AGENT'S PROPOSALS (spark yue2-song-lab S2, WP0 stub -> WP-B). The taste chips'
// precedent: the agent only proposes; the owner's keep runs the act on the server and is recorded as
// `audio.lab.keep` (a drop as `audio.lab.drop`), both owner-only - no MCP op keeps or drops.
// launch -> lib/producers/yue2Jobs launchRender; post -> launchPost (one job per take); rule ->
// lib/yue2/draw reseed. A second keep of one proposal is a conflict; a kept proposal cannot be dropped.

export type DecisionState = "kept" | "dropped";

export async function keepProposal(store: Store, input: { readonly turnId: string; readonly proposalId: string }, actor: Actor): Promise<Result<LabDecision>> {
  void store;
  void input;
  void actor;
  return err("unavailable", "yue2: proposals are not built yet (WP-B)");
}

export function dropProposal(store: Store, input: { readonly turnId: string; readonly proposalId: string }, actor: Actor): Result<LabDecision> {
  void store;
  void input;
  void actor;
  return err("unavailable", "yue2: proposals are not built yet (WP-B)");
}

/** Every proposal's decision so far, by proposal id. */
export function decisions(store: Store): Result<Readonly<Record<string, DecisionState>>> {
  void store;
  return err("unavailable", "yue2: proposals are not built yet (WP-B)");
}
