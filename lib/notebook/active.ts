// The pure half of the active notebook: which source a saved record deals, why
// one is refused, and a mount-free read. The React hook stays in
// app/_phases/_shared/notebook/useActiveNotebook.ts and imports these back.

import { type ResearchNotebookStepData, readStep } from "@/lib/steps";

import type { EngineReceipt } from "./engineReceipt";
import { fixtureSource, sourceOf, type NotebookSource } from "./source";
import type { Notebook } from "./types";

/** The live notebook's step record (run/live.ts writes it). */
export const LIVE_NOTEBOOK_PHASE = "research-notebook";

/** THE ROLLBACK PIN. `true` deals the replay for every project whatever is saved. */
export const PIN_REPLAY = false;

/** A saved notebook the board can deal — the fields `buildCards` walks. The route
 *  validated it before it was saved (lib/notebook/validate.ts); this only refuses
 *  a record that is not a notebook at all, which would take the board down. */
function dealable(nb: unknown): nb is Notebook {
  if (!nb || typeof nb !== "object") return false;
  const n = nb as Partial<Notebook>;
  return (
    Array.isArray(n.facts) &&
    Array.isArray(n.mechanisms) &&
    Array.isArray(n.reversals) &&
    Array.isArray(n.counterPositions) &&
    !!n.steelMan &&
    typeof n.steelMan === "object"
  );
}

/** WHY a saved notebook is not dealt, or `null`. Only a record that HAS a
 *  notebook can be refused: no record, and the cleared record (`notebook: null`,
 *  what `resetLive` writes), are the replay by design and nobody's trouble. */
export function refusalOf(record: ResearchNotebookStepData | null | undefined, pin: boolean = PIN_REPLAY): string | null {
  if (pin || !record || record.notebook === null || record.notebook === undefined) return null;
  if (!dealable(record.notebook)) return "the saved notebook is not a notebook this app can deal";
  if (!record.engine || typeof record.engine !== "object") return "the saved notebook has no engine receipt";
  return null;
}

const sources = new WeakMap<Notebook, NotebookSource>();

/** The active source for a `research-notebook` record. Pure: the same stored
 *  notebook always gives the same source object. */
export function activeSourceOf(
  record: ResearchNotebookStepData | null | undefined,
  pin: boolean = PIN_REPLAY,
): NotebookSource {
  if (pin || !record?.engine || typeof record.engine !== "object" || !dealable(record.notebook)) return fixtureSource();
  const notebook = record.notebook;
  let src = sources.get(notebook);
  if (!src) {
    const receipt = record.engine as EngineReceipt;
    src = sourceOf(notebook, { kind: receipt.searched === true ? "researched" : "reasoned", receipt });
    sources.set(notebook, src);
  }
  return src;
}

/** The active source as the disk has it now — for a reader with no mount.
 *  `null` when the record could not be read (the trouble is already reported
 *  through the store's channel), which is not the same answer as the replay. */
export async function readActiveNotebook(projectId: string): Promise<NotebookSource | null> {
  const r = await readStep<ResearchNotebookStepData>(projectId, LIVE_NOTEBOOK_PHASE);
  return r.ok ? activeSourceOf(r.data) : null;
}
