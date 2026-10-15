// POST /board/<packet>/keepalive - the gate's pagehide flush (@gt/ui/board/gate.ts
// `flushOnHide`). A Server Action cannot outlive the page that called it, and a closing tab is
// exactly when a debounced verdict is lost, so the Board sends what is still queued with
// navigator.sendBeacon here (v1 kept the same door: foundryClient.ts patchVerdictsKeepalive).
//
// It names only the keys that tab touched and applies them on the packet's CURRENT revision -
// v1's read-fresh-then-merge: another tab's decisions on other keys are never overwritten.
// The answer is for the record only; a beacon's sender is gone.

import { z } from "zod";

import { route } from "../../../../_server/route.ts";
import { packetParam } from "../../_port/param.ts";
import { serverBoard } from "../../_port/port.ts";

export const maxDuration = 10;

const input = z.object({
  rev: z.number().int().nonnegative(),
  changes: z
    .array(
      z.object({
        candidate: z.string().min(1).max(400),
        verdict: z.enum(["keep", "reject"]).nullable(),
        reasons: z.array(z.string().min(1).max(64)).max(11),
        note: z.string().min(1).max(2000).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const POST = route({ guard: "money", bodyCap: 256_000, maxDuration, input }, async ({ input: body, params }) => {
  const raw = (await params)["packet"];
  const id = packetParam(typeof raw === "string" ? raw : "");
  const board = serverBoard();
  const now = await board.loadPacket({ id });
  if (!now.ok) return now;
  return board.patch({ id, baseRev: now.value.view.rev, changes: body.changes });
});
