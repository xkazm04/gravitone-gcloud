import { describe, expect, it } from "vitest";
import { parseAt } from "@gt/domain/door";
import { jobIdSchema, partIdSchema, runIdSchema } from "@gt/domain/ids";
import type { Output } from "@gt/kernel/job-core";
import { researchPlan, type ResearchView } from "../src/research/define.ts";
import { actSteps, askOf, bookedPlan, FREE, partJobId, unitOf, type UnitPrice } from "../src/research/partAct.ts";
import { scriptPlan, type ScriptView } from "../src/script/define.ts";
import { NO_LINES, NO_VOICE_ENGINE, voicePlan } from "../src/voice/define.ts";
import { wordsPlan } from "../src/words/define.ts";

// The studio step producers' pure halves on literal inputs (L37): the part job's id grammar, the
// act's step list from its booked outputs (the never-re-spend rule), and each step's act table
// with the refusals the work states before anything is bought.

const brand = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};
const part = (jobId: string, partId: string) => ({ id: brand(parseAt("job id", jobIdSchema, jobId)), of: { kind: "part" as const, id: brand(parseAt("part id", partIdSchema, partId)) } });

const SEAT: UnitPrice = { seconds: 540, usd: null, unpricedReason: "billed to the operator's text seat", credit: "billed to the operator's text seat" };
const out = (step: string, value: Record<string, unknown>): [string, Output] => [step, { step, value, at: "2026-10-16T09:00:00.000Z" }];

describe("a part job names its act", () => {
  it("round-trips act, rev, a target holding colons and slashes, and a later launch", () => {
    const ask = { partId: "p:1/frames", act: "render-plate", rev: 7, target: "u:3/b", n: 2 };
    const id = partJobId(ask);
    expect(id).toBe("job:part:p:1/frames:render-plate:7:u%3A3%2Fb~2");
    expect(askOf(part(id, "p:1/frames"))).toEqual({ ok: true, value: ask });
  });

  it("the Plan's own job carries no act; a job of another part or a run is refused", () => {
    expect(askOf(part("job:part:p/research", "p/research"))).toEqual({ ok: true, value: { partId: "p/research", act: null } });
    expect(askOf(part("job:part:q/research:run-research:1", "p/research")).ok).toBe(false);
    expect(askOf({ id: brand(parseAt("job id", jobIdSchema, "job:run:x")), of: { kind: "run", id: brand(parseAt("run id", runIdSchema, "x")) } }).ok).toBe(false);
  });
});

describe("the act's steps are its missing outputs", () => {
  it("plan first; then every unit not booked, in plan order; then land", () => {
    expect(actSteps(new Map()).map((s) => s.name)).toEqual(["plan"]);
    const plan = { act: "follow-up", units: [unitOf("fu:1", SEAT, {}), unitOf("fu:2", SEAT, {}), unitOf("fu:3", SEAT, {})] };
    const booked = new Map([out("plan", plan), out("unit:fu:1", { id: "1" })]);
    const steps = actSteps(booked);
    expect(steps.map((s) => s.name)).toEqual(["unit:fu:2", "unit:fu:3", "land"]);
    // A text seat is credit: admitted under a USD ceiling, booked unpriced with its reason.
    expect(steps[0]).toMatchObject({ estimate: { usd: null }, credit: SEAT.credit });
    expect(bookedPlan(booked)).toEqual(plan);
    expect(actSteps(new Map([...booked, out("unit:fu:2", {}), out("unit:fu:3", {}), out("land", { rev: 3 })]))).toEqual([]);
  });

  it("a priced unit carries its dollars and no reason; a free one is $0", () => {
    expect(unitOf("p", { seconds: 4, usd: 0.04 }, {}).estimate).toEqual({ seconds: 4, usd: 0.04 });
    expect(unitOf("d", FREE, {}).estimate).toEqual({ seconds: 1, usd: 0 });
  });
});

const notebook = (over: Partial<ResearchView> = {}): ResearchView => ({ face: "notebook", topic: "why bitcoin", hasNotebook: true, queued: [], briefMissing: [], ...over });

describe("research acts", () => {
  it("a notebook run is one paid unit; the beats face deals a free board; ads generate ideas", () => {
    expect(researchPlan(notebook(), null, SEAT)).toMatchObject({ ok: true, value: { act: "run-research", units: [{ name: "notebook", credit: SEAT.credit }] } });
    expect(researchPlan(notebook({ face: "beats" }), "run-research", SEAT)).toMatchObject({ ok: true, value: { units: [{ name: "deal", estimate: { usd: 0 } }] } });
    expect(researchPlan(notebook({ face: "ads" }), null, SEAT)).toMatchObject({ ok: true, value: { act: "generate-ideas" } });
  });

  it("one unit per queued follow-up, so a crash after the second re-asks only the rest", () => {
    const v = notebook({ queued: [{ id: "fu-1", prompt: "a" }, { id: "fu-2", prompt: "b", cardId: "f-1" }] });
    expect(researchPlan(v, "follow-up", SEAT)).toMatchObject({ ok: true, value: { units: [{ name: "fu:fu-1" }, { name: "fu:fu-2", input: { cardId: "f-1" } }] } });
  });

  it("refuses in the work's words before anything is bought", () => {
    const msg = (r: ReturnType<typeof researchPlan>) => (r.ok ? "" : r.error.message);
    expect(msg(researchPlan(notebook({ topic: " " }), "run-research", SEAT))).toBe("run research needs topic");
    expect(msg(researchPlan(notebook(), "follow-up", SEAT))).toBe("no follow-up is queued");
    expect(msg(researchPlan(notebook({ hasNotebook: false, queued: [{ id: "x", prompt: "q" }] }), "follow-up", SEAT))).toBe("a follow-up needs a notebook");
    expect(msg(researchPlan(notebook({ face: "ads", briefMissing: ["product", "cta"] }), "generate-ideas", SEAT))).toBe("brief needs product · cta");
    expect(msg(researchPlan(notebook(), "recalibrate", SEAT))).toBe("recalibrate is not an act of a research part");
  });
});

const doc = (over: Partial<ScriptView> = {}): ScriptView => ({ face: "document", scopeConfirmed: true, spineComposed: false, notes: 0, staged: false, ideaPicked: false, ...over });

describe("script acts", () => {
  it("compose is a paid turn on a confirmed scope; the trailer cut is free from the spine", () => {
    expect(scriptPlan(doc(), null, SEAT)).toMatchObject({ ok: true, value: { act: "compose-candidates", units: [{ name: "compose" }] } });
    expect(scriptPlan(doc({ face: "trailer", spineComposed: true }), null, SEAT)).toMatchObject({ ok: true, value: { units: [{ name: "cut", estimate: { usd: 0 } }] } });
  });

  it("recalibrate's guards refuse before the plan: no note, a staged version undecided, the notes' own refusal", () => {
    const msg = (v: ScriptView) => {
      const r = scriptPlan(v, "recalibrate", SEAT);
      return r.ok ? "" : r.error.message;
    };
    expect(msg(doc())).toBe("recalibrate needs a note");
    expect(msg(doc({ notes: 2, staged: true }))).toBe("recalibrate needs the staged version decided");
    expect(msg(doc({ notes: 1, notesRefused: "No notes were sent, so there is nothing to recalibrate." }))).toBe("No notes were sent, so there is nothing to recalibrate.");
    expect(scriptPlan(doc({ notes: 1 }), "recalibrate", SEAT).ok).toBe(true);
    const compose = scriptPlan(doc({ scopeConfirmed: false }), "compose-candidates", SEAT);
    expect(compose.ok ? "" : compose.error.message).toBe("compose candidates needs a confirmed scope");
  });
});

describe("album words and explainer voice", () => {
  it("words are one turn, whatever the recipe's units; live needs an analysed track, dry stands in", () => {
    expect(wordsPlan({ title: "08 Stay", analysed: true, dry: false }, null, SEAT)).toMatchObject({ ok: true, value: { units: [{ name: "metadata" }] } });
    const live = wordsPlan({ title: "08 Stay", analysed: false, dry: false }, null, SEAT);
    expect(live.ok ? "" : live.error.message).toBe('words need an analysed track: no music-video record is titled "08 Stay"');
    expect(wordsPlan({ title: "08 Stay", analysed: false, dry: true }, null, SEAT).ok).toBe(true);
  });

  it("a take per line, or the one line a target names; a live job on an option with no engine is refused", () => {
    const lines = [{ id: "line-c1", text: "Bitcoin is scarce." }, { id: "line-c2", text: "Scarcity is not price." }];
    const free = (): UnitPrice => FREE;
    expect(voicePlan({ lines, engine: null, dry: true }, null, free)).toMatchObject({ ok: true, value: { units: [{ name: "line:line-c1" }, { name: "line:line-c2" }] } });
    expect(voicePlan({ lines, engine: null, dry: true }, "record-line", free, "line-c2")).toMatchObject({ ok: true, value: { units: [{ name: "line:line-c2" }] } });
    const live = voicePlan({ lines, engine: null, dry: false }, null, free);
    expect(live.ok ? "" : live.error.message).toBe(NO_VOICE_ENGINE);
    const none = voicePlan({ lines: [], engine: "eleven_multilingual_v2", dry: false }, null, free);
    expect(none.ok ? "" : none.error.message).toBe(NO_LINES);
  });

  it("an engine speaks live, and every line carries ITS OWN price - the characters it bills", () => {
    const lines = [{ id: "line-c1", text: "Bitcoin is scarce." }, { id: "line-c2", text: "Scarcity is not the same thing as price." }];
    const perChar = (l: { readonly text: string }): UnitPrice => ({ seconds: 120, usd: l.text.length * 0.00008 });
    const p = voicePlan({ lines, engine: "eleven_multilingual_v2", dry: false }, "record-line", perChar, undefined, (l) => ({ chars: l.text.length }));
    if (!p.ok) throw p.error;
    expect(p.value.units.map((u) => u.estimate.usd)).toEqual([18 * 0.00008, 40 * 0.00008]);
    expect(p.value.units.map((u) => u.input)).toEqual([
      { id: "line-c1", text: "Bitcoin is scarce.", chars: 18 },
      { id: "line-c2", text: "Scarcity is not the same thing as price.", chars: 40 },
    ]);
  });
});
