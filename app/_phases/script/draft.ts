// THE SCRIPT DRAFT — Step 2's renders as one per-project record.
//
// ─── what this replaces ─────────────────────────────────────────────────────
//
// Step 2 was built on five module-scope tables keyed by three fixture render
// ids: `RENDERS` (renders.ts), `ATTRIBUTION` and `IMPACT` (impact.ts, the
// second computed once at import), `CONSTRAINT_LEDGER` (constraints.ts, hand-
// typed verdicts) and `PROBES` (gate.ts). Even the model's edit-plan schema
// enumerated the fixture ids, so a model could not name a render it wrote. A
// creator's notebook could reach Step 2 and find nothing there that was theirs.
//
// A `ScriptDraft` is everything those tables said, as data that belongs to one
// project: the renders, each carrying the attribution that was a separate
// table, and the probes the gate enforces. Readers take a draft —
// `impactOf(draft)`, `editPlanSchema(draft)`, `ledgerFor(render, notebook,
// {draft})`, `probesFor(unknowns, draft)` — and the tables survive only as the
// FIXTURE draft's data, built verbatim by `fixtureDraft()`.
//
// ─── what is NOT here yet (card script-phase-A, session 2) ──────────────────
//
//   · persistence: `useScriptDraft(projectId)` under a stepStore key, seeding
//     `fixtureDraft()` only for the replay notebook
//   · `Unknown.probe` in the notebook schema, so a research run authors probes
//   · the matrix/coverage/scope readers and ScriptStep taking a draft
//
// Until then `RENDERS`, `IMPACT` and `EDIT_PLAN_SCHEMA` stay exported as
// fixture-backed shims, because pipeline/gate-regression.mts,
// pipeline/drive-script-step.mjs and every existing script probe read them.

import { fixtureSource, type NotebookSource } from "../_shared/notebook/source";
import { CONSTRAINT_LEDGER } from "./constraints";
import { PROBES, serializeProbe, type SerializableProbe } from "./gate";
import { ATTRIBUTION, usageMapOf, type Attribution, type Usage } from "./impact";
import { RENDERS } from "./renders";
import type { ScriptRender } from "./types";

/** One render in a draft. The attribution travels WITH the render it describes:
 *  as a separate table keyed by id, it was the thing that went stale when a
 *  render was rewritten. */
export interface DraftRender extends ScriptRender {
  /** beat mark → the notebook card ids that beat states. */
  attribution: Attribution;
  /** unknownId → a person's note on how the render treats that limit. An
   *  ANNOTATION shown beside the gate's verdict, never a verdict itself: the
   *  ledger's state is derived from the gate (constraints.ts::ledgerFor). */
  ledgerNotes?: Record<string, string>;
}

export interface ScriptDraft {
  schema: 1;
  projectId: string;
  /** `NotebookSource.digest` of the notebook these renders were written from.
   *  A draft whose digest is not the project's current notebook's was written
   *  against research that has since moved. */
  notebookDigest: string;
  renders: DraftRender[];
  /** unknownId → the probe that enforces it. Serializable, so a draft can be
   *  stored and a model can author one. Resolved by gate.ts::probesFor. */
  probes?: Record<string, SerializableProbe>;
}

export interface DraftOptions {
  projectId: string;
  /** The notebook the renders were written from. Its digest is recorded. */
  source: NotebookSource;
  probes?: Record<string, SerializableProbe>;
}

export function draftOf(renders: DraftRender[], opts: DraftOptions): ScriptDraft {
  const draft: ScriptDraft = {
    schema: 1,
    projectId: opts.projectId,
    notebookDigest: opts.source.digest,
    renders,
  };
  if (opts.probes) draft.probes = opts.probes;
  return draft;
}

/** The shipped 2026-08-11 renders as a draft: RENDERS, ATTRIBUTION, PROBES and
 *  the hand ledger's `how` strings, verbatim. Built fresh per call — a draft is
 *  a record a caller may edit, and a shared instance would let one project's
 *  edit reach another's. */
export function fixtureDraft(projectId = "replay"): ScriptDraft {
  const renders: DraftRender[] = RENDERS.map((r) => {
    const notes = CONSTRAINT_LEDGER[r.id];
    const out: DraftRender = { ...r, attribution: ATTRIBUTION[r.id] ?? {} };
    if (notes?.length) out.ledgerNotes = Object.fromEntries(notes.map((n) => [n.unknownId, n.how]));
    return out;
  });
  const probes = Object.fromEntries(Object.entries(PROBES).map(([id, p]) => [id, serializeProbe(p)]));
  return draftOf(renders, { projectId, source: fixtureSource(), probes });
}

/** renderId → cardId → usage, for the renders in THIS draft. Replaces the
 *  module-global `IMPACT`, which is now this over the fixture draft. */
export function impactOf(draft: ScriptDraft): Record<string, Record<string, Usage>> {
  return Object.fromEntries(draft.renders.map((r) => [r.id, usageMapOf(r, r.attribution)]));
}
