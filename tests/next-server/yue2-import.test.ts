// THE YUE2 BACKFILL (lib/yue2/importScan.ts + importApply.ts, the CLI pipeline/yue2/import.mts; spark
// yue2-song-lab WP2) on a tiny outputs dir written here: a baseline render with its runs.jsonl row, a
// grid render named only by its file, a post variant of the baseline, an A/B clip and a smoke clip,
// with score rows - one per take, one malformed line, one for a file outside the import, one whose
// file moved after it was scored. Dry plans and writes nothing; apply files the takes with facts and
// scores keyed by sha; a re-run files 0; a variant's parentId is its raw take; a take whose stored
// bytes are gone is still found, by fileName+facts.
//
// Every store is temp: SOUND_STORE_DIR, SOUND_LEDGER_PATH (pipeline/sound/ledger.json is git-tracked
// and the operator's), and an in-memory kernel (the CLI spawn gets a temp GRAVITONE_STORE_PATH).

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-yue2-import-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  return dir;
});

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { YUE2_RIGHTS } from "@gt/domain/audio.yue2";
import { openKernel } from "@gt/kernel/kernel";

import { readTakes } from "../../lib/sound/store.ts";
import { readYue2Facts } from "../../lib/yue2/facts.ts";
import { applyPlan } from "../../lib/yue2/importApply.ts";
import { scanOutputs } from "../../lib/yue2/importScan.ts";
import { lyricsDigest } from "../../lib/yue2/lyrics.ts";
import { readSongScores } from "../../lib/yue2/scores.ts";
import { jsonl, put, wav } from "./yue2-fixture.ts";

const LAB = path.join(ROOT, "yue2-lab");
const OUT = path.join(LAB, "outputs");
const LYRICS = "[Verse]\nEarly morning, city humming\nCoffee in a paper cup";
const STYLE = "Boom-bap hip hop, 90 BPM";
const WSL = "/mnt/c/Users/x/yue2-lab/outputs";
const sha = (rel: string): string => createHash("sha256").update(readFileSync(path.join(OUT, rel))).digest("hex");
const mtimeNs = (rel: string): number => statSync(path.join(OUT, rel)).mtimeMs * 1e6;

const scoreRow = (rel: string, over: Record<string, unknown> = {}) => ({
  file: `${WSL}/${rel}`,
  mtime_ns: mtimeNs(rel),
  lyrics_file: "/srv/lab/yue2-lab/inputs/lyrics.txt",
  scored_at: "2026-11-04T13:12:05",
  wer_min: 0.0385,
  wer_sd_min: 0.02,
  per_min: 0.0222,
  songeval: { Coherence: 4.02, Musicality: 3.75, Memorability: 4.15, Clarity: 3.76, Naturalness: 3.77, mean: 3.89, muq_windows: 1, torch_peak_gib: 2.7 },
  aesthetics: { CE: 7.357, CU: 7.914, PC: 5.802, PQ: 8.227 },
  buzz: { mix: { buzz_index_db: 6.03 }, stem: { buzz_index_db: 3.4 } },
  asr: { qwen3: { mix: { text: "Early morning city humming" } } },
  ...over,
});

put(path.join(LAB, "inputs", "lyrics.txt"), LYRICS);
put(path.join(ROOT, "style.txt"), STYLE);
put(path.join(OUT, "hh_s1_cotoff.wav"), wav(220));
put(path.join(OUT, "smoke_tonight_s9_cotfull.wav"), wav(330));
put(path.join(OUT, "runs.jsonl"), jsonl([{ out: "outputs/hh_s1_cotoff.wav", seed: 1, cot: "off", cfg_scale: 1.5, lora: { path: "adapters/hh_rank8.safetensors", strength: 0.5 }, style: STYLE, audio: { seconds: 0.25 } }]));
put(path.join(OUT, "grid", "hh_cotfull_cfg2.0_s2.wav"), wav(440));
put(path.join(OUT, "post", "hh_s1_cotoff", "v3s_stems_debuzzS_master.wav"), wav(550));
put(path.join(OUT, "ab", "ab_0001.wav"), wav(660));
put(
  path.join(OUT, "scores_all.jsonl"),
  jsonl([
    scoreRow("hh_s1_cotoff.wav"),
    "{ this line is not json",
    scoreRow("grid/hh_cotfull_cfg2.0_s2.wav", { wer_min: 0.5, songeval: { Coherence: 4 }, asr: {} }),
    scoreRow("hh_s1_cotoff.wav", { scored_at: "2026-11-04T12:00:00", wer_min: 0.9 }),
    { ...scoreRow("hh_s1_cotoff.wav"), file: `${WSL}/elsewhere/other.flac` },
  ]),
);
put(path.join(OUT, "post", "scores_post.jsonl"), jsonl([scoreRow("post/hh_s1_cotoff/v3s_stems_debuzzS_master.wav", { mtime_ns: mtimeNs("post/hh_s1_cotoff/v3s_stems_debuzzS_master.wav") - 60e9 })]));

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const kernel = (() => {
  const k = openKernel(":memory:");
  if (!k.ok) throw new Error(k.error.message);
  return k.value;
})();
afterAll(() => kernel.close());

const plan = () => scanOutputs({ from: OUT, styleFile: path.join(ROOT, "style.txt") });
async function run(apply: boolean) {
  const r = await applyPlan(await plan(), { apply, store: kernel.store });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe("the plan", () => {
  it("reads raw takes with their condition, a variant with its stages, and names every skip with its reason", async () => {
    const p = await plan();
    expect(p.lyricsFrom).toBe(path.join(LAB, "inputs", "lyrics.txt").split(path.sep).join("/"));
    const byRel = Object.fromEntries(p.takes.map((t) => [t.rel, t]));
    expect(Object.keys(byRel)).toEqual(["hh_s1_cotoff.wav", "grid/hh_cotfull_cfg2.0_s2.wav", "post/hh_s1_cotoff/v3s_stems_debuzzS_master.wav"]);
    const raw = byRel["hh_s1_cotoff.wav"]!;
    expect(raw.conditionFrom).toBe("runs.jsonl");
    expect(raw.facts.condition).toEqual({ cot: "off", cfg: 1.5, seed: 1, adapter: "hh_rank8.safetensors", adapterStrength: 0.5 });
    expect(raw.title).toBe("yue2 cot=off cfg=1.5 lora=hh_rank8@0.5 s1");
    expect(raw.facts.style).toBe(STYLE);
    expect(raw.facts.lyricsDigest).toBe(lyricsDigest(LYRICS));
    expect(raw.facts.durationS).toBe(0.25);
    expect(raw.facts.rights).toEqual(YUE2_RIGHTS);
    const grid = byRel["grid/hh_cotfull_cfg2.0_s2.wav"]!;
    expect(grid.conditionFrom).toBe("filename");
    expect(grid.facts.condition).toEqual({ cot: "full", cfg: 2, seed: 2 });
    expect(grid.facts.style).toBe(STYLE);
    const v = byRel["post/hh_s1_cotoff/v3s_stems_debuzzS_master.wav"]!;
    expect(v.sourceRel).toBe("hh_s1_cotoff.wav");
    expect(v.facts.lineage.postStages).toEqual(["stems", "debuzz", "master"]);
    expect(v.facts.condition).toEqual(raw.facts.condition);

    const skip = (at: string) => p.skipped.find((s) => s.at === at)?.reason;
    expect(skip("scores_all.jsonl:2")).toMatch(/^not JSON/);
    expect(skip("scores_all.jsonl:5")).toMatch(/not in this import/);
    expect(skip("post/scores_post.jsonl:1")).toMatch(/changed after it was scored/);
    expect(skip("smoke_tonight_s9_cotfull.wav")).toMatch(/smoke clip/);
    expect(skip("ab/ab_0001.wav")).toMatch(/A\/B window/);
  });

  it("maps score.py rows per the contract, keyed by the sha of the bytes, the newest row per file", async () => {
    const p = await plan();
    const raw = p.takes.find((t) => t.rel === "hh_s1_cotoff.wav")!;
    expect(raw.sha).toBe(sha("hh_s1_cotoff.wav"));
    expect(raw.scores).toEqual({
      sha: sha("hh_s1_cotoff.wav"),
      scorerVersion: 1,
      wer: 0.0385,
      werSd: 0.02,
      per: 0.0222,
      songEval: { coherence: 4.02, musicality: 3.75, memorability: 4.15, clarity: 3.76, naturalness: 3.77 },
      aesthetics: { ce: 7.357, cu: 7.914, pc: 5.802, pq: 8.227 },
      buzzIdx: 6.03,
      transcript: "Early morning city humming",
      scoredAt: "2026-11-04T13:12:05",
    });
    expect(p.scoreRows).toEqual({ read: 5, matched: 3, superseded: 1 });
    // A half SongEval and no transcript are omitted, never zero.
    const grid = p.takes.find((t) => t.rel.startsWith("grid/"))!;
    expect(grid.scores?.wer).toBe(0.5);
    expect(grid.scores && "songEval" in grid.scores).toBe(false);
    expect(grid.scores && "transcript" in grid.scores).toBe(false);
    // The variant's only row was refused (its file moved): unscored.
    expect(p.takes.find((t) => t.dir === "post")?.scores).toBeUndefined();
  });
});

describe("dry, apply, re-run", () => {
  it("a dry run plans every take and writes nothing", async () => {
    const r = await run(false);
    expect(r.takes.map((t) => t.action)).toEqual(["file", "file", "file"]);
    expect(r.perDir.baseline).toEqual({ found: 1, file: 1, existing: 0, duplicate: 0, failed: 0 });
    expect(r.scores).toEqual({ written: 0, unchanged: 0, wouldWrite: 2, failed: 0 });
    expect(existsSync(path.join(ROOT, "sound"))).toBe(false);
    expect(must(readSongScores(kernel.store, [sha("hh_s1_cotoff.wav")]))).toEqual({});
  });

  it("apply files each take with its facts and scores; the variant's parent is its raw take", async () => {
    const r = await run(true);
    expect(r.takes.map((t) => t.action)).toEqual(["file", "file", "file"]);
    const id = (rel: string) => {
      const t = r.takes.find((x) => x.rel === rel);
      return t?.action === "file" ? t.takeId : undefined;
    };
    const rawId = id("hh_s1_cotoff.wav")!;
    const varId = id("post/hh_s1_cotoff/v3s_stems_debuzzS_master.wav")!;
    const takes = (await readTakes()).takes;
    expect(takes).toHaveLength(3);
    for (const t of takes) expect([t.provider, t.origin, t.kind, t.verdict]).toEqual(["local", "import", "music", "unjudged"]);
    const raw = takes.find((t) => t.id === rawId)!;
    expect([raw.title, raw.prompt, raw.fileName, raw.op, raw.parentId]).toEqual(["yue2 cot=off cfg=1.5 lora=hh_rank8@0.5 s1", STYLE, "hh_s1_cotoff.wav", "compose", null]);
    const variant = takes.find((t) => t.id === varId)!;
    expect(variant.parentId).toBe(rawId);
    const facts = await readYue2Facts([rawId, varId]);
    if (!facts.ok) throw new Error(facts.error.message);
    expect(facts.value[varId]?.lineage).toEqual({ sourceTakeId: rawId, postStages: ["stems", "debuzz", "master"] });
    expect(facts.value[rawId]?.rights).toEqual(YUE2_RIGHTS);
    expect(r.scores).toEqual({ written: 2, unchanged: 0, wouldWrite: 0, failed: 0 });
    const scores = must(readSongScores(kernel.store, [sha("hh_s1_cotoff.wav"), sha("grid/hh_cotfull_cfg2.0_s2.wav"), sha("post/hh_s1_cotoff/v3s_stems_debuzzS_master.wav")]));
    expect(scores[sha("hh_s1_cotoff.wav")]?.wer).toBe(0.0385);
    expect(scores[sha("grid/hh_cotfull_cfg2.0_s2.wav")]?.wer).toBe(0.5);
    expect(sha("post/hh_s1_cotoff/v3s_stems_debuzzS_master.wav") in scores).toBe(false);
    // New takes are unjudged: the verdict ledger is never read or written.
    expect(existsSync(path.join(ROOT, "ledger.json"))).toBe(false);
  });

  it("a re-run files 0 and finds each take by its bytes; the scores are unchanged", async () => {
    const r = await run(true);
    expect(r.takes.map((t) => (t.action === "existing" ? t.matchedBy : t.action))).toEqual(["sha", "sha", "sha"]);
    expect(r.scores).toEqual({ written: 0, unchanged: 2, wouldWrite: 0, failed: 0 });
    expect((await readTakes()).takes).toHaveLength(3);
  });

  it("a take whose stored bytes are gone is found by fileName+facts", async () => {
    const takes = (await readTakes()).takes;
    const variant = takes.find((t) => t.fileName === "v3s_stems_debuzzS_master.wav")!;
    rmSync(path.join(ROOT, "sound", variant.file!.path));
    const r = await run(true);
    const v = r.takes.find((t) => t.dir === "post");
    expect(v?.action === "existing" && [v.takeId, v.matchedBy]).toEqual([variant.id, "fileName+facts"]);
    expect((await readTakes()).takes).toHaveLength(3);
  });

  it("two files of the same bytes are filed once; the second is a duplicate", async () => {
    put(path.join(OUT, "grid", "hh_cotoff_cfg1.5_s1.wav"), readFileSync(path.join(OUT, "hh_s1_cotoff.wav")));
    try {
      const r = await run(true);
      const dup = r.takes.find((t) => t.rel === "grid/hh_cotoff_cfg1.5_s1.wav");
      expect(dup?.action === "duplicate" && dup.of).toBe("hh_s1_cotoff.wav");
      expect((await readTakes()).takes).toHaveLength(3);
    } finally {
      rmSync(path.join(OUT, "grid", "hh_cotoff_cfg1.5_s1.wav"));
    }
  });
});

describe("the CLI", () => {
  // Temp sound store and ledger; NO kernel store, so an --apply must refuse.
  const cliEnv = (): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = { ...process.env, SOUND_STORE_DIR: path.join(ROOT, "cli-sound"), SOUND_LEDGER_PATH: path.join(ROOT, "cli-ledger.json") };
    delete env["GRAVITONE_STORE_PATH"];
    return env;
  };
  const cli = (args: readonly string[]) =>
    spawnSync(process.execPath, [path.join("pipeline", "yue2", "import.mts"), ...args], {
      cwd: path.resolve(import.meta.dirname, "..", ".."),
      encoding: "utf8",
      env: cliEnv(),
      timeout: 60_000,
    });

  it("is dry by default: prints the plan per dir and writes nothing", () => {
    const r = cli(["--from", OUT, "--style", path.join(ROOT, "style.txt")]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/dry run: nothing written/);
    expect(r.stdout).toMatch(/baseline\s+1\s+1\s+0\s+0\s+0/);
    expect(r.stdout).toMatch(/scores_all\.jsonl:2: not JSON/);
    expect(existsSync(path.join(ROOT, "cli-sound"))).toBe(false);
  }, 60_000);

  it("--apply without a named kernel store refuses (exit 2) and writes nothing", () => {
    const r = cli(["--from", OUT, "--apply"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/names the kernel store/);
    expect(existsSync(path.join(ROOT, "cli-sound"))).toBe(false);
  }, 60_000);
});

function must<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
