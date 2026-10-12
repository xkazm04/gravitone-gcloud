// GRAPH CONTROL for the notebook (app/_phases/_shared/notebook/).
//
// Run:  npx tsx pipeline/check-notebook.mts
//
// Shaped like gate-regression.mts: a line per finding, a count at the end, a
// non-zero exit if anything is broken. There is no test framework in this repo
// and this is not the place to introduce one (integration-imaging.mts:8) — the
// whole apparatus is this file plus the dev-only assertion at the bottom of
// _shared/notebook/cards.ts, which prints the same list into the browser
// console on every page load.
//
// WHY, stated once. The notebook is a graph held together by string ids and
// nothing checked that the graph was real:
//
//   · `woundsOf()` (research/scope.ts:59-71) wounds only when a dependency id
//     is EXPLICITLY DESCOPED. A typo'd or deleted id is never in the `gone`
//     set, so it never wounds anything. A stale reference and a healthy one
//     look identical — and the one that looks healthy is the dangerous one,
//     because the board reports no wound and the reviewer believes it.
//   · `FACT_BY_ID` / `UNKNOWN_BY_ID` are `Object.fromEntries` (notebook.ts:168,
//     171), so a reused id silently overwrites the earlier row.
//   · `CARD_DIMENSION` is a hand-maintained id→column table, so a new fact
//     nobody tagged falls to `untagged` — and no board renders that bucket.
import { notebookIssues } from "../app/_phases/_shared/notebook/cards";
import { CONCLUSIONS, conclusionIssues } from "../app/_phases/_shared/notebook/conclusions";
import { diffSnapshots, measureCorpus, readSnapshot, SNAPSHOT_PATH, UPDATE_ENV } from "../lib/notebook/corpus";

const issues = notebookIssues();
for (const i of issues) {
  console.log(`BROKEN  [${i.kind}]  ${i.from}  →  ${i.ref}`);
  console.log(`        ${i.detail}`);
}

// ADVISORY, and deliberately not part of the exit code. `conclusionIssues()` is
// the reviewer's findings list, not a build gate, and `c-reserve-was-the-product`
// is left FAILING it on purpose — it is the exemplar the compound-claim evasion
// was demonstrated on (conclusions.ts:459-462). A check that painted the
// exemplar red would be switched off within a week, and the graph check with it.
const advisory = CONCLUSIONS.flatMap((c) =>
  conclusionIssues(c).map((i) => `${c.id} · ${i.rule} — ${i.detail}`),
);
console.log(`\nconclusion findings — ${advisory.length}, advisory, never failures`);
for (const a of advisory) console.log(`  · ${a}`);

// THE CORPUS. The graph check above reads one hand-retyped fixture; the tree also
// tracks real notebooks from research runs, in the snake_case NOTEBOOK-SCHEMA
// dialect. They walk the same door the app uses (adapter -> parseNotebook) and
// their per-file verdict is pinned to an approved snapshot, the same one
// tests/golden-path/notebook-corpus.probe.spec.ts reads. A REJECTED member is
// not a failure here (every tracked run predates rules that bind new notebooks);
// a verdict that CHANGED, or a member nobody approved, is.
const corpus = measureCorpus(process.cwd());
const corpusDiff = diffSnapshots(readSnapshot(process.cwd()), corpus);
console.log(`\ncorpus — ${Object.keys(corpus).length} tracked notebook(s)`);
for (const [p, v] of Object.entries(corpus)) {
  const n = Object.values(v.findings).reduce((a, b) => a + b, 0);
  console.log(`  · ${v.verdict.padEnd(8)} ${p}  (${v.dialect}, ${n} finding(s), ${Object.keys(v.unmapped).length} unmapped key(s))`);
}
for (const d of corpusDiff) console.log(`CORPUS  ${d}`);
if (corpusDiff.length) console.log(`  re-approve with ${UPDATE_ENV}=1 on the probe, after reading the diff (${SNAPSHOT_PATH})`);

console.log(
  issues.length
    ? `\n${issues.length} BROKEN EDGE(S) — every one is a card that cannot be wounded, or a row that vanished.`
    : `\nthe notebook graph resolves: no id spent twice, no reference to nothing, every card tagged.`,
);
process.exit(issues.length || corpusDiff.length ? 1 : 0);
