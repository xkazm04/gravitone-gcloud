// The stored trailer cut has ONE reader (ops.ts logFromRecord). The producer's cutLogOf and the
// real side's scriptOf each hand-rolled a second and third: a record with ops and no head derived
// with zero edits applied there, where logFromRecord applies every op; a record with no
// originBudget derived a budget of undefined.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { slotsFor } from "@/lib/research/beats";
import { composeCut } from "@/lib/script/trailer/cut";
import { derive, editBeat, logFromRecord, newLog } from "@/lib/script/trailer/ops";
import { GLASS_HARBOR_BUDGET, GLASS_HARBOR_CUE } from "@/lib/studio/trailerFixtures";

const { scriptOf } = await import("../../app/(studio)/projects/[id]/_part/realScript.ts");
const { cutLogOf } = await import("../../lib/producers/script.ts");

const slots = slotsFor("trailer");
const picks = Object.fromEntries(slots.map((s) => [s.id, s.variants[0].id]));
const origin = composeCut({ projectId: "p-readers", title: "Glass Harbor", picks, slots, cue: GLASS_HARBOR_CUE });
const edited = editBeat(newLog(origin, GLASS_HARBOR_BUDGET), origin.beats[0]!.id, { label: "EDITED" });
const base = { cut: origin, budget: GLASS_HARBOR_BUDGET };

const readers = (rec: Record<string, unknown>) => ({
  ops: logFromRecord(rec as never),
  producer: cutLogOf({ records: new Map([["script-trailer", rec]]) } as never),
  real: scriptOf(new Map([["script-trailer", rec]]) as never).cut,
});

describe("the three readers of a stored cut", () => {
  it("a record with ops and no head applies every op on all three", () => {
    const r = readers({ ...base, origin, ops: edited.ops });
    const want = derive(r.ops);
    expect(want.cut.beats[0]!.label).toBe("EDITED");
    expect(derive(r.producer!)).toEqual(want);
    expect(derive(r.real!)).toEqual(want);
  });

  it("a record with no originBudget falls back to the record's budget on all three", () => {
    const r = readers({ ...base, origin, ops: [], head: 0 });
    for (const log of [r.ops, r.producer!, r.real!]) expect(log.originBudget).toEqual(GLASS_HARBOR_BUDGET);
  });

  it("a legacy record (a cut, no origin) is its own origin on all three", () => {
    const r = readers({ ...base });
    for (const log of [r.ops, r.producer!, r.real!]) expect(derive(log).cut).toEqual(origin);
  });
});
