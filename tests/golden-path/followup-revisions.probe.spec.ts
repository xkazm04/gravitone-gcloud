// LANE — A TRANSCRIPT THE NOTEBOOK HAS CORRECTED SAYS SO (ratchet).
//
// `revisionsOf` exists because the fixture is real terminal output and evidence
// can be wrong: CANNED["q-whales"] states that mid-tier holders distributed
// "slightly MORE than the whales absorbed", and it is not — 77,800 is 29% of
// ~270,000. The notebook caught it and carries the corrected row; the transcript
// stands verbatim beside it, because "a fixture quietly rewritten to be right is
// a fixture that can no longer show how a run goes wrong."
//
// The detector's own docstring names its limit and asks for this ratchet in so
// many words: a divergence is reported only where the notebook SAYS WHY its row
// differs (`confidenceNote`), and "THE LIMIT, stated rather than discovered: a
// correction landed without a confidenceNote is invisible here. That is a reason
// to write one, not a reason to widen this to every wording difference."
//
// A limit that is stated and unpinned is a limit nobody finds out about. Measured
// 2026-09-05: 3 adds-fact effects, 2 diverge from the notebook, and exactly 1 of
// those is reported — the other is `f-whale-absorb`, whose divergence the
// docstring itself judges benign ("over a fortnight" was dropped, nothing is
// wrong with either version). So the blind spot is currently occupied by exactly
// the case it was designed to hold, and nothing would say if that stopped being
// true.
//
// This is a RATCHET, the shape object-url-ownership.probe.spec.ts uses. The
// benign silences are listed with their reasons; what fails is a NEW one. That
// failure is the docstring's "reason to write one", arriving at the moment the
// correction lands rather than whenever somebody next reads the surface.
import { test, expect } from "@playwright/test";

import { FACT_BY_ID } from "@/app/_phases/_shared/notebook/notebook";
import { CANNED, revisionsOf } from "@/app/_phases/research/followup";

/** Facts whose transcript and notebook rows differ with NO `confidenceNote`, so
 *  `revisionsOf` cannot report them — each with the reason it is acceptable.
 *  An entry is a claim somebody defends in review. */
const BENIGN_SILENCE: Record<string, string> = {
  // followup.ts names this one itself, as its worked example of what must NOT
  // be flagged: the notebook's row drops "over a fortnight" from the
  // transcript's wording and both versions are true. Flagging it "would train
  // the reader to ignore the flag, which is the whole alarm gone."
  "f-whale-absorb": "wording only — the notebook drops 'over a fortnight'; neither version is wrong",
};

interface Diverging {
  key: string;
  factId: string;
  reported: boolean;
}

function diverging(): Diverging[] {
  const out: Diverging[] = [];
  for (const [key, result] of Object.entries(CANNED)) {
    for (const e of result.effects) {
      if (e.kind !== "adds-fact") continue;
      const f = FACT_BY_ID[e.factId];
      // A transcript adding a fact the notebook does not carry at all is a
      // different failure (the graph probe's dangling-edge job), not this one.
      if (!f) continue;
      if (f.claim.trim() === e.claim.trim() && f.confidence === e.confidence) continue;
      out.push({ key, factId: e.factId, reported: Boolean(f.confidenceNote) });
    }
  }
  return out;
}

test("the fixture still contains a corrected transcript — otherwise this proves nothing", () => {
  const d = diverging();
  console.log(`[revisions] diverging adds-fact effects: ${d.map((x) => `${x.factId}${x.reported ? "" : " (silent)"}`).join(", ") || "none"}`);
  expect(d.length, "no transcript diverges from the notebook any more — revisionsOf has nothing to detect").toBeGreaterThan(0);
  expect(d.some((x) => x.reported), "no divergence is reported — the detector may have stopped working").toBe(true);
});

test("every SILENT divergence is one somebody has defended", () => {
  const silent = diverging().filter((x) => !x.reported).map((x) => x.factId);
  console.log(`[revisions] silent: ${JSON.stringify(silent)}; listed as benign: ${JSON.stringify(Object.keys(BENIGN_SILENCE))}`);
  expect(
    silent.sort(),
    "a transcript diverges from the notebook with no `confidenceNote`, so the surface shows the transcript's " +
      "sentence and no correction. Either write the confidenceNote (the fix followup.ts asks for) or list it " +
      "in BENIGN_SILENCE here with the reason it does not need one.",
  ).toEqual(Object.keys(BENIGN_SILENCE).sort());
});

test("a stale exemption is its own defect", () => {
  // The same rule imaging-auth applies to DELIBERATELY_PUBLIC: an entry naming
  // a fact that no longer diverges reads as a considered decision and is really
  // a row that moved.
  const silent = new Set(diverging().filter((x) => !x.reported).map((x) => x.factId));
  for (const id of Object.keys(BENIGN_SILENCE)) {
    expect(FACT_BY_ID[id], `${id} is exempted here and is not a fact any more`).toBeTruthy();
    expect(silent.has(id), `${id} is exempted as a silent divergence and is no longer one`).toBe(true);
  }
});

test("revisionsOf reports the divergence it can see, with the notebook's reason", () => {
  // The detector itself, driven — the ratchet above is about its blind spot and
  // would pass just as well against a function that had stopped detecting.
  const revs = Object.values(CANNED).flatMap(revisionsOf);
  console.log(`[revisions] revisionsOf reports ${revs.length}: ${revs.map((r) => r.factId).join(", ")}`);
  expect(revs.length).toBeGreaterThan(0);
  for (const r of revs) {
    expect(r.why, `${r.factId} is reported with no reason — confidenceNote is the whole test`).toBeTruthy();
    expect(r.transcribed === r.current && r.transcribedConfidence === r.currentConfidence).toBe(false);
  }
});
