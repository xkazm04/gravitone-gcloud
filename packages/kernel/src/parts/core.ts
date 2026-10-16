import { err, ok, type Result } from "@gt/domain/errors";
import { encodeRecord, isStepKey, writableBy, type StepKind } from "@gt/domain/steps/registry";
import { canonical, sha256Hex } from "../canonical.ts";
import type { OpRow, Write } from "./schema.ts";

// THE PART CORE - pure: what an op, a landing and an undo WOULD write, decided from rows already
// read. ./driver.ts reads, calls these, writes, in one transaction.
//
// Absorbed and upgraded:
//   app/_phases/_shared/records/patch.ts   a write goes through its record's door (v1: refuse a
//                                          misread record rather than write the misreading
//                                          back). KEPT: every value an op produces is encoded
//                                          through @gt/domain/steps before a row is written.
//   lib/script/trailer/ops.ts (CutLog)     undo/redo as a head over an op list, client-side,
//                                          for one record. UPGRADED to the decision kernel's
//                                          rule: undo APPENDS the inverse of the newest op
//                                          still in effect; there is no redo tail (a new op
//                                          after an undo starts the history again, linear).
//   score SpotList one-level Ctrl+Z,       session-only, gone on reload. Same upgrade.
//   cut useCut 50-deep Ctrl+Z
//
// THE INVERSE IS THE PRIOR VALUE, per record, not an op-specific inverse (decided, and why):
// there are ~30 op kinds across six editors, and a hand-written inverse per kind is a second
// implementation of each op that can disagree with the first; the prior value cannot. It is
// sound because an undo first checks that every record the op wrote still holds exactly what
// the op left (its digest). When a later writer moved one - a job landing, another part's op
// growing the record - the undo is REFUSED with that writer named: undoing a human edit must
// never erase a machine's work (registry undo-history: undo scope). Restore-forward ops (script
// history) are ordinary ops - their effect is a NEW staged version, and undoing one removes it.

export type Current = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

export const digestOf = (data: unknown): string => sha256Hex(canonical(data));

/** A write and the encoded value it leaves. */
export type Planned = { readonly write: Write; readonly value: Readonly<Record<string, unknown>> };

const plain = (x: unknown): x is Readonly<Record<string, unknown>> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The writes that change something: each through its door, each a record this kind may write. */
export function planWrites(kind: StepKind, current: Current, next: Readonly<Record<string, unknown>>): Result<Planned[]> {
  const may = writableBy(kind);
  const out: Planned[] = [];
  for (const [key, value] of Object.entries(next)) {
    if (!isStepKey(key)) return err("invalid", `no step record ${key}`);
    if (!may.has(key)) return err("refused", `a ${kind} part does not write ${key}`);
    const enc = encodeRecord(key, value);
    if (!enc.ok) return enc;
    if (!plain(enc.value)) return err("internal", `${key} encoded to a non-object`);
    const after = digestOf(enc.value);
    const before = current.get(key) ?? null;
    if (before !== null && digestOf(before) === after) continue;
    out.push({ write: { key, before, after }, value: enc.value });
  }
  return ok(out);
}

/** Ops whose effect stands: operator ops no undo has reversed, newest first. */
export function effective(rows: readonly OpRow[]): OpRow[] {
  const undone = new Set<number>();
  for (const r of rows) if (r.undoes !== null) undone.add(r.undoes);
  return rows.filter((r) => r.act === "op" && !undone.has(r.n)).reverse();
}

export type UndoPlan = { readonly target: OpRow; readonly writes: readonly Write[]; readonly restore: ReadonlyMap<string, Readonly<Record<string, unknown>> | null> };

/**
 * Undo the newest op of THIS part still in effect. `partRows` are the part's own rows in order;
 * `projectRows` every row of the project in seq order (to name a later writer of a record).
 */
export function planUndo(partRows: readonly OpRow[], projectRows: readonly OpRow[], current: Current): Result<UndoPlan> {
  const target = effective(partRows)[0];
  if (target === undefined) return err("refused", "nothing on this part is left to undo");
  const writes: Write[] = [];
  const restore = new Map<string, Readonly<Record<string, unknown>> | null>();
  for (const w of target.writes) {
    const now = current.get(w.key) ?? null;
    const nowDigest = now === null ? null : digestOf(now);
    if (nowDigest !== w.after) {
      const later = [...projectRows].reverse().find((r) => r.seq > target.seq && r.writes.some((x) => x.key === w.key));
      const who = later === undefined ? "a later write" : later.act === "land" ? `${later.by} (${later.label})` : `${later.by}: ${later.label}`;
      return err("conflict", `${target.label}: ${w.key} was rewritten by ${who} since`);
    }
    writes.push({ key: w.key, before: now, after: w.before === null ? null : digestOf(w.before) });
    restore.set(w.key, w.before);
  }
  return ok({ target, writes, restore });
}
