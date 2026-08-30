// LANE — NOTEBOOK GRAPH INTEGRITY (dynamic).
//
// The notebook is a graph held together by string ids and nothing typed
// enforces it. Two failures it can have are silent by construction:
//
//   · a duplicate id — FACT_BY_ID / UNKNOWN_BY_ID are Object.fromEntries, so the
//     later row wins and the earlier one disappears with no error at all
//   · a dangling dependsOn — woundsOf() wounds only when a dependency id is
//     EXPLICITLY DESCOPED, so an id that resolves to nothing can never be in the
//     `gone` set, can never wound, and is indistinguishable from a healthy edge
//
// `notebookIssues()` is the only thing that catches either, and until now it was
// verified by a dev-only browser console line and a script somebody had to
// remember to type. cards.ts justified that with "This repo has no test suite
// and declined to add one" — which was true when it was written and is not now.
//
// This probe does the two jobs that comment's apparatus could not: it asserts
// the SHIPPED fixture is clean (so a bad edit fails CI rather than printing into
// a console nobody has open), and it drives the checker against deliberately
// broken notebooks, so a checker that silently stopped detecting anything is
// itself detected. A green check over a checker that cannot fail is the failure
// mode this probe exists for.
import { test, expect } from "@playwright/test";
import { notebookIssues } from "@/app/_phases/_shared/notebook/cards";
import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";

/** A structural clone, so a mutation in one case cannot reach the next. */
const clone = (): Notebook => structuredClone(NOTEBOOK);

test("notebook-graph: the SHIPPED fixture has no broken edges", () => {
  const issues = notebookIssues();
  for (const i of issues) console.log(`[graph] ${i.kind} ${i.from} -> ${i.ref}`);
  expect(issues).toEqual([]);
});

test("notebook-graph: a duplicate id is caught — the row Object.fromEntries would eat", () => {
  const nb = clone();
  // Spend an id already owned by facts[] on a second row. One namespace,
  // deliberately: ids are quoted across sections with no type tag.
  nb.unknowns = [...nb.unknowns, { ...nb.unknowns[0], id: nb.facts[0].id }];

  const dupes = notebookIssues(nb).filter((i) => i.kind === "duplicate-id");
  expect(dupes.length).toBeGreaterThan(0);
  expect(dupes[0].ref).toBe(nb.facts[0].id);
});

test("notebook-graph: a dangling dependsOn is caught — the edge that can never wound", () => {
  const nb = clone();
  // A reversal citing a fact that does not exist. This is the edge woundsOf()
  // reads, and the one it cannot tell from a healthy one.
  nb.reversals = [{ ...nb.reversals[0], evidence: ["f-does-not-exist"] }, ...nb.reversals.slice(1)];

  const dangling = notebookIssues(nb).filter((i) => i.kind === "dangling-ref");
  expect(dangling.some((i) => i.ref === "f-does-not-exist")).toBe(true);
});

test("notebook-graph: an untagged card is caught, not silently filed", () => {
  const nb = clone();
  nb.facts = [...nb.facts, { ...nb.facts[0], id: "f-untagged-probe" }];

  const untagged = notebookIssues(nb).filter((i) => i.kind === "untagged");
  expect(untagged.some((i) => i.ref === "f-untagged-probe")).toBe(true);
});

test("notebook-graph: mechanism evidence is a card edge, so it can wound", () => {
  const nb = clone();
  // The half that used to be discarded: buildCards hardcoded `dependsOn: []`
  // for mechanisms, so authored evidence never became an edge at all. A
  // dangling one must now be reported through the dependsOn pass.
  nb.mechanisms = [{ ...nb.mechanisms[0], evidence: ["f-no-such-fact"] }, ...nb.mechanisms.slice(1)];

  const issues = notebookIssues(nb).filter((i) => i.ref === "f-no-such-fact");
  expect(issues.some((i) => i.from === `${nb.mechanisms[0].id}.dependsOn`)).toBe(true);
});

test("notebook-graph: a scale conversion with no `for` is caught — the ABSENT link", () => {
  const nb = clone();
  // The blindness this case exists for: edge() skips a null ref, so a
  // conversion that names no fact used to be indistinguishable from a linked
  // one, exactly as a dangling dependsOn is indistinguishable from a healthy
  // one. A felt version of a number is a derived claim; unlinked, nothing can
  // check it against the claim it restates or cap it at that fact's grade.
  nb.scaleConversions = [{ raw: "$1bn", felt: "a thousand million" }, ...nb.scaleConversions.slice(1)];

  const unlinked = notebookIssues(nb).filter((i) => i.kind === "unlinked-conversion");
  expect(unlinked.some((i) => i.ref === "$1bn")).toBe(true);
});
