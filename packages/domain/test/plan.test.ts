import type { z } from "zod";
import { describe, expect, expectTypeOf, it } from "vitest";

import { partStatesOf, runStateOf, weakest, type PartFacts } from "../src/plan.ts";
import { composeInputSchema, composerInputSchema, NATIVE_PRODUCERS, partPatchSchema, producerRunInputSchema, runInputSchema } from "../src/produce.schema.ts";
import type { ComposeInput, PartPatch, ProducerRunInput } from "../src/produce.ts";
import { PRODUCERS } from "../src/run.ts";
import { accept, refuse } from "./_records.ts";

// The film's shape, by key (studio.js RECIPES.film).
const FILM = [
  { id: "research", kind: "research", after: [] },
  { id: "script", kind: "script", after: ["research"] },
  { id: "frames", kind: "frames", after: ["script"] },
  { id: "gate:frames", kind: "gate", after: ["frames"] },
  { id: "motion", kind: "motion", after: ["gate:frames"] },
  { id: "score", kind: "score", after: ["script"] },
  { id: "gate:score", kind: "gate", after: ["score"] },
  { id: "cut", kind: "cut", after: ["motion", "gate:score"] },
  { id: "gate:cut", kind: "gate", after: ["cut"] },
  { id: "slot", kind: "slot", after: ["gate:cut"] },
];
const planned: PartFacts = { job: "planned" };

describe("partStatesOf", () => {
  it("reads every part of an unlaunched plan as a draft, whatever facts exist", () => {
    const s = partStatesOf(FILM, new Map([["research", { job: "running" }]]), false);
    expect([...s.values()].every((x) => x === "draft")).toBe(true);
  });
  it("reads a planned job as waiting, and as blocked behind a failed upstream", () => {
    const facts = new Map<string, PartFacts>([
      ["research", { job: "done" }],
      ["script", { job: "failed" }],
      ["frames", planned],
      ["score", planned],
      ["motion", planned],
      ["cut", planned],
    ]);
    const s = partStatesOf(FILM, facts, true);
    expect(s.get("research")).toBe("ratified");
    expect(s.get("script")).toBe("failed");
    expect(s.get("frames")).toBe("blocked");
    expect(s.get("gate:frames")).toBe("blocked");
    // an operator pause is not a wait for upstream: it reads paused
    expect(partStatesOf(FILM, new Map([["research", { job: "paused" }]]), true).get("research")).toBe("paused");
  });
  it("opens a gate at the Weir only once the part it judges is ratified, and ratifies it on commit", () => {
    const done = new Map<string, PartFacts>([
      ["research", { job: "done" }],
      ["script", { job: "done" }],
      ["frames", { job: "done" }],
      ["score", { job: "running" }],
    ]);
    const s = partStatesOf(FILM, done, true);
    expect(s.get("gate:frames")).toBe("awaiting_gate");
    expect(s.get("gate:score")).toBe("queued");
    expect(s.get("motion")).toBe("queued");
    done.set("gate:frames", { packet: "committed" });
    expect(partStatesOf(FILM, done, true).get("gate:frames")).toBe("ratified");
    done.set("gate:frames", { packet: "rejected" });
    const rejected = partStatesOf(FILM, done, true);
    expect(rejected.get("gate:frames")).toBe("failed");
    expect(rejected.get("motion")).toBe("blocked");
  });
  it("reads interrupted and cancelled jobs as failed: both need the operator", () => {
    for (const job of ["interrupted", "cancelled"] as const) expect(partStatesOf(FILM, new Map([["research", { job }]]), true).get("research")).toBe("failed");
  });
  it("puts a slot at the Weir once everything before it is ratified, until it is placed", () => {
    const all = new Map<string, PartFacts>(FILM.map((p) => [p.id, p.kind === "gate" ? { packet: "committed" } : { job: "done" }]));
    expect(partStatesOf(FILM, all, true).get("slot")).toBe("awaiting_gate");
    all.set("slot", { slotted: true });
    expect([...partStatesOf(FILM, all, true).values()].every((x) => x === "ratified")).toBe(true);
  });
  it("reads a cycle as blocked instead of recursing forever", () => {
    const s = partStatesOf([{ id: "a", kind: "cut", after: ["b"] }, { id: "b", kind: "cut", after: ["a"] }], new Map(), true);
    expect(s.size).toBe(2);
  });
});

describe("runStateOf", () => {
  it("maps a job and its pile's packet to the Floor's words", () => {
    expect(runStateOf("queued")).toBe("queued");
    expect(runStateOf("paused")).toBe("queued");
    expect(runStateOf("done")).toBe("awaiting_gate");
    expect(runStateOf("done", "committed")).toBe("ratified");
    expect(runStateOf("interrupted")).toBe("blocked");
    expect(runStateOf("cancelled")).toBe("cancelled");
  });
});

describe("weakest", () => {
  it("one illustrative figure makes a sum illustrative", () => {
    expect(weakest(["real", "model"])).toBe("model");
    expect(weakest(["real", "illustrative", "model"])).toBe("illustrative");
    expect(weakest([])).toBe("real");
  });
});

describe("produce doors", () => {
  it("accepts each composer lane's shape and refuses a mixed image target", () => {
    accept(composerInputSchema, { lane: "image", text: "harbour at dusk", mechanisms: ["text"], styleId: "ink-graphic-novel" });
    accept(composerInputSchema, { lane: "image", text: "harbour at dusk", mechanisms: ["text", "ref-early"], sweep: true });
    refuse(composerInputSchema, { lane: "image", text: "x", mechanisms: ["text"], styleId: "s", sweep: true }, "Invalid");
    refuse(composerInputSchema, { lane: "image", text: "x", mechanisms: [] }, "Invalid");
    accept(composerInputSchema, { lane: "video", text: "x", subject: "edu-radar" });
  });
  it("accepts each producer's own launch in its own terms, and refuses a mixed or unknown shape", () => {
    const own: ProducerRunInput[] = [
      { producer: "extract", slug: "harbour", sources: 12, folder: "C:/galleries/harbour", rounds: 2, grouping: "none" },
      { producer: "article", subject: "software-engineering/background-jobs", angle: "the sweep" },
      { producer: "article", topic: "why a receipt comes first" },
      { producer: "mv", track: "album-a/03-tide" },
      { producer: "suno", proposal: "p-rain" },
      { producer: "strips", lane: "all", only: ["E05", "S06"] },
      { producer: "forge", plan: "sweep-01" },
      { producer: "dojo", cycle: "2026-10-16-c1" },
      { producer: "hunt", hunt: "hn-a1b2c3", kind: "music", leaves: ["n-calm", "n-tense"] },
    ];
    for (const i of own) expect(accept(producerRunInputSchema, i)).toEqual(i);
    // One door for a Run's input: a composer's and a producer's both pass, nothing else does.
    accept(runInputSchema, { lane: "audio", text: "rain", kind: "music" });
    accept(runInputSchema, own[3]);
    refuse(producerRunInputSchema, { producer: "article", subject: "background-jobs" }, "bundle/slug");
    refuse(producerRunInputSchema, { producer: "article", subject: "a/b", topic: "both" }, "Invalid");
    refuse(producerRunInputSchema, { producer: "extract", slug: "Harbour Night", sources: 3 }, "lower-case");
    refuse(producerRunInputSchema, { producer: "mv", track: "t", bytes: "..." }, "bytes");
    refuse(runInputSchema, { producer: "cut", cut: "c1" }, "Invalid");
    // A hunt run names the leaves it renders, never none and never a path.
    refuse(producerRunInputSchema, { producer: "hunt", hunt: "hn-a1b2c3", kind: "music", leaves: [] }, "Too small");
    refuse(producerRunInputSchema, { producer: "hunt", hunt: "../hunts", kind: "sfx", leaves: ["n1"] }, "sound-store id");
    // Every native producer is a producer the domain names, and each has its branch.
    for (const p of NATIVE_PRODUCERS) expect(PRODUCERS).toContain(p);
    expect(new Set(own.map((i) => i.producer))).toEqual(new Set(NATIVE_PRODUCERS));
    expectTypeOf<z.output<typeof producerRunInputSchema>["producer"]>().toEqualTypeOf<ProducerRunInput["producer"]>();
  });
  it("holds the compose and part-change shapes to the contract", () => {
    const c = accept(composeInputSchema, { recipe: "explainer", topic: "provider routing", units: { cards: 6 } });
    expectTypeOf(c).toMatchTypeOf<{ recipe: string }>();
    const asContract: ComposeInput = { recipe: c.recipe, ...(c.topic === undefined ? {} : { topic: c.topic }) };
    expect(asContract.topic).toBe("provider routing");
    refuse(composeInputSchema, { recipe: "explainer", units: { frames: 3 } }, "units");
    const patch: PartPatch = accept(partPatchSchema, { units: 12 });
    expect(patch.units).toBe(12);
    refuse(partPatchSchema, {}, "option, units");
  });
});
