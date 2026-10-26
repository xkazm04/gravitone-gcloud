// THE SECOND DIALECT, READ AT LAST.
//
// `pipeline/NOTEBOOK-SCHEMA.md` documents the field tables in snake_case
// (`template_intent`, `why_it_is_a_tension`, `evidence_class` ...) and that is
// what terminal research runs write to `notebook.json`. The TypeScript types
// and `parseNotebook` speak camelCase. Nothing translated between the two, so
// the tracked notebooks were never able to walk the one validation door.
//
// This module is that translation, and its one hard rule is the ticket's: a key
// the map does not know is COUNTED AND REPORTED in `unmapped`, never dropped
// silently. A run's top-level keys drift from run to run (`prior`,
// `domain_fill`, `_meta`, `followups` ...) and a lane that quietly ate them
// would report "adapted fine" over a notebook it had only half read.
//
// THE MAP IS EXPLICIT, taken from the field tables in NOTEBOOK-SCHEMA.md, not
// derived by a generic snake->camel regex: a regex would "map" a typo and
// invent fields the schema never declared. A key already spelled in the target
// dialect (`restsOn`, `emptyByOmission` — one tracked run is mixed) is accepted
// as itself.
//
// WHAT IT DOES NOT DO: coerce values. A `subject` that is an object where the
// type says string is passed through untouched, so the shape validator reports
// it; an adapter that "fixed" it would hide the finding the lane exists to pin.

/** Where a source key lands and how its value is read. */
type Rule = string | { to: string; of?: FieldMap };
type FieldMap = Readonly<Record<string, Rule>>;

const FACT_SOURCE: FieldMap = {
  name: "name",
  evidence_class: "evidenceClass",
  locator: "locator",
  interested: "interested",
  url: "url",
};

const FACT: FieldMap = {
  id: "id",
  dimension: "dimension",
  claim: "claim",
  load_bearing: "loadBearing",
  source: "source",
  sources: { to: "sources", of: FACT_SOURCE },
  kind: "kind",
  confidence: "confidence",
  confidence_note: "confidenceNote",
  as_of: "asOf",
  event_date: "eventDate",
  period: "period",
  unit: "unit",
  denominator: "denominator",
  subject: "subject",
  search_scope: "searchScope",
  derived_from: "derivedFrom",
  method: "method",
  contests: "contests",
  qualifies: "qualifies",
  note: "note",
};

const STEP: FieldMap = { text: "text", connector: "connector", evidence: "evidence" };

const MECHANISM: FieldMap = {
  id: "id",
  dimension: "dimension",
  name: "name",
  chain: "chain",
  steps: { to: "steps", of: STEP },
  evidence: "evidence",
  explains: "explains",
  needs_analogy: "needsAnalogy",
  note: "note",
};

const REVERSAL: FieldMap = {
  id: "id",
  dimension: "dimension",
  obvious_reading: "obviousReading",
  why_wrong: "whyWrong",
  mechanism: "mechanismId",
  evidence: "evidence",
  escalation: "escalation",
  note: "note",
};

const STEEL_MAN: FieldMap = {
  claim: "claim",
  evidence: "evidence",
  statement: "statement",
  why_include: "whyInclude",
  provenance: "provenance",
  rests_on_absence: "restsOnAbsence",
};

const SCALE: FieldMap = { for: "for", raw: "raw", felt: "felt", kind: "kind" };
const ANALOGY: FieldMap = { for: "for", analogy: "analogy", quality: "quality" };

const COUNTER: FieldMap = {
  position: "position",
  holder: "holder",
  evidence: "evidence",
  statement_verbatim: "statementVerbatim",
  locator: "locator",
};

// The machine form of an unknown's impact (types.ts::Unknown.probe, c12015d2).
// `forbid` items and `noCausalLink.{a,b}` are values, carried as they stand.
const PROBE: FieldMap = {
  when_mentions: "whenMentions",
  forbid: "forbid",
  require_one: "requireOne",
  no_causal_link: "noCausalLink",
  tests: "tests",
};

const UNKNOWN: FieldMap = {
  id: "id",
  what: "what",
  why: "why",
  impact: "impact",
  about: "about",
  resolved_by: "resolvedBy",
  probe: { to: "probe", of: PROBE },
};

const OBLIGATION: FieldMap = {
  id: "id",
  must: "must",
  why: "why",
  about: "about",
  resolved_by: "resolvedBy",
};

const ENGINE_FIT: FieldMap = {
  engine: "engine",
  label: "label",
  fit: "fit",
  why: "why",
  recommended: "recommended",
  render_id: "renderId",
  hazard: "hazard",
};

const TENSION: FieldMap = {
  expectation: "expectation",
  reality: "reality",
  why_it_is_a_tension: "whyItIsATension",
  strength: "strength",
};

const CURRENCY: FieldMap = {
  half_life: "halfLife",
  why: "why",
  expires_first: "expiresFirst",
  durable: "durable",
  advice: "advice",
};

const DIMENSION: FieldMap = {
  id: "id",
  label: "label",
  purpose: "purpose",
  empty_by_omission: "emptyByOmission",
  not_applicable: "notApplicable",
  empty_means: "emptyMeans",
};

// Conclusions: the schema spells these camelCase "in the TypeScript and
// JSON-schema spellings" (NOTEBOOK-SCHEMA.md, dimensions section) and a tracked
// run wrote them camelCase inside an otherwise snake_case notebook.
const FALSIFIER: FieldMap = { test: "test", kind: "kind", binds: "binds", note: "note" };
const CONCLUSION: FieldMap = {
  id: "id",
  claim: "claim",
  reasoning: "reasoning",
  leap: "leap",
  rests_on: "restsOn",
  precedent: { to: "precedent", of: { domain: "domain", note: "note" } },
  falsifiable_by: { to: "falsifiableBy", of: FALSIFIER },
  subject: { to: "subject", of: { names: "names", who: "who" } },
  clauses: {
    to: "clauses",
    of: { id: "id", text: "text", load_bearing: "loadBearing" },
  },
  use_for: "useFor",
  withheld: "withheld",
  assertion: "assertion",
  licensed_by: "licensedBy",
  hottest: "hottest",
};

const TOP: FieldMap = {
  id: "id",
  topic: "topic",
  question: "question",
  verdict: "verdict",
  researched: "researched",
  researcher: "researcher",
  template_intent: "templateIntent",
  subject_domain: "subjectDomain",
  tension: { to: "tension", of: TENSION },
  facts: { to: "facts", of: FACT },
  mechanisms: { to: "mechanisms", of: MECHANISM },
  reversals: { to: "reversals", of: REVERSAL },
  steel_man: { to: "steelMan", of: STEEL_MAN },
  scale_conversions: { to: "scaleConversions", of: SCALE },
  analogy_candidates: { to: "analogyCandidates", of: ANALOGY },
  candidate_questions: "candidateQuestions",
  counter_positions_to_state_fairly: { to: "counterPositions", of: COUNTER },
  unknowns: { to: "unknowns", of: UNKNOWN },
  obligations: { to: "obligations", of: OBLIGATION },
  engine_fit: { to: "engineFit", of: ENGINE_FIT },
  currency: { to: "currency", of: CURRENCY },
  sources: "sources",
  research_gaps: "researchGaps",
  dimensions: { to: "dimensions", of: DIMENSION },
  conclusions: { to: "conclusions", of: CONCLUSION },
};

/** Array-valued targets the adapter guarantees to be present (the ticket's
 *  acceptance 2). `parseNotebook` normalises the optional ones itself; the
 *  adapter does it too so a corpus member's verdict never depends on which
 *  side supplied the empty array. */
const ALWAYS_ARRAYS = ["counterPositions", "analogyCandidates"] as const;

export type Dialect = "schema" | "camel" | "mixed" | "unknown";

export interface Adapted {
  /** The notebook in the app's (camelCase) dialect. Still `unknown`-shaped:
   *  `parseNotebook` is the door that decides whether it is a Notebook. */
  notebook: Record<string, unknown>;
  /** Source key path -> how many times it appeared and was NOT mapped.
   *  Array levels are written `[]`, e.g. `facts[].search_scope`. */
  unmapped: Record<string, number>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const targets = (m: FieldMap): Set<string> =>
  new Set(Object.values(m).map((r) => (typeof r === "string" ? r : r.to)));

const TOP_SOURCE_KEYS = new Set(Object.keys(TOP));
const TOP_TARGET_KEYS = targets(TOP);
// Keys spelled identically in both dialects tell us nothing about which one the
// notebook is in.
const AMBIGUOUS = new Set([...TOP_SOURCE_KEYS].filter((k) => TOP_TARGET_KEYS.has(k)));

/**
 * Which dialect does the TOP LEVEL of this notebook speak? Judged on the
 * top-level keys only, and only on keys that differ between the dialects, so a
 * notebook of `{id, topic, ...}` alone is `unknown` rather than a guess.
 *
 * `mixed` is a real answer: a tracked run wrote snake_case notebook fields next
 * to camelCase conclusions. Only the top level is classified; nested mixing is
 * handled key by key in `fromSchemaDialect`.
 */
export function detectDialect(raw: unknown): Dialect {
  if (!isRecord(raw)) return "unknown";
  let schema = 0;
  let camel = 0;
  for (const k of Object.keys(raw)) {
    if (AMBIGUOUS.has(k)) continue;
    if (TOP_SOURCE_KEYS.has(k)) schema++;
    else if (TOP_TARGET_KEYS.has(k)) camel++;
  }
  if (schema && camel) return "mixed";
  if (schema) return "schema";
  if (camel) return "camel";
  return "unknown";
}

function walk(
  value: unknown,
  map: FieldMap,
  path: string,
  unmapped: Record<string, number>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (isRecord(item) ? walk(item, map, `${path}[]`, unmapped) : item));
  }
  if (!isRecord(value)) return value;

  const own = targets(map);
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    const rule = map[key];
    if (rule === undefined) {
      if (own.has(key)) {
        // Already in the target spelling: keep it, and recurse with the rule
        // that produces it so nested keys are still read.
        const via = Object.values(map).find(
          (r) => (typeof r === "string" ? r : r.to) === key,
        );
        out[key] = typeof via === "object" && via.of ? walk(v, via.of, `${path}.${key}`, unmapped) : v;
        continue;
      }
      const at = `${path}.${key}`.replace(/^\./, "");
      unmapped[at] = (unmapped[at] ?? 0) + 1;
      continue;
    }
    if (typeof rule === "string") out[rule] = v;
    else out[rule.to] = rule.of ? walk(v, rule.of, `${path}.${key}`, unmapped) : v;
  }
  return out;
}

/**
 * snake_case NOTEBOOK-SCHEMA dialect -> the app's camelCase `Notebook` shape.
 * Never throws and never validates: the result goes to `parseNotebook`.
 */
export function fromSchemaDialect(raw: unknown): Adapted {
  const unmapped: Record<string, number> = {};
  if (!isRecord(raw)) return { notebook: {}, unmapped: { "<not an object>": 1 } };

  const notebook = walk(raw, TOP, "", unmapped) as Record<string, unknown>;
  for (const k of ALWAYS_ARRAYS) if (notebook[k] === undefined) notebook[k] = [];
  return { notebook, unmapped };
}

