// REGRESSION CONTROL for the trailer structural checker
// (app/_phases/script/trailer/structure.ts).
//
// Run:  npx tsx pipeline/trailer-structure-regression.mts
//
// Shaped like `gate-regression.mts`: a line per case, a count at the end, a
// non-zero exit if anything is broken. There is no test framework in this repo
// and this is not the place to introduce one (`integration-imaging.mts:8`).
//
// WHY THIS FILE EXISTS, and what it is a control ON.
//
// `app/_phases/script/renders.ts:46-58` hand-types a `checks` array onto each
// render — eleven sentences a human wrote ABOUT the chain. One of them reads
// "but/therefore between adjacent beats, no AND THEN · pass". Nothing computed
// that. `../app/_phases/script/gate.ts` was built to end exactly that pattern for
// the EPISTEMIC layer (forbidden figures, dropped qualifiers, causal upgrades) and
// its six checks cover none of the beat chain's SHAPE.
//
// So every case below is a chain that a hand-typed `checks` row would have called
// `pass`, and the control is that the function trips on it. The last group is the
// opposite control and it matters more: a checker that reports a defect on a
// deliberate specialty-lane choice, or that quietly upgrades "I could not measure
// this" into "fine", trains its user to ignore it — and a checker nobody believes
// is worth less than none.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  runStructureCheck,
  type StructureFinding,
  type StructureReport,
} from "../lib/script/trailer/structure";
import { notesFromFindings } from "../lib/script/trailer/notes";
import {
  parseTrailerPlan,
  replayTrailerPlan,
  structureDelta,
  trailerEditPlanSchema,
} from "../lib/script/trailer/plan";
import {
  VOCABULARIES_ARE_DISJOINT,
  atSeconds,
  toShotLaneBeat,
  type Cue,
  type TrailerBeat,
  type TrailerCut,
  type WithholdingBudget,
} from "../lib/script/trailer/types";
// THE DOWNSTREAM LANE. Imported here and not only in the Playwright probes,
// because this control is what `npm run check:trailer-structure` runs and the
// seam it guards is the one this whole file's subject matter dies at: a cut that
// passes every check below and then reaches nothing is a cut nobody can shoot.
// `shots.ts` imports only the beat layer, so it is reachable from a bare `tsx`
// process — nothing here pulls in a `@/` alias or a React module.
import {
  isTrailerFormat,
  shotsFromBeats,
  shotsFromRender,
} from "../lib/frames/shots";

/* ───────────────────────────── the baseline cut ─────────────────────────────
   A well-formed wide-release long cut. Deliberately abstract: it is a SHAPE under
   test, not a claimed artifact, and no line of it asserts anything about a real
   work. Every mutation below is one edit away from this. */

const CUE: Cue = {
  id: "cue-1",
  title: "candidate cue",
  frozen: true,
  sections: [
    { id: "s0", kind: "mood-open", label: "mood opening", isBoundary: true },
    { id: "s1", kind: "exposition", label: "exposition", isBoundary: false },
    { id: "s2", kind: "response", label: "response", isBoundary: false },
    { id: "s3", kind: "build", label: "build — the breath", isBoundary: true },
    { id: "s4", kind: "peak", label: "peak", isBoundary: false },
    { id: "s5", kind: "tail", label: "tail", isBoundary: false },
  ],
};

const beat = (b: TrailerBeat): TrailerBeat => b;

function baseline(): TrailerCut {
  return {
    form: "trailer",
    id: "baseline",
    title: "baseline shape",
    rung: "long-cut",
    lane: "wide-release",
    cue: CUE,
    movements: [
      { id: "m0", role: "cold-open", ordinal: 0, label: "cold open", cueSection: "s0" },
      { id: "m1", role: "introduction", ordinal: 1, label: "introduction", cueSection: "s1" },
      { id: "m2", role: "escalation", ordinal: 2, label: "escalation", cueSection: "s2" },
      { id: "m3", role: "climax", ordinal: 3, label: "climax", cueSection: "s4" },
      { id: "m4", role: "tail", ordinal: 4, label: "tail", cueSection: "s5" },
    ],
    beats: [
      beat({ id: "b1", movement: "m0", at: "0:00", kind: "cold-open", connector: null, label: "the grab", text: "A moment that needs no context and looks like it resolves soon." }),
      beat({ id: "b2", movement: "m1", at: "0:08", kind: "stakes", connector: "THEREFORE", label: "who and why", text: "The least information that makes the stakes legible." }),
      beat({ id: "b3", movement: "m2", at: "0:24", kind: "rung", connector: "BUT", label: "rung 1", text: "The same problem, affecting more.", raises: ["scale"], move: "widen-scope" }),
      beat({ id: "b4", movement: "m2", at: "0:36", kind: "rung", connector: "THEREFORE", label: "rung 2", text: "And now it is aimed at them.", raises: ["threat"] }),
      beat({ id: "b5", movement: "m2", at: "0:48", kind: "rung", connector: "BUT", label: "rung 3", text: "With far less time than anyone assumed.", raises: ["speed"], move: "shorten-clock" }),
      beat({ id: "b6", movement: "m2", at: "1:02", kind: "reset", connector: "BUT", label: "the stop", text: "One line, in silence.", resetHolds: ["line"], cueMark: "s3" }),
      beat({ id: "b7", movement: "m3", at: "1:08", kind: "peak", connector: "THEREFORE", label: "the peak", text: "The arrival the reset made audible." }),
      beat({ id: "b8", movement: "m4", at: "1:30", kind: "title", connector: "THEREFORE", label: "title card", text: "The title." }),
      beat({ id: "b9", movement: "m4", at: "1:34", kind: "button", connector: "BUT", label: "the button", text: "The last small thing." }),
      beat({ id: "b10", movement: "m4", at: "1:38", kind: "cta", connector: "THEREFORE", label: "end card", text: "Where and when." }),
    ],
  };
}

/** Replace one beat by id. Every mutation below is exactly this, once. */
function withBeat(cut: TrailerCut, id: string, patch: Partial<TrailerBeat>): TrailerCut {
  return { ...cut, beats: cut.beats.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
}

/* ────────────────────────────── the harness ───────────────────────────────── */

type Expect =
  | { kind: "violation"; rule: StructureFinding["rule"] }
  | { kind: "clean" }
  | { kind: "unmeasured"; rule: StructureFinding["rule"]; subject?: string }
  | { kind: "not-engaged"; rule: StructureFinding["rule"] }
  | { kind: "malformed-null" };

interface Case {
  name: string;
  cut: TrailerCut;
  budget?: WithholdingBudget;
  magnitudeOf?: (b: TrailerBeat) => number | null;
  expect: Expect;
}

const of = (r: StructureReport, rule: string, verdict: string) =>
  r.findings.filter((f) => f.rule === rule && f.verdict === verdict);

function verify(c: Case): { ok: boolean; report: StructureReport; why: string } {
  const report = runStructureCheck(c.cut, { budget: c.budget, magnitudeOf: c.magnitudeOf });
  const e = c.expect;
  switch (e.kind) {
    case "violation": {
      const hits = of(report, e.rule, "violation");
      return { ok: hits.length > 0, report, why: hits.map((h) => h.detail.slice(0, 120)).join(" | ") || `no ${e.rule} violation` };
    }
    case "clean": {
      const bad = report.findings.filter((f) => f.verdict === "violation");
      return { ok: report.malformed === false && bad.length === 0, report, why: bad.map((b) => `${b.rule}/${b.subject}`).join(", ") || "clean" };
    }
    case "unmeasured": {
      const hits = of(report, e.rule, "unmeasured").filter((f) => !e.subject || f.subject === e.subject);
      const wrong = of(report, e.rule, "pass").filter((f) => !e.subject || f.subject === e.subject);
      return { ok: hits.length > 0 && wrong.length === 0, report, why: hits.length ? `unmeasured (${wrong.length} stray pass)` : `no ${e.rule} unmeasured row` };
    }
    case "not-engaged": {
      const hits = of(report, e.rule, "not-engaged");
      const wrong = [...of(report, e.rule, "violation"), ...of(report, e.rule, "pass")];
      return { ok: hits.length > 0 && wrong.length === 0, report, why: hits.length ? `not-engaged (${wrong.length} graded rows)` : `no ${e.rule} not-engaged row` };
    }
    case "malformed-null":
      return { ok: report.malformed === null, report, why: `malformed=${String(report.malformed)}` };
  }
}

/* ─────────────────────────────── the cases ────────────────────────────────── */

const bigButton = (b: TrailerBeat) => (b.kind === "button" ? 10 : b.kind === "peak" ? 5 : 1);
const sane = (b: TrailerBeat) =>
  b.kind === "peak" ? 10 : b.kind === "button" ? 2 : b.kind === "rung" ? [3, 4, 5][Number(b.id.slice(1)) - 3] ?? 3 : 1;

const CASES: Case[] = [
  // ── the four rules the brief names, each as a fail-before control ──────────
  {
    name: "AND THEN between adjacent beats",
    cut: withBeat(baseline(), "b4", { connector: "AND THEN" }),
    expect: { kind: "violation", rule: "connector" },
  },
  {
    name: "a rung raising two variables at once",
    cut: withBeat(baseline(), "b4", { raises: ["threat", "cost"] }),
    expect: { kind: "violation", rule: "escalation" },
  },
  {
    name: "a rung declaring no variable at all",
    cut: withBeat(baseline(), "b4", { raises: [] }),
    expect: { kind: "violation", rule: "escalation" },
  },
  {
    name: "two consecutive rungs raising the same variable",
    cut: withBeat(baseline(), "b4", { raises: ["scale"] }),
    expect: { kind: "violation", rule: "escalation" },
  },
  {
    name: "a variable reused NON-consecutively is not a defect",
    cut: withBeat(baseline(), "b5", { raises: ["scale"] }),
    expect: { kind: "clean" },
  },
  {
    name: "no reset at all",
    cut: ((): TrailerCut => {
      const c = baseline();
      return { ...c, beats: c.beats.filter((b) => b.id !== "b6") };
    })(),
    expect: { kind: "violation", rule: "reset" },
  },
  {
    name: "the reset does not sit immediately before the peak",
    cut: ((): TrailerCut => {
      const c = baseline();
      const b6 = c.beats.find((b) => b.id === "b6")!;
      const rest = c.beats.filter((b) => b.id !== "b6");
      // Move the reset two beats earlier: still present, no longer adjacent.
      return { ...c, beats: [...rest.slice(0, 3), b6, ...rest.slice(3)] };
    })(),
    expect: { kind: "violation", rule: "reset" },
  },
  {
    name: "three resets — the device has stopped resetting anything",
    cut: ((): TrailerCut => {
      const c = baseline();
      const extra = (id: string, at: string): TrailerBeat => ({
        id, movement: "m2", at, kind: "reset", connector: "BUT",
        label: `extra stop ${id}`, text: "another stop", resetHolds: ["image"], cueMark: "s3",
      });
      return { ...c, beats: [...c.beats.slice(0, 4), extra("x1", "0:40"), extra("x2", "0:44"), ...c.beats.slice(4)] };
    })(),
    expect: { kind: "violation", rule: "reset" },
  },
  {
    name: "a button LARGER than the climax, with a magnitude resolver",
    cut: baseline(),
    magnitudeOf: bigButton,
    expect: { kind: "violation", rule: "magnitude" },
  },

  // ── the honesty controls: unmeasured must never become pass ────────────────
  {
    name: "button size with NO resolver is unmeasured, never pass",
    cut: baseline(),
    expect: { kind: "unmeasured", rule: "magnitude" },
  },
  {
    name: "an undeclared connector is unmeasured, never pass",
    cut: withBeat(baseline(), "b4", { connector: null }),
    // Scoped to the beat: the OTHER nine adjacencies are still declared and still
    // earn the aggregate pass. Scoping is the point — a rule may be enforced over
    // part of a chain and unmeasurable over the rest, and reporting one number for
    // both is how "enforced" starts lying.
    expect: { kind: "unmeasured", rule: "connector", subject: "b4" },
  },
  {
    name: "no withholding budget is UNDECIDED, never clean",
    cut: baseline(),
    expect: { kind: "unmeasured", rule: "withholding" },
  },
  {
    name: "a cut with no cue reports the cue rule unmeasured",
    cut: ((): TrailerCut => {
      const c = baseline();
      return { ...c, cue: undefined, movements: c.movements.map((m) => ({ ...m, cueSection: undefined })) };
    })(),
    expect: { kind: "unmeasured", rule: "cue" },
  },
  {
    name: "a cut that opens on a card reports the position and refuses the verdict",
    cut: ((): TrailerCut => {
      const c = baseline();
      const card: TrailerBeat = { id: "b0", movement: "m0", at: "0:00", kind: "title", connector: null, label: "studio mark", text: "A brand card." };
      return { ...c, beats: [card, ...c.beats.map((b) => (b.id === "b1" ? { ...b, connector: "THEREFORE" as const } : b))] };
    })(),
    expect: { kind: "unmeasured", rule: "cards", subject: "b0" },
  },

  // ── the refusal controls: a declared choice is not a defect ────────────────
  {
    name: "a mood-led cut is NOT audited for rungs",
    cut: ((): TrailerCut => {
      const c = baseline();
      return {
        ...c, moodLed: true,
        beats: c.beats.filter((b) => b.kind !== "rung" && b.kind !== "reset"),
      };
    })(),
    expect: { kind: "not-engaged", rule: "escalation" },
  },
  {
    name: "a mood-led cut is NOT audited for the reset",
    cut: ((): TrailerCut => {
      const c = baseline();
      return { ...c, moodLed: true, beats: c.beats.filter((b) => b.kind !== "reset") };
    })(),
    expect: { kind: "not-engaged", rule: "reset" },
  },
  {
    name: "a spot that declares the reset dropped is not missing it",
    cut: ((): TrailerCut => {
      const c = baseline();
      return {
        ...c, rung: "spot" as const,
        droppedParts: ["introduction", "dialogue-lines", "middle-rungs", "reset"],
        beats: c.beats.filter((b) => b.id !== "b6" && b.id !== "b2"),
        movements: c.movements.filter((m) => m.id !== "m1"),
      };
    })(),
    expect: { kind: "not-engaged", rule: "reset" },
  },
  {
    name: "a specialty-lane cut is never graded malformed",
    cut: ((): TrailerCut => {
      const c = baseline();
      return { ...c, lane: "specialty" as const, beats: c.beats.filter((b) => b.id !== "b6") };
    })(),
    expect: { kind: "malformed-null" },
  },

  // ── the drop order, and the pass-after control ─────────────────────────────
  {
    name: "dropping the reset while keeping the introduction skips the order",
    cut: ((): TrailerCut => {
      const c = baseline();
      return { ...c, rung: "spot" as const, droppedParts: ["reset"], beats: c.beats.filter((b) => b.id !== "b6") };
    })(),
    expect: { kind: "violation", rule: "ladder" },
  },
  {
    name: "a promise with no payer is surfaced as incomplete",
    cut: withBeat(baseline(), "b2", {
      promises: [{ id: "p1", sentence: "They are enemies.", source: "assembly" }],
    }),
    expect: { kind: "violation", rule: "promise" },
  },
  {
    name: "spending an asset the budget HOLDS",
    cut: withBeat(baseline(), "b7", { spends: ["a-turn"] }),
    budget: { campaignId: "c1", assets: [{ id: "a-turn", kind: "turn", name: "the reversal", allowance: "hold" }] },
    expect: { kind: "violation", rule: "withholding" },
  },
  {
    name: "THE PASS-AFTER CONTROL — the baseline shape trips nothing",
    cut: baseline(),
    magnitudeOf: sane,
    expect: { kind: "clean" },
  },
];

/* ───────────────────────────────── run ────────────────────────────────────── */

let bad = 0;
for (const c of CASES) {
  const { ok, why } = verify(c);
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"}  ${c.expect.kind.padEnd(14)} · ${c.name}`);
  if (!ok) console.log(`         → ${why}`);
}

/* ── invariants that hold across EVERY case, not per-case ───────────────────
   These are the honesty rule stated as arithmetic. The efficacy row makes the
   last one true by construction, which is the point: a structural checker that
   could report 100% enforcement would be claiming it had measured whether the cut
   works. */

const reports = CASES.map((c) => runStructureCheck(c.cut, { budget: c.budget, magnitudeOf: c.magnitudeOf }));

const noEfficacy = reports.filter((r) => !r.findings.some((f) => f.rule === "efficacy"));
if (noEfficacy.length) {
  bad++;
  console.log(`FAIL  invariant      · ${noEfficacy.length} report(s) omit the standing efficacy row`);
} else {
  console.log(`OK    invariant      · every report carries the standing "does this cut work" unmeasured row`);
}

const fullyEnforced = reports.filter((r) => r.enforced >= 100);
if (fullyEnforced.length) {
  bad++;
  console.log(`FAIL  invariant      · ${fullyEnforced.length} report(s) claim 100% enforcement`);
} else {
  console.log(`OK    invariant      · no report claims 100% enforcement (max ${Math.max(...reports.map((r) => r.enforced))}%)`);
}

const uncited = reports.flatMap((r) => r.findings).filter((f) => !f.cites);
if (uncited.length) {
  bad++;
  console.log(`FAIL  invariant      · ${uncited.length} finding(s) carry no doctrine citation`);
} else {
  console.log(`OK    invariant      · every finding cites the doctrine it is read from`);
}

const located = reports
  .flatMap((r) => r.findings)
  .filter((f) => f.beatId && !f.at);
if (located.length) {
  bad++;
  console.log(`FAIL  invariant      · ${located.length} finding(s) name a beat id with no timecode`);
} else {
  console.log(`OK    invariant      · every beat-level finding carries both an id and a timecode`);
}

/* ── the seam with the shot lane, and the disjointness proof ───────────────── */

if (VOCABULARIES_ARE_DISJOINT !== true) {
  bad++;
  console.log("FAIL  invariant      · the vocabularies-are-disjoint witness is not true");
} else {
  console.log("OK    invariant      · explainer and trailer beat vocabularies are disjoint (checked by tsc)");
}

const projected = baseline().beats.map(toShotLaneBeat);
const badProjection = projected.filter((p) => p.atS === null);
if (badProjection.length) {
  bad++;
  console.log(`FAIL  seam           · ${badProjection.length} beat(s) project to atS=null`);
} else {
  console.log(`OK    seam           · ${projected.length} beats project to the shot lane's shape (atS ${projected[0].atS}..${projected[projected.length - 1].atS}s)`);
}

if (atSeconds("nope") !== null || atSeconds("1:02") !== 62 || atSeconds("1:00:00") !== 3600) {
  bad++;
  console.log("FAIL  seam           · atSeconds() does not parse/refuse as declared");
} else {
  console.log("OK    seam           · atSeconds() parses m:ss and h:mm:ss and returns null rather than guessing");
}

/* ── AND THE SEAM ONE STEP FURTHER DOWN: does the cut reach the shot lane ─────
 *
 * The projection above proves the beats fit the shot lane's SHAPE. It proved
 * that for months while nothing in the product ever handed the lane a beat:
 * Step 3 resolved every project to the explainer fixture, `shotsFromRender`
 * answered [] for it exactly as designed, and a shape-only check stayed green
 * over a lane with no traffic. These four lines are the traffic. */

const laneBeats = baseline().beats.map(toShotLaneBeat);
const laneTotalS = 120;

const decomposed = shotsFromBeats(laneBeats, laneTotalS);
if (decomposed.length <= laneBeats.length) {
  bad++;
  console.log(
    `FAIL  seam           · ${laneBeats.length} beats decomposed into ${decomposed.length} shot(s) — a trailer beat is one to MANY`,
  );
} else {
  console.log(`OK    seam           · ${laneBeats.length} beats decompose into ${decomposed.length} shots`);
}

// A cut declaring a promotional template must reach the decomposition, and one
// declaring an explainer template must not. Both directions, because the second
// is the guarantee `shotsFromRender` was written to give and it is the one a
// well-meaning widening of `TRAILER_TEMPLATES` would silently take away.
const asTrailer = shotsFromRender({ template: "trailer", durationS: laneTotalS, beats: laneBeats });
const asExplainer = shotsFromRender({
  template: "mid-educational-video",
  durationS: laneTotalS,
  beats: laneBeats,
});
if (asTrailer.length === 0 || asExplainer.length !== 0) {
  bad++;
  console.log(
    `FAIL  seam           · shotsFromRender: trailer -> ${asTrailer.length} shots, explainer -> ${asExplainer.length} (want >0 and 0)`,
  );
} else {
  console.log(
    `OK    seam           · shotsFromRender routes by template: trailer -> ${asTrailer.length} shots, explainer -> 0`,
  );
}

// The allow-list must still cover what the product can create. `cinematic` was
// missing from it, so a project on that template read as an explainer at this
// layer — a composed spine that decomposed into nothing, indistinguishable from
// a spine nobody had written. The ids are repeated here rather than imported
// from lib/projects, which pulls a `@/` alias this process cannot resolve.
const PROMOTIONAL_TEMPLATE_IDS = ["teaser", "trailer", "cinematic"];
const unroutable = PROMOTIONAL_TEMPLATE_IDS.filter((id) => !isTrailerFormat(id));
if (unroutable.length) {
  bad++;
  console.log(`FAIL  seam           · promotional template(s) the shot lane refuses: ${unroutable.join(", ")}`);
} else {
  console.log(
    `OK    seam           · every promotional template reads as one (${PROMOTIONAL_TEMPLATE_IDS.join(", ")})`,
  );
}

/* ── params.json's `consumed_by` resolves ───────────────────────────────────
 * The params file says each value's `consumed_by` is "the code that reads this
 * value". After the Phase 0.4 move 23 of its 24 path claims named
 * app/_phases/script/trailer/*, which no longer exists, and nothing noticed. So:
 * every claim that opens with a path names a file that exists, and the symbol
 * after the path, when there is one, is a word in that file. */
{
  const root = fileURLToPath(new URL("..", import.meta.url));
  const params: unknown = JSON.parse(readFileSync(`${root}knowledge/templates/trailer/steps/01-script/params.json`, "utf8"));
  const claims: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (k === "consumed_by" && typeof x === "string") claims.push(x);
        else walk(x);
      }
  };
  walk(params);
  const PATH_CLAIM = /^((?:app|lib|packages|pipeline)\/[\w./()[\]-]+\.(?:ts|tsx|mts|json))(?:\s+([A-Za-z_]\w*))?/;
  const pathed = claims.map((c) => PATH_CLAIM.exec(c)).filter((m): m is RegExpExecArray => m !== null);
  const broken = pathed.filter(([, file, symbol]) => {
    if (!existsSync(`${root}${file}`)) return true;
    return symbol !== undefined && !new RegExp(`\\b${symbol}\\b`).test(readFileSync(`${root}${file}`, "utf8"));
  });
  if (pathed.length === 0 || broken.length) {
    bad++;
    console.log(`FAIL  seam           · params consumed_by: ${pathed.length} path claim(s), ${broken.length} unresolved: ${broken.map((m) => m[0]).join(" | ")}`);
  } else {
    console.log(`OK    seam           · params consumed_by: all ${pathed.length} path claims name a file and symbol that exist`);
  }
}

/* ───────────────────── notes and the edit plan (session 1) ─────────────────── */

const planCheck = (name: string, ok: boolean, why: string) => {
  if (!ok) bad++;
  console.log(`${ok ? "OK  " : "FAIL"}  plan           · ${name}${ok ? "" : ` — ${why}`}`);
};

{
  const base = baseline();
  const andThen = withBeat(base, "b5", { connector: "AND THEN" });

  // 1. one AND THEN -> one fix-connector note on that beat; clean -> none.
  const notes = notesFromFindings(runStructureCheck(andThen), andThen);
  planCheck(
    "AND THEN yields one fix-connector note on its beat",
    notes.length === 1 && notes[0].kind === "fix-connector" && notes[0].beatId === "b5",
    JSON.stringify(notes.map((n) => [n.kind, n.beatId])),
  );
  const cleanNotes = notesFromFindings(runStructureCheck(base), base);
  planCheck("a clean report yields no notes", cleanNotes.length === 0, `${cleanNotes.length} note(s)`);

  // 2. refusals: unknown beat, kind change, movement change — findings listed.
  const unknown = parseTrailerPlan(base, { ops: [{ beatId: "nope", patch: { text: "x" }, why: "w" }], summary: "" });
  planCheck("refuses an op on a beat not in the cut", !unknown.ok && unknown.findings.length === 1, JSON.stringify(unknown));
  const spine = parseTrailerPlan(base, {
    ops: [
      { beatId: "b3", patch: { kind: "peak" }, why: "w" },
      { beatId: "b4", patch: { movement: "m3" }, why: "w" },
    ],
    summary: "",
  });
  planCheck("refuses a patch that changes kind or movement, listing both", !spine.ok && spine.findings.length === 2, JSON.stringify(spine));

  // 3. a plan that sets the offending connector to BUT closes it, opens nothing.
  const fix = parseTrailerPlan(andThen, { ops: [{ beatId: "b5", patch: { connector: "BUT" }, why: "w" }], summary: "s" });
  if (!fix.ok) planCheck("accepts the connector fix", false, JSON.stringify(fix));
  else {
    const candidate = replayTrailerPlan(andThen, fix.plan);
    const d = structureDelta(runStructureCheck(andThen), runStructureCheck(candidate));
    planCheck(
      "connector fix: 1 closed, 0 opened",
      d.closed.length === 1 && d.closed[0] === "connector/b5" && d.opened.length === 0,
      JSON.stringify(d),
    );
    planCheck("replay leaves the source cut untouched", andThen.beats.find((b) => b.id === "b5")?.connector === "AND THEN", "mutated");
  }

  // 4. a plan that opens a violation is still a valid plan; the delta says so.
  const opens = parseTrailerPlan(base, { ops: [{ beatId: "b4", patch: { raises: ["intimacy", "threat", "cost"] }, why: "w" }], summary: "s" });
  if (!opens.ok) planCheck("accepts a plan that opens a violation", false, JSON.stringify(opens));
  else {
    const d = structureDelta(runStructureCheck(base), runStructureCheck(replayTrailerPlan(base, opens.plan)));
    planCheck("opening plan: 1 opened, 0 closed", d.opened.length === 1 && d.opened[0] === "escalation/b4" && d.closed.length === 0, JSON.stringify(d));
  }

  // 4b. two violations sharing a rule and a subject stay two: distinct note ids,
  //     and a plan that closes one of them reads as 1 closed. Keyed by
  //     rule/subject alone, 2 notes shared one id and the delta read 0 closed.
  const twice = withBeat(base, "b6", { resetHolds: ["line", "image"], cueMark: "zz" });
  const twiceReport = runStructureCheck(twice);
  const twiceNotes = notesFromFindings(twiceReport, twice);
  planCheck(
    "two violations on one rule/subject yield two distinct note ids",
    twiceNotes.filter((n) => n.beatId === "b6" && n.fromFinding === "reset").length === 2 &&
      new Set(twiceNotes.map((n) => n.id)).size === twiceNotes.length,
    JSON.stringify(twiceNotes.map((n) => n.id)),
  );
  const oneFixed = structureDelta(twiceReport, runStructureCheck(withBeat(twice, "b6", { resetHolds: ["line"] })));
  planCheck("closing one of two such violations reads as 1 closed", oneFixed.closed.length === 1 && oneFixed.opened.length === 0, JSON.stringify(oneFixed));

  // 5. every wrong-typed value of every declared patch field is refused. The
  //    fields are read off the schema, so a field added there is walked here.
  //    Before the door checked types, 48 of these were accepted and 15 of those
  //    threw inside runStructureCheck (`raises: "scale"` reached `.filter`).
  const patchProps = trailerEditPlanSchema(base).properties.ops.items.properties.patch.properties as Record<string, unknown>;
  const WRONG: unknown[] = [42, null, true, {}, [1], "SO", ["warp"]];
  const legal = (f: string, v: unknown) =>
    f === "label" || f === "text" ? typeof v === "string"
    : f === "connector" ? v === "BUT" || v === "THEREFORE" || v === "AND THEN"
    : f === "spends" ? Array.isArray(v) && v.every((x) => typeof x === "string")
    : f === "raises" ? Array.isArray(v) && v.every((x) => ["scale", "threat", "speed", "intimacy", "cost"].includes(x as string))
    : false;
  const letIn = Object.keys(patchProps).flatMap((f) =>
    WRONG.filter((v) => !legal(f, v))
      .filter((v) => parseTrailerPlan(base, { ops: [{ beatId: "b4", patch: { [f]: v }, why: "w" }], summary: "s" }).ok)
      .map((v) => `${f}=${JSON.stringify(v)}`),
  );
  planCheck("refuses every wrong-typed value of every declared patch field", letIn.length === 0, letIn.join(" "));
  const promise = parseTrailerPlan(base, { ops: [{ beatId: "b4", patch: { promises: [] }, why: "w" }], summary: "s" });
  planCheck("refuses a promises patch the schema never offered", !promise.ok, JSON.stringify(promise));

  // the schema enumerates the cut's actual beat ids.
  const enumIds = (trailerEditPlanSchema(base).properties.ops.items.properties.beatId as { enum: string[] }).enum;
  planCheck("schema beatId enum is the cut's beat ids", enumIds.join() === base.beats.map((b) => b.id).join(), enumIds.join());
}

console.log(
  bad
    ? `\n${bad} REGRESSION FAILURE(S)`
    : `\nall ${CASES.length} cases, 6 invariants, 6 seam checks and the plan cases behave correctly`,
);
process.exit(bad ? 1 : 0);
