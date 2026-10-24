// The produce surfaces (Phase 4, L28): how a figure is written, what a stale receipt marks,
// what a ceiling admits, and the markup each part speaks - pure functions over literal data,
// the components through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { ModelOption, PlanPart, Receipt as ReceiptValue, ReceiptLine, RerouteOption } from "@gt/domain/produce";

import { Estimate } from "../../src/components/produce/Composer.tsx";
import { ComposeDialog } from "../../src/components/produce/ComposeDialog.tsx";
import { LaneHold, HOLD_SENTENCE } from "../../src/components/produce/LaneHold.tsx";
import { ModelPicker, PlanTable } from "../../src/components/produce/PlanTable.tsx";
import { Receipt } from "../../src/components/produce/Receipt.tsx";
import { RerouteList } from "../../src/components/produce/RerouteList.tsx";
import { unpricedKind } from "../../src/components/produce/Unpriced.tsx";
import { changeCount, costWords, fmtDur, fmtUsd, optionCost, mayStopAtCeiling, optionLabel, parseCeiling, receiptChanges, relDur, relUsd } from "../../src/components/produce/produce.ts";
import { capsFor } from "../../src/components/keycaps/caps.ts";
import { conflicts, problems } from "../../src/keymap/keymap.ts";
import { KEYMAP } from "../../src/keymap/bindings.ts";
import { route } from "../../src/keymap/route.ts";
import { EMPTY_STACK } from "../../src/layers/stack.ts";

const NOW = Date.UTC(2026, 9, 15, 9, 0);
const at = (min: number): string => new Date(NOW + min * 60_000).toISOString();
const noop = (): void => undefined;

const opt = (key: string, lane: ModelOption["lane"], label: string, sec: number, usd: number | null, extra: Partial<ModelOption> = {}): ModelOption => ({
  key,
  lane,
  provider: key.split("/")[1] ?? "p",
  model: key.split("/")[2] ?? "m",
  label,
  secondsPerUnit: sec,
  usdPerUnit: usd,
  src: "illustrative",
  basis: { seconds: { src: "illustrative", note: "test" }, usd: { src: "illustrative", note: "test" } },
  ...extra,
});
const FLUX = opt("frames/comfy/flux", "gpu.local", "Flux 2 dev fp8 · ComfyUI", 96, 0, { src: "model" });
const NANO = opt("frames/google/nano", "cloud.google", "Nano Banana", 21, 0.04);
const SUNO = opt("score/suno/v6", "box.chrome", "Suno v6 · serial", 240, null, { unpricedReason: "Suno bills subscription credits" });
const ARTICLE = opt("article/articles/c4", "seat.text", "lib/articles", 2280, 69.5, { usdRangePerUnit: [47, 92] });

const line = (key: string, o: ModelOption, units: number, q: number, start: number): ReceiptLine => ({
  key,
  label: key,
  lane: o.lane,
  provider: o.provider,
  model: o.model,
  units,
  seconds: o.secondsPerUnit * units,
  usd: o.usdPerUnit === null ? null : o.usdPerUnit * units,
  ...(o.unpricedReason === undefined ? {} : { unpricedReason: o.unpricedReason }),
  src: o.src,
  queuePos: q,
  start: at(start),
  end: at(start + 30),
});

const receipt = (lines: readonly ReceiptLine[], over: Partial<ReceiptValue> = {}): ReceiptValue => ({
  token: "t1",
  subject: { kind: "project", id: "p", rev: 1 },
  mode: "dry",
  lines,
  totals: { seconds: lines.reduce((n, l) => n + l.seconds, 0), usd: lines.reduce((n, l) => n + (l.usd ?? 0), 0), unpriced: lines.filter((l) => l.usd === null).length, src: "illustrative" },
  queuePos: lines[0]?.queuePos ?? 1,
  etaAt: at(60),
  overCeiling: false,
  readAt: at(0),
  ...over,
});

describe("figures", () => {
  test("durations and dollars read as the prototype wrote them, and a sub-cent spend never reads $0", () => {
    expect([fmtDur(0), fmtDur(20), fmtDur(9 * 60), fmtDur(64 * 60), fmtDur(120 * 60), fmtDur(72 * 3600)]).toEqual(["0m", "<1m", "9m", "1h 04m", "2h", "3d"]);
    expect([fmtUsd(0), fmtUsd(0.004), fmtUsd(0.24), fmtUsd(4.8), fmtUsd(69.5)]).toEqual(["$0", "<$0.01", "$0.24", "$4.80", "$70"]);
    expect([relDur(30), relDur(-12 * 60), relDur(65 * 60)]).toEqual(["±0", "−12m", "+1h 05m"]);
    expect([relUsd(0), relUsd(0.24), relUsd(-1.2)]).toEqual(["±$0", "+$0.24", "−$1.20"]);
  });

  test("a cost is a band, a figure, or unpriced - never an invented dollar for credit work", () => {
    expect(costWords(optionCost(ARTICLE, 1))).toBe("$47–92");
    expect(costWords(optionCost(NANO, 24))).toBe("$0.96");
    expect(costWords(optionCost(SUNO, 2))).toBe("unpriced");
    expect(optionCost(SUNO, 2).unpricedReason).toBe("Suno bills subscription credits");
  });

  test("a band is a bound: its ends round outward, under $10 in cents, and a sub-dollar band never reads $0–0", () => {
    // strips TURN_ESTIMATE [1.7, 6.8] a turn; a stats reel is two turns, four reels eight.
    expect(costWords({ usd: 3.2, usdRange: [1.7, 6.8] })).toBe("$1.70–6.80");
    expect(costWords({ usd: 30.6, usdRange: [6.8, 54.4] })).toBe("$6.80–55");
    expect(costWords({ usd: 0.08, usdRange: [0.04, 0.12] })).toBe("$0.04–0.12");
    expect(costWords({ usd: 0.07, usdRange: [0.07, 0.07] })).toBe("$0.07–0.07");
    expect(costWords({ usd: 0.01, usdRange: [0.004, 0.02] })).toBe("<$0.01–0.02");
    expect(costWords({ usd: 69.5, usdRange: [47.6, 91.2] })).toBe("$47–92");
  });

  test("an unpriced figure is drawn by its kind; the reason is its name, never the cell's text", () => {
    expect([unpricedKind("billed to the text seat"), unpricedKind("Suno bills subscription credits"), unpricedKind(undefined)]).toEqual(["seat", "credits", "no price"]);
    const html = renderToStaticMarkup(h(Estimate, { receipt: receipt([line("score", SUNO, 1, 1, 0)]), noun: "prompt" }));
    expect(html).toContain("unpriced · credits");
    expect(html).toContain('aria-label="unpriced: Suno bills subscription credits"');
  });

  test("an option's label is model · lane — time · $ for the part's units", () => {
    expect(optionLabel(NANO, 24, "Google")).toBe("Nano Banana · Google — 8m · $0.96");
  });
});

describe("the receipt's changes", () => {
  const a = receipt([line("frames", FLUX, 24, 2, 10), line("score", SUNO, 2, 1, 10)]);

  test("nothing moved: no marks", () => {
    expect(changeCount(receiptChanges(a, { ...a, token: "t2", readAt: at(1) }))).toBe(0);
  });

  test("a stale read marks exactly the cells that moved, and the totals that moved with them", () => {
    const b = receipt([line("frames", FLUX, 24, 3, 40), line("score", SUNO, 2, 1, 10)], { token: "t2", queuePos: 3, etaAt: at(90) });
    const c = receiptChanges(a, b);
    expect([...(c.lines.get("frames") ?? [])].sort()).toEqual(["queuePos", "start"]);
    expect(c.lines.has("score")).toBe(false);
    expect([...c.totals].sort()).toEqual(["etaAt", "queuePos"]);
  });

  test("a re-routed line marks its lane, model, time and cost; added and removed lines are named", () => {
    const b = receipt([line("frames", NANO, 24, 1, 10), line("cut", FLUX, 1, 1, 50)], { token: "t2" });
    const c = receiptChanges(a, b);
    expect([...(c.lines.get("frames") ?? [])].sort()).toEqual(["cost", "lane", "model", "queuePos", "seconds", "src"]);
    expect(c.added).toEqual(["cut"]);
    expect(c.removed).toEqual([{ key: "score", label: "score" }]);
  });

  test("a removed line is named by its label, never by its key (a part key is <projectId>/<part>)", () => {
    const named = (key: string, label: string): ReceiptLine => ({ ...line(key, FLUX, 24, 1, 10), label });
    const before = receipt([named("prj_7f3a/frames", "frames"), named("prj_7f3a/score", "score")]);
    const after = receipt([named("prj_7f3a/frames", "frames")], { token: "t2" });
    const c = receiptChanges(before, after);
    expect(c.removed).toEqual([{ key: "prj_7f3a/score", label: "score" }]);
    const html = renderToStaticMarkup(h(Receipt, { receipt: after, changes: c, ceiling: "", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    expect(html).toContain("− score");
    expect(html).not.toContain("− prj_7f3a");
  });

  test("a figure's source and an unpriced line's kind are what the operator reads, so a move in either is marked", () => {
    const measured = { ...line("frames", FLUX, 24, 2, 10), src: "real" as const };
    const b = receipt([measured, { ...line("score", SUNO, 2, 1, 10), unpricedReason: "billed to the text seat" }], { token: "t2", totals: { ...a.totals, src: "real" } });
    const c = receiptChanges(a, b);
    expect([...(c.lines.get("frames") ?? [])]).toEqual(["src"]);
    expect([...(c.lines.get("score") ?? [])]).toEqual(["cost"]);
    expect([...c.totals]).toEqual(["src"]);
    const html = renderToStaticMarkup(h(Receipt, { receipt: b, changes: c, ceiling: "", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    expect(html.match(/\(changed\)/g)?.length).toBe(3);
  });
});

describe("the ceiling", () => {
  test("empty is no ceiling; a dollar amount parses; anything else is refused with its shape", () => {
    expect(parseCeiling("")).toEqual({ ok: true, value: undefined });
    expect(parseCeiling("$12.50")).toEqual({ ok: true, value: 12.5 });
    expect(parseCeiling("12.555").ok).toBe(false);
    expect(parseCeiling("-1").ok).toBe(false);
    expect(parseCeiling("ten").ok).toBe(false);
  });

  test("a band may stop at the ceiling on its top end (the worst case); unpriced work never does", () => {
    const banded = receipt([line("article", ARTICLE, 1, 1, 0)], { totals: { seconds: 1, usd: 69.5, usdRange: [47, 92], unpriced: 0, src: "model" } });
    expect(mayStopAtCeiling(banded, 80)).toBe(true);
    expect(mayStopAtCeiling(banded, 92)).toBe(false);
    const credits = receipt([line("score", SUNO, 2, 1, 0)]);
    expect(mayStopAtCeiling(credits, 0.01)).toBe(false);
    expect(mayStopAtCeiling(credits, undefined)).toBe(false);
  });
});

describe("markup", () => {
  test("the estimate is the receipt's totals: units, time, cost, queue, source", () => {
    const html = renderToStaticMarkup(h(Estimate, { receipt: receipt([line("frames", FLUX, 12, 2, 0)]), noun: "plate" }));
    expect(html).toContain("<b>12</b> plates");
    expect(html).toContain("<b>19m</b>");
    expect(html).toContain("<b>$0</b>");
    expect(html).toContain("#2");
  });

  test("an estimate over a seat line and a credits line draws both kinds, once each", () => {
    const SEAT = opt("article/claude-seat/c4", "seat.text", "lib/articles", 2280, null, { unpricedReason: "billed to the text seat" });
    const html = renderToStaticMarkup(h(Estimate, { receipt: receipt([line("score", SUNO, 1, 1, 0), line("article", SEAT, 1, 1, 0), line("score2", SUNO, 1, 1, 0)]), noun: "run" }));
    expect(html.match(/unpriced · credits/g)?.length).toBe(1);
    expect(html.match(/unpriced · seat/g)?.length).toBe(1);
  });

  test("an unpriced estimate says unpriced and speaks its reason; it never prints a dollar", () => {
    const html = renderToStaticMarkup(h(Estimate, { receipt: receipt([line("score", SUNO, 1, 1, 0)]), noun: "prompt" }));
    expect(html).toContain("unpriced");
    expect(html).toContain("Suno bills subscription credits");
    expect(html).not.toContain("$");
  });

  test("an all-unpriced receipt draws no cost total: credits work never reads $0", () => {
    const credits = receipt([line("score", SUNO, 2, 1, 0)]);
    const html = renderToStaticMarkup(h(Receipt, { receipt: credits, ceiling: "", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    expect(html).toContain("unpriced");
    expect(html).not.toMatch(/\$\d/);
    const mixed = renderToStaticMarkup(h(Receipt, { receipt: receipt([line("frames", NANO, 24, 1, 0), line("score", SUNO, 2, 1, 0)]), ceiling: "", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    expect(mixed).toContain("$0.96");
  });

  test("a stale receipt marks its moved cells for every reader, and counts them", () => {
    const a = receipt([line("frames", FLUX, 24, 2, 10)]);
    const b = receipt([line("frames", FLUX, 24, 3, 40)], { token: "t2", queuePos: 3 });
    const html = renderToStaticMarkup(h(Receipt, { receipt: b, changes: receiptChanges(a, b), ceiling: "", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    // two line cells (queue, start) and the totals' queue: every mark the eye gets, a reader gets.
    expect(html.match(/\(changed\)/g)?.length).toBe(3);
    expect(html).toContain('aria-label="2 changes since you read it"');
  });

  test("every moved total speaks its mark, not only the ring: mode, work, cost, queue, eta", () => {
    const a = receipt([line("frames", NANO, 24, 2, 10)]);
    const b = receipt([line("frames", NANO, 48, 2, 10)], { token: "t2", mode: "live", queuePos: 4, etaAt: at(240), totals: { seconds: 21 * 48, usd: 1.92, unpriced: 0, src: "illustrative" } });
    const c = receiptChanges(a, b);
    expect([...c.totals].sort()).toEqual(["cost", "etaAt", "mode", "queuePos", "seconds"]);
    const html = renderToStaticMarkup(h(Receipt, { receipt: b, changes: c, ceiling: "", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    // the line's units, time and cost cells, plus the five totals.
    expect(html.match(/\(changed\)/g)?.length).toBe(3 + 5);
  });

  test("a ceiling under the worst case is a stop point: the confirm stays armed and the receipt says may stop", () => {
    const banded = receipt([line("article", ARTICLE, 1, 1, 0)], { totals: { seconds: 1, usd: 69.5, usdRange: [47, 92], unpriced: 0, src: "model" } });
    const over = renderToStaticMarkup(h(Receipt, { receipt: banded, ceiling: "80", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    expect(over).not.toMatch(/<button[^>]*aria-disabled="true"[^>]*>Confirm/);
    expect(over).toContain("may stop at ceiling");
    expect(over).toContain('aria-label="worst case $92 over the ceiling $80"');
    const under = renderToStaticMarkup(h(Receipt, { receipt: banded, ceiling: "92", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    expect(under).not.toContain("may stop at ceiling");
    expect(under).toContain('data-mode="dry"');
    const bad = renderToStaticMarkup(h(Receipt, { receipt: banded, ceiling: "ten", onCeiling: noop, onConfirm: noop, busy: false, nowMs: NOW }));
    expect(bad).toMatch(/<button[^>]*aria-disabled="true"[^>]*>Confirm/);
  });

  test("the picker labels each option model · lane — time · $ for the part's units", () => {
    const html = renderToStaticMarkup(h(ModelPicker, { options: [FLUX, NANO], chosen: NANO.key, units: 24, part: "frames", onChange: noop }));
    expect(html).toContain('aria-label="model for frames"');
    expect(html).toContain("Nano Banana · Google — 8m · $0.96");
  });

  test("a draft plan offers the picker and the units field; a launched one draws them fixed", () => {
    const parts: PlanPart[] = [
      { id: "f", label: "frames", after: [], state: "draft", kind: "frames", units: 24, unitNoun: "plate", unitsRange: [1, 200], options: [FLUX, NANO], chosen: FLUX.key, estimate: { seconds: 2304, usd: 0, src: "model" } },
      { id: "g", label: "verdict · frames", after: ["f"], state: "draft", kind: "gate", judges: "f", verdict: "matrix-cull" },
      { id: "s", label: "slot", after: ["g"], state: "draft", kind: "slot" },
    ];
    const draft = renderToStaticMarkup(h(PlanTable, { parts, selectedId: null, draft: true, nowMs: NOW, onModel: noop, onUnits: noop }));
    expect(draft).toContain("<select");
    expect(draft).toContain('aria-label="plates for frames"');
    expect(draft).toContain("◆ frames<");
    expect(draft).toContain("◆frames");
    const launched = renderToStaticMarkup(h(PlanTable, { parts, selectedId: null, draft: false, nowMs: NOW, onModel: noop, onUnits: noop }));
    expect(launched).not.toContain("<select");
    expect(launched).not.toContain('type="number"');
  });

  test("the re-route list draws the current route dashed and unchoosable, the rest with their deltas", () => {
    const options: RerouteOption[] = [
      { option: FLUX, current: true, dEtaS: 0, dUsd: 0, queuePos: 2 },
      { option: NANO, current: false, dEtaS: -1860, dUsd: 0.96, queuePos: 1 },
    ];
    const html = renderToStaticMarkup(h(RerouteList, { options, units: 24, onPick: noop, busy: null }));
    expect(html.match(/<button/g)?.length).toBe(1);
    expect(html).toContain("re-route to Nano Banana on Google: eta −31m, +$0.96, queue 1");
    expect(html).toContain("current");
  });

  test("a delta's tone is read off its words: a ±$0 / ±0 delta is never coloured dearer or later", () => {
    const tone = (dEtaS: number, dUsd: number): string =>
      renderToStaticMarkup(h(RerouteList, { options: [{ option: NANO, current: false, dEtaS, dUsd, queuePos: 1 }], units: 24, onPick: noop, busy: null }));
    const even = tone(59.5, 0.0045);
    expect(even).toContain("eta ±0");
    expect(even).toContain("±$0");
    expect(even).not.toMatch(/_bad_/);
    const dearer = tone(65 * 60, 0.96);
    expect(dearer.match(/_bad_/g)?.length).toBe(2);
    expect(tone(-65 * 60, -0.96).match(/_good_/g)?.length).toBe(2);
  });

  test("a held lane says v1's sentence verbatim and offers one act", () => {
    const html = renderToStaticMarkup(h(LaneHold, { lane: "box.chrome", job: "Hunt", stage: "submit · 2 of 4", nowMs: NOW, onAck: noop, busy: false }));
    expect(html).toContain(HOLD_SENTENCE);
    expect(HOLD_SENTENCE).toBe("credits may be spent - look first");
    expect(html).toContain("Acknowledge");
  });

  test("compose gives the first three recipes their digits and no more", () => {
    const recipes = ["a", "b", "c", "d"].map((id) => ({ id, label: id.toUpperCase(), sub: "x", icon: "video" as const }));
    const html = renderToStaticMarkup(
      h(ComposeDialog, { open: true, specimen: true, onClose: noop, recipes, styles: [], takes: [], topics: [], value: { styleId: "", takeId: "", topic: "" }, onValue: noop, onRecipe: noop, busy: false }),
    );
    expect(html.match(/<kbd[^>]*>[123]<\/kbd>/g)?.length).toBe(3);
    expect(html).toContain('data-recipe="d"');
  });
});

describe("the keys the produce surfaces add", () => {
  test("the table still has no conflict and no lying declaration", () => {
    expect(conflicts(KEYMAP).map((c) => c.why)).toEqual([]);
    expect(problems(KEYMAP)).toEqual([]);
  });

  test("⏎ inside a named field reaches its row: the composer launches, the title renames, the ceiling confirms", () => {
    const press = (page: string, field: string, shiftKey = false) =>
      route(KEYMAP, { key: "Enter", code: "Enter", shiftKey, ctrlKey: false, metaKey: false, altKey: false, target: { editable: true, field, control: true } }, { layers: EMPTY_STACK, page, facts: new Set() });
    const verb = (d: ReturnType<typeof press>) => (d.kind === "binding" ? d.match.binding.verb : d.kind);
    expect(verb(press("floor", "composer"))).toBe("launch");
    expect(verb(press("projects", "title"))).toBe("rename");
    expect(verb(press("receipt", "ceiling"))).toBe("confirm");
    // ⇧⏎ in the sentence is a newline: nobody's.
    expect(press("floor", "composer", true).kind).toBe("none");
  });

  test("the receipt confirms on ⏎; Runs re-routes on O and acknowledges a hold on A", () => {
    expect(capsFor("receipt", "confirm")).toEqual(["⏎"]);
    expect(capsFor("projects.runs", "reroute")).toEqual(["O"]);
    expect(capsFor("projects.runs", "ack-lane")).toEqual(["A"]);
  });
});
