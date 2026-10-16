import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import { verify } from "@gt/kernel/events";
import { enqueue, get } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

// THE DOJO JUDGE'S GEMINI CALL GOES THROUGH THE METER (L41): pipeline/foundry/dojo_judge.py
// `prepare`, with `gemini` replaced by a fake vendor that counts its calls (no real call, no key),
// books each answered call to the cycle's newest Dojo job at its estimate, re-projects the job's
// spend so it reconciles, and refuses BEFORE the call - a dry job, a dry-only process, a ceiling.

const ROOT = process.cwd();
const dir = mkdtempSync(path.join(tmpdir(), "gt-dojo-judge-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const OP = { kind: "operator", id: "op" } as const;
const LIVE = { kind: "live", arm: { by: OP, at: "2026-10-16T09:00:00.000Z", reason: "test: a live cycle" } } as const;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

let n = 0;
function universe(job: { live: boolean; ceilingUsd?: number } | null): { store: string; cdir: string } {
  const root = path.join(dir, `u${++n}`);
  const cdir = path.join(root, "training", "c1");
  mkdirSync(path.join(cdir, "pairs"), { recursive: true });
  const pairs = ["s1-s1", "s2-s1"];
  writeFileSync(path.join(cdir, "gen-spec.json"), JSON.stringify({ pairs: pairs.map((id) => ({ id, seed: 1 })) }));
  writeFileSync(path.join(cdir, "readbacks.json"), JSON.stringify({}));
  writeFileSync(path.join(cdir, "cycle.json"), JSON.stringify({ improvements: [{ claim: "the light reads warmer" }], log: [] }));
  for (const p of pairs) for (const arm of ["baseline", "challenger"]) writeFileSync(path.join(cdir, "pairs", `${p}--${arm}.png`), PNG);
  const store = path.join(root, "k.sqlite");
  const k = must(openKernel(store));
  if (job !== null)
    must(enqueue(k.store, { id: "job:run:dojo:c1", of: { kind: "run", id: "dojo:c1" }, producer: "dojo", lane: "cloud.google", ...(job.live ? { mode: LIVE } : {}), ...(job.ceilingUsd === undefined ? {} : { ceilingUsd: job.ceilingUsd }) }, OP));
  k.close();
  return { store, cdir };
}

const HARNESS = `
import json, sys
sys.path.insert(0, sys.argv[1])
import dojo_judge
from pathlib import Path
calls = []
def fake(model, claim, cdir, pid, a_arm):
    calls.append(pid)
    return {"pick": "A", "reason": "the warmer key light"}
dojo_judge.gemini = fake
dojo_judge.prepare(Path(sys.argv[2]))
print(json.dumps({"calls": calls}))
`;

function judge(store: string, cdir: string, env: Record<string, string> = {}): { calls: string[]; picks: Readonly<Record<string, Readonly<Record<string, unknown>> | undefined>> } {
  const r = spawnSync("python", ["-I", "-c", HARNESS, path.join(ROOT, "pipeline", "foundry"), cdir], {
    cwd: ROOT,
    env: { ...process.env, GRAVITONE_STORE_PATH: store, GRAVITONE_DRY_ONLY: "", ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
  if (r.status !== 0) throw new Error(`dojo_judge exited ${String(r.status)}: ${r.stderr}`);
  const out = must(parseJsonAt("judge harness", z.object({ calls: z.array(z.string()) }), r.stdout.trim().split("\n").at(-1) ?? "{}"));
  const picks = must(parseJsonAt("gemini-picks.json", z.record(z.string(), z.record(z.string(), z.unknown())), readFileSync(path.join(cdir, "gemini-picks.json"), "utf8")));
  return { calls: out.calls, picks };
}

function spendOf(store: string): { rows: { job_id: unknown; step: unknown; usd: unknown; basis: unknown }[]; jobUsd?: number; drift?: unknown; chain: string } {
  const k = must(openKernel(store));
  try {
    const rows = must(k.store.read((r) => r.all("SELECT job_id, step, usd, basis FROM spend_rows ORDER BY seq").map((x) => ({ job_id: x["job_id"], step: x["step"], usd: x["usd"], basis: x["basis"] }))));
    const job = get(k.store, "job:run:dojo:c1" as never);
    const rec = job.ok ? must(k.store.read((r) => reconcileJobSpend(r, "job:run:dojo:c1"))) : undefined;
    return { rows, ...(job.ok ? { jobUsd: job.value.job.spend.usd } : {}), ...(rec?.drift === undefined ? {} : { drift: rec.drift }), chain: must(verify(k.store)).state };
  } finally {
    k.close();
  }
}

describe("dojo_judge.py's Gemini call, metered", () => {
  it("books each answered call to the cycle's job at its estimate, and the job's spend reconciles to the meter", () => {
    const { store, cdir } = universe({ live: true });
    const out = judge(store, cdir);
    expect(out.calls).toEqual(["s1-s1", "s2-s1"]);
    expect(out.picks["s1-s1"]).toMatchObject({ pick: "A", model: "gemini-3.6-flash" });
    const s = spendOf(store);
    expect(s.rows).toEqual([
      { job_id: "job:run:dojo:c1", step: "judge:s1-s1:gemini-3.6-flash", usd: 0.002, basis: "estimate" },
      { job_id: "job:run:dojo:c1", step: "judge:s2-s1:gemini-3.6-flash", usd: 0.002, basis: "estimate" },
    ]);
    expect(s.jobUsd).toBe(0.004);
    expect(s.drift).toBeUndefined();
    expect(s.chain).toBe("intact");
  }, 150_000);

  it("calls nothing and books nothing for a dry job, or in a dry-only process", () => {
    const dry = universe({ live: false });
    const a = judge(dry.store, dry.cdir);
    expect(a.calls).toEqual([]);
    expect(String(a.picks["s1-s1"]?.["skipped"])).toContain("is dry");
    expect(spendOf(dry.store).rows).toEqual([]);
    const live = universe({ live: true });
    const b = judge(live.store, live.cdir, { GRAVITONE_DRY_ONLY: "1" });
    expect(b.calls).toEqual([]);
    expect(String(b.picks["s2-s1"]?.["skipped"])).toContain("GRAVITONE_DRY_ONLY");
    expect(spendOf(live.store).rows).toEqual([]);
  }, 150_000);

  it("refuses the call that would cross the job's ceiling before making it", () => {
    const { store, cdir } = universe({ live: true, ceilingUsd: 0.003 });
    const out = judge(store, cdir);
    expect(out.calls).toEqual(["s1-s1"]);
    expect(String(out.picks["s2-s1"]?.["error"])).toContain("past its ceiling $0.00");
    expect(spendOf(store).rows.length).toBe(1);
  }, 150_000);

  it("a cycle with no job still books to the meter: never an unmetered call", () => {
    const { store, cdir } = universe(null);
    expect(judge(store, cdir).calls.length).toBe(2);
    expect(spendOf(store).rows.map((r) => r.job_id)).toEqual([null, null]);
  }, 150_000);
});
