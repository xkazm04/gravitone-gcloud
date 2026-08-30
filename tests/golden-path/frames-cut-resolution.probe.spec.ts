// LANE — THE TRAILER CUT REACHES FRAMES, AND THE EXPLAINER DOES NOT MOVE (dynamic).
//
// THE SEAM THIS GUARDS. Step 3 answered "which cut am I working on" with
// `const render = RENDERS[0]` — the explainer's fixture, for every project,
// whatever its own record said. So the entire shot lane (`shots.ts`,
// `shotPrompt.ts`, `shotReview.ts`, `ShotSheet.tsx`) was built, regression
// covered, and UNREACHABLE from real project data: `shotsFromRender` returns []
// for anything that is not a promotional template, and the explainer fixture
// never was one. Everything downstream of Step 2 rendered somebody else's script.
//
// A unit test of `shotsFromBeats` could not have found that, and one did exist:
// `shot-decomposition.probe.spec.ts` drives the decomposition over hand-built
// fixtures and passes whether or not any beat in the product ever reaches it.
// So this file asserts the JOIN — the resolver in `frames.ts` deciding a lane
// from a project record, the beat layer's own projection, and the shot layer —
// and it fails if a trailer project's beats stop arriving.
//
// AND THE OPPOSITE, which matters more, because it is the thing that could be
// broken quietly: an explainer's frame list and shot behaviour must be
// BYTE-IDENTICAL. `framesFor` is asserted to be the same call it always was,
// object for object, not merely the same length.
import { test, expect } from "@playwright/test";

import {
  absentTrailerRender,
  explainerRender,
  framesFor,
  framesFromRender,
  framesLane,
  trailerRender,
} from "@/app/_phases/frames/frames";
import { isTrailerFormat, shotsFromRender } from "@/app/_phases/frames/shots";
import { composeCut } from "@/app/_phases/script/trailer/cut";
import { slotsFor } from "@/app/_phases/research/beats/beats";
import { GLASS_HARBOR_CUE } from "@/app/_studio/trailerFixtures";
import { RENDERS } from "@/app/_phases/script/renders";
import { DISCIPLINES, TEMPLATE_FAMILY, type Discipline, type TemplateId } from "@/lib/projects";

/** A whole spine, composed the way Step 1 → Step 2 composes one: every slot's
 *  FIRST variant confirmed, then `composeCut` over the discipline's own slots.
 *  Nothing here is hand-built — if the fixture slots change, this changes with
 *  them, which is the point of driving the real composer. */
function composedSpine(discipline: Discipline = "trailer") {
  const slots = slotsFor(discipline);
  const picks = Object.fromEntries(slots.map((s) => [s.id, s.variants[0].id]));
  return composeCut({
    projectId: "p-probe",
    title: "Glass Harbor — trailer",
    picks,
    slots,
    cue: GLASS_HARBOR_CUE,
  });
}

/* ── 1 · the lane, from the record ──────────────────────────────────────────── */

test("the lane comes from the project record, and every discipline has an answer", () => {
  // Written as a total table over the union rather than three cases, so a
  // fourth discipline cannot be added without this line failing to compile.
  const expected: Record<Discipline, { facts: string; beats: string }> = {
    educational: { facts: "explainer", beats: "explainer" },
    trailer: { facts: "trailer", beats: "trailer" },
    // The one case the record alone cannot answer: a `free` project's lane is
    // whatever Step 1 chose. This is the rule ScriptStep routes on, and the two
    // steps reading it from one function is why they cannot disagree.
    free: { facts: "explainer", beats: "trailer" },
  };
  for (const d of DISCIPLINES) {
    expect(framesLane(d, "facts"), `${d} + facts`).toBe(expected[d].facts);
    expect(framesLane(d, "beats"), `${d} + beats`).toBe(expected[d].beats);
  }
  // A record written before disciplines existed carries none. It must read as
  // the explainer it was, never as a trailer with no spine.
  expect(framesLane(undefined, undefined)).toBe("explainer");
  console.log(`[lane] ${DISCIPLINES.map((d) => `${d}:${framesLane(d, "beats")}`).join(" ")}`);
});

/* ── 2 · the explainer does not move ────────────────────────────────────────── */

test("an explainer's frames are the SAME OBJECTS the old code derived — not merely the same count", () => {
  for (const r of RENDERS) {
    const source = explainerRender(r);
    // THE BYTE-IDENTICAL GATE. `framesFromRender` is what Step 3 called before
    // the record was consulted at all; `framesFor` is the branch that replaced
    // the call site. Deep equality over the whole list, because a frame carries
    // seeded texts, elements and ids that a length check would not see.
    expect(framesFor(source, r), `${r.id} frames`).toEqual(framesFromRender(r));
    expect(framesFor(source, r).length, `${r.id} count`).toBe(r.beats.length);
  }
  console.log(`[explainer] ${RENDERS.map((r) => `${r.id}:${framesFromRender(r).length}`).join(" ")} frames`);
});

test("no explainer render decomposes into a single shot, whichever way it is asked", () => {
  for (const r of RENDERS) {
    expect(isTrailerFormat(r.template), `${r.id} must not read as a trailer`).toBe(false);
    // Through the resolver, which is the path the product now takes.
    expect(shotsFromRender(explainerRender(r)), `${r.id} via the resolver`).toHaveLength(0);
    // And directly, which is the path `shot-decomposition` already covers — both
    // must agree, or the resolver has changed the answer on its way through.
    expect(shotsFromRender(r), `${r.id} directly`).toHaveLength(0);
  }
});

/* ── 3 · THE SEAM. A trailer project's beats reach the shot lane ────────────── */

test("a composed spine reaches shotsFromRender and produces shots — the seam that was open", () => {
  const cut = composedSpine();
  expect(cut.beats.length, "the composer produced a spine").toBeGreaterThan(0);

  const source = trailerRender(cut, { template: "trailer", durationS: 120 });
  expect(source.origin).toBe("trailer-cut");
  expect(source.beats).toHaveLength(cut.beats.length);

  const shots = shotsFromRender(source);
  // THE ASSERTION THIS FILE EXISTS FOR. Before the resolver landed this was 0,
  // for every project, forever — and nothing anywhere went red about it.
  expect(shots.length, "a trailer's beats must reach the shot lane").toBeGreaterThan(0);
  expect(shots.length).toBeGreaterThan(cut.beats.length); // it DECOMPOSED, not mapped 1:1

  // Every shot is locatable back to the beat it came from. A shot list you
  // cannot trace to a beat is a rumour, which is the same reason `beatId` exists.
  const beatIds = new Set(cut.beats.map((b) => b.id));
  for (const s of shots) expect(beatIds.has(s.beatId ?? ""), `shot ${s.id} names a real beat`).toBe(true);

  console.log(`[seam] ${cut.beats.length} composed beats -> ${shots.length} shots over 120s`);
});

test("the shot lane reads the beat layer's projection with no field lost", () => {
  const cut = composedSpine();
  const source = trailerRender(cut, { template: "trailer", durationS: 120 });
  for (const [i, b] of source.beats.entries()) {
    const from = cut.beats[i];
    expect(b.id).toBe(from.id);
    expect(b.at).toBe(from.at);
    expect(b.label).toBe(from.label);
    expect(b.kind).toBe(from.kind);
    // Parsed ONCE, by the beat layer, and never re-parsed downstream — the whole
    // reason `beatSeconds` defers to `atSeconds` rather than keeping a copy.
    expect(b.atS, `${b.at} parses`).not.toBe(null);
  }
});

test("a trailer chain derives no FRAMES — the plate seam stays shut", () => {
  const cut = composedSpine();
  const source = trailerRender(cut, { template: "trailer", durationS: 120 });
  // A `Frame` owns a `plate` and a plate is what gets generated. Deriving frames
  // from trailer beats would build the trailer's plate generation by accident,
  // which is explicitly the next slice and not this one.
  expect(framesFor(source, RENDERS[0])).toEqual([]);
});

/* ── 4 · the absence, which is a different thing from an empty result ───────── */

test("a trailer project with no spine is an ABSENCE, and says so in the record rather than in a row count", () => {
  const none = absentTrailerRender({ title: "Glass Harbor — trailer", template: "trailer", durationS: 120 });
  expect(none.origin).toBe("no-spine");
  expect(none.beats).toHaveLength(0);
  // The trap this pins: `shotsFromRender` answers [] here too, exactly as it
  // does for an explainer, so a surface that branched on the SHOT COUNT would
  // draw "0 shots" over a project whose spine simply has not been written. The
  // surface must read `origin`, and this is the assertion that says why.
  expect(shotsFromRender(none)).toHaveLength(0);
  expect(shotsFromRender(explainerRender(RENDERS[0]))).toHaveLength(0);
  expect(explainerRender(RENDERS[0]).origin).not.toBe(none.origin);
  console.log("[absence] no-spine and explainer both decompose to 0 shots — origin is the only discriminator");
});

/* ── 5 · the allow-list must cover what this app can actually create ────────── */

test("every template the trailer discipline offers reads as a promotional cut", () => {
  // The check that caught `cinematic`: it is one of the three ids
  // `TEMPLATE_FAMILY` files under `trailer`, it was missing from
  // `TRAILER_TEMPLATES`, and a project created on it decomposed into nothing at
  // all while looking exactly like a project whose spine was empty.
  //
  // This does NOT derive membership — `shots.ts` keeps a documented allow-list
  // whose default answer is no, on purpose. It asserts the allow-list COVERS the
  // templates this product can put in a record, which is a different claim.
  const entries = Object.entries(TEMPLATE_FAMILY) as [TemplateId, Discipline][];
  for (const [id, family] of entries) {
    expect(isTrailerFormat(id), `${id} (${family})`).toBe(family === "trailer");
  }
  const promotional = entries.filter(([, f]) => f === "trailer").map(([id]) => id);
  expect(promotional.length).toBeGreaterThan(0);
  console.log(`[templates] promotional: ${promotional.join(", ")}`);
});
