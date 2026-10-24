// THE PAGEHIDE FLUSH's body (../[packet]/keepalive/route.ts is its door). Out of the route file
// so a test can drive it over a stand-in board: a Next route module may export only its verbs.
//
// The beacon's verdicts are the operator's as much as the patch action's, so the ledger names the
// same actor for both (hitl-approval decision-records: who decided is part of the record). Before
// this lived here the route dropped the principal its guard had resolved, and every verdict that
// left with a closing tab was recorded with no `who`, while the same verdict sent a moment
// earlier through the action carried the uid.
import type { Result } from "@gt/domain/errors";
import type { VerdictChange } from "@gt/ui/board/port";

import type { Principal } from "../../../../lib/principal.ts";
import { packetParam } from "./param.ts";
import type { ServerBoard } from "./port.ts";
import { actorOf } from "./real.ts";

export type KeepaliveContext = {
  readonly who: Principal | null;
  readonly input: { readonly changes: readonly VerdictChange[] };
  readonly params: Promise<Record<string, string | string[] | undefined>>;
};

/** Apply what the closing tab still held on the packet's CURRENT revision, as the principal who sent it. */
export async function flushKeepalive(board: ServerBoard, { who, input, params }: KeepaliveContext): Promise<Result<{ readonly rev: number }>> {
  const raw = (await params)["packet"];
  const id = packetParam(typeof raw === "string" ? raw : "");
  const actor = actorOf(who);
  const now = await board.loadPacket({ id }, actor);
  if (!now.ok) return now;
  return board.patch({ id, baseRev: now.value.view.rev, changes: input.changes }, actor);
}
