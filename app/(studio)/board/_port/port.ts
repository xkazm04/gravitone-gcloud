import "server-only";

// THE SEAM: which BoardPort the Board's Server Actions answer from. ONE switch, `SIDE`.
//
// Wave A (L21) built the desks against the fixture below; wave C (L24) writes `real` - the
// kernel's decision driver plus each source's adapter (open from v1, consequence from v1's own
// planners, apply through the outbox) - and flips SIDE. Nothing else in the Board changes: the
// actions (./actions.ts), the keepalive route and the desks all reach the port through
// `serverBoard()`.
//
// The server side speaks the domain's `Result<T>` (COMMON: "Server Actions, each returning
// Result<T>"); ./actions.ts turns it into the wire envelope the client's BoardPort reads.

import { err, type Result } from "@gt/domain/errors";
import type { BoardPort, PortResult } from "@gt/ui/board/port";

import { fixtureBoard } from "./fixture.ts";

type Value<R> = R extends Promise<PortResult<infer T>> ? T : never;

/** The BoardPort, server side: the same verbs, answering in the domain's Result. */
export type ServerBoard = {
  readonly [K in keyof BoardPort]: (...args: Parameters<BoardPort[K]>) => Promise<Result<Value<ReturnType<BoardPort[K]>>>>;
};

export const SIDE: "fixture" | "real" = "fixture";

const unwritten = <T>(): Promise<Result<T>> => Promise.resolve(err("unavailable", "board: the kernel side of the Board port is not wired yet (Phase 3 wave C, L24)"));

/** L24 replaces this object, and only this object. */
const real: ServerBoard = {
  loadPacket: () => unwritten(),
  listPackets: () => unwritten(),
  patch: () => unwritten(),
  undo: () => unwritten(),
  pick: () => unwritten(),
  preview: () => unwritten(),
  commit: () => unwritten(),
  returnPacket: () => unwritten(),
};

export function serverBoard(): ServerBoard {
  return SIDE === "fixture" ? fixtureBoard() : real;
}
