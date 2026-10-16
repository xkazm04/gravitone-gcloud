import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import { styleSchema, type Style } from "@gt/domain/style";
import { ratchetBlocker } from "@gt/domain/style.ratchet";
import { styleView, type StyleOpOutcome, type StyleOpRequest } from "@gt/domain/styleView";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { Reader, Store, Tx } from "../store.ts";
import { planOp } from "./core.ts";
import { readStyleRow, STYLE_COLUMNS, type StyleRow } from "./schema.ts";

// THE STYLE DRIVER - every write to a style is ONE transaction holding the record, its log row
// and its ledger event, through the record's door and the ratchet, in that order:
//   door     the draft becomes a `Style` (status re-derived by the schema's own check);
//   ratchet  @gt/domain/style.ratchet `ratchetBlocker(before, after)` - nothing demotes, a lock is
//            never lifted, a locked block never changes, a locked sheet keeps an approval;
//   row      `rev` + 1, the log row, the event (`style.<what>`, subject {kind:"style", id}).
// The SQL trigger (./schema.ts) refuses a demotion even if this file had a bug; the ratchet here
// is what turns it into the operator's sentence instead of a constraint error.
//
// THE 409 SHAPE is the part driver's: an op on a stale base writes nothing and answers the
// current view, so the atelier redraws from the truth. A refusal (the gate, the ratchet) also
// answers the view, with the sentence - the screen never has to guess why nothing changed.

export function readStyleIn(r: Reader, id: string): StyleRow | undefined {
  const row = r.get(`SELECT ${STYLE_COLUMNS} FROM styles WHERE id = ?`, id);
  return row === undefined ? undefined : readStyleRow(row);
}

/** Every style, in catalogue order (the order each first entered the store). */
export function listStylesIn(r: Reader): StyleRow[] {
  return r.all(`SELECT ${STYLE_COLUMNS} FROM styles ORDER BY ord, id`).map(readStyleRow);
}

/** The catalogue's revision: the newest op's seq, 0 for a store that never held a style. */
export function catalogueRevIn(r: Reader): number {
  const row = r.get("SELECT coalesce(max(seq), 0) AS rev FROM style_ops");
  return typeof row?.["rev"] === "number" ? row["rev"] : 0;
}

export function readStyle(store: Store, id: string): Result<StyleRow> {
  const r = store.read((x) => readStyleIn(x, id));
  if (!r.ok) return r;
  return r.value === undefined ? err("not-found", `no style ${id}`) : ok(r.value);
}

export function listStyles(store: Store): Result<StyleRow[]> {
  return store.read(listStylesIn);
}

export type StyleWrite = {
  /** What the log keeps as the act: an op, or a writer's own record of what it did. */
  readonly kind: string;
  readonly op: unknown;
  readonly by: Actor;
  readonly type: string;
  readonly data: EventData;
};

/** The draft through the door; a refused draft is `invalid` with the door's sentence. */
export function admit(draft: unknown): Result<Style> {
  return parseAt("style", styleSchema, draft);
}

/**
 * Write one style inside the caller's transaction. `before` is the row the caller planned
 * against (null = a new style). Throws the ratchet's refusal as `refused` and a door refusal as
 * `invalid`, so the whole transaction - and anything else the caller wrote in it - rolls back.
 */
export function putStyleIn(t: Tx, before: StyleRow | null, draft: unknown, w: StyleWrite): StyleRow {
  const admitted = admit(draft);
  if (!admitted.ok) throw admitted.error;
  const style = admitted.value;
  if (before === null) {
    if (readStyleIn(t, style.id) !== undefined) throw new AppError("conflict", `a style ${style.id} already exists`);
  } else {
    if (before.style.id !== style.id) throw new AppError("internal", `a write planned on ${before.style.id} produced ${style.id}`);
    const blocked = ratchetBlocker(before.style, style);
    if (blocked !== null) throw new AppError("refused", blocked);
  }
  const rev = before === null ? 1 : before.rev + 1;
  // Insertion order, not canonical: the observables keep the order their author wrote them in,
  // so the export reads as the catalogue did (the record is data, never hashed).
  const record = JSON.stringify(style);
  if (before === null) {
    const ord = t.get("SELECT coalesce(max(ord), 0) + 1 AS n FROM styles")?.["n"];
    t.run("INSERT INTO styles (id, rev, status, ord, record, updated_at) VALUES (?, 1, ?, ?, ?, ?)", style.id, style.status, typeof ord === "number" ? ord : 1, record, t.at);
  } else {
    const n = t.run("UPDATE styles SET rev = ?, status = ?, record = ?, updated_at = ? WHERE id = ? AND rev = ?", rev, style.status, record, t.at, style.id, before.rev).changes;
    if (n !== 1) throw new AppError("conflict", `style ${style.id} moved past rev ${before.rev} inside this transaction`);
  }
  t.run("INSERT INTO style_ops (style_id, rev, kind, op, by, at) VALUES (?, ?, ?, ?, ?, ?)", style.id, rev, w.kind, canonical(w.op ?? null), w.by.id, t.at);
  append(t, { actor: w.by, type: w.type, subject: { kind: "style", id: style.id }, data: { ...w.data, rev, status: style.status } });
  const row = readStyleIn(t, style.id);
  if (row === undefined) throw new AppError("internal", `style ${style.id} vanished inside its own write`);
  return row;
}

const view = (row: StyleRow) => styleView(row.style, row.rev, row.updatedAt);

/** An operator's op, against a revision. `refused` and `conflict` write nothing. */
export function applyStyleOp(store: Store, req: StyleOpRequest, by: Actor): Result<StyleOpOutcome> {
  const r = store.tx((t): Result<StyleOpOutcome> => {
    const before = readStyleIn(t, req.styleId);
    if (before === undefined) return err("not-found", `no style ${req.styleId}`);
    if (req.baseRev !== before.rev) return ok({ kind: "conflict", view: view(before) });
    const planned = planOp(before.style, req.op, { at: t.at, by: by.id, taken: (id) => readStyleIn(t, id) !== undefined });
    if (!planned.ok) return planned.error.code === "refused" ? ok({ kind: "refused", reason: planned.error.message, view: view(before) }) : planned;
    const p = planned.value;
    // Admit and ratchet BEFORE the write so a refusal is an answer, not a rolled-back throw.
    const admitted = admit(p.next);
    if (!admitted.ok) return admitted;
    if (!p.created) {
      const blocked = ratchetBlocker(before.style, admitted.value);
      if (blocked !== null) return ok({ kind: "refused", reason: blocked, view: view(before) });
    }
    const w: StyleWrite = { kind: req.op.kind, op: req.op, by, type: p.type, data: p.data };
    const written = putStyleIn(t, p.created ? null : before, p.next, w);
    return ok(p.created ? { kind: "applied", view: view(written), created: written.style.id } : { kind: "applied", view: view(written) });
  });
  return r.ok ? r.value : r;
}
