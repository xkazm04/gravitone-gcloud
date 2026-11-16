import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ActorKind } from "@gt/domain/event";
import { countEvents } from "@gt/kernel/events-count";
import { append } from "@gt/kernel/events";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import { DAY_MS, daysBetween, dayKey, type DayCount } from "@gt/ui/components/timestrip/strip.ts";

import { EMPTY, splitFilter, type LedgerFilter } from "../../app/(studio)/ledger/_ledger/filter.ts";
import { readStrip, STRIP_AHEAD, STRIP_PAST } from "../../app/(studio)/ledger/_ledger/read.ts";

// THE LEDGER STRIP, ONE GROUPED QUERY (events-count.ts countByDay) against the loop it replaced:
// one countEvents per day over that day's half-open UTC window. The loop is kept here, verbatim
// from the read.ts it left, as the oracle; the store holds rows exactly ON the day edges (00:00:00.000
// and 23:59:59.999), on the window's first and last instants and just outside both, so a bucketing
// that differs from the old window by one millisecond or one day shows as a differing bar.

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

/** The pre-2026-11 readStrip, unchanged: the oracle. */
function oldStrip(s: Store, f: LedgerFilter, nowMs: number): DayCount[] {
  const today = dayKey(nowMs);
  const { kernel } = splitFilter({ ...f, from: null, to: null });
  const days = daysBetween(dayKey(nowMs - (STRIP_PAST - 1) * DAY_MS), dayKey(nowMs + STRIP_AHEAD * DAY_MS));
  const held = kernel.actor?.kind;
  const out: DayCount[] = [];
  for (const day of days) {
    if (day > today) {
      out.push({ day, operator: 0, agent: 0, machine: 0 });
      continue;
    }
    const since = `${day}T00:00:00.000Z`;
    const until = new Date(Date.parse(since) + DAY_MS).toISOString();
    const c = countEvents(s, { ...kernel, since, until }, ["actorKind"]);
    if (!c.ok) throw c.error;
    const kinds = c.value.facets.find((x) => x.facet === "actorKind");
    const n = (k: ActorKind): number => (held !== undefined && !held.includes(k) ? 0 : (kinds?.values.find((v) => v.value === k)?.n ?? 0));
    out.push({ day, operator: n("operator"), agent: n("agent"), machine: n("machine") });
  }
  return out;
}

const NOW = Date.parse("2026-11-09T13:37:00.000Z");
const KINDS: readonly ActorKind[] = ["operator", "agent", "machine"];
const TYPES = ["run.start", "run.end", "verdict.keep"] as const;

/** Instants on and around every edge the strip has. */
function edges(): string[] {
  const first = Date.parse(`${dayKey(NOW - (STRIP_PAST - 1) * DAY_MS)}T00:00:00.000Z`);
  const todayStart = Date.parse(`${dayKey(NOW)}T00:00:00.000Z`);
  const out: number[] = [first - 1, first, first + 1, todayStart - 1, todayStart, NOW, todayStart + DAY_MS - 1, todayStart + DAY_MS, todayStart + 3 * DAY_MS];
  // Every day of the window: its first and last millisecond, and its noon.
  for (let t = first; t < todayStart + DAY_MS; t += DAY_MS) out.push(t, t + DAY_MS - 1, t + DAY_MS / 2);
  return out.map((ms) => new Date(ms).toISOString());
}

function fill(s: Store): number {
  const at = edges();
  const r = s.tx((t) => {
    at.forEach((iso, i) => {
      append(t, {
        actor: { kind: KINDS[i % 3] ?? "machine", id: `a${i % 3}` },
        type: TYPES[i % TYPES.length] ?? "run.start",
        subject: { kind: "run", id: `r${i % 5}` },
        data: { runId: `r${i % 5}` },
        occurredAt: iso,
        atSrc: "recorded",
        key: `fixture:e${i}:x`,
      });
    });
  });
  if (!r.ok) throw r.error;
  return at.length;
}

const f = (over: Partial<LedgerFilter> = {}): LedgerFilter => ({ ...EMPTY, ...over });

describe("readStrip, one grouped query", () => {
  const filters: readonly [string, LedgerFilter][] = [
    ["no filter", f()],
    ["an actor kind held", f({ actor: "operator" })],
    ["a type", f({ type: ["run.start"] })],
    ["a type group", f({ type: ["run.*"] })],
    ["a date range (ignored by the strip)", f({ from: "2026-10-01", to: "2026-10-03" })],
  ];

  for (const [name, filter] of filters) {
    it(`equals the per-day loop on day edges: ${name}`, () => {
      const s = store();
      fill(s);
      const grouped = readStrip(s, filter, NOW);
      if (!grouped.ok) throw grouped.error;
      expect(grouped.value.today).toBe(dayKey(NOW));
      expect(grouped.value.days).toEqual(oldStrip(s, filter, NOW));
    });
  }

  it("counts the edges where they belong: a day's first and last millisecond are in it, the next day's first is not", () => {
    const s = store();
    fill(s);
    const r = readStrip(s, f(), NOW);
    if (!r.ok) throw r.error;
    const days = r.value.days;
    const total = (d: DayCount | undefined): number => (d === undefined ? -1 : d.operator + d.agent + d.machine);
    expect(days).toHaveLength(STRIP_PAST + STRIP_AHEAD);
    // The first window day: its own three (start, noon, end) + the two edge rows on/after its start.
    expect(total(days[0])).toBe(5);
    // Today: start, noon, end, NOW, the -1 edge belongs to yesterday, and +DAY_MS to tomorrow.
    expect(total(days[STRIP_PAST - 1])).toBe(3 + 3);
    // Tomorrow and later are drawn empty even though rows exist there.
    expect(days.slice(STRIP_PAST).every((d) => total(d) === 0)).toBe(true);
  });

  it("is an empty strip, every day zero, over an empty ledger", () => {
    const r = readStrip(store(), f(), NOW);
    if (!r.ok) throw r.error;
    expect(r.value.days.every((d) => d.operator + d.agent + d.machine === 0)).toBe(true);
  });
});
