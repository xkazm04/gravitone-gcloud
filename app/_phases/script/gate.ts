// THE RENDER-BOUNDARY GATE — backlog #7, and the item that converts a methodic
// that SAYS the right things into one that ENFORCES them.
//
// ─── what this replaces, and why it is a different kind of object ───────────
//
// `constraints.ts` holds `CONSTRAINT_LEDGER`: a hand-authored table asserting
// that render X honours unknown Y, with a human-typed `state` and a
// human-written `how`. It is the step's own invention and its header says so.
// A creator read it and named the defect exactly:
//
//   "Every other field in this contract has a named consumer and the honesty
//    field has a vibe."  — box-office, L1 (blocker)
//   "a well-designed noun with no verb"
//
// The evidence that it does not work is in this repo's own history: the
// reversal-chain render violated `u-yield-causality` — it says Bitcoin "was
// sold" *when* yields climbed, where the notebook measured correlation and its
// impact demands "moves with", not "because of". That violation was caught by
// an agent working on a different step. **None of the render's twelve
// self-checks was capable of catching it**, because every one of them was a
// sentence a human wrote about the render rather than a function that read it.
//
// This file reads the render.
//
// ─── THE ONE HONESTY RULE ───────────────────────────────────────────────────
//
// **The gate may never report `pass` for something it did not check.**
//
// A checker that silently downgrades "I could not test this" into "fine" is
// strictly worse than no checker, because it manufactures the appearance of
// enforcement — which is the exact failure the L1 sweep found everywhere:
// conscientious in prose, permissive in type. So `unmeasured` is a first-class
// verdict here, it is counted separately, and `gateSummary().enforced` reports
// what fraction of the declared constraints were actually executable. A
// notebook whose unknowns carry no probes scores `enforced: 0` and says so.
//
// ─── what it cannot do, stated rather than hidden ───────────────────────────
//
// This is a lexical gate, not a reader. It cannot know whether a sentence is
// *true*; it can know whether a forbidden figure appears, whether a required
// qualifier survived, whether a causal verb sits between two terms the notebook
// only correlated, and whether a numeral in the render traces to any fact. That
// band is narrow and it is where every demonstrated failure in this repo lives.

import { NOTEBOOK, UNKNOWN_BY_ID } from "../_shared/notebook/notebook";
import { conclusionIssues } from "../_shared/notebook/conclusions";
import type { Conclusion } from "../_shared/notebook/conclusions";
import type { Fact, Unknown } from "../_shared/notebook/types";
import type { ScriptRender } from "./types";

/* ────────────────────────────────── probes ─────────────────────────────────
   An `impact` is prose for a human. A `probe` is the same rule for a machine.
   Both, never one: the prose is what a creator reads in review, the probe is
   what the boundary enforces. An unknown with prose and no probe is REPORTED as
   unmeasured — it is not assumed honoured. */

export interface Probe {
  /** The rule only engages when the render mentions one of these. Absent = always. */
  whenMentions?: string[];
  /** Literal strings or patterns that may not appear. */
  forbid?: (string | RegExp)[];
  /** If the rule engages, at least one of these must appear. */
  requireOne?: string[];
  /** Two term-sets that the notebook only CORRELATED. If both appear inside one
   *  sentence joined by a causal verb, the render has upgraded the claim. */
  noCausalLink?: { a: string[]; b: string[] };
  /** Human-readable statement of what the probe tests. Shown in the report. */
  tests: string;
}

export type Verdict = "pass" | "violation" | "not-engaged" | "unmeasured";

export interface GateFinding {
  rule: string;
  subject: string;
  verdict: Verdict;
  detail: string;
  /** The beat that tripped it — a finding you cannot locate is a rumour. */
  at?: string;
  quote?: string;
}

/* ────────────────────────── lexical helpers ──────────────────────────────── */

const CAUSAL = /\b(because|caused?|drove|drives|triggered|led to|resulted in|so |therefore|as a result|due to|made)\b/i;

/** A sentence that DENIES a causal link must not be flagged as asserting one.
 *  Not defensive polish: the reference render's *corrected* Movement 3 reads
 *  "Not because a bond yield reaches into a blockchain, but because portfolio
 *  construction did" — the notebook's rule being obeyed out loud. A gate that
 *  flags the fix as the defect trains its user to ignore it, and a checker
 *  nobody believes is worth less than none. */
const DENIAL = /(not because|never because|rather than|does not (?:explain|cause|mean)|is not (?:why|because))/i;

const renderText = (r: ScriptRender) => r.beats.map((b) => b.text).join(" ");

/** Sentence-ish split. Good enough: every demonstrated failure was intra-sentence. */
const sentences = (s: string) =>
  s.split(/(?<=[.!?])\s+/).filter(Boolean);

const has = (hay: string, needle: string | RegExp) =>
  typeof needle === "string"
    ? hay.toLowerCase().includes(needle.toLowerCase())
    : needle.test(hay);

/** Numerals as a viewer hears them, plus spelled-out numbers, because scripts
 *  are spoken. "one hundred and twenty six thousand" is a figure. */
const SPELLED = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|percent)\b/gi;
const DIGITS = /\d[\d,.]*\s*(%|percent|bn|m\b|k\b)?/gi;

/* ─────────────────────────── 1 · constraint probes ───────────────────────── */

export function checkConstraints(
  r: ScriptRender,
  unknowns: Unknown[],
  probes: Record<string, Probe>,
): GateFinding[] {
  const text = renderText(r);
  const out: GateFinding[] = [];

  for (const u of unknowns) {
    const probe = probes[u.id];

    // THE HONESTY RULE. No probe means no verdict — never a pass.
    if (!probe) {
      out.push({
        rule: "constraint",
        subject: u.id,
        verdict: "unmeasured",
        detail: `"${u.impact}" is prose with no probe. The boundary cannot test it, so it is not being enforced — say so rather than scoring it honoured.`,
      });
      continue;
    }

    // `whenMentions` gates the POSITIVE obligation only (if you raise the
    // subject, you must hedge it). It must never gate `forbid` — the regression
    // control caught this: "Bitcoin now trades at $63,400" escaped the
    // forbidden-figure rule because the sentence happened not to contain the
    // word "price". A prohibition that only applies when the render announces
    // its topic is not a prohibition.
    const engaged =
      !probe.whenMentions || probe.whenMentions.some((m) => has(text, m));

    let tripped = false;

    for (const f of probe.forbid ?? []) {
      const beat = r.beats.find((b) => has(b.text, f));
      if (beat) {
        tripped = true;
        out.push({
          rule: "constraint",
          subject: u.id,
          verdict: "violation",
          detail: `Forbidden by impact: "${u.impact}"`,
          at: beat.at,
          quote: beat.text.slice(0, 160),
        });
      }
    }

    if (probe.noCausalLink) {
      const { a, b } = probe.noCausalLink;
      for (const sentence of sentences(text)) {
        const hitA = a.find((t) => has(sentence, t));
        const hitB = b.find((t) => has(sentence, t));
        if (hitA && hitB && CAUSAL.test(sentence) && !DENIAL.test(sentence)) {
          tripped = true;
          const beat = r.beats.find((x) => sentence.includes(x.text.slice(0, 40)));
          out.push({
            rule: "constraint",
            subject: u.id,
            verdict: "violation",
            detail: `"${hitA}" and "${hitB}" are joined by a causal construction in one sentence. The notebook measured correlation only — impact: "${u.impact}"`,
            at: beat?.at,
            quote: sentence.trim().slice(0, 200),
          });
        }
      }
    }

    if (engaged && probe.requireOne && !probe.requireOne.some((t) => has(text, t))) {
      tripped = true;
      out.push({
        rule: "constraint",
        subject: u.id,
        verdict: "violation",
        detail: `Engaged, but none of the required hedges appear: ${probe.requireOne.join(" / ")}. Impact: "${u.impact}"`,
      });
    }

    if (!tripped && !engaged && !probe.forbid) {
      out.push({
        rule: "constraint", subject: u.id, verdict: "not-engaged",
        detail: `${probe.tests} — the render never raises the subject.`,
      });
      continue;
    }

    if (!tripped) {
      out.push({
        rule: "constraint",
        subject: u.id,
        verdict: "pass",
        detail: `${probe.tests} — executed against the render text.`,
      });
    }
  }
  return out;
}

/* ─────────────────── 2 · qualifier survival (philosophy P4) ──────────────── */

/** A fact's qualifier is the clause that makes it true. Three were demonstrably
 *  dropped between notebook and script — "in risk-on conditions", "(~2% of
 *  supply)" — by the step whose job is to make numbers FELT. The beat chain was
 *  preserved throughout, which is why "tone may never change the beat chain"
 *  was satisfied while the epistemic layer was being stripped. */
export function checkQualifiers(r: ScriptRender, facts: Fact[]): GateFinding[] {
  const text = renderText(r);
  const out: GateFinding[] = [];

  for (const f of facts) {
    const denom = f.denominator;
    if (!denom) continue;
    // Engage only if the render actually uses this fact's figure.
    const figure = (f.claim.match(/\d[\d,.]*\s*%/) ?? [])[0];
    if (!figure) continue;
    const bare = figure.replace(/[^\d.]/g, "");
    if (!bare || !text.includes(bare)) continue;

    out.push(
      has(text, denom)
        ? { rule: "qualifier", subject: f.id, verdict: "pass",
            detail: `Figure ${figure} appears with its denominator ("${denom}").` }
        : { rule: "qualifier", subject: f.id, verdict: "violation",
            detail: `Figure ${figure} appears; its denominator ("${denom}") does not. A percentage without its base is not the same claim.` },
    );
  }
  return out;
}

/* ───────────────── 3 · utterance attribution (conflict-osint) ─────────────── */

/** "The ministry said it" and "it is true" are different claims. `kind:
 *  "utterance"` separates them in the notebook and — until this gate — did not
 *  leave it: nothing in the render path read `Fact.kind`, so the distinction was
 *  re-typed by hand as an obligation, which is the tell that a field is not
 *  travelling. The check is deliberately strict: same sentence, not same script.
 *  Five cheap words per figure sit in exactly the position hedges do. */
export function checkUtterances(r: ScriptRender, facts: Fact[]): GateFinding[] {
  const out: GateFinding[] = [];
  const sents = sentences(renderText(r));

  for (const f of facts.filter((x) => x.kind === "utterance")) {
    const speaker = f.subject ?? f.sources?.[0]?.name;
    if (!speaker) {
      out.push({ rule: "utterance", subject: f.id, verdict: "unmeasured",
        detail: `kind: "utterance" but no subject or source to attribute to — the gate cannot test attribution it cannot name.` });
      continue;
    }
    const key = (f.claim.match(/\d[\d,.]*/) ?? [])[0];
    if (!key) continue;
    const carrying = sents.filter((s) => s.includes(key));
    if (!carrying.length) continue;

    const attributed = carrying.some((s) => has(s, speaker.split(" ")[0]));
    out.push(
      attributed
        ? { rule: "utterance", subject: f.id, verdict: "pass",
            detail: `Stated with its attribution in the same sentence.` }
        : { rule: "utterance", subject: f.id, verdict: "violation",
            detail: `An utterance is rendered as fact: "${key}" appears without "${speaker}" in the same sentence. The claim that someone SAID this has become the claim that it is SO.`,
            quote: carrying[0].trim().slice(0, 180) },
    );
  }
  return out;
}

/* ────────────── 4 · subject-class promotion in felt conversions ───────────── */

const PERSON_WORDS = /\b(people|person|investors?|believers?|holders who|families|savers?|someone|anyone)\b/i;

/** The demonstrated path, which walked the sanctioned pipeline and was spoken
 *  aloud: an ADDRESS COHORT → felt as "the people who held longest" → a
 *  conclusion about "people who believed in it". Three hops, no flag. The step
 *  built to make a number felt is also a laundering path from measured data to
 *  imputed human intent. */
export function checkScalePromotion(r: ScriptRender): GateFinding[] {
  const out: GateFinding[] = [];
  for (const sc of NOTEBOOK.scaleConversions ?? []) {
    const rawIsHuman = PERSON_WORDS.test(sc.raw);
    const feltIsHuman = PERSON_WORDS.test(sc.felt);
    if (feltIsHuman && !rawIsHuman) {
      const inRender = has(renderText(r), sc.felt.slice(0, 30));
      out.push({
        rule: "scale-promotion",
        subject: sc.for ?? sc.raw.slice(0, 40),
        verdict: inRender ? "violation" : "not-engaged",
        detail: `Felt conversion introduces a person-class the raw figure does not have: "${sc.raw}" → "${sc.felt}".${inRender ? " And it reaches the render." : " Not used by this render."}`,
      });
    }
  }
  return out;
}

/* ──────────────────── 5 · the conclusions gate gets a caller ──────────────── */

/** `conclusionIssues()` existed with ZERO CALLERS, and the schema had no
 *  `conclusions[]` field, so a research run could not reach it at all. A gate
 *  nothing calls is a gate nobody passes and nobody fails. This is its caller:
 *  any conclusion whose claim reaches the render is judged at the boundary. */
export function checkConclusions(
  r: ScriptRender,
  conclusions: Conclusion[],
  filedOrAdmitted?: ReadonlySet<string>,
): GateFinding[] {
  const text = renderText(r);
  const out: GateFinding[] = [];
  for (const c of conclusions) {
    const reaches = has(text, c.claim.slice(0, 28));
    if (!reaches) continue;
    const issues = conclusionIssues(c, { filedOrAdmitted });
    if (!issues.length) {
      out.push({ rule: "conclusion", subject: c.id, verdict: "pass",
        detail: `Reaches the render and clears every naming/falsifier rule.` });
      continue;
    }
    for (const i of issues) {
      out.push({ rule: "conclusion", subject: c.id, verdict: "violation",
        detail: `${i.rule}: ${i.detail}` });
    }
  }
  return out;
}

/* ───────────────────────────── 6 · traceability ───────────────────────────── */

/** Every figure a viewer hears should exist somewhere in the notebook. This is
 *  the weakest check here and it is honest about that: it matches digits, so a
 *  spelled-out number is reported `unmeasured` rather than passed. */
export function checkTraceability(r: ScriptRender, facts: Fact[]): GateFinding[] {
  const corpus = facts.map((f) => f.claim).join(" ") +
    " " + (NOTEBOOK.scaleConversions ?? []).map((s) => `${s.raw} ${s.felt}`).join(" ");
  const out: GateFinding[] = [];
  const seen = new Set<string>();

  for (const beat of r.beats) {
    for (const m of beat.text.match(DIGITS) ?? []) {
      const n = m.replace(/[^\d]/g, "");
      if (!n || n.length < 2 || seen.has(n)) continue;
      seen.add(n);
      if (!corpus.replace(/[^\d\s]/g, "").includes(n) && !corpus.includes(n)) {
        out.push({ rule: "traceability", subject: n, verdict: "violation",
          detail: `The figure "${m.trim()}" is spoken and appears in no fact and no scale conversion.`,
          at: beat.at, quote: beat.text.slice(0, 140) });
      }
    }
    if (SPELLED.test(beat.text)) SPELLED.lastIndex = 0;
  }
  if (!out.length) {
    out.push({ rule: "traceability", subject: "digits", verdict: "pass",
      detail: "Every digit-form figure in the render traces to a fact or a scale conversion." });
  }
  out.push({ rule: "traceability", subject: "spelled-out figures", verdict: "unmeasured",
    detail: "Numbers written as words are not matched. A spoken script states most of its figures this way, so this check covers a minority of what a viewer actually hears." });
  return out;
}

/* ────────────────────────────── the gate itself ──────────────────────────── */

export interface GateReport {
  renderId: string;
  findings: GateFinding[];
  violations: number;
  passes: number;
  unmeasured: number;
  notEngaged: number;
  /** Of the rules that COULD have been executed, how many were. The number that
   *  keeps this file honest about its own reach. */
  enforced: number;
  /** A render with any violation does not ship. Advisory is what the last gate
   *  was, and it was walked past three ways in four minutes. */
  blocked: boolean;
}

export function runGate(
  r: ScriptRender,
  opts: {
    facts?: Fact[];
    unknowns?: Unknown[];
    probes?: Record<string, Probe>;
    conclusions?: Conclusion[];
    filedOrAdmitted?: ReadonlySet<string>;
  } = {},
): GateReport {
  const facts = opts.facts ?? NOTEBOOK.facts;
  const unknowns = opts.unknowns ?? Object.values(UNKNOWN_BY_ID);
  const probes = opts.probes ?? PROBES;

  const findings = [
    ...checkConstraints(r, unknowns, probes),
    ...checkQualifiers(r, facts),
    ...checkUtterances(r, facts),
    ...checkScalePromotion(r),
    ...checkTraceability(r, facts),
    ...(opts.conclusions ? checkConclusions(r, opts.conclusions, opts.filedOrAdmitted) : []),
  ];

  const count = (v: Verdict) => findings.filter((f) => f.verdict === v).length;
  const violations = count("violation");
  const passes = count("pass");
  const unmeasured = count("unmeasured");
  const testable = passes + violations + unmeasured;

  return {
    renderId: r.id,
    findings,
    violations,
    passes,
    unmeasured,
    notEngaged: count("not-engaged"),
    enforced: testable ? Math.round(((passes + violations) / testable) * 100) : 0,
    blocked: violations > 0,
  };
}

/* ───────────────────── probes for the incumbent notebook ─────────────────── */

/** Written from each unknown's own `impact` string, not invented beside it.
 *  `u-yield-causality` is the control: its violation is already documented in
 *  the reference run and was missed by twelve hand-written self-checks. If this
 *  table is right, the gate finds it without being told where to look. */
export const PROBES: Record<string, Probe> = {
  "u-cohorts": {
    whenMentions: ["cohort", "long-term holder", "whale", "held longest"],
    tests: "no single seller is named as the cause",
  },
  "u-spot-price": {
    whenMentions: ["price", "worth", "value"],
    forbid: [/\$\s?6[0-9],?\d{3}/, /\bsixty[- ]?(one|two|three|four|five|six|seven|eight|nine)?\s?thousand\b/i],
    requireOne: ["roughly half", "around $60,000", "about half", "down fifty percent", "half its"],
    tests: "the current level is given as a ratio, never as a precise figure",
  },
  "u-liquidity-vendor": {
    forbid: ["93%", "93 percent", "7.6x", "7.6 times", "ninety-three percent"],
    tests: "the vendor's liquidity figures appear nowhere",
  },
  "u-yield-causality": {
    noCausalLink: {
      a: ["treasury yield", "yields", "real yields", "10-year"],
      b: ["bitcoin was sold", "bitcoin sold", "sold bitcoin", "bitcoin fell", "selling"],
    },
    tests: "yields and selling are never joined causally — the notebook measured correlation",
  },
};
