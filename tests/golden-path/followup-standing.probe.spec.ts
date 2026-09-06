// LANE — EVERY EFFECT KIND CHECKS WHETHER ITS TARGET IS ACTUALLY HERE (dynamic).
//
// `standingOf` states its own rule: "a record naming a card the notebook no
// longer has gets REPORTED, not quietly drawn as though it still pointed at
// something." The transcripts it reads are real terminal output from
// 2026-08-11 and the notebook has moved under them since, so a dangling id is
// the expected case, not an exotic one.
//
// Four of the five kinds consulted the card set. `downgrades` returned "not
// applied" unconditionally, so a downgrade naming an id the fixture does not
// carry read as a legitimate pending effect — the exact failure the docstring
// says the function exists to prevent, in the one branch that could not detect
// it. Nobody had met it because the CANNED fixture carries no downgrade: the
// kind is in the `Effect` union, the queue renders whatever the union allows,
// and the first real one would have been the one to find out.
//
// So this probe does not test the four that happened to be right. It walks the
// `Effect` union's own kinds and requires each to report a dangling target,
// which is what makes a SIXTH kind covered by existing.
import { test, expect } from "@playwright/test";

import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { standingOf, type Effect } from "@/app/_phases/research/followup";

const cardIds = new Set(buildCards().map((c) => c.id));
const ABSENT = "f-no-such-id-anywhere";

/** One effect of each kind, all pointing at an id the notebook does not carry.
 *  Typed as Effect, so adding a kind to the union fails to compile here until
 *  it is listed — the union is the ground truth, not this array. */
const DANGLING: Record<Effect["kind"], Effect> = {
  confirms: { kind: "confirms", targetId: ABSENT, note: "n/a" },
  downgrades: { kind: "downgrades", targetId: ABSENT, note: "n/a" },
  kills: { kind: "kills", targetId: ABSENT, note: "n/a" },
  "resolves-unknown": { kind: "resolves-unknown", targetId: ABSENT, note: "n/a" },
  "adds-fact": { kind: "adds-fact", factId: ABSENT, claim: "n/a", confidence: "low", source: "n/a" },
};

test("the probe is reading a real notebook, not an empty one", () => {
  expect(cardIds.size, "buildCards returned nothing — this probe proves nothing").toBeGreaterThan(20);
  expect(cardIds.has(ABSENT), "the absent id is somehow a real card").toBe(false);
});

test("no effect kind reports a dangling target as landed — except the one whose meaning is inverted", () => {
  for (const [kind, e] of Object.entries(DANGLING)) {
    const s = standingOf(e, cardIds);
    console.log(`[standing] ${kind} @ absent id -> "${s.label}" landed=${s.landed}`);
    // `landed` means "the notebook on screen already carries this", so for four
    // of the five an absent target cannot have landed. `kills` is the exception
    // BY DEFINITION — the fact being gone IS the effect having happened — and it
    // gets its own assertion below rather than a hole in this one.
    if (kind === "kills") continue;
    expect(s.landed, `${kind} claims an effect on a missing id has landed`).toBe(false);
  }
});

test("`kills` reads a missing target as the kill having happened", () => {
  // Pinned explicitly so the loop above is never "fixed" by making kills wrong,
  // and so the exception it skips is a stated contract rather than an omission.
  const s = standingOf(DANGLING.kills, cardIds);
  expect(s.label).toBe("already gone");
  expect(s.landed, "a kill whose target is gone HAS landed").toBe(true);
  // And a kill whose target is still here has NOT landed — the inverse, so the
  // two assertions together pin the direction rather than one value.
  const present = [...cardIds].find((id) => id.startsWith("f-"))!;
  const still = standingOf({ kind: "kills", targetId: present, note: "n/a" }, cardIds);
  expect(still.landed, `${present} is still a card, so the kill has not landed`).toBe(false);
});

test("every kind that names a card SAYS SO when the card is absent", () => {
  // `kills` reads the absence as success; `adds-fact` reads it as not-yet-added.
  // The remaining three are pure references, and a dangling reference has to be
  // named as one rather than described as pending work.
  for (const kind of ["confirms", "downgrades", "resolves-unknown"] as const) {
    const s = standingOf(DANGLING[kind], cardIds);
    expect(
      s.why,
      `${kind} does not name the missing id — it reads as a legitimate pending effect`,
    ).toContain(ABSENT);
    expect(s.label, `${kind} does not report the dangling reference`).toBe("no such id here");
  }
});

test("a target that IS present still gets its own answer", () => {
  // The fix must not turn every downgrade into "no such id here".
  const real = [...cardIds].find((id) => id.startsWith("f-"))!;
  const s = standingOf({ kind: "downgrades", targetId: real, note: "n/a" }, cardIds);
  console.log(`[standing] downgrades @ ${real} -> "${s.label}"`);
  expect(s.label).toBe("not applied");
  expect(s.why).toContain(real);
});
