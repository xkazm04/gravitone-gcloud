import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";

// THE FIXTURE PART RECORD AND ITS LOG - one revisioned record per editor part, and the op log
// whose rules ./fixture.ts states (a stale op writes nothing; undo APPENDS its inverse and is
// refused when a job has written a field since). Split from ./fixture.ts for the 400-line rule
// when the seeded world (./fixtureWorld/) began landing job lines on these logs; nothing here
// changed in the split.

export type Entry<R> = {
  readonly n: number;
  readonly label: string;
  readonly by: string;
  readonly at: number;
  /** Operator edits are undoable; job landings and undo lines are not. */
  readonly kind: "op" | "job" | "undo";
  readonly before: Partial<R>;
  readonly wrote: Partial<R>;
  undone: boolean;
};
export type Rec<R> = { rev: number; data: R; readonly log: Entry<R>[] };

/** The top-level fields `next` changed from `prev` (records are replaced, never mutated). */
function diff<R extends object>(prev: R, next: R): { before: Partial<R>; wrote: Partial<R> } {
  const before: Partial<R> = {};
  const wrote: Partial<R> = {};
  for (const k of Object.keys(next) as (keyof R)[]) {
    if (prev[k] === next[k]) continue;
    before[k] = prev[k];
    wrote[k] = next[k];
  }
  return { before, wrote };
}

export function write<R extends object>(rec: Rec<R>, next: R, meta: { readonly label: string; readonly by: string; readonly kind: Entry<R>["kind"]; readonly at: number }): void {
  const { before, wrote } = diff(rec.data, next);
  rec.log.push({ n: rec.log.length + 1, ...meta, before, wrote, undone: false });
  rec.data = next;
  rec.rev++;
}

/** An operator's edit: the kernel refuses one that changes nothing (@gt/kernel/parts/driver.ts
 *  writePartIn, `<label>: changes nothing`) - no rev, no undo line - and so does this side. The
 *  real side compares the records by JSON (realRecs.ts `changed`); this compares the working record. */
export function opWrite<R extends object>(rec: Rec<R>, next: R, label: string, at: number): Result<null> {
  if (JSON.stringify(next) === JSON.stringify(rec.data)) return err("invalid", `${label}: changes nothing`);
  write(rec, next, { label, by: "operator", kind: "op", at });
  return ok(null);
}

export const effective = <R>(rec: Rec<R>): Entry<R>[] => rec.log.filter((e) => e.kind === "op" && !e.undone).reverse();

export function undoIn<R extends object>(rec: Rec<R>, now: number): Result<null> {
  const last = effective(rec)[0];
  // The kernel's refusal, code and words (@gt/kernel/parts/core.ts planUndo).
  if (last === undefined) return err("refused", "nothing on this part is left to undo");
  for (const k of Object.keys(last.wrote) as (keyof R)[]) {
    if (rec.data[k] !== last.wrote[k]) {
      // The writer as planUndo names a landing: its job and the act it landed.
      const job = [...rec.log].reverse().find((e) => e.kind === "job" && k in e.wrote);
      return err("conflict", `${last.label}: ${String(k)} was rewritten by ${job === undefined ? "a later write" : `${job.by} (${job.label})`} since`);
    }
  }
  last.undone = true;
  write(rec, { ...rec.data, ...last.before }, { label: `undo ${last.label}`, by: "operator", kind: "undo", at: now });
  return ok(null);
}
