import { closeAll, disposeRoot, open, operator, ROOT } from "./producer-strips-harness.ts";

import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
// The guard is not what is under test here (tests/next-server/route.test.ts is); the route behind it is.
vi.mock("../../lib/apiAuth.ts", () => ({ guardRequest: async () => null, guardAccessOnly: async () => null }));

import { parseAt } from "@gt/domain/door";
import { jobIdSchema } from "@gt/domain/ids";
import { get } from "@gt/kernel/job";
import { loadRun } from "@gt/kernel/records/schema";

import { POST } from "../../app/api/foundry/strips/route.ts";
import { DEFAULT_OPTIONS, DEFAULT_SELECTION } from "../../lib/foundry/strips/cards.ts";
import { readStripRunNow } from "../../lib/foundry/strips/store.ts";
import { closeKernel } from "../../lib/kernelStore.ts";
import { driveStrips, launchStrips, type StripsTarget } from "../../lib/producers/strips.ts";
import { runCli } from "../../pipeline/strips/run.mts";

// A strip run's launch is a receipt, then a confirm (COMMON decision 3), and every door -
// launchStrips, the CLI, POST /api/foundry/strips - writes a `runs` row and acts on THE SAME
// job. The CLI keeps its flags and gains --json (one document), exit 0/1/2, --budget-usd,
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
const post = (body: unknown) => POST(new Request("http://127.0.0.1:3211/api/foundry/strips", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));
const bodyOf = async (r: Response) => z.record(z.string(), z.unknown()).parse(await r.json());

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

describe("the CLI and the route act on the same job", () => {
  it("the CLI enqueues a dry job (--detach); the route's resume finds THAT job; --resume drives it; --status reads it", async () => {
    const r = await cli(["--run", "entry-cli", "--only", "E01", "--controls", "--dry", "--detach", "--json"]);
    expect(r.code, r.err).toBe(0);
    const d = parseDoc(r.out);
    expect([d.jobId, d.job?.state, d.job?.mode]).toEqual(["job:run:entry-cli", "queued", "dry"]);

    const res = await post({ run: "entry-cli", resume: true });
    expect(res.status).toBe(200);
    const b = await bodyOf(res);
    expect([b["jobId"], b["existing"]]).toEqual(["job:run:entry-cli", true]);

    const go = await cli(["--resume", "--run", "entry-cli", "--json"]);
    expect(go.code, go.err).toBe(0);
    expect(parseDoc(go.out)).toMatchObject({ jobId: "job:run:entry-cli", outcome: "done", run: { status: "awaiting-triage", dry: true } });
    const s = await cli(["--status", "entry-cli", "--json"]);
    expect([s.code, parseDoc(s.out).job?.state]).toEqual([0, "done"]);
  });

  it("the route answers a receipt, then enqueues on its token (202); a stale token is a 409 with the fresh receipt", async () => {
    const body = { run: "entry-route", only: ["E02"] };
    const r0 = await post(body);
    expect(r0.status).toBe(200);
    const receipt = z.object({ token: z.string() }).loose().parse((await bodyOf(r0))["receipt"]);
    expect((await post({ ...body, token: "f".repeat(64) })).status).toBe(409);
    const r1 = await post({ ...body, token: receipt.token });
    expect(r1.status).toBe(202);
    expect((await bodyOf(r1))["jobId"]).toBe("job:run:entry-route");
  });

  it("exit codes: 2 for usage, 1 for a live launch this process may not arm", async () => {
    expect((await cli(["--lane", "both"])).code).toBe(2);
    expect((await cli(["--budget-usd", "-3"])).code).toBe(2);
    const live = await cli(["--run", "entry-live", "--only", "E03", "--json"]);
    expect(live.code).toBe(1);
    expect(live.out).toMatch(/GRAVITONE_DRY_ONLY/);
  });
});
