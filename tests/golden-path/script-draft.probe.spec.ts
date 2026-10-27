// LANE — SCRIPTDRAFT: THE STEP'S HAND TABLES BECOME ONE PER-PROJECT RECORD (dynamic).
//
// Card `script-phase-A` (docs/concepts/moonshots-2026-10-05/02-research-script.md),
// session 1. Step 2 was five module-scope tables keyed by three fixture render
// ids, and even the model's edit-plan schema enumerated those ids — so nothing
// downstream of the Script step could hold a script that did not ship in the
// repo. `script/draft.ts` introduces the record; this file pins that the
// fixture, re-expressed AS a draft, reproduces today's behaviour exactly, and
// that every reader asked here reads the draft it is handed rather than a
// module constant.
//
// The three cases the card's first-session dispatch names:
//   1 · impactOf(fixtureDraft()) IS today's IMPACT — pinned by digest as well as
//       by deep-equality, because once IMPACT is a shim over the draft the
//       deep-equality is true by construction and stops being a guard.
//   2 · editPlanSchema(draft) enumerates the DRAFT's render ids, and
//       parseEditPlan refuses a fixture id against a draft that lacks it.
//   3 · the constraint ledger is DERIVED from the gate: every row agrees with
//       runGate's constraint verdict, and none is read from the hand table.
//
// A CORRECTION TO THE CARD, recorded where it bites. Case 3 as written expects
// `u-yield-causality` to read `at-risk` on reversal-chain. That is the hand
// table's verdict, and on 2026-10-05 it is FALSE: the render's Movement 3 was
// rewritten after the 2026-08-11 incident and no longer joins yields to selling
// (pipeline/gate-regression.mts case 2 is that correction). runGate passes it.
// The hand ledger and the gate disagree on that row today — which is the
// card's whole argument for deriving one from the other. So the case is
// asserted as the card meant it: `honoured` on the render as it ships, and
// `at-risk` — located, with the gate's quote — on a draft carrying the
// sentence that actually shipped on 2026-08-11.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

import { fixtureDraft, draftOf, impactOf, type DraftRender, type ScriptDraft } from "@/lib/script/draft";
import { IMPACT, ATTRIBUTION } from "@/lib/script/impact";
import { RENDERS, RENDER_BY_ID } from "@/lib/script/renders";
import { EDIT_PLAN_SCHEMA, editPlanSchema, parseEditPlan, PlanError } from "@/lib/script/editPlan";
import { gateDraft, runGate, PROBES, probesFor, type Verdict } from "@/lib/script/gate";
import { CONSTRAINT_LEDGER, ledgerFor } from "@/lib/script/constraints";
import { NOTEBOOK } from "@/lib/notebook/notebook";
import { fixtureSource, sourceOf } from "@/lib/notebook/source";
import type { Unknown } from "@/lib/notebook/types";
import { shapeFindings } from "@/lib/notebook/shape";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Measured on the untouched tree, 2026-10-05, before draft.ts existed:
 *  `sha256(JSON.stringify(IMPACT))`. A change here is a change to what every
 *  matrix, budget and guard reads — re-pin only on purpose. */
const IMPACT_SHA_2026_10_05 = "346e14ea9a49d8aadd55c6ab73d4dc1f5cad33d9982bd2220588576e58dabac5";
/** Same day, `sha256(JSON.stringify(EDIT_PLAN_SCHEMA))` — also the key the
 *  recalibrate cassettes are recorded against (recalibrate-route-e2e). */
const SCHEMA_SHA_2026_10_11 = "d0bfadd10ccffc83569ea1b48a91de779056550a904f8158805f8c1216ad41f0";

/** A draft whose renders are the fixture's, re-identified. Two renders that no
 *  fixture table has ever heard of. */
function draftWith(ids: string[]): ScriptDraft {
  const renders: DraftRender[] = ids.map((id, i) => {
    const base = fixtureDraft().renders[i % RENDERS.length];
    return { ...base, id };
  });
  return draftOf(renders, { projectId: "probe", source: fixtureSource() });
}

/* ───────────────────────────── case 1 · impact ──────────────────────────── */

test("draft/1: impactOf(fixtureDraft()) is today's IMPACT, render for render", () => {
  const d = fixtureDraft();
  const derived = impactOf(d);
  expect(derived).toEqual(IMPACT);
  expect(Object.keys(derived)).toEqual(RENDERS.map((r) => r.id));
  // Not tautological once IMPACT is a shim: the digest was taken before it was.
  expect(sha256(JSON.stringify(derived))).toBe(IMPACT_SHA_2026_10_05);
  expect(sha256(JSON.stringify(IMPACT))).toBe(IMPACT_SHA_2026_10_05);
  // Spot values a reader can check against the render file by eye.
  expect(derived["reversal-chain"]["f-ath"]).toEqual({ kind: "spoken", seconds: 12, beats: ["0:00"] });
  expect(derived["reversal-chain"]["f-sbr"]).toEqual({ kind: "spoken", seconds: 34, beats: ["0:12", "3:35"] });
  expect(derived["adjudication"]["f-liquidity"].kind).toBe("cut");
  expect(derived["adjudication"]["f-liquidity"].why).toMatch(/same vendor figure/);
});

test("draft/1: the fixture draft is the fixture's tables verbatim, and carries its notebook's identity", () => {
  const d = fixtureDraft();
  expect(d.schema).toBe(1);
  expect(d.notebookDigest).toBe(fixtureSource().digest);
  expect(d.renders.map((r) => r.id)).toEqual(RENDERS.map((r) => r.id));
  for (const r of d.renders) {
    expect(r.attribution, r.id).toEqual(ATTRIBUTION[r.id]);
    const { attribution: _a, ledgerNotes: _n, ...render } = r;
    expect(render, r.id).toEqual(RENDER_BY_ID[r.id]);
  }
  // Probes travel as JSON — no RegExp survives JSON.stringify — and compile
  // back to the same gate: every fixture render scores identically.
  const wire = JSON.parse(JSON.stringify(d)) as ScriptDraft;
  expect(Object.keys(wire.probes ?? {}).sort()).toEqual(Object.keys(PROBES).sort());
  const compiled = probesFor(NOTEBOOK.unknowns, wire);
  for (const r of RENDERS) expect(runGate(r, { probes: compiled }), r.id).toEqual(runGate(r, { probes: PROBES }));
});

test("draft/1: impactOf reads the draft it is handed, not the module tables", () => {
  const base = fixtureDraft().renders[0];
  const one = draftOf([{ ...base, id: "r-solo", attribution: { "0:00": ["f-elsewhere"] }, cutFacts: [] }], {
    projectId: "probe",
    source: fixtureSource(),
  });
  const imp = impactOf(one);
  expect(Object.keys(imp)).toEqual(["r-solo"]);
  expect(imp["r-solo"]["f-elsewhere"]).toEqual({ kind: "spoken", seconds: 12, beats: ["0:00"] });
  // f-ath is attributed to this beat by the FIXTURE table; the draft says otherwise.
  expect(imp["r-solo"]["f-ath"]).toBeUndefined();
});

/* ──────────────────────────── case 2 · edit plan ────────────────────────── */

const planFor = (renderId: string, beatAt: string) =>
  JSON.stringify({
    edits: [{ renderId, op: "retime", beatAt, seconds: 6, why: "tighten" }],
    refusals: [],
    summary: "one retime",
  });

test("draft/2: editPlanSchema(draft) enumerates the draft's renders", () => {
  const d = draftWith(["r-a", "r-b"]);
  expect(editPlanSchema(d).properties.edits.items.properties.renderId.enum).toEqual(["r-a", "r-b"]);
});

test("draft/2: the fixture schema is byte-identical to EDIT_PLAN_SCHEMA (the cassettes' key)", () => {
  expect(editPlanSchema(fixtureDraft())).toEqual(EDIT_PLAN_SCHEMA);
  expect(sha256(JSON.stringify(editPlanSchema(fixtureDraft())))).toBe(SCHEMA_SHA_2026_10_11);
  expect(sha256(JSON.stringify(EDIT_PLAN_SCHEMA))).toBe(SCHEMA_SHA_2026_10_11);
});

test("draft/2: parseEditPlan refuses a fixture render against a draft that does not hold it", () => {
  const d = draftWith(["r-a", "r-b"]);
  expect(() => parseEditPlan(planFor("reversal-chain", "0:00"), { draft: d })).toThrow(PlanError);
  expect(() => parseEditPlan(planFor("reversal-chain", "0:00"), { draft: d })).toThrow(/does not exist/);
  // …and accepts the draft's own render, resolving marks against ITS beats.
  const ok = parseEditPlan(planFor("r-a", d.renders[0].beats[1].at), { draft: d });
  expect(ok.edits[0].renderId).toBe("r-a");
  expect(() => parseEditPlan(planFor("r-a", "9:59"), { draft: d })).toThrow(/names no beat/);
  // No draft: the fixture, exactly as before.
  expect(parseEditPlan(planFor("reversal-chain", "0:00")).edits).toHaveLength(1);
});

/* ───────────────────────── case 3 · the derived ledger ──────────────────── */

const STATE_OF: Record<Verdict, string> = {
  pass: "honoured",
  violation: "at-risk",
  "not-engaged": "not-engaged",
  unmeasured: "unmeasured",
};

/** The gate's constraint verdict per unknown — a violation anywhere wins. */
function gateVerdicts(r: { id: string; beats: DraftRender["beats"] }) {
  const out: Record<string, Verdict> = {};
  for (const f of runGate(r, { probes: PROBES }).findings.filter((x) => x.rule === "constraint"))
    out[f.subject] = out[f.subject] === "violation" ? "violation" : f.verdict;
  return out;
}

test("draft/3: ledgerFor agrees with runGate on every row of every fixture render", () => {
  for (const r of RENDERS) {
    const ledger = ledgerFor(r.id, NOTEBOOK);
    const gate = gateVerdicts(r);
    expect(ledger.rows.map((x) => x.unknownId), r.id).toEqual(NOTEBOOK.unknowns.map((u) => u.id));
    for (const row of ledger.rows) expect(row.state, `${r.id} · ${row.unknownId}`).toBe(STATE_OF[gate[row.unknownId]]);
    expect(ledger.atRisk, r.id).toBe(Object.values(gate).filter((v) => v === "violation").length);
  }
});

test("draft/3: u-yield-causality is derived — honoured as the render ships, at-risk on the sentence that shipped", () => {
  // As shipped today: the gate passes it, so the ledger does — whatever the
  // hand table says. (The hand table says at-risk; that row is stale.)
  const now = ledgerFor("reversal-chain", NOTEBOOK).rows.find((x) => x.unknownId === "u-yield-causality")!;
  expect(now.state).toBe("honoured");
  expect(CONSTRAINT_LEDGER["reversal-chain"].find((x) => x.unknownId === "u-yield-causality")!.state).toBe("at-risk");

  // The 2026-08-11 sentence, put back into Movement 3 of a draft render.
  const base = fixtureDraft().renders[0];
  const shipped: DraftRender = {
    ...base,
    beats: base.beats.map((b, i) =>
      i === 7 ? { ...b, text: "So when Treasury yields climbed toward four and a half percent, Bitcoin was sold." } : b,
    ),
  };
  const row = ledgerFor(shipped, NOTEBOOK).rows.find((x) => x.unknownId === "u-yield-causality")!;
  expect(row.state).toBe("at-risk");
  expect(row.effective).toBe("at-risk");
  expect(row.at).toBe(base.beats[7].at);
  expect(row.quote).toMatch(/Bitcoin was sold/);
});

test("draft/3: the hand notes are annotations, never verdicts; resolution still supersedes", () => {
  const ledger = ledgerFor("reversal-chain", NOTEBOOK);
  const cohorts = ledger.rows.find((x) => x.unknownId === "u-cohorts")!;
  expect(cohorts.unknown.resolvedBy).toBeTruthy();
  expect(cohorts.state).toBe("honoured");
  expect(cohorts.effective).toBe("superseded");
  // The `how` a person wrote rides along as the annotation.
  expect(cohorts.how).toBe(CONSTRAINT_LEDGER["reversal-chain"][0].how);
});

test("draft/3: a notebook unknown with no probe is unmeasured, and a note naming a missing unknown dangles", () => {
  const novel: Unknown = { id: "u-novel", what: "x", why: "y", impact: "never say z" };
  const nb = {
    ...NOTEBOOK,
    unknowns: [...NOTEBOOK.unknowns.filter((u) => u.id !== "u-spot-price"), novel],
  };
  const ledger = ledgerFor("adjudication", sourceOf(nb));
  expect(ledger.rows.find((x) => x.unknownId === "u-novel")!.state).toBe("unmeasured");
  expect(ledger.rows.some((x) => x.unknownId === "u-spot-price")).toBe(false);
  expect(ledger.dangling).toEqual(["u-spot-price"]);
});

/* ── session 2: `unknown.probe` joins the front of the resolution order ──── */

const NO_NINETIES = { tests: "no $9x figure", forbid: [{ source: "\\$\\s?9\\d" }] };
const withBeat = (text: string) => {
  const base = RENDERS[0];
  return { id: "r-probe", beats: [...base.beats, { ...base.beats[0], at: "9:99", text }] };
};

test("draft/4a: a notebook unknown carrying a probe is enforced with the fixture PROBES bypassed", () => {
  const u: Unknown = { id: "u-novel-95", what: "x", why: "y", impact: "never name a $9x figure", probe: NO_NINETIES };
  const probes = probesFor([u]);
  expect(Object.keys(probes)).toEqual(["u-novel-95"]);
  const dirty = runGate(withBeat("It touched $95 once."), { unknowns: [u], probes });
  expect(dirty.enforced).toBeGreaterThan(0);
  expect(dirty.findings.filter((f) => f.subject === "u-novel-95").map((f) => f.verdict)).toContain("violation");
  const clean = runGate(withBeat("It touched nothing."), { unknowns: [u], probes });
  expect(clean.findings.filter((f) => f.subject === "u-novel-95").map((f) => f.verdict)).toEqual(["pass"]);
});

test("draft/4b: unknown.probe wins over draft.probes and the fixture table for the same id", () => {
  const id = Object.keys(PROBES)[0];
  const u: Unknown = { id, what: "x", why: "y", impact: "z", probe: NO_NINETIES };
  expect(probesFor([u], { probes: { [id]: { tests: "draft", forbid: ["zzz"] } } })[id].tests).toBe("no $9x figure");
  expect(probesFor([{ ...u, probe: undefined }], { probes: { [id]: { tests: "draft", forbid: ["zzz"] } } })[id].tests).toBe("draft");
});

test("draft/4c: validation refuses an unknown whose probe pattern does not compile, naming the id", () => {
  const bad = { ...NOTEBOOK, unknowns: [...NOTEBOOK.unknowns, { id: "u-bad-probe", what: "x", why: "y", impact: "z", probe: { tests: "t", forbid: [{ source: "(" }] } }] };
  const found = shapeFindings(bad as never);
  expect(found.some((f) => f.rule.includes("u-bad-probe") && f.path.endsWith(".probe"))).toBe(true);
  const good = { ...NOTEBOOK, unknowns: [...NOTEBOOK.unknowns, { id: "u-ok-probe", what: "x", why: "y", impact: "z", probe: NO_NINETIES }] };
  expect(shapeFindings(good as never).filter((f) => f.rule.includes("u-ok-probe"))).toEqual([]);
});

// A RegExp with `g` or `y` is STATEFUL under `.test()`: `lastIndex` survives a
// match, so the same compiled forbid pattern, reused across a draft's renders
// by gateDraft, starts its next search mid-string and misses a figure an
// earlier render already tripped on (`g`), or only ever looks at index 0 (`y`).
// A research run that writes `{source, flags: "gi"}` is a prohibition that
// silently lapses on the second candidate. Measured before the fix: "g" and
// "gi" tripped 2 of 3 identical renders, "y" 0 of 3.
test("draft/4e: a forbid pattern's flags cannot make it lapse - every render carrying the figure trips it", () => {
  const u: Unknown = { id: "u-flagged", what: "x", why: "y", impact: "never state a $6x,xxx spot figure" };
  const beat = { ...RENDERS[0].beats[0], text: "Bitcoin trades at $63,400 today, they say." };
  const renders = ["a", "b", "c"].map((id) => ({ id, beats: [beat] }));
  const source = { notebook: { facts: [], unknowns: [u], scaleConversions: [] }, conclusions: [] };
  for (const flags of ["", "i", "g", "gi", "y", "gy"]) {
    const probes = { "u-flagged": { tests: "no spot figure", forbid: [{ source: "\\$6\\d,\\d{3}", flags }] } };
    const roll = gateDraft(renders, source, { probes });
    const tripped = Object.values(roll.byRender).filter((r) => r.findings.some((f) => f.subject === "u-flagged" && f.verdict === "violation"));
    expect(tripped.map((r) => r.renderId), `flags "${flags}"`).toEqual(["a", "b", "c"]);
  }
});

test("draft/4d: a fixture notebook with no probes scores exactly as before", () => {
  expect(NOTEBOOK.unknowns.some((u) => u.probe)).toBe(false);
  for (const r of RENDERS) {
    expect(probesFor(NOTEBOOK.unknowns)).toEqual(probesFor(NOTEBOOK.unknowns.map((u) => ({ ...u }))));
    expect(runGate(r, { probes: probesFor(NOTEBOOK.unknowns) }), r.id).toEqual(runGate(r, { probes: PROBES }));
  }
});
