// THE NOTEBOOK, CHECKED AT RUNTIME — the shape a real research run must return
// before the app is allowed to call it a notebook.
//
// WHY THIS FILE EXISTS AND WHAT IT IS NOT A SECOND COPY OF.
//
// `pipeline/NOTEBOOK-SCHEMA.md` is the contract, `app/_phases/_shared/notebook/
// types.ts` is its TypeScript restatement, and `pipeline/check-notebook.mts` is
// the terminal gate over the shipped FIXTURE. None of the three can be pointed
// at a notebook that arrives over the wire at 3am from a model:
//
//   · the schema document is prose,
//   · the types are erased at build time and check nothing about a `JSON.parse`,
//   · `check-notebook.mts` is a script with a `process.exit` in it.
//
// So this module is the runtime half, and it is deliberately assembled from the
// parts that already exist rather than restating them:
//
//   THE GRAPH HALF IS NOT REWRITTEN. `notebookIssues(nb)` already takes a
//   notebook as an argument (cards.ts) and is exactly what `check-notebook.mts`
//   runs — duplicate ids, dangling references, unlinked scale conversions. It is
//   imported and called here on the model's answer. See `graphFindings` in
//   ./graph.ts
//   for the two of its five kinds that CANNOT apply to a fresh notebook and why
//   they are dropped rather than reported.
//
//   THE SHAPE HALF IS NEW, because nothing checked it before: the fixture is
//   hand-written TypeScript, so `tension` could not be missing and a `claim`
//   could not be a number. A model's answer can be both. Every rule below cites
//   the line of NOTEBOOK-SCHEMA.md or RESEARCH-PROMPT.md it enforces, so the two
//   can be diffed rather than guessed at.
//
// WHAT IS DELIBERATELY *NOT* CHECKED, so nobody reads more into a pass than it
// says. The schema's expensive rules are judgements about the WORLD, not about
// the object: whether a load-bearing quantitative fact really reaches a primary
// source, whether two compared quantities recompute, whether the steel-man is
// genuinely strong. A validator cannot answer any of those, and a validator that
// pretended to would be the "laundered confidence" anti-pattern with a green
// tick on it. What passes here is a notebook that is STRUCTURALLY a notebook.
//
// THE SHIPPED FIXTURE DOES NOT PASS THIS VALIDATOR, and that is correct rather
// than alarming. Measured 2026-09-08 by feeding `_shared/notebook/notebook.ts`
// through `parseNotebook`: 39 findings, and every one of them is a rule
// NOTEBOOK-SCHEMA.md itself marks as binding on NEW notebooks only —
// `sources[]` (run 1 comma-joined its publications into the deprecated singular
// `source` string) and the ≤ 90-character claim budget (run 1 shipped
// three-sentence claims, which is the scar the budget was written from). The
// schema says so in as many words: "Every field below `sources[]` is required
// for new notebooks and optional in `types.ts`, because the run-1 fixture is the
// control for every adopted edit and a control rewritten to compile is not a
// control." So this module is never pointed at the fixture, the fixture keeps
// `check-notebook.mts` as its own gate, and the two checks differ exactly where
// the document says they should.
//
// SERVER-ONLY BY LOCATION, not by secret: it reads no environment and holds no
// key. It lives under lib/ because the route is the only caller and the fixture
// import it pulls in (`cards.ts` → `conclusions.ts`) is ~45KB that no client
// surface should pay for twice.

import type { Notebook } from "@/app/_phases/_shared/notebook/types";
import { graphFindings } from "./graph";
import { NotebookError } from "./failure";
import { shapeFindings } from "./shape";
import { isObj } from "./shape-helpers";

export { NOTEBOOK_SCHEMA } from "./schema";
export { NotebookError } from "./failure";
export { crossCheckRetrieval, RETRIEVE_NOTEBOOK_SCHEMA, sameAddress } from "./retrieval";

/* ────────────────────────────────── the door ─────────────────────────────── */

/**
 * Accept a model's answer as a notebook, or refuse it with every reason.
 *
 * `raw` is whatever `reason()` handed back in `result.json` — already parsed and
 * already shallow-checked against the schema's top-level `required` by
 * lib/text/json.ts, which is a different and much weaker check than this one.
 *
 * THE SHAPE HALF RUNS FIRST AND SHORT-CIRCUITS. `notebookIssues` reaches into
 * `nb.facts.map`, `nb.steelMan.evidence` and `nb.currency.expiresFirst` without
 * guarding any of them — correctly, because its only other caller hands it a
 * typed fixture — so running it over an answer that is missing `currency` throws
 * a TypeError out of a validator instead of a finding out of one.
 */
export function parseNotebook(raw: unknown, expectedTopic: string): Notebook {
  if (!isObj(raw)) throw new NotebookError(["The engine returned something that is not a JSON object."]);

  const shape = shapeFindings(raw);
  if (shape.length) throw new NotebookError(shape);

  // NORMALISED BEFORE THE GRAPH PASS, NOT AFTER, and the order is load-bearing.
  // `notebookIssues` reaches `nb.scaleConversions.forEach` and
  // `nb.analogyCandidates.forEach` unguarded — correctly, because its only other
  // caller hands it a typed fixture where both exist. Neither is in this
  // schema's `required` (a short-form notebook legitimately has no analogy), so
  // checking the graph first would throw a TypeError out of a validator.
  const nb = normalise(raw as unknown as Notebook, expectedTopic);

  const graph = graphFindings(nb);
  if (graph.length) throw new NotebookError(graph);

  return nb;
}

/**
 * Stamp the facts about THE RUN onto the model's answer, and fill the optional
 * arrays it may legitimately have omitted.
 *
 * THE TOPIC IS RE-STAMPED, NOT TRUSTED, and that is the honesty machinery's
 * hinge rather than a tidy-up. The whole point of the researched path is that
 * the notebook on screen is about the thing the creator typed; a model that
 * drifts the topic in its answer — and "Why Bitcoin price does not rise" is both
 * in its training data and in this repo's fixture — would produce a notebook the
 * surface then labels with the drifted subject and calls the creator's own. The
 * typed string is the authority on what was asked.
 *
 * `id`, `researched` and `researcher` go the same way: they are facts about the
 * run, which the run knows and the model does not.
 */
function normalise(nb: Notebook, expectedTopic: string): Notebook {
  return {
    ...nb,
    topic: expectedTopic,
    id: `run-${Date.now()}`,
    researched: new Date().toISOString().slice(0, 10),
    researcher: "gravitone-studio",
    // Optional in the type, absent from many answers, and read with `??` by
    // several surfaces — normalised once here so no consumer has to.
    scaleConversions: nb.scaleConversions ?? [],
    analogyCandidates: nb.analogyCandidates ?? [],
    candidateQuestions: nb.candidateQuestions ?? [],
    counterPositions: nb.counterPositions ?? [],
    sources: nb.sources ?? [],
    subjectDomain: nb.subjectDomain ?? [],
    templateIntent: nb.templateIntent ?? "",
  };
}
