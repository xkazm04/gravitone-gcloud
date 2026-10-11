// SHARED PERFORM PIECES — the readback type guard, the error-message formatter,
// and the stage setter. Used by more than one per-kind perform file, so they
// live here rather than in any one of them.

/* ── Perform ──────────────────────────────────────────────────────────────── */

import type { ExtractManifest, Readback } from "./types";
import { OBSERVABLE_FIELDS } from "./types";
import { doneUnits, totalUnits } from "./units";

export const isReadback = (v: unknown): v is Readback => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return OBSERVABLE_FIELDS.every((f) => typeof o[f] === "string") && typeof o.look === "string" && typeof o.depiction === "string";
};

export const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function setStage(m: ExtractManifest, stage: ExtractManifest["status"]) {
  m.status = stage;
  m.progress = { stage, done: doneUnits(m), total: totalUnits(m) };
}
