import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PART_OPTIONS, type OptionDecl } from "@gt/catalog/partOptions";
import { AppError } from "@gt/domain/errors";
import { parseAt } from "@gt/domain/door";
import { jobSchema, type Job } from "@gt/domain/job";
import type { MissingStep, Producer, StepContext } from "@gt/kernel/job-core";
import type { StepMeter } from "@gt/kernel/spend/meter";
import { defineMv, STUDIO_CREDITS, TEXT_TURN } from "../src/mv/producer.ts";
import { TEXT_SEAT } from "../src/research/facts.ts";
import { defineSuno, SUNO_CREDITS } from "../src/suno/producer.ts";
import { producerSet } from "../src/set.ts";

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

// The failure doors throw before any port is touched: a stub that is called fails the test loudly.
const untouched = (port: string) => (): never => {
  throw new Error(`the failure door touched ${port}`);
};
const job = ((): Job => {
  const j = parseAt("job", jobSchema, {
    id: "job:test",
    of: { kind: "run", id: "test" },
    producer: "mv",
    lane: "cloud.google",
    state: "queued",
    mode: { kind: "dry" },
    attempt: 1,
    progress: { done: 0, total: 1 },
    spend: { usd: 0, unpriced: 0, basis: "reported" },
    failStreak: 0,
  });
  if (!j.ok) throw j.error;
  return j.value;
})();
const meter: StepMeter = {
  reserve: untouched("meter.reserve"),
  settle: untouched("meter.settle"),
  release: untouched("meter.release"),
  book: untouched("meter.book"),
  unpriced: untouched("meter.unpriced"),
  paid: untouched("meter.paid"),
  used: () => false,
  open: () => [],
};
const ctx: StepContext = {
  job,
  fx: { tx: untouched("fx.tx"), blob: untouched("fx.blob"), call: untouched("fx.call") },
  meter,
  outputs: new Map(),
  key: "job:test/1",
  owner: "test",
  deadlineMs: Number.MAX_SAFE_INTEGER,
};
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

describe("the producer set", () => {
  const stub: Producer = { lane: "seat.text", plan: () => [], perform: async () => ({ kind: "produced", output: {} }) };

  it("refuses a name the domain does not know before any job is claimed - a job could never name it", () => {
    const r = producerSet([{ name: "research", producer: stub }, { name: "reserch" as never, producer: stub }]);
    expect(r.ok ? "accepted" : r.error).toMatchObject({ code: "invalid", message: 'producers: "reserch" is not a producer the domain names' });
  });
});

// A credit-priced call carries its reason twice: the catalog's option (what the receipt says
// before the job) and the producer's constant (what the meter books on the job). They are two
// hand-copied literals in two packages, so a reword of one leaves the receipt and the ledger
// telling the operator different things about the same bill.
describe("the credit sentences agree with the catalog", () => {
  const unpricedOf = (provider: string): string[] =>
    Object.values(PART_OPTIONS)
      .flatMap((k) => k.options)
      .filter((o: OptionDecl) => o.provider === provider)
      .map((o) => (o.via === "router" ? o.fallback : o.usd))
      .flatMap((u) => (u !== undefined && "unpriced" in u ? [u.unpriced] : []));

  it.each([
    ["leonardo-studio", STUDIO_CREDITS],
    ["suno", SUNO_CREDITS],
  ])("%s: every catalog option's reason is the producer's", (provider, sentence) => {
    const reasons = unpricedOf(provider);
    expect(reasons.length, `the catalog prices no ${provider} option as unpriced`).toBeGreaterThan(0);
    expect(new Set(reasons)).toEqual(new Set([sentence]));
  });

  // One literal per sentence: the producers' constants are the catalog's exports, not copies the
  // parity check above has to keep equal.
  it.each([
    ["Suno bills subscription credits, not dollars"],
    ["Leonardo studio credits from the prepaid plan"],
  ])("%s... is typed once under packages/*/src", (head) => {
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".ts") ? [join(d, e.name)] : []));
    const root = join(import.meta.dirname, "..", "..");
    const copies = ["catalog", "producers"].flatMap((p) => walk(join(root, p, "src"))).filter((f) => readFileSync(f, "utf8").includes(head));
    expect(copies.map((f) => f.replace(root, "").split("\\").join("/"))).toEqual(["/catalog/src/partOptions.ts"]);
  });

  it("the music video's text turn is the research producers' text seat, word for word", () => {
    expect(TEXT_TURN).toBe(TEXT_SEAT);
  });
});
