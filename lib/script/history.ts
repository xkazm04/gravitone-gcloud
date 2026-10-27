// THE VERSION HISTORY, WALKED FORWARD.
//
// One rule, the registry's (versioning-snapshots: restore-semantics; undo-history:
// checkpoint-restore), and pure so the probe lane runs it
// (tests/golden-path/script-version-history.probe.spec.ts). The staged-run half of
// this file (resume a staged candidate after a reload) went to the domain step door
// (packages/domain/src/steps/script.ts), which drops a damaged staged version itself.
//
//   RESTORE NEVER REWINDS. Restoring vN mints a NEW version vM that carries
//      vN's content and says `restoredFrom: vN`. It is staged as a candidate, so
//      it meets the same gate and the same accept/override path a run does, and
//      nothing in `accepted` is truncated — the "accepted over the gate"
//      receipts on the versions after vN stay where they were. A restore is
//      undone by another restore.

import type { Version } from "@/lib/script/versions";

/** Restore `v` forward onto `baseline` as the new version `id`. Null when `v`
 *  IS the baseline — there is nothing to restore. Everything of `v` travels
 *  except what is a fact about ITS moment: the run that produced it (nothing
 *  ran now) and an override (the gate is re-run on the restore, and a fresh
 *  override, if any, is the creator's again). */
export function restoreAs(v: Version, baseline: Version, id: string, at: number): Version | null {
  if (v.id === baseline.id) return null;
  const out: Version = {
    ...v,
    id,
    label: `Restore ${id.replace(/^v/, "")}`,
    basedOn: baseline.id,
    restoredFrom: v.id,
    notes: [],
    createdAt: at,
  };
  delete out.engineRun;
  delete out.override;
  return out;
}

/** The history only grows. */
export function acceptInto(accepted: readonly Version[], v: Version): Version[] {
  return [...accepted, v];
}
