import "server-only";

import type { PartSnapshot } from "@gt/kernel/parts/driver";

// What the real side's per-kind mappers (./realResearch.ts, ./realScript.ts) and its scene
// (./realScene.ts) share.

export type Recs = PartSnapshot["records"];
export type Obj = Readonly<Record<string, unknown>>;

/** The records came through their doors and were written by these same typed appliers; the door
 *  checks what readers key on and carries the rest, so lib's types are read back here (the
 *  boundary v1 cast at too: ResearchNotebookStepData "casts at its own boundary"). */
export const written = <T,>(x: unknown): T => x as T;
export const obj = (x: unknown): Obj | undefined => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Obj) : undefined);
export const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/** Only the records whose mapped value moved: an op touches what it touches, nothing it did not.
 *  (A false "moved" costs nothing - the kernel drops a write whose digest did not change.) */
export function changed(before: Record<string, Obj>, after: Record<string, Obj>): Record<string, Obj> {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k] === undefined || JSON.stringify(before[k]) !== JSON.stringify(v)));
}
