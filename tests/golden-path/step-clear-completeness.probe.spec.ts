// LANE — CLEARING A STEP CLEARS EVERY RECORD THE STEP OWNS (source ratchet).
//
// The Research step holds three documents per project, and only one of them is
// ordinary React state. The RUN (run/useResearchRun.ts) and the FOLLOW-UP QUEUE
// (useFollowUps.ts) both live in module scope ABOVE React, deliberately and for
// the same stated reason: the step's standing promise is that work survives
// navigating away, and a record held in a mount does not.
//
// That decision has a second edge, and it is the one this probe exists for.
// A record nothing local to a mount can LOSE is also a record nothing local to a
// mount can END. So `doClear` has to reach each store by name, and "reach each
// one" is not a property any type checks.
//
// Measured 2026-08-29: it reached two of the three. `resetFollowUps` did not
// exist. A deepen that had already RETURNED survived a Clear whose dialog tells
// the creator it discards "all of it" — the notebook, and every scoping decision
// on the board — and then reappeared under the NEXT run's board, because a
// dispatched deepen keeps its row once its card's flag is gone
// (`dispatchedDeepens` in FollowUpQueue, which is correct on its own terms). The
// board is locked until a notebook exists again, so the stale answer was never
// on screen at the moment of the mistake: only afterwards, presented as this
// notebook's follow-up research.
//
// WHY A SOURCE RATCHET AND NOT A BEHAVIOURAL ONE. The record is a React external
// store read through `useSyncExternalStore`, and this lane is Node with no DOM —
// there is no honest way to observe it here, and tests/live/ explicitly refuses
// claims about a module. What actually decays is not today's three calls; it is
// a FOURTH store added later and never wired into Clear. So the population is
// walked off the filesystem rather than listed, and growing it is what fails.

import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { test, expect } from "@playwright/test";

/** Source with comments removed, so prose about the rule cannot satisfy it.
 *  These files explain their own contracts at length directly above the code
 *  that implements them — a matcher over raw text is satisfied by a file that
 *  TALKS about clearing and never does. Same helper, same reason, as
 *  object-url-ownership.probe.spec.ts next door. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const STEP_ROOT = join(process.cwd(), "app", "_phases", "research");

/** Every .ts/.tsx file in the Research step. */
function stepSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(relative(process.cwd(), full).split("\\").join("/"));
    }
  };
  walk(STEP_ROOT);
  return out;
}

/** A module-scope record keyed by project — the shape both stores share: a
 *  `Map<string, …>` declared at the top level of the module rather than inside
 *  a hook. `subs` maps are the subscriber side of the same store, not a record
 *  of their own, so the unit here is the FILE. */
const STORE_DECL = /^const\s+\w+\s*=\s*new Map<string,/m;

/** The two stores that exist, each with the reset `doClear` must call. An entry
 *  is a claim somebody defends in review — exactly like KNOWN_LEAKS next door. */
const STORES: Record<string, string> = {
  "app/_phases/research/useFollowUps.ts": "resetFollowUps(",
  "app/_phases/research/run/useResearchRun.ts": "run.reset()",
};

test("every session-lived record the Research step owns is reachable by its Clear", () => {
  const files = stepSources();
  // A walk that reads nothing reports success in a voice indistinguishable from
  // success. Prove it read the tree before trusting the verdict.
  expect(files.length, "the source walk found nothing - it is reading the wrong tree").toBeGreaterThan(15);

  const found = files.filter((rel) => STORE_DECL.test(code(readFileSync(rel, "utf8"))));

  // THE RATCHET. A new module-scope per-project store in this step is a new
  // document with the same two edges as the other two, and whoever adds it has
  // to decide whether Clear discards it. Failing here is that decision being
  // asked for, not a defect in the new file.
  expect(
    found.sort(),
    "a session-lived record store was added to (or removed from) the Research step. Decide whether ResearchStep's doClear must reset it, wire it up, and list it in STORES here.",
  ).toEqual(Object.keys(STORES).sort());

  // And the calls themselves, in the body of doClear rather than merely present
  // somewhere in the file: `run.reset` also appears on the hook's own return.
  const step = code(readFileSync("app/_phases/research/ResearchStep.tsx", "utf8"));
  const doClear = /const doClear = \(\) => \{([\s\S]*?)\n {2}\};/.exec(step)?.[1];
  expect(doClear, "doClear was not found in ResearchStep.tsx - this probe is matching the wrong shape").toBeTruthy();

  for (const [file, call] of Object.entries(STORES)) {
    expect(doClear, `doClear does not reset the record in ${file} — it must call ${call}`).toContain(call);
  }

  // The scope is the third document and it is ordinary React state, so it is
  // not in the store population above — but Clear owes it the same reset, and
  // omitting it here would leave the one record a reader expects to see unpinned.
  expect(doClear, "doClear does not reset the scope").toContain("api.reset()");
});
