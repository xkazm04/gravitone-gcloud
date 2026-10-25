// THE FIXTURE PRODUCE SIDE ANSWERS WHAT THE REAL SIDE ANSWERS (app/(studio)/projects/_port).
// GRAVITONE_PRODUCE_SIDE=fixture is how the Plan, Compose, the Floor composers and the Runs acts are
// built, photographed and driven by the fixture lane (tests/live/produce.live.spec.ts), and the MCP
// door answers from the same side. A state the fixture reaches and the kernel cannot (a crashed job
// resumed past its hold, a lane an agent acknowledged) is a screen designed against a port that does
// not exist. Each case drives one verb on BOTH sides and pins the outcome: the code, and the words
// where a toast or an error line shows them, with the job's id put back as the kernel names it.
//
// The real side is the real port over a real kernel in a temp file; nothing here opens the
// operator's store, spends, or runs a worker (the one drive is a producer that refuses its step).

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-produce-parity-"));
  // Every store a real verb could touch is the test's own (CLAUDE.md: never the operator's).
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "process-store.sqlite");
  process.env["STRIPS_STORE_DIR"] = path.join(dir, "strips");
  process.env["FOUNDRY_DIR"] = path.join(dir, "catalogue");
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["FOUNDRY_RUNS_DIR"] = path.join(dir, "runs");
  return dir;
});

import path from "node:path";
import { rmSync } from "node:fs";

import { RECIPES } from "@gt/catalog/recipes";
import { AppError, ok, type Result } from "@gt/domain/errors";
import type { Producer } from "@gt/kernel/job-core";
import { list } from "@gt/kernel/job";
import { runJob } from "@gt/kernel/job-run";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import { openKernel } from "@gt/kernel/kernel";
import { closeProcessKernel } from "@gt/kernel/process";

import { fixtureProduce } from "../../app/(studio)/projects/_port/port.ts";
import { resetProduce } from "../../app/(studio)/projects/_port/fixture.ts";
import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";

const T0 = Date.parse("2026-10-16T09:00:00.000Z");
const k = openKernel(path.join(ROOT, "store.sqlite"), { clock: () => new Date(T0) });
if (!k.ok) throw k.error;
const store = k.value.store;
const fx = liveEffects(store, blobStore(path.join(ROOT, "blobs")));
afterAll(() => {
  k.value.close();
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});
let n = 0;
const env: Record<string, string | undefined> = { GRAVITONE_DRY_ONLY: "1" };
const real = makeRealProduce({ store: () => ok(store), strips: () => ok({ store, fx }), env: () => env, now: () => T0, cwd: () => process.cwd(), mint: () => `p${++n}` });
const fixture = fixtureProduce();
const op = { who: "op-test" };

beforeEach(() => resetProduce(T0));

/** A verb's outcome as a comparable shape: the code, and the message with `id` spelled `<job>`. */
async function said<T>(r: Result<T> | Promise<Result<T>>, id = "\u0000"): Promise<string> {
  const x = await r;
  return x.ok ? "ok" : `${x.error.code}: ${x.error.message.split(id).join("<job>")}`;
}

/** A launched film on the real side: research queued, the rest planned behind it. */
async function realFilm(): Promise<{ readonly id: string; readonly research: string }> {
  const c = await real.compose({ recipe: "film/short-educational-video" }, op);
  if (!c.ok) throw c.error;
  const id = c.value.id;
  const plan = real.loadPlan({ id });
  if (!plan.ok) throw plan.error;
  const receipt = real.planReceipt({ id });
  if (!receipt.ok) throw receipt.error;
  const l = real.launchPlan({ id, rev: plan.value.project.rev, token: receipt.value.token }, op);
  if (!l.ok || l.value.kind !== "launched") throw new Error("expected a launch");
  return { id, research: `job:part:${id}/research` };
}

/** Drive a real job to `failed`: its producer refuses the one step it plans. */
async function failReal(jobId: string): Promise<void> {
  const refuses: Producer = {
    lane: "seat.text",
    plan: (_j, outputs) => (outputs.has("a") ? [] : [{ name: "a", estimate: { seconds: 1, usd: 0 } }]),
    perform: () => Promise.reject(new AppError("invalid", "the step refused its input")),
  };
  await runJob(fx, refuses, jobId);
  const j = list(store);
  if (!j.ok || j.value.find((x) => x.id === jobId)?.state !== "failed") throw new Error(`expected ${jobId} failed`);
}

const fixtureState = (jobId: string): string | undefined => {
  const j = fixture.listJobs();
  return j.ok ? j.value.find((x) => x.id === jobId)?.state : undefined;
};

describe("a resume takes a paused job back to its queue, and nothing else", () => {
  it("refuses a failed or interrupted job on both sides, in the kernel's words, and moves nothing", async () => {
    const { research } = await realFilm();
    await failReal(research);
    const realSaid = await said(real.resumeJob({ jobId: research }, op), research);
    expect(realSaid).toBe("refused: job <job> is failed; only a paused job resumes");
    // The fixture's seeded crash holds its lane, and its gate-failed frames wait on a new route.
    const interrupted = "job:run:run-seed-suno";
    const failed = "job:part:the-quiet-tariff:frames";
    expect(await said(fixture.resumeJob({ jobId: failed }, op), failed)).toBe(realSaid);
    expect(await said(fixture.resumeJob({ jobId: interrupted }, op), interrupted)).toBe("refused: job <job> is interrupted; only a paused job resumes");
    expect([fixtureState(failed), fixtureState(interrupted)]).toEqual(["failed", "interrupted"]);
  });
});

describe("an acknowledgement is of a lane that holds", () => {
  it("refuses a lane nothing holds on both sides, in the kernel's words", async () => {
    const realSaid = await said(real.ackLane({ lane: "cloud.google" }, op));
    expect(realSaid).toBe("refused: lane cloud.google is not held");
    expect(await said(fixture.ackLane({ lane: "cloud.google" }, op))).toBe(realSaid);
  });
});

describe("what only an operator may do, an agent is refused on both sides", () => {
  const agent = { who: "athena", kind: "agent" } as const;

  it("an agent's acknowledgement of a held lane", async () => {
    const realSaid = await said(real.ackLane({ lane: "box.chrome" }, agent));
    expect(realSaid).toBe("refused: lane box.chrome: only an operator acknowledges a held lane; agent athena may not");
    // The fixture's seeded Suno crash holds box.chrome: the agent's look is refused and the hold stays.
    expect(await said(fixture.ackLane({ lane: "box.chrome" }, agent))).toBe(realSaid);
    const holds = fixture.listHolds();
    expect(holds.ok && holds.value.map((h) => h.lane)).toEqual(["box.chrome"]);
  });

  it("an agent's retry of a failed job", async () => {
    const { research } = await realFilm();
    await failReal(research);
    const realSaid = await said(real.retryJob({ jobId: research }, agent), research);
    expect(realSaid).toBe("refused: job <job>: only an operator retries a failed job; agent athena may not");
    const failed = "job:part:the-quiet-tariff:frames";
    expect(await said(fixture.retryJob({ jobId: failed }, agent), failed)).toBe(realSaid);
    expect(fixtureState(failed)).toBe("failed");
  });

  it("an agent's re-route of a failed job onto another lane, receipt then confirm", async () => {
    const { research } = await realFilm();
    await failReal(research);
    const option = "research/google/gemini-3.1-pro-preview";
    const token = async (side: typeof real | typeof fixture, jobId: string, opt: string): Promise<string> => {
      const r = await side.reroute({ jobId, option: opt }, agent);
      if (!r.ok || r.value.kind !== "receipt") throw new Error(`expected a receipt, got ${JSON.stringify(r)}`);
      return r.value.receipt.token;
    };
    const realSaid = await said(real.reroute({ jobId: research, option, token: await token(real, research, option) }, agent), research);
    expect(realSaid).toBe("refused: job <job>: only an operator re-routes a failed job; agent athena may not");
    const failed = "job:part:the-quiet-tariff:frames";
    const options = fixture.rerouteOptions({ jobId: failed });
    const other = options.ok ? options.value.find((o) => !o.current) : undefined;
    if (other === undefined) throw new Error("the fixture's frames job has no other route");
    expect(await said(fixture.reroute({ jobId: failed, option: other.option.key, token: await token(fixture, failed, other.option.key) }, agent), failed)).toBe(realSaid);
    expect(fixtureState(failed)).toBe("failed");
  });
});

describe("only a waiting job moves in its lane's line", () => {
  it("refuses a job out of the line in the kernel's words on both sides, not as the line's end", async () => {
    const { research } = await realFilm();
    await failReal(research);
    const realSaid = await said(real.moveJob({ jobId: research, dir: "earlier" }, op), research);
    expect(realSaid).toBe("refused: job <job> is failed; only a waiting job (queued or planned) moves in the line");
    const failed = "job:part:the-quiet-tariff:frames";
    expect(await said(fixture.moveJob({ jobId: failed, dir: "earlier" }, op), failed)).toBe(realSaid);
  });
});

describe("a rename is a project's, launched or not, and the same words write nothing", () => {
  const revOf = (side: typeof real, id: string): number => {
    const p = side.loadPlan({ id });
    if (!p.ok) throw p.error;
    return p.value.project.rev;
  };
  const rename = async (side: typeof real, id: string, title: string): Promise<{ said: string; moved: number }> => {
    const rev = revOf(side, id);
    const s = await said(side.rename({ id, rev, title }, op));
    return { said: s, moved: revOf(side, id) - rev };
  };

  it("renames a launched plan on both sides", async () => {
    const { id } = await realFilm();
    const realSaid = await rename(real, id, "The harbour, renamed");
    expect(realSaid).toEqual({ said: "ok", moved: 1 });
    expect(await rename(fixture, "glass-harbor-trailer", "The harbour, renamed")).toEqual(realSaid);
  });

  it("answers its own title unchanged, at the revision it was read at", async () => {
    const c = await real.compose({ recipe: "film/short-form-clip" }, op);
    if (!c.ok) throw c.error;
    const p = real.loadPlan({ id: c.value.id });
    if (!p.ok) throw p.error;
    const realSaid = await rename(real, c.value.id, p.value.project.title);
    expect(realSaid).toEqual({ said: "ok", moved: 0 });
    expect(await rename(fixture, "untitled-port-strike", "Untitled — the port strike")).toEqual(realSaid);
  });
});

describe("a composed project is titled and keeps its picks by the kernel's rule", () => {
  const titled = async (side: typeof real, input: Parameters<typeof real.compose>[0]): Promise<{ title: string; topic?: string }> => {
    const c = await side.compose(input, op);
    if (!c.ok) throw c.error;
    const p = side.loadPlan({ id: c.value.id });
    if (!p.ok) throw p.error;
    return { title: p.value.project.title, ...(p.value.project.topic === undefined ? {} : { topic: p.value.project.topic }) };
  };

  it("every recipe composed with no picks is titled alike on both sides", async () => {
    const differ: string[] = [];
    for (const r of RECIPES) {
      const [a, b] = [await titled(real, { recipe: r.id }), await titled(fixture, { recipe: r.id })];
      if (a.title !== b.title) differ.push(`${r.id}: real "${a.title}", fixture "${b.title}"`);
    }
    expect(RECIPES.length).toBeGreaterThan(10);
    expect(differ).toEqual([]);
  });

  it("an article keeps the topic it was composed on, as an explainer does", async () => {
    for (const recipe of ["article/post", "explainer"]) {
      const input = { recipe, topic: "cost-metering" };
      expect((await titled(fixture, input)).topic).toBe((await titled(real, input)).topic);
    }
  });
});

describe("a composed project's id is its title's slug on both sides", () => {
  it("cuts a long title at 40 without leaving a dash before the suffix", async () => {
    const title = `${"a".repeat(39)} b`;
    const stem = async (side: typeof real): Promise<string> => {
      const c = await side.compose({ recipe: "film/short-form-clip", title }, op);
      if (!c.ok) throw c.error;
      return c.value.id.replace(/-[^-]*$/, "");
    };
    const realStem = await stem(real);
    expect(realStem).toBe("a".repeat(39));
    expect(await stem(fixture)).toBe(realStem);
  });
});

describe("a draft's part write is refused for the kernel's reasons, in its words", () => {
  type Patch = Parameters<typeof real.setPart>[0]["patch"];
  const cases: readonly (readonly [string, string, Patch])[] = [
    ["a verdict has no model", "gate:frames", { units: 2 }],
    ["fixed units", "research", { units: 2 }],
    ["units out of range", "frames", { units: 999 }],
    ["an option the kind does not have", "frames", { option: "frames/nobody/nothing" }],
  ];
  const write = async (side: typeof real, id: string, sep: string, key: string, patch: Patch, rev?: number): Promise<string> => {
    const p = side.loadPlan({ id });
    if (!p.ok) throw p.error;
    return said(side.setPart({ id, rev: rev ?? p.value.project.rev, partId: `${id}${sep}${key}`, patch }, op), id);
  };

  it.each(cases)("%s", async (_name, key, patch) => {
    const c = await real.compose({ recipe: "film/short-form-clip" }, op);
    if (!c.ok) throw c.error;
    const realSaid = await write(real, c.value.id, "/", key, patch);
    expect(realSaid).toMatch(/^(refused|invalid): /);
    expect((await write(fixture, "untitled-port-strike", ":", key, patch)).replace(/:frames|:research|:gate:frames/g, (m) => `/${m.slice(1)}`)).toBe(realSaid);
  });

  it("a write on an old revision, and a launched part's", async () => {
    const c = await real.compose({ recipe: "film/short-form-clip" }, op);
    if (!c.ok) throw c.error;
    const stale = await write(real, c.value.id, "/", "frames", { units: 3 }, 99);
    expect(await write(fixture, "untitled-port-strike", ":", "frames", { units: 3 }, 99)).toBe(stale);
    const { id } = await realFilm();
    const launched = await write(real, id, "/", "frames", { units: 3 });
    expect(await write(fixture, "glass-harbor-trailer", ":", "frames", { units: 3 })).toBe(launched);
  });
});
