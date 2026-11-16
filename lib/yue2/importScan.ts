import "server-only";

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { YUE2_ENGINE, YUE2_RIGHTS, type SongScores, type Yue2Condition, type Yue2PostStage, type Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { parseYue2TakeFacts } from "@gt/domain/audio.yue2.schema";

import { conditionOfName, conditionOfRun, field, headerSeconds, matchRel, postStagesOfName, readJsonl, segmentsOf, songScoresOfRow, type ConditionFrom, type ImportSkip, type JsonlRow } from "./importSources.ts";
import { lyricsDigest } from "./lyrics.ts";

// THE BACKFILL'S PLAN (spark yue2-song-lab WP2): a kiro/yue2-lab outputs dir read into the takes it
// would file, without touching a store. Raw renders come from the dir itself (baseline), grid/, gen2/
// and lora/, each with its condition from that dir's runs.jsonl (gen.py's own row, matched by file
// name) or else its file name; post variants from post/<input-stem>/v*_*, each naming the raw take
// it was made from. Scores come from scores_all.jsonl, gen2/scores_gen2.jsonl and
// post/scores_post.jsonl, keyed by the sha256 of the bytes they scored: the newest row per file wins,
// and a row whose file changed after it was scored (mtime) is skipped, not trusted.
//
// NOT TAKES: ab/ (the blind desk's derived windows) and the smoke clip (a Chinese City Pop render,
// out of the lab's English-only scope). Both are skipped by rule and counted, never silently.

export const RAW_DIRS = ["", "grid", "gen2", "lora"] as const;
export const SCORE_FILES = ["scores_all.jsonl", "gen2/scores_gen2.jsonl", "post/scores_post.jsonl"] as const;
const AUDIO = /\.(flac|wav)$/i;
const SMOKE = /^smoke_/;

/** The source dir a take was read from: `baseline` is the outputs dir itself. */
export type SourceDir = "baseline" | "grid" | "gen2" | "lora" | "post";
const dirLabel = (d: (typeof RAW_DIRS)[number]): SourceDir => (d === "" ? "baseline" : d);

/** One file the import would file as a take. Facts carry no `sourceTakeId` yet: it is resolved at apply. */
export type PlannedTake = {
  readonly rel: string;
  readonly abs: string;
  readonly dir: SourceDir;
  readonly sha: string;
  readonly bytes: number;
  readonly fileName: string;
  readonly title: string;
  readonly conditionFrom: ConditionFrom | "source";
  readonly facts: Yue2TakeFacts;
  /** A post variant's raw take, by its rel path in this plan. */
  readonly sourceRel?: string;
  readonly scores?: SongScores;
};

export type ImportPlan = {
  readonly from: string;
  readonly lyricsFrom?: string;
  readonly takes: readonly PlannedTake[];
  readonly skipped: readonly ImportSkip[];
  /** Score rows read, matched to a planned take, and dropped for an older row of the same file. */
  readonly scoreRows: { readonly read: number; readonly matched: number; readonly superseded: number };
};

export type ScanOptions = { readonly from: string; readonly lyricsFile?: string; readonly styleFile?: string };

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
const posix = (p: string): string => p.split(path.sep).join("/");
const PLACEHOLDER_ID = "st-pending";

async function readText(file: string | undefined): Promise<string | undefined> {
  if (file === undefined) return undefined;
  return (await readFile(file, "utf8")).trim();
}

async function audioIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isFile() && AUDIO.test(e.name)).map((e) => e.name).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

async function dirsIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

function titleOf(c: Yue2Condition): string {
  const lora = c.adapter === undefined ? "" : ` lora=${c.adapter.replace(/\.safetensors$/, "")}${c.adapterStrength === undefined ? "" : `@${c.adapterStrength}`}`;
  return `yue2 cot=${c.cot}${c.cfg === undefined ? "" : ` cfg=${c.cfg}`}${lora} s${c.seed}`;
}

/** The lyric sheet: --lyrics, else the file score.py named (`lyrics_file`), looked up under <from>/../inputs or <from>/inputs. */
async function findLyrics(o: ScanOptions, scoreRows: readonly JsonlRow[]): Promise<{ text?: string; from?: string }> {
  if (o.lyricsFile !== undefined) return { text: await readText(o.lyricsFile), from: o.lyricsFile };
  const names = new Set(scoreRows.map((r) => field.text(r.value["lyrics_file"])).filter((v): v is string => v !== undefined).map((p) => segmentsOf(p).at(-1)!));
  if (names.size !== 1) return {};
  const name = [...names][0]!;
  for (const dir of [path.join(o.from, "..", "inputs"), path.join(o.from, "inputs")]) {
    const file = path.join(dir, name);
    try {
      return { text: await readText(file), from: file };
    } catch {
      // not here; the next place
    }
  }
  return {};
}

type Raw = { rel: string; abs: string; dir: SourceDir; bytes: Uint8Array; stem: string; name: string };

async function readRaw(from: string, rel: string, dir: SourceDir): Promise<Raw> {
  const abs = path.join(from, ...rel.split("/"));
  const name = rel.split("/").at(-1)!;
  return { rel, abs, dir, bytes: new Uint8Array(await readFile(abs)), stem: name.replace(AUDIO, ""), name };
}

/** Read the outputs dir into the import's plan. Reads files only; writes nothing. */
export async function scanOutputs(o: ScanOptions): Promise<ImportPlan> {
  const from = path.resolve(o.from);
  const skipped: ImportSkip[] = [];
  const style = await readText(o.styleFile);

  const scoreRows: { row: JsonlRow; file: string }[] = [];
  for (const f of SCORE_FILES) {
    const r = await readJsonl(path.join(from, ...f.split("/")), f);
    skipped.push(...r.skips);
    scoreRows.push(...r.rows.map((row) => ({ row, file: f })));
  }
  const lyrics = await findLyrics({ ...o, from }, scoreRows.map((s) => s.row));
  const digest = lyrics.text === undefined || lyrics.text === "" ? undefined : lyricsDigest(lyrics.text);

  const takes: PlannedTake[] = [];
  const byRel = new Map<string, PlannedTake>();
  const add = (t: PlannedTake) => {
    takes.push(t);
    byRel.set(t.rel, t);
  };
  const factsOk = (t: Omit<PlannedTake, "facts">, facts: Yue2TakeFacts, src: Raw): boolean => {
    const p = parseYue2TakeFacts(t.sourceRel === undefined ? facts : { ...facts, lineage: { ...facts.lineage, sourceTakeId: PLACEHOLDER_ID } });
    if (!p.ok) skipped.push({ at: src.rel, reason: `its facts do not hold: ${p.error.message}` });
    return p.ok;
  };

  for (const d of RAW_DIRS) {
    const dir = dirLabel(d);
    const abs = d === "" ? from : path.join(from, d);
    const runs = await readJsonl(path.join(abs, "runs.jsonl"), d === "" ? "runs.jsonl" : `${d}/runs.jsonl`);
    skipped.push(...runs.skips);
    const runOf = new Map<string, Record<string, unknown>>();
    for (const r of runs.rows) {
      const out = field.text(r.value["out"]);
      if (out !== undefined) runOf.set(segmentsOf(out).at(-1)!, r.value);
    }
    for (const name of await audioIn(abs)) {
      const rel = d === "" ? name : `${d}/${name}`;
      const stem = name.replace(AUDIO, "");
      if (SMOKE.test(stem)) {
        skipped.push({ at: rel, reason: "the smoke clip (Chinese City Pop render; the lab is English-only)" });
        continue;
      }
      const run = runOf.get(name);
      const fromRun = run === undefined ? undefined : conditionOfRun(run);
      const condition = fromRun ?? conditionOfName(stem);
      if (condition === undefined) {
        skipped.push({ at: rel, reason: "no runs.jsonl row names it and its file name carries no cot/seed" });
        continue;
      }
      const takeStyle = (run === undefined ? undefined : field.text(run["style"])) ?? style;
      if (takeStyle === undefined) {
        skipped.push({ at: rel, reason: "no style: no runs.jsonl row names it; pass --style" });
        continue;
      }
      if (digest === undefined || lyrics.text === undefined) {
        skipped.push({ at: rel, reason: "no lyrics: pass --lyrics (score.py's lyrics_file was not found beside the outputs)" });
        continue;
      }
      const src = await readRaw(from, rel, dir);
      const durationS = headerSeconds(src.bytes) ?? field.fin(field.obj(run?.["audio"])?.["seconds"]);
      if (durationS === undefined) {
        skipped.push({ at: rel, reason: "its length could not be read (no FLAC/WAV header, no runs.jsonl audio.seconds)" });
        continue;
      }
      const facts: Yue2TakeFacts = { engine: YUE2_ENGINE, condition, style: takeStyle, lyrics: lyrics.text, lyricsDigest: digest, durationS, rights: YUE2_RIGHTS, lineage: { postStages: [] } };
      const t = { rel, abs: src.abs, dir, sha: sha256(src.bytes), bytes: src.bytes.byteLength, fileName: name, title: titleOf(condition), conditionFrom: fromRun === undefined ? ("filename" as const) : ("runs.jsonl" as const) };
      if (factsOk(t, facts, src)) add({ ...t, facts });
    }
  }

  for (const input of await dirsIn(path.join(from, "post"))) {
    // The raw take post.py read: the baseline file of that stem, else the first raw take of that stem.
    const sourceRel = [`${input}.flac`, `${input}.wav`].find((n) => byRel.has(n)) ?? [...byRel.keys()].find((k) => k.split("/").at(-1)!.replace(AUDIO, "") === input);
    for (const name of await audioIn(path.join(from, "post", input))) {
      const rel = `post/${input}/${name}`;
      const stem = name.replace(AUDIO, "");
      if (!/^v\d+[a-z]*_/.test(stem)) {
        skipped.push({ at: rel, reason: "not a post variant (v<N>_<stages>)" });
        continue;
      }
      const source = sourceRel === undefined ? undefined : byRel.get(sourceRel);
      if (source === undefined) {
        skipped.push({ at: rel, reason: `its raw take ${input} is not in this import` });
        continue;
      }
      const postStages: Yue2PostStage[] = postStagesOfName(stem);
      if (postStages.length === 0) {
        skipped.push({ at: rel, reason: "its name carries no post stage (stems, debuzz, master)" });
        continue;
      }
      const src = await readRaw(from, rel, "post");
      const durationS = headerSeconds(src.bytes) ?? source.facts.durationS;
      const facts: Yue2TakeFacts = { ...source.facts, durationS, lineage: { postStages } };
      const t = { rel, abs: src.abs, dir: "post" as const, sha: sha256(src.bytes), bytes: src.bytes.byteLength, fileName: name, title: `${source.title} · ${stem}`, conditionFrom: "source" as const, sourceRel: source.rel };
      if (factsOk(t, facts, src)) add({ ...t, facts });
    }
  }
  for (const name of await audioIn(path.join(from, "ab"))) skipped.push({ at: `ab/${name}`, reason: "an A/B window (a derived clip, not a take)" });

  // Scores: newest row per file; a row for a file outside the plan, or for bytes that moved since, is skipped.
  let matched = 0;
  let superseded = 0;
  const best = new Map<string, { scores: SongScores; at: string }>();
  for (const { row, file } of scoreRows) {
    const at = `${file}:${row.line}`;
    const scored = field.text(row.value["file"]);
    const rel = scored === undefined ? undefined : matchRel(scored, byRel);
    const take = rel === undefined ? undefined : byRel.get(rel);
    if (take === undefined) {
      skipped.push({ at, reason: scored === undefined ? "no `file`" : `scores a file not in this import (${segmentsOf(scored).slice(-2).join("/")})` });
      continue;
    }
    const mtimeNs = field.fin(row.value["mtime_ns"]);
    if (mtimeNs !== undefined && Math.abs((await stat(take.abs)).mtimeMs - mtimeNs / 1e6) > 2000) {
      skipped.push({ at, reason: `${take.rel} changed after it was scored (mtime)` });
      continue;
    }
    const s = songScoresOfRow(row.value, take.sha);
    if (!s.ok) {
      skipped.push({ at, reason: `its scores do not hold: ${s.reason}` });
      continue;
    }
    matched++;
    const prev = best.get(take.rel);
    if (prev !== undefined) superseded++;
    if (prev === undefined || s.value.scoredAt >= prev.scores.scoredAt) best.set(take.rel, { scores: s.value, at });
  }
  const scored = takes.map((t) => {
    const b = best.get(t.rel);
    return b === undefined ? t : { ...t, scores: b.scores };
  });
  return { from: posix(from), ...(lyrics.from === undefined ? {} : { lyricsFrom: posix(lyrics.from) }), takes: scored, skipped, scoreRows: { read: scoreRows.length, matched, superseded } };
}
