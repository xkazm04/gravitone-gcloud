import { conclusionIssues, type Conclusion } from "./conclusions";

function run(label: string, c: Conclusion, opts: { filedOrAdmitted?: ReadonlySet<string> } = {}) {
  const issues = conclusionIssues(c, opts);
  console.log("\n=== " + label + " ===");
  console.log("  leap=" + c.leap + "  subject=" + (c.subject ? c.subject.names : "ABSENT") +
    "  binds=" + (typeof c.falsifiableBy === "string" ? "(bare string)" : c.falsifiableBy.binds) +
    "  clauses=" + (c.clauses ? c.clauses.length : 0) +
    "  filedOrAdmitted=" + (opts.filedOrAdmitted ? [...opts.filedOrAdmitted].join(",") : "none"));
  if (issues.length === 0) console.log("  >>> ZERO ISSUES — SHIPS CLEAN");
  else issues.forEach((i) => console.log("  [" + i.rule + "] " + i.detail));
}

// ---------------------------------------------------------------------------
// THE TWO CARDS I ACTUALLY WANT TO PUBLISH
// ---------------------------------------------------------------------------

const cRouteNotOutcome: Conclusion = {
  id: "c-route-not-outcome",
  claim:
    "What has been established here is a route, not a reason. Two bodies empowered to make findings examined this, and neither reached the question of why any particular company was paid.",
  reasoning:
    "The court's holding is about the operation of a lane measured against an equal-treatment obligation; it expressly declined to attribute the awards to the lane. The auditor's findings are about documentation measured against regulation 84; it recorded that it could not give assurance either way.",
  leap: "near",
  restsOn: ["f-judgment-unlawful", "f-judgment-counterfactual", "f-judgment-relief", "f-abs-hpl-criteria", "f-abs-minister-involvement", "f-rule-84"],
  subject: { names: "state", who: "the UK government as awarding body (DHSC and Cabinet Office)" },
  falsifiableBy: {
    test: "A finding on that question by a body empowered to make one: a judgment, a completed NAO conclusion on a named award, or a PAC finding of fact identifying a decision-maker and a reason.",
    kind: "document",
    binds: "whole-claim",
  },
  useFor: "boundary",
};

const cAbsenceIsTheFinding: Conclusion = {
  id: "c-absence-is-the-finding",
  claim:
    "In this matter the absence is the finding: in the procurements the auditor examined, the specific documents that would show why a supplier was chosen were not written — and regulation 84 required them.",
  reasoning:
    "Regulation 84 makes the record a duty specifically for direct awards. So the non-existence of the record is itself a completed fact about conduct against a published standard.",
  leap: "near",
  restsOn: ["f-rule-84", "f-abs-hpl-criteria", "f-abs-conflict-doc", "f-abs-supplier-reasons"],
  subject: { names: "org", who: "Cabinet Office and DHSC as awarding bodies" },
  clauses: [
    { id: "not-written", text: "the documents were not written in the procurements examined", loadBearing: true },
    { id: "required", text: "regulation 84 required them", loadBearing: true },
  ],
  falsifiableBy: {
    test: "Production of the documents — a contemporaneous record of the reasons for the choice of supplier in the procurements at NAO HC 959 paras 3.21-3.22.",
    kind: "document",
    binds: "not-written",
  },
  useFor: "thesis",
};

// ---------------------------------------------------------------------------
// THE MOST DANGEROUS SENTENCE MY EVIDENCE WOULD SUPPORT.
// Two forbidden things in one sentence:
//   (a) a legal conclusion — "broke regulation 84" — that NO empowered body has
//       reached. The auditor said "insufficient documentation". That is not a
//       finding of breach, and only a court or the auditor's own adverse
//       conclusion could make it one.
//   (b) a purpose claim — "the lane existed to deliver contracts to people the
//       referrers already knew" — which is a claim about why, about the state.
// This card must never be published. It is run against the gate four ways.
// ---------------------------------------------------------------------------

const DANGEROUS_BASE = {
  id: "c-DANGEROUS-do-not-ship",
  claim:
    "The awarding bodies broke the record-keeping rule in regulation 84, and on the pattern of who was referred and who was paid, the lane existed to deliver contracts to people the referrers already knew.",
  reasoning:
    "Regulation 84 requires the documentation; the auditor found it absent in the procurements it examined; a lane that converted at 13.65 times the ordinary rate and applied no quality filter, fed by referrals with no criteria and often no recorded source, is a channel whose observed function was to move known parties to the front.",
  restsOn: ["f-rule-84", "f-abs-hpl-criteria", "f-abs-supplier-reasons", "f-hpl-ratio", "f-lane-not-a-filter", "f-judgment-unlawful"],
  subject: { names: "state", who: "the UK government as awarding body" } as const,
  useFor: "thesis" as const,
};

// V1 — honest grading. This is a genuine reach: it imputes a purpose. `far`.
//      Compound claim, clauses declared honestly, falsifier binds the CHECKABLE
//      half (the paperwork), which is exactly the E6 exemplar's defect.
const v1: Conclusion = {
  ...DANGEROUS_BASE,
  leap: "far",
  clauses: [
    { id: "breach", text: "the awarding bodies broke regulation 84" },
    { id: "purpose", text: "the lane existed to deliver contracts to people the referrers already knew", loadBearing: true },
  ],
  falsifiableBy: {
    test: "Production of the documentation the auditor recorded as absent, and of contemporaneous referral criteria for the lane.",
    kind: "document",
    binds: "breach",
  },
};

// V2 — EVASION 1: keep everything, but grade the leap `moderate`. Nothing in the
//      file defines the tiers operationally, so this is a free choice.
const v2: Conclusion = { ...v1, leap: "moderate" };

// V3 — EVASION 2: the one that matters. Declare NO clauses and bind
//      "whole-claim". The compound-claim rule is guarded by
//      `if (f.binds !== "whole-claim")`, so declaring nothing skips it entirely.
const v3: Conclusion = {
  ...DANGEROUS_BASE,
  leap: "moderate",
  falsifiableBy: {
    test: "Production of the documentation the auditor recorded as absent, and of contemporaneous referral criteria for the lane.",
    kind: "document",
    binds: "whole-claim",
  },
};

// V4 — EVASION 3: keep the honest `far` grading AND the honest clauses, but pass
//      the filed judgment in `filedOrAdmitted`. It IS a filed action and it IS
//      in restsOn. Does one filed document buy the whole card?
const v4: Conclusion = { ...v1, leap: "unhinged" };

// V5 — control: the same dangerous card with `subject` simply omitted.
const v5: Conclusion = { ...v3, subject: undefined };

// V6 — control: the L1 sentence verbatim, ungraded by any court.
const v6: Conclusion = {
  id: "c-l1-sentence",
  claim: "The award did not comply with the applicable procurement rule.",
  reasoning: "It barely restates what the cards already imply.",
  leap: "near",
  restsOn: ["f-rule-84", "f-abs-supplier-reasons"],
  subject: { names: "state", who: "the awarding authority" },
  falsifiableBy: { test: "The documentation the auditor recorded as absent, produced.", kind: "document", binds: "whole-claim" },
  useFor: "thesis",
};

run("PUBLISHABLE 1 — c-route-not-outcome (boundary card)", cRouteNotOutcome);
run("PUBLISHABLE 2 — c-absence-is-the-finding", cAbsenceIsTheFinding);
run("DANGEROUS V1 — honest: far + clauses + falsifier binds the checkable half", v1);
run("DANGEROUS V2 — evasion: regrade far -> moderate", v2);
run("DANGEROUS V3 — evasion: declare NO clauses, bind whole-claim", v3);
run("DANGEROUS V4 — evasion: unhinged, but the filed judgment is in restsOn", v4, {
  filedOrAdmitted: new Set(["f-judgment-unlawful"]),
});
run("CONTROL V5 — same card, subject omitted entirely", v5);
run("CONTROL V6 — the L1 sentence: a near-leap legal conclusion nobody empowered has made", v6);
