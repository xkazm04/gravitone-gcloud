// The human's acts at the gate: approve and reject. Each is one guarded transition out of
// awaiting-approval. Rework and resume are in their own files: rework archives the files
// it makes stale, and resume restarts a run rather than deciding one.
//
// A TRIAL RUN changes each act in one place. Approve always carries the run's `required`
// patches (the trial's measurement record, which the post cites as source 1), whatever the
// caller named: the CLI, the route and the Board all come through here, so none of them can
// land a post whose first citation does not exist. Reject keeps the measurement: it appends
// one `application` lead (lib/articles/trial/leads.ts), because a post can be rejected for its
// prose while the experiment under it stands.

import path from "node:path";

import { readPatches } from "./runReads";
import { ArticleError, runDir, updateRun } from "./store";
import { appendLead } from "./trial/leads";
import { trialLead } from "./trial/registryRecord";
import { readTrialDetail } from "./trial/store";
import { NOTE_MAX_CHARS, type ArticleRun } from "./types";
import { defaultDeps, type EngineDeps } from "./engine";
import { trimmedNote } from "./humanNote";

/* ── the human's acts ──────────────────────────────────────────────────────── */

export async function approveRun(id: string, patchIds: string[], deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const patches = await readPatches(id);
  const known = new Set(patches.map((p) => p.id));
  const named = [...new Set(patchIds.map((p) => String(p).trim()).filter(Boolean))];
  const unknown = named.filter((p) => !known.has(p));
  if (unknown.length) throw new ArticleError(`no such patch on run ${id}: ${unknown.join(", ")}`, 400, "bad-patch");
  const ids = [...named, ...patches.filter((p) => p.required && !named.includes(p.id)).map((p) => p.id)];
  return updateRun(
    id,
    (r) => {
      if (r.status !== "awaiting-approval") throw new ArticleError(`only a run awaiting approval can be approved; ${id} is ${r.status}`, 409, "bad-transition");
      return { ...r, status: "approved", approval: { at: deps.now().toISOString(), patches: ids } };
    },
    deps.now,
  );
}

export async function rejectRun(id: string, note: string, deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const text = trimmedNote(note, "a rejection");
  const rejected = await updateRun(
    id,
    (r) => {
      if (r.status !== "awaiting-approval") throw new ArticleError(`only a run awaiting approval can be rejected; ${id} is ${r.status}`, 409, "bad-transition");
      return { ...r, status: "rejected", rejection: { at: deps.now().toISOString(), note: text.slice(0, NOTE_MAX_CHARS) } };
    },
    deps.now,
  );
  if (rejected.trial) await keepRejectedMeasurement(rejected, deps.now());
  return rejected;
}

/** The rejection is already recorded; a lead that cannot be written is logged, never a
 *  reason to undo the human's act. */
async function keepRejectedMeasurement(run: ArticleRun, now: Date): Promise<void> {
  const ref = run.trial!;
  try {
    const detail = await readTrialDetail(path.join(runDir(run.id), "experiment"));
    if (!detail) throw new Error("experiment/verdict.json is missing");
    await appendLead(
      trialLead({
        kind: "application",
        prereg: detail.prereg,
        verdict: detail.verdict,
        trialId: ref.id,
        applicationPath: ref.applicationPath,
        now,
        runId: run.id,
        ...(run.rejection?.note ? { note: run.rejection.note } : {}),
      }),
    );
  } catch (e) {
    console.error(`[articles] ${run.id}: the rejected trial ${ref.id} left no registry lead: ${(e as Error).message}`);
  }
}
