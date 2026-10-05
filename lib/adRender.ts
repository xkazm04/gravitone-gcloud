// THE ADS DISCIPLINE'S FINISH RENDER — server-only.
//
// WHAT THIS DOES, IN ONE SENTENCE: take the adopted clips of an ad, trim each
// to its shot length, reframe every one to the requested aspect's pixel size,
// concatenate them, append a DRAWN end-card, lay each shot's DRAWN super over
// that shot's span, optionally lay one music bed under the lot (trimmed, faded,
// loudness-normalised), and write `<exportId>.mp4` plus its `<exportId>.json`
// record under foundry-out/ad-exports/.
//
// THE IDEA IS lib/musicVideoExport.ts's, GENERALISED, AND NOTHING WAS MOVED OUT
// OF IT. Same posture gate (`canSpawnLocalBinaries`), same h264_nvenc → libx264
// fallback with the original failure logged, same single-pass
// `loudnorm=I=-14:TP=-1:LRA=11` (that file states why single-pass is enough for
// an on-demand export with no broadcast QC downstream; the reasoning carries),
// same `.partial.mp4` → rename so lib/publish/exports.ts never lists a file
// that is still being written, same JSON sidecar beside the mp4. What differs
// is the input: the music video renders every frame in a browser because its
// picture IS a canvas effect; an ad's picture is already video, so the browser
// is used only for the two things that are DRAWN — the supers and the end-card
// — and ffmpeg does the rest in one filter graph.
//
// WHY TEXT IS DRAWN IN A BROWSER AND NOT WITH ffmpeg's `drawtext`. `drawtext`
// needs a font FILE path, which differs on every machine this runs on (and on
// Windows needs the colon in `C:` escaped through two quoting layers), wraps
// nothing, and cannot place a logo image with the same layout code. A canvas
// in headless Chromium has the system's sans-serif, measures text for
// wrapping, and decodes the logo data URL natively. The output is one
// transparent PNG per super and one opaque PNG for the end-card, at the export's
// own pixel size — deterministic for a given machine and input, and the same
// Chromium the music-video export already requires.
//
// EVERY SPAWN IS INJECTED (`AdRenderDeps`). The probe runs the filter-graph
// builder as a pure function, the validation against fakes, and — when ffmpeg
// is on PATH — a real render from synthetic clips. Nothing here calls a vendor;
// the only money this pipeline touches was spent upstream (the clips, the take).
//
// RECORD LIFECYCLE: `startAdRender` validates, resolves every input it can
// check cheaply (a clip that is not on disk, a trim longer than its clip, a
// music take that has no file), writes the record as `queued`, and returns the
// id with a promise for the work. The route answers 202 and hands the promise
// to `after()`. `runAdRender` never throws: every failure lands in the record
// as `failed` with the reason, which is what the Finish step polls.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { AD_EXPORT_ID_RE, adExportRoot } from "./adExports";
import { canSpawnLocalBinaries, describePosture, localPosture } from "./deployment";
import { AD_SHOTS, type AdRenderRecord, type AdRenderRequest } from "./ads/types";
import type { Aspect } from "./imaging/types";
import { clipPath, isClipId } from "./imaging/video/store";

const run = promisify(execFile);

/* ── Constants the probe and the Finish step can hold the render to ─────── */

export const AD_RENDER_FPS = 30;

/** The delivery pixel size per aspect — the platforms' own ingest sizes, not
 *  the generation grid in lib/imaging/types.ts (ASPECT_PX), which is a
 *  provider's snap and is never a delivery size. */
export const AD_RENDER_PX: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
  "4:5": { w: 1080, h: 1350 },
};

/** Where text may sit, as insets from each edge (fractions of the frame).
 *  9:16 keeps clear of the feed UI — the caption block at the bottom and the
 *  action rail down the right — which is why it is the only asymmetric one.
 *  The others are classic title-safe margins. The overlay applies the wider
 *  side inset to BOTH sides, so drawn text is centred on the frame. */
export const AD_SAFE_ZONE: Record<Aspect, { top: number; bottom: number; left: number; right: number }> = {
  "9:16": { top: 0.14, bottom: 0.22, left: 0.06, right: 0.14 },
  "4:5": { top: 0.08, bottom: 0.12, left: 0.06, right: 0.06 },
  "1:1": { top: 0.08, bottom: 0.1, left: 0.08, right: 0.08 },
  "16:9": { top: 0.08, bottom: 0.1, left: 0.08, right: 0.08 },
};

/** The music bed's loudness target — the same line lib/musicVideoExport.ts runs. */
export const AD_LOUDNORM = "loudnorm=I=-14:TP=-1:LRA=11";
export const AD_LOUDNESS_TARGET_LUFS = -14;

/** Bounds a request is held to. A trim past a minute or a hold past ten
 *  seconds is not an ad shot or an end-card; a super past 120 characters is a
 *  paragraph. */
export const AD_RENDER_LIMITS = {
  maxTrimS: 60,
  minTrimS: 0.2,
  minHoldS: 0.5,
  maxHoldS: 10,
  maxSuperChars: 120,
  maxCtaChars: 80,
  maxLineChars: 140,
  maxLogoBytes: 2 * 1024 * 1024,
  /** How far a trim may run past the measured clip length before it is
   *  refused — container durations round to the frame. */
  trimToleranceS: 0.05,
} as const;

/* ── Errors ──────────────────────────────────────────────────────────────── */

export type AdRenderErrorCode =
  | "bad-request"
  | "unknown-clip"
  | "trim-too-long"
  | "music-missing"
  | "local-binaries-forbidden"
  | "not-found";

export class AdRenderError extends Error {
  constructor(
    message: string,
    readonly code: AdRenderErrorCode,
  ) {
    super(message);
    this.name = "AdRenderError";
  }
  get status(): number {
    switch (this.code) {
      case "local-binaries-forbidden":
        return 503;
      case "unknown-clip":
      case "music-missing":
      case "not-found":
        return 404;
      default:
        return 400;
    }
  }
}

/* ── Where exports live ──────────────────────────────────────────────────── */

export { AD_EXPORT_ID_RE, adExportRoot };

function assertExportId(id: string): void {
  if (!AD_EXPORT_ID_RE.test(id)) throw new AdRenderError("That is not an ad export id.", "bad-request");
}

export function adExportFilePath(id: string): string {
  assertExportId(id);
  return path.join(adExportRoot(), `${id}.mp4`);
}

export function adExportRecordPath(id: string): string {
  assertExportId(id);
  return path.join(adExportRoot(), `${id}.json`);
}

/** The record as this module writes it: every optional measurement field of
 *  the wire `AdRenderRecord` present (null until the render settles). */
export type AdRenderReceipt = AdRenderRecord &
  Required<Pick<AdRenderRecord, "loudness" | "width" | "height" | "encoder" | "hasAudio">>;

async function writeRecord(rec: AdRenderReceipt): Promise<void> {
  const final = adExportRecordPath(rec.exportId);
  await mkdir(path.dirname(final), { recursive: true });
  const tmp = `${final}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(rec, null, 2));
  await rename(tmp, final);
}

export async function readAdRenderRecord(id: string): Promise<AdRenderReceipt | null> {
  try {
    return JSON.parse(await readFile(adExportRecordPath(id), "utf8")) as AdRenderReceipt;
  } catch (e) {
    if (e instanceof AdRenderError) throw e;
    return null;
  }
}

export async function readAdExportFile(id: string): Promise<Buffer | null> {
  try {
    return await readFile(adExportFilePath(id));
  } catch (e) {
    if (e instanceof AdRenderError) throw e;
    return null;
  }
}

/* ── Validation (pure) ───────────────────────────────────────────────────── */

const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const SOUND_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const LOGO_RE = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/;

const bad = (m: string) => new AdRenderError(m, "bad-request");
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function textOrNull(v: unknown, field: string, max: number): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw bad(`\`${field}\` must be text or null.`);
  const t = v.trim();
  if (t.length > max) throw bad(`\`${field}\` runs ${t.length} characters; the most is ${max}.`);
  return t ? t : null;
}

/** Body → a request this module can render, or a refusal naming the field.
 *  Shape only — whether the clips and the take exist is `resolveAdInputs`. */
export function parseAdRenderRequest(body: unknown): AdRenderRequest {
  if (!isObj(body)) throw bad("The body must be a JSON object.");
  const L = AD_RENDER_LIMITS;

  if (typeof body.projectId !== "string" || !PROJECT_ID_RE.test(body.projectId)) throw bad("`projectId` is required.");
  if (typeof body.aspect !== "string" || !(body.aspect in AD_RENDER_PX))
    throw bad(`\`aspect\` must be one of ${Object.keys(AD_RENDER_PX).join(", ")}.`);
  const aspect = body.aspect as Aspect;

  if (!Array.isArray(body.shots) || body.shots.length < AD_SHOTS.min || body.shots.length > AD_SHOTS.max)
    throw bad(`\`shots\` must list ${AD_SHOTS.min}–${AD_SHOTS.max} shots.`);
  const shots = body.shots.map((raw, i) => {
    if (!isObj(raw)) throw bad(`\`shots[${i}]\` is not an object.`);
    if (!isClipId(raw.clipId)) throw bad(`\`shots[${i}].clipId\` is not a clip id.`);
    if (!finite(raw.trimS) || raw.trimS < L.minTrimS || raw.trimS > L.maxTrimS)
      throw bad(`\`shots[${i}].trimS\` must be ${L.minTrimS}–${L.maxTrimS} seconds.`);
    return { clipId: raw.clipId, trimS: raw.trimS, super: textOrNull(raw.super, `shots[${i}].super`, L.maxSuperChars) };
  });

  if (!isObj(body.endCard)) throw bad("`endCard` is required.");
  const card = body.endCard;
  const cta = textOrNull(card.cta, "endCard.cta", L.maxCtaChars);
  if (!cta) throw bad("`endCard.cta` is required.");
  const line = textOrNull(card.line, "endCard.line", L.maxLineChars);
  let logo: string | null = null;
  if (card.logo !== null && card.logo !== undefined) {
    if (typeof card.logo !== "string") throw bad("`endCard.logo` must be a PNG/JPEG data URL or null.");
    const m = LOGO_RE.exec(card.logo);
    if (!m) throw bad("`endCard.logo` must be a PNG/JPEG data URL or null.");
    if (Math.floor((m[2].length * 3) / 4) > L.maxLogoBytes) throw bad("`endCard.logo` is larger than 2 MB.");
    logo = card.logo;
  }
  if (!finite(card.holdS) || card.holdS < L.minHoldS || card.holdS > L.maxHoldS)
    throw bad(`\`endCard.holdS\` must be ${L.minHoldS}–${L.maxHoldS} seconds.`);

  let musicTakeId: string | null = null;
  if (body.musicTakeId !== null && body.musicTakeId !== undefined) {
    if (typeof body.musicTakeId !== "string" || !SOUND_ID_RE.test(body.musicTakeId))
      throw bad("`musicTakeId` must be a sound take id or null.");
    musicTakeId = body.musicTakeId;
  }

  return {
    projectId: body.projectId,
    aspect,
    shots,
    endCard: { cta, line, logo, holdS: card.holdS },
    musicTakeId,
  };
}

/* ── The injected runners ───────────────────────────────────────────────── */

export type OverlaySpec =
  | { kind: "super"; text: string; out: string }
  | { kind: "end-card"; cta: string; line: string | null; logo: string | null; out: string };

export interface AdRenderDeps {
  /** Run ffmpeg with these args; resolve with its stderr, reject on non-zero. */
  ffmpeg: (args: string[]) => Promise<{ stderr: string }>;
  /** A media file's duration in seconds, or null when it cannot be read. */
  probeDurationS: (file: string) => Promise<number | null>;
  /** Draw every spec to its `out` PNG at the export's pixel size. */
  renderOverlays: (specs: OverlaySpec[], aspect: Aspect) => Promise<void>;
  /** A sound-store take id → the absolute path of its audio file. Throws
   *  `AdRenderError("music-missing")` when there is no such take or file. */
  resolveMusicFile: (takeId: string) => Promise<string>;
}

async function realFfmpeg(args: string[]): Promise<{ stderr: string }> {
  const { stderr } = await run("ffmpeg", args, { maxBuffer: 1 << 26 });
  return { stderr: String(stderr) };
}

async function realProbeDurationS(file: string): Promise<number | null> {
  try {
    const { stdout } = await run("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const n = Number.parseFloat(String(stdout).trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function realResolveMusicFile(takeId: string): Promise<string> {
  // Imported here rather than at the top so lib/publish/exports.ts, which reads
  // `adExportRoot` from this module, does not drag the sound store along.
  const { getTake } = await import("./sound/takes");
  const { filePathAbs } = await import("./sound/store");
  let file: string;
  try {
    const take = await getTake(takeId);
    if (!take.file) throw new Error("no file");
    file = filePathAbs(take.file.path);
  } catch {
    throw new AdRenderError(`Sound take ${takeId} has no audio file in this machine's sound store.`, "music-missing");
  }
  if (!(await stat(file).then((s) => s.isFile()).catch(() => false)))
    throw new AdRenderError(`Sound take ${takeId}'s audio file is missing from the sound store.`, "music-missing");
  return file;
}

/** The overlay page: one canvas, one draw function per spec kind. Lives as a
 *  string because it runs in the browser page, not in this process. */
const OVERLAY_PAGE_SCRIPT = String.raw`
window.__drawOverlay = async function (spec, size, safe) {
  const c = document.getElementById("c");
  c.width = size.w; c.height = size.h;
  const g = c.getContext("2d");
  g.clearRect(0, 0, size.w, size.h);
  const FONT = '"Inter", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  // HORIZONTALLY SYMMETRIC: the wider of the two side insets on both sides, so
  // text is centred on the FRAME and still clear of 9:16's action rail. Using
  // each inset as-is centred text in the safe box instead — 40px left of the
  // frame's centre on 9:16, which reads as a layout error on an end-card.
  const side = Math.max(safe.left, safe.right);
  const left = size.w * side, right = size.w * (1 - side);
  const top = size.h * safe.top, bottom = size.h * (1 - safe.bottom);
  const maxW = right - left, cx = (left + right) / 2;
  const unit = Math.min(size.w, size.h);
  function wrap(text, px, weight, width, maxLines) {
    g.font = weight + " " + px + "px " + FONT;
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (g.measureText(next).width <= width || !cur) cur = next;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.slice(0, maxLines);
  }
  function fit(text, px, weight, width, maxLines) {
    let size_ = px, lines = wrap(text, size_, weight, width, 99);
    while (lines.length > maxLines && size_ > 18) { size_ = Math.round(size_ * 0.9); lines = wrap(text, size_, weight, width, 99); }
    return { px: size_, lines: lines.slice(0, maxLines) };
  }
  if (spec.kind === "super") {
    const f = fit(spec.text, Math.round(unit * 0.058), "700", maxW * 0.92, 3);
    const lh = Math.round(f.px * 1.18);
    g.font = "700 " + f.px + "px " + FONT;
    const widest = Math.max.apply(null, f.lines.map((l) => g.measureText(l).width));
    const padX = f.px * 0.55, padY = f.px * 0.4;
    const boxW = widest + padX * 2, boxH = lh * f.lines.length + padY * 2;
    const boxTop = bottom - boxH;
    g.fillStyle = "rgba(8, 9, 12, 0.62)";
    const r = f.px * 0.35, bx = cx - boxW / 2;
    g.beginPath();
    g.moveTo(bx + r, boxTop); g.lineTo(bx + boxW - r, boxTop); g.quadraticCurveTo(bx + boxW, boxTop, bx + boxW, boxTop + r);
    g.lineTo(bx + boxW, boxTop + boxH - r); g.quadraticCurveTo(bx + boxW, boxTop + boxH, bx + boxW - r, boxTop + boxH);
    g.lineTo(bx + r, boxTop + boxH); g.quadraticCurveTo(bx, boxTop + boxH, bx, boxTop + boxH - r);
    g.lineTo(bx, boxTop + r); g.quadraticCurveTo(bx, boxTop, bx + r, boxTop);
    g.fill();
    g.fillStyle = "#ffffff";
    g.textAlign = "center"; g.textBaseline = "middle";
    f.lines.forEach((l, i) => g.fillText(l, cx, boxTop + padY + lh * i + lh / 2));
  } else {
    g.fillStyle = "#0b0c10";
    g.fillRect(0, 0, size.w, size.h);
    const parts = [];
    if (spec.logo) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("the end-card logo did not decode")); i.src = spec.logo; });
      const s = Math.min((maxW * 0.6) / img.naturalWidth, ((bottom - top) * 0.24) / img.naturalHeight);
      parts.push({ h: img.naturalHeight * s, gap: unit * 0.05, draw: (y) => g.drawImage(img, cx - (img.naturalWidth * s) / 2, y, img.naturalWidth * s, img.naturalHeight * s) });
    }
    if (spec.line) {
      const f = fit(spec.line, Math.round(unit * 0.05), "500", maxW, 3);
      const lh = Math.round(f.px * 1.25);
      parts.push({ h: lh * f.lines.length, gap: unit * 0.045, draw: (y) => {
        g.font = "500 " + f.px + "px " + FONT; g.fillStyle = "rgba(255, 255, 255, 0.86)";
        g.textAlign = "center"; g.textBaseline = "middle";
        f.lines.forEach((l, i) => g.fillText(l, cx, y + lh * i + lh / 2));
      } });
    }
    {
      const f = fit(spec.cta, Math.round(unit * 0.068), "800", maxW * 0.84, 2);
      const lh = Math.round(f.px * 1.2);
      g.font = "800 " + f.px + "px " + FONT;
      const widest = Math.max.apply(null, f.lines.map((l) => g.measureText(l).width));
      const padX = f.px * 0.9, padY = f.px * 0.5;
      const w = widest + padX * 2, h = lh * f.lines.length + padY * 2;
      parts.push({ h, gap: 0, draw: (y) => {
        const x = cx - w / 2, r = h / 2;
        g.fillStyle = "#ffffff";
        g.beginPath();
        g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
        g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, (3 * Math.PI) / 2); g.fill();
        g.font = "800 " + f.px + "px " + FONT; g.fillStyle = "#0b0c10";
        g.textAlign = "center"; g.textBaseline = "middle";
        f.lines.forEach((l, i) => g.fillText(l, cx, y + padY + lh * i + lh / 2));
      } });
    }
    const total = parts.reduce((n, p, i) => n + p.h + (i < parts.length - 1 ? p.gap : 0), 0);
    let y = top + (bottom - top - total) / 2;
    for (const p of parts) { p.draw(y); y += p.h + p.gap; }
  }
  return c.toDataURL("image/png");
};`;

async function realRenderOverlays(specs: OverlaySpec[], aspect: Aspect): Promise<void> {
  if (!specs.length) return;
  const size = AD_RENDER_PX[aspect];
  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (e) {
    throw new Error(`playwright is not installed on this machine: ${e instanceof Error ? e.message : String(e)}`);
  }
  let browser: import("playwright").Browser | undefined;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch (e) {
      throw new Error(
        `Headless Chromium failed to launch: ${e instanceof Error ? e.message : String(e)}. Run "npx playwright install chromium" on this machine.`,
      );
    }
    const page = await browser.newPage({ viewport: { width: Math.min(size.w, 1920), height: Math.min(size.h, 1920) } });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><canvas id="c"></canvas></body></html>`);
    await page.addScriptTag({ content: OVERLAY_PAGE_SCRIPT });
    for (const spec of specs) {
      const dataUrl = await page.evaluate(
        async ({ spec, size, safe }) =>
          (window as unknown as { __drawOverlay: (a: unknown, b: unknown, c: unknown) => Promise<string> }).__drawOverlay(spec, size, safe),
        { spec, size, safe: AD_SAFE_ZONE[aspect] },
      );
      await writeFile(spec.out, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
    }
  } finally {
    await browser?.close().catch(() => {});
  }
}

export const REAL_AD_RENDER_DEPS: AdRenderDeps = {
  ffmpeg: realFfmpeg,
  probeDurationS: realProbeDurationS,
  renderOverlays: realRenderOverlays,
  resolveMusicFile: realResolveMusicFile,
};

/* ── Resolution (cheap I/O, before anything is queued) ──────────────────── */

export interface ResolvedShot {
  clipId: string;
  file: string;
  clipDurationS: number;
  trimS: number;
  super: string | null;
}

export interface ResolvedInputs {
  shots: ResolvedShot[];
  musicFile: string | null;
}

/** Every clip on disk with a readable length no shorter than its trim, and the
 *  music take's file — or the first refusal, naming the shot. */
export async function resolveAdInputs(req: AdRenderRequest, deps: AdRenderDeps): Promise<ResolvedInputs> {
  const shots: ResolvedShot[] = [];
  for (const [i, s] of req.shots.entries()) {
    const file = clipPath(s.clipId);
    const exists = await stat(file).then((st) => st.isFile()).catch(() => false);
    if (!exists) throw new AdRenderError(`Shot ${i + 1}: no clip ${s.clipId} in this machine's clip store.`, "unknown-clip");
    const clipDurationS = await deps.probeDurationS(file);
    if (clipDurationS === null) throw new AdRenderError(`Shot ${i + 1}: clip ${s.clipId} has no readable duration.`, "unknown-clip");
    if (s.trimS > clipDurationS + AD_RENDER_LIMITS.trimToleranceS)
      throw new AdRenderError(
        `Shot ${i + 1}: trim ${s.trimS.toFixed(2)}s is longer than clip ${s.clipId} (${clipDurationS.toFixed(2)}s).`,
        "trim-too-long",
      );
    shots.push({ clipId: s.clipId, file, clipDurationS, trimS: Math.min(s.trimS, clipDurationS), super: s.super });
  }
  const musicFile = req.musicTakeId ? await deps.resolveMusicFile(req.musicTakeId) : null;
  return { shots, musicFile };
}

/* ── The filter graph (pure) ────────────────────────────────────────────── */

export interface AdGraphInput {
  aspect: Aspect;
  shots: { file: string; trimS: number; superPng: string | null }[];
  endCard: { png: string; holdS: number };
  musicFile: string | null;
  encoder: "h264_nvenc" | "libx264";
  outPath: string;
}

export interface AdGraph {
  args: string[];
  /** The filter_complex string, also inside `args`, for assertions. */
  filter: string;
  durationS: number;
  /** Where each shot starts on the output clock. */
  shotStartS: number[];
  /** Each super's span on the output clock, in shot order (null = no super). */
  superSpans: ({ startS: number; endS: number } | null)[];
  endCardStartS: number;
  /** The order the concat filter receives its segments in. */
  concatOrder: string[];
  hasAudio: boolean;
}

const t3 = (n: number) => n.toFixed(3);

export function musicFades(totalS: number): { inS: number; outS: number } {
  return { inS: Math.min(0.3, totalS / 10), outS: Math.min(1, totalS / 4) };
}

export function buildAdRenderGraph(input: AdGraphInput): AdGraph {
  const { w, h } = AD_RENDER_PX[input.aspect];
  const fps = AD_RENDER_FPS;
  const args: string[] = ["-hide_banner", "-loglevel", "error", "-y"];
  const chains: string[] = [];
  const concatOrder: string[] = [];
  const shotStartS: number[] = [];
  let at = 0;

  // Inputs 0..n-1: the clips. Their audio, if any, is never mapped.
  input.shots.forEach((s, i) => {
    args.push("-i", s.file);
    shotStartS.push(at);
    at += s.trimS;
    // COVER, NOT LETTERBOX: a reframe fills the frame and crops the overflow
    // centred. A letterboxed 16:9 inside a 9:16 feed is a third of the screen.
    chains.push(
      `[${i}:v]trim=duration=${t3(s.trimS)},setpts=PTS-STARTPTS,fps=${fps},` +
        `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p[v${i}]`,
    );
    concatOrder.push(`v${i}`);
  });
  const endCardStartS = at;
  const durationS = at + input.endCard.holdS;

  // Input n: the end-card, held.
  const endIdx = input.shots.length;
  args.push("-loop", "1", "-framerate", String(fps), "-t", t3(input.endCard.holdS), "-i", input.endCard.png);
  chains.push(
    `[${endIdx}:v]fps=${fps},scale=${w}:${h},setsar=1,format=yuv420p,` +
      `trim=duration=${t3(input.endCard.holdS)},setpts=PTS-STARTPTS[vend]`,
  );
  concatOrder.push("vend");
  chains.push(`${concatOrder.map((l) => `[${l}]`).join("")}concat=n=${concatOrder.length}:v=1:a=0[base]`);

  // Inputs n+1..: one looped transparent PNG per super, enabled over its shot.
  let next = endIdx + 1;
  let prev = "base";
  const superSpans: AdGraph["superSpans"] = [];
  input.shots.forEach((s, i) => {
    if (!s.superPng) {
      superSpans.push(null);
      return;
    }
    const idx = next++;
    args.push("-loop", "1", "-framerate", String(fps), "-t", t3(durationS), "-i", s.superPng);
    const startS = shotStartS[i];
    const endS = startS + s.trimS;
    superSpans.push({ startS, endS });
    chains.push(`[${idx}:v]format=rgba[s${i}]`);
    // gte/lt, not between(): between is inclusive at both ends, so two
    // adjacent supers would share the frame on the cut.
    chains.push(`[${prev}][s${i}]overlay=0:0:enable='gte(t,${t3(startS)})*lt(t,${t3(endS)})'[o${i}]`);
    prev = `o${i}`;
  });
  chains.push(`[${prev}]format=yuv420p[vout]`);

  const hasAudio = input.musicFile !== null;
  if (input.musicFile) {
    const idx = next++;
    args.push("-i", input.musicFile);
    const f = musicFades(durationS);
    chains.push(
      `[${idx}:a]apad=whole_dur=${t3(durationS)},atrim=duration=${t3(durationS)},asetpts=PTS-STARTPTS,` +
        `afade=t=in:st=0:d=${t3(f.inS)},afade=t=out:st=${t3(durationS - f.outS)}:d=${t3(f.outS)},` +
        `${AD_LOUDNORM},aresample=48000[aout]`,
    );
  }

  const filter = chains.join(";");
  const videoArgs =
    input.encoder === "h264_nvenc"
      ? ["-c:v", "h264_nvenc", "-preset", "p5", "-rc", "vbr", "-cq", "19", "-b:v", "0"]
      : ["-c:v", "libx264", "-preset", "medium", "-crf", "18"];
  args.push("-filter_complex", filter, "-map", "[vout]");
  if (hasAudio) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000");
  else args.push("-an");
  args.push(...videoArgs, "-pix_fmt", "yuv420p", "-r", String(fps), "-t", t3(durationS), "-movflags", "+faststart", input.outPath);

  return { args, filter, durationS, shotStartS, superSpans, endCardStartS, concatOrder, hasAudio };
}

/** ebur128's summary → integrated loudness and true peak. */
export function parseEbur128(stderr: string): { integratedLufs: number; truePeakDb: number | null } | null {
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const i = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary);
  if (!i || i[1] === "-inf") return null;
  const p = /True peak:\s*[\r\n]+\s*Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary);
  return { integratedLufs: Number(i[1]), truePeakDb: p && p[1] !== "-inf" ? Number(p[1]) : null };
}

/* ── The render itself ───────────────────────────────────────────────────── */

/** NVENC failed once in this process → do not pay the failed attempt again. */
let nvencUnavailable = false;

function postureRefusal(): AdRenderError {
  return new AdRenderError(
    `Ad render spawns ffmpeg and a headless browser on this machine, and it cannot: ${describePosture(localPosture())}.`,
    "local-binaries-forbidden",
  );
}

/**
 * Validate, resolve, queue. Throws `AdRenderError` for every refusal; on
 * success the record is on disk as `queued` and `done` resolves when the
 * render settles (it never rejects).
 */
export async function startAdRender(
  body: unknown,
  deps: AdRenderDeps = REAL_AD_RENDER_DEPS,
  now: () => number = Date.now,
): Promise<{ exportId: string; done: Promise<AdRenderReceipt> }> {
  if (!canSpawnLocalBinaries()) throw postureRefusal();
  const req = parseAdRenderRequest(body);
  const inputs = await resolveAdInputs(req, deps);
  const exportId = randomUUID();
  const rec: AdRenderReceipt = {
    exportId,
    projectId: req.projectId,
    aspect: req.aspect,
    status: "queued",
    error: null,
    durationS: null,
    createdAt: now(),
    finishedAt: null,
    loudness: null,
    width: null,
    height: null,
    encoder: null,
    hasAudio: null,
  };
  await writeRecord(rec);
  return { exportId, done: runAdRender(rec, req, inputs, deps, now) };
}

/** The work. Never throws — a failure is written to the record. */
export async function runAdRender(
  queued: AdRenderReceipt,
  req: AdRenderRequest,
  inputs: ResolvedInputs,
  deps: AdRenderDeps,
  now: () => number = Date.now,
): Promise<AdRenderReceipt> {
  const id = queued.exportId;
  const root = adExportRoot();
  const partial = path.join(root, `${id}.partial.mp4`);
  let workDir: string | null = null;
  let rec: AdRenderReceipt = { ...queued, status: "rendering" };
  try {
    await writeRecord(rec);
    workDir = await mkdtemp(path.join(tmpdir(), "ad-render-"));

    const specs: OverlaySpec[] = [
      { kind: "end-card", cta: req.endCard.cta, line: req.endCard.line, logo: req.endCard.logo, out: path.join(workDir, "end.png") },
    ];
    const superPngs = inputs.shots.map((s, i) => {
      if (!s.super) return null;
      const out = path.join(workDir!, `super-${i}.png`);
      specs.push({ kind: "super", text: s.super, out });
      return out;
    });
    await deps.renderOverlays(specs, req.aspect);

    await mkdir(root, { recursive: true });
    const graphFor = (encoder: "h264_nvenc" | "libx264") =>
      buildAdRenderGraph({
        aspect: req.aspect,
        shots: inputs.shots.map((s, i) => ({ file: s.file, trimS: s.trimS, superPng: superPngs[i] })),
        endCard: { png: path.join(workDir!, "end.png"), holdS: req.endCard.holdS },
        musicFile: inputs.musicFile,
        encoder,
        outPath: partial,
      });

    let encoder: "h264_nvenc" | "libx264" = nvencUnavailable ? "libx264" : "h264_nvenc";
    try {
      await deps.ffmpeg(graphFor(encoder).args);
    } catch (e) {
      if (encoder !== "h264_nvenc") throw e;
      // Same fallback, same reason, same log line as lib/musicVideoExport.ts.
      console.warn("[ads/render] h264_nvenc failed, falling back to libx264:", e instanceof Error ? e.message : e);
      nvencUnavailable = true;
      encoder = "libx264";
      await deps.ffmpeg(graphFor(encoder).args);
    }

    let loudness: AdRenderReceipt["loudness"] = null;
    if (inputs.musicFile) {
      try {
        const { stderr } = await deps.ffmpeg([
          "-hide_banner", "-nostats", "-loglevel", "info", "-i", partial, "-map", "0:a:0",
          "-af", "ebur128=peak=true", "-f", "null", "-",
        ]);
        loudness = parseEbur128(stderr);
      } catch (e) {
        console.warn("[ads/render] loudness measurement failed:", e instanceof Error ? e.message : e);
      }
    }

    await rename(partial, adExportFilePath(id));
    const measured = await deps.probeDurationS(adExportFilePath(id));
    const { w, h } = AD_RENDER_PX[req.aspect];
    rec = {
      ...rec,
      status: "done",
      durationS: measured,
      finishedAt: now(),
      loudness,
      width: w,
      height: h,
      encoder,
      hasAudio: inputs.musicFile !== null,
    };
    await writeRecord(rec);
    return rec;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[ads/render] ${id} failed:`, message);
    rec = { ...rec, status: "failed", error: message.slice(0, 2000), finishedAt: now() };
    await writeRecord(rec).catch(() => {});
    return rec;
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true }).catch(() => {});
    await rm(partial, { force: true }).catch(() => {});
  }
}
