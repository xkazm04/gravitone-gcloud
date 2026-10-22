import { execFile } from "node:child_process";
import { copyFile, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { MAX_KEYFRAMES, MEASURE_H, MEASURE_W, keepOrThrow, measureGray, ptsTimes, sceneFilter, spreadEvenly, thrownTally, SCENE_THRESHOLD } from "@gt/producers/scout-ingest/gates";
import type { IngestOutcome } from "@gt/producers/scout-ingest/define";

import { imageDims } from "../extract/imageDims";
import { safeFetch, type Resolver } from "../../imaging/safeUrl";
import { FoundryError } from "../runStore";
import { mutateNight, readNight, resolveInNight } from "./store";
import type { NightId, ScoutSource, SourceId } from "./types";

// THE SCOUT INGEST ENGINE - server only (no marker: pipeline/scout.mts imports it
// under tsx, where `server-only` throws). One source of a night onto this box:
//
//   image  safeFetch + a byte cap -> sources/<s-NN>/p-001.<ext>
//   page   safeFetch the HTML; og:image and up to 8 <img> srcs, each as an image
//   video  yt-dlp (<=1080p, --no-playlist, <=20 min) -> sources/<s-NN>/.media/,
//          ffmpeg scene-cut keyframes through the gates (@gt/producers/scout-ingest
//          gates.ts, ported from pipeline/vlm-probe/ingest.py) -> k-NNN.jpg with
//          their `at`, then the download DELETED: frames are what a night keeps,
//          the film is third-party material held for study (vlm-probe README.md:87).
//
// Every fetch goes through safeFetch (lib/imaging/safeUrl.ts): scheme, literal and
// resolved-address checks on EVERY redirect hop. A video URL is yt-dlp's to fetch,
// so it passes `assertFetchable` at add-source (./sources.ts) instead. Binaries come
// from PATH or YTDLP / FFMPEG / FFPROBE (as lib/producers/media-facts.ts), and every
// spawn is bounded - a timeout, an output cap, no window - with the tool's last
// stderr lines kept verbatim for the source's `error`.

const MIN = 60;
/** The night takes a video of at most this length (wave 4); a longer one is refused with its number. */
export const MAX_VIDEO_S = 20 * MIN;
/** extract's MAX_SOURCE_BYTES (lib/foundry/extract/store.ts): a picture the style launch would refuse is not held. */
export const MAX_PICTURE_BYTES = 12 * 1024 * 1024;
const MAX_PAGE_BYTES = 4 * 1024 * 1024;
const MAX_PAGE_IMAGES = 8;
/** A picture whose short side is under this is an icon, a tracker or a thumbnail, not a look. */
const MIN_PICTURE_SIDE = 160;
const FETCH_TIMEOUT_MS = 60_000;
const UA = "Mozilla/5.0 (compatible; gravitone-scout/1; study copy, reference only)";

/* ── The spawn port ──────────────────────────────────────────────────────── */

export type SpawnResult = { readonly ok: true; readonly stdout: Buffer; readonly stderr: string } | { readonly ok: false; readonly error: string };
export type SpawnOptions = { readonly timeoutMs: number; readonly maxBuffer: number };
export type Spawn = (bin: string, args: readonly string[], opts: SpawnOptions) => Promise<SpawnResult>;

/** The last lines a tool wrote to stderr, verbatim (media-facts.ts `run`). */
export const lastLines = (s: string, n = 3): string =>
  s
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .slice(-n)
    .join(" | ");

export const realSpawn: Spawn = (bin, args, opts) =>
  new Promise((resolve) => {
    execFile(bin, [...args], { encoding: "buffer", timeout: opts.timeoutMs, maxBuffer: opts.maxBuffer, windowsHide: true }, (e, stdout, stderr) => {
      const said = stderr.toString("utf8");
      if (e === null) return resolve({ ok: true, stdout, stderr: said });
      const killed = (e as { killed?: boolean }).killed === true ? ` (killed after ${Math.round(opts.timeoutMs / 1000)} s)` : "";
      const tail = lastLines(said);
      resolve({ ok: false, error: `${tail !== "" ? tail : e.message}${killed}` });
    });
  });

export type Bins = { readonly ytdlp: string; readonly ffmpeg: string; readonly ffprobe: string };
export const binsFrom = (env: Readonly<Record<string, string | undefined>>): Bins => ({
  ytdlp: env["YTDLP"]?.trim() || "yt-dlp",
  ffmpeg: env["FFMPEG"]?.trim() || "ffmpeg",
  ffprobe: env["FFPROBE"]?.trim() || "ffprobe",
});

export type IngestDeps = {
  readonly spawn: Spawn;
  readonly bins: Bins;
  /** safeFetch's resolver; the real DNS when absent. A test passes a fake, never a weaker check. */
  readonly resolve?: Resolver;
};

export const realDeps = (env: Readonly<Record<string, string | undefined>> = process.env): IngestDeps => ({ spawn: realSpawn, bins: binsFrom(env) });

/** A source's failure, carried to its `error` verbatim. */
class SourceFailure extends Error {}

async function tool(deps: IngestDeps, name: keyof Bins, args: readonly string[], opts: SpawnOptions): Promise<{ stdout: Buffer; stderr: string }> {
  const r = await deps.spawn(deps.bins[name], args, opts);
  if (!r.ok) throw new SourceFailure(`${name === "ytdlp" ? "yt-dlp" : name}: ${r.error}`);
  return r;
}

/* ── Pictures ────────────────────────────────────────────────────────────── */

async function readCapped(res: Response, cap: number, what: string): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > cap) throw new SourceFailure(`${what} declares ${Math.round(declared / 1024 / 1024)} MB; the cap is ${cap / 1024 / 1024} MB`);
  if (res.body === null) return new Uint8Array();
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > cap) {
      await reader.cancel();
      throw new SourceFailure(`${what} is over the ${cap / 1024 / 1024} MB cap`);
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}

const extOf = (b: Uint8Array): string | null => (b[0] === 0x89 && b[1] === 0x50 ? ".png" : b[0] === 0xff && b[1] === 0xd8 ? ".jpg" : b[0] === 0x52 && b[1] === 0x49 ? ".webp" : null);

async function get(url: string, deps: IngestDeps): Promise<Response> {
  try {
    return await safeFetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": UA } }, deps.resolve);
  } catch (e) {
    throw new SourceFailure(errorMessage(e));
  }
}

/** One picture: fetched, capped, sniffed (PNG, JPEG or WebP by its bytes, never its header). */
async function picture(url: string, deps: IngestDeps): Promise<{ bytes: Uint8Array; ext: string; short: number }> {
  const res = await get(url, deps);
  if (!res.ok) throw new SourceFailure(`${url} answered ${res.status}`);
  const bytes = await readCapped(res, MAX_PICTURE_BYTES, url);
  const dims = imageDims(bytes);
  const ext = extOf(bytes);
  if (dims === null || ext === null) throw new SourceFailure(`${url} is not a PNG, JPEG or WebP (${res.headers.get("content-type") ?? "no content-type"})`);
  return { bytes, ext, short: Math.min(dims.width, dims.height) };
}

const rel = (sourceId: SourceId, name: string): string => `sources/${sourceId}/${name}`;
const pName = (i: number, ext: string): string => `p-${String(i).padStart(3, "0")}${ext}`;

async function ingestImage(dir: string, s: ScoutSource, deps: IngestDeps): Promise<Partial<ScoutSource>> {
  const p = await picture(s.url, deps);
  const name = pName(1, p.ext);
  await writeFile(path.join(dir, name), p.bytes);
  return { files: [rel(s.id, name)] };
}

/** `<tag a="b" c='d'>` -> its attributes, lower-cased names. */
function attrs(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const name = m[1]?.toLowerCase();
    if (name !== undefined && !out.has(name)) out.set(name, (m[3] ?? m[4] ?? m[5] ?? "").replaceAll("&amp;", "&"));
  }
  return out;
}

/** og:image first, then the page's <img> srcs, made absolute against the page, http(s) only, once each. */
export function pagePictures(html: string, base: string): string[] {
  const urls: string[] = [];
  const add = (raw: string | undefined): void => {
    if (raw === undefined || raw.trim() === "" || raw.startsWith("data:")) return;
    try {
      const u = new URL(raw.trim(), base);
      if ((u.protocol === "http:" || u.protocol === "https:") && !urls.includes(u.href)) urls.push(u.href);
    } catch {
      /* not a URL: not a picture */
    }
  };
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    const key = (a.get("property") ?? a.get("name") ?? "").toLowerCase();
    if (key === "og:image" || key === "og:image:url" || key === "og:image:secure_url") add(a.get("content"));
  }
  const og = urls.length > 0 ? 1 : 0;
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    if (urls.length >= og + MAX_PAGE_IMAGES) break;
    add(attrs(m[0]).get("src"));
  }
  return urls.slice(0, og + MAX_PAGE_IMAGES);
}

async function ingestPage(dir: string, s: ScoutSource, deps: IngestDeps): Promise<Partial<ScoutSource>> {
  const res = await get(s.url, deps);
  if (!res.ok) throw new SourceFailure(`${s.url} answered ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (!/html|xml/i.test(type)) throw new SourceFailure(`${s.url} is ${type || "untyped"}, not a page`);
  const html = new TextDecoder().decode(await readCapped(res, MAX_PAGE_BYTES, s.url));
  const found = pagePictures(html, res.url !== "" ? res.url : s.url);
  if (found.length === 0) throw new SourceFailure(`${s.url} names no og:image and no <img>`);
  const files: string[] = [];
  const skipped: string[] = [];
  for (const url of found) {
    try {
      const p = await picture(url, deps);
      if (p.short < MIN_PICTURE_SIDE) {
        skipped.push(`${url}: ${p.short}px on its short side`);
        continue;
      }
      const name = pName(files.length + 1, p.ext);
      await writeFile(path.join(dir, name), p.bytes);
      files.push(rel(s.id, name));
    } catch (e) {
      skipped.push(errorMessage(e));
    }
  }
  if (files.length === 0) throw new SourceFailure(`none of the page's ${found.length} picture(s) could be kept: ${skipped.slice(0, 3).join("; ")}`);
  return { files };
}

/* ── Video ───────────────────────────────────────────────────────────────── */

const clock = (s: number): string => `${Math.floor(s / MIN)}m${String(Math.round(s % MIN)).padStart(2, "0")}s`;
const tooLong = (s: number): string => `the video runs ${clock(s)}; a night takes at most ${clock(MAX_VIDEO_S)}`;

/** Download at <=1080p, one video, never a playlist (ingest.py:57-78). The picture only: frames need no audio. */
async function download(url: string, media: string, deps: IngestDeps): Promise<string> {
  const probe = await tool(deps, "ytdlp", ["--no-warnings", "--no-playlist", "--skip-download", "--print", "duration", url], { timeoutMs: 60_000, maxBuffer: 1024 * 1024 });
  const said = Number(probe.stdout.toString("utf8").trim().split(/\r?\n/)[0]);
  if (Number.isFinite(said) && said > MAX_VIDEO_S) throw new SourceFailure(tooLong(said));
  await mkdir(media, { recursive: true });
  const r = await tool(
    deps,
    "ytdlp",
    ["--no-warnings", "--no-playlist", "-f", "bestvideo[height<=1080]/best[height<=1080]", "--max-filesize", "2G", "-o", path.join(media, "%(id)s.%(ext)s"), "--print", "after_move:filepath", url],
    { timeoutMs: 20 * MIN * 1000, maxBuffer: 4 * 1024 * 1024 },
  );
  for (const line of r.stdout.toString("utf8").split(/\r?\n/).reverse()) {
    const p = line.trim();
    if (p !== "" && (await stat(p).catch(() => null))?.isFile() === true) return p;
  }
  // --print can be swallowed when the file was already present (ingest.py:72-76).
  const left = (await readdir(media, { withFileTypes: true })).filter((d) => d.isFile());
  if (left[0] === undefined) throw new SourceFailure(`yt-dlp: finished and left no file (${lastLines(r.stderr) || "no stderr"})`);
  return path.join(media, left[0].name);
}

/** ffprobe's format duration (ingest.py:81-88). */
async function duration(file: string, deps: IngestDeps): Promise<number> {
  const r = await tool(deps, "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { timeoutMs: 30_000, maxBuffer: 1024 * 1024 });
  const n = Number(r.stdout.toString("utf8").trim());
  if (!Number.isFinite(n) || n <= 0) throw new SourceFailure(`ffprobe: no duration for the download (${r.stdout.toString("utf8").trim() || "empty"})`);
  return n;
}

async function keyframes(dir: string, s: ScoutSource, file: string, work: string, deps: IngestDeps): Promise<{ files: string[]; at: Record<string, number> }> {
  await mkdir(work, { recursive: true });
  // One frame per CUT, each stamped with its time (ingest.py:91-114).
  const cut = await tool(deps, "ffmpeg", ["-hide_banner", "-nostdin", "-i", file, "-vf", sceneFilter(), "-vsync", "vfr", "-q:v", "3", path.join(work, "f-%05d.jpg")], {
    timeoutMs: 20 * MIN * 1000,
    maxBuffer: 32 * 1024 * 1024,
  });
  const times = ptsTimes(cut.stderr);
  const frames = (await readdir(work)).filter((n) => /^f-\d{5}\.jpg$/.test(n)).sort();
  if (frames.length === 0) throw new SourceFailure(`no cut above scene ${SCENE_THRESHOLD} in ${clock(s.durationS ?? 0)}: nothing to sample`);
  // The gates' thumbnail, every frame in one pass: grey, then 160x90 (ingest.py:131 convert("L").resize).
  const raw = await tool(deps, "ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", path.join(work, "f-%05d.jpg"), "-vf", `format=gray,scale=${MEASURE_W}:${MEASURE_H}:flags=bicubic`, "-f", "rawvideo", "pipe:1"], {
    timeoutMs: 5 * MIN * 1000,
    maxBuffer: frames.length * MEASURE_W * MEASURE_H + 1024 * 1024,
  });
  const size = MEASURE_W * MEASURE_H;
  if (raw.stdout.byteLength < frames.length * size) throw new SourceFailure(`ffmpeg: ${frames.length} frame(s) cut, ${Math.floor(raw.stdout.byteLength / size)} measured`);
  const gated = keepOrThrow(frames.map((frame, i) => ({ frame, at: times[i] ?? -1, measure: measureGray(raw.stdout.subarray(i * size, (i + 1) * size)) })));
  const kept = spreadEvenly(gated.kept, MAX_KEYFRAMES);
  if (kept.length === 0) throw new SourceFailure(`${frames.length} cut(s), none through the gates (thrown: ${thrownTally(gated.thrown)})`);
  const files: string[] = [];
  const at: Record<string, number> = {};
  for (const [i, k] of kept.entries()) {
    const name = `k-${String(i + 1).padStart(3, "0")}.jpg`;
    await copyFile(path.join(work, k.frame), path.join(dir, name));
    files.push(rel(s.id, name));
    at[rel(s.id, name)] = Math.round(k.at * 100) / 100;
  }
  return { files, at };
}

async function ingestVideo(dir: string, s: ScoutSource, deps: IngestDeps): Promise<Partial<ScoutSource>> {
  const media = path.join(dir, ".media");
  try {
    const file = await download(s.url, media, deps);
    const durationS = Math.round((await duration(file, deps)) * 100) / 100;
    if (durationS > MAX_VIDEO_S) throw new SourceFailure(tooLong(durationS));
    const k = await keyframes(dir, { ...s, durationS }, file, path.join(media, "frames"), deps);
    return { files: k.files, at: k.at, durationS };
  } finally {
    // Frames are what we keep; the download never outlives its unit, kept or failed.
    await rm(media, { recursive: true, force: true });
  }
}

/* ── One source ──────────────────────────────────────────────────────────── */

/**
 * Ingest one source of a night and write what happened onto it. Err only when the
 * night cannot be read or written; a source that fails is `ok` with `status: "failed"`.
 * A source no longer pending (another drive took it) is answered as it stands.
 */
export async function ingestSource(nightId: NightId, sourceId: SourceId, deps: IngestDeps, stillHeld: () => void = () => {}): Promise<Result<IngestOutcome>> {
  let s: ScoutSource | undefined;
  try {
    s = (await readNight(nightId)).sources.find((x) => x.id === sourceId);
  } catch (e) {
    return err(e instanceof FoundryError && e.status === 404 ? "not-found" : "unavailable", errorMessage(e));
  }
  if (s === undefined) return err("not-found", `night ${nightId} has no source ${sourceId}`);
  if (s.status !== "pending") return ok({ status: s.status, files: s.files.length, ...(s.error === undefined ? {} : { error: s.error }) });
  const dir = resolveInNight(nightId, `sources/${sourceId}`);
  let patch: Partial<ScoutSource>;
  try {
    await mkdir(dir, { recursive: true });
    patch = s.kind === "image" ? await ingestImage(dir, s, deps) : s.kind === "page" ? await ingestPage(dir, s, deps) : await ingestVideo(dir, s, deps);
    patch = { ...patch, status: "ingested" };
  } catch (e) {
    // A thrown error that is not a tool's or a fetch's sentence is still the source's: said once, verbatim.
    patch = { status: "failed", error: errorMessage(e), files: [] };
  }
  try {
    stillHeld();
    const night = await mutateNight(nightId, (n) => ({ ...n, sources: n.sources.map((x) => (x.id === sourceId ? withPatch(x, patch) : x)) }));
    const after = night.sources.find((x) => x.id === sourceId);
    return ok({ status: after?.status === "ingested" ? "ingested" : "failed", files: after?.files.length ?? 0, ...(after?.error === undefined ? {} : { error: after.error }) });
  } catch (e) {
    return err("unavailable", `night ${nightId}: ${sourceId} was ingested and could not be recorded: ${errorMessage(e)}`);
  }
}

/** A source with the unit's outcome on it; a stale error is dropped. Its id, URL, kind and rights never move. */
function withPatch(s: ScoutSource, p: Partial<ScoutSource>): ScoutSource {
  const { error: _stale, ...rest } = s;
  return { ...rest, ...p, rights: "reference-only", id: s.id, url: s.url, kind: s.kind };
}
