import { describe, expect, it } from "vitest";

import { err, ok } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { Output } from "@gt/kernel/job-core";

import { defineStyleProducer, stylePlan, styleRequestSchema, type StyleRequest } from "../src/style/define.ts";

// The style producer's plan (the drive itself, over a temp store, is
// tests/next-server/style-real.test.ts): which steps a request still owes, and that the request
// the plan reads is the one read before the drive's transaction opened.

const PLATE = { seconds: 20, usd: 0.045 };
const proofs: StyleRequest = { kind: "generate-proofs", styleId: "painted", rev: 4, digest: "deadbeef", trialIds: ["peak-and-fall", "flywheel"], by: "op", estimate: PLATE };
const adopt: StyleRequest = { kind: "adopt", styleId: "painted", rev: 2, by: "op", estimate: { seconds: 8, usd: null, unpricedReason: "tokens are counted after the call" } };
const done = (...names: string[]): Map<string, Output> => new Map(names.map((n) => [n, { step: n, value: {}, at: "2026-10-17T00:00:00.000Z" }]));
const job = { id: "job:style:painted:abc" } as Job;

describe("stylePlan", () => {
  it("owes one plate per trial in the receipt's order, then the landing", () => {
    expect(stylePlan(proofs, done()).map((s) => s.name)).toEqual(["proof:peak-and-fall", "proof:flywheel", "land"]);
    expect(stylePlan(proofs, done()).at(0)?.estimate).toEqual(PLATE);
  });
  it("never owes a booked step again: a retry renders only what is missing", () => {
    expect(stylePlan(proofs, done("proof:peak-and-fall")).map((s) => s.name)).toEqual(["proof:flywheel", "land"]);
    expect(stylePlan(proofs, done("proof:peak-and-fall", "proof:flywheel", "land"))).toEqual([]);
  });
  it("adopts in two steps: the palette read, then the landing", () => {
    expect(stylePlan(adopt, done()).map((s) => s.name)).toEqual(["palette", "land"]);
    expect(stylePlan(adopt, done("palette")).map((s) => s.name)).toEqual(["land"]);
  });
});

describe("the request is read outside the drive's transaction", () => {
  it("plans from the request health read, and fails loudly when planned before it", async () => {
    let reads = 0;
    const p = defineStyleProducer("cloud.google", {
      request: () => {
        reads++;
        return ok(proofs);
      },
      palette: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
      plate: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
      land: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
    });
    expect(() => p.plan(job, done())).toThrow("planned before its request was read");
    expect(await p.health?.(job)).toEqual({ ok: true });
    expect(p.plan(job, done()).map((s) => s.name)).toEqual(["proof:peak-and-fall", "proof:flywheel", "land"]);
    await p.health?.(job);
    expect(reads).toBe(1);
  });
  it("a request that cannot be read fails the plan with its sentence, and is read again next drive", async () => {
    let reads = 0;
    const p = defineStyleProducer("cloud.google", {
      request: () => (++reads === 1 ? err("not-found", "job carries no style request") : ok(adopt)),
      palette: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
      plate: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
      land: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
    });
    await p.health?.(job);
    expect(() => p.plan(job, done())).toThrow("job carries no style request");
    await p.health?.(job);
    expect(p.plan(job, done()).map((s) => s.name)).toEqual(["palette", "land"]);
  });
});

describe("the request a job carries is read through the same rule the act was asked under", () => {
  it("refuses a trial named twice, as the atelier's act door does: two priced plates the landing would refuse", () => {
    expect(styleRequestSchema.safeParse(proofs).success).toBe(true);
    expect(styleRequestSchema.safeParse({ ...proofs, trialIds: ["flywheel", "flywheel"] }).success).toBe(false);
  });
});

describe("the request is kept only while its job can still be driven", () => {
  it("an ended job lets its request go (the worker's producer outlives every job), and a re-drive reads it again", async () => {
    let reads = 0;
    const p = defineStyleProducer("cloud.google", {
      request: () => {
        reads++;
        return ok(proofs);
      },
      palette: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
      plate: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
      land: async () => ({ kind: "fatal", code: "internal", message: "unused" }),
    });
    await p.health?.(job);
    await p.settle?.(job, "done");
    expect(() => p.plan(job, done())).toThrow("planned before its request was read");
    await p.health?.(job);
    expect(reads).toBe(2);
    expect(p.plan(job, done()).map((s) => s.name)).toEqual(["proof:peak-and-fall", "proof:flywheel", "land"]);
  });
});
