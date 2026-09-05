// LANE — A COMMIT THAT FAILED SAYS SO INSIDE THE DIALOG THAT ASKED FOR IT
// (source ratchet).
//
// dialog-closes-on-success.probe.spec.ts next door states this repo's rule for
// /projects: "closing a confirmation over work that was not done is the same
// small lie as a button that does nothing." The foundry's two commit dialogs
// got the first half right — a failed commit leaves the dialog open — and then
// wrote the reason somewhere nobody could read it.
//
// Both `doCommit`s caught their error into `runsError`, which renders beside
// the run list. components/ui/Modal is `fixed inset-0 z-50` over a backdrop at
// 80% opacity with a blur, and it carries `aria-modal="true"` — so the message
// was behind the blur for a sighted reader and outside the accessibility tree
// for a screen reader, which is what aria-modal means. Meanwhile the dialog's
// button went from "committing…" back to its label: indistinguishable from a
// click that never registered. The forge's commit deletes files, so "did that
// just happen?" is not a small question to leave a human holding.
//
// WHY A SOURCE RATCHET, and not a render. Same reasoning the sibling probe
// gives: the decision lives in a closure over several hooks, the probe lane has
// no DOM, and forcing a commit to 409 in the live lane to watch a paragraph
// appear is a large apparatus for a small rule. What decays is where the catch
// WRITES and whether the dialog RENDERS it — both source-shaped.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

// Comments stripped — these views explain the rule directly above the code that
// implements it, and through the shared scanner, since the two-`replace` pair
// hides a region of any file whose prose contains a route glob.
const code = (rel: string) => stripComments(readFileSync(join(process.cwd(), rel), "utf8"));

const SURFACES = [
  { view: "app/foundry/FoundryView.tsx", commit: "commitRun(" },
  { view: "app/foundry/ExtractView.tsx", commit: "commitExtractRun(" },
] as const;

/** The body of `const doCommit = async () => {` to its closing `};`. */
function doCommitBody(src: string, rel: string): string {
  const i = src.indexOf("const doCommit = async () => {");
  expect(i, `${rel}: doCommit not found — this probe is matching the wrong shape`).toBeGreaterThan(-1);
  const end = src.indexOf("\n  };", i);
  expect(end, `${rel}: could not find the end of doCommit`).toBeGreaterThan(i);
  return src.slice(i, end);
}

for (const { view, commit } of SURFACES) {
  test(`${view}: a failed commit is reported into the dialog, not behind it`, () => {
    const src = code(view);
    expect(src.length, `${view} read as empty — the probe is reading the wrong tree`).toBeGreaterThan(2000);

    const body = doCommitBody(src, view);
    expect(body.includes(commit), `${view}: doCommit no longer calls ${commit}`).toBe(true);

    // The catch must not route the failure to the page-level banner: that is
    // the exact regression, and it looks perfectly reasonable in a diff.
    const catchAt = body.indexOf("catch");
    expect(catchAt, `${view}: doCommit no longer catches`).toBeGreaterThan(-1);
    const rescue = body.slice(catchAt);
    expect(rescue.includes("setCommitError("), `${view}: doCommit's catch must set commitError`).toBe(true);
    expect(
      rescue.includes("setRunsError("),
      `${view}: doCommit's catch writes runsError — that renders behind an aria-modal dialog`,
    ).toBe(false);

    // And the dialog must actually render it. A state nobody reads is the same
    // silence with more code.
    expect(/\{commitError && \(/.test(src), `${view}: commitError is set and never rendered`).toBe(true);
    expect(/role="alert"/.test(src), `${view}: the failure is rendered without role="alert"`).toBe(true);
  });
}

test("the confirm dialog clears a stale failure when it is dismissed", () => {
  // Otherwise a message about the previous attempt greets the next one.
  for (const { view } of SURFACES) {
    const src = code(view);
    const at = src.indexOf("onClose={() => {");
    expect(at, `${view}: the confirm dialog's onClose is no longer a block`).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200).includes("setCommitError(null)"), `${view}: onClose does not clear commitError`).toBe(true);
  }
});
