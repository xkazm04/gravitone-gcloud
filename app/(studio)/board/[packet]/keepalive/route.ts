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
import { flushKeepalive } from "../../_port/keepalive.ts";
import { serverBoard } from "../../_port/port.ts";
import { verdictChanges } from "../../_port/verdict.ts";

export const maxDuration = 10;

const input = z.object({
  rev: z.number().int().nonnegative(),
  changes: verdictChanges,
});

export const POST = route({ guard: "money", bodyCap: 256_000, maxDuration, input }, async (ctx) => flushKeepalive(serverBoard(), ctx));
