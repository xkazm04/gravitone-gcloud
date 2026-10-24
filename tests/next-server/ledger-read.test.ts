import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ActorKind, EventInput } from "@gt/domain/event";
import { countEvents, facetMap } from "@gt/kernel/events-count";
import { append } from "@gt/kernel/events";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { EMPTY, type LedgerFilter } from "../../app/(studio)/ledger/_ledger/filter.ts";
import { PAGE, readFacets, readOne, readPage, readRelated, readStrip, SCAN } from "../../app/(studio)/ledger/_ledger/read.ts";

// The Ledger's reads over a real kernel store: what a page holds and how it continues,
// what the counts count, how the unindexed part is bounded and says so, and the lone-id
// lookup that makes a record's history complete at any age.

const open: Kernel[] = [];
afterEach(() => {
  for (const k of open.splice(0)) k.close();
});

function store(): Store {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  open.push(k.value);
  return k.value.store;
}

type Spec = { kind?: ActorKind; type?: string; subject?: string; run?: string; at: string; key?: string; note?: string; lane?: string; project?: string };

function fill(s: Store, specs: readonly Spec[]): void {
  const r = s.tx((t) => {
    for (const [i, x] of specs.entries()) {
      const input: EventInput = {
        actor: { kind: x.kind ?? "machine", id: x.kind ?? "forge" },
        type: x.type ?? "run.log",
        subject: { kind: "run", id: x.subject ?? "r1" },
        ...(x.lane === undefined ? {} : { lane: x.lane }),
        data: { ...(x.run === undefined ? {} : { runId: x.run }), ...(x.note === undefined ? {} : { note: x.note }), ...(x.project === undefined ? {} : { projectId: x.project }), src: "fixture" },
        occurredAt: x.at,
        atSrc: "recorded",
        key: x.key ?? `forge:${x.subject ?? "r1"}:f${i}`,
      };
      append(t, input);
    }
  });
  if (!r.ok) throw r.error;
}

const f = (over: Partial<LedgerFilter> = {}): LedgerFilter => ({ ...EMPTY, ...over });
const minute = (i: number): string => new Date(Date.parse("2026-10-01T00:00:00.000Z") + i * 60_000).toISOString();

describe("readPage", () => {
  it("pages in time order by keyset and the pages tile the match exactly", () => {
    const s = store();
    fill(s, Array.from({ length: PAGE + 7 }, (_, i) => ({ at: minute(i) })));
    const one = readPage(s, f());
    if (!one.ok) throw one.error;
    expect(one.value.events).toHaveLength(PAGE);
    expect(one.value.capped).toBe(true);
    expect(one.value.events[0]?.occurredAt).toBe(minute(PAGE + 6));
    const cursor = one.value.cursor;
    if (cursor === undefined) throw new Error("a capped page has a cursor");
    const two = readPage(s, f(), cursor);
    if (!two.ok) throw two.error;
    expect(two.value.events).toHaveLength(7);
    expect(two.value.capped).toBe(false);
    const seqs = [...one.value.events, ...two.value.events].map((e) => e.seq);
    expect(new Set(seqs).size).toBe(PAGE + 7);
  });

  it("orders by when it happened, not by when it was recorded", () => {
    const s = store();
    fill(s, [{ at: "2026-10-02T00:00:00.000Z" }, { at: "2026-09-01T00:00:00.000Z" }, { at: "2026-10-03T00:00:00.000Z" }]);
    const r = readPage(s, f({ order: "asc" }));
    if (!r.ok) throw r.error;
    expect(r.value.events.map((e) => e.seq)).toEqual([2, 1, 3]);
  });

  it("free text narrows the rows the indexed filter returns, and says how far it looked", () => {
    const s = store();
    fill(s, Array.from({ length: 30 }, (_, i) => ({ at: minute(i), note: i % 3 === 0 ? "lease lost on gpu" : "plate written" })));
    const r = readPage(s, f({ q: "lease" }));
    if (!r.ok) throw r.error;
    expect(r.value.events).toHaveLength(10);
    expect(r.value.events.every((e) => e.data["note"] === "lease lost on gpu")).toBe(true);
    expect(r.value.scanned).toBe(30);
    expect(r.value.exhausted).toBe(true);
  });

  it("stops a text scan at SCAN rows and continues after the last row it examined", () => {
    const s = store();
    fill(s, Array.from({ length: SCAN + 20 }, (_, i) => ({ at: minute(i), note: i < 5 ? "needle" : "hay" })));
    const r = readPage(s, f({ q: "needle" }));
    if (!r.ok) throw r.error;
    expect(r.value.events).toHaveLength(0);
    expect(r.value.scanned).toBe(SCAN);
    expect(r.value.exhausted).toBe(false);
    expect(r.value.capped).toBe(true);
    const cursor = r.value.cursor;
    if (cursor === undefined) throw new Error("a stopped scan has a cursor");
    const rest = readPage(s, f({ q: "needle" }), cursor);
    if (!rest.ok) throw rest.error;
    expect(rest.value.events).toHaveLength(5);
    expect(rest.value.exhausted).toBe(true);
  });

  it("answers a lone id from the index, complete at any age", () => {
    const s = store();
    // The run's own acts are the OLDEST rows, behind more than a scan's worth of others.
    fill(s, [
      { at: minute(0), subject: "Cycle-07", run: "Cycle-07" },
      { at: minute(1), subject: "Cycle-07/imp-1", run: "Cycle-07", type: "verdict.keep" },
      ...Array.from({ length: SCAN + 10 }, (_, i) => ({ at: minute(i + 2), subject: `other-${i}` })),
    ]);
    const r = readPage(s, f({ q: "Cycle-07" }));
    if (!r.ok) throw r.error;
    expect(r.value.byId).toBe(true);
    expect(r.value.events.map((e) => e.subject.id).sort()).toEqual(["Cycle-07", "Cycle-07/imp-1"]);
  });

  it("continues a lone-id page by the same index: page 2 answers the id, never a substring of it", () => {
    const s = store();
    // `r10` is a different record whose id CONTAINS `r1`; its acts are older than all of r1's.
    fill(s, [
      ...Array.from({ length: 20 }, (_, i) => ({ at: minute(i), subject: "r10" })),
      ...Array.from({ length: PAGE + 5 }, (_, i) => ({ at: minute(i + 20), subject: "r1" })),
    ]);
    const one = readPage(s, f({ q: "r1" }));
    if (!one.ok) throw one.error;
    expect(one.value.byId).toBe(true);
    expect(one.value.capped).toBe(true);
    if (one.value.cursor === undefined) throw new Error("a capped page carries its cursor");
    const two = readPage(s, f({ q: "r1" }), one.value.cursor);
    if (!two.ok) throw two.error;
    expect(two.value.byId).toBe(true);
    expect(two.value.events.map((e) => e.subject.id)).toEqual(Array.from({ length: 5 }, () => "r1"));
    expect(two.value.exhausted).toBe(true);
    expect(two.value.cursor).toBeUndefined();
    // A word that is no record's id still continues as the text scan it started as.
    const scan = readPage(s, f({ q: "r" }));
    if (!scan.ok) throw scan.error;
    expect(scan.value.byId).toBe(false);
  });

  it("applies every indexed facet in the store, not over the page", () => {
    const s = store();
    fill(s, [
      { at: minute(0), kind: "operator", type: "verdict.keep" },
      { at: minute(1), kind: "agent", type: "judge.pick" },
      { at: minute(2), kind: "machine", type: "run.end", lane: "gpu.local" },
    ]);
    const by = (over: Partial<LedgerFilter>): string[] => {
      const r = readPage(s, f(over));
      if (!r.ok) throw r.error;
      return r.value.events.map((e) => e.type);
    };
    expect(by({ actor: "agent" })).toEqual(["judge.pick"]);
    expect(by({ type: ["verdict"] })).toEqual(["verdict.keep"]);
    expect(by({ lane: ["gpu"] })).toEqual(["run.end"]);
    expect(by({ src: ["forge"] })).toHaveLength(3);
    expect(by({ src: ["dojo"] })).toHaveLength(0);
    expect(by({ from: "2026-10-01", to: "2026-10-01" })).toHaveLength(3);
    expect(by({ from: "2026-10-02", to: "2026-10-02" })).toHaveLength(0);
  });
});

describe("readFacets", () => {
  it("is countEvents over the same filter: each facet with its own filter left out", () => {
    const s = store();
    fill(s, [
      { at: minute(0), kind: "operator", type: "verdict.keep" },
      { at: minute(1), kind: "operator", type: "verdict.reject" },
      { at: minute(2), kind: "agent", type: "judge.pick" },
      { at: minute(3), kind: "machine", type: "run.end" },
    ]);
    const r = readFacets(s, f({ actor: "operator" }));
    if (!r.ok) throw r.error;
    expect(r.value.total).toBe(2);
    // The actor facet ignores the actor filter: All counts every kind.
    expect(r.value.actor).toEqual({ operator: 2, agent: 1, machine: 1, all: 4 });
    const direct = countEvents(s, { actor: { kind: ["operator"] } });
    if (!direct.ok) throw direct.error;
    expect(facetMap(direct.value, "type")).toEqual(Object.fromEntries(r.value.type.values.map((v) => [v.value, v.n])));
    expect(r.value.head).toBe(4);
  });

  it("counts each project the filter holds on its own - one or several", () => {
    const s = store();
    fill(s, [
      { at: minute(0), project: "p1" },
      { at: minute(1), project: "p1" },
      { at: minute(2), project: "p2" },
      { at: minute(3), project: "p3" },
    ]);
    const two = readFacets(s, f({ project: ["p1", "p2"] }));
    if (!two.ok) throw two.error;
    expect(two.value.project).toEqual({ p1: 2, p2: 1 });
    const one = readFacets(s, f({ project: ["p1"] }));
    if (!one.ok) throw one.error;
    expect(one.value.project).toEqual({ p1: 2 });
    const none = readFacets(s, f());
    if (!none.ok) throw none.error;
    expect(none.value.project).toEqual({});
  });
});

describe("readStrip", () => {
  it("counts each day by actor kind under the filter minus its range, empty after today", () => {
    const s = store();
    fill(s, [
      { at: "2026-10-14T09:00:00.000Z", kind: "operator" },
      { at: "2026-10-14T10:00:00.000Z", kind: "machine" },
      { at: "2026-10-15T01:00:00.000Z", kind: "agent" },
    ]);
    const now = Date.parse("2026-10-15T12:00:00.000Z");
    const r = readStrip(s, f({ from: "2026-10-14", to: "2026-10-14" }), now);
    if (!r.ok) throw r.error;
    expect(r.value.today).toBe("2026-10-15");
    const day = (d: string) => r.value.days.find((x) => x.day === d);
    expect(day("2026-10-14")).toEqual({ day: "2026-10-14", operator: 1, agent: 0, machine: 1 });
    expect(day("2026-10-15")).toEqual({ day: "2026-10-15", operator: 0, agent: 1, machine: 0 });
    expect(r.value.days.at(-1)?.day).toBe("2026-10-29");
    const actorOnly = readStrip(s, f({ actor: "machine" }), now);
    if (!actorOnly.ok) throw actorOnly.error;
    expect(actorOnly.value.days.find((x) => x.day === "2026-10-14")).toEqual({ day: "2026-10-14", operator: 0, agent: 0, machine: 1 });
    // Two kinds by token: the bars hold those two, never the kind the list leaves out.
    const two = readStrip(s, f({ q: "actor:agent,machine" }), now);
    if (!two.ok) throw two.error;
    expect(two.value.days.find((x) => x.day === "2026-10-14")).toEqual({ day: "2026-10-14", operator: 0, agent: 0, machine: 1 });
    expect(two.value.days.find((x) => x.day === "2026-10-15")).toEqual({ day: "2026-10-15", operator: 0, agent: 1, machine: 0 });
  });
});

describe("readOne and readRelated", () => {
  it("finds an act by seq and counts its subject and run exactly, itself excluded", () => {
    const s = store();
    fill(s, [
      { at: minute(0), subject: "r1", run: "r1" },
      { at: minute(1), subject: "r1/c1", run: "r1" },
      { at: minute(2), subject: "r1", run: "r1" },
      { at: minute(3), subject: "r2", run: "r2" },
    ]);
    const one = readOne(s, 2);
    if (!one.ok || one.value === null) throw new Error("seq 2 exists");
    expect(one.value.subject.id).toBe("r1/c1");
    const missing = readOne(s, 99);
    expect(missing.ok && missing.value).toBe(null);
    const r = readRelated(s, one.value);
    if (!r.ok) throw r.error;
    expect(r.value.total).toBe(2);
    expect(r.value.bySubject).toBe(0);
    expect(r.value.events.map((e) => e.seq).sort()).toEqual([1, 3]);
  });
});
