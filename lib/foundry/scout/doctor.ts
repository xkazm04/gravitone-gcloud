import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { probeGoogle, probeLeonardo, type KeyFetch, type KeyProbe } from "../../imaging/keyProbe";
import { comfyBase, comfyStats, missingModels, type ComfyFetch } from "../../imaging/video/comfyLtx";
import { binsFrom, lastLines, realSpawn, type Bins, type Spawn } from "./ingest";

// THE BOX PREFLIGHT for a /scout night - read-only, nothing spent, nothing
// installed. One line per check; a failing line carries its remedy, and the
// CLI (pipeline/scout.mts doctor) exits 1 when a check the night needs fails.
// Key VALUES are never printed: a doctor's output is pasted into night summaries and
// chats. On a LIVE night each key is also tried once against its vendor's free read
// (lib/imaging/keyProbe.ts) - "set" was not enough: a placeholder is set.
//
// What a night needs: the three binaries always (ingest runs on every night, dry
// or live - it is free), and for a LIVE night the two vendor keys, a shell that
// is not pinned dry, and - while its clips render locally (`SCOUT_CLIP_ENGINE`
// unset or `ltx-local`) - the ComfyUI on this box answering at `COMFY_URL` with
// every model file pipeline/video/ltx-i2v-api.json loads. A dry night
// (`doctor --dry`) reads those as notes: its clips are stand-ins.

export type Check = {
  readonly name: string;
  readonly ok: boolean;
  /** What was found: a version line, "set", a path. */
  readonly found: string;
  /** Present when not ok: what to do. */
  readonly remedy?: string;
  /** False for a check only a live night needs, read on a dry one. */
  readonly needed: boolean;
};

/** The keys a live night's launches reach: extract's pixels and eyes, the scene's still and clip. */
export const NIGHT_KEYS = ["GOOGLE_AI_API_KEY", "LEONARDO_API_KEY"] as const;

const BIN_REMEDY: Readonly<Record<keyof Bins, string>> = {
  ytdlp: "install yt-dlp (https://github.com/yt-dlp/yt-dlp/releases) onto PATH, or set YTDLP to its full path",
  ffmpeg: "install ffmpeg (https://www.gyan.dev/ffmpeg/builds/) onto PATH, or set FFMPEG to its full path",
  ffprobe: "ffprobe ships with ffmpeg: put it on PATH, or set FFPROBE to its full path",
};
const BIN_NAME: Readonly<Record<keyof Bins, string>> = { ytdlp: "yt-dlp", ffmpeg: "ffmpeg", ffprobe: "ffprobe" };

async function binary(spawn: Spawn, bins: Bins, k: keyof Bins): Promise<Check> {
  const flag = k === "ytdlp" ? "--version" : "-version";
  const r = await spawn(bins[k], [flag], { timeoutMs: 15_000, maxBuffer: 1024 * 1024 });
  if (!r.ok) return { name: BIN_NAME[k], ok: false, found: `${bins[k]}: ${r.error}`, remedy: BIN_REMEDY[k], needed: true };
  const first = (r.stdout.toString("utf8").split(/\r?\n/)[0] ?? "").trim();
  return { name: BIN_NAME[k], ok: true, found: first !== "" ? first : lastLines(r.stderr, 1), needed: true };
}

async function writable(dir: string): Promise<string | null> {
  try {
    await mkdir(dir, { recursive: true });
    await access(dir);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export type DoctorInput = {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** The kernel store this process would open (kernel process.ts `storeLocation`). */
  readonly storePath: string;
  /** Where nights are written (./store.ts `scoutRoot`). */
  readonly scoutRoot: string;
  /** A dry night: the keys and the dry pin are notes, not failures. */
  readonly dry: boolean;
  readonly spawn?: Spawn;
  /** ComfyUI's HTTP API (default the global fetch); a test hands a fake. */
  readonly fetch?: ComfyFetch;
  /** The vendors' key probes (default the global fetch); a test hands a fake. */
  readonly keyFetch?: KeyFetch;
};

const PROBES: Readonly<Record<(typeof NIGHT_KEYS)[number], (key: string, f?: KeyFetch) => Promise<KeyProbe>>> = {
  GOOGLE_AI_API_KEY: probeGoogle,
  LEONARDO_API_KEY: probeLeonardo,
};

/** What starts ComfyUI on this box (`COMFY_START` moves it): the remedy when it is down. */
const COMFY_START = "C:\\Users\\kazda\\ai\\ComfyUI\\run_nvidia_gpu.bat";

/** The local clip engine's lines: ComfyUI reachable, then the graph's weights present. */
async function comfyChecks(input: DoctorInput): Promise<Check[]> {
  const env = input.env;
  const engine = env["SCOUT_CLIP_ENGINE"]?.trim() || "ltx-local";
  const needed = !input.dry;
  if (engine === "hailuo") return [{ name: "clip engine", ok: true, found: "hailuo (Leonardo; each clip is paid)", needed }];
  if (engine !== "ltx-local") return [{ name: "clip engine", ok: false, found: `SCOUT_CLIP_ENGINE=${engine}`, remedy: "set SCOUT_CLIP_ENGINE to ltx-local or hailuo, or unset it (ltx-local)", needed }];
  const deps = { base: comfyBase(env), ...(input.fetch === undefined ? {} : { fetch: input.fetch }) };
  const start = env["COMFY_START"]?.trim() || COMFY_START;
  let stats: string;
  try {
    stats = await comfyStats(deps);
  } catch (e) {
    return [{ name: "comfyui", ok: false, found: (e as Error).message, remedy: `start ComfyUI with ${start} (it stays up), or set COMFY_URL to where it runs`, needed }];
  }
  const out: Check[] = [{ name: "comfyui", ok: true, found: `${deps.base} · ${stats}`, needed }];
  try {
    const w = await missingModels(deps);
    out.push(
      w.missing.length === 0
        ? { name: "ltx weights", ok: true, found: `${w.present} model files present`, needed }
        : { name: "ltx weights", ok: false, found: `missing: ${w.missing.join(", ")}`, remedy: "put the missing files under ComfyUI's models folder; a night never downloads one", needed },
    );
  } catch (e) {
    out.push({ name: "ltx weights", ok: false, found: (e as Error).message, remedy: `ComfyUI answered /system_stats but not /object_info; restart it with ${start}`, needed });
  }
  return out;
}

export async function doctor(input: DoctorInput): Promise<Check[]> {
  const spawn = input.spawn ?? realSpawn;
  const bins = binsFrom(input.env);
  const out: Check[] = [];
  for (const k of ["ytdlp", "ffmpeg", "ffprobe"] as const) out.push(await binary(spawn, bins, k));
  for (const key of NIGHT_KEYS) {
    const value = input.env[key]?.trim() ?? "";
    if (value === "") {
      out.push({ name: key, ok: false, found: "unset", needed: !input.dry, remedy: `add ${key}=... to .env.local (a live night's launches need it)` });
      continue;
    }
    if (input.dry) {
      out.push({ name: key, ok: true, found: "set", needed: false });
      continue;
    }
    const p = await PROBES[key](value, input.keyFetch);
    out.push(p.ok ? { name: key, ok: true, found: `set · ${p.found}`, needed: true } : { name: key, ok: false, found: `set but refused · ${p.found}`, needed: true, remedy: `replace ${key} in .env.local with a working key` });
  }
  const storeDir = input.storePath === ":memory:" ? null : await writable(path.dirname(input.storePath));
  out.push({ name: "store", ok: storeDir === null, found: input.storePath, needed: true, ...(storeDir === null ? {} : { remedy: `the store's folder cannot be written (${storeDir}); set GRAVITONE_STORE_PATH` }) });
  const nights = await writable(input.scoutRoot);
  out.push({ name: "nights", ok: nights === null, found: input.scoutRoot, needed: true, ...(nights === null ? {} : { remedy: `the night folder cannot be written (${nights}); set SCOUT_STORE_DIR` }) });
  const pinned = input.env["GRAVITONE_DRY_ONLY"] === "1";
  out.push({ name: "GRAVITONE_DRY_ONLY", ok: !pinned, found: pinned ? "1 (this shell runs dry only)" : "unset", needed: !input.dry, ...(pinned ? { remedy: "unset GRAVITONE_DRY_ONLY for a live night, or open the night without --live" } : {}) });
  out.push(...(await comfyChecks(input)));
  return out;
}

/** The night cannot run: a check it needs failed. */
export const blocking = (checks: readonly Check[]): Check[] => checks.filter((c) => !c.ok && c.needed);

/** `ok   yt-dlp    2026.03.01` / `FAIL ffmpeg    ... -> remedy`. */
export function doctorLine(c: Check): string {
  const tag = c.ok ? "ok  " : c.needed ? "FAIL" : "note";
  return `${tag} ${c.name.padEnd(19)} ${c.found}${c.remedy === undefined ? "" : ` -> ${c.remedy}`}`;
}
