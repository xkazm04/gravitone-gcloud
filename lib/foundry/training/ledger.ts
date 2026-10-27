// THE LEDGER READER AND ITS WRITE RULE — pure; nothing here touches disk.
//
// pipeline/foundry/training-ledger.json is the cross-machine channel, so it holds
// v1 rows (`reflected: false | sha | "not-better:no-edit"`) until both checkouts
// ship schema 2 together. `normalizeLedgerRow` reads either into the schema-2
// shape; the file itself is not migrated here.

import path from "node:path";

import { FoundryError } from "../runStore";
import type { Improvement, TrainingLedgerRow, TrainingLedgerRowV2, TrainingPin } from "./types";

/** Ledger `thumb` paths are repo-relative with forward slashes on every OS. */
export const THUMBS_REL = "pipeline/foundry/training/thumbs";

/** The picture an approved improvement keeps in git: `src` cycle-relative, `name` in the thumbs
 *  dir, `rel` as the ledger records it. The loop names the chosen arm's FILE as the thumbnail
 *  (pipeline/foundry/dojo_judge.py), which on a video cycle is a .webm; the arm's poster is the
 *  image it keeps then. The commit (./store.ts) and the Board's preview (decision/v1/sources/dojo.ts)
 *  both read this, so the file the preview names is the file the commit writes. */
export function keeperThumb(cycleId: string, imp: Pick<Improvement, "id" | "thumbnail" | "pairs">): { src: string; name: string; rel: string } | undefined {
  if (!imp.thumbnail) return undefined;
  const ref = (imp.pairs ?? []).flatMap((p) => [p.baseline, p.challenger]).find((r) => r?.file === imp.thumbnail);
  const src = ref?.kind === "video" && ref.poster ? ref.poster : imp.thumbnail;
  const name = `${cycleId}--${imp.id}${path.extname(src).toLowerCase()}`;
  return { src, name, rel: `${THUMBS_REL}/${name}` };
}

type RawRow = Partial<TrainingLedgerRowV2> & Partial<TrainingLedgerRow> & Record<string, unknown>;

/** The v1 `reflected` value that closes a row with no edit owed. */
const NO_EDIT = "not-better:no-edit";

/** Any ledger row, v1 or schema 2, as a schema-2 row. A v1 `reflected` sha becomes
 *  `reflection.sha` (its branch is unrecorded, so ""); `false` and the no-edit
 *  marker carry no reflection. Rejects and the no-edit marker are closed by their
 *  `human` in lib/foundry/training/lifecycle.ts, so nothing extra is stored. */
export function normalizeLedgerRow(raw: unknown): TrainingLedgerRowV2 {
  const { reflected, reflection, pins, schema: _schema, ...rest } = raw as RawRow;
  void _schema;
  const sha = reflection?.sha ?? (typeof reflected === "string" && reflected !== NO_EDIT ? reflected : undefined);
  return {
    ...(rest as Omit<TrainingLedgerRow, "reflected">),
    schema: 2,
    ...(sha ? { reflection: { sha, branch: reflection?.branch ?? "" } } : {}),
    pins: Array.isArray(pins) ? (pins as TrainingPin[]) : [],
  };
}

export function normalizeLedger(rows: readonly unknown[] | undefined): TrainingLedgerRowV2[] {
  return (rows ?? []).map(normalizeLedgerRow);
}

/** The writer's rule: no row without a verdict. Throws before anything is written. */
export function assertLedgerRows(rows: readonly { cycle?: string; technique?: string; human?: unknown }[]): void {
  for (const r of rows) {
    if (r.human !== "approve" && r.human !== "reject")
      throw new FoundryError(`Refusing a ledger row without a verdict (human: approve|reject): ${r.cycle ?? "?"} / ${r.technique ?? "?"}.`, 400);
  }
}

/** The ledger's rows after a cycle's commit: that cycle's old rows replaced by `added`.
 *  Validates first, so a refused row leaves the caller's rows untouched. */
export function replaceCycleRows<R extends { cycle: string }>(
  existing: readonly R[] | undefined,
  cycle: string,
  added: readonly R[],
): R[] {
  assertLedgerRows(added as readonly { human?: unknown }[]);
  return [...(existing ?? []).filter((r) => r.cycle !== cycle), ...added];
}
