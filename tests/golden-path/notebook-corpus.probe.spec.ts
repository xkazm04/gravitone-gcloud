// LANE — THE NOTEBOOK CORPUS (dynamic).
//
// Every other notebook probe asserts against ONE hand-retyped fixture. The tree
// also tracks real notebooks written by terminal research runs, in a second
// (snake_case NOTEBOOK-SCHEMA) dialect that no code read, whose top-level keys
// drift from run to run. This lane gives them a door: the population is
// `git ls-files "*notebook.json"` — derived, never listed — and each member goes
// through the dialect adapter, `parseNotebook`, and (if accepted) the consumers.
//
// What a member yields is `{dialect, verdict, findings by rule, unmapped}`,
// pinned to an approved snapshot (`__snapshots__/notebook-corpus.json`).
// Rewriting the snapshot needs NOTEBOOK_CORPUS_UPDATE=1; without it the rewrite
// is refused and the diff is printed.
//
// HONEST SCOPE. Today every tracked member is REJECTED by `parseNotebook`
// (claims over the 90-character budget, comma-joined sources, a missing
// `hazard`: rules the schema marks binding on new notebooks). That is a verdict
// worth pinning, not a failure of the lane — but it means the consumer test
// below walks zero notebooks today. It is written over "every accepted member"
// so it starts biting the day one is accepted, and it says so in its log line.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { buildCards, notebookIssues } from "@/app/_phases/_shared/notebook/cards";
import { NOTEBOOK } from "@/app/_phases/_shared/notebook/notebook";
import { sourceOf } from "@/app/_phases/_shared/notebook/source";
import {
  adaptMember,
  approveSnapshot,
  corpusPaths,
  diffPaths,
  diffSnapshots,
  judge,
  measureCorpus,
  readMember,
  readSnapshot,
  SNAPSHOT_PATH,
  UPDATE_ENV,
  type CorpusSnapshot,
} from "@/lib/notebook/corpus";
import { detectDialect, fromSchemaDialect } from "@/lib/notebook/dialect";

const ROOT = resolve(__dirname, "../..");
const CONFLICT_OSINT = "gauntlet/runs/2026-08-12-l1-first-sweep/l2/conflict-osint/notebook.json";
const RUN_1 = "pipeline/runs/2026-08-11-why-bitcoin-price-does-not-rise/notebook.json";

/* ── 1 · the population is derived, and every member is approved ─────────────── */

test("notebook-corpus: every tracked notebook.json is an approved member (or the update flag is set)", () => {
  const actual = measureCorpus(ROOT);
  const paths = corpusPaths(ROOT);
  console.log(`[corpus] ${paths.length} tracked notebook(s)`);
  expect(paths.length).toBeGreaterThan(0);

  if (process.env[UPDATE_ENV] === "1") {
    const diff = approveSnapshot(ROOT, actual);
    console.log(`[corpus] snapshot rewritten (${UPDATE_ENV}=1)\n${diff.join("\n") || "(no differences)"}`);
    return;
  }
  expect(diffSnapshots(readSnapshot(ROOT), actual), `re-approve with ${UPDATE_ENV}=1 after reading the diff`).toEqual([]);
});

test("notebook-corpus: a member the snapshot has never seen fails as 'unapproved corpus member'", () => {
  const actual = measureCorpus(ROOT);
  const approved: CorpusSnapshot = { ...actual };
  const [first] = Object.keys(approved);
  delete approved[first];
  expect(diffSnapshots(approved, actual)).toEqual([`unapproved corpus member ${first}`]);
});

test("notebook-corpus: a snapshot rewrite without the env flag is refused, with the diff printed", () => {
  const dir = mkdtempSync(join(tmpdir(), "nb-corpus-"));
  try {
    mkdirSync(join(dir, "tests/golden-path/__snapshots__"), { recursive: true });
    const file = join(dir, SNAPSHOT_PATH);
    writeFileSync(file, "{}\n");
    const actual = measureCorpus(ROOT);

    expect(() => approveSnapshot(dir, actual, {})).toThrow(/refusing to rewrite[\s\S]*unapproved corpus member/);
    expect(readFileSync(file, "utf8")).toBe("{}\n"); // refused means untouched

    approveSnapshot(dir, actual, { [UPDATE_ENV]: "1" });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(actual);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── 2 · the adapter ─────────────────────────────────────────────────────────── */

test("notebook-corpus: fromSchemaDialect(conflict-osint) maps the arrays and REPORTS what it did not map", () => {
  const raw = readMember(ROOT, CONFLICT_OSINT) as Record<string, unknown>;
  expect(detectDialect(raw)).toBe("schema");

  const { notebook, unmapped } = fromSchemaDialect(raw);
  expect(Array.isArray(notebook.counterPositions)).toBe(true);
  expect(Array.isArray(notebook.analogyCandidates)).toBe(true);
  expect((notebook.counterPositions as unknown[]).length).toBe((raw.counter_positions_to_state_fairly as unknown[]).length);

  // Keys the schema's field tables do not declare are counted, not dropped.
  for (const k of ["prior", "prior_outcome", "normal_range", "domains", "$schema"]) {
    expect(unmapped[k], `unmapped should list ${k}`).toBe(1);
    expect(k in notebook).toBe(false);
  }
  // ...and nothing it DID map shows up as unmapped.
  expect(unmapped.template_intent).toBeUndefined();
  expect(notebook.templateIntent).toBe(raw.template_intent);
  expect((notebook.tension as Record<string, unknown>).whyItIsATension).toBe(
    (raw.tension as Record<string, unknown>).why_it_is_a_tension,
  );
});

test("notebook-corpus: a key the map does not know is counted, never silently dropped", () => {
  const { unmapped, notebook } = fromSchemaDialect({
    topic: "x",
    brand_new_key: 1,
    facts: [{ id: "f", surprise: true }, { id: "g", surprise: true }],
  });
  expect(unmapped).toEqual({ brand_new_key: 1, "facts[].surprise": 2 });
  expect("brand_new_key" in notebook).toBe(false);
});

test("notebook-corpus: detectDialect tells schema, camel, mixed and unknown apart", () => {
  expect(detectDialect({ template_intent: "x" })).toBe("schema");
  expect(detectDialect({ templateIntent: "x" })).toBe("camel");
  expect(detectDialect({ template_intent: "x", steelMan: {} })).toBe("mixed");
  expect(detectDialect({ topic: "x" })).toBe("unknown"); // spelled the same in both
  expect(detectDialect("nope")).toBe("unknown");
});

/* ── 3 · verdicts and consumers ──────────────────────────────────────────────── */

test("notebook-corpus: no consumer throws on any accepted member", () => {
  let accepted = 0;
  for (const p of corpusPaths(ROOT)) {
    const { accepted: nb } = judge(readMember(ROOT, p));
    if (!nb) continue;
    accepted++;
    expect(() => notebookIssues(nb), `${p}: notebookIssues`).not.toThrow();
    expect(() => buildCards(nb), `${p}: buildCards`).not.toThrow();
    expect(() => sourceOf(nb).byId, `${p}: indexNotebook`).not.toThrow();
  }
  console.log(`[corpus] consumers walked ${accepted} accepted member(s)`);
});

/* ── 4 · the fixture is run 1, up to a DECLARED set of differences ───────────── */

// The shipped fixture header says "run 1, verbatim ... revised by follow-up
// round 1". Measured 2026-10-11 it is not verbatim: adapting run 1 and diffing
// it against NOTEBOOK differs in 68 field paths. They fall in three buckets and
// each is declared here with its reason, so a NEW divergence fails and a
// declaration that matches nothing (a fixed divergence) also fails.
const DECLARED: readonly { bucket: string; why: string; match: RegExp }[] = [
  {
    bucket: "follow-up round 1",
    why: "pipeline/runs/2026-08-11-*/followup-round-1.md: f-liquidity killed, f-m2-divergence / f-whale-absorb / f-midtier-distribute added, f-supply-2pct confirmed, u-onchain-contradiction resolved, research gaps rewritten",
    match: /^(facts\[(17|18|19|20)\]\.|reversals\[3\]\.evidence\[\d+\]$|unknowns\[0\]\.|researchGaps\[0\]$)/,
  },
  {
    bucket: "fixture backfill",
    why: "fields the fixture carries in the typed shape (confidence split from its note, scale-conversion `for`, unknown ids, engine labels, display-string sources) that run 1's JSON predates",
    match: /^(facts\[\d+\]\.confidence(Note)?$|scaleConversions\[\d+\]\.for$|unknowns\[[1-3]\]|engineFit|sources\[\d+\]$)/,
  },
  {
    bucket: "fixture hand-edit (undeclared by the fixture header)",
    why: "the fixture shortens or relabels these relative to run 1's JSON; the header's 'verbatim' is not true of them",
    match: /^(researcher$|facts\[13\]\.claim$|steelMan\.statement$|analogyCandidates\[2\]\.analogy$)/,
  },
];

test("notebook-corpus: run 1 adapted differs from the NOTEBOOK fixture only in DECLARED fields", () => {
  const { notebook } = adaptMember(readMember(ROOT, RUN_1));
  const diffs = diffPaths(notebook, JSON.parse(JSON.stringify(NOTEBOOK)));
  console.log(`[corpus] run 1 vs NOTEBOOK: ${diffs.length} differing field path(s)`);

  const undeclared = diffs.filter((d) => !DECLARED.some((r) => r.match.test(d)));
  expect(undeclared, "differences no declaration covers").toEqual([]);

  const stale = DECLARED.filter((r) => !diffs.some((d) => r.match.test(d))).map((r) => r.bucket);
  expect(stale, "declarations that no longer match any difference").toEqual([]);
});
