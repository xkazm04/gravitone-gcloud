import "server-only";

import type { Result } from "@gt/domain/errors";

import type { PartPort } from "./contract.ts";
import { loadPart, opPart, undoPart } from "./fixture.ts";
import { realPart } from "./real.ts";
import { actReceipt, confirmAct } from "./fixtureActs.ts";

// THE SEAM: which part side the editors answer from. ONE switch, `SIDE`, the produce port's shape
// (../../_port/port.ts). Wave C builds every editor against the fixture (./fixture.ts and its
// per-kind modules, which CALL the v1 intelligence in lib/); L36's records module (part_records +
// part_ops, Server-side `applyOp`/`undo` per record kind) replaces only the object `SIDE`
// selects. The page and the actions reach the port through `serverPart()` and nothing else.

type Value<R> = R extends Promise<{ readonly ok: true; readonly value: infer T } | { readonly ok: false }> ? T : never;

/** A verb may answer at once (the fixture) or after awaiting a job (the real side's `act`
 *  drives its kernel job in-process for a short wait, L37) - callers await either. */
export type ServerPart = {
  readonly [K in keyof PartPort]: (...args: Parameters<PartPort[K]>) => Result<Value<ReturnType<PartPort[K]>>> | Promise<Result<Value<ReturnType<PartPort[K]>>>>;
};

// The SAME switch as the produce port: a part lives in a project, so the editors and the Plan
// must read one universe (the fixture projects are not in the kernel store, nor the real ones in
// the fixture). GRAVITONE_PRODUCE_SIDE=fixture moves both.
export const SIDE: "fixture" | "real" = process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? "fixture" : "real";

const now = (): number => Date.now();
/** The clock a page reads once, outside render, for the times it draws. */
export const partNow = now;

const fixture: ServerPart = {
  loadPart: ({ projectId, key }) => loadPart(projectId, key, now()),
  opPart: ({ projectId, key, baseRev, op }) => opPart(projectId, key, baseRev, op, now()),
  undoPart: ({ projectId, key, baseRev }) => undoPart(projectId, key, baseRev, now()),
  actReceipt: ({ projectId, key, act, target }) => actReceipt(projectId, key, act, now(), target),
  act: ({ projectId, key, act, token, target }) => confirmAct(projectId, key, act, token, now(), target),
};

export function serverPart(): ServerPart {
  return SIDE === "real" ? realPart : fixture;
}
