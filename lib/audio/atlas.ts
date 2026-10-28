import { createHash } from "node:crypto";
import { mkdir, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { err, ok, type Result } from "@gt/domain/errors";
import { keyPitch } from "@gt/ui/components/audio/brief.ts";
import { ATLAS, AUDITION_KEY, atlasById, type AtlasEntry } from "@gt/ui/components/audio/atlas.ts";

import { renderAuditionWarm, renderSketchWarm } from "./renderWorker.ts";

// THE ATLAS ON THIS MACHINE - which of @gt/ui's atlas instruments the local sample libraries can
// play, and the audition phrase each one renders.
//
// THE LIBRARIES ARE THE MACHINE'S, NOT THE REPO'S. FL Studio's packs and Ableton's Core Library
// are licensed to this box: they are found under the roots `GRAVITONE_SAMPLE_ROOTS` names
// (path-delimiter separated: `;` on Windows), read in place at render time, and never copied into
// the store or the repository. What leaves this module is a RENDER - a phrase the sidecar played
// from them - in a temp cache (`GRAVITONE_AUDITION_DIR`, else the OS temp dir), keyed by
// instrument, tempo and key so the second listen is a file read.
//
// No roots configured is a machine with no instruments: every chip draws without a play
// control (capability honesty), and the route answers `unavailable` with the variable's name.

const AUDIO_EXT = new Set([".wav", ".aif", ".aiff", ".flac", ".ogg"]);
const MAX_DEPTH = 9;
/** Bumped when the renderer changes what a file sounds like, so a cached render of the old one is never served. */
const RENDER = "r3";
/** The phrase's loudness: every audition sits here, so a choice is about timbre, not level. */
export const AUDITION_LUFS = -20;

export const SAMPLE_ROOTS_ENV = "GRAVITONE_SAMPLE_ROOTS";

export function sampleRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[SAMPLE_ROOTS_ENV] ?? "")
    .split(path.delimiter)
    .map((r) => r.trim())
    .filter((r) => r !== "");
}

export const auditionDir = (env: NodeJS.ProcessEnv = process.env): string => env["GRAVITONE_AUDITION_DIR"] ?? path.join(os.tmpdir(), "gravitone-audition");

/** Every directory under `root` holding audio files, as (path relative to root, lower-case, `/`) -> files. */
async function walk(root: string, rel: string, depth: number, out: Map<string, string[]>): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(path.join(root, rel), { withFileTypes: true });
  } catch {
    return; // an unreadable directory holds no instrument this walk can offer
  }
  const files: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) await walk(root, path.join(rel, e.name), depth + 1, out);
    else if (AUDIO_EXT.has(path.extname(e.name).toLowerCase())) files.push(path.join(root, rel, e.name));
  }
  if (files.length > 0) out.set(rel.toLowerCase().split(path.sep).join("/"), files.sort());
}

/** The atlas against directories: an entry's first folder suffix that a directory ends with. */
export function familiesOf(dirs: ReadonlyMap<string, readonly string[]>): Map<string, readonly string[]> {
  const out = new Map<string, readonly string[]>();
  for (const e of ATLAS)
    for (const suffix of e.folders) {
      const hit = [...dirs.entries()].find(([rel]) => rel === suffix || rel.endsWith(`/${suffix}`));
      if (hit !== undefined) {
        out.set(e.id, hit[1]);
        break;
      }
    }
  return out;
}

let scanned: Promise<Map<string, readonly string[]>> | null = null;
let scannedFor = "";

/** The atlas instruments this machine can play, id -> sample files; scanned once per roots value. */
export function machineAtlas(env: NodeJS.ProcessEnv = process.env): Promise<Map<string, readonly string[]>> {
  const roots = sampleRoots(env);
  const key = roots.join("|");
  if (scanned === null || scannedFor !== key) {
    scannedFor = key;
    scanned = (async () => {
      const dirs = new Map<string, string[]>();
      for (const r of roots) {
        const one = new Map<string, string[]>();
        await walk(r, "", 0, one);
        for (const [rel, files] of one) if (!dirs.has(rel)) dirs.set(rel, files);
      }
      return familiesOf(dirs);
    })();
  }
  return scanned;
}

/** The ids of the atlas instruments this machine can play (the composer's play controls). */
export async function audibleIds(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  return [...(await machineAtlas(env)).keys()];
}

export type AuditionAsk = { readonly id: string; readonly bpm: number; readonly key: string | null };

const inflight = new Map<string, Promise<Result<string>>>();
/** A render that failed answers its failure for a while rather than running again: a failed play is
 *  asked twice (the <audio> element, then explainAudition for the words) and each is a full render. */
const failed = new Map<string, { readonly at: number; readonly r: Result<string> }>();
const FAILED_FOR_MS = 120_000;
/** Inside the routes' 60 s (their deadline fires at 55): a render past this is the sidecar's refusal, in words. */
export const RENDER_TIMEOUT_MS = 50_000;

/** A cached file, or the one render of it already running, or a new render (deduped by path). */
async function cachedOr(out: string, render: () => Promise<Result<unknown>>): Promise<Result<string>> {
  const have = await stat(out).then(
    (s) => s.size > 0,
    () => false,
  );
  if (have) return ok(out);
  const recent = failed.get(out);
  if (recent !== undefined && Date.now() - recent.at < FAILED_FOR_MS) return recent.r;
  const running = inflight.get(out);
  if (running !== undefined) return running;
  const job = (async (): Promise<Result<string>> => {
    await mkdir(path.dirname(out), { recursive: true });
    const r = await render();
    if (r.ok) return ok(out);
    const refused: Result<string> = r;
    failed.set(out, { at: Date.now(), r: refused });
    return refused;
  })();
  inflight.set(out, job);
  try {
    return await job;
  } finally {
    inflight.delete(out);
  }
}

/** A short hash of the sample files a render reads: a library that changes renders anew. */
const filesTag = (files: readonly string[]): string => createHash("sha1").update(files.join("\n")).digest("hex").slice(0, 8);

export type SketchAsk = { readonly ids: readonly string[]; readonly levels: readonly number[]; readonly bpm: number; readonly key: string | null };

/** The seed's playable instruments together across the shape (pipeline/audio/sketch.py), cached by everything that shapes it. */
export async function sketchFile(ask: SketchAsk, env: NodeJS.ProcessEnv = process.env): Promise<Result<string>> {
  const entries = ask.ids.map((id) => atlasById(id));
  const unknown = ask.ids.filter((_, i) => entries[i] === undefined);
  if (unknown.length > 0) return err("invalid", `no instrument ${unknown.map((u) => `"${u}"`).join(", ")} in the atlas`);
  if (ask.ids.length === 0 || ask.ids.length > 5) return err("invalid", "a sketch carries one to five instruments");
  if (ask.levels.length < 1 || ask.levels.length > 32 || ask.levels.some((l) => !Number.isInteger(l) || l < 0 || l > 3)) return err("invalid", "a shape is 1-32 columns of levels 0-3");
  if (!Number.isInteger(ask.bpm) || ask.bpm < 40 || ask.bpm > 220) return err("invalid", `a sketch's tempo is a whole 40-220 bpm, not ${ask.bpm}`);
  const k = keyPitch(ask.key ?? AUDITION_KEY);
  if (k === null) return err("invalid", `"${ask.key ?? ""}" is not a key (C major, A minor, F#m)`);
  if (sampleRoots(env).length === 0) return err("unavailable", `no sample library is configured: ${SAMPLE_ROOTS_ENV} names none`);
  const fams = await machineAtlas(env);
  const voices: { files: readonly string[]; role: string }[] = [];
  for (const e of entries) {
    const files = e === undefined ? undefined : fams.get(e.id);
    if (e === undefined || files === undefined) return err("unavailable", `${e?.term ?? "?"}: no library under ${SAMPLE_ROOTS_ENV} files it`);
    voices.push({ files, role: e.role });
  }
  const dir = auditionDir(env);
  const tag = createHash("sha1").update(JSON.stringify([ask.ids, ask.levels, ask.bpm, k.pc, k.minor, voices.map((v) => filesTag(v.files))])).digest("hex").slice(0, 16);
  const out = path.join(dir, `sketch-${RENDER}-${tag}.wav`);
  return cachedOr(out, () => renderSketchWarm({ voices, levels: ask.levels, bpm: ask.bpm, tonic: k.pc, minor: k.minor, lufs: AUDITION_LUFS, cacheDir: dir }, out, RENDER_TIMEOUT_MS));
}

/** The audition file for one instrument at one tempo and key: from the cache, or rendered once. */
export async function auditionFile(ask: AuditionAsk, env: NodeJS.ProcessEnv = process.env): Promise<Result<string>> {
  const entry: AtlasEntry | undefined = atlasById(ask.id);
  if (entry === undefined) return err("invalid", `no instrument "${ask.id}" in the atlas`);
  if (!Number.isInteger(ask.bpm) || ask.bpm < 40 || ask.bpm > 220) return err("invalid", `an audition's tempo is a whole 40-220 bpm, not ${ask.bpm}`);
  const k = keyPitch(ask.key ?? AUDITION_KEY);
  if (k === null) return err("invalid", `"${ask.key ?? ""}" is not a key (C major, A minor, F#m)`);
  if (sampleRoots(env).length === 0) return err("unavailable", `no sample library is configured: ${SAMPLE_ROOTS_ENV} names none`);
  const files = (await machineAtlas(env)).get(entry.id);
  if (files === undefined) return err("unavailable", `${entry.term}: no library under ${SAMPLE_ROOTS_ENV} files it`);
  const dir = auditionDir(env);
  const out = path.join(dir, `${entry.id}-${RENDER}-${filesTag(files)}-${ask.bpm}-${k.pc}${k.minor ? "m" : ""}.wav`);
  return cachedOr(out, () => renderAuditionWarm({ files, bpm: ask.bpm, tonic: k.pc, minor: k.minor, role: entry.role, lufs: AUDITION_LUFS, cacheDir: dir }, out, RENDER_TIMEOUT_MS));
}
