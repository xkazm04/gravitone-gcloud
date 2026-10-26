import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { decodeRecord, isStepKey, isStepKind, STEP_RECORDS, type StepKind } from "@gt/domain/steps/registry";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import { loadParts } from "../records/schema.ts";
import type { Reader, Store, Tx } from "../store.ts";
import { effective, planUndo, planWrites, type Current } from "./core.ts";
import { OP_COLUMNS, readOpRow, readRecordRow, type OpRow, type Write } from "./schema.ts";

// THE PART DRIVER - read a part, apply an op or a job's landing, undo; each write ONE
// transaction with its event (`part.op`, `part.undone`), so the record, its log and the ledger
// never disagree. The policy is ./core.ts; what an op MEANS is the caller's pure function
// (`next`), because the meaning lives with the v1 intelligence in lib/ (descoping a required
// card, a spine with a slot unpicked, a beat edit through the CutLog) and a package may not
// import lib/ (COMMON decision 1). The kernel holds the data, the log and the undo; every value a
// `next` returns still passes its record's door here before a row is written.
//
// THE 409 SHAPE is the decision kernel's (../decision/driver.ts `stale`): a write on a stale base
// writes nothing and answers the current revision, so the editor redraws from the truth.

export type PartAt = { readonly projectId: string; readonly partId: string };

export type RefusedRecord = { readonly key: string; readonly message: string };

export type PartSnapshot = PartAt & {
  readonly kind: StepKind;
  /** 1 + every row this part's log holds: any write to the part moves it. */
  readonly rev: number;
  /** Every step record of the PROJECT, decoded (a part reads its upstream's too). */
  readonly records: Current;
  /** Records whose door refused them (a newer build's, a malformed one): read as unreadable,
   *  never as absent - a write over one is refused (v1 registry rule: never save over it). */
  readonly refused: readonly RefusedRecord[];
  /** The part of each step kind in this project: a record's row belongs to its owner's part. */
  readonly owners: ReadonlyMap<StepKind, string>;
};

function partRows(r: Reader, at: PartAt): OpRow[] {
  return r.all(`SELECT ${OP_COLUMNS} FROM part_ops WHERE project_id = ? AND part_id = ? ORDER BY seq`, at.projectId, at.partId).map(readOpRow);
}

function projectRows(r: Reader, projectId: string): OpRow[] {
  return r.all(`SELECT ${OP_COLUMNS} FROM part_ops WHERE project_id = ? ORDER BY seq`, projectId).map(readOpRow);
}

function kindOf(r: Reader, at: PartAt): { kind: StepKind; owners: Map<StepKind, string> } {
  const rows = loadParts(r, at.projectId);
  const row = rows.find((x) => x.part.id === at.partId);
  if (row === undefined) throw new AppError("not-found", `project ${at.projectId} has no part ${at.partId}`);
  if (!isStepKind(row.part.kind)) throw new AppError("refused", `part ${at.partId} is a ${row.part.kind}; it holds no step records`);
  const owners = new Map<StepKind, string>();
  for (const x of rows) if (isStepKind(x.part.kind) && !owners.has(x.part.kind)) owners.set(x.part.kind, x.part.id);
  return { kind: row.part.kind, owners };
}

/** The project's step records, decoded through their doors. */
export function projectRecords(r: Reader, projectId: string): { records: Current; refused: RefusedRecord[] } {
  const records = new Map<string, Readonly<Record<string, unknown>>>();
  const refused: RefusedRecord[] = [];
  for (const raw of r.all("SELECT key, part_id, rev, data FROM part_records WHERE project_id = ? ORDER BY key", projectId)) {
    const row = readRecordRow(raw);
    const d = decodeRecord(row.key, row.data);
    if (d.ok && typeof d.value === "object" && d.value !== null) records.set(row.key, { ...d.value });
    else refused.push({ key: row.key, message: d.ok ? `${row.key} decoded to a non-object` : d.error.message });
  }
  return { records, refused };
}

export function readPartIn(r: Reader, at: PartAt): PartSnapshot {
  const { kind, owners } = kindOf(r, at);
  const rows = partRows(r, at);
  return { ...at, kind, owners, rev: rows.length + 1, ...projectRecords(r, at.projectId) };
}

export function readPart(store: Store, at: PartAt): Result<PartSnapshot> {
  return store.read((r) => readPartIn(r, at));
}

/** The undo trail: ops still in effect, newest first. */
export function partTrail(r: Reader, at: PartAt, limit: number): OpRow[] {
  return effective(partRows(r, at)).slice(0, limit);
}

export type PartOutcome = { readonly kind: "applied"; readonly rev: number; readonly n: number } | { readonly kind: "conflict"; readonly rev: number };

export type WriteInput = PartAt & {
  /** The rev the op was made against; a job landing passes "current" (it is not a human's view). */
  readonly baseRev: number | "current";
  /** `op` = an operator's edit (undoable); `land` = a job's output (never undone by a human's ⌫). */
  readonly act: "op" | "land";
  /** The op as the log keeps it (JSON). */
  readonly op: unknown;
  readonly label: string;
  readonly by: Actor;
  /** PURE: the records this act changes, by key, given the part as it is now. */
  readonly next: (s: PartSnapshot) => Result<Readonly<Record<string, unknown>>>;
};

function putRecord(t: Tx, s: PartSnapshot, key: string, value: Readonly<Record<string, unknown>> | null): void {
  const projectId = s.projectId;
  if (value === null) {
    t.run("DELETE FROM part_records WHERE project_id = ? AND key = ?", projectId, key);
    return;
  }
  const partId = (isStepKey(key) ? s.owners.get(STEP_RECORDS[key].owner) : undefined) ?? s.partId;
  const data = canonical(value);
  // The owner stays the part that first wrote the record; a part that GROWS it does not take it.
  const n = t.run("UPDATE part_records SET rev = rev + 1, data = ? WHERE project_id = ? AND key = ?", data, projectId, key).changes;
  if (n === 0) t.run("INSERT INTO part_records (project_id, key, part_id, rev, data) VALUES (?, ?, ?, 1, ?)", projectId, key, partId, data);
}

function logRow(t: Tx, s: PartSnapshot, row: { act: "op" | "land" | "undo"; op: unknown; label: string; undoes: number | null; writes: readonly Write[]; by: Actor }): number {
  const n = s.rev;
  t.run(
    "INSERT INTO part_ops (project_id, part_id, n, act, op, label, base_rev, undoes, writes, by, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    s.projectId, s.partId, n, row.act, canonical(row.op), row.label, s.rev, row.undoes, canonical(row.writes), row.by.id, t.at,
  );
  append(t, {
    actor: row.by,
    type: row.act === "undo" ? "part.undone" : "part.op",
    subject: { kind: "part", id: s.partId },
    data: { projectId: s.projectId, n, act: row.act, label: row.label, rev: n + 1, keys: row.writes.map((w) => w.key), ...(row.undoes === null ? {} : { undoes: row.undoes }) },
  });
  return n;
}

/** Apply an op or a landing inside the caller's transaction. */
export function writePartIn(t: Tx, input: WriteInput): Result<PartOutcome> {
  const s = readPartIn(t, input);
  if (input.baseRev !== "current" && input.baseRev !== s.rev) return ok({ kind: "conflict", rev: s.rev });
  const next = input.next(s);
  if (!next.ok) return next;
  const bad = s.refused.find((x) => Object.hasOwn(next.value, x.key));
  if (bad !== undefined) return err("refused", `${bad.key} cannot be written over: ${bad.message}`);
  const planned = planWrites(s.kind, s.records, next.value);
  if (!planned.ok) return planned;
  if (planned.value.length === 0) return err("invalid", `${input.label}: changes nothing`);
  for (const p of planned.value) putRecord(t, s, p.write.key, p.value);
  const n = logRow(t, s, { act: input.act, op: input.op, label: input.label, undoes: null, writes: planned.value.map((p) => p.write), by: input.by });
  return ok({ kind: "applied", rev: n + 1, n });
}

export function writePart(store: Store, input: WriteInput): Result<PartOutcome> {
  const r = store.tx((t) => writePartIn(t, input));
  return r.ok ? r.value : r;
}

/** ⌫: append the inverse of this part's newest op still in effect. Never a delete from the log. */
export function undoPart(store: Store, input: PartAt & { readonly baseRev: number; readonly by: Actor }): Result<PartOutcome> {
  const r = store.tx((t): Result<PartOutcome> => {
    const s = readPartIn(t, input);
    if (input.baseRev !== s.rev) return ok({ kind: "conflict", rev: s.rev });
    const plan = planUndo(partRows(t, input), projectRows(t, input.projectId), s.records);
    if (!plan.ok) return plan;
    for (const [key, value] of plan.value.restore) putRecord(t, s, key, value);
    const n = logRow(t, s, { act: "undo", op: { undo: plan.value.target.n }, label: `undo ${plan.value.target.label}`, undoes: plan.value.target.n, writes: plan.value.writes, by: input.by });
    return ok({ kind: "applied", rev: n + 1, n });
  });
  return r.ok ? r.value : r;
}
