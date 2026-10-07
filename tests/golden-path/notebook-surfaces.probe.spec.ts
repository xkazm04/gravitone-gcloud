// LANE — THE NOTEBOOK SURFACES DRAW THE NOTEBOOK THEY ARE GIVEN (C1 closing stage,
// parts b and c; critic cases 4, 5 and 6).
//
// The evidence log, the notebook modal, its rail labels, the fact edges, the pills
// that open them and the Clear dialog all read the shipped run (`NOTEBOOK`,
// `NOTEBOOK_COUNTS`, `FACT_BY_ID`) at module load. So a creator's own reasoned
// notebook was announced with Bitcoin's counts, titled with Bitcoin's slug, and
// could not be opened at all when it was the only one the project had.
//
// This lane has no DOM, and Playwright's transform turns a component's JSX into
// test-runner descriptors, so a component cannot be rendered here. What is pinned
// is what each one is built from: the pure helpers (countsOf, sectionLabels,
// railFor) run for real on a reasoned notebook, and the components are read as
// source, the way the other lanes here read them.
import "fake-indexeddb/auto";

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { countsOf } from "@/app/_phases/_shared/notebook/counts";
import { railFor } from "@/app/_phases/_shared/notebook/NotebookBody";
import { sectionLabels } from "@/app/_phases/_shared/notebook/sections/H";
import { NOTEBOOK, NOTEBOOK_COUNTS } from "@/app/_phases/_shared/notebook/notebook";
import { sourceOf } from "@/app/_phases/_shared/notebook/source";

import { stripComments } from "./_helpers";
import { liveNotebook, RECEIPT } from "./_c1-harness";

const ROOT = process.cwd();
const code = (rel: string) => stripComments(readFileSync(path.join(ROOT, rel), "utf8"));
const NB = "app/_phases/_shared/notebook";

/** A reasoned notebook whose second fact contests its first, so an edge has
 *  something to resolve against. */
function reasoned() {
  const nb = liveNotebook();
  nb.facts = nb.facts.map((f, i) => (i === 1 ? { ...f, contests: [nb.facts[0]!.id] } : f));
  return sourceOf(nb, { kind: "reasoned", receipt: RECEIPT });
}

/* ───────────────────── case 4: the evidence log and the modal ────────────────── */

test("case 4: the labels, rail and counts of a reasoned notebook are its own", () => {
  const src = reasoned();
  const nb = src.notebook;
  const counts = countsOf(nb);
  expect(counts.facts).toBe(nb.facts.length);
  expect(counts.unknownsOpen).toBe(nb.unknowns.filter((u) => !u.resolvedBy).length);
  const labels = sectionLabels(nb);
  expect(labels.facts).toBe(`facts · ${nb.facts.length}`);
  expect(labels.unknowns).toBe(`unknowns · ${counts.unknownsOpen} open`);
  expect(labels.facts).not.toBe(sectionLabels(NOTEBOOK).facts);
  const rail = railFor(nb).map(([, label]) => label);
  expect(rail).toContain(`facts · ${nb.facts.length}`);
  expect(rail).toContain(`mechanisms · ${nb.mechanisms.length}`);
  // The replay is unchanged.
  expect(railFor(NOTEBOOK).map(([, l]) => l)).toContain(`facts · ${NOTEBOOK_COUNTS.facts}`);
  expect(countsOf(NOTEBOOK)).toEqual(NOTEBOOK_COUNTS);
  // A `contests` edge resolves against THIS notebook's index.
  expect(src.byId.facts[nb.facts[1]!.contests![0]!]).toBe(nb.facts[0]);
  expect(src.byId.facts["f-ath"]).toBeUndefined();
});

test("case 4: the evidence log and the body draw the source they are given, and the edges resolve in it", () => {
  const log = code(`${NB}/EvidenceLog.tsx`);
  expect(log).toMatch(/EvidenceLog\(\{ source \}: \{ source: NotebookSource \}\)/);
  expect(log).toContain("const n = source.notebook");
  expect(log).toContain("countsOf(n)");
  expect(log).toContain("facts={source.byId.facts}");
  const body = code(`${NB}/NotebookBody.tsx`);
  expect(body).toMatch(/NotebookBody\(\{ source \}: \{ source: NotebookSource \}\)/);
  expect(body).toContain("facts={source.byId.facts}");
  const row = code(`${NB}/FactRow.tsx`);
  expect(row).toContain("const other = facts[id]");
});

test("case 4: nothing that draws a notebook imports the shipped constant", () => {
  const files = ["EvidenceLog.tsx", "NotebookBody.tsx", "FactRow.tsx", ...readdirSync(path.join(ROOT, NB, "sections")).map((f) => `sections/${f}`)];
  for (const f of files) {
    const src = code(`${NB}/${f}`);
    expect(src, `${f} imports from ./notebook`).not.toMatch(/from "(\.\.?\/)+notebook"/);
    expect(src, `${f} reads SECTION_LABEL`).not.toContain("SECTION_LABEL");
    expect(src, `${f} reads the by-id constants`).not.toMatch(/(FACT_BY_ID|UNKNOWN_BY_ID|NOTEBOOK_COUNTS)/);
  }
});

/* ─────────────────────────── case 5: pills and Clear ─────────────────────────── */

test("case 5: the modals render research.source, titled and footed by the notebook they hold", () => {
  const src = code("app/_phases/research/ResearchStep.tsx");
  expect(src).toContain("title={`notebook · ${dealtSource.notebook.id}`}");
  expect(src).toContain("<NotebookBody source={dealtSource} />");
  expect(src).toContain("<EvidenceLog source={dealtSource} />");
  expect(src).not.toContain("why-bitcoin-price-does-not-rise");
  expect(src).not.toMatch(/NOTEBOOK(_COUNTS)?/);
  expect(src).toContain("const dealtSource = research.source");
  // The pills follow `dealt`, not the replay having landed.
  expect(src).toMatch(/\{dealt && \(\s*<ArtifactPills/);
});

test("case 5: the pills name the counts of the notebook they open, and a reasoned-only project carries them", () => {
  const run = code("app/_phases/research/guided/RunStage.tsx");
  expect(run).toMatch(/counts: NotebookCounts/);
  expect(run).toContain("evidence log · {counts.facts} claims");
  expect(run).not.toContain("NOTEBOOK_COUNTS");
  // The replay card draws them only while the replay is dealt; the creator's own
  // card carries them otherwise.
  expect(run).toMatch(/research\.source\.kind === "replay" && \(\s*<div className="mt-5/);
  expect(run).toMatch(/livePills =\s*research\.source\.kind !== "replay"/);
  expect(run.match(/<LiveResult state=\{live\.state\} actions=\{livePills\} \/>/g)?.length).toBe(2);
  const live = code("app/_phases/research/run/LiveResult.tsx");
  expect(live).toMatch(/\{actions && <div[^>]*>\{actions\}<\/div>\}/);
});

test("case 5: the Clear dialog states the counts and topic of the notebook it destroys", () => {
  const src = code("app/_phases/research/_parts/ScopeGate.tsx");
  expect(src).toContain("const counts = countsOf(source.notebook)");
  expect(src).toContain("{source.notebook.topic}");
  expect(src).toContain("<strong>{counts.facts} facts</strong>");
  expect(src).not.toContain("NOTEBOOK_COUNTS");
  expect(code("app/_phases/research/ResearchStep.tsx")).toContain("source={dealtSource}");
});
