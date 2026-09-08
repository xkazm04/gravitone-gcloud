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
//   imported and called here on the model's answer. See `graphFindings` below
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

import { notebookIssues, type GraphIssue } from "@/app/_phases/_shared/notebook/cards";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import type { Notebook } from "@/app/_phases/_shared/notebook/types";

/* ─────────────────────────────── the JSON schema ─────────────────────────── */

/**
 * The shape the engine is asked to return, as JSON Schema.
 *
 * Handed to `reason({ schema })`, which means one of two things happens and
 * `provenance.schemaEnforcement` says which: Gemini constrains its own decoding
 * to it, or the local CLI — which has no `output_config.format` — gets it
 * appended to the prompt and the answer is checked on the way back. Either way
 * `parseNotebook` below runs, because a validator that only runs on the weaker
 * rung is a validator nobody tests (/api/recalibrate's own words).
 *
 * NO `additionalProperties`, ANYWHERE, AND THAT IS A DECISION. It is on
 * providers/google.ts::UNSUPPORTED_KEYWORDS, so one occurrence anywhere in this
 * object would demote the whole schema from `native` to `prompted` on the cloud
 * rung — trading real vendor-side enforcement for a stricter rule this app does
 * not need. A notebook carrying an extra key is not a defect; a notebook missing
 * `tension` is, and `required` catches that on both rungs.
 *
 * The field names are the TYPESCRIPT ones (`loadBearing`, `steelMan`,
 * `researchGaps`), not the schema document's snake_case. The document describes
 * the contract; `types.ts` is what the app actually holds, the fixture is
 * written in it, and a route that translated between two spellings would be one
 * more place the two could drift.
 */
export const NOTEBOOK_SCHEMA = {
  type: "object",
  properties: {
    topic: { type: "string", description: "the subject as the creator typed it, echoed back verbatim" },
    question: {
      type: "string",
      description:
        "the topic rewritten as the question the video answers. If this cannot be written, the topic is not yet a video.",
    },
    verdict: { type: "string", description: "the one-sentence answer, written during research" },
    templateIntent: { type: "string" },
    subjectDomain: { type: "array", items: { type: "string" } },
    tension: {
      type: "object",
      description:
        "where what people believe and what is true come apart. A notebook without one is a FAILED notebook — say so rather than inventing one.",
      properties: {
        expectation: { type: "string" },
        reality: { type: "string" },
        whyItIsATension: { type: "string" },
        strength: { type: "string", enum: ["high", "moderate", "weak"] },
      },
      required: ["expectation", "reality", "whyItIsATension", "strength"],
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "f-* — unique across the WHOLE notebook, not just this array" },
          claim: {
            type: "string",
            description: "a HEADLINE: one declarative clause, 90 characters or fewer, no trailing period",
          },
          loadBearing: { type: "boolean", description: "does the argument collapse without it?" },
          kind: { type: "string", enum: ["found", "derived", "absence", "utterance", "plan"] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          confidenceNote: { type: "string", description: "why the confidence is what it is — stated, never implied" },
          sources: {
            type: "array",
            description: "PLURAL, ALWAYS. Never comma-join publications into one string.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                evidenceClass: {
                  type: "string",
                  enum: ["primary", "secondary", "aggregator", "vendor", "self-published", "protected"],
                },
                locator: { type: "string", description: "page, line, article, tx hash or timestamp" },
                interested: { type: "boolean" },
              },
              required: ["name", "evidenceClass"],
            },
          },
          asOf: { type: "string", description: "when the RESEARCHER last checked. Not the event." },
          eventDate: { type: "string", description: "when the thing described happened" },
          period: { type: "string", description: "the window a quantity covers" },
          unit: { type: "string" },
          denominator: { type: "string", description: "what a percentage is a percentage OF" },
          subject: { type: "string" },
          searchScope: { type: "string", description: "kind:absence only — the register searched and the period" },
          derivedFrom: { type: "array", items: { type: "string" } },
          method: { type: "string" },
          contests: { type: "array", items: { type: "string" }, description: "fact ids this one contradicts" },
          qualifies: { type: "array", items: { type: "string" } },
          note: { type: "string", description: "the argument, the numbers and every qualification" },
        },
        required: ["id", "claim", "loadBearing", "confidence", "asOf", "sources"],
      },
    },
    mechanisms: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          chain: {
            type: "array",
            items: { type: "string" },
            description:
              "the rendered prose form, each link opening with BUT, THEREFORE or TRANSFER. Never AND THEN — that is a sequence, not a mechanism.",
          },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                connector: { type: "string", enum: ["BUT", "THEREFORE", "TRANSFER"] },
                evidence: { type: "array", items: { type: "string" } },
              },
              required: ["text"],
            },
          },
          evidence: { type: "array", items: { type: "string" }, description: "mechanism-level fact ids" },
          explains: { type: "string" },
          needsAnalogy: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["id", "name", "chain", "explains", "needsAnalogy"],
      },
    },
    reversals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          obviousReading: {
            type: "string",
            description: "state it GENEROUSLY — a strawman here becomes a strawman on screen",
          },
          whyWrong: { type: "string" },
          mechanismId: { type: "string", description: "the mechanism id this turns on, or omit" },
          evidence: { type: "array", items: { type: "string" } },
          escalation: { type: "string" },
          note: { type: "string" },
        },
        required: ["id", "obviousReading", "whyWrong", "evidence", "escalation"],
      },
    },
    steelMan: {
      type: "object",
      description: "MANDATORY. The strongest case against your own verdict, in the words its believers would use.",
      properties: {
        claim: { type: "string" },
        evidence: { type: "array", items: { type: "string" } },
        statement: { type: "string" },
        whyInclude: { type: "string" },
        provenance: {
          type: "string",
          enum: ["found", "found-adjacent", "constructed"],
          description: "an unmarked construction is the failure mode this field was written against",
        },
        restsOnAbsence: { type: "string", description: "constructed only — the fact id of the dated absence" },
      },
      required: ["claim", "evidence", "statement", "whyInclude", "provenance"],
    },
    scaleConversions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          for: { type: "string", description: "the fact id this restates. Without it nothing can check the felt form." },
          raw: { type: "string" },
          felt: { type: "string" },
          kind: { type: "string", enum: ["cash", "non-cash", "count", "ratio"] },
        },
        required: ["for", "raw", "felt"],
      },
    },
    analogyCandidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          for: { type: "string" },
          analogy: { type: "string" },
          quality: { type: "string", enum: ["strong", "medium", "weak"] },
        },
        required: ["for", "analogy", "quality"],
      },
    },
    candidateQuestions: { type: "array", items: { type: "string" } },
    counterPositions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          position: { type: "string" },
          holder: { type: "string", description: "WHO holds it. Two holders collapsed into one is a right of reply averaged away." },
          evidence: { type: "array", items: { type: "string" } },
          statementVerbatim: { type: "string" },
          locator: { type: "string" },
        },
        required: ["position", "holder", "evidence"],
      },
    },
    unknowns: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          what: { type: "string" },
          why: { type: "string" },
          impact: {
            type: "string",
            description: "what the script may NOT say. An unknown with no consequence is a note, not a constraint.",
          },
          about: { type: "array", items: { type: "string" }, description: "fact ids this constraint is scoped to" },
          resolvedBy: { type: "string" },
        },
        required: ["id", "what", "why", "impact"],
      },
    },
    obligations: {
      type: "array",
      description: "the must-say half. An unknown that implies a range carries a matching obligation.",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          must: { type: "string" },
          why: { type: "string" },
          about: { type: "array", items: { type: "string" } },
          resolvedBy: { type: "string" },
        },
        required: ["id", "must", "why"],
      },
    },
    engineFit: {
      type: "array",
      items: {
        type: "object",
        properties: {
          engine: { type: "string" },
          label: { type: "string" },
          fit: { type: "string", enum: ["excellent", "good", "poor"] },
          why: { type: "string" },
          recommended: { type: "boolean" },
          hazard: { type: "string", description: "what a WRONG render through this engine costs" },
        },
        required: ["engine", "label", "fit", "why"],
      },
    },
    currency: {
      type: "object",
      properties: {
        halfLife: { type: "string" },
        why: { type: "string" },
        expiresFirst: { type: "array", items: { type: "string" } },
        durable: { type: "array", items: { type: "string" } },
        advice: { type: "string", description: "a phrasing that trades precision for shelf life" },
      },
      required: ["halfLife", "why", "expiresFirst", "durable", "advice"],
    },
    sources: { type: "array", items: { type: "string" } },
    researchGaps: {
      type: "array",
      description: "what this run did NOT do. A notebook claiming no gaps did not look hard enough.",
      items: { type: "string" },
    },
  },
  required: [
    "topic",
    "question",
    "verdict",
    "tension",
    "facts",
    "mechanisms",
    "reversals",
    "steelMan",
    "unknowns",
    "engineFit",
    "currency",
    "researchGaps",
  ],
} as const satisfies Record<string, unknown>;

/* ──────────────────────────────── the failure ────────────────────────────── */

/**
 * A model answered, and what came back is not a notebook.
 *
 * Carries EVERY finding rather than the first, because the fix is a prompt
 * change and one finding at a time is a prompt edited five times for one run's
 * worth of information. The route turns this into `code: "bad-response"` —
 * lib/text/errors.ts's own word for "it answered, and we could not use what came
 * back" — rather than inventing a second vocabulary for the same event.
 */
export class NotebookError extends Error {
  constructor(readonly findings: string[]) {
    super(
      findings.length === 1
        ? findings[0]
        : `${findings.length} problems with the returned notebook: ${findings.join(" · ")}`,
    );
    this.name = "NotebookError";
  }
}

/* ─────────────────────────────── the shape half ──────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const arr = (v: unknown): v is unknown[] => Array.isArray(v);

/** NOTEBOOK-SCHEMA § `claim`: "one declarative clause, ≤ 90 characters, no
 *  trailing period". Run 1 shipped three-sentence claims and every reading
 *  surface has had to truncate them since, so this is a budget with a scar. */
const CLAIM_MAX = 90;

/** The link words a mechanism chain may use.
 *
 *  BUT and THEREFORE are RESEARCH-PROMPT § Phase 3's whole rule ("if the only
 *  honest connector is AND THEN, you have a sequence, not a mechanism").
 *  TRANSFER is notebook vocabulary only (types.ts::ChainConnector) — a
 *  deduction, a hand-off, a recognition event — and is NOT a render licence. */
const CHAIN_WORDS = ["BUT", "THEREFORE", "TRANSFER"] as const;

/** Does this prose link open with a sanctioned connector? The first link of a
 *  chain has nothing to connect to and is exempt — the fixture's own chains open
 *  with a bare statement (`facts.ts` / `notebook.ts`), so requiring one here
 *  would fail the control this app validates every edit against. */
const linked = (s: string) => CHAIN_WORDS.some((w) => s.trim().toUpperCase().startsWith(w));

/**
 * Check the model's answer against the rules of NOTEBOOK-SCHEMA.md that are
 * checkable without knowing anything about the world.
 *
 * Returns findings rather than throwing, so the caller reports all of them at
 * once and so this function is testable without a try/catch.
 */
function shapeFindings(nb: Record<string, unknown>): string[] {
  const out: string[] = [];
  const say = (s: string) => out.push(s);

  /* identity — § Fields · Identity */
  for (const k of ["topic", "question", "verdict"])
    if (!str(nb[k])) say(`\`${k}\` is missing or empty (schema § Identity).`);

  /* the load-bearing field — § tension */
  const t = nb.tension;
  if (!isObj(t)) say("`tension` is missing. A notebook without a tension is a FAILED notebook (schema § tension).");
  else
    for (const k of ["expectation", "reality", "whyItIsATension", "strength"])
      if (!str(t[k])) say(`\`tension.${k}\` is missing or empty (schema § tension).`);

  /* facts — § facts[], rules 1, 2, 3 */
  const facts = nb.facts;
  if (!arr(facts) || facts.length === 0) say("`facts` is empty. There is nothing for a script to rest on.");
  else
    facts.forEach((raw, i) => {
      const at = `facts[${i}]`;
      if (!isObj(raw)) return say(`${at} is not an object.`);
      const f = raw;
      if (!str(f.id)) say(`${at}.id is missing.`);
      if (!str(f.claim)) say(`${at}.claim is missing.`);
      else {
        // The headline budget, and the two ways it is broken.
        if (f.claim.length > CLAIM_MAX)
          say(
            `${at}.claim is ${f.claim.length} characters; the budget is ${CLAIM_MAX} (schema § claim). ` +
              `A claim that cannot fit is usually two claims — the argument belongs in \`note\`.`,
          );
        if (/\.$/.test(f.claim.trim())) say(`${at}.claim ends in a period; a headline carries none (schema § claim).`);
      }
      if (typeof f.loadBearing !== "boolean") say(`${at}.loadBearing is missing (schema § facts[]).`);
      if (!str(f.confidence)) say(`${at}.confidence is missing. Confidence is stated, never implied (rule 3).`);
      if (!str(f.asOf)) say(`${at}.asOf is missing. Every fact is dated (rule 2).`);
      // Rule 2, and the "comma-joined source" anti-pattern in one check: sources
      // are PLURAL and each carries a class, so they can be counted and graded.
      if (!arr(f.sources) || f.sources.length === 0)
        say(`${at}.sources is empty. Every fact is sourced, with an evidence class (rule 2).`);
      else
        f.sources.forEach((s, j) => {
          if (!isObj(s) || !str(s.name)) say(`${at}.sources[${j}] has no name.`);
          else if (!str(s.evidenceClass))
            say(`${at}.sources[${j}] ("${s.name}") has no evidenceClass. Aggregators restate; they do not verify (rule 4).`);
        });
      // Rule 6, only where the kind was declared: an absence with no scope is an
      // assertion, and a derived fact with no inputs cannot be recomputed.
      if (f.kind === "absence" && !str(f.searchScope))
        say(`${at} is \`kind: "absence"\` with no searchScope. An absence without its search scope is an assertion.`);
      if (f.kind === "derived" && !(arr(f.derivedFrom) && f.derivedFrom.length))
        say(`${at} is \`kind: "derived"\` and names no derivedFrom.`);
    });

  /* mechanisms — § mechanisms[], Phase 3 */
  const mechs = nb.mechanisms;
  if (!arr(mechs) || mechs.length === 0) say("`mechanisms` is empty. Phase 3 authors the beat chain; Script inherits it.");
  else
    mechs.forEach((raw, i) => {
      const at = `mechanisms[${i}]`;
      if (!isObj(raw)) return say(`${at} is not an object.`);
      const m = raw;
      if (!str(m.id)) say(`${at}.id is missing.`);
      if (!str(m.name)) say(`${at}.name is missing.`);
      if (!str(m.explains)) say(`${at}.explains is missing.`);
      if (!arr(m.chain) || m.chain.length < 2)
        say(`${at}.chain has fewer than two links, so nothing in it connects (schema § mechanisms[]).`);
      else
        m.chain.slice(1).forEach((link, j) => {
          if (!str(link)) return say(`${at}.chain[${j + 1}] is empty.`);
          if (!linked(link))
            say(
              `${at}.chain[${j + 1}] opens "${link.trim().split(/\s+/).slice(0, 4).join(" ")}…" — every link after the ` +
                `first is BUT, THEREFORE or TRANSFER. If the only honest connector is AND THEN, this is a sequence, ` +
                `not a mechanism (RESEARCH-PROMPT § Phase 3).`,
            );
        });
    });

  /* reversals — Phase 4, quality bar */
  const rev = nb.reversals;
  if (!arr(rev) || rev.length === 0)
    say("`reversals` is empty. The quality bar requires at least one turn, with a generously stated obvious reading.");
  else
    rev.forEach((raw, i) => {
      const at = `reversals[${i}]`;
      if (!isObj(raw)) return say(`${at} is not an object.`);
      for (const k of ["id", "obviousReading", "whyWrong", "escalation"])
        if (!str(raw[k])) say(`${at}.${k} is missing.`);
      // Not cosmetic: `buildCards` SPREADS this field (`[...r.evidence, …]`), so
      // a reversal with no `evidence` array throws a TypeError out of the graph
      // pass rather than raising a finding from it. An empty array is a legal
      // answer — a turn resting on a mechanism alone — and `undefined` is not.
      if (!arr(raw.evidence)) say(`${at}.evidence must be an array of fact ids (it may be empty).`);
    });

  /* the steel-man — rule 7, and the one it is most often faked on */
  const sm = nb.steelMan;
  if (!isObj(sm)) say("`steelMan` is missing. It is MANDATORY (rule 7) — its absence is what separates an explainer from a polemic.");
  else {
    for (const k of ["claim", "statement", "whyInclude"]) if (!str(sm[k])) say(`\`steelMan.${k}\` is missing.`);
    // Phase 6: discharged by a found case, a marked construction, or a dated
    // absence — never by silence. `provenance` is what says which, and the
    // schema calls an unmarked construction "the failure mode this phase was
    // written against".
    if (!str(sm.provenance) || !["found", "found-adjacent", "constructed"].includes(sm.provenance as string))
      say(
        "`steelMan.provenance` must be `found`, `found-adjacent` or `constructed`. " +
          "A constructed opposition is bounded by the author's own prior and the reader has to be able to see that.",
      );
    if (sm.provenance === "constructed" && !str(sm.restsOnAbsence))
      say("`steelMan` is constructed and names no `restsOnAbsence` — the dated absence in facts[] that licensed it.");
  }

  /* unknowns — rule 8 */
  const unk = nb.unknowns;
  if (!arr(unk)) say("`unknowns` is missing.");
  else
    unk.forEach((raw, i) => {
      const at = `unknowns[${i}]`;
      if (!isObj(raw)) return say(`${at} is not an object.`);
      if (!str(raw.id)) say(`${at}.id is missing.`);
      if (!str(raw.impact))
        say(`${at}.impact is missing. An unknown with no consequence for the script is a note, not a constraint (rule 8).`);
    });

  /* currency — § currency, Phase 8 */
  const cur = nb.currency;
  if (!isObj(cur)) say("`currency` is missing (Phase 8).");
  else for (const k of ["halfLife", "why", "advice"]) if (!str(cur[k])) say(`\`currency.${k}\` is missing.`);

  /* engine fit — Phase 8. Reported, never chosen (rule 10). */
  if (!arr(nb.engineFit) || nb.engineFit.length === 0)
    say("`engineFit` is empty. Phase 8 assesses fit from the material; the human decides (rule 10).");

  /* gaps — Phase 9 */
  const gaps = nb.researchGaps;
  if (!arr(gaps) || gaps.length === 0)
    say("`researchGaps` is empty. A notebook claiming no gaps did not look hard enough (Phase 9).");

  return out;
}

/* ─────────────────────────────── the graph half ──────────────────────────── */

/**
 * The kinds of `notebookIssues` finding that CANNOT be evidence against a fresh
 * notebook, and why each is dropped rather than reported.
 *
 * This is the one place this module knowingly uses less of `check-notebook.mts`
 * than the terminal gate does, so it is stated rather than left to be
 * rediscovered:
 *
 *   · `untagged`  — `CARD_DIMENSION` (dimensions.ts) is a HAND-AUTHORED id →
 *     column table for the run-1 fixture. A notebook produced ten seconds ago
 *     has no rows in it by construction, so every one of its cards is
 *     "untagged". Reporting that would fail every real run for the crime of
 *     being new, and the remedy — "tag it in dimensions.ts" — is a source edit
 *     nobody can make from a route handler.
 *   · `stale-tag` — the mirror image: every id CARD_DIMENSION *does* hold names
 *     a fixture card this notebook does not have. Same table, same reason.
 *
 * Both remain live in `check-notebook.mts`, where they are exactly right: there
 * the notebook IS the fixture and the table IS supposed to cover it. What
 * survives here — `duplicate-id`, `dangling-ref`, `unlinked-conversion` — are
 * the three that are properties of the notebook alone.
 *
 * AND THE THIRD, WHICH IS NOT A KIND BUT A ROW. `notebookIssues` builds its card
 * universe with `buildCards`, which appends the FIXTURE's `CONCLUSIONS`
 * unconditionally — a `Notebook` has no conclusions field, by design
 * (conclusions.ts: reasoned, not researched, and filed apart from the sourced
 * facts on purpose). So every fresh notebook inherits twenty-odd conclusion
 * cards whose `restsOn` cites run-1 fact ids it has never heard of, and the
 * graph pass reports each one as a dangling reference against a notebook that
 * did not write them.
 *
 * MEASURED, not predicted: the minimal well-formed notebook in the verification
 * pass came back with 26 findings, 25 of them this. Uncorrected, the researched
 * path could not have accepted any answer at all.
 *
 * So findings OWNED BY a fixture conclusion are dropped, by owner rather than by
 * kind — `check-notebook.mts` still checks exactly those against the fixture,
 * where they belong. The honest fix is a `conclusions` argument on `buildCards`
 * so a caller can hand it the empty set; that is one file in the shared notebook
 * context and not this one, and until it exists this filter is the seam.
 */
const FIXTURE_COUPLED: ReadonlySet<GraphIssue["kind"]> = new Set(["untagged", "stale-tag"]);

/** The fixture's conclusion ids — the `from` prefixes whose findings are about
 *  the shipped conclusions layer rather than about the notebook under test. */
const FIXTURE_CONCLUSION_IDS = new Set(CONCLUSIONS.map((c) => c.id));

function graphFindings(nb: Notebook): string[] {
  return notebookIssues(nb)
    .filter((i) => !FIXTURE_COUPLED.has(i.kind))
    .filter((i) => !FIXTURE_CONCLUSION_IDS.has(i.from.split(".")[0]))
    .map((i) => `[${i.kind}] ${i.from} → ${i.ref} — ${i.detail}`);
}

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
