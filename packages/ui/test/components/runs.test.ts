// The Runs day-line: packing, the shared geometry, the axis, windowing, and what a selection
// lights. Pure functions over literal bars; the component's markup through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { LANE_CAPACITY, RESOURCE_LANES } from "@gt/domain/lane";

import { GEOMETRY, HOUR_MS, anchors, barBox, inWindow, nights, pack, rowHeight, seatLabels, ticks, visibleTracks, xAt, type Timed } from "../../src/components/runs/dayline.ts";
import { LANE_ORDER, LANE_SPECS } from "../../src/components/runs/lanes.ts";
import { RunsDayline, type DaylineBar, type DaylineRow } from "../../src/components/runs/RunsDayline.tsx";
import dl from "../../src/components/runs/RunsDayline.module.css";
import { ResourceSummary } from "../../src/components/runs/ResourceSummary.tsx";
import { blockedBy, downstreamOf, light, upstreamOf, type Dep } from "../../src/components/runs/thread.ts";

const T0 = Date.UTC(2026, 9, 15, 0, 0);
const at = (hours: number): number => T0 + hours * HOUR_MS;
const span = { from: T0, to: at(48) };
const x66 = (t: number): number => xAt(span, 66, t);
const bar = (id: string, s: number, e: number): Timed => ({ id, s: at(s), e: at(e) });

describe("pack", () => {
  test("overlapping bars stack into sub-tracks; disjoint ones share a track", () => {
    const p = pack([bar("a", 1, 3), bar("b", 2, 4), bar("c", 5, 6)], x66, { cap: 3, open: false });
    const track = new Map(p.placed.map((q) => [q.id, q.track]));
    expect(track.get("a")).toBe(0);
    expect(track.get("b")).toBe(1);
    expect(track.get("c")).toBe(0);
    expect(p.tracks).toBe(2);
  });

  test("footprints are in SCREEN space: a 1-minute bar still occupies its minimum width plus the gap", () => {
    const tiny = (id: string, m: number): Timed => ({ id, s: T0 + m * 60_000, e: T0 + m * 60_000 + 60_000 });
    // 66 px/h: two minutes apart is 2.2 px - far inside the 8 px minimum, so they must stack.
    const p = pack([tiny("a", 0), tiny("b", 2)], x66, { cap: 3, open: false });
    expect(new Set(p.placed.map((q) => q.track)).size).toBe(2);
    expect(p.placed.every((q) => q.w >= GEOMETRY.barMin)).toBe(true);
  });

  test("a lane shows its capacity in tracks (two when it runs one at a time); the rest is the +N", () => {
    expect(visibleTracks(1)).toBe(2);
    expect(visibleTracks(4)).toBe(4);
    const four = [bar("a", 1, 9), bar("b", 1, 9), bar("c", 1, 9), bar("d", 1, 9)];
    const shut = pack(four, x66, { cap: 1, open: false });
    expect(shut.shown).toBe(2);
    expect(shut.over).toHaveLength(2);
    const open = pack(four, x66, { cap: 1, open: true });
    expect(open.shown).toBe(4);
    expect(open.over).toHaveLength(2);
  });

  test("the selection packs first, so it is never the bar hidden behind +N", () => {
    const four = [bar("a", 1, 9), bar("b", 1, 9), bar("c", 1, 9), bar("pick", 2, 9)];
    const p = pack(four, x66, { cap: 1, open: false, prio: (id) => (id === "pick" ? 3 : 0) });
    expect(p.over).not.toContain("pick");
    expect(p.placed.find((q) => q.id === "pick")?.track).toBe(0);
  });
});

describe("one geometry for bars and links", () => {
  test("a link leaves the right edge and enters the left edge of the very box the bar is drawn in", () => {
    const p = pack([bar("a", 1, 3), bar("b", 2, 4)], x66, { cap: 2, open: false });
    const b = p.placed.find((q) => q.id === "b");
    if (b === undefined) throw new Error("b not placed");
    const box = barBox(b);
    expect(box.top).toBe(GEOMETRY.rowPad + GEOMETRY.trackH + GEOMETRY.trackGap);
    const a = anchors(box, 100);
    expect(a.in).toEqual({ x: box.left, y: 100 + box.top + box.height / 2 });
    expect(a.out.x).toBe(box.left + box.width);
  });

  test("rows grow with the tracks they draw, from the prototype's 58 px floor", () => {
    expect(rowHeight(1)).toBe(58);
    expect(rowHeight(4)).toBe(4 * 34 + 12);
  });
});

describe("the axis", () => {
  test("hourly ticks at 66 px/h, three-hourly at 24, six-hourly at 11; midnight names its day in UTC", () => {
    expect(ticks(span, 66)).toHaveLength(49);
    expect(ticks(span, 24)).toHaveLength(17);
    expect(ticks(span, 11)).toHaveLength(9);
    const mid = ticks(span, 66).find((t) => t.at === at(24));
    expect(mid?.day).toBe("Fri 16 Oct");
    expect(mid?.label).toBe("00:00");
  });

  test("night bands run 22:00 to 06:00 UTC, clipped to the span", () => {
    const n = nights(span, 66);
    // The night before T0 shows its last six hours; then the 22:00 band of each of the two days.
    expect(n.map((b) => Math.round(b.w / 66))).toEqual([6, 8, 2]);
    expect(n[1]?.x).toBeCloseTo(x66(at(22)));
  });
});

test("windowing keeps exactly the bars that intersect the window", () => {
  const placed = [
    { id: "left", l: 0, w: 50 },
    { id: "edge", l: 90, w: 20 },
    { id: "in", l: 200, w: 10 },
    { id: "right", l: 500, w: 10 },
  ];
  expect(inWindow(placed, 100, 300).map((p) => p.id)).toEqual(["edge", "in"]);
});

test("labels sit inside when they fit, beside when the track is free, else on hover", () => {
  const seats = seatLabels(
    [
      { id: "wide", track: 0, l: 0, w: 200 },
      { id: "narrow", track: 0, l: 300, w: 10 },
      { id: "crowded", track: 1, l: 0, w: 10 },
      { id: "next", track: 1, l: 20, w: 10 },
    ],
    () => 60,
  );
  expect(seats.get("wide")).toBe("in");
  expect(seats.get("narrow")).toBe("beside");
  expect(seats.get("crowded")).toBe("hover");
});

describe("what a selection lights", () => {
  // research -> script -> frames -> cut ; score -> cut ; cut -> slot
  const deps: Dep[] = [
    { from: "research", to: "script" },
    { from: "script", to: "frames" },
    { from: "frames", to: "cut" },
    { from: "score", to: "cut" },
    { from: "cut", to: "slot" },
  ];

  test("upstream and downstream are transitive, and a cycle in the records ends the walk", () => {
    expect([...upstreamOf("cut", deps)].sort()).toEqual(["frames", "research", "score", "script"]);
    expect([...downstreamOf("script", deps)].sort()).toEqual(["cut", "frames", "slot"]);
    const loop: Dep[] = [{ from: "a", to: "b" }, { from: "b", to: "a" }];
    expect([...upstreamOf("a", loop)]).toEqual(["b"]);
  });

  test("selecting a job lights its chains: upstream edges cyan, downstream amber, the rest of the world dims", () => {
    const lit = light({ job: "frames" }, deps, new Set());
    expect(lit).not.toBeNull();
    expect([...(lit?.ids ?? [])].sort()).toEqual(["cut", "frames", "research", "script", "slot"]);
    const tone = new Map(lit?.links.map((l) => [`${l.from}>${l.to}`, l.tone]));
    expect(tone.get("research>script")).toBe("up");
    expect(tone.get("script>frames")).toBe("up");
    expect(tone.get("frames>cut")).toBe("down");
    expect(tone.get("cut>slot")).toBe("down");
    // score feeds cut but is on neither of frames' chains: not lit, so its edge is not drawn.
    expect(tone.has("score>cut")).toBe(false);
  });

  test("an edge into a blocked job is drawn bad; the block is the failed direct dependency", () => {
    const failed = new Set(["frames"]);
    expect(blockedBy("cut", deps, (id) => failed.has(id))).toBe("frames");
    expect(blockedBy("script", deps, (id) => failed.has(id))).toBeNull();
    const lit = light({ job: "cut" }, deps, new Set(["cut"]));
    expect(lit?.links.filter((l) => l.to === "cut").every((l) => l.bad)).toBe(true);
    expect(lit?.links.find((l) => l.from === "cut")?.bad).toBe(false);
  });

  test("a job with no recorded dependency lights alone and draws no link; nothing selected lights nothing", () => {
    const lit = light({ job: "solo" }, deps, new Set());
    expect([...(lit?.ids ?? [])]).toEqual(["solo"]);
    expect(lit?.links).toEqual([]);
    expect(light({ job: null }, deps, new Set())).toBeNull();
  });

  test("a project lights its members, its internal edges at rest", () => {
    const lit = light({ members: new Set(["script", "frames"]) }, deps, new Set());
    expect(lit?.links).toEqual([{ from: "script", to: "frames", tone: "rest", bad: false }]);
  });
});

test("every resource lane of the domain has a row: label, capacity and engines", () => {
  for (const lane of RESOURCE_LANES) {
    expect(LANE_SPECS[lane].label.length, lane).toBeGreaterThan(0);
    // The row packs exactly the slots the lease grants (it once drew Qwen at 2 against a lease of 1).
    expect(LANE_SPECS[lane].cap, lane).toBe(LANE_CAPACITY[lane]);
  }
  expect(Object.keys(LANE_SPECS).sort()).toEqual([...RESOURCE_LANES].sort());
  expect(LANE_ORDER).toEqual(RESOURCE_LANES);
});

describe("RunsDayline markup", () => {
  const rows: DaylineRow[] = [
    { id: "gpu.local", label: "GPU box", engines: "flux", cap: 1, kind: "local", held: { share: 1, name: "1 of 1 held" } },
    { id: "weir", label: "Weir · operator", engines: "verdicts", cap: 1, kind: "weir" },
  ];
  const b = (id: string, row: string, s: number, e: number): DaylineBar => ({ id, row, s: at(s), e: at(e), look: "running", label: id, name: `${row} ${id} running` });
  const html = renderToStaticMarkup(
    h(RunsDayline, {
      name: "Runs, 4 jobs",
      rows,
      bars: [b("one", "gpu.local", 1, 9), b("two", "gpu.local", 1, 9), b("three", "gpu.local", 1, 9), { ...b("pile", "weir", 2, 2), mark: "gate", look: "awaiting" }],
      pins: [],
      span,
      zoom: "24h",
      now: at(10),
      selected: null,
      lit: null,
      open: new Set<string>(),
      onSelect: () => {},
      onToggleRow: () => {},
      centre: { key: "k", at: "now" },
    }),
  );

  test("one row per lane, the region named with the real total, NOW drawn", () => {
    expect((html.match(/data-row="/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-label="Runs, 4 jobs"');
    expect(html).toContain("NOW 10:00");
  });

  test("a third job on a one-at-a-time lane goes behind a +1 that names what it hides", () => {
    expect(html).toContain('aria-label="1 more on GPU box, show"');
    expect((html.match(/data-bar="/g) ?? []).length).toBe(3);
  });

  test("each bar is a pressable named button out of the tab order", () => {
    expect(html).toMatch(/<button type="button" tabindex="-1" data-bar="one"[^>]*aria-label="gpu.local one running"[^>]*aria-pressed="false"/);
  });
});

describe("an overflowed bar is counted, not drawn", () => {
  // Three jobs over the same hours on a one-at-a-time lane: two tracks are drawn, the third
  // is behind +1 - not a bar underneath the others, where a click on what looks like one bar
  // lands on another (found in integration, 2026-10-15).
  const rows: DaylineRow[] = [{ id: "gpu.local", label: "GPU box", engines: "", cap: 1, kind: "local" }];
  const mk = (id: string, s: number): DaylineBar => ({ id, row: "gpu.local", s: at(s), e: at(9), look: "running", label: id, name: id });
  const three = [mk("early", 1), mk("middle", 2), mk("late", 3)];
  const draw = (selected: string | null): string =>
    renderToStaticMarkup(
      h(RunsDayline, { name: "n", rows, bars: three, pins: [], span, zoom: "24h", now: at(9), selected, lit: null, open: new Set<string>(), onSelect: () => {}, onToggleRow: () => {}, centre: { key: "k", at: "now" } }),
    );
  const drawn = (html: string): string[] => [...html.matchAll(/data-bar="([^"]+)"/g)].map((m) => m[1] ?? "");

  test("cap 1: exactly two bars in the DOM and a +1 naming the third", () => {
    const html = draw(null);
    expect(drawn(html)).toEqual(["early", "middle"]);
    expect(html).toContain('aria-label="1 more on GPU box, show"');
  });

  test("selecting the overflowed job (J/K walks onto it) packs it into a drawn track; another takes the +1", () => {
    const html = draw("late");
    expect(drawn(html)).toContain("late");
    expect(drawn(html)).toHaveLength(2);
    expect(html).toContain('aria-label="1 more on GPU box, show"');
  });
});

test("labels are seated per row: a bar on the next lane does not crowd this lane's label", () => {
  const rows: DaylineRow[] = [
    { id: "a", label: "A", engines: "", cap: 1, kind: "local" },
    { id: "b", label: "B", engines: "", cap: 1, kind: "local" },
  ];
  const mk = (id: string, row: string, s: number, e: number): DaylineBar => ({ id, row, s: at(s), e: at(e), look: "done", label: "a long label here", name: id });
  const html = renderToStaticMarkup(
    h(RunsDayline, { name: "n", rows, bars: [mk("short", "a", 1, 1.1), mk("next-lane", "b", 2, 6)], pins: [], span, zoom: "24h", now: at(10), selected: null, lit: null, open: new Set<string>(), onSelect: () => {}, onToggleRow: () => {}, centre: { key: "k", at: "now" } }),
  );
  const short = /<button[^>]*data-bar="short"[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
  expect(short.split(" ")).toContain(dl["lab-beside"]);
});

test("the first paint is windowed around NOW: a bar a day and a half away is packed, not drawn", () => {
  const rows: DaylineRow[] = [{ id: "a", label: "A", engines: "", cap: 3, kind: "local" }];
  const mk = (id: string, s: number): DaylineBar => ({ id, row: "a", s: at(s), e: at(s + 1), look: "done", label: id, name: id });
  const html = renderToStaticMarkup(
    h(RunsDayline, { name: "n", rows, bars: [mk("near", 9), mk("far", 40)], pins: [], span, zoom: "12h", now: at(10), selected: null, lit: null, open: new Set<string>(), onSelect: () => {}, onToggleRow: () => {}, centre: { key: "k", at: "now" } }),
  );
  expect(html).toContain('data-bar="near"');
  expect(html).not.toContain('data-bar="far"');
});

test("ResourceSummary names each lane's holding in words and as a meter", () => {
  const html = renderToStaticMarkup(h(ResourceSummary, { label: "resources", lines: [{ lane: "seat.text", cap: 4, running: 2, waiting: 1 }] }));
  expect(html).toContain("2 running · 1 waiting");
  expect(html).toContain('aria-valuenow="2"');
  expect(html).toContain("Text seat");
});
