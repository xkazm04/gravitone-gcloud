import { closeAll, disposeRoot, open, operator, ROOT } from "./producer-strips-harness.ts";

import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { parseAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import type { ComposerInput } from "@gt/domain/produce";
import { get } from "@gt/kernel/job";
import { loadRun } from "@gt/kernel/records/schema";

import { makeRealProduce } from "../../app/(studio)/projects/_port/real.ts";
import { DEFAULT_OPTIONS, DEFAULT_SELECTION } from "../../lib/foundry/strips/cards.ts";
import { readStripRunNow } from "../../lib/foundry/strips/store.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { driveStrips, launchStrips, stripsKernel, type StripsTarget } from "../../lib/producers/strips.ts";
import { runCli } from "../../pipeline/strips/run.mts";

// A strip run's launch is a receipt, then a confirm (COMMON decision 3), and every door -
// launchStrips, the CLI, the Floor's video composer and the Runs acts - writes a `runs` row
// and acts on THE SAME job. (Phase 6 L67: the third door was POST /api/foundry/strips, the
// v1 Strips tab's route, which wave C deletes; the Floor and Runs are the screens now.) The CLI keeps its flags and gains --json (one document), exit 0/1/2, --budget-usd,
// --dry (a dry JOB) and --detach. Every store is a temp file, and GRAVITONE_DRY_ONLY=1
// stands for the test lane: nothing here may arm live.

const ENV = { GRAVITONE_STORE_PATH: path.join(ROOT, "entry.sqlite"), GRAVITONE_DRY_ONLY: "1" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
});
afterAll(() => {
  closeKernel();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  disposeRoot();
});
afterEach(() => closeAll());

const jid = (id: string) => {
  const p = parseAt("job id", jobIdSchema, id);
  if (!p.ok) throw p.error;
  return p.value;
};

async function cli(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, { env: { ...process.env, ...ENV }, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}
const docSchema = z.object({ ok: z.boolean(), runId: z.string().optional(), jobId: z.string().optional(), outcome: z.string().optional(), job: z.object({ state: z.string(), mode: z.string() }).nullable().optional(), run: z.object({ status: z.string(), dry: z.boolean() }).optional() }).loose();
const parseDoc = (s: string) => docSchema.parse(JSON.parse(s));

// The Floor's and Runs' server side (app/(studio)/projects/_port/real.ts) over THIS process's
// kernel - the one the CLI below opens from GRAVITONE_STORE_PATH - exactly as the app binds it.
const floor = makeRealProduce({
  store: () => {
    const k = kernel();
    return k.ok ? { ok: true, value: k.value.store } : k;
  },
  strips: () => stripsKernel(),
  env: () => ({ ...process.env, ...ENV }),
  now: () => Date.now(),
  mint: () => `t${++n}`,
});
const who = { who: "kazda" };
async function v<T>(r: Result<T> | Promise<Result<T>>): Promise<T> {
  const x = await r;
  if (!x.ok) throw new Error(`${x.error.code}: ${x.error.message}`);
  return x.value;
}

let n = 0;
const target = (sel: Partial<typeof DEFAULT_SELECTION> = { only: ["E01"] }): StripsTarget => ({ kind: "new", runId: `entry-${++n}`, selection: { ...DEFAULT_SELECTION, ...sel }, options: DEFAULT_OPTIONS });

describe("launch: a receipt, then a confirm", () => {
  it("prices the worst case, writes the Run row on confirm, and enqueues one dry job on seat.text the drive finishes", async () => {
    const w = open();
    const base = { mode: "dry" as const, actor: operator, dryOnly: true, binding: { kernel: w.strips } };
    const t = target({ only: ["E01", "E07"] });
    const r0 = await launchStrips(t, base);
    if (!r0.ok || r0.value.kind !== "receipt") throw new Error(JSON.stringify(r0));
    expect(r0.value.cards).toEqual(["edu-rate-hike--E01", "edu-chokepoint--E07"]);
    // Two cards, three turns each at $3.20, and one supporting image.
    expect(r0.value.receipt.totals.usd).toBeGreaterThanOrEqual(19.2);
    expect(r0.value.receipt.lines[0]?.lane).toBe("seat.text");
    const r1 = await launchStrips(t, { ...base, token: r0.value.receipt.token });
    if (!r1.ok || r1.value.kind !== "launched") throw new Error(JSON.stringify(r1));
    expect(r1.value.jobId).toBe(`job:run:${t.runId}`);
    const job = get(w.kernel.store, jid(r1.value.jobId));
    expect(job.ok && [job.value.job.lane, job.value.job.mode.kind, job.value.job.producer]).toEqual(["seat.text", "dry", "strips"]);
    const row = w.kernel.store.read((x) => loadRun(x, t.runId));
    expect(row.ok && row.value.run.input).toEqual({ producer: "strips", lane: "all", only: ["E01", "E07"] });
    expect(readStripRunNow(t.runId).job).toBe(r1.value.jobId);
    const d = await driveStrips(r1.value.jobId, { binding: { kernel: w.strips } });
    expect(d.ok && d.value.outcome).toBe("done");
  });

  it("a stale token confirms nothing; a ceiling under the worst case is a stop point, not a refusal", async () => {
    const w = open();
    const base = { mode: "dry" as const, actor: operator, dryOnly: true, ceilingUsd: 1, binding: { kernel: w.strips } };
    const t = target();
    const r0 = await launchStrips(t, base);
    if (!r0.ok || r0.value.kind !== "receipt") throw new Error("no receipt");
    expect(r0.value.receipt.overCeiling).toBe(true);
    const stale = await launchStrips(t, { ...base, token: "0".repeat(64) });
    expect(stale.ok && stale.value.kind).toBe("stale");
    const r1 = await launchStrips(t, { ...base, token: r0.value.receipt.token });
    expect(r1.ok && r1.value.kind).toBe("launched");
  });

  it("refuses a card whose brief is missing before anything is written", async () => {
    const w = open();
    const r = await launchStrips(target({ only: ["NOPE"] }), { mode: "dry", actor: operator, dryOnly: true, binding: { kernel: w.strips } });
    expect(r.ok).toBe(false);
  });
});

describe("the CLI, the Floor and Runs act on the same job", () => {
  it("the CLI enqueues a dry job (--detach); Runs draws THAT job and pauses and resumes it; --resume drives it; --status reads it", async () => {
    const r = await cli(["--run", "entry-cli", "--only", "E01", "--controls", "--dry", "--detach", "--json"]);
    expect(r.code, r.err).toBe(0);
    const d = parseDoc(r.out);
    expect([d.jobId, d.job?.state, d.job?.mode]).toEqual(["job:run:entry-cli", "queued", "dry"]);

    // Runs reads the job the CLI enqueued, and its acts land on that job - not on a second one.
    const drawn = (await v(floor.listJobs())).filter((j) => j.id === "job:run:entry-cli");
    expect(drawn.map((j) => j.state)).toEqual(["queued"]);
    await v(floor.pauseJob({ jobId: "job:run:entry-cli" }, who));
    expect((await cli(["--status", "entry-cli", "--json"])).out).toMatch(/"state":\s*"paused"/);
    await v(floor.resumeJob({ jobId: "job:run:entry-cli" }, who));

    const go = await cli(["--resume", "--run", "entry-cli", "--json"]);
    expect(go.code, go.err).toBe(0);
    expect(parseDoc(go.out)).toMatchObject({ jobId: "job:run:entry-cli", outcome: "done", run: { status: "awaiting-triage", dry: true } });
    const s = await cli(["--status", "entry-cli", "--json"]);
    expect([s.code, parseDoc(s.out).job?.state]).toEqual([0, "done"]);
    expect((await v(floor.listJobs())).filter((j) => j.id === "job:run:entry-cli").map((j) => j.state)).toEqual(["done"]);
  });

  it("the Floor's video composer answers a receipt, then enqueues on its token; a stale token returns the fresh receipt; the CLI reads that job", async () => {
    const input: ComposerInput = { lane: "video", text: "the rate hike, counted", subject: "edu-rate-hike" };
    const receipt = await v(floor.composerReceipt({ input, mode: "dry" }, who));
    // The run id travels in the token (realLaunch.ts): a forged inner token is stale, never a launch.
    const runOf = receipt.token.slice(0, receipt.token.lastIndexOf(":"));
    const stale = await v(floor.launchRun({ input, token: `${runOf}:${"f".repeat(64)}`, mode: "dry" }, who));
    expect(stale.kind).toBe("stale");
    if (stale.kind !== "stale") return;
    expect(stale.fresh.token).toBe(receipt.token);
    const go = await v(floor.launchRun({ input, token: receipt.token, mode: "dry" }, who));
    expect(go.kind).toBe("launched");
    if (go.kind !== "launched") return;
    expect(go.jobId).toBe(`job:run:${runOf}`);
    // The CLI, by the run id the Floor minted, names the same job.
    const s = await cli(["--status", runOf, "--json"]);
    expect(s.code, s.err).toBe(0);
    expect([parseDoc(s.out).jobId, parseDoc(s.out).job?.state, parseDoc(s.out).job?.mode]).toEqual([go.jobId, "queued", "dry"]);
    // Confirming the same receipt again launches nothing new: one job serves a run at a time.
    const again = await floor.launchRun({ input, token: receipt.token, mode: "dry" }, who);
    expect(again.ok ? again.value.kind : again.error.code).toBe("conflict");
  });

  it("exit codes: 2 for usage, 1 for a live launch this process may not arm", async () => {
    expect((await cli(["--lane", "both"])).code).toBe(2);
    expect((await cli(["--budget-usd", "-3"])).code).toBe(2);
    const live = await cli(["--run", "entry-live", "--only", "E03", "--json"]);
    expect(live.code).toBe(1);
    expect(live.out).toMatch(/GRAVITONE_DRY_ONLY/);
  });
});
