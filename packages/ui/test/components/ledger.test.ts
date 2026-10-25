// The Ledger's parts (Phase 2, lot 16): the strip's geometry, the JSON scanner, the money
// format, and what each new or extended component exposes - rendered with react-dom/server
// (Vitest runs without a DOM; the strip's drag is driven live in tests/live/ledger).
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Button } from "../../src/components/button/Button.tsx";
import { EventRow, type EventRowProps } from "../../src/components/eventrow/EventRow.tsx";
import { usd } from "../../src/components/eventrow/usd.ts";
import { FacetRow } from "../../src/components/facet/FacetRow.tsx";
import facet from "../../src/components/facet/FacetRow.module.css";
import { jsonRuns } from "../../src/components/jsonl/highlight.ts";
import { JsonBlock, JsonLine } from "../../src/components/jsonl/Json.tsx";
import { Seg } from "../../src/components/seg/Seg.tsx";
import seg from "../../src/components/seg/Seg.module.css";
import { SourceTag } from "../../src/components/source/SourceTag.tsx";
import { StaleBadge, type StaleBadgeProps } from "../../src/components/stalebadge/StaleBadge.tsx";
import { BAR_MAX, bars, daysBetween, dragRange, MIN_BAR, nowAt, slotAt, ticks, type DayCount } from "../../src/components/timestrip/strip.ts";
import { restingReadout, type TimeStripProps } from "../../src/components/timestrip/TimeStrip.tsx";
import { Toggle } from "../../src/components/toggle/Toggle.tsx";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);
const noop = (): void => {};
const day = (d: string, operator: number, agent: number, machine: number): DayCount => ({ day: d, operator, agent, machine });

describe("time strip geometry", () => {
  test("a bar is √n of the busiest day's height, and a day with one act is never shorter than MIN_BAR", () => {
    // 40000 on the busiest day: one act is 56/200 = 0.28 px raw, so only the floor keeps it visible.
    const b = bars([day("2026-10-01", 0, 0, 40000), day("2026-10-02", 0, 0, 10000), day("2026-10-03", 1, 0, 0), day("2026-10-04", 0, 0, 0)], { today: "2026-10-04", range: null });
    expect(b.map((x) => x.px)).toEqual([BAR_MAX, BAR_MAX / 2, MIN_BAR, 0]);
  });

  test("segments stack machine, agent, operator from the floor, each at least 1 px when present", () => {
    const [b] = bars([day("2026-10-01", 1, 2, 997)], { today: "2026-10-01", range: null });
    expect(b?.segments.map((s) => s.kind)).toEqual(["machine", "agent", "operator"]);
    expect(Math.min(...(b?.segments.map((s) => s.px) ?? []))).toBeGreaterThanOrEqual(1);
  });

  test("a bar's segments stack to the bar's own height: the 1 px floors come out of the largest kind", () => {
    // The busiest day (56 px) and a quiet one (6 px), each with two minority kinds under 1 px raw.
    const drawn = bars([day("2026-10-01", 1, 2, 997), day("2026-10-02", 1, 1, 98), day("2026-10-03", 0, 0, 0)], { today: "2026-10-03", range: null });
    for (const b of drawn) {
      expect(b.segments.reduce((a, g) => a + g.px, 0)).toBeCloseTo(b.px, 6);
      for (const g of b.segments) expect(g.px).toBeGreaterThanOrEqual(1);
    }
    expect(drawn[0]?.px).toBe(BAR_MAX);
  });

  test("days after today are future; a range dims every day outside it", () => {
    const b = bars([day("2026-10-01", 1, 0, 0), day("2026-10-02", 1, 0, 0), day("2026-10-03", 0, 0, 0)], { today: "2026-10-02", range: { from: "2026-10-02", to: "2026-10-02" } });
    expect(b.map((x) => [x.future, x.inRange, x.dim])).toEqual([
      [false, false, true],
      [false, true, false],
      [true, false, true],
    ]);
  });

  test("every day between two dates, inclusive, across a month end", () => {
    expect(daysBetween("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(daysBetween("2026-10-02", "2026-10-01")).toEqual([]);
  });

  test("ticks: a month on its first day, Mondays between the 4th and the 28th", () => {
    const t = ticks(daysBetween("2026-09-28", "2026-10-13"));
    expect(t.map((x) => x.label)).toEqual(["28", "OCT", "05", "12"]);
    expect(t.map((x) => x.month)).toEqual([false, true, false, false]);
  });

  test("NOW is placed across the strip, and outside it is null", () => {
    const d = daysBetween("2026-10-01", "2026-10-04");
    expect(nowAt(d, Date.parse("2026-10-03T00:00:00.000Z"))).toBe(0.5);
    expect(nowAt(d, Date.parse("2026-11-01T00:00:00.000Z"))).toBeNull();
  });

  test("a drag sets the range between its ends; a click on the whole range clears it", () => {
    const d = daysBetween("2026-10-01", "2026-10-05");
    expect(slotAt(0.99, 5)).toBe(4);
    expect(slotAt(-1, 5)).toBe(0);
    expect(dragRange(d, 3, 1, null)).toEqual({ from: "2026-10-02", to: "2026-10-04" });
    expect(dragRange(d, 2, 2, { from: "2026-10-03", to: "2026-10-03" })).toBeNull();
    expect(dragRange(d, 2, 2, { from: "2026-10-01", to: "2026-10-03" })).toEqual({ from: "2026-10-03", to: "2026-10-03" });
  });

  test("the readout names the range and its count, else the span", () => {
    const d = daysBetween("2026-10-01", "2026-10-05");
    expect(restingReadout(d, { from: "2026-10-02", to: "2026-10-03" }, 41)).toEqual(["02 Oct → 03 Oct", "41 events"]);
    expect(restingReadout(d, null, undefined)).toEqual(["01 Oct → 05 Oct", "5 days"]);
  });

  test("the readout counts one event and one day in the singular", () => {
    expect(restingReadout(daysBetween("2026-10-01", "2026-10-05"), { from: "2026-10-02", to: "2026-10-02" }, 1)).toEqual(["02 Oct", "1 event"]);
    expect(restingReadout(["2026-10-01"], null, undefined)).toEqual(["01 Oct", "1 day"]);
  });
});

describe("JSON runs", () => {
  test("every character lands in exactly one run, so the runs re-joined are the input", () => {
    const text = JSON.stringify({ seq: 7, type: "run.end", data: { error: 'CUDA "oom" \\ 2.00 GiB', n: -1.5e3, ok: true, none: null, list: [1, "a"] } }, null, 2);
    expect(
      jsonRuns(text)
        .map((r) => r.text)
        .join(""),
    ).toBe(text);
  });

  test("a string before a colon is a key, after it a value; numbers and literals are their own kinds", () => {
    const runs = jsonRuns('{"type":"commit","n":-2,"ok":false}').filter((r) => r.kind !== "punct");
    expect(runs.map((r) => [r.kind, r.text])).toEqual([
      ["key", '"type"'],
      ["str", '"commit"'],
      ["key", '"n"'],
      ["num", "-2"],
      ["key", '"ok"'],
      ["lit", "false"],
    ]);
  });

  test("a value that looks like markup is text, never markup", () => {
    const out = html(h(JsonBlock, { text: JSON.stringify({ note: "<script>x</script>" }), label: "event" }));
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  test("a JSON line is a selectable row with its number hidden from speech", () => {
    const out = html(h(JsonLine, { n: 12, text: "{}", selected: true, index: 3, onSelect: noop }));
    expect(out).toMatch(/^<div[^>]*role="row" aria-rowindex="3" aria-selected="true"/);
    expect(out).toMatch(/aria-hidden="true">12<\/span>/);
  });
});

describe("money", () => {
  test.each([
    [0, "$0"],
    [0.42, "$0.42"],
    [1.234, "$1.23"],
    [47, "$47"],
    [-0.5, "-$0.50"],
  ])("%s reads %s", (n, s) => expect(usd(n)).toBe(s));

  test("a figure is spelled by its cents: one amount has one spelling either side of $1 and $10", () => {
    expect(usd(9.996)).toBe(usd(10));
    expect(usd(0.996)).toBe(usd(1));
    expect(usd(0.004)).toBe(usd(0));
    expect(usd(-0.004)).toBe(usd(0));
    for (const n of [0.004, 0.005, 0.994, 0.999, 1.004, 9.994, 9.995, 9.999, 10.004, 47.5, -9.999]) expect(usd(n)).toBe(usd(Math.round(n * 100) / 100));
  });
});

const row = (over: Partial<EventRowProps> = {}): EventRowProps => ({
  seq: 513,
  time: "08-26 12:04",
  derived: false,
  actor: { kind: "operator", id: "operator" },
  type: "verdict.keep",
  tone: "emerald",
  subject: { kind: "candidate", label: "s03", href: "/foundry" },
  source: "forge",
  selected: false,
  index: 1,
  onSelect: noop,
  onOpen: noop,
  ...over,
});

describe("EventRow", () => {
  test("a row of gridcells whose one link is the subject", () => {
    const out = html(h(EventRow, row()));
    expect(out).toMatch(/^<div[^>]*role="row" aria-rowindex="1" aria-selected="false"/);
    expect((out.match(/role="gridcell"/g) ?? []).length).toBe(7);
    expect((out.match(/<a /g) ?? []).length).toBe(1);
    expect(out).toContain('href="/foundry"');
  });

  test("a derived time says so in words; a recorded one does not", () => {
    expect(html(h(EventRow, row({ derived: true })))).toContain("derived time");
    expect(html(h(EventRow, row()))).not.toContain("derived time");
  });

  test("a cost carries its source unless it is a receipt; no cost is spoken as such", () => {
    expect(html(h(EventRow, row({ cost: { usd: 0.42, src: "model" } })))).toMatch(/\$0\.42<sup aria-label="model">est<\/sup>/);
    expect(html(h(EventRow, row({ cost: { usd: 1.2, src: "real" } })))).not.toContain("<sup");
    expect(html(h(EventRow, row()))).toContain("no cost");
  });

  test("the error trails the subject verbatim, and the column names the store", () => {
    const out = html(h(EventRow, row({ trail: { text: "CUDA out of memory", error: true } })));
    expect(out).toContain("CUDA out of memory");
    expect(out).toContain(">forge</span>");
  });
});

describe("StaleBadge", () => {
  test("live draws nothing; stale and down draw the word and the coarse age", () => {
    expect(html(h(StaleBadge, { edge: "live", ageMs: 1000, feed: "ledger feed" }))).toBe("");
    const stale = html(h(StaleBadge, { edge: "stale", ageMs: 42_000, feed: "ledger feed" }));
    expect(stale).toContain("stale");
    expect(stale).toContain("42 s");
    expect(stale).toContain('aria-label="ledger feed stale, 42 s old"');
    expect(html(h(StaleBadge, { edge: "down", feed: "ledger feed" }))).toContain("offline");
  });
});

describe("the Ledger's additions to existing controls", () => {
  test("a Seg option carries a glyph, an actor accent and a count that is part of its name", () => {
    const out = html(h(Seg<"all" | "agent">, { label: "actor", value: "agent", onChange: noop, options: [{ value: "all", label: "All", count: 9 }, { value: "agent", label: "Agent", glyph: "agent", accent: "agent", count: 3 }] }));
    expect(out).toContain(`class="${seg.opt} ${seg.agent}" aria-pressed="true"`);
    expect(out).toContain("<svg");
    expect(out).toContain(", 3");
  });

  test("a Toggle shows its count only when something is on, and controls what it names", () => {
    expect(html(h(Toggle, { label: "facets", on: false, onToggle: noop, count: 0 }))).not.toContain("</b>");
    const on = html(h(Toggle, { label: "facets", on: true, onToggle: noop, count: 2, glyph: "grid", controls: "lg-facets" }));
    expect(on).toContain('aria-controls="lg-facets"');
    expect(on).toContain('aria-expanded="true"');
    expect(on).toContain(">2</b>");
    expect(html(h(Toggle, { label: "detail", on: false, onToggle: noop, shortcut: { mode: "library", verb: "detail" } }))).toMatch(/<kbd[^>]*>\]<\/kbd>/);
  });

  test("a SourceTag carries its figure inside the same tag", () => {
    expect(html(h(SourceTag, { kind: "model", value: "$417" }))).toMatch(/>model \$417<\/span>$/);
    expect(html(h(SourceTag, { kind: "model" }))).toMatch(/>model<\/span>$/);
  });

  test("a Button carries a stamp and a trailing glyph after its label", () => {
    const out = html(h(Button, { label: "history", tally: { value: 9 }, glyphAfter: "chevR" }));
    expect(out.indexOf("history")).toBeLessThan(out.indexOf(">9<"));
    expect(out.indexOf(">9<")).toBeLessThan(out.lastIndexOf("<svg"));
  });

  test("a nested FacetRow is indented with its tone; a plain one is not", () => {
    expect(html(h(FacetRow, { label: "verdict.keep", count: 3, pressed: false, onToggle: noop, mark: "rail", nested: { tone: "emerald" } }))).toContain(`${facet.tone} ${facet.emerald}`);
    expect(html(h(FacetRow, { label: "verdict", count: 3, pressed: false, onToggle: noop, mark: "rail" }))).not.toContain(facet.nested ?? "never");
  });
});

/** The names a paragraph arrives under (law.test.ts's list, held for the Ledger's props too). */
type ParagraphSlot = "sub" | "subtitle" | "blurb" | "description" | "caption" | "help" | "helpText" | "note" | "body" | "prose";
type Slots<P> = Extract<keyof P, ParagraphSlot>;

describe("no Ledger part accepts a paragraph slot", () => {
  test("type level", () => {
    expectTypeOf<Slots<EventRowProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<TimeStripProps>>().toEqualTypeOf<never>();
    expectTypeOf<Slots<StaleBadgeProps>>().toEqualTypeOf<never>();
  });
});
