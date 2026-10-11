// SHARED PERFORM PIECES — the readback type guard, the error-message formatter,
// and the stage setter. Used by more than one per-kind perform file, so they
// live here rather than in any one of them.

/* ── Perform ──────────────────────────────────────────────────────────────── */

import type { EngineIO } from "./engine";
import { log } from "./journal";
import type { ExtractManifest, Readback } from "./types";
import { OBSERVABLE_FIELDS } from "./types";
import { ENUMS } from "./vocabulary";
import { doneUnits, totalUnits } from "./units";

export const isReadback = (v: unknown): v is Readback => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return OBSERVABLE_FIELDS.every((f) => typeof o[f] === "string") && typeof o.look === "string" && typeof o.depiction === "string";
};

/** Name every observable the model answered outside the closed vocabulary.
 *  `styleScore` drops such a field from the score as unmeasured; this is the
 *  other half � the run log says which field and which word, so a vendor
 *  drifting its vocabulary reads as a cause rather than a quieter number. */
export function logOffVocabulary(m: ExtractManifest, io: EngineIO, label: string, rb: Readback) {
  const off = OBSERVABLE_FIELDS.filter((f) => !ENUMS[f].includes(rb[f]));
  if (off.length) log(m, io, `${label}: unmeasured, off-vocabulary � ${off.map((f) => `${f}="${String(rb[f]).slice(0, 40)}"`).join(", ")}`);
}

export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function setStage(m: ExtractManifest, stage: ExtractManifest["status"]) {
  m.status = stage;
  m.progress = { stage, done: doneUnits(m), total: totalUnits(m) };
}
