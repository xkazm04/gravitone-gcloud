import { describe, expect, it } from "vitest";
import type { EventData } from "@gt/domain/event";
import type { Outputs } from "@gt/kernel/job-core";
import { cardNext, lintOutput, parseStep, planStrips, renderOutput, stepNames, turnOutput, type CardView, type RunView } from "../src/strips/plan.ts";

// The strip job's plan over literal inputs: v1's card loop (pipeline/strips/run.mts
// `runCard` before Phase 4) step by step, the four settling rules, and never re-spend -
// a booked turn is never planned again, and a page that landed unbooked is adopted.

const RUN = { rounds: 2, review: true } as const;
const card = (over: Partial<CardView> = {}): CardView => ({ id: "edu-a--E01", approach: "E01", asset: false, html: false, rounds: 0, status: "pending", ...over });

function outs(entries: Record<string, EventData>): Outputs {
  return new Map(Object.entries(entries).map(([step, value]) => [step, { step, value, at: "2026-10-16T09:00:00.000Z" }]));
}
const ok = turnOutput({ ok: true, changed: true, outcome: "completed" });
const same = turnOutput({ ok: true, changed: false, outcome: "completed" });
const died = turnOutput({ ok: false, changed: false, outcome: "timed-out" });
const clean = lintOutput(true, []);
const dirty = lintOutput(false, ["clock: Date.now"]);
const pass = renderOutput(true, true);
const fail = renderOutput(true, false);
const c = "edu-a--E01";
const next = (o: Record<string, EventData>, cv: Partial<CardView> = {}, run: { rounds: number; review: boolean } = RUN) => cardNext(card(cv), outs(o), run)?.name ?? null;

describe("the card loop", () => {
  it("authors, lints, renders, and a passing round 0 looks at its sheet once", () => {
    expect(next({})).toBe(`author:${c}`);
    expect(next({ [`author:${c}`]: ok })).toBe(`lint:${c}:r0`);
    expect(next({ [`author:${c}`]: ok, [`lint:${c}:r0`]: clean })).toBe(`render:${c}:r0`);
    expect(next({ [`author:${c}`]: ok, [`lint:${c}:r0`]: clean, [`render:${c}:r0`]: pass })).toBe(`review:${c}:r1`);
  });

  it("a control, or a run without review, settles on a passing round 0", () => {
    const o = { [`author:${c}`]: ok, [`lint:${c}:r0`]: clean, [`render:${c}:r0`]: pass };
    expect(next(o, { approach: "CTRL" })).toBeNull();
    expect(next(o, {}, { rounds: 2, review: false })).toBeNull();
  });

  it("rounds only on failure: a failing gate or lint asks a fix; a passing round >= 1 is the end", () => {
    expect(next({ [`author:${c}`]: ok, [`lint:${c}:r0`]: dirty })).toBe(`fix:${c}:r1`);
    expect(next({ [`author:${c}`]: ok, [`lint:${c}:r0`]: clean, [`render:${c}:r0`]: fail })).toBe(`fix:${c}:r1`);
    const r1 = { [`author:${c}`]: ok, [`lint:${c}:r0`]: clean, [`render:${c}:r0`]: fail, [`fix:${c}:r1`]: ok, [`lint:${c}:r1`]: clean };
    expect(next({ ...r1, [`render:${c}:r1`]: pass })).toBeNull();
    expect(next({ ...r1, [`render:${c}:r1`]: fail })).toBe(`fix:${c}:r2`);
  });

  it("stops at the round limit, failing or not", () => {
    const o = { [`author:${c}`]: ok, [`lint:${c}:r0`]: clean, [`render:${c}:r0`]: fail, [`fix:${c}:r1`]: ok, [`lint:${c}:r1`]: clean, [`render:${c}:r1`]: fail, [`fix:${c}:r2`]: ok, [`lint:${c}:r2`]: dirty };
    expect(next(o)).toBeNull();
    expect(next({ [`author:${c}`]: ok, [`lint:${c}:r0`]: dirty }, {}, { rounds: 0, review: true })).toBeNull();
  });

  it("a turn that did not complete settles the card; a fix or review that changed nothing keeps the render", () => {
    expect(next({ [`author:${c}`]: died })).toBeNull();
    const shown = { [`author:${c}`]: ok, [`lint:${c}:r0`]: clean, [`render:${c}:r0`]: fail };
    expect(next({ ...shown, [`fix:${c}:r1`]: died })).toBeNull();
    expect(next({ ...shown, [`fix:${c}:r1`]: same })).toBeNull();
    // ...but after a lint failure there is no render to keep: an unchanged fix is linted again.
    expect(next({ [`author:${c}`]: ok, [`lint:${c}:r0`]: dirty, [`fix:${c}:r1`]: same })).toBe(`lint:${c}:r1`);
  });
});

describe("never re-spend", () => {
  it("a page on disk with no booked author is adopted at the round run.json records, never re-authored", () => {
    expect(next({}, { html: true })).toBe(`lint:${c}:r0`);
    expect(next({}, { html: true, rounds: 2, status: "render-failed" })).toBe(`lint:${c}:r2`);
  });

  it("a fix that landed unbooked (its round on run.json) is adopted, not bought again", () => {
    const shown = { [`author:${c}`]: ok, [`lint:${c}:r0`]: clean, [`render:${c}:r0`]: fail };
    expect(next(shown, { html: true, rounds: 0 })).toBe(`fix:${c}:r1`);
    expect(next(shown, { html: true, rounds: 1 })).toBe(`lint:${c}:r1`);
  });

  it("a v1 card already settled (rendered, or a paid author that failed) stays settled", () => {
    expect(next({}, { status: "rendered", html: true })).toBeNull();
    expect(next({}, { status: "author-failed" })).toBeNull();
  });
});

describe("the run's plan", () => {
  const view = (cards: CardView[], over: Partial<RunView> = {}): RunView => ({ id: "r", status: "running", cards, rounds: 2, review: true, assetUsd: 0.04, ...over });

  it("one next step per unsettled card in order, an approach's image before its first author, triage last", () => {
    const a = card({ id: "a", approach: "E07", asset: true });
    const b = card({ id: "b", approach: "E07", asset: true });
    const p = planStrips(view([a, b]), outs({}));
    expect(p.map((s) => s.name)).toEqual(["asset:E07", "author:a", "author:b"]);
    expect(p[1]?.estimate.usd).toBeGreaterThan(0);
    expect(planStrips(view([a, b]), outs({ "asset:E07": { ok: true } })).map((s) => s.name)).toEqual(["author:a", "author:b"]);
    const settled = outs({ "author:a": died, "author:b": died });
    expect(planStrips(view([a, b]), settled).map((s) => s.name)).toEqual(["triage"]);
    expect(planStrips(view([a, b]), outs({ "author:a": died, "author:b": died, triage: { status: "awaiting-triage" } }))).toEqual([]);
    expect(planStrips(view([a], { status: "committed" }), outs({}))).toEqual([]);
  });

  it("every name the plan makes parses back to its step, and nothing else does", () => {
    for (const n of [stepNames.author("x--E01"), stepNames.turn("fix", "x", 2), stepNames.turn("review", "x", 1), stepNames.lint("x", 0), stepNames.render("x", 3), stepNames.asset("E07"), "triage"]) {
      expect(parseStep(n)?.name).toBe(n);
    }
    for (const bad of ["author:x:r1", "fix:x:r0", "lint:x", "paint:x:r1", "asset:E07:r1"]) expect(parseStep(bad)).toBeUndefined();
  });
});
