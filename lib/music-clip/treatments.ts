// BOARD T - the treatments. Between the look (Board A) and the hero (Board B)
// the session brainstorms 3-4 films on the picked direction: who is in it, what
// happens section by section, the one camera device, the motif that changes.
// Added 2026-10-30 after the operator found a Board B built straight on a
// direction "a PowerPoint presentation": the hero was being asked to invent the
// film and be the film at once.
//
// `board t` reads `treatments.json` (TreatmentsV1, lib/music-clip/types.ts)
// and, per treatment, an optional lit WebGL scene `board-t/<id>/scene.html`
// (the gpuShot.ts contract). It refuses a file that breaks the schema with
// EVERY violation listed, shoots each scene's keyframes on the GPU, and
// assembles `board-t.html` + `board-t-sheet.png`. A treatment without a scene
// still gets its band, text only, and a warning - a half-built board renders.
//
// FRAMES OUTLIVE THE RUN. Each shoot writes `board-t/<id>/frames/shot.json`
// (renderer, ms, console errors, the times shot) beside its PNGs, so
// `--only <id>` re-shoots one scene and the others' frames and numbers are
// reused - the one being iterated on is the only one that pays.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { launch, offlinePage, settle, type BoardResult, type Checked, readDirections } from "./boards";
import { boardTPage, type TreatmentCell, type TreatmentShot } from "./boardShell";
import { clipPath, clipRoot, readJsonFile, readTimeline, requireState, writeState } from "./folder";
import { shootKeyframes, vendorThree, type ShotResult } from "./gpuShot";
import { advanceTo, ClipError, resetTo } from "./state";
import { MAX_TREATMENTS, type Treatment, type TreatmentsV1, type TimelineV1 } from "./types";

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const GRIDS = ["section", "phrase", "bar", "downbeat", "drop"] as const;
export const MAX_KEYFRAMES = 6;
const TEXT_KEYS = ["name", "logline", "characters", "characterTech", "signatureDevice", "motif", "risk"] as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** The section a track time falls in: [startS, endS), the last one closed at the end. */
export function sectionAt(t: TimelineV1, s: number) {
  const last = t.sections[t.sections.length - 1];
  return t.sections.find((x) => s >= x.startS && s < x.endS) ?? (last && s >= last.startS && s <= t.track.durationS ? last : undefined);
}

function checkTreatment(d: Record<string, unknown>, at: string, t: TimelineV1, v: string[]): void {
  for (const k of TEXT_KEYS) if (!filled(d[k])) v.push(`${at}.${k} is empty`);
  const order = t.sections.map((s) => s.id);
  const plot = d["plot"];
  if (!Array.isArray(plot)) v.push(`${at}.plot must be an array`);
  else {
    const got: string[] = [];
    plot.forEach((b: unknown, j: number) => {
      if (!isObj(b)) return void v.push(`${at}.plot[${j}] is not an object`);
      const sid = b["sectionId"];
      if (typeof sid !== "string" || !order.includes(sid)) v.push(`${at}.plot[${j}].sectionId ${JSON.stringify(sid)} is not a timeline section`);
      else got.push(sid);
      for (const k of ["beat", "shot"]) if (!filled(b[k])) v.push(`${at}.plot[${j}].${k} is empty`);
    });
    const missing = order.filter((id) => !got.includes(id));
    if (missing.length) v.push(`${at}.plot misses section(s) ${missing.join(", ")}`);
    else if (got.length !== order.length || got.some((id, j) => id !== order[j])) v.push(`${at}.plot must be one beat per section in track order (${order.join(", ")}), got ${got.join(", ")}`);
  }
  const tr = d["transitions"];
  if (!Array.isArray(tr) || tr.length === 0) v.push(`${at}.transitions must be a non-empty array`);
  else
    tr.forEach((x: unknown, j: number) => {
      if (!isObj(x)) return void v.push(`${at}.transitions[${j}] is not an object`);
      if (!GRIDS.includes(x["grid"] as (typeof GRIDS)[number])) v.push(`${at}.transitions[${j}].grid ${JSON.stringify(x["grid"])} is not one of ${GRIDS.join(", ")}`);
      if (!filled(x["move"])) v.push(`${at}.transitions[${j}].move is empty`);
    });
  const sl = d["shotLengthS"];
  if (!isObj(sl)) v.push(`${at}.shotLengthS is not an object`);
  else for (const k of ["verse", "chorus", "bridge"]) if (!num(sl[k]) || (sl[k] as number) <= 0) v.push(`${at}.shotLengthS.${k} must be a positive number`);
  const post = d["post"];
  if (!Array.isArray(post) || post.length === 0) v.push(`${at}.post must be a non-empty array`);
  else post.forEach((x: unknown, j: number) => { if (!filled(x)) v.push(`${at}.post[${j}] is empty`); });
  const kf = d["keyframes"];
  if (!Array.isArray(kf) || kf.length === 0 || kf.length > MAX_KEYFRAMES) v.push(`${at}.keyframes must hold 1-${MAX_KEYFRAMES} keyframes`);
  if (Array.isArray(kf))
    kf.forEach((k: unknown, j: number) => {
      const kat = `${at}.keyframes[${j}]`;
      if (!isObj(k)) return void v.push(`${kat} is not an object`);
      if (!filled(k["caption"])) v.push(`${kat}.caption is empty`);
      const s = k["t"];
      if (!num(s) || s < 0 || s >= t.track.durationS) return void v.push(`${kat}.t ${JSON.stringify(s)} is outside the track (0-${t.track.durationS} s)`);
      const home = sectionAt(t, s);
      if (k["sectionId"] !== home?.id) v.push(`${kat}.sectionId ${JSON.stringify(k["sectionId"])} is not the section at ${s} s (${home?.id ?? "none"})`);
    });
}

export function validateTreatments(raw: unknown, t: TimelineV1, pickA: string | undefined): Checked<TreatmentsV1> {
  const v: string[] = [];
  if (!isObj(raw)) return { ok: false, violations: ["treatments.json is not an object"] };
  if (raw["v"] !== 1) v.push("v must be 1");
  if (!filled(raw["direction"])) v.push("direction is empty");
  else if (pickA !== undefined && raw["direction"] !== pickA) v.push(`direction "${String(raw["direction"])}" is not the picked direction "${pickA}"`);
  const list = raw["treatments"];
  if (!Array.isArray(list)) return { ok: false, violations: [...v, "treatments must be an array"] };
  if (list.length === 0) v.push("treatments is empty");
  if (list.length > MAX_TREATMENTS) v.push(`${list.length} treatments; at most ${MAX_TREATMENTS}`);
  const seen = new Set<string>();
  list.forEach((d: unknown, i: number) => {
    const at0 = `treatments[${i}]`;
    if (!isObj(d)) return void v.push(`${at0} is not an object`);
    const id = d["id"];
    const at = typeof id === "string" && id ? `${at0} (${id})` : at0;
    if (typeof id !== "string" || !KEBAB.test(id)) v.push(`${at}.id must be kebab-case`);
    else if (seen.has(id)) v.push(`${at}.id is a duplicate`);
    else seen.add(id);
    checkTreatment(d, at, t, v);
  });
  return v.length ? { ok: false, violations: v } : { ok: true, value: raw as unknown as TreatmentsV1 };
}

export function readTreatments(dir: string, t: TimelineV1, pickA: string | undefined): TreatmentsV1 {
  const checked = validateTreatments(readJsonFile(clipPath(dir, "treatments.json"), "treatments.json"), t, pickA);
  if (!checked.ok) throw new ClipError(`treatments.json refused: ${checked.violations.join("; ")}`, "invalid");
  return checked.value;
}

interface ShotRecord {
  times: number[];
  files: string[];
  renderer: string;
  ms: number[];
  errors: string[][];
}

export interface TreatmentReport {
  id: string;
  scene: boolean;
  shot: "now" | "reused" | "none";
  frames: string[];
  renderer?: string;
  msPerFrame?: number;
  errors: string[];
}

export interface BoardTResult extends BoardResult {
  treatments: TreatmentReport[];
}

const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s[Math.floor((s.length - 1) / 2)] as number) : 0;
};

function readShot(file: string): ShotRecord | undefined {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as ShotRecord;
  } catch {
    return undefined;
  }
}

async function shoot(dir: string, t: TimelineV1, tr: Treatment): Promise<ShotRecord> {
  const framesDir = clipPath(dir, "board-t", tr.id, "frames");
  // A changed keyframe time would leave the old PNG beside the new one; the folder is ours, so it starts empty.
  fs.rmSync(framesDir, { recursive: true, force: true });
  const times = tr.keyframes.map((k) => k.t);
  let res: ShotResult;
  try {
    res = await shootKeyframes({ pageFile: clipPath(dir, "board-t", tr.id, "scene.html"), rootDir: clipRoot(dir), timeline: t, times, outDir: framesDir });
  } catch (e) {
    throw new ClipError(`${tr.id}: scene.html did not shoot: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`, "scene");
  }
  const rec: ShotRecord = { times, files: res.files.map((f) => path.relative(clipRoot(dir), f).split(path.sep).join("/")), renderer: res.renderer, ms: res.ms, errors: res.errors };
  fs.writeFileSync(path.join(framesDir, "shot.json"), `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

const now = () => new Date().toISOString();

export async function renderBoardT(dir: string, opts: { only?: string } = {}): Promise<BoardTResult> {
  const state = requireState(dir);
  if (state.picks.a === undefined) throw new ClipError(`board t needs a direction: pick <dir> a:<id> (stage ${state.stage})`, "stage");
  const t = readTimeline(dir);
  const direction = readDirections(dir).directions.find((d) => d.id === state.picks.a);
  if (!direction) throw new ClipError(`picked direction "${state.picks.a}" is no longer in directions.json; render board a and pick again`, "stage");
  const { treatments } = readTreatments(dir, t, state.picks.a);
  const ids = treatments.map((x) => x.id);
  if (opts.only !== undefined && !ids.includes(opts.only)) throw new ClipError(`--only ${opts.only}: not a treatment; valid: ${ids.join(", ")}`, "unknown-id");
  const warnings: string[] = [];
  const times = (x: Treatment) => x.keyframes.map((k) => k.t).join(",");
  if (new Set(treatments.map(times)).size > 1) warnings.push("keyframe times differ across treatments; the frames do not compare like with like");

  const hasScene = (x: Treatment) => fs.existsSync(clipPath(dir, "board-t", x.id, "scene.html"));
  const toShoot = treatments.filter((x) => hasScene(x) && (opts.only === undefined || x.id === opts.only));
  // Vendored once per folder: per-treatment builders run `--only` in parallel, and
  // four processes copying the same tree over itself is how a Windows box meets EBUSY.
  if (toShoot.length && !fs.existsSync(clipPath(dir, "vendor", "three", "build", "three.module.js"))) await vendorThree(clipRoot(dir));
  const reports: TreatmentReport[] = [];
  const cells: TreatmentCell[] = [];
  for (const tr of treatments) {
    const scene = hasScene(tr);
    let rec: ShotRecord | undefined;
    let how: TreatmentReport["shot"] = "none";
    if (toShoot.includes(tr)) {
      rec = await shoot(dir, t, tr);
      how = "now";
    } else if (scene) {
      rec = readShot(clipPath(dir, "board-t", tr.id, "frames", "shot.json"));
      if (rec && times(tr) !== rec.times.join(",")) {
        warnings.push(`${tr.id}: keyframe times changed since its frames were shot; run board t --only ${tr.id}`);
        rec = undefined;
      } else if (rec) how = "reused";
      else warnings.push(`${tr.id}: no frames yet; run board t --only ${tr.id}`);
    } else warnings.push(`${tr.id}: no board-t/${tr.id}/scene.html, text only`);
    const r = rec;
    const frames = r ? r.files.filter((f) => fs.existsSync(clipPath(dir, f))) : [];
    const errors = r ? r.errors.flatMap((list, i) => list.map((e) => `k ${r.times[i]?.toFixed(2)} s: ${e}`)) : [];
    for (const e of errors.slice(0, 5)) warnings.push(`${tr.id}: console error at ${e}`);
    if (r && /swiftshader/i.test(r.renderer)) warnings.push(`${tr.id}: renderer is ${r.renderer} - shot on the CPU, not the GPU`);
    const shot: TreatmentShot = { frames: tr.keyframes.map((_, i) => (r && frames.includes(r.files[i] ?? "") ? r.files[i] : undefined)), scene, errors: errors.length };
    if (r) {
      shot.renderer = r.renderer;
      shot.msPerFrame = median(r.ms);
    }
    cells.push({ treatment: tr, shot });
    reports.push({ id: tr.id, scene, shot: how, frames, errors, ...(r ? { renderer: r.renderer, msPerFrame: median(r.ms) } : {}) });
  }

  const html = clipPath(dir, "board-t.html");
  fs.writeFileSync(html, boardTPage(t, direction, cells));
  const sheet = clipPath(dir, "board-t-sheet.png");
  const blocked: string[] = [];
  const browser = await launch();
  try {
    const p = await offlinePage(browser, 1920, 1080, blocked);
    await p.goto(pathToFileURL(html).href, { waitUntil: "load", timeout: 60_000 });
    await settle(p, 300);
    const broken = await p.evaluate(() => Array.from(document.images).filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src") ?? ""));
    for (const b of broken) warnings.push(`frame did not load on the board: ${b}`);
    await p.screenshot({ path: sheet, fullPage: true });
  } finally {
    await browser.close();
  }
  if (blocked.length) warnings.push(`blocked ${blocked.length} network request(s): ${blocked.slice(0, 3).join(", ")}`);
  const next = state.picks.t !== undefined && !ids.includes(state.picks.t) ? resetTo(state, "board-t", now()) : advanceTo(state, "board-t", now());
  if (next !== state) writeState(dir, next);
  return { html, sheet, stage: next.stage, warnings, treatments: reports };
}
