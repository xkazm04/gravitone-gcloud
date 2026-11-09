import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

const root = vi.hoisted(() => ({ dir: "" }));

import { ideaPrompt, parseIdeas } from "../../lib/foundry/scout/idea-loop/generate.ts";
import { readLoopIdea, runIdeaLoop } from "../../lib/foundry/scout/idea-loop/loop.ts";
import { barLine, ideaVerdicts, PROVISIONAL_BAR, scorerFrom, type IdeaVerdict } from "../../lib/foundry/scout/idea-loop/score.ts";
import type { IdeaCandidate, Night } from "../../lib/foundry/scout/types.ts";

root.dir = mkdtempSync(path.join(os.tmpdir(), "idea-loop-score-"));
process.env["IDEA_LOOP_STORE_DIR"] = root.dir;
afterAll(() => rmSync(root.dir, { recursive: true, force: true }));

const verdict = (i: number, v: "keep" | "reject", text: string): IdeaVerdict => ({ ref: `2026-10-01/c-${String(i).padStart(2, "0")}`, verdict: v, title: `idea ${i}`, text, reasons: [] });

const keeps = (n: number): IdeaVerdict[] => Array.from({ length: n }, (_, i) => verdict(100 + i, "keep", `deadpan lighthouse keeper flooded archive ledger number${i}`));
const throws = (n: number): IdeaVerdict[] => Array.from({ length: n }, (_, i) => verdict(200 + i, "reject", `neon explosion supercar montage influencer number${i}`));

const idea = (id: string, over: Partial<IdeaCandidate> = {}): IdeaCandidate => ({ id, kind: "idea", sourceIds: [], status: "rendered", title: `t ${id}`, prompt: `p ${id}`, target: "stats", anchor: { kind: "ours", ref: "x" }, ...over }) as IdeaCandidate;

const night = (over: Partial<Night>): Night => ({ id: "2026-10-01", dry: false, candidates: [idea("c-01"), idea("c-02"), idea("c-03")], committed: { at: "t", by: "operator", kept: ["c-01/board"], rejected: ["c-02/board"], reasons: { "c-02/board": ["subject"] }, notes: {}, dry: false }, ...over }) as Night;

describe("the operator's idea verdicts", () => {
  it("counts only a human verdict on a live night's idea board", () => {
    const got = ideaVerdicts([night({})]);
    expect(got.map((v) => [v.ref, v.verdict])).toEqual([["2026-10-01/c-01", "keep"], ["2026-10-01/c-02", "reject"]]);
    expect(got[1]?.reasons).toEqual(["subject"]);
    expect(ideaVerdicts([night({ dry: true })])).toEqual([]);
    expect(ideaVerdicts([night({ committed: undefined })])).toEqual([]);
  });
});

describe("the bar", () => {
  it("is insufficient and provisional with no verdict at all, and says n=0", () => {
    const { bar, predictedKeep, passes } = scorerFrom([]);
    expect(bar).toMatchObject({ n: 0, status: "insufficient", auc: null, ci: null, value: PROVISIONAL_BAR, provisional: true });
    expect(predictedKeep({ title: "anything", text: "at all" })).toBe(0.5);
    expect(passes({ title: "anything", text: "at all" })).toBe(true);
    expect(barLine(bar)).toContain("provisional");
    expect(barLine(bar)).toContain("n=0");
  });

  it("names the population it was measured on, at n=0 and when calibrated", () => {
    const empty = scorerFrom([]).bar;
    expect(empty.measuredOn).toBe("idea artboard prompts");
    expect(barLine(empty)).toContain("population: idea artboard prompts");
    expect(barLine(empty)).not.toContain("storyboard");
    const calibrated = scorerFrom([...keeps(12), ...throws(12)]).bar;
    expect(calibrated.status).toBe("calibrated");
    expect(barLine(calibrated)).toContain("population: idea artboard prompts");
    expect(barLine(calibrated)).toContain("not measured on storyboard treatments");
  });

  it("stays insufficient below the floor however cleanly the few verdicts split", () => {
    const { bar } = scorerFrom([...keeps(7), ...throws(30)]);
    expect(bar).toMatchObject({ n: 37, nKept: 7, nThrown: 30, status: "insufficient", auc: null, provisional: true });
  });

  it("is calibrated when the words separate kept from thrown, and the cut then does too", () => {
    const { bar, passes, predictedKeep } = scorerFrom([...keeps(12), ...throws(12)]);
    expect(bar.status).toBe("calibrated");
    expect(bar.provisional).toBe(false);
    expect(bar.auc).toBeGreaterThan(0.9);
    const liked = { title: "a keeper", text: "deadpan lighthouse ledger" };
    const disliked = { title: "a montage", text: "neon supercar influencer" };
    expect(passes(liked)).toBe(true);
    expect(passes(disliked)).toBe(false);
    expect(predictedKeep(liked)).toBeGreaterThan(predictedKeep(disliked));
  });

  it("never claims calibration from words that do not separate", () => {
    const shared = ["harbour dusk ledger", "orchard frost lantern", "tunnel ember choir"];
    const mixed = Array.from({ length: 30 }, (_, i) => verdict(i, i % 2 === 0 ? "keep" : "reject", shared[i % 3] ?? ""));
    const { bar } = scorerFrom(mixed);
    expect(bar.status).not.toBe("calibrated");
    expect(bar.provisional).toBe(true);
    expect(bar.value).toBe(PROVISIONAL_BAR);
  });

  it("gives the same bar for the same verdicts", () => {
    const vs = [...keeps(12), ...throws(12)];
    expect(scorerFrom(vs).bar).toEqual(scorerFrom(vs).bar);
  });
});

const good = { title: "The tide reads the ledger", paragraph: "A keeper logs a flood.", bullets: ["one", "two", "three"], panels: ["a lantern over water", "a wet ledger"] };

describe("the generator's door", () => {
  it("takes a well-formed answer and drops a bad idea with its reason", () => {
    const got = parseIdeas(`Here you go:\n${JSON.stringify([good, { ...good, bullets: [] }, { ...good, panels: ["a portrait of Darth Sidious walking"] }])}`);
    expect(got.ideas).toHaveLength(1);
    expect(got.dropped).toHaveLength(2);
    expect(got.dropped[1]).toContain("Darth");
  });

  it("reports an answer with no JSON", () => {
    expect(parseIdeas("I cannot help with that")).toMatchObject({ ideas: [], dropped: [expect.stringContaining("no JSON")] });
  });

  it("asks what the operator will keep and never about an audience", () => {
    const p = ideaPrompt(keeps(1), 3, 5);
    expect(p).toContain("operator will keep");
    expect(p).not.toMatch(/\b(views?|reach|viral|engagement|audience size)\b/i);
  });
});

describe("one pass", () => {
  it("records every idea and returns the passing ones, best first, capped", async () => {
    const seat = vi.fn(async () => JSON.stringify([good, { ...good, title: "Another tide" }]));
    const pass = await runIdeaLoop({ nights: [], seat, count: 2, panels: 2, top: 1, now: new Date("2026-11-08T12:00:00Z") });
    expect(seat).toHaveBeenCalledOnce();
    expect(pass.bar.provisional).toBe(true);
    expect(pass.ideas).toHaveLength(2);
    expect(pass.passing).toHaveLength(1);
    const first = pass.ideas[0];
    expect(first?.id).toMatch(/^il-20261108-\d{3}$/);
    expect(await readLoopIdea(first?.id ?? "")).toMatchObject({ title: good.title, passed: true, bar: { provisional: true, n: 0 } });
    const again = await runIdeaLoop({ nights: [], seat, count: 2, panels: 2, top: 1, now: new Date("2026-11-08T13:00:00Z") });
    expect(again.ideas[0]?.id).not.toBe(first?.id);
  });
});
