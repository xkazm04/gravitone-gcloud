import "server-only";

// THE SEAM: which BoardPort the Board's Server Actions answer from. ONE switch, `SIDE`.
//
// Wave A (L21) built the desks against the fixture (./fixture.ts); wave C (L24) wrote the real
// side (./real.ts: the kernel's decision driver plus each source's v1 adapter, the apply
// outbox kicked after every commit) and flipped SIDE. Nothing else in the Board changed: the
// actions (./actions.ts), the keepalive route and the desks all reach the port through
// `serverBoard()`. SIDE is a constant, not GRAVITONE_PRODUCE_SIDE as the other studio ports
// read it, so the fixture lane's server answers the Board from the real kernel too, and
// ./fixture.ts is reached by nothing at run time: no kit specimen, test or route imports it
// (the kit draws its own packets, ../../kit/boardKitData.ts).
//
// The server side speaks the domain's `Result<T>` (COMMON: "Server Actions, each returning
// Result<T>"); ./actions.ts turns it into the wire envelope the client's BoardPort reads. Each
// verb also takes who is acting, which the browser's port never names: the action core
// resolved it from the session, and the ledger records it on the decision.

import type { Result } from "@gt/domain/errors";
import type { BoardPort, PortResult } from "@gt/ui/board/port";

import { kernel } from "../../../../lib/kernelStore.ts";
import { kickApply } from "../../../../lib/decision/v1/applier.ts";
import { liveRead } from "../../_shell/live.ts";
import { fixtureBoard } from "./fixture.ts";
import { makeRealBoard, type Who } from "./real.ts";

type Value<R> = R extends Promise<PortResult<infer T>> ? T : never;

/** The BoardPort, server side: the same verbs, answering in the domain's Result, told who acts. */
export type ServerBoard = {
  readonly [K in keyof BoardPort]: (...args: [...Parameters<BoardPort[K]>, Who?]) => Promise<Result<Value<ReturnType<BoardPort[K]>>>>;
};

export const SIDE: "fixture" | "real" = "real";

const real: ServerBoard = makeRealBoard({
  store: () => {
    const k = kernel();
    return k.ok ? { ok: true, value: k.value.store } : k;
  },
  // The request's one liveNow(), shared with the header and the Floor (../../_shell/live.ts).
  weir: async () => (await liveRead()).weir,
  kick: (store, packetId) => kickApply(store, packetId),
});

export function serverBoard(): ServerBoard {
  return SIDE === "fixture" ? fixtureBoard() : real;
}
