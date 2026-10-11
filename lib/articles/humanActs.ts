// The human's acts at the gate: approve and reject. Each is one guarded transition out of
// awaiting-approval. Rework and resume are in their own files: rework archives the files
// it makes stale, and resume restarts a run rather than deciding one.

import { readPatches } from "./runReads";
import { ArticleError, updateRun } from "./store";
import { NOTE_MAX_CHARS, type ArticleRun } from "./types";
import { defaultDeps, type EngineDeps } from "./engine";
import { trimmedNote } from "./humanNote";

/* ── the human's acts ──────────────────────────────────────────────────────── */

export async function approveRun(id: string, patchIds: string[], deps: EngineDeps = defaultDeps()): Promise<ArticleRun> {
  const known = new Set((await readPatches(id)).map((p) => p.id));
  const ids = [...new Set(patchIds.map((p) => String(p).trim()).filter(Boolean))];
  const unknown = ids.filter((p) => !known.has(p));
  if (unknown.length) throw new ArticleError(`no such patch on run ${id}: ${unknown.join(", ")}`, 400, "bad-patch");
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
  return updateRun(
    id,
    (r) => {
      if (r.status !== "awaiting-approval") throw new ArticleError(`only a run awaiting approval can be rejected; ${id} is ${r.status}`, 409, "bad-transition");
      return { ...r, status: "rejected", rejection: { at: deps.now().toISOString(), note: text.slice(0, NOTE_MAX_CHARS) } };
    },
    deps.now,
  );
}
