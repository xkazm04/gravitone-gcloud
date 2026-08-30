// LANE — EVERY MOVEMENT ROLE HAS A PLACE ON THE SPINE (dynamic).
//
// `SPINE_ORDER` was declared `readonly MovementRole[]`, which type-checks every
// ENTRY and says nothing about whether every role is present. `spineSort` then
// ranked with `SPINE_ORDER.indexOf(role)`, and `indexOf` answers a role it does
// not carry with -1 — which does not sort as "unknown", it sorts AHEAD of the
// cold open. A sixth role added to the union would have compiled cleanly and
// silently reordered the trailer's spine.
//
// The rank is a `Record<MovementRole, number>` now, so the omission is a build
// error. That is the real guard and it is not a test — this file pins the two
// things a type cannot say:
//
//   · the derived order still runs cold-open → introduction → escalation →
//     climax → tail, which is the sequence every checker message quotes;
//   · a role that reaches the sorter WITHOUT a rank (the shape a cast or a
//     hand-built fixture can still produce at runtime) does not land in front of
//     the cold open.
import { test, expect } from "@playwright/test";

import { composeCut } from "@/app/_phases/script/trailer/cut";
import { SPINE_ORDER, SPINE_RANK, type Movement, type MovementRole } from "@/app/_phases/script/trailer/types";
import type { BeatSlot } from "@/app/_phases/research/beats/beats";

/** The union, written out. A role added to MovementRole and not here fails
 *  typecheck on this very line — which is the point: the list of roles this
 *  probe knows about cannot drift behind the type either. */
const ALL_ROLES: Record<MovementRole, true> = {
  "cold-open": true,
  introduction: true,
  escalation: true,
  climax: true,
  tail: true,
};

test("every role in the union has a rank, and the order is derived from it", () => {
  const roles = Object.keys(ALL_ROLES) as MovementRole[];
  for (const r of roles) expect(SPINE_RANK[r], `${r} has no rank`).toBeGreaterThanOrEqual(0);
  expect([...SPINE_ORDER].sort()).toEqual([...roles].sort());
  expect(SPINE_ORDER).toEqual(["cold-open", "introduction", "escalation", "climax", "tail"]);
});

/** One slot offering exactly one variant, so `composeCut` picks it. */
function slot(id: string, role: MovementRole, ordinal: number): BeatSlot {
  const movement: Movement = { id: `m-${id}`, role, ordinal, label: `${role} ${ordinal}` };
  return {
    id,
    movement,
    variants: [
      {
        id: `${id}-v1`,
        beat: { id: `b-${id}`, movement: movement.id, kind: "movement", label: role, text: `${role} text` },
      },
    ],
  } as unknown as BeatSlot;
}

const CUE = { id: "cue-probe", title: "probe", totalS: 30 } as never;

const compose = (slots: BeatSlot[]) =>
  composeCut({ projectId: "p", title: "t", cue: CUE, slots, picks: Object.fromEntries(slots.map((s) => [s.id, `${s.id}-v1`])) });

test("slots arriving out of order are composed in spine order", () => {
  const cut = compose([
    slot("s-tail", "tail", 5),
    slot("s-climax", "climax", 4),
    slot("s-cold", "cold-open", 1),
    slot("s-intro", "introduction", 2),
  ]);
  const order = cut.movements.map((m) => m.role);
  console.log(`[trailer] composed order = ${order.join(" -> ")}`);
  expect(order).toEqual(["cold-open", "introduction", "climax", "tail"]);
});

test("two escalations keep their own ordinal, between introduction and climax", () => {
  const cut = compose([
    slot("s-e2", "escalation", 4),
    slot("s-climax", "climax", 5),
    slot("s-e1", "escalation", 3),
    slot("s-intro", "introduction", 2),
  ]);
  expect(cut.movements.map((m) => m.id)).toEqual(["m-s-intro", "m-s-e1", "m-s-e2", "m-s-climax"]);
});

test("a role with NO rank does not sort ahead of the cold open", () => {
  // The runtime shape a cast or a hand-built fixture can still produce. Under
  // `indexOf` this ranked -1 and led the cut; under a rank lookup it is NaN,
  // every comparison is false, and it holds the position it arrived in rather
  // than jumping the spine.
  const rogue = slot("s-rogue", "button" as MovementRole, 9);
  const cut = compose([slot("s-cold", "cold-open", 1), rogue, slot("s-climax", "climax", 4)]);
  const order = cut.movements.map((m) => m.role);
  console.log(`[trailer] with an unranked role = ${order.join(" -> ")}`);
  expect(order[0], "an unranked role led the cut").toBe("cold-open");
});
