import "server-only";

import { sourceOf, type NotebookSource } from "@/lib/notebook/source";
import type { Notebook } from "@/lib/notebook/types";
import type { ScriptRender } from "@/lib/script/types";
import { explainerRender } from "@/lib/frames/frames";
import { unitsFromRender } from "@/lib/frames/picture/unit";

// THE QUIET TARIFF'S RESEARCH AND SCRIPT - the work its Plan says was done (research and script
// ratified), written as the work in the shapes why-bitcoin's run uses (lib/notebook/notebook.ts,
// lib/script/renders.ts). Until 2026-11-09 the fixture held no notebook for this project, so its
// Plan claimed two finished parts whose editors read "no notebook" and "no candidates".
//
// The topic is real: the end of the US "de minimis" duty exemption in 2025. The figures are the
// public record as reported (CBP, the executive orders, the postal services' notices); where a
// figure is a press report rather than a primary table it says so in its confidence. A dry run
// stands in with THIS notebook only for THIS project (../fixtureResearch.ts REPLAYS).

const NOTEBOOK: Notebook = {
  id: "the-quiet-tariff",
  topic: "The quiet tariff",
  question: "The US raised no tariff rate on small parcels in 2025. Why did they start costing more?",
  verdict: "Because the tariff was always there; what ended was the exemption that let a parcel under $800 skip it. Removing an exemption taxes every parcel at once without a single rate moving.",
  researched: "2026-10-12",
  researcher: "dry stand-in · fixture",
  templateIntent: "short-educational-video",
  subjectDomain: ["economy", "politics"],
  tension: {
    expectation: "A tariff is a rate someone announces and argues about.",
    reality: "The biggest change to what small parcels cost arrived as the end of an exemption, with no new rate at all.",
    whyItIsATension: "The visible lever (the rate) never moved; the invisible one (who is exempt) moved everything.",
    strength: "medium - the mechanism is plain, the size of the effect on prices is not yet measured",
  },
  facts: [
    { id: "f-threshold", claim: "Section 321 let a shipment worth up to $800 per person per day enter the US free of duty and without a formal entry", loadBearing: true, source: "19 U.S.C. 1321; the 2016 Trade Facilitation and Trade Enforcement Act raised it from $200", confidence: "high", asOf: "2016-03-10" },
    { id: "f-volume", claim: "US Customs processed more than 1.3 billion de minimis shipments in fiscal 2024, up from about 1 billion in fiscal 2023", loadBearing: true, source: "CBP trade statistics, as reported", confidence: "medium", confidenceNote: "CBP's own rounded figures, quoted in press coverage", asOf: "2024-09-30" },
    { id: "f-china-end", claim: "Duty-free de minimis treatment ended for goods from China and Hong Kong on 2 May 2025", loadBearing: true, source: "executive order of 2 April 2025", confidence: "high", asOf: "2025-05-02" },
    { id: "f-global-end", claim: "De minimis treatment was suspended for goods from every country from 29 August 2025", loadBearing: true, source: "executive order of 30 July 2025", confidence: "high", asOf: "2025-08-29" },
    { id: "f-postal", claim: "Several national postal services, among them Germany's and Japan's, paused most parcel shipments to the US in late August 2025", loadBearing: true, source: "the postal services' customer notices, August 2025", confidence: "medium", asOf: "2025-08-25" },
    { id: "f-share", claim: "Two marketplaces were reported to send a large share of all de minimis parcels", loadBearing: false, source: "press estimates", confidence: "low", confidenceNote: "estimates vary and none is a customs table", asOf: "2024" },
  ],
  mechanisms: [
    {
      id: "m-exemption",
      name: "A tariff with no rate change",
      chain: ["A parcel under $800 was exempt", "THEREFORE it paid no duty and needed no formal entry", "BUT the exemption ends", "THEREFORE every parcel owes the duty its goods already carried", "AND someone must file the entry", "THEREFORE the cost lands per parcel, at the door"],
      explains: "Why prices on small imports rose with no new tariff announced",
      needsAnalogy: true,
    },
  ],
  reversals: [
    {
      id: "r-loophole",
      obviousReading: "Closing the loophole only hits the bargain marketplaces it was aimed at",
      whyWrong: "The exemption covered every small parcel from every country, so its end reached every sender, down to the postal services",
      mechanismId: "m-exemption",
      evidence: ["f-global-end", "f-postal"],
      escalation: "The first visible effect was not a price: it was parcels that stopped being sent at all",
    },
  ],
  steelMan: {
    claim: "The exemption made inspection impossible",
    evidence: ["f-volume"],
    statement: "Over a billion parcels a year entered with almost no data attached; customs could not see what was in them, and enforcement needs to see.",
    whyInclude: "The case for ending it is about enforcement, not revenue, and the film is unfair without it",
    provenance: "found-adjacent",
  },
  scaleConversions: [{ for: "f-volume", raw: "more than 1.3 billion parcels a year", felt: "about four parcels for every person in the US", kind: "count" }],
  analogyCandidates: [{ for: "m-exemption", analogy: "a toll road that let small cars through free, then lowered the barrier for everyone", quality: "good - physical, spent once" }],
  candidateQuestions: ["Who pays the duty a small parcel now owes?"],
  counterPositions: [],
  unknowns: [{ id: "u-who-pays", what: "How much of the new duty reaches shelf prices", why: "No price index isolates small-parcel imports yet", impact: "The film can say the cost moved, not how much of it the buyer carries" }],
  engineFit: [],
  currency: { halfLife: "months", why: "the rules are being rewritten by order", expiresFirst: ["f-postal"], durable: ["f-threshold", "m-exemption"], advice: "state dates on every rule change" },
  sources: ["19 U.S.C. 1321", "executive orders of 2 April 2025 and 30 July 2025", "CBP trade statistics", "postal service notices, August 2025"],
  researchGaps: ["no primary customs table for marketplace shares", "no measured effect on consumer prices"],
};

let source: NotebookSource | undefined;
/** The notebook a dry research run stands in with, for this project only. */
export const tariffSource = (): NotebookSource => (source ??= sourceOf(NOTEBOOK, { kind: "replay" }));

/** The candidate a dry compose turn stands in with; the Plan's done script adopted it. */
export const TARIFF_RENDERS: readonly ScriptRender[] = [
  {
    form: "explainer",
    id: "quiet-tariff-reversal",
    engine: "reversal-chain",
    engineLabel: "Reversal Chain",
    pleasure: "being corrected",
    title: "The quiet tariff",
    template: "short-educational-video",
    durationS: 110,
    words: 262,
    wordBudget: 280,
    wpm: 150,
    turns: 2,
    turnBand: [1, 3],
    questionsAloud: 1,
    promiseForm: "topics",
    feelsLike: "an argument",
    bestFor: "a viewer who thinks tariffs are rates",
    weakness: "the price effect is not yet measured, and the film has to say so",
    causalDensityPct: null,
    beats: [
      { at: "0:00", kind: "hook", label: "the parcel", connector: null, text: "In 2025 a twelve-dollar parcel from overseas started costing more. No tariff rate on it changed." },
      { at: "0:10", kind: "question", label: "the one question", connector: "THEREFORE", text: "So what did?" },
      { at: "0:14", kind: "answer", label: "the answer", connector: "BUT", text: "An exemption ended. Under eight hundred dollars, a parcel used to skip the duty and the paperwork. That door closed." },
      { at: "0:26", kind: "movement", label: "M1 · the door", connector: "THEREFORE", text: "More than a billion parcels a year came through it: about four for every person in the country.", device: "scale conversion" },
      { at: "0:40", kind: "turn", label: "TURN 1 · a tariff with no rate change", connector: "BUT", text: "Every one of those parcels now owes the duty its goods always carried, and someone has to file for it. The cost lands per parcel, at the door.", device: "analogy - spent once" },
      { at: "0:58", kind: "steelman", label: "the case for closing it", connector: "BUT", text: "Customs could not see inside a billion parcels with almost no data attached. Enforcement needs to see." },
      { at: "1:12", kind: "turn", label: "TURN 2 · not only the bargain sites", connector: "BUT", text: "It was aimed at a few marketplaces. It reached every sender: in August, postal services in Germany and Japan stopped sending most parcels at all." },
      { at: "1:32", kind: "close", label: "reframe", connector: "THEREFORE", text: "A tariff is not only a rate. Sometimes it is a door that was open, and then is not. How much of it you pay is still being counted." },
    ],
    checks: [
      { label: "but/therefore between adjacent beats, no AND THEN", state: "pass", detail: "every boundary is a turn or a consequence" },
      { label: "thesis stated early", state: "pass", detail: "0:14 of 1:50" },
      { label: "steel-man present", state: "pass", detail: "0:58" },
      { label: "unknown said aloud", state: "pass", detail: "1:32 - the price effect is not yet measured" },
    ],
    deviations: [],
    cutFacts: [{ factId: "f-share", why: "press estimates only; no customs table names the marketplaces' share" }],
  },
];

/** The plates the adopted candidate's picture needs: one per unit Frames derives from it (the
 *  Plan counts them here, as the trailer's are counted in ./trailer.ts). */
export function tariffPlates(): number {
  const r = TARIFF_RENDERS[0];
  return r === undefined ? 0 : unitsFromRender(explainerRender(r), r).length;
}

/** The frames gate's sentence for this project's failed job: every plate culled for its style. */
export const tariffGateError = (plates: number): string => `gate: 0 of ${plates} plates kept · reason style · re-run needs a new route`;
