import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PlanPart } from "@gt/domain/produce";

import { applyCancel, fixtureAct, fixtureSchedule, resetCalendar } from "../../app/(studio)/floor/_calendar/fixture.ts";
import { resetProduce, universe } from "../../app/(studio)/projects/_port/fixture.ts";
import { fixtureProduce } from "../../app/(studio)/projects/_port/port.ts";

// THE LAST STEP OF THE WALK, ON THE FIXTURE: a slot scheduled on the fixture calendar for a plan's
// slot part places that part, as the kernel's slot store places it on the real side
// (@gt/kernel/slots/read.ts `slottedIn` / `slotOfPartIn`, read by records/read.ts). The Plan's slot
// row carries the slot's id and its state follows: placed while the slot holds its item, waiting
// again once it is cancelled.

const NOW = Date.parse("2026-11-09T09:00:00Z");
const ID = "glass-harbor-trailer";
const PART = `${ID}:slot`;
const draft = { item: "video:export:river-steps", channel: "youtube", at: "2026-11-20T12:00:00.000Z", title: "Glass Harbor", description: "", tags: [] } as const;

beforeEach(() => {
  resetProduce(NOW);
  resetCalendar();
});

function slotRow(): PlanPart {
  const plan = fixtureProduce().loadPlan({ id: ID });
  if (!plan.ok) throw plan.error;
  const row = plan.value.parts.find((p) => p.id === PART);
  if (row === undefined) throw new Error("no slot row");
  return row;
}
const slotIdOf = (p: PlanPart): string | undefined => (p.kind === "slot" ? p.slotId : undefined);

/** The cut's Board packet committed: the one step before the slot, which the fixture has no act for. */
function commitCutGate(): void {
  const part = universe(NOW).projects.get(ID)?.parts.find((p) => p.id === `${ID}:gate:cut`);
  if (part === undefined) throw new Error("no cut gate");
  part.packet = "committed";
}

describe("a fixture calendar slot places its plan's slot part", () => {
  it("is honest before anything is scheduled: the trailer's cut waits at the weir, its slot holds no slot", () => {
    const row = slotRow();
    expect([row.state, slotIdOf(row)]).toEqual(["queued", undefined]);
  });

  it("carries the slot and follows it: placed while it holds, waiting again once it is cancelled", () => {
    commitCutGate();
    expect([slotRow().state, slotIdOf(slotRow())]).toEqual(["awaiting_gate", undefined]);
    const made = fixtureSchedule({ ...draft, partId: PART }, NOW);
    if (!made.ok) throw made.error;
    const id = made.value.slot.id;
    expect([slotRow().state, slotIdOf(slotRow())]).toEqual(["ratified", id]);
    const cancelled = fixtureAct("cancel", id, NOW, applyCancel);
    if (!cancelled.ok) throw cancelled.error;
    expect([slotRow().state, slotIdOf(slotRow())]).toEqual(["awaiting_gate", undefined]);
  });

  it("a slot scheduled without a part, or for another project's, places nothing here", () => {
    commitCutGate();
    const free = fixtureSchedule(draft, NOW);
    if (!free.ok) throw free.error;
    const other = fixtureSchedule({ ...draft, channel: "tiktok", partId: "why-bitcoin:slot" }, NOW);
    if (!other.ok) throw other.error;
    expect([slotRow().state, slotIdOf(slotRow())]).toEqual(["awaiting_gate", undefined]);
  });
});
