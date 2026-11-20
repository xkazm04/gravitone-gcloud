import { describe, expect, it } from "vitest";

import type { Production, ProductionNode } from "@gt/domain/productionGraph";

import imported from "../../app/(studio)/scout/canvas/_port/fixtureProduction.json" with { type: "json" };
import { runOf, stepRun, usedBy } from "../../app/(studio)/scout/canvas/_canvas/production/model.ts";

// The timeline street's overlays (spark character-cores S1.5 WP7) on the Unlatched fixture: what ← → walk from a
// node, and what an overlay lists as made from it. The dialog itself (open on a click, Esc returns focus) is driven
// in a browser by tests/live/scout-street-overlay.live.spec.ts.

const P = (imported as unknown as { production: Production }).production;
const node = (id: string): ProductionNode => {
  const n = P.nodes.find((m) => m.id === id);
  if (n === undefined) throw new Error(`no ${id}`);
  return n;
};
const ids = (ns: readonly ProductionNode[]): string[] => ns.map((n) => n.id);

describe("an overlay's run (← →)", () => {
  it("walks the keyframes in the order they play, wrapping at both ends", () => {
    const run = runOf(P, node("kf:B07"));
    expect(run).toHaveLength(37);
    const at = run.map((n) => n.at ?? -1);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(stepRun(P, node("kf:B07"), 1).id).toBe("kf:B08");
    expect(stepRun(P, node("kf:B07"), -1).id).toBe("kf:B06");
    expect(stepRun(P, run[0] as ProductionNode, -1).id).toBe(run[run.length - 1]?.id);
  });

  it("walks the takes by their place on the clock", () => {
    expect(ids(runOf(P, node("clip:K03")))).toEqual(["clip:K00", "clip:K01", "clip:K02", "clip:K03", "clip:K04", "clip:K05"]);
  });

  it("walks the plates apart from the look, and the look and the cut stand alone", () => {
    const plates = ids(runOf(P, node("plate:SETUP-C")));
    expect(plates).toHaveLength(10);
    expect(plates).not.toContain("look");
    expect(stepRun(P, node("look"), 1).id).toBe("look");
    expect(stepRun(P, node("cut"), -1).id).toBe("cut");
  });
});

describe("what an overlay lists as made from a node", () => {
  it("a plate's keyframes, in the order they play", () => {
    const kfs = usedBy(P, node("plate:SETUP-C"));
    expect(kfs.every((n) => n.station === "keyframe")).toBe(true);
    expect(ids(kfs).slice(0, 3)).toEqual(["kf:B02", "kf:B03", "kf:B08"]);
  });

  it("the look's plates only, never every node under it", () => {
    expect(usedBy(P, node("look")).every((n) => n.station === "look")).toBe(true);
    expect(usedBy(P, node("look"))).toHaveLength(10);
  });

  it("a take's start keyframe: the take", () => {
    expect(ids(usedBy(P, node("kf:K02")))).toEqual(["clip:K02"]);
  });
});
