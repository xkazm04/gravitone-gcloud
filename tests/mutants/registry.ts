// THE MUTANT REGISTRY - every entry names a defect a probe claims to guard, in a
// form a machine can seed and watch go red.
//
// The lane's own probe headers record probes that were GREEN WHILE THE DEFECT WAS
// ALIVE, and each time it was found by hand ("seed the defect and watch it fail
// to go red"). This file turns that ritual into data:
//
//   - `pipeline/probe-mutants.mts` (npm run test:mutants) applies each entry in a
//     scratch git worktree, runs the named probe, and demands a non-zero exit;
//   - `tests/golden-path/mutant-registry.probe.spec.ts` (inside `npm test`,
//     cheap) checks that every `find` still occurs EXACTLY ONCE, so a refactor
//     that moves the code turns the mutant STALE and loud, never silently skipped,
//     and ratchets the number of probes with no mutant at all.
//
// Entry rules:
//   - `find` occurs exactly once in `file` (verbatim, whitespace included);
//   - `replace` differs from `find` and must change BEHAVIOUR, not a comment - a
//     toothless mutant is reported `survived` by the runner;
//   - `probe` is a file name under tests/golden-path/;
//   - `why` is the counterfactual in a sentence: what breaks for a user.

export type Mutant = {
  id: string;
  /** Probe file under tests/golden-path/ that must go red. */
  probe: string;
  /** Repo-relative source file, forward slashes. */
  file: string;
  find: string;
  replace: string;
  why: string;
};

/**
 * PROBES WITH NO MUTANT. A ratchet: it may only FALL. A new `*.probe.spec.ts`
 * without an entry raises the live count above this number and
 * mutant-registry.probe.spec.ts refuses; an entry that guards a previously
 * unguarded probe lowers the live count and the same probe asks for this number
 * to be lowered to match, so the gain is kept.
 */
export const UNGUARDED_PROBE_BUDGET = 250;

export const MUTANTS: Mutant[] = [
  {
    id: "repair-no-shrink-guard-off",
    probe: "repair-turn.probe.spec.ts",
    file: "lib/text/repair.ts",
    find: "if (lost > 0)",
    replace: "if (lost > 9999)",
    why: "A repair turn can delete the facts that failed validation to make the validator pass, and the creator keeps a thinner notebook believing it was repaired.",
  },
  {
    id: "repair-unchanged-elsewhere-off",
    probe: "repair-turn.probe.spec.ts",
    file: "lib/text/repair.ts",
    find: "if (allowed.some((a) => covers(a, changed))) continue;",
    replace: "if (true) continue;",
    why: "A repair turn may rewrite fields it was never asked about, and the paid-for draft is silently changed outside the listed paths.",
  },
  {
    id: "shelf-no-tiebreak",
    probe: "sort-stability.probe.spec.ts",
    file: "app/_projects/shelf.ts",
    find: "updated: (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),",
    replace: "updated: (a, b) => b.updatedAt - a.updatedAt,",
    why: "Two projects touched in the same millisecond swap places with the order the data arrived in.",
  },
  {
    id: "needs-you-no-tiebreak",
    probe: "sort-stability.probe.spec.ts",
    file: "app/_projects/shelf.ts",
    find: "    a.id.localeCompare(b.id)",
    replace: "    0",
    why: "The Rundown order stops being a total order; tied rows render in arrival order.",
  },
  {
    id: "eviction-skip-upload-delete",
    probe: "identity-eviction-idb.probe.spec.ts",
    file: "lib/identityEviction.ts",
    find: "if (!dry) uploads.delete(uploadId);",
    replace: "if (!dry) void uploadId;",
    why: "Sign-out leaves the previous account's upload bytes on the shared machine, unreachable by any later wipe.",
  },
  {
    id: "research-clear-keeps-followups",
    probe: "step-clear-completeness.probe.spec.ts",
    file: "app/_phases/research/ResearchStep.tsx",
    find: "resetFollowUps(projectId);",
    replace: "void projectId;",
    why: "Clearing research leaves the old follow-up thread attached to the fresh run.",
  },
  {
    id: "recalibrate-drops-chain-breaks",
    probe: "chain-break-reaches-the-reviewer.probe.spec.ts",
    file: "app/_phases/script/recalibrate.ts",
    find: "(applied[r.id]?.chainBreaks ?? [])",
    replace: "([] as { renderId?: string }[])",
    why: "A cut that orphans a BUT is detected, then discarded before the reviewer can see it.",
  },
  {
    id: "spine-tail-first",
    probe: "spine-rank-total.probe.spec.ts",
    file: "app/_phases/script/trailer/types.ts",
    find: "tail: 4,",
    replace: "tail: -1,",
    why: "The tail movement is composed ahead of the cold open.",
  },
  {
    id: "spine-ordinal-ignored",
    probe: "spine-rank-total.probe.spec.ts",
    file: "app/_phases/script/trailer/cut.ts",
    find: "return ra !== rb ? ra - rb : a.ordinal - b.ordinal;",
    replace: "return ra - rb;",
    why: "Two movements of the same role keep arrival order instead of their own ordinal.",
  },
  {
    id: "alt-last-one-removable",
    probe: "alt-last-one-stays.probe.spec.ts",
    file: "app/_phases/frames/alternatives/alts.ts",
    find: "isSynthetic(frameId) || keptCount > 1;",
    replace: "isSynthetic(frameId) || keptCount > 0;",
    why: "The last kept alternative can be removed, leaving a frame with nothing to show.",
  },
  {
    id: "cancel-settled-job",
    probe: "cancel-settled-job.probe.spec.ts",
    file: "lib/jobs.tsx",
    find: 'j.id === jobId && j.status === "running"',
    replace: "j.id === jobId",
    why: "Cancelling a job that already finished rewrites its settled result as 'Stopped by you'.",
  },
  {
    id: "clear-any-job",
    probe: "bell-doors.probe.spec.ts",
    file: "lib/jobs.tsx",
    find: '!target || target.status !== "interrupted" || target.clearedAt != null',
    replace: "!target || target.clearedAt != null",
    why: "Clear works on running and finished jobs, not only interrupted ones.",
  },
  {
    id: "cull-failed-looks-ready",
    probe: "cull-non-ready.probe.spec.ts",
    file: "app/foundry/CullGrid.tsx",
    find: 'if (candidate?.status === "failed") return "failed";',
    replace: 'if (candidate?.status === "failed") return "ready";',
    why: "A failed candidate opens as a ready one, with Keep/Reject on a broken file.",
  },
  {
    id: "cull-deleted-looks-live",
    probe: "cull-non-ready.probe.spec.ts",
    file: "app/foundry/CullGrid.tsx",
    find: 'if (candidate?.deleted) return "deleted";',
    replace: 'if (candidate?.deleted) return "queued";',
    why: "A deleted candidate reappears in the grid as queued work.",
  },
  {
    id: "exit-drops-stderr-tail",
    probe: "cli-exit-classification.probe.spec.ts",
    file: "lib/claudeCli.ts",
    find: '`The local Claude process exited ${code}.${tail ? ` stderr: ${tail}` : ""}`',
    replace: "`The local Claude process exited ${code}.`",
    why: "The one line the engine wrote about why it failed reaches neither the log nor the route's answer.",
  },
  {
    id: "exit-login-not-detected",
    probe: "cli-exit-classification.probe.spec.ts",
    file: "lib/claudeCli.ts",
    find: "/login|auth|credential/i.test(stderr)",
    replace: "/zzz-never-matches/i.test(stderr)",
    why: "A logged-out CLI is reported as a generic crash instead of telling the creator to sign in.",
  },
  {
    id: "forbid-only-ignores-gate-switch",
    probe: "forbid-only-gate.probe.spec.ts",
    file: "playwright.config.ts",
    find: "forbidOnly: !!process.env.CI || !!process.env.PW_FORBID_ONLY,",
    replace: "forbidOnly: !!process.env.CI,",
    why: "A committed test.only reduces the pre-push gate to one test and exits 0.",
  },
];
