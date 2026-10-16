import { z } from "zod";
import type { BlobRef } from "@gt/domain/blob";
import { parseAt, parseJsonAt, type Parsed } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { statusOf } from "@gt/domain/style.ratchet";
import { canonical } from "../canonical.ts";
import type { Reader, Tx } from "../store.ts";
import { withStatus, type StyleDraft } from "./core.ts";
import { admit, putStyleIn, readStyleIn } from "./driver.ts";
import { editCatalogueIn, byOf } from "./writers.ts";

// V1'S CATALOGUE, IN - pipeline/foundry/styles.json as v1 wrote it (lib/foundry/types.ts
// `StyleDef`), read at a door and turned into store drafts. Used by the one-time import
// (pipeline/import/styles.mts), by the hand-edit path after it (the same CLI, re-run), and by the
// app's first touch of an empty store (lib/foundry/catalogue.ts) so a fresh universe - a fixture
// run, a new machine - starts from the catalogue the repo carries instead of from nothing.
//
// The words change at this door and nowhere else: an evidence row with no `by` (or "human") was
// a human's and becomes "operator"; "model" becomes "agent" (v1 commitPlan.ts `humanKeep`). An
// exemplar's run-relative file becomes a blob; a file not on this machine is reported and
// left out, never invented. `status` is RE-DERIVED: a v1 file that says `proven` without the
// keeps is reported, and the store holds what the evidence says.

const v1Evidence = z.object({
  run: z.string().min(1),
  scene: z.string().min(1),
  mechanism: z.string().min(1),
  verdict: z.enum(["keep", "reject"]),
  at: z.string(),
  by: z.enum(["human", "model"]).optional(),
});

const v1Exemplar = z.object({
  kind: z.literal("extract").optional(),
  run: z.string().min(1),
  file: z.string().min(1),
  role: z.enum(["source", "replica", "transfer"]),
  settled: z.enum(["round-cap", "generation-failed", "target-met", "no-usable-fix"]).optional(),
});

export const v1StyleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.string().min(1),
  status: z.enum(["candidate", "proven", "locked"]),
  origin: z.object({ kind: z.enum(["readback", "authored", "extracted"]), source: z.string().min(1).optional(), models: z.array(z.string().min(1)).optional(), signature: z.string().optional(), edited: z.boolean().optional() }),
  observables: z.record(z.string(), z.string()),
  recipe: z.string().min(1),
  negative: z.string(),
  evidence: z.array(v1Evidence),
  exemplars: z.array(v1Exemplar).optional(),
});
export type V1Style = Parsed<z.output<typeof v1StyleSchema>>;

const v1File = z.object({ styles: z.array(z.unknown()) });

/** styles.json's text, entry by entry: a malformed entry is named, the rest still read. */
export function readV1Catalogue(text: string): Result<{ styles: V1Style[]; refused: { index: number; message: string }[] }> {
  const doc = parseJsonAt("styles.json", v1File, text);
  if (!doc.ok) return doc;
  const styles: V1Style[] = [];
  const refused: { index: number; message: string }[] = [];
  doc.value.styles.forEach((raw, index) => {
    const s = parseAt(`styles.json styles[${index}]`, v1StyleSchema, raw);
    if (s.ok) styles.push(s.value);
    else refused.push({ index, message: s.error.message });
  });
  return ok({ styles, refused });
}

/** v1's timestamp, or the epoch's honest stand-in: v1 commits wrote `at: ""` for a retried row. */
const isoOr = (at: string, fallback: string): string => (z.iso.datetime().safeParse(at).success ? at : fallback);

export type DraftReport = { readonly draft: StyleDraft; readonly missing: readonly string[]; readonly statusChanged: boolean };

/** One v1 entry as a store draft. `media` resolves an exemplar's `run/file` to its blob, or undefined. */
export function draftFromV1(s: V1Style, media: (run: string, file: string) => BlobRef | undefined, at: string): DraftReport {
  const missing: string[] = [];
  const exemplars = (s.exemplars ?? []).flatMap((x) => {
    const ref = media(x.run, x.file);
    if (ref === undefined) {
      missing.push(`${x.run}/${x.file}`);
      return [];
    }
    return [{ role: x.role, media: ref, run: x.run, file: x.file, ...(x.settled === undefined ? {} : { settled: x.settled }) }];
  });
  const evidence = s.evidence.map((e) => ({ run: e.run, scene: e.scene, mechanism: e.mechanism, verdict: e.verdict, at: isoOr(e.at, at), by: byOf(e.by) }));
  const draft: StyleDraft = { id: s.id, name: s.name, family: s.family, origin: s.origin, observables: s.observables, recipe: s.recipe, negative: s.negative, elements: [], evidence, exemplars, proofs: [] };
  return { draft, missing, statusChanged: statusOf({ evidence }) !== (s.status === "locked" ? "proven" : s.status) };
}

export type ImportOutcome = {
  readonly id: string;
  /** created = new in the store; edited = a hand edit carried in; same = nothing to do;
   *  refused = the door or the ratchet said no (named in `detail`), nothing written for it. */
  readonly result: "created" | "edited" | "same" | "refused";
  readonly detail?: string;
  readonly missing: readonly string[];
  readonly statusChanged: boolean;
};

/**
 * Bring v1 entries into the store inside the caller's transaction, idempotently: an id the store
 * lacks is created whole; an id it holds takes only the CATALOGUE half (name, family, recipe,
 * negative, observables - the hand-edited half), because evidence, exemplars and the sheet are
 * the store's own record now and a stale file must never rewind them.
 */
export function importV1In(t: Tx, reports: readonly DraftReport[], by: Actor): ImportOutcome[] {
  return reports.map(({ draft, missing, statusChanged }): ImportOutcome => {
    const base = { id: draft.id, missing, statusChanged };
    const before = readStyleIn(t, draft.id);
    if (before === undefined) {
      const next = withStatus(draft);
      const admitted = admit(next);
      if (!admitted.ok) return { ...base, result: "refused", detail: admitted.error.message };
      putStyleIn(t, null, next, { kind: "import", op: { id: draft.id }, by, type: "style.imported", data: { origin: draft.origin.kind, evidence: draft.evidence.length, exemplars: draft.exemplars.length } });
      return { ...base, result: "created" };
    }
    if (before.style.lock !== undefined && canonical(pickCatalogue(before.style)) !== canonical(pickCatalogue(draft)))
      return { ...base, result: "refused", detail: `${draft.id} is locked; its catalogue half does not change` };
    const edited = editCatalogueIn(t, draft.id, pickCatalogue(draft), by);
    return { ...base, result: edited === null ? "same" : "edited" };
  });
}

const pickCatalogue = (s: Pick<StyleDraft, "name" | "family" | "recipe" | "negative" | "observables">) => ({
  name: s.name,
  family: s.family,
  recipe: s.recipe,
  negative: s.negative,
  observables: s.observables,
});


/** The same outcomes `importV1In` would produce, read-only: the importer's dry run. */
export function planImportV1In(r: Reader, reports: readonly DraftReport[]): ImportOutcome[] {
  return reports.map(({ draft, missing, statusChanged }): ImportOutcome => {
    const base = { id: draft.id, missing, statusChanged };
    const before = readStyleIn(r, draft.id);
    if (before === undefined) {
      const admitted = admit(withStatus(draft));
      return admitted.ok ? { ...base, result: "created" } : { ...base, result: "refused", detail: admitted.error.message };
    }
    if (canonical(pickCatalogue(before.style)) === canonical(pickCatalogue(draft))) return { ...base, result: "same" };
    return before.style.lock !== undefined ? { ...base, result: "refused", detail: `${draft.id} is locked; its catalogue half does not change` } : { ...base, result: "edited" };
  });
}
