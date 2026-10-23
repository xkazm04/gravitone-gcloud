// THE SHAPE HALF: the checks on a notebook's own fields, the ones that need no
// knowledge of the world.
//
// Split into three files: this one holds the per-field checks, the predicates and
// constants they use are in shape-helpers.ts, and the optional dimensions and
// conclusions checks are in shape-columns.ts. Their order of findings is unchanged.

import type { NotebookFinding } from "./failure";
import { compileProbe, type SerializableProbe } from "@/lib/script/gate";
import { columnFindings } from "./shape-columns";
import { arr, CLAIM_MAX, isObj, linked, str } from "./shape-helpers";

/* ─────────────────────────────── the shape half ──────────────────────────── */

/**
 * Check the model's answer against the rules of NOTEBOOK-SCHEMA.md that are
 * checkable without knowing anything about the world.
 *
 * Returns findings rather than throwing, so the caller reports all of them at
 * once and so this function is testable without a try/catch.
 */
export function shapeFindings(nb: Record<string, unknown>): NotebookFinding[] {
  const out: NotebookFinding[] = [];
  /** `path` is where in the answer the rule is broken; `observed` what is there. */
  const say = (path: string, rule: string, observed = "missing or invalid") => void out.push({ path, rule, observed });

  /* identity — § Fields · Identity */
  for (const k of ["topic", "question", "verdict"])
    if (!str(nb[k])) say(k, `\`${k}\` is missing or empty (schema § Identity).`, "missing or empty");

  /* the load-bearing field — § tension */
  const t = nb.tension;
  if (!isObj(t)) say("tension", "`tension` is missing. A notebook without a tension is a FAILED notebook (schema § tension).", "missing");
  else
    for (const k of ["expectation", "reality", "whyItIsATension", "strength"])
      if (!str(t[k])) say(`tension.${k}`, `\`tension.${k}\` is missing or empty (schema § tension).`, "missing or empty");

  /* facts — § facts[], rules 1, 2, 3 */
  const facts = nb.facts;
  if (!arr(facts) || facts.length === 0) say("facts", "`facts` is empty. There is nothing for a script to rest on.", "empty");
  else
    facts.forEach((raw, i) => {
      const at = `facts[${i}]`;
      if (!isObj(raw)) return say(at, `${at} is not an object.`, "not an object");
      const f = raw;
      if (!str(f.id)) say(`${at}.id`, `${at}.id is missing.`);
      if (!str(f.claim)) say(`${at}.claim`, `${at}.claim is missing.`);
      else {
        // The headline budget, and the two ways it is broken.
        if (f.claim.length > CLAIM_MAX)
          say(
            `${at}.claim`,
            `${at}.claim is ${f.claim.length} characters; the budget is ${CLAIM_MAX} (schema § claim). ` +
              `A claim that cannot fit is usually two claims — the argument belongs in \`note\`.`,
            `${f.claim.length} characters`,
          );
        if (/\.$/.test(f.claim.trim())) say(`${at}.claim`, `${at}.claim ends in a period; a headline carries none (schema § claim).`, "ends in a period");
      }
      if (typeof f.loadBearing !== "boolean") say(`${at}.loadBearing`, `${at}.loadBearing is missing (schema § facts[]).`);
      if (!str(f.confidence)) say(`${at}.confidence`, `${at}.confidence is missing. Confidence is stated, never implied (rule 3).`);
      if (!str(f.asOf)) say(`${at}.asOf`, `${at}.asOf is missing. Every fact is dated (rule 2).`);
      // Rule 2, and the "comma-joined source" anti-pattern in one check: sources
      // are PLURAL and each carries a class, so they can be counted and graded.
      if (!arr(f.sources) || f.sources.length === 0)
        say(`${at}.sources`, `${at}.sources is empty. Every fact is sourced, with an evidence class (rule 2).`, "empty");
      else
        f.sources.forEach((s, j) => {
          if (!isObj(s) || !str(s.name)) say(`${at}.sources[${j}]`, `${at}.sources[${j}] has no name.`, "no name");
          else if (!str(s.evidenceClass))
            say(
              `${at}.sources[${j}].evidenceClass`,
              `${at}.sources[${j}] ("${s.name}") has no evidenceClass. Aggregators restate; they do not verify (rule 4).`,
            );
        });
      // Rule 6, only where the kind was declared: an absence with no scope is an
      // assertion, and a derived fact with no inputs cannot be recomputed.
      if (f.kind === "absence" && !str(f.searchScope))
        say(`${at}.searchScope`, `${at} is \`kind: "absence"\` with no searchScope. An absence without its search scope is an assertion.`);
      if (f.kind === "derived" && !(arr(f.derivedFrom) && f.derivedFrom.length))
        say(`${at}.derivedFrom`, `${at} is \`kind: "derived"\` and names no derivedFrom.`);
    });

  /* mechanisms — § mechanisms[], Phase 3 */
  const mechs = nb.mechanisms;
  if (!arr(mechs) || mechs.length === 0) say("mechanisms", "`mechanisms` is empty. Phase 3 authors the beat chain; Script inherits it.", "empty");
  else
    mechs.forEach((raw, i) => {
      const at = `mechanisms[${i}]`;
      if (!isObj(raw)) return say(at, `${at} is not an object.`, "not an object");
      const m = raw;
      if (!str(m.id)) say(`${at}.id`, `${at}.id is missing.`);
      if (!str(m.name)) say(`${at}.name`, `${at}.name is missing.`);
      if (!str(m.explains)) say(`${at}.explains`, `${at}.explains is missing.`);
      if (!arr(m.chain) || m.chain.length < 2)
        say(`${at}.chain`, `${at}.chain has fewer than two links, so nothing in it connects (schema § mechanisms[]).`, "fewer than two links");
      else
        m.chain.slice(1).forEach((link, j) => {
          if (!str(link)) return say(`${at}.chain[${j + 1}]`, `${at}.chain[${j + 1}] is empty.`, "empty");
          if (!linked(link))
            say(
              `${at}.chain[${j + 1}]`,
              `${at}.chain[${j + 1}] opens "${link.trim().split(/\s+/).slice(0, 4).join(" ")}…" — every link after the ` +
                `first is BUT, THEREFORE or TRANSFER. If the only honest connector is AND THEN, this is a sequence, ` +
                `not a mechanism (RESEARCH-PROMPT § Phase 3).`,
              `opens "${link.trim().split(/\s+/).slice(0, 4).join(" ")}…"`,
            );
        });
    });

  /* reversals — Phase 4, quality bar */
  const rev = nb.reversals;
  if (!arr(rev) || rev.length === 0)
    say("reversals", "`reversals` is empty. The quality bar requires at least one turn, with a generously stated obvious reading.", "empty");
  else
    rev.forEach((raw, i) => {
      const at = `reversals[${i}]`;
      if (!isObj(raw)) return say(at, `${at} is not an object.`, "not an object");
      for (const k of ["id", "obviousReading", "whyWrong", "escalation"])
        if (!str(raw[k])) say(`${at}.${k}`, `${at}.${k} is missing.`);
      // Not cosmetic: `buildCards` SPREADS this field (`[...r.evidence, …]`), so
      // a reversal with no `evidence` array throws a TypeError out of the graph
      // pass rather than raising a finding from it. An empty array is a legal
      // answer — a turn resting on a mechanism alone — and `undefined` is not.
      if (!arr(raw.evidence)) say(`${at}.evidence`, `${at}.evidence must be an array of fact ids (it may be empty).`);
    });

  /* the steel-man — rule 7, and the one it is most often faked on */
  const sm = nb.steelMan;
  if (!isObj(sm))
    say("steelMan", "`steelMan` is missing. It is MANDATORY (rule 7) — its absence is what separates an explainer from a polemic.", "missing");
  else {
    for (const k of ["claim", "statement", "whyInclude"]) if (!str(sm[k])) say(`steelMan.${k}`, `\`steelMan.${k}\` is missing.`);
    // Phase 6: discharged by a found case, a marked construction, or a dated
    // absence — never by silence. `provenance` is what says which, and the
    // schema calls an unmarked construction "the failure mode this phase was
    // written against".
    if (!str(sm.provenance) || !["found", "found-adjacent", "constructed"].includes(sm.provenance as string))
      say(
        "steelMan.provenance",
        "`steelMan.provenance` must be `found`, `found-adjacent` or `constructed`. " +
          "A constructed opposition is bounded by the author's own prior and the reader has to be able to see that.",
      );
    if (sm.provenance === "constructed" && !str(sm.restsOnAbsence))
      say("steelMan.restsOnAbsence", "`steelMan` is constructed and names no `restsOnAbsence` — the dated absence in facts[] that licensed it.");
  }

  /* unknowns — rule 8 */
  const unk = nb.unknowns;
  if (!arr(unk)) say("unknowns", "`unknowns` is missing.", "missing");
  else
    unk.forEach((raw, i) => {
      const at = `unknowns[${i}]`;
      if (!isObj(raw)) return say(at, `${at} is not an object.`, "not an object");
      if (!str(raw.id)) say(`${at}.id`, `${at}.id is missing.`);
      if (!str(raw.impact))
        say(`${at}.impact`, `${at}.impact is missing. An unknown with no consequence for the script is a note, not a constraint (rule 8).`);
      if (raw.probe !== undefined) {
        if (!isObj(raw.probe)) return say(`${at}.probe`, `${at}.probe (unknown ${String(raw.id)}) is not an object.`, "not an object");
        try {
          compileProbe(raw.probe as unknown as SerializableProbe);
        } catch (e) {
          say(`${at}.probe`, `${at}.probe (unknown ${String(raw.id)}) has a forbid pattern that does not compile: ${(e as Error).message}`);
        }
      }
    });

  /* currency — § currency, Phase 8 */
  const cur = nb.currency;
  if (!isObj(cur)) say("currency", "`currency` is missing (Phase 8).", "missing");
  else for (const k of ["halfLife", "why", "advice"]) if (!str(cur[k])) say(`currency.${k}`, `\`currency.${k}\` is missing.`);

  /* engine fit — Phase 8. Reported, never chosen (rule 10). */
  if (!arr(nb.engineFit) || nb.engineFit.length === 0)
    say("engineFit", "`engineFit` is empty. Phase 8 assesses fit from the material; the human decides (rule 10).", "empty");
  else
    nb.engineFit.forEach((raw, i) => {
      // Required, and "" is a valid answer. A record with no hazard key never
      // asked the second axis, and a blank that renders as nothing reads as clean.
      if (isObj(raw) && typeof raw.hazard !== "string")
        say(`engineFit[${i}].hazard`, `engineFit[${i}].hazard is missing. Write "" for assessed, none found; a missing key means never asked.`);
    });

  columnFindings(nb, say);

  /* gaps — Phase 9 */
  const gaps = nb.researchGaps;
  if (!arr(gaps) || gaps.length === 0)
    say("researchGaps", "`researchGaps` is empty. A notebook claiming no gaps did not look hard enough (Phase 9).", "empty");

  return out;
}
