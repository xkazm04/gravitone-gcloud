import { describe, expect, it } from "vitest";
import { AppError } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { MissingStep, Producer, StepContext } from "@gt/kernel/job-core";
import { defineMv } from "../src/mv/producer.ts";
import { defineSuno } from "../src/suno/producer.ts";

// The music-video and Suno definitions' FAILURE DOOR over fake ports, driven through `perform`
// with no kernel: what a thrown step becomes for the job, and what the record is told. The
// bound producers' happy paths are tests/next-server/producer-{mv,suno}.test.ts; none of them
// reaches these branches (a budget refusal, a fence lost mid-step, a record that cannot be
// written), so before this file each branch had no driven case.

type Door = {
  readonly name: string;
  readonly file: string;
  /** A real step of the producer, and the producer whose step throws `boom`. */
  readonly step: string;
  readonly make: (boom: () => unknown, fail: (message: string) => Promise<void>) => Producer;
};

const noop = async (): Promise<void> => undefined;

const DOORS: readonly Door[] = [
  {
    name: "mv",
    file: "mv.json",
    step: "fetch",
    make: (boom, fail) =>
      defineMv({
        plan: async () => ({ steps: ["fetch"], supplied: false }),
        step: async () => {
          throw boom();
        },
        land: noop,
        fail: async (_job, message) => fail(message),
      }),
  },
  {
    name: "suno",
    file: "suno.json",
    step: "create:v6",
    make: (boom, fail) =>
      defineSuno({
        create: async () => {
          throw boom();
        },
        land: noop,
        fail: async (_job, message) => fail(message),
      }),
  },
];

const ctx = { job: { id: "job:test" } as Job, meter: { used: () => false } } as unknown as StepContext;
const stepOf = (name: string): MissingStep => ({ name, estimate: { seconds: 1, usd: 0 } });

function rig(d: Door, boom: () => unknown, failWith?: Error) {
  const worn: string[] = [];
  const p = d.make(boom, async (m) => {
    worn.push(m);
    if (failWith !== undefined) throw failWith;
  });
  return { worn, perform: (name = d.step) => p.perform(stepOf(name), ctx) };
}

describe.each(DOORS)("the $name failure door", (d) => {
  it("a budget refusal is a money stop, never a breaker count, and the record wears it", async () => {
    const r = rig(d, () => new AppError("budget", "spend window: $5.00 of $5.00 used"));
    expect(await r.perform()).toEqual({ kind: "money-stop", message: "spend window: $5.00 of $5.00 used" });
    expect(r.worn).toEqual(["spend window: $5.00 of $5.00 used"]);
  });

  it("any other throw fails the job with the engine's sentence verbatim, under its own code", async () => {
    expect(await rig(d, () => new Error("CDP: target closed")).perform()).toEqual({ kind: "fatal", code: "internal", message: "CDP: target closed" });
    expect(await rig(d, () => new AppError("unavailable", "vendor 503")).perform()).toEqual({ kind: "fatal", code: "unavailable", message: "vendor 503" });
  });

  it("a record that cannot be written is said in the same sentence, never swallowed", async () => {
    const r = rig(d, () => new Error("render died"), new Error("EBUSY: locked"));
    expect(await r.perform()).toEqual({ kind: "fatal", code: "internal", message: `render died (and ${d.file} could not record it: EBUSY: locked)` });
  });

  it("a fence lost mid-step passes up untouched and the record is not written: the job is the new holder's", async () => {
    for (const detail of ["taken-over", "released", "expired"]) {
      const lost = new AppError("conflict", "slot fence moved", { detail });
      const r = rig(d, () => lost);
      await expect(r.perform()).rejects.toBe(lost);
      expect(r.worn).toEqual([]);
    }
    // A conflict that is not the fence is an ordinary failure.
    expect(await rig(d, () => new AppError("conflict", "record moved")).perform()).toMatchObject({ kind: "fatal", code: "conflict" });
  });

  it("a process death (not an Error) is not the producer's to record", async () => {
    const sentinel = { crash: true };
    const r = rig(d, () => sentinel);
    await expect(r.perform()).rejects.toBe(sentinel);
    expect(r.worn).toEqual([]);
  });

  it("a step it never planned is refused, not performed", async () => {
    const r = rig(d, () => new Error("unreachable"));
    expect(await r.perform("paint")).toMatchObject({ kind: "fatal", code: "invalid" });
    expect(r.worn).toEqual([]);
  });
});
