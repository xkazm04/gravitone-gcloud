// The LoadBand (spark night-load-band): its words and geometry (band.ts), and what the component
// exposes - rendered with react-dom/server (Vitest runs without a DOM) - including the spoken name
// each resource's meter carries, and that a desk without a load draws no band at all.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { LOAD_BAND, type LoadResource, type LoadSummary } from "@gt/domain/load";

import { DeskFrame } from "../../src/components/desk/Desk.tsx";
import { commitLine, lookOf, pct, rowOf, spokenRow, waitedLine } from "../../src/components/load/band.ts";
import { LoadBand } from "../../src/components/load/LoadBand.tsx";
import s from "../../src/components/load/LoadBand.module.css";

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el);
const res = (avg: number, p95: number, inBand: number, strip: readonly number[], read = 480): LoadResource => ({ avg, p95, inBand, read, strip });
const UNREAD: LoadResource = { avg: 0, p95: 0, inBand: 0, read: 0, strip: [] };

const LOAD: LoadSummary = {
  fromMs: Date.UTC(2026, 9, 21, 22),
  toMs: Date.UTC(2026, 9, 22, 6),
  samples: 480,
  band: LOAD_BAND,
  cpu: res(0.641, 0.808, 0.72, [0.5, 0.7, 0.85]),
  ram: res(0.71, 0.79, 0.83, [0.7, -1, 0.72]),
  gpu: UNREAD,
  commit: { peakGb: 88.4, limitGb: 102 },
  waited: { "comfy-queue": 12, memory: 41.2 },
};

describe("band words", () => {
  test("a fraction is a whole percent, clamped to the track", () => {
    expect([pct(0.641), pct(0.805), pct(-0.1), pct(1.3)]).toEqual([64, 81, 0, 100]);
  });

  test("under, in (edges included) and over the band", () => {
    expect([0.59, 0.6, 0.7, 0.8, 0.81].map((x) => lookOf(x, LOAD_BAND))).toEqual(["under", "in", "in", "in", "over"]);
  });

  test("a strip slot with no reading is a gap; a read one carries its own look", () => {
    const row = rowOf("ram", LOAD.ram, LOAD_BAND);
    expect(row.read && row.strip).toEqual([{ v: 70, look: "in" }, null, { v: 72, look: "in" }]);
    const zero = rowOf("gpu", res(0.02, 0.05, 0, [0, 0.05], 2), LOAD_BAND);
    expect(zero.read && zero.strip).toEqual([{ v: 0, look: "under" }, { v: 5, look: "under" }]);
  });

  test("the spoken names, read and unread", () => {
    expect(spokenRow(rowOf("cpu", LOAD.cpu, LOAD_BAND))).toBe("cpu average 64 percent, p95 81 percent, 72 percent of the night in band");
    expect(spokenRow(rowOf("gpu", UNREAD, LOAD_BAND))).toBe("gpu unread");
  });

  test("the commit line: peak of limit, peak alone, or nothing", () => {
    expect(commitLine({ peakGb: 88.4, limitGb: 102 })).toBe("commit 88 of 102 GB peak");
    expect(commitLine({ peakGb: 97 })).toBe("commit 97 GB peak");
    expect(commitLine({ limitGb: 102 })).toBeNull();
    expect(commitLine({})).toBeNull();
  });

  test("the waited line: longest first, hyphens as spaces, under a minute dropped", () => {
    expect(waitedLine({ "comfy-queue": 12, memory: 41.2, cpu: 0.3 })).toBe("memory 41 min · comfy queue 12 min");
    expect(waitedLine({})).toBeNull();
    expect(waitedLine({ vram: 0 })).toBeNull();
  });
});

describe("LoadBand", () => {
  const out = html(h(LoadBand, { load: LOAD }));

  test("a meter per read resource, its value the average and its name the whole reading", () => {
    expect(out).toContain('role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="64" aria-label="cpu average 64 percent, p95 81 percent, 72 percent of the night in band"');
    expect(out).toContain('aria-valuenow="71" aria-label="ram average 71 percent, p95 79 percent, 83 percent of the night in band"');
    // The marks are drawn where read (so the class lookups below are real, not "undefined" matching nothing).
    expect(String(s.avg)).not.toBe("undefined");
    expect(out.match(new RegExp(String(s.avg), "g"))?.length).toBe(2);
  });

  test("the readout drawn, the strip hidden from the accessibility tree", () => {
    expect(out).toContain("avg <b>64</b> · p95 <b>81</b> · <b>72%</b> in band");
    expect(out.match(/aria-hidden="true"/g)?.length).toBe(2);
  });

  test("an unread resource says unread, draws no marks and no strip", () => {
    const gpu = out.slice(out.indexOf('aria-label="gpu unread"'), out.indexOf(`class="${String(s.lines)}"`));
    expect(out).toContain('role="img" aria-label="gpu unread"');
    expect(gpu).toContain(">unread<");
    expect(gpu).not.toContain(String(s.avg));
    expect(gpu).not.toContain(String(s.strip));
    expect(gpu).not.toContain("--x:");
  });

  test("a strip draws a bar per read slot and nothing in a gap", () => {
    const ram = out.slice(out.indexOf("ram average"), out.indexOf("gpu unread"));
    expect(ram.match(new RegExp(`class="${String(s.slot)}"`, "g"))?.length).toBe(3);
    expect(ram.match(/--v:/g)?.length).toBe(2);
  });

  test("the commit and waited lines", () => {
    expect(out).toContain("<span>commit 88 of 102 GB peak</span>");
    expect(out).toContain("<span>waited: memory 41 min · comfy queue 12 min</span>");
  });

  test("no commit and no wait: no lines frame", () => {
    const bare = html(h(LoadBand, { load: { ...LOAD, commit: {}, waited: {} } }));
    expect(bare).not.toContain("commit");
    expect(bare).not.toContain("waited");
    expect(bare).not.toContain(String(s.lines));
  });

  test("a desk with no load draws no band and no empty frame for one", () => {
    const desk = (load?: LoadSummary) => html(h(DeskFrame, { title: "scout 2026-10-21", foot: null, children: null, ...(load === undefined ? {} : { load }) }));
    expect(desk()).not.toContain("LoadBand");
    expect(desk()).not.toContain("machine load");
    expect(desk(LOAD)).toContain('data-component="LoadBand"');
  });
});
