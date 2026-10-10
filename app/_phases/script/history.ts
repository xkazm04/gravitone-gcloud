// THE VERSION HISTORY, WALKED FORWARD.
//
// Two rules, both the registry's (versioning-snapshots: restore-semantics;
// undo-history: checkpoint-restore), and both pure so the probe lane runs them
// (tests/golden-path/script-version-history.probe.spec.ts):
//
//   1. RESTORE NEVER REWINDS. Restoring vN mints a NEW version vM that carries
//      vN's content and says `restoredFrom: vN`. It is staged as a candidate, so
//      it meets the same gate and the same accept/override path a run does, and
//      nothing in `accepted` is truncated — the "accepted over the gate"
//      receipts on the versions after vN stay where they were. A restore is
//      undone by another restore.
//
//   2. A STAGED RUN SURVIVES A RELOAD, AS A CANDIDATE. It used to be refused
//      persistence on the reasoning that restoring an unaccepted result "would
//      put it back on the pad as if it had been decided". That holds for
//      restoring it as a BASELINE. Restored as the staged candidate it is still
//      undecided — the candidate bar, the re-run gate and the two-click override
//      all stand between it and the baseline. The one thing it needs is that
//      what it was built ON has not moved: the baseline, and the notebook. If
//      either has, it is reported lost, with which.

import { BASELINE, type Version } from "./versions";

export type LostReason = "baseline-moved" | "notebook-moved" | "unreadable";

/** The receipt for a staged run that could not be put back on the pad. */
export interface LostCandidate {
  label: string;
  at: number;
  notes: number;
  /** Why it was not resumed. Absent on a receipt written before staging was
   *  persisted, when every staged run was lost by design. */
  lost?: LostReason;
}

/** A staged candidate as the pad stores it: the version, and what it was
 *  built on. */
export interface StagedRecord {
  baselineId: string;
  /** The notebook the run was made against, when the ledger was stamped. */
  digest?: string;
  candidate: Version;
}

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

/** What the pad saves for a staged candidate. */
export function stagedOf(candidate: Version, baselineId: string, digest?: string): StagedRecord {
  return { baselineId, ...(digest !== undefined ? { digest } : {}), candidate };
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isList = Array.isArray;

/** The shape a stored version must have before it is put on the pad. A staged
 *  run is a claim about a whole chain, so a damaged one is refused whole. */
export function isVersion(x: unknown): x is Version {
  if (!isObj(x)) return false;
  return (
    typeof x.id === "string" &&
    typeof x.label === "string" &&
    (x.basedOn === null || typeof x.basedOn === "string") &&
    isList(x.notes) &&
    typeof x.createdAt === "number" &&
    isObj(x.impact) &&
    isObj(x.budget) &&
    isList(x.refusals) &&
    isList(x.conflicts) &&
    isList(x.unsupported) &&
    (x.engine === "model" || x.engine === "simulated") &&
    (x.restoredFrom === undefined || typeof x.restoredFrom === "string")
  );
}

/** Whether a stored `staged` value is one this build can resume at all. */
export function isStagedRecord(x: unknown): x is StagedRecord {
  return (
    isObj(x) &&
    typeof x.baselineId === "string" &&
    (x.digest === undefined || typeof x.digest === "string") &&
    isVersion(x.candidate)
  );
}

/** Put a stored staged run back on the pad, or say why not. */
export function resumeStaged(
  staged: unknown,
  now: { baselineId: string; digest?: string },
): Version | (LostCandidate & { lost: LostReason }) {
  if (!isStagedRecord(staged)) {
    // Whatever can still be read of it is kept for the receipt — an older
    // build's {label, at, notes} receipt included.
    const s = isObj(staged) ? (isObj(staged.candidate) ? staged.candidate : staged) : {};
    return {
      lost: "unreadable",
      label: typeof s.label === "string" ? s.label : "a staged run",
      at: typeof s.at === "number" ? s.at : typeof s.createdAt === "number" ? s.createdAt : 0,
      notes: typeof s.notes === "number" ? s.notes : isList(s.notes) ? s.notes.length : 0,
    };
  }
  const c = staged.candidate;
  const lost = (why: LostReason) => ({ lost: why, label: c.label, at: c.createdAt, notes: c.notes.length });
  if (staged.digest !== undefined && now.digest !== undefined && staged.digest !== now.digest) return lost("notebook-moved");
  if (staged.baselineId !== now.baselineId || (c.basedOn ?? BASELINE.id) !== now.baselineId) return lost("baseline-moved");
  return c;
}

/** RULE 1: the history only grows. */
export function acceptInto(accepted: readonly Version[], v: Version): Version[] {
  return [...accepted, v];
}
