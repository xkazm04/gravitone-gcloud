import "server-only";

import { readFile } from "node:fs/promises";

import { SONG_SCORER_VERSION, YUE2_COT, YUE2_POST_STAGES, type SongScores, type Yue2Condition, type Yue2Cot, type Yue2PostStage } from "@gt/domain/audio.yue2";
import { parseSongScores } from "@gt/domain/audio.yue2.schema";

// THE BACKFILL'S READERS (spark yue2-song-lab WP2, pipeline/yue2/import.mts): what the kiro/yue2-lab
// outputs dir says about each of its files, read without a model and without a store. gen.py logged
// one `runs.jsonl` row per render; score.py one `scores_*.jsonl` row per scored file; post.py one
// `<variant>.json` beside each post variant. Every reader here answers what it could read AND what it
// could not, with the reason, so the import can say "skipped: line 7 is not JSON" instead of losing it.

/** Something the import did not take, and why. `at` is a path relative to the outputs dir (`:line` for a jsonl row). */
export type ImportSkip = { readonly at: string; readonly reason: string };

export type JsonlRow = { readonly line: number; readonly value: Record<string, unknown> };

/** Every object row of a jsonl file; a line that is not a JSON object is skipped with its line number. A missing file has no rows. */
export async function readJsonl(abs: string, rel: string): Promise<{ rows: JsonlRow[]; skips: ImportSkip[] }> {
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { rows: [], skips: [] };
    throw e;
  }
  const rows: JsonlRow[] = [];
  const skips: ImportSkip[] = [];
  raw.split(/\r?\n/).forEach((text, i) => {
    if (text.trim() === "") return;
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch (e) {
      skips.push({ at: `${rel}:${i + 1}`, reason: `not JSON (${(e as Error).message.slice(0, 120)})` });
      return;
    }
    if (typeof v !== "object" || v === null || Array.isArray(v)) skips.push({ at: `${rel}:${i + 1}`, reason: "not a JSON object" });
    else rows.push({ line: i + 1, value: v as Record<string, unknown> });
  });
  return { rows, skips };
}

const obj = (v: unknown): Record<string, unknown> | undefined => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined);
const fin = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v : undefined);
export const field = { obj, fin, text };

/** A path as forward-slash segments, whatever wrote it (WSL, Windows, relative). */
export const segmentsOf = (p: string): string[] => p.replace(/\\/g, "/").split("/").filter((s) => s !== "" && s !== ".");

/** The longest trailing run of `p`'s segments that names a key of `byRel` (paths relative to the outputs dir). */
export function matchRel<T>(p: string, byRel: ReadonlyMap<string, T>, maxDepth = 4): string | undefined {
  const segs = segmentsOf(p);
  for (let n = Math.min(maxDepth, segs.length); n >= 1; n--) {
    const rel = segs.slice(-n).join("/");
    if (byRel.has(rel)) return rel;
  }
  return undefined;
}

// ── durations, read off the file's own header ─────────────────────────────

/** FLAC STREAMINFO: sample rate (20 bits) and total samples (36 bits). */
function flacSeconds(b: Uint8Array): number | undefined {
  if (b.length < 42 || b[0] !== 0x66 || b[1] !== 0x4c || b[2] !== 0x61 || b[3] !== 0x43) return undefined;
  if ((b[4]! & 0x7f) !== 0) return undefined; // the first block must be STREAMINFO
  const s = 8; // after "fLaC" and the 4-byte block header
  const rate = (b[s + 10]! << 12) | (b[s + 11]! << 4) | (b[s + 12]! >> 4);
  const total = (b[s + 13]! & 0x0f) * 2 ** 32 + ((b[s + 14]! << 24) >>> 0) + (b[s + 15]! << 16) + (b[s + 16]! << 8) + b[s + 17]!;
  return rate > 0 && total > 0 ? total / rate : undefined;
}

/** RIFF WAVE: the data chunk's bytes over the fmt chunk's byte rate. */
function wavSeconds(b: Uint8Array): number | undefined {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  if (b.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return undefined;
  let byteRate = 0;
  for (let o = 12; o + 8 <= b.length; ) {
    const id = tag(o);
    const size = dv.getUint32(o + 4, true);
    if (id === "fmt " && o + 16 <= b.length) byteRate = dv.getUint32(o + 16, true);
    if (id === "data") return byteRate > 0 && size > 0 ? Math.min(size, b.length - o - 8) / byteRate : undefined;
    o += 8 + size + (size % 2);
  }
  return undefined;
}

/** The length the file's own header states, in seconds (2 decimals); undefined when it states none. */
export function headerSeconds(bytes: Uint8Array): number | undefined {
  const s = flacSeconds(bytes) ?? wavSeconds(bytes);
  return s === undefined ? undefined : Math.round(s * 100) / 100;
}

// ── a render's condition ───────────────────────────────────────────────────

/** Where a take's condition came from: gen.py's own log row, or its file name when no row names it. */
export type ConditionFrom = "runs.jsonl" | "filename";

const isCot = (v: unknown): v is Yue2Cot => typeof v === "string" && (YUE2_COT as readonly string[]).includes(v);

/** A gen.py `runs.jsonl` row as a condition; undefined when it holds no cot or seed. */
export function conditionOfRun(row: Record<string, unknown>): Yue2Condition | undefined {
  const cot = row["cot"];
  const seed = fin(row["seed"]);
  if (!isCot(cot) || seed === undefined) return undefined;
  const cfg = fin(row["cfg_scale"]);
  const lora = obj(row["lora"]);
  const adapterPath = text(lora?.["path"]);
  const strength = fin(lora?.["strength"]);
  return {
    cot,
    ...(cfg === undefined ? {} : { cfg }),
    seed,
    ...(adapterPath === undefined ? {} : { adapter: segmentsOf(adapterPath).at(-1)! }),
    ...(adapterPath === undefined || strength === undefined ? {} : { adapterStrength: strength }),
  };
}

/**
 * A condition read off a gen.py file name: `hh_cotoff_cfg1.5_s3`, `hiphop_s1_cotfull`,
 * `sv_x_str0.5_cotoff_cfgdef_s1`. `cfgdef` is the model's default (absent). An adapter is named by
 * the stem before `_str` (the log's `lora.name`; its file is not in the name, so `.safetensors` is assumed).
 */
export function conditionOfName(stem: string): Yue2Condition | undefined {
  const cot = /(?:^|_)cot(full|melody|off)(?:_|$)/.exec(stem)?.[1];
  const seed = /(?:^|_)s(\d+)(?:_|$)/.exec(stem)?.[1];
  if (!isCot(cot) || seed === undefined) return undefined;
  const cfg = /(?:^|_)cfg(\d+(?:\.\d+)?)(?:_|$)/.exec(stem)?.[1];
  const str = /^(.+?)_str(\d+(?:\.\d+)?)(?:_|$)/.exec(stem);
  return {
    cot,
    ...(cfg === undefined ? {} : { cfg: Number(cfg) }),
    seed: Number(seed),
    ...(str === null ? {} : { adapter: `${str[1]}.safetensors`, adapterStrength: Number(str[2]) }),
  };
}

/** The stages a post.py variant's name carries (`v3s_stems_debuzzS_master` -> stems, debuzz, master), in chain order. */
export function postStagesOfName(name: string): Yue2PostStage[] {
  const tokens = new Set(name.split("_").map((t) => t.replace(/S$/, "")));
  return YUE2_POST_STAGES.filter((s) => tokens.has(s));
}

// ── score.py rows ──────────────────────────────────────────────────────────

/**
 * One score.py row as SongScores (CONTRACT-python.md, score.py): wer <- wer_min, werSd <- wer_sd_min,
 * per <- per_min, songEval <- the five SongEval dims, aesthetics <- CE/CU/PC/PQ, buzzIdx <- the mix's
 * buzz index (dB), transcript <- Qwen3-ASR on the mix. A figure the row does not hold is omitted.
 * The answer passes the scores door, or says why it does not.
 */
export function songScoresOfRow(row: Record<string, unknown>, sha: string): { ok: true; value: SongScores } | { ok: false; reason: string } {
  const se = obj(row["songeval"]);
  const ae = obj(row["aesthetics"]);
  const songEval = se && { coherence: fin(se["Coherence"]), musicality: fin(se["Musicality"]), memorability: fin(se["Memorability"]), clarity: fin(se["Clarity"]), naturalness: fin(se["Naturalness"]) };
  const aesthetics = ae && { ce: fin(ae["CE"]), cu: fin(ae["CU"]), pc: fin(ae["PC"]), pq: fin(ae["PQ"]) };
  const whole = <T extends Record<string, number | undefined>>(g: T | undefined) => (g !== undefined && Object.values(g).every((v) => v !== undefined) ? (g as { [K in keyof T]: number }) : undefined);
  const wer = fin(row["wer_min"]);
  const werSd = fin(row["wer_sd_min"]);
  const per = fin(row["per_min"]);
  const buzzIdx = fin(obj(obj(row["buzz"])?.["mix"])?.["buzz_index_db"]);
  const transcript = text(obj(obj(obj(row["asr"])?.["qwen3"])?.["mix"])?.["text"]);
  const scoredAt = text(row["scored_at"]);
  if (scoredAt === undefined) return { ok: false, reason: "no scored_at" };
  const se5 = whole(songEval);
  const ae4 = whole(aesthetics);
  const candidate: SongScores = {
    sha,
    scorerVersion: SONG_SCORER_VERSION,
    ...(wer === undefined ? {} : { wer }),
    ...(werSd === undefined ? {} : { werSd }),
    ...(per === undefined ? {} : { per }),
    ...(se5 === undefined ? {} : { songEval: se5 }),
    ...(ae4 === undefined ? {} : { aesthetics: ae4 }),
    ...(buzzIdx === undefined ? {} : { buzzIdx }),
    ...(transcript === undefined ? {} : { transcript }),
    scoredAt,
  };
  const p = parseSongScores(candidate);
  return p.ok ? { ok: true, value: p.value } : { ok: false, reason: p.error.message };
}
