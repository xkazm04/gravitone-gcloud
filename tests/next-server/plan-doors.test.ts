import { describe, expect, it } from "vitest";

import type { PartTab } from "@gt/domain/partView";
import type { OperatorPlanPart, PlanPart } from "@gt/domain/produce";

import { editorHref, nextDoor, planRowHref, scheduleFor } from "../../app/(studio)/projects/_plan/doors.ts";

// THE WALK'S DOORS (spark fable-ten, package A): every row of a plan opens where its work is, and
// never a route that would refuse - a gate with no packet named, or a slot still behind its
// upstream, has no door at all.

const base = { after: [], state: "awaiting_gate" as const };
const gate = (over: Partial<PlanPart> = {}): PlanPart => ({ ...base, id: "p1/gate:frames", kind: "gate", label: "◆ approve", judges: "p1/frames", ...over }) as PlanPart;
const slot = (state: PlanPart["state"]): OperatorPlanPart => ({ ...base, id: "p1/slot", kind: "slot", label: "slot", state });
const frames: PlanPart = { ...base, id: "p1/frames", kind: "frames", label: "frames", units: 8, unitNoun: "plate", options: [], chosen: "x", estimate: { seconds: 0, usd: null, src: "illustrative" } };

describe("a plan row's door", () => {
  it("a work part opens its editor; the key is the id past the project and its separator", () => {
    expect(planRowHref("p1", frames)).toBe("/projects/p1/frames");
    expect(editorHref("glass-harbor-trailer", "glass-harbor-trailer:frames")).toBe("/projects/glass-harbor-trailer/frames");
  });

  it("a gate opens the packet the plan names, and has no door while it names none", () => {
    expect(planRowHref("p1", gate({ packetId: "pkt:step:p1/gate:frames#2" }))).toBe("/board/pkt%3Astep%3Ap1%2Fgate%3Aframes%232");
    expect(planRowHref("p1", gate())).toBeNull();
  });

  it("a slot opens the calendar once placed, its schedule sheet while it waits for a person, and nothing before", () => {
    expect(planRowHref("p1", slot("ratified"))).toBe("/floor?cal=1");
    expect(planRowHref("p1", slot("awaiting_gate"))).toBe(scheduleFor("p1/slot"));
    expect(scheduleFor("p1/slot")).toBe("/floor?cal=1&new=1&part=p1%2Fslot");
    for (const s of ["draft", "queued", "blocked"] as const) expect(planRowHref("p1", slot(s))).toBeNull();
    // Has a slot (holding, or missed and reschedulable): that slot, whatever the part's state.
    for (const s of ["ratified", "awaiting_gate"] as const) expect(planRowHref("p1", { ...slot(s), slotId: "sl-9" })).toBe("/floor?cal=1&slot=sl-9");
  });
});

describe("the part screen's next door", () => {
  const tab = (key: string, kind: PartTab["kind"], editor: boolean): PartTab => ({ partId: `p1/${key}`, key, kind, label: key, verdict: editor ? "empty" : null, editor });
  it("opens an editor, a slot's schedule sheet, a gate's packet when known and else the plan; an editor-less part has none", () => {
    expect(nextDoor("p1", tab("script", "script", true))).toEqual({ label: "script", href: "/projects/p1/script" });
    expect(nextDoor("p1", tab("slot", "slot", false))?.href).toBe("/floor?cal=1&new=1&part=p1%2Fslot");
    expect(nextDoor("p1", tab("gate:frames", "gate", false))?.href).toBe("/projects/p1");
    expect(nextDoor("p1", { ...tab("gate:frames", "gate", false), packetId: "pkt:step:p1/gate:frames#2" })?.href).toBe("/board/pkt%3Astep%3Ap1%2Fgate%3Aframes%232");
    // A slot part that already has its slot opens it - never a second schedule sheet.
    expect(nextDoor("p1", { ...tab("slot", "slot", false), slotId: "sl-1" })?.href).toBe("/floor?cal=1&slot=sl-1");
    expect(nextDoor("p1", tab("words", "words", false))).toBeNull();
    expect(nextDoor("p1", null)).toBeNull();
  });
});
