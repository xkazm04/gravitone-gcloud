// WHO IS DRAWING A CODEX BOARD. A board drawn in process has no job (codexDraw.ts), so nothing else can tell a draw in
// flight from one whose process died. The owner is stamped when the board is written pending, in the shape
// lib/turns/ledger.ts uses: the boot id of the process, its pid, its host. A board whose owner is provably gone is
// settled by `collectStoryboards`; one whose owner may be alive is left alone.

import { hostname } from "node:os";

import { currentBootId } from "../../turns/ledger.ts";
import { settledBoard } from "../../producers/scoutStoryboardActs.ts";
import type { CodexOwner, StoryboardCandidate } from "./types.ts";

export const ownerNow = (): CodexOwner => ({ bootId: currentBootId(), pid: process.pid, host: hostname() });

/** Gone only when provable: this process's boot id is alive; another host cannot be probed and is gone (the ledger's rule). */
export function ownerGone(o: CodexOwner): boolean {
  if (o.bootId === currentBootId()) return false;
  if (o.host !== hostname()) return true;
  if (o.pid === process.pid) return true; // our pid under an earlier boot id
  try {
    process.kill(o.pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "EPERM";
  }
}

/** The board told how its draw ended, with no job and no owner: rendered while any frame landed, failed when none did. */
export function settledCodexBoard(c: StoryboardCandidate, ending: "done" | "failed", id: string, error?: string): StoryboardCandidate {
  const settled = settledBoard(c, ending, { id, ...(error === undefined ? {} : { error: { message: error } }) });
  if (settled === null) return c;
  const { jobId: _noJob, owner: _noOwner, ...rest } = settled;
  return rest as StoryboardCandidate;
}
