import { describe, expect, it } from "vitest";

import { stripDataEquals } from "../../lib/foundry/strips/lint.ts";
import { FLOORS, measureContinuity } from "../../lib/reel/continuity.ts";
import { stickyOrders } from "../../lib/reel/order.ts";
import { advanceCut, newReel, nextVerb, parseIdea, withBrief, withPlan, withTable } from "../../lib/reel/state.ts";
import { canonical, parseTable } from "../../lib/reel/table.ts";
import { makeTimeMap } from "../../lib/reel/timeMap.ts";
import { computeTimingPlan } from "../../lib/reel/timing.ts";
import { CUTS, type ReelTable } from "../../lib/reel/types.ts";

// THE REEL'S PURE HALF (lib/reel). A reel's promise is that it shows controlled content: a table that says
// where it came from, a shape that was MEASURED against the continuity gate, a clock computed before the page
// was written, and a page whose data block is that issue unchanged. Each describe holds one of those.

const SOURCE = { name: "A named table", url: "https://example.org/table", licence: "CC BY 4.0", fetchedAt: "2026-11-17" };
const event = (k: number, period: number) => ({ id: `e${k}`, period, title: `Event ${k}`, date: `step ${period}`, fact: "Something dated happened here.", url: "https://example.org/fact" });

/** A cumulative race of `n` entities over `P` steps in which the lead passes down the cast, one entity at a time. */
function race(P: number, n: number, events = 6): Record<string, unknown> {
  const periods = Array.from({ length: P }, (_, i) => `s${i}`);
  const entities = Array.from({ length: n }, (_, e) => {
    let total = 0;
    // Entity e scores fastest in the e-th slice of the timeline, and each slice is faster than the one before,
    // so each entity takes the lead in turn and keeps it until the next one's slice.
    const values = periods.map((_, i) => (total += Math.floor((i * n) / P) === e ? 5 + 3 * e : 1));
    return { id: `x${e}`, name: `Entity ${e}`, values };
  });
  return { v: 1, unit: "points", granularity: "round", cumulative: true, periods, entities, events: Array.from({ length: events }, (_, k) => event(k, Math.floor(((k + 1) * P) / (events + 1)))), source: SOURCE };
}
const table = (raw: unknown): ReelTable => {
  const t = parseTable(raw);
  if (typeof t === "string") throw new Error(t);
  return t;
};

describe("the table door", () => {
  it("takes a table that names its source, licence and one value per period", () => {
    expect(typeof parseTable(race(80, 8))).toBe("object");
  });

  it.each([
    ["no licence", (t: Record<string, unknown>) => ({ ...t, source: { ...SOURCE, licence: "" } }), /licence/],
    ["a source that is not https", (t: Record<string, unknown>) => ({ ...t, source: { ...SOURCE, url: "http://example.org" } }), /https/],
    ["a short series", (t: Record<string, unknown>) => ({ ...t, entities: [{ id: "a", name: "A", values: [1, 2] }] }), /values for 80 periods/],
    ["a negative value", (t: Record<string, unknown>) => ({ ...t, entities: [{ id: "a", name: "A", values: Array.from({ length: 80 }, () => -1) }] }), /finite number/],
    ["an event with no url", (t: Record<string, unknown>) => ({ ...t, events: [{ ...event(0, 3), url: "" }] }), /place to read its fact/],
    ["an event outside the periods", (t: Record<string, unknown>) => ({ ...t, events: [event(0, 80)] }), /outside 0\.\.79/],
    ["a cumulative series that falls", (t: Record<string, unknown>) => ({ ...t, entities: [{ id: "a", name: "A", values: Array.from({ length: 80 }, (_, i) => 80 - i) }] }), /says cumulative/],
  ])("refuses %s with a sentence", (_name, bend, said) => {
    expect(parseTable(bend(race(80, 8)))).toMatch(said);
  });

  it("canonical text is free of key order and nothing else", () => {
    expect(canonical({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonical({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(canonical({ a: [1, 2] })).not.toBe(canonical({ a: [2, 1] }));
  });
});

describe("the continuity gate is measured on the rows", () => {
  it("passes a long race whose lead changes hands", () => {
    const c = measureContinuity(table(race(120, 8)));
    expect(c.failures).toEqual([]);
    expect(c.ok).toBe(true);
    expect(c.leadChanges).toBeGreaterThanOrEqual(FLOORS.leadChanges);
    expect(c.leaders[0]).toEqual({ entity: "Entity 0", from: "s0" });
  });

  it("names every floor a thin table is under", () => {
    const c = measureContinuity(table(race(20, 3, 1)));
    expect(c.ok).toBe(false);
    expect(c.failures.join(" | ")).toMatch(/20 real round steps; the floor is 60/);
    expect(c.failures.join(" | ")).toMatch(/entities on screen/);
    expect(c.failures.join(" | ")).toMatch(/1 dated events/);
  });

  it("holds yearly data to the long-series rule", () => {
    const yearly = { ...race(70, 12), granularity: "year" };
    expect(measureContinuity(table(yearly)).failures.join(" | ")).toMatch(/70 yearly steps; yearly data needs about 100/);
  });

  it("a leader that never changes fails, however many steps there are", () => {
    const raw = race(120, 8);
    const flat = { ...raw, entities: (raw["entities"] as { id: string; name: string }[]).map((e, k) => ({ ...e, values: Array.from({ length: 120 }, (_, i) => (8 - k) * (i + 1)) })) };
    const c = measureContinuity(table(flat));
    expect(c.leadChanges).toBe(0);
    expect(c.failures.join(" | ")).toMatch(/0 lead change/);
  });
});

describe("the order is sticky", () => {
  it("a near-equal chaser does not take the row until it leads by the margin", () => {
    const a = [10, 10, 10, 10];
    const b = [9, 10.2, 10.4, 12];
    const orders = stickyOrders([a, b], 4, { rel: 0.06, abs: 0 });
    expect(orders.map((o) => o[0])).toEqual([0, 0, 0, 1]);
  });
});

describe("the timing plan", () => {
  const t = table(race(120, 8));

  it.each(["short", "long"] as const)("the %s cut lands inside its length and ends on the section boundary", (cut) => {
    const plan = computeTimingPlan(t, cut);
    const spec = CUTS[cut];
    const seconds = plan.sections.total / plan.fps;
    expect(seconds).toBeGreaterThanOrEqual(cut === "short" ? 30 : 120);
    expect(seconds).toBeLessThanOrEqual(cut === "short" ? 60 : 240);
    expect(plan.knots[0]).toEqual([spec.hookFrames, 0]);
    expect(plan.knots[plan.knots.length - 1]).toEqual([plan.sections.timelineEnd, 119]);
    expect(plan.orders).toHaveLength(120);
    expect(plan.events).toHaveLength(6);
  });

  it("the clock never runs backwards and reaches every event at its frame", () => {
    const plan = computeTimingPlan(t, "short");
    const map = makeTimeMap(plan.knots);
    let prev = -1;
    for (let f = 0; f <= plan.sections.total; f += 7) {
      const p = map.at(f);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
    for (const e of plan.events) expect(Math.abs(map.at(e.frame) - e.period)).toBeLessThan(0.5);
  });

  it("is the same plan twice (its block has a stable hash)", () => {
    expect(canonical(computeTimingPlan(t, "long"))).toBe(canonical(computeTimingPlan(t, "long")));
  });

  it("warping makes change per second more even than a uniform clock", () => {
    const { evenness } = computeTimingPlan(t, "short");
    expect(evenness.cvWarped).toBeLessThanOrEqual(evenness.cvUniform);
  });
});

describe("the stage machine", () => {
  const idea = { title: "A race", hook: "Who ends on top?", path: "The lead passes from Entity 0 to Entity 7, one slice of the timeline at a time." };
  const NOW = "2026-11-17T00:00:00.000Z";

  it("an idea needs a question and a reason to keep watching", () => {
    expect(parseIdea({ ...idea, hook: "Entity 7 wins" })).toMatch(/question/);
    expect(parseIdea({ ...idea, path: "It is interesting." })).toMatch(/why someone keeps watching/);
    expect(parseIdea(idea)).toEqual(idea);
  });

  it("walks idea -> data -> planned -> briefed -> proofed -> cut, and says the next verb", () => {
    let s = newReel("a-race", idea, NOW);
    expect(nextVerb(s, "d")).toMatch(/^data d/);
    s = withTable(s, "sha-1", NOW).state;
    s = withPlan(s, NOW);
    expect(nextVerb(s, "d")).toBe("brief d short");
    s = withBrief(s, "short", 900, "block-1", NOW);
    s = advanceCut(s, "short", "proofed", NOW);
    s = advanceCut(s, "short", "cut", NOW);
    expect(s.cuts.short?.stage).toBe("cut");
    expect(nextVerb(s, "d")).toBe("brief d long");
  });

  it("a different table forgets the plan and every cut; the same table changes nothing", () => {
    let s = withPlan(withTable(newReel("a-race", idea, NOW), "sha-1", NOW).state, NOW);
    s = withBrief(s, "short", 900, "block-1", NOW);
    expect(withTable(s, "sha-1", NOW)).toEqual({ state: s, reset: false });
    const moved = withTable(s, "sha-2", NOW);
    expect(moved.reset).toBe(true);
    expect(moved.state.stage).toBe("data");
    expect(moved.state.cuts).toEqual({});
  });

  it("a cut never moves back", () => {
    let s = withPlan(withTable(newReel("a-race", idea, NOW), "sha-1", NOW).state, NOW);
    s = advanceCut(withBrief(s, "short", 900, "block-1", NOW), "short", "cut", NOW);
    expect(advanceCut(s, "short", "proofed", NOW)).toBe(s);
  });
});

describe("controlled content: the page's block is the issued data", () => {
  const issued = { table: { unit: "points", periods: ["a", "b"] }, plan: { knots: [[60, 0], [810, 1]] } };
  const page = (block: unknown): string => `<script id="strip-data" type="application/json">${JSON.stringify(block)}</script>`;

  it("passes the issued block, whatever its key order or whitespace", () => {
    expect(stripDataEquals(page(issued), issued)).toEqual([]);
    expect(stripDataEquals(`<script id="strip-data" type="application/json">\n ${JSON.stringify({ plan: issued.plan, table: issued.table }, null, 2)}\n</script>`, issued)).toEqual([]);
  });

  it.each([
    ["a rounded number", { ...issued, plan: { knots: [[60, 0], [800, 1]] } }],
    ["a dropped period", { ...issued, table: { unit: "points", periods: ["a"] } }],
    ["an added field", { ...issued, extra: 1 }],
  ])("refuses %s", (_name, bent) => {
    expect(stripDataEquals(page(bent), issued).map((f) => f.rule)).toEqual(["data: the strip-data block is the issued data, unchanged"]);
  });

  it("leaves a missing or unparsable block to the rule that names it", () => {
    expect(stripDataEquals("<p>no block</p>", issued)).toEqual([]);
    expect(stripDataEquals('<script id="strip-data" type="application/json">{nope</script>', issued)).toEqual([]);
  });
});
