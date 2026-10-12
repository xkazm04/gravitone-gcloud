// The critique step: the round loop, and the panel snapshot a run is reviewed by. The
// reviewers, the writer's turns and the check between them are in their own files.

import path from "node:path";

import { loadPanel, roundDir, type ReviewerPanel, validatePanel } from "./critique";
import { checkLoop, noteCheckError } from "./checkLoop";
import { fileExists } from "./files";
import { reviewRound, syncCritiqueSummary } from "./critiqueReviews";
import { revise, writerAnswers } from "./critiqueWriter";
import { readJsonFile, runDir, writeJsonAtomic } from "./store";
import { StepError, sumCost } from "./stepFailure";
import type { CritiqueDecisionRecord } from "./types";
import type { EngineDeps } from "./engine";

/* ── the critique step (scope amendment 1) ─────────────────────────────────── */
//
//   round n:  every reviewer of the panel, in parallel, blind to each other,
//             each in its own read-only workspace (a copy of post/, sources.json
//             and REVIEW.md) -> critique/round-n/reviews/<id>.json
//             fewer than `minCompleted` completed -> `critique-quorum`, failed
//             -> the WRITER (the draft's model) answers every finding and
//             decides: critique/round-n/{dispositions,decision}.json
//             keep -> the step is done
//             rewrite -> a rewrite turn replaces post/
//             research -> a research turn (web) updates sources/claims, then
//             the rewrite turn
//             -> round n+1 reviews the revision; in the LAST round the writer
//             may only keep or rewrite, and a last rewrite is not re-reviewed.
//
// RESUMABLE AT EVERY FILE. A reviewer whose review file exists never runs
// again; a round with closed.json runs no reviewer at all; a round with its
// decision runs no writer turn; a round with revised.json is not revised
// again. A killed or failed run resumes inside the step from the first file
// that is missing.
//
// COST BOUND, in agent turns: per round, one per reviewer plus at most one
// retry each for a malformed review, one writer turn plus at most one retry
// for an invalid answer, and at most two revision turns (research, rewrite).
// With the four-reviewer panel and two rounds: 8 turns at the least (round 1
// and keep, plus the three writer turns before it: 3 + 4 + 1), 26 at the most
// (3 + round 1: 4+4+1+1+2 + round 2: 4+4+1+1+1).

/** The panel this run is reviewed by: the snapshot taken when its critique
 *  began, so a resume (or the UI) never meets a panel the run did not start
 *  with. The first call reads pipeline/article-reviewers.json (or
 *  ARTICLES_REVIEWERS_FILE) and writes the snapshot. */
async function critiquePanel(dir: string, deps: EngineDeps): Promise<ReviewerPanel> {
  const snap = path.join(dir, "critique", "reviewers.json");
  const held = await readJsonFile<unknown>(snap, undefined);
  if (held !== undefined) return validatePanel(held, snap);
  const panel = await loadPanel(deps.root);
  await writeJsonAtomic(snap, panel);
  return panel;
}

export async function critiqueStep(id: string, deps: EngineDeps): Promise<number | undefined> {
  const dir = runDir(id);
  let cost: number | undefined;
  try {
    const panel = await critiquePanel(dir, deps);
    for (let round = 1; round <= panel.maxCritiqueRounds; round++) {
      const last = round === panel.maxCritiqueRounds;
      const rd = path.join(dir, ...roundDir(round).split("/"));

      if (!(await fileExists(path.join(rd, "closed.json")))) cost = sumCost(cost, await reviewRound(id, round, panel, deps));

      let decision = await readJsonFile<CritiqueDecisionRecord | null>(path.join(rd, "decision.json"), null);
      if (!decision || !(await fileExists(path.join(rd, "dispositions.json")))) {
        const answered = await writerAnswers(id, round, panel, last, deps);
        cost = sumCost(cost, answered.cost);
        decision = answered.decision;
      }
      await syncCritiqueSummary(id, deps);
      if (decision.decision === "keep") return cost;

      if (!(await fileExists(path.join(rd, "revised.json")))) cost = sumCost(cost, await revise(id, round, panel, decision, deps));
      // The revision is checked before anyone reviews it again (or before the gate):
      // the check's failures go back to the writer as mandatory fixes. Idempotent on resume.
      cost = sumCost(cost, await checkLoop(id, `round-${round}`, deps).catch(noteCheckError));
      if (last) return cost;
    }
    return cost;
  } catch (e) {
    await syncCritiqueSummary(id, deps).catch(() => undefined);
    // A thrown StepError carries the cost of the turns that ran inside the
    // failing call; the rounds before it are in `cost`.
    throw new StepError((e as Error).message, sumCost(cost, e instanceof StepError ? e.costUsd : undefined));
  }
}
