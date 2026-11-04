// THE SONG LAB'S PRODUCERS (spark yue2-song-lab WP3; lib/producers/yue2.ts) over a temp kernel and a temp
// sound store, with the WSL door, the facts file and the scores table faked at their ports: a 2-seed
// launch files 2 takes with their facts and hands both to ONE score job, which writes a row per take keyed
// by the file's sha; a refusal fails the step with the engine's sentence verbatim and files nothing; a
// cancel during the first seed stops the batch before the second (and fires the running call's signal);
// a post-chain files a child take with its lineage and hands it to scoring; an ab-window writes the arm's
// file under `yue2-ab/` and files no take. No WSL, no Python: nothing here spawns.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-yue2-producers-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { SongScores, Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import { cancel, get } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";

import { producers } from "../../lib/producers/registry.ts";
import { driveYue2, yue2PostProducer, yue2RenderProducer, yue2ScoreProducer, type Yue2Deps } from "../../lib/producers/yue2.ts";
import type { Yue2Engines } from "../../lib/producers/yue2Acts.ts";
import { abWindowPath } from "../../lib/producers/yue2Acts.ts";
import { launchPost, launchRender, scoreJobFor, yue2RequestOf } from "../../lib/producers/yue2Jobs.ts";
import { readTakes } from "../../lib/sound/store.ts";
import { createTake } from "../../lib/sound/takes.ts";
import { lyricsDigest } from "../../lib/yue2/lyrics.ts";
import { takeSha } from "../../lib/yue2/sha.ts";
import type { Yue2Answer, Yue2Op, Yue2RunOptions } from "../../lib/yue2/wsl.ts";

const OP: Actor = { kind: "operator", id: "op-test" };
const k = openKernel(path.join(ROOT, "kernel.sqlite"));
if (!k.ok) throw k.error;
const store = k.value.store;
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const jobOf = (id: string) => must(get(store, jobIdSchema.parse(id))).job;
const after = (args: readonly string[], flag: string): string => args[args.indexOf(flag) + 1]!;

type Call = { readonly op: Yue2Op; readonly args: readonly string[]; readonly options: Yue2RunOptions };
type Run = (op: Yue2Op, args: readonly string[], options: Yue2RunOptions) => Promise<Result<Yue2Answer>>;

/** The ports, faked: a gen writes its out file, a score answers two metrics, a post writes its out file. */
function world(run?: Run) {
  const calls: Call[] = [];
  const facts = new Map<string, Yue2TakeFacts>();
  const rows: SongScores[] = [];
  const fake: Run = async (op, args) => {
    if (op === "gen" || op === "post") writeFileSync(after(args, "--out"), new Uint8Array([0x66, 0x4c, 0x61, 0x43, op === "gen" ? 1 : 2, Number(op === "gen" ? after(args, "--seed") : 9)]));
    if (op === "gen") return ok({ ok: true, out: after(args, "--out"), durationS: 31.5, seed: Number(after(args, "--seed")) });
    if (op === "score") return ok({ ok: true, scores: { wer: 0.06, werSd: 0.02 } });
    return ok({ ok: true, out: after(args, "--out"), stages: [], lufs: -14, windowS: [3.2, 28.2], vocalOnsetS: 3.2 });
  };
  const engines: Yue2Engines = {
    run: async (op, args, options) => (calls.push({ op, args, options }), (run ?? fake)(op, args, options)),
    toWsl: (p) => p,
    readFacts: async (ids) => ok(Object.fromEntries(ids.flatMap((id) => (facts.has(id) ? [[id, facts.get(id)!]] : [])))),
    fileTake: async (meta, file, f) => {
      const { take } = await createTake(meta, file);
      facts.set(take.id, f);
      return ok({ take });
    },
    digest: lyricsDigest,
    sha: takeSha,
    putScores: (_s, row) => (rows.push(row), ok(row)),
  };
  const deps: Yue2Deps = { engines: async () => engines, store: () => ok(store), pollMs: 5 };
  return { calls, facts, rows, deps, fake };
}

const SHEET = { style: "indie folk, warm female vocal, acoustic guitar", lyrics: "[verse]\nWalking  home\nUnder THE lights\n", cot: "off" as const, cfg: 1.5 };

describe("the worker's list", () => {
  it("binds all three on gpu.local", () => {
    const keys = [...must(producers()).keys()];
    expect(keys).toEqual(expect.arrayContaining(["yue2-render@gpu.local", "yue2-score@gpu.local", "yue2-post@gpu.local"]));
  });
});

describe("yue2-render", () => {
  it("files one take per seed with its facts, and hands both to ONE score job", async () => {
    const w = world();
    const l = must(launchRender(store, { ...SHEET, seeds: [1, 2], origin: "lab" }, { actor: OP }));
    expect(l.receipt.totals.usd).toBe(0);
    expect(l.receipt.lines.map((x) => x.lane)).toEqual(["gpu.local", "gpu.local"]);
    const report = must(await driveYue2(store, l.jobId, yue2RenderProducer(w.deps)));
    expect(report.outcome).toBe("done");

    expect(w.calls.map((c) => [c.op, after(c.args, "--seed")])).toEqual([["gen", "1"], ["gen", "2"]]);
    expect(w.calls[0]!.args).toEqual(expect.arrayContaining(["--cot", "off", "--cfg", "1.5"]));
    expect(w.calls[0]!.options.timeoutMs).toBe(600_000);
    expect(w.calls[0]!.options.signal).toBeInstanceOf(AbortSignal);

    const takes = (await readTakes()).takes.filter((t) => w.facts.has(t.id));
    expect(takes.map((t) => t.title).sort()).toEqual(["yue2 cot=off cfg=1.5 s1", "yue2 cot=off cfg=1.5 s2"]);
    for (const t of takes) expect(t).toMatchObject({ provider: "local", origin: "lab", kind: "music", durationS: 31.5 });
    const f = w.facts.get(takes[0]!.id)!;
    expect(f).toMatchObject({ engine: "yue2", rights: { licence: "CC BY-NC 4.0", policy: "warn" }, lineage: { postStages: [] }, durationS: 31.5 });
    // WP2's one normal form (lib/yue2/lyrics.ts): line endings and edge spaces fold, case is kept.
    expect(f.lyricsDigest).toBe(lyricsDigest("[verse]\r\nWalking  home\r\nUnder THE lights  "));
    expect(f.lyricsDigest).not.toBe(lyricsDigest("[verse]\nwalking  home\nunder the lights"));
    expect(f.lyricsDigest).toMatch(/^[0-9a-f]{16}$/);

    const scoreId = scoreJobFor(l.jobId);
    expect(jobOf(scoreId)).toMatchObject({ producer: "yue2-score", lane: "gpu.local", state: "queued" });
    const req = must(yue2RequestOf(store, "yue2-score", scoreId));
    expect([...req.takeIds].sort()).toEqual(takes.map((t) => t.id).sort());

    // The score job: one row per take, keyed by the file's sha, the scorer's version and a time.
    const s = must(await driveYue2(store, scoreId, yue2ScoreProducer(w.deps)));
    expect(s.outcome).toBe("done");
    expect(w.rows).toHaveLength(2);
    for (const r of w.rows) expect(r).toMatchObject({ scorerVersion: 1, wer: 0.06, werSd: 0.02, sha: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(new Set(w.rows.map((r) => r.sha))).toEqual(new Set(await Promise.all(takes.map(async (t) => must(await takeSha(t))))));
    expect(w.calls.filter((c) => c.op === "score").map((c) => c.options.timeoutMs)).toEqual([300_000, 300_000]);
  });

  it("fails the step with the engine's refusal verbatim, and files no take", async () => {
    const said = "yue2: WSL distro Ubuntu is not installed; run `wsl --install -d Ubuntu`";
    const w = world(async () => err("unavailable", said));
    const before = (await readTakes()).takes.length;
    const l = must(launchRender(store, { ...SHEET, seeds: [7, 8], origin: "agent" }, { actor: OP }));
    const report = must(await driveYue2(store, l.jobId, yue2RenderProducer(w.deps)));
    expect(report.outcome).toBe("failed");
    expect(jobOf(l.jobId).error).toEqual({ code: "unavailable", message: said });
    expect(w.calls).toHaveLength(1);
    expect((await readTakes()).takes.length).toBe(before);
    expect(get(store, jobIdSchema.parse(scoreJobFor(l.jobId))).ok).toBe(false);
  });

  it("stops the batch when the job is cancelled during a seed: the call's signal fires, the next seed never runs", async () => {
    let jobId = "";
    let aborted = false;
    const w = world(async (_op, _args, o) => {
      must(cancel(store, jobIdSchema.parse(jobId), OP));
      // The watch reads the job record every pollMs; the door would kill the process tree here.
      for (let i = 0; i < 200 && !o.signal!.aborted; i++) await new Promise((r) => setTimeout(r, 5));
      aborted = o.signal!.aborted;
      return err("unavailable", "yue2 gen: killed");
    });
    const before = (await readTakes()).takes.length;
    jobId = must(launchRender(store, { ...SHEET, seeds: [3, 4], origin: "lab" }, { actor: OP })).jobId;
    const report = must(await driveYue2(store, jobId, yue2RenderProducer(w.deps)));
    expect(report.outcome).toBe("stopped");
    expect(aborted).toBe(true);
    expect(w.calls).toHaveLength(1);
    expect(jobOf(jobId).state).toBe("cancelled");
    expect((await readTakes()).takes.length).toBe(before);
    expect(get(store, jobIdSchema.parse(scoreJobFor(jobId))).ok).toBe(false);
  });
});

describe("yue2-post", () => {
  it("chains a take into a NEW child take with its lineage, then hands it to scoring", async () => {
    const w = world();
    const r = must(launchRender(store, { ...SHEET, seeds: [11], origin: "lab" }, { actor: OP }));
    must(await driveYue2(store, r.jobId, yue2RenderProducer(w.deps)));
    const [raw] = [...w.facts.keys()];
    const p = must(launchPost(store, { takeId: raw, stages: ["debuzz", "master"], origin: "agent" }, { actor: OP }));
    const report = must(await driveYue2(store, p.jobId, yue2PostProducer(w.deps)));
    expect(report.outcome).toBe("done");
    const post = w.calls.find((c) => c.op === "post")!;
    expect(after(post.args, "--stages")).toBe("debuzz,master");
    expect(post.args).not.toContain("--reference");
    const child = (await readTakes()).takes.find((t) => t.parentId === raw)!;
    expect(child).toMatchObject({ origin: "agent", provider: "local", variation: { axis: "post", diff: ["debuzz", "master"] } });
    expect(w.facts.get(child.id)!.lineage).toEqual({ sourceTakeId: raw, postStages: ["debuzz", "master"] });
    expect(must(yue2RequestOf(store, "yue2-score", scoreJobFor(p.jobId))).takeIds).toEqual([child.id]);
  });

  it("cuts one blind arm's window under yue2-ab/ and files no take", async () => {
    const w = world();
    const r = must(launchRender(store, { ...SHEET, seeds: [21], origin: "lab" }, { actor: OP }));
    must(await driveYue2(store, r.jobId, yue2RenderProducer(w.deps)));
    const takeId = [...w.facts.keys()].at(-1)!;
    const before = (await readTakes()).takes.length;
    const pairId = "0123456789abcdef";
    const p = must(launchPost(store, { takeId, stages: [], op: "ab-window", pairId, arm: "b" }, { actor: OP }));
    expect(must(await driveYue2(store, p.jobId, yue2PostProducer(w.deps))).outcome).toBe("done");
    const call = w.calls.find((c) => c.op === "post")!;
    expect(call.args.slice(0, 2)).toEqual(["--op", "ab-window"]);
    expect(after(call.args, "--window-s")).toBe("25");
    expect(after(call.args, "--out")).toBe(abWindowPath(pairId, "b"));
    expect(abWindowPath(pairId, "b")).toBe(path.join(ROOT, "sound", "yue2-ab", `${pairId}-b.flac`));
    expect(existsSync(abWindowPath(pairId, "b"))).toBe(true);
    expect((await readTakes()).takes.length).toBe(before);
    expect(get(store, jobIdSchema.parse(scoreJobFor(p.jobId))).ok).toBe(false);
  });

  it("refuses a malformed launch at the door, enqueueing nothing", () => {
    expect(launchPost(store, { takeId: "st-x", stages: ["master", "stems"] }, { actor: OP }).ok).toBe(false);
    expect(launchPost(store, { takeId: "st-x", stages: [], op: "ab-window" }, { actor: OP }).ok).toBe(false);
    expect(launchRender(store, { ...SHEET, seeds: [1, 1], origin: "lab" }, { actor: OP }).ok).toBe(false);
  });
});
