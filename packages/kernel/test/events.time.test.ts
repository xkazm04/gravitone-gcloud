import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventTime, type Event, type EventInput } from "@gt/domain/event";
import { append } from "../src/events.ts";
import { countEvents, facetMap } from "../src/events-count.ts";
import { explainQuery, queryEvents, type EventQuery } from "../src/events-query.ts";
import { eventsMigrations } from "../src/events.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

// The Ledger reads by when an act HAPPENED: a fact projected today from a v1
// manifest of August sits in August. Order and window both follow
// t = occurredAt ?? at, a page continues on the tuple (t, seq) so rows that
// share an instant are neither skipped nor repeated, and a facet is counted
// with its own filter left out.

const SOURCES = ["forge", "extract", "dojo"] as const;
const TYPES = ["run.start", "run.log", "verdict.keep", "verdict.reject", "commit"] as const;

function projected(i: number): EventInput {
  const source = SOURCES[i % 3] ?? "forge";
  // Twelve distinct instants for 300 rows: ties are the common case, as a
  // forge.py log written at second precision makes them.
  const day = 1 + (i % 12);
  return {
    actor: { kind: i % 5 === 0 ? "operator" : "machine", id: source },
    type: TYPES[i % TYPES.length] ?? "run.log",
    subject: { kind: "run", id: `${source}-r${i % 7}` },
    data: { src: "fixture", runId: `${source}-r${i % 7}`, ...(i % 4 === 0 ? { projectId: `p${i % 2}` } : {}) },
    occurredAt: `2026-08-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    atSrc: i % 6 === 0 ? "derived" : "recorded",
    key: `${source}:r${i}:fact`,
  };
}
const own = (i: number): EventInput => ({ actor: { kind: "agent", id: "kernel" }, type: "job.done", subject: { kind: "job", id: `j${i}` }, lane: "gpu.local", data: { i } });

const tpl = templateStores([eventsMigrations], { clock: steppingClock("2026-10-15T00:00:00.000Z", 1000) });
let s: Store;
let all: Event[] = [];

beforeAll(() => {
  s = tpl.fresh();
  all = must(s.tx((t) => Array.from({ length: 360 }, (_, i) => (i % 6 === 5 ? append(t, own(i)) : append(t, projected(i))))));
});
afterAll(() => tpl.dispose());

const byTime = (a: Event, b: Event): number => (eventTime(a) < eventTime(b) ? -1 : eventTime(a) > eventTime(b) ? 1 : a.seq - b.seq);

function readAll(q: EventQuery): number[] {
  const seen: number[] = [];
  let cursor: { t: string; seq: number } | undefined;
  for (let guard = 0; guard < 100; guard++) {
    const page = must(queryEvents(s, cursor === undefined ? q : { ...q, cursor }));
    seen.push(...page.events.map((e) => e.seq));
    if (page.cursor === undefined) return seen;
    cursor = page.cursor;
  }
  throw new Error("paging did not end");
}

describe("the ledger by time", () => {
  it("orders by occurredAt ?? at, newest first, ties by seq", () => {
    const page = must(queryEvents(s, { by: "time", limit: 50 }));
    expect(page.events.map((e) => e.seq)).toEqual([...all].sort(byTime).reverse().slice(0, 50).map((e) => e.seq));
    // The kernel's own events (recorded today) are newer than every August fact.
    expect(page.events[0]?.type).toBe("job.done");
  });

  it.each([["desc"], ["asc"]] as const)("a %s time cursor visits every match exactly once across tied instants", (order) => {
    const q: EventQuery = { by: "time", order, type: ["run.*", "verdict.*"], limit: 17 };
    const want = all.filter((e) => e.type.startsWith("run.") || e.type.startsWith("verdict.")).sort(byTime);
    expect(readAll(q)).toEqual((order === "asc" ? want : want.reverse()).map((e) => e.seq));
  });

  it("windows by when it happened: an August fact recorded in October is in August", () => {
    const aug3 = must(queryEvents(s, { since: "2026-08-03T00:00:00.000Z", until: "2026-08-04T00:00:00.000Z", limit: 1000 }));
    expect(aug3.events.length).toBeGreaterThan(0);
    expect(aug3.events.every((e) => e.occurredAt === "2026-08-03T12:00:00.000Z")).toBe(true);
    const oct = must(queryEvents(s, { since: "2026-10-01T00:00:00.000Z", limit: 1000 }));
    expect(oct.events.every((e) => e.type === "job.done")).toBe(true);
  });

  it("a window bound means its instant, whatever precision it is written in", () => {
    const one = tpl.fresh();
    const [e] = must(one.tx((t) => [append(t, own(1))]));
    const at = e?.at ?? "";
    expect(at).toMatch(/\.\d{3}Z$/);
    const whole = at.replace(/\.\d{3}Z$/, "Z");
    expect(at.endsWith(".000Z")).toBe(true);
    // since is inclusive, until exclusive: the row at 00:00:00.000 is in [00:00:00Z, ...) and not in [..., 00:00:00Z).
    expect(must(queryEvents(one, { since: whole, limit: 10 })).events).toHaveLength(1);
    expect(must(queryEvents(one, { until: whole, limit: 10 })).events).toHaveLength(0);
    expect(must(countEvents(one, { since: whole })).total).toBe(1);
    expect(must(queryEvents(one, { since: at.replace(/Z$/, "000Z"), limit: 10 })).events).toHaveLength(1);
  });

  it("filters by source, project, run and a list of subjects", () => {
    const forge = must(queryEvents(s, { source: ["forge"], limit: 1000 })).events;
    expect(forge.length).toBe(all.filter((e) => e.key?.startsWith("forge:")).length);
    const p1 = must(queryEvents(s, { project: "p1", limit: 1000 })).events;
    expect(p1.map((e) => e.seq)).toEqual(all.filter((e) => e.data["projectId"] === "p1").map((e) => e.seq).reverse());
    const run = must(queryEvents(s, { run: "extract-r3", limit: 1000 })).events;
    expect(run.map((e) => e.seq)).toEqual(all.filter((e) => e.data["runId"] === "extract-r3").map((e) => e.seq).reverse());
    expect(run.length).toBeGreaterThan(0);
    const related = must(queryEvents(s, { subject: { ids: ["forge-r1", "dojo-r2"] }, limit: 1000 })).events;
    expect(new Set(related.map((e) => e.subject.id))).toEqual(new Set(["forge-r1", "dojo-r2"]));
  });

  it("refuses a seq cursor on a time order, and the reverse", () => {
    const a = queryEvents(s, { by: "time", before: 10, limit: 5 });
    expect(!a.ok && a.error.code).toBe("invalid");
    const b = queryEvents(s, { cursor: { t: "2026-08-01T12:00:00.000Z", seq: 3 }, limit: 5 });
    expect(!b.ok && b.error.code).toBe("invalid");
  });

  it("the newest-by-time page walks the time index and sorts nothing", () => {
    const plan = must(explainQuery(s, { by: "time", limit: 100 })).join(" | ");
    expect(plan).toMatch(/events_t/);
    expect(plan).not.toMatch(/TEMP B-TREE/);
  });
});

describe("countEvents", () => {
  it("counts the whole match, and each facet with its own filter left out", () => {
    const q = { type: ["verdict.keep"], source: ["forge"] };
    const c = must(countEvents(s, q));
    expect(c.total).toBe(all.filter((e) => e.type === "verdict.keep" && e.key?.startsWith("forge:")).length);
    // The type facet ignores type=verdict.keep but keeps source=forge.
    const forgeTypes: Record<string, number> = {};
    for (const e of all) if (e.key?.startsWith("forge:")) forgeTypes[e.type] = (forgeTypes[e.type] ?? 0) + 1;
    expect(facetMap(c, "type")).toEqual(forgeTypes);
    // The source facet ignores source=forge but keeps type=verdict.keep.
    const keepSources: Record<string, number> = {};
    for (const e of all) if (e.type === "verdict.keep" && e.key !== undefined) keepSources[e.key.split(":")[0] ?? ""] = (keepSources[e.key.split(":")[0] ?? ""] ?? 0) + 1;
    expect(facetMap(c, "source")).toEqual(keepSources);
    expect(c.head).toBe(all.length);
  });

  it("says how many rows have no value, and when a facet was cut", () => {
    const c = must(countEvents(s, {}));
    const lane = c.facets.find((f) => f.facet === "lane");
    expect(lane).toMatchObject({ values: [{ value: "gpu.local", n: 60 }], none: 300, truncated: false, other: 0 });
    const wide = tpl.fresh();
    must(wide.tx((t) => Array.from({ length: 60 }, (_, i) => append(t, { ...own(i), type: `kind-${String(i).padStart(2, "0")}.x` }))));
    const type = must(countEvents(wide, {})).facets.find((f) => f.facet === "type");
    expect(type).toMatchObject({ truncated: true, other: 10 });
    expect(type?.values).toHaveLength(50);
  });

  it("rows with no value never take one of the shown slots: 60 lanes beside many laneless rows is still cut", () => {
    const wide = tpl.fresh();
    must(wide.tx((t) => Array.from({ length: 60 }, (_, i) => append(t, { ...own(i), lane: `lane-${String(i).padStart(2, "0")}` }))));
    must(wide.tx((t) => Array.from({ length: 100 }, (_, i) => append(t, { ...own(i), lane: undefined }))));
    const lane = must(countEvents(wide, {})).facets.find((f) => f.facet === "lane");
    expect(lane).toMatchObject({ truncated: true, other: 10, none: 100 });
    expect(lane?.values).toHaveLength(50);
  });
});
