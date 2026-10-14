import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Event, EventInput } from "@gt/domain/event";
import { append, eventsMigrations } from "../src/events.ts";
import { eventsAfter, explainQuery, queryEvents, type EventQuery } from "../src/events-query.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

// The Ledger page's three commonest reads (docs/next/prototype/app/ledger.js):
// the newest page with no filter (the route's landing), the actor segment plus
// a type group facet (`actor=agent&type=job.*`), and a subject's history (the
// detail panel's "history" button) - plus the lane facet over a date window.
// At 50,000 events (10x a busy prototype ledger), timed and reported; §9.5
// gates counts, not timings, so the gate here is the query PLAN and the result.

const N = 50_000;
const TYPES = ["job.lease", "job.done", "job.fail", "candidate.mint", "verdict.keep", "verdict.reject", "commit", "publish.ok", "run.start", "metric.pull"] as const;
const KINDS = ["operator", "agent", "machine", "machine"] as const;
const LANES = ["gpu.local", "box.render", "box.chrome", "seat.text", "cloud.google", "channel.youtube", "channel.tiktok"] as const;

const pick = <T>(xs: readonly T[], i: number): T => {
  const x = xs[i % xs.length];
  if (x === undefined) throw new Error("empty list");
  return x;
};

function input(i: number): EventInput {
  const e: EventInput = {
    actor: { kind: pick(KINDS, i * 7), id: `${pick(KINDS, i * 7)}-${i % 5}` },
    type: pick(TYPES, i * 3),
    subject: { kind: "job", id: `j-${i % 2000}` },
    data: { i },
  };
  if (i % 3 !== 0) e.lane = pick(LANES, i);
  if (i % 4 === 0) e.cost = { usd: (i % 97) / 100, src: "real" };
  return e;
}

const tpl = templateStores([eventsMigrations], { clock: steppingClock("2026-10-01T00:00:00.000Z", 60_000) });
let s: Store;
let all: Event[] = [];
const report: string[] = [];

beforeAll(() => {
  s = tpl.fresh();
  const t0 = performance.now();
  for (let b = 0; b < N / 100; b++) {
    const batch = must(s.tx((t) => Array.from({ length: 100 }, (_, j) => append(t, input(b * 100 + j)))));
    all = all.concat(batch);
  }
  report.push(`append ${N} events in ${N / 100} transactions: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
}, 300_000);
afterAll(() => {
  console.log(`[ledger @ ${N}]\n  ${report.join("\n  ")}`);
  tpl.dispose();
});

/** The reference semantics: a plain filter over every event. */
function brute(q: EventQuery): Event[] {
  const prefix = (v: string | undefined, ps: readonly string[]): boolean =>
    v !== undefined && ps.some((p) => (p.endsWith(".*") ? v.startsWith(p.slice(0, -1)) : v === p));
  const rows = all.filter(
    (e) =>
      (q.actor?.kind === undefined || q.actor.kind.includes(e.actor.kind)) &&
      (q.type === undefined || prefix(e.type, q.type)) &&
      (q.lane === undefined || prefix(e.lane, q.lane)) &&
      (q.subject?.id === undefined || e.subject.id === q.subject.id) &&
      (q.since === undefined || e.at >= q.since) &&
      (q.until === undefined || e.at < q.until),
  );
  return q.order === "asc" ? rows : rows.reverse();
}

const COMMON: [string, EventQuery][] = [
  ["newest page", { limit: 100 }],
  ["actor + type group", { actor: { kind: ["agent"] }, type: ["job.*"], limit: 100 }],
  ["subject history", { subject: { id: "j-1234" }, limit: 100 }],
  ["lane + window", { lane: ["box.render"], since: "2026-10-01T03:00:00.000Z", until: "2026-10-01T05:00:00.000Z", limit: 100 }],
];

describe(`ledger query at ${N} events`, () => {
  it.each(COMMON)("%s returns what a full scan returns", (_name, q) => {
    const page = must(queryEvents(s, q));
    const want = brute(q);
    expect(page.events.map((e) => e.seq)).toEqual(want.slice(0, q.limit).map((e) => e.seq));
    expect(page.capped).toBe(want.length > q.limit);
    expect(page.head).toBe(N);
  });

  it.each(COMMON)("%s: p95 reported, served without a full-table scan", (name, q) => {
    const plan = must(explainQuery(s, q)).join(" | ");
    const ms: number[] = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      must(queryEvents(s, q));
      ms.push(performance.now() - t0);
    }
    ms.sort((a, b) => a - b);
    const p95 = ms[Math.floor(ms.length * 0.95)] ?? 0;
    report.push(`${name}: p50 ${(ms[30] ?? 0).toFixed(2)} ms, p95 ${p95.toFixed(2)} ms  [${plan}]`);
    // A filtered query walks an index; the unfiltered newest page walks the
    // rowid backwards and stops at the limit. Neither sorts the table.
    expect(plan).not.toMatch(/TEMP B-TREE/);
    if (name !== "newest page") expect(plan).toMatch(/USING (COVERING )?INDEX|USING INTEGER PRIMARY KEY/);
  });

  it("pages with `next` visit every match exactly once, in order", () => {
    const q: EventQuery = { type: ["verdict.*"], actor: { kind: ["operator", "agent"] }, limit: 500 };
    const seen: number[] = [];
    let before: number | undefined;
    for (;;) {
      const page = must(queryEvents(s, before === undefined ? q : { ...q, before }));
      seen.push(...page.events.map((e) => e.seq));
      if (page.next === undefined) break;
      before = page.next;
    }
    expect(seen).toEqual(brute(q).map((e) => e.seq));
  });

  it("the SSE cursor returns everything after a seq, oldest first, and nothing twice", () => {
    let cursor = N - 1234;
    const got: number[] = [];
    for (;;) {
      const page = must(eventsAfter(s, cursor, 500));
      got.push(...page.events.map((e) => e.seq));
      const last = page.events.at(-1);
      if (last === undefined) break;
      cursor = last.seq;
    }
    expect(got).toEqual(Array.from({ length: 1234 }, (_, i) => N - 1234 + 1 + i));
  });

  it("an empty page says whether the ledger is empty or nothing matched", () => {
    expect(must(queryEvents(s, { subject: { id: "no-such" }, limit: 10 }))).toEqual({ events: [], head: N, capped: false });
  });

  it("refuses a malformed query at the door", () => {
    const r = queryEvents(s, { type: ["job.*.*"], limit: 10 });
    expect(!r.ok && r.error.code).toBe("invalid");
    const big = queryEvents(s, { limit: 100_000 });
    expect(!big.ok && big.error.code).toBe("invalid");
  });
});
