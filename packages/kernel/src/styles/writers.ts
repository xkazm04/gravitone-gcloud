import { AppError } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Style, StyleProof } from "@gt/domain/style";
import { blockDigest, keptCells, PROVEN_KEEPS, type EvidenceInput } from "@gt/domain/style.ratchet";
import { canonical } from "../canonical.ts";
import type { Tx } from "../store.ts";
import { withStatus, type StyleDraft } from "./core.ts";
import { listStylesIn, putStyleIn, readStyleIn } from "./driver.ts";
import type { StyleRow } from "./schema.ts";

// THE MACHINE WRITERS - the acts v1's catalogue writers performed on styles.json, now each a
// write on the store inside the caller's transaction (so a caller that also writes other kernel
// rows commits them together). Their SEMANTICS are v1's, kept on purpose:
//   forge commit    lib/foundry/store.ts commitRun: a run's evidence rows are REPLACED (a retry
//                   of a crashed commit writes the same rows, never doubles them), and `proven`
//                   follows from operator keeps in PROVEN_KEEPS distinct run/scene cells. v1 also
//                   never demoted; here the ratchet refuses any write that would.
//   extract commit  lib/foundry/extract/store.ts commitExtractRun: kept looks become CANDIDATES
//                   with their exemplars; a retry replaces its own run's entries, a clash with
//                   another run's id takes `-2`, `-3` (commitPlan.ts planExtractCommit).
//   acquire         pipeline/foundry/acquire.py: a readback lands as a candidate; a style with
//                   evidence is never overwritten, an unjudged one only with --force.
//   adopt           lib/foundry/adopt.ts, IN PLACE: a proven style with no block gains its look.
//   proofs          a generation job's landing: proofs appended under the current block.
//   catalogue edit  a hand edit of styles.json, carried in by pipeline/import/styles.mts.

export type ForgeVerdictRow = {
  readonly style: string;
  readonly scene: string;
  readonly mechanism: string;
  readonly verdict: "keep" | "reject";
  /** v1's words: absent or "human" = an operator's; "model" = an agent's. */
  readonly by?: "human" | "model";
};

export const byOf = (v: ForgeVerdictRow["by"]): "operator" | "agent" => (v === "model" ? "agent" : "operator");

export type ForgeEvidenceReport = { readonly touched: readonly string[]; readonly promoted: readonly string[] };

/** The forge commit's catalogue half: replace `run`'s evidence on every style, promote by keeps. */
export function recordForgeEvidenceIn(t: Tx, run: string, at: string, rows: readonly ForgeVerdictRow[], by: Actor): ForgeEvidenceReport {
  const styles = listStylesIn(t);
  const held = new Set<string>(styles.map((s) => s.style.id));
  const unknown = [...new Set(rows.map((r) => r.style))].filter((id) => !held.has(id));
  if (unknown.length)
    throw new AppError("refused", `the store holds no style ${unknown.join(", ")} — import pipeline/foundry/styles.json first (node pipeline/import/styles.mts --yes)`);
  const touched: string[] = [];
  const promoted: string[] = [];
  for (const row of styles) {
    const s = row.style;
    const mine = rows.filter((r) => r.style === s.id);
    const fresh: EvidenceInput[] = mine.map((r) => ({ run, scene: r.scene, mechanism: r.mechanism, verdict: r.verdict, at, by: byOf(r.by) }));
    // A retry of a crashed commit re-stamps its rows with its own instant; the verdicts are the
    // same, so the write is the same - compare without `at`, or every retry would mint a revision
    // (and the export a `_rev`) the uninterrupted commit never had. Compare THIS RUN's rows, not
    // the whole list: replacing them moves them to the end, so a retry after another run had
    // committed reordered the evidence and minted that revision anyway.
    const bare = (rows: readonly EvidenceInput[]) => canonical(rows.map(({ at: _at, ...r }) => r));
    if (bare(s.evidence.filter((e) => e.run === run)) === bare(fresh)) continue;
    const evidence: EvidenceInput[] = [...s.evidence.filter((e) => e.run !== run), ...fresh];
    const kept = mine.filter((r) => r.verdict === "keep").length;
    const written = putStyleIn(t, row, withStatus({ ...s, evidence }), { kind: "forge-commit", op: { run }, by, type: "style.evidence", data: { run, rows: mine.length, kept } });
    touched.push(s.id);
    if (row.style.status === "candidate" && written.style.status === "proven") promoted.push(s.id);
  }
  return { touched, promoted };
}

/** A new style (extract's candidates, acquire's readback). `replace` = an UNJUDGED style of the
 *  same id may be overwritten (acquire --force, extract's own-run retry); one with evidence never. */
export function createStyleIn(t: Tx, draft: StyleDraft, by: Actor, how: { readonly kind: string; readonly replace: boolean }): StyleRow {
  const before = readStyleIn(t, draft.id) ?? null;
  if (before !== null) {
    if (before.style.evidence.length || before.style.proofs.length || before.style.lock !== undefined)
      throw new AppError("refused", `${draft.id} already has evidence; it is not overwritten — choose another id`);
    if (!how.replace) throw new AppError("conflict", `${draft.id} is already in the catalogue (unjudged); replace it explicitly`);
  }
  const type = before === null ? "style.created" : "style.replaced";
  return putStyleIn(t, before, withStatus(draft), { kind: how.kind, op: { id: draft.id }, by, type, data: { origin: draft.origin.kind } });
}

/** The id a kept look is written under: its own, or `-2`, `-3` past every id another run holds. */
export function freeIdFor(t: Tx, id: string, run: string): string {
  const taken = (x: string): boolean => {
    const s = readStyleIn(t, x);
    return s !== undefined && s.style.origin.source !== run;
  };
  let out = id;
  for (let i = 2; taken(out); i++) out = `${id}-${i}`;
  return out;
}

export type AdoptLook = {
  readonly block: NonNullable<Style["block"]>;
  readonly palette?: NonNullable<Style["palette"]>;
  readonly proofs: readonly StyleProof[];
};

/** adopt, in place: refused unless proven and without a block (v1 adopt.ts refused a candidate 409). */
export function adoptStyleIn(t: Tx, id: string, look: AdoptLook, by: Actor): StyleRow {
  const row = readStyleIn(t, id);
  if (row === undefined) throw new AppError("not-found", `no style ${id}`);
  const s = row.style;
  if (keptCells(s) < PROVEN_KEEPS) throw new AppError("refused", `${s.name} is a candidate; only a proven style is adopted`);
  if (s.block !== undefined) throw new AppError("refused", `${s.name} already has a look — duplicate it to start another`);
  const next = withStatus({ ...s, block: look.block, ...(look.palette === undefined ? {} : { palette: look.palette }), proofs: [...s.proofs, ...look.proofs] });
  return putStyleIn(t, row, next, { kind: "adopt", op: { id, proofs: look.proofs.map((p) => p.id) }, by, type: "style.adopted", data: { digest: blockDigest(look.block), seeded: look.proofs.length } });
}

/** A generation's landing: proofs appended; each must have been rendered under the CURRENT block. */
export function addProofsIn(t: Tx, id: string, proofs: readonly StyleProof[], by: Actor): StyleRow {
  const row = readStyleIn(t, id);
  if (row === undefined) throw new AppError("not-found", `no style ${id}`);
  const s = row.style;
  if (s.block === undefined) throw new AppError("refused", `${s.name} has no block to render proofs of`);
  const digest = blockDigest(s.block);
  const off = proofs.filter((p) => p.blockDigest !== undefined && p.blockDigest !== digest);
  if (off.length) throw new AppError("conflict", `${off.length} proof(s) were rendered under an earlier block (${off[0]?.blockDigest ?? "?"}); the block is now ${digest}`);
  const ids = new Set(s.proofs.map((p) => p.id));
  const fresh = proofs.filter((p) => !ids.has(p.id));
  if (!fresh.length) return row;
  const next = withStatus({ ...s, proofs: [...s.proofs, ...fresh] });
  return putStyleIn(t, row, next, { kind: "proofs", op: { ids: fresh.map((p) => p.id) }, by, type: "style.proof", data: { added: fresh.length, digest } });
}

/** The catalogue half a hand edit of styles.json may change, carried in by the importer. */
export type CatalogueEdit = Pick<Style, "name" | "family" | "recipe" | "negative" | "observables">;

/** Null when nothing differs. A locked style's catalogue half is frozen with its block. */
export function editCatalogueIn(t: Tx, id: string, edit: CatalogueEdit, by: Actor): StyleRow | null {
  const row = readStyleIn(t, id);
  if (row === undefined) throw new AppError("not-found", `no style ${id}`);
  const s = row.style;
  const fields = (["name", "family", "recipe", "negative", "observables"] as const).filter((k) => canonical(s[k]) !== canonical(edit[k]));
  if (!fields.length) return null;
  if (s.lock !== undefined) throw new AppError("refused", `${s.name} is locked — projects were built on it; duplicate it instead`);
  return putStyleIn(t, row, withStatus({ ...s, ...edit }), { kind: "catalogue-edit", op: { fields }, by, type: "style.edited", data: { field: "catalogue", fields } });
}

/**
 * Extract's commit: each kept look a candidate, under its own id or `-2`, `-3` past ids another
 * run holds (or this call already wrote); a retry REPLACES this run's own unjudged entries
 * (v1 planExtractCommit's rule). Returns the ids written, in order.
 */
export function commitExtractStylesIn(t: Tx, run: string, drafts: readonly StyleDraft[], by: Actor): string[] {
  const written: string[] = [];
  for (const d of drafts) {
    let id = freeIdFor(t, d.id, run);
    for (let i = 2; written.includes(id); i++) id = freeIdFor(t, `${d.id}-${i}`, run);
    createStyleIn(t, { ...d, id }, by, { kind: "extract-commit", replace: true });
    written.push(id);
  }
  return written;
}
