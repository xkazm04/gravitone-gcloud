// QUALITY-GATE HONESTY for the trailer structural checker (dynamic).
//
// Sibling of `gate-vacuous-pass.probe.spec.ts`, and here for the reason that file
// names: a check that examined nothing must not count as enforcement. This lane is
// where it matters, because `docs/knowledge-library-field-report.md:61` records
// that every `pipeline/*.mts` driver in this repo "run[s] only by hand" — so the
// full 22-case control at `pipeline/trailer-structure-regression.mts` protects
// nothing between runs, while THIS file runs under `npm test`.
//
// So this probe pins the four properties that, if they ever silently flipped,
// would turn `app/_phases/script/trailer/structure.ts` back into the thing it
// replaces: an array of sentences that says `pass` about things nobody measured.
//
//   1. A magnitude rule with no resolver is `unmeasured`, never `pass`.
//   2. A DECLARED deviation (specialty lane / mood-led) is refused, not graded.
//   3. The standing "does this cut work" row is always present, so `enforced`
//      can never reach 100.
//   4. `AND THEN` trips — the one rule this repo already held in prose
//      (`app/_phases/script/types.ts:24`) and could not execute.
import { test, expect } from "@playwright/test";
import { runStructureCheck } from "@/app/_phases/script/trailer/structure";
import type { TrailerBeat, TrailerCut } from "@/app/_phases/script/trailer/types";

/** The smallest cut that is well-formed: escalation → reset → peak. Deliberately
 *  minimal — a probe that needs a large fixture is testing the fixture. */
function minimal(): TrailerCut {
  const b = (x: TrailerBeat): TrailerBeat => x;
  return {
    form: "trailer",
    id: "probe-cut",
    title: "probe",
    rung: "long-cut",
    lane: "wide-release",
    movements: [
      { id: "m1", role: "introduction", ordinal: 0, label: "intro" },
      { id: "m2", role: "escalation", ordinal: 1, label: "escalation" },
      { id: "m3", role: "climax", ordinal: 2, label: "climax" },
      { id: "m4", role: "tail", ordinal: 3, label: "tail" },
    ],
    beats: [
      b({ id: "p1", movement: "m1", at: "0:00", kind: "stakes", connector: null, label: "stakes", text: "who and why" }),
      b({ id: "p2", movement: "m2", at: "0:10", kind: "rung", connector: "THEREFORE", label: "rung 1", text: "wider", raises: ["scale"] }),
      b({ id: "p3", movement: "m2", at: "0:20", kind: "rung", connector: "BUT", label: "rung 2", text: "sooner", raises: ["speed"] }),
      b({ id: "p4", movement: "m2", at: "0:30", kind: "reset", connector: "BUT", label: "the stop", text: "one line", resetHolds: ["line"] }),
      b({ id: "p5", movement: "m3", at: "0:34", kind: "peak", connector: "THEREFORE", label: "peak", text: "the arrival" }),
      b({ id: "p6", movement: "m4", at: "0:50", kind: "title", connector: "THEREFORE", label: "title", text: "the title" }),
      b({ id: "p7", movement: "m4", at: "0:54", kind: "button", connector: "BUT", label: "button", text: "the sting" }),
    ],
  };
}

const rows = (r: ReturnType<typeof runStructureCheck>, rule: string, verdict: string) =>
  r.findings.filter((f) => f.rule === rule && f.verdict === verdict);

test("a magnitude rule with no resolver is unmeasured, never a pass", () => {
  const r = runStructureCheck(minimal());
  console.log(`[trailer] no-resolver -> magnitude unmeasured=${rows(r, "magnitude", "unmeasured").length}, pass=${rows(r, "magnitude", "pass").length}`);
  // The button is present and the peak is present; whether one is smaller than the
  // other is a duration/energy question the beat layer holds no data for.
  expect(rows(r, "magnitude", "unmeasured").length).toBeGreaterThan(0);
  expect(rows(r, "magnitude", "pass")).toHaveLength(0);
});

test("the same rule becomes executable when the shot lane injects a resolver", () => {
  const big = runStructureCheck(minimal(), {
    magnitudeOf: (b) => (b.kind === "button" ? 9 : b.kind === "peak" ? 4 : 1),
  });
  const small = runStructureCheck(minimal(), {
    magnitudeOf: (b) => (b.kind === "button" ? 1 : b.kind === "peak" ? 9 : 2),
  });
  console.log(`[trailer] resolver -> oversized button violations=${rows(big, "magnitude", "violation").length}`);
  expect(rows(big, "magnitude", "violation").length).toBeGreaterThan(0);
  expect(rows(small, "magnitude", "violation")).toHaveLength(0);
  expect(rows(small, "magnitude", "pass").length).toBeGreaterThan(0);
});

test("a declared specialty-lane cut is never graded malformed", () => {
  const broken: TrailerCut = { ...minimal(), lane: "specialty" };
  broken.beats = broken.beats.filter((b) => b.kind !== "reset");
  const r = runStructureCheck(broken);
  console.log(`[trailer] specialty -> malformed=${String(r.malformed)}, violations=${r.violations}`);
  // The deviation IS reported — that is the useful thing to surface to a human —
  // but the structure alone cannot say whether it is a choice or a defect.
  expect(r.violations).toBeGreaterThan(0);
  expect(r.malformed).toBeNull();
});

test("a mood-led cut is refused, not failed, for rungs and reset", () => {
  const mood: TrailerCut = { ...minimal(), moodLed: true };
  mood.beats = mood.beats.filter((b) => b.kind !== "rung" && b.kind !== "reset");
  const r = runStructureCheck(mood);
  expect(rows(r, "escalation", "not-engaged").length).toBe(1);
  expect(rows(r, "escalation", "violation")).toHaveLength(0);
  expect(rows(r, "reset", "not-engaged").length).toBe(1);
  expect(rows(r, "reset", "violation")).toHaveLength(0);
});

test("AND THEN between adjacent beats is a violation the chain can no longer hide", () => {
  const cut = minimal();
  cut.beats = cut.beats.map((b) => (b.id === "p3" ? { ...b, connector: "AND THEN" as const } : b));
  const r = runStructureCheck(cut);
  const v = rows(r, "connector", "violation");
  console.log(`[trailer] and-then -> violations=${v.length} at ${v.map((f) => f.at).join(",")}`);
  expect(v).toHaveLength(1);
  expect(v[0].beatId).toBe("p3");
  expect(v[0].at).toBe("0:20");
});

test("every report carries the standing efficacy row, so enforced can never be 100", () => {
  const r = runStructureCheck(minimal(), {
    magnitudeOf: (b) => (b.kind === "peak" ? 9 : b.kind === "button" ? 1 : 2),
  });
  const efficacy = r.findings.filter((f) => f.rule === "efficacy");
  console.log(`[trailer] efficacy rows=${efficacy.length}, enforced=${r.enforced}%, malformed=${String(r.malformed)}`);
  expect(efficacy).toHaveLength(1);
  expect(efficacy[0].verdict).toBe("unmeasured");
  expect(r.enforced).toBeLessThan(100);
});

test("every finding cites the doctrine it is read from", () => {
  const r = runStructureCheck(minimal());
  const uncited = r.findings.filter((f) => !f.cites);
  expect(uncited).toHaveLength(0);
});
