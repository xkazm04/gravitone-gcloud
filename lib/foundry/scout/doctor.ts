import { existsSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { timerResource } from "@gt/producers/publish/timers";

import { probeGoogle, probeLeonardo, type KeyFetch, type KeyProbe } from "../../imaging/keyProbe";
import { leonardoStudioHealth } from "../../imaging/providers/leonardoStudio";
import type { StudioHealth } from "../../imaging/studio/types";
import { comfyBase, comfyStats, missingModels, type ComfyFetch } from "../../imaging/video/comfyLtx";
import { SUNO_CDP_PORT, type SunoDriverHealth } from "../../suno/types";
import { binsFrom, lastLines, realSpawn, type Bins, type Spawn } from "./ingest";
import { REGISTRY_REMEDY, resolveRegistry, techniqueCount } from "./registry";

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
// every model file pipeline/video/ltx-i2v-api.json loads, and the always-on worker beating in the
// store (spark night-load-band: it drives the night's detached jobs). A dry night
// (`doctor --dry`) reads those as notes: its clips are stand-ins.
// The ai-registry is never needed: a night without it opens with `registry: none` in its
// registry.md, so its line is a note either way (./registry.ts). Nor is the Leonardo studio: the
// night's idea artboards are drawn there, and a studio that is not ready fails those ideas with its
// own sentence - its line is a note, read through the studio's health, which attaches to a running
// browser and never launches one. Nor is Playwright's chromium: the night's stats reels are authored
// in code and their tile is a frame of the strip drawn in it (pipeline/strips/render.mts); without it
// those ideas fail with the launch's sentence, so its line is a note too - read from the path
// Playwright would launch, never by launching it. The Suno browser (spark scout-decision-graph) is needed
// only by a live night that makes tracks - the night's track cap handed in as `tracks`; otherwise its line
// is a note and no browser is attached to.

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
  /** The repo whose `.ai/manifest.yaml` names the registry (default `process.cwd()`). */
  readonly repoDir?: string;
  /** The Leonardo studio's health (default the provider's, lib/imaging/providers/leonardoStudio.ts); a test hands a fake. */
  readonly studio?: () => Promise<StudioHealth>;
  /** Where Playwright's chromium would launch from (default its own `executablePath`); a test hands a fake. */
  readonly chromium?: () => Promise<string>;
  /** The last instant (ms) the always-on worker was seen alive in the store, undefined when never; a test hands a fake. */
  readonly worker?: () => Promise<number | undefined>;
  /** The doctor's clock (default Date.now). */
  readonly now?: () => number;
  /** The Suno browser's health (default lib/suno/driver.ts `probeSunoOn(SUNO_CDP_PORT)`); a test hands a fake. */
  readonly suno?: () => Promise<SunoDriverHealth>;
  /** The night's track cap (`--tracks`): a live night with tracks to make needs Suno. Absent: the Suno line is a note. */
  readonly tracks?: number;
};

const PROBES: Readonly<Record<(typeof NIGHT_KEYS)[number], (key: string, f?: KeyFetch) => Promise<KeyProbe>>> = {
  GOOGLE_AI_API_KEY: probeGoogle,
  LEONARDO_API_KEY: probeLeonardo,
};

/** What starts ComfyUI on this box (`COMFY_START` moves it): the remedy when it is down. */
const COMFY_START = path.join(os.homedir(), "ai", "ComfyUI", "run_nvidia_gpu.bat");

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

/** Where the night's registry digest reads from - a note, never a failure. */
async function registryCheck(input: DoctorInput): Promise<Check> {
  const r = await resolveRegistry({ env: input.env, ...(input.repoDir === undefined ? {} : { repoDir: input.repoDir }) });
  if ("why" in r) return { name: "registry", ok: false, found: `registry: none (${r.why})`, remedy: REGISTRY_REMEDY, needed: false };
  return { name: "registry", ok: true, found: `found at ${r.dir} with ${techniqueCount(r.index)} techniques`, needed: false };
}

/** Is the studio the night's ideas are drawn in ready - a note, never a failure. */
async function studioCheck(input: DoctorInput): Promise<Check> {
  const h = await (input.studio ?? leonardoStudioHealth)().catch((e: unknown): StudioHealth => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }));
  if (h.ok) return { name: "studio", ok: true, found: "leonardo studio signed in, with credits", needed: false };
  return { name: "studio", ok: false, found: h.reason ?? "leonardo studio is not ready", remedy: "the night's idea artboards are drawn there: set LEONARDO_STUDIO_CDP and sign its Chrome profile in once (.claude/skills/music-video/SKILL.md)", needed: false };
}

/** The Suno browser on its own port: attached read-only (its sign-in cookie), never launched. */
async function sunoHealth(): Promise<SunoDriverHealth> {
  const { probeSunoOn } = await import("../../suno/driver");
  return probeSunoOn(SUNO_CDP_PORT);
}

/**
 * Is the Suno browser the night's tracks are made in running and signed in: a failure only on a live night that
 * makes tracks (`tracks` > 0), a note otherwise - a dry night's tracks are stand-ins and ask no browser.
 */
async function sunoCheck(input: DoctorInput): Promise<Check> {
  const needed = !input.dry && (input.tracks ?? 0) > 0;
  // Asked only when it can block, or when a probe is handed in: a dry night's tracks are stand-ins, and a doctor
  // that names no track cap attaches to no browser.
  if (!needed && input.suno === undefined) return { name: "suno", ok: false, found: input.dry ? "not asked: a dry night's tracks are stand-ins" : "not asked: no track cap named (doctor --tracks N)", needed };
  const h = await (input.suno ?? sunoHealth)().catch((e: unknown): SunoDriverHealth => ({ ok: false, reason: e instanceof Error ? e.message : String(e) }));
  if (h.ok) return { name: "suno", ok: true, found: `suno browser on ${SUNO_CDP_PORT}, signed in`, needed };
  return { name: "suno", ok: false, found: h.reason, remedy: `the night's tracks are made there: start the Suno Chrome profile (~/.suno-chrome, remote debugging on ${SUNO_CDP_PORT}) and sign in to suno.com once`, needed };
}

/** The browser `chromium.launch` in pipeline/strips/render.mts starts: its executable, without launching it. */
async function chromiumPath(): Promise<string> {
  const { chromium } = await import("playwright");
  return chromium.executablePath();
}

/** Is the browser the night's stats reels are drawn in installed - a note, never a failure. */
async function chromiumCheck(input: DoctorInput): Promise<Check> {
  const remedy = "the night's stats reels are drawn in it: npx playwright install chromium";
  let exe: string;
  try {
    exe = await (input.chromium ?? chromiumPath)();
  } catch (e) {
    return { name: "chromium", ok: false, found: (e as Error).message, remedy, needed: false };
  }
  try {
    await access(exe);
    return { name: "chromium", ok: true, found: exe, needed: false };
  } catch {
    return { name: "chromium", ok: false, found: `not installed (${exe})`, remedy, needed: false };
  }
}

/** A worker whose newest beat is older than this is not running (its sampler beats once a minute). */
export const WORKER_STALE_MS = 5 * 60_000;
const WORKER_START = "powershell -File pipeline/worker-service.ps1 -Run";

/**
 * The newest of the worker's two pulses in the store at `storePath`: its newest load sample and its
 * sampler's lease heartbeat (a worker whose probe fails still beats). Opened READ-ONLY with node:sqlite,
 * not through the kernel: opening a kernel migrates, and a preflight writes nothing. A store with no
 * such table yet (never opened by a worker of this version) has no pulse.
 */
export async function workerPulse(storePath: string): Promise<number | undefined> {
  if (storePath === ":memory:" || !existsSync(storePath)) return undefined;
  const db = new DatabaseSync(storePath, { readOnly: true });
  try {
    const has = (name: string): boolean => db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
    const sample = has("load_samples") ? db.prepare("SELECT max(at_ms) AS at FROM load_samples").get()?.["at"] : undefined;
    const beat = has("leases") ? db.prepare("SELECT heartbeat_at AS at FROM leases WHERE resource = ?").get(timerResource("load-sample"))?.["at"] : undefined;
    const beatMs = typeof beat === "string" ? Date.parse(beat) : Number.NaN;
    const all = [typeof sample === "number" ? sample : Number.NaN, beatMs].filter((x) => Number.isFinite(x));
    return all.length === 0 ? undefined : Math.max(...all);
  } finally {
    db.close();
  }
}

/**
 * Is the always-on worker running: a failure on a live night, because a night without one runs none of its
 * detached jobs (scene clips, game assets, stats reels wait queued) and records no load for its desk. A dry
 * night reads it as a note: its rehearsal is the CLI's, and its stand-ins prove nothing about the worker.
 */
async function workerCheck(input: DoctorInput): Promise<Check> {
  const needed = !input.dry;
  const remedy = `start it: ${WORKER_START}`;
  let at: number | undefined;
  try {
    at = await (input.worker ?? (() => workerPulse(input.storePath)))();
  } catch (e) {
    return { name: "worker", ok: false, found: `the store could not be read: ${(e as Error).message}`, remedy, needed };
  }
  if (at === undefined) return { name: "worker", ok: false, found: "no worker heartbeat on record", remedy, needed };
  const ageMs = (input.now ?? Date.now)() - at;
  const ageMin = Math.max(0, Math.floor(ageMs / 60_000));
  if (ageMs < WORKER_STALE_MS) return { name: "worker", ok: true, found: `last heartbeat ${ageMin} min ago`, needed };
  return { name: "worker", ok: false, found: `no worker heartbeat in ${ageMin} min`, remedy, needed };
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
  out.push(await workerCheck(input));
  const pinned = input.env["GRAVITONE_DRY_ONLY"] === "1";
  out.push({ name: "GRAVITONE_DRY_ONLY", ok: !pinned, found: pinned ? "1 (this shell runs dry only)" : "unset", needed: !input.dry, ...(pinned ? { remedy: "unset GRAVITONE_DRY_ONLY for a live night, or open the night without --live" } : {}) });
  out.push(...(await comfyChecks(input)));
  out.push(await registryCheck(input));
  out.push(await studioCheck(input));
  out.push(await sunoCheck(input));
  out.push(await chromiumCheck(input));
  return out;
}

/** The night cannot run: a check it needs failed. */
export const blocking = (checks: readonly Check[]): Check[] => checks.filter((c) => !c.ok && c.needed);

/** `ok   yt-dlp    2026.03.01` / `FAIL ffmpeg    ... -> remedy`. */
export function doctorLine(c: Check): string {
  const tag = c.ok ? "ok  " : c.needed ? "FAIL" : "note";
  return `${tag} ${c.name.padEnd(19)} ${c.found}${c.remedy === undefined ? "" : ` -> ${c.remedy}`}`;
}
