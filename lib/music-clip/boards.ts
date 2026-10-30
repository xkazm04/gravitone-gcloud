// THE TWO BOARDS: validate what the model session authored, assemble one
// standalone page, photograph it. A board is a stop: the operator reads the
// sheet PNG and quotes an id back with `pick`.
//
// Board A reads `directions.json` (DirectionsV1) and one optional fragment per
// direction, `board-a/<id>.html`. A direction with no fragment still gets a
// card (its palette as bands), so a half-written board renders instead of
// refusing; a direction that breaks the schema refuses the whole board, with
// EVERY violation listed, because a session fixing them one round-trip at a
// time is the slow way to learn there were six.
//
// Board T (treatments) lives in treatments.ts and reuses this file's browser.
//
// Board B reads `story.json` (StoryV1, below) and `board-b/hero.html`. It needs
// a treatment picked first; the story may name it (`treatment`), and when it
// does it must be the picked one - a hero built from the treatment the
// operator passed over is the slideshow this stage was added to prevent.
//
// THE HERO CONTRACT (hero.html, authored by the model session):
//   - It defines `window.render(t)`, t in SECONDS RELATIVE TO THE TRACK (not
//     to the hero loop), and draws the frame for t. A pure function of t: no
//     clock, no randomness without a seed, no requestAnimationFrame, timers or
//     network, no state carried from the previous call. The shell is the only
//     clock; the contact sheet calls render(t) cold, on a fresh page per frame,
//     out of order, and a hero whose three frames come out identical is
//     reported as a defect.
//   - It reads its data from `window.__TIMELINE__`, which the shell injects
//     before the hero's own scripts run: the timeline between hero.startS - 1 s
//     and hero.endS + 1 s (clamped to the track) as
//       { fps, sliceStartS, sliceEndS, durationS, bpmGlobal, hero:{sectionId,startS,endS},
//         beats[], onsets[], sections[], lyrics[], voice[],
//         bands:{low,mid,high,rms}, intensity[] }
//     Times in beats/onsets/sections/lyrics/voice stay TRACK-relative. The
//     per-frame arrays (bands, intensity) begin at frame round(sliceStartS*fps):
//     the value for time t is at index round(t*fps) - round(sliceStartS*fps).
//   - It lays itself out to its viewport, 16:9 (the shell gives it 1280x720).
//   The frame-purity lint (lib/foundry/strips/lint.ts) runs on hero.html with
//   the strip's own API rules (renderFrameAt, STRIP_READY, frames) swapped for
//   this contract's; its findings are reported, never silently dropped.

import fs from "node:fs";
import { pathToFileURL } from "node:url";

import { chromium, type Browser, type Page } from "playwright";

import { lintStrip } from "../foundry/strips/lint";
import { boardAPage, boardBPage, injectTimeline, sheetBPage, type StoryCell } from "./boardShell";
import { clipPath, readJsonFile, readTimeline, requireState, writeState } from "./folder";
import { advanceTo, atLeast, ClipError, resetTo } from "./state";
import { MAX_DIRECTIONS, type DirectionsV1, type StateV1, type TimelineV1 } from "./types";

export interface StorySection {
  id: string;
  title: string;
  beat: string;
  visual: string;
  cutsPerBar: number;
}

export interface StoryV1 {
  v: 1;
  /** The picked direction's id; `pick b:<id>` approves this story by it. */
  direction: string;
  /** The picked treatment's id (state picks.t), when the story names it. */
  treatment?: string;
  sections: StorySection[];
  hero: { sectionId: string; startS: number; endS: number };
}

export const HERO_MIN_S = 4;
export const HERO_MAX_S = 8;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

export type Checked<T> = { ok: true; value: T } | { ok: false; violations: string[] };

export function validateDirections(raw: unknown): Checked<DirectionsV1> {
  const v: string[] = [];
  if (!isObj(raw)) return { ok: false, violations: ["directions.json is not an object"] };
  if (raw["v"] !== 1) v.push("v must be 1");
  const list = raw["directions"];
  if (!Array.isArray(list)) return { ok: false, violations: [...v, "directions must be an array"] };
  if (list.length === 0) v.push("directions is empty");
  if (list.length > MAX_DIRECTIONS) v.push(`${list.length} directions; at most ${MAX_DIRECTIONS}`);
  const seen = new Set<string>();
  list.forEach((d: unknown, i: number) => {
    const at = `directions[${i}]`;
    if (!isObj(d)) return void v.push(`${at} is not an object`);
    const id = d["id"];
    const name = typeof id === "string" && id ? `${at} (${id})` : at;
    if (typeof id !== "string" || !KEBAB.test(id)) v.push(`${name}.id must be kebab-case`);
    else if (seen.has(id)) v.push(`${name}.id is a duplicate`);
    else seen.add(id);
    for (const k of ["name", "animation", "type", "story", "risk"]) if (!filled(d[k])) v.push(`${name}.${k} is empty`);
    const pal = d["palette"];
    if (!Array.isArray(pal) || pal.length === 0) v.push(`${name}.palette must be a non-empty array`);
    else pal.forEach((c: unknown, j: number) => { if (typeof c !== "string" || !HEX.test(c)) v.push(`${name}.palette[${j}] ${JSON.stringify(c)} is not #rrggbb`); });
    const tr = d["transitions"];
    if (!Array.isArray(tr) || tr.length === 0) v.push(`${name}.transitions must be a non-empty array`);
    else tr.forEach((x: unknown, j: number) => { if (!filled(x)) v.push(`${name}.transitions[${j}] is empty`); });
  });
  return v.length ? { ok: false, violations: v } : { ok: true, value: raw as unknown as DirectionsV1 };
}

export function validateStory(raw: unknown, t: TimelineV1, pickA: string | undefined, pickT?: string): Checked<StoryV1> {
  const v: string[] = [];
  if (!isObj(raw)) return { ok: false, violations: ["story.json is not an object"] };
  if (raw["v"] !== 1) v.push("v must be 1");
  if (!filled(raw["direction"])) v.push("direction is empty");
  else if (pickA !== undefined && raw["direction"] !== pickA) v.push(`direction "${String(raw["direction"])}" is not the picked direction "${pickA}"`);
  const tr = raw["treatment"];
  if (tr !== undefined) {
    if (!filled(tr)) v.push("treatment is empty");
    else if (pickT !== undefined && tr !== pickT) v.push(`treatment "${String(tr)}" is not the picked treatment "${pickT}"`);
  }
  const ids = new Set(t.sections.map((s) => s.id));
  const secs = raw["sections"];
  if (!Array.isArray(secs) || secs.length === 0) v.push("sections must be a non-empty array");
  else
    secs.forEach((s: unknown, i: number) => {
      const at = `sections[${i}]`;
      if (!isObj(s)) return void v.push(`${at} is not an object`);
      if (typeof s["id"] !== "string" || !ids.has(s["id"])) v.push(`${at}.id ${JSON.stringify(s["id"])} is not a timeline section (${[...ids].join(", ")})`);
      for (const k of ["title", "beat", "visual"]) if (!filled(s[k])) v.push(`${at}.${k} is empty`);
      const c = s["cutsPerBar"];
      if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) v.push(`${at}.cutsPerBar must be a positive number`);
    });
  const h = raw["hero"];
  if (!isObj(h)) v.push("hero is not an object");
  else {
    if (typeof h["sectionId"] !== "string" || !ids.has(h["sectionId"])) v.push(`hero.sectionId ${JSON.stringify(h["sectionId"])} is not a timeline section`);
    const a = h["startS"];
    const b = h["endS"];
    if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) v.push("hero.startS and hero.endS must be numbers");
    else {
      if (a < 0 || b > t.track.durationS) v.push(`hero ${a}-${b} s is outside the track (0-${t.track.durationS} s)`);
      const len = b - a;
      if (len < HERO_MIN_S || len > HERO_MAX_S) v.push(`hero is ${len.toFixed(2)} s; must be ${HERO_MIN_S}-${HERO_MAX_S} s`);
    }
  }
  return v.length ? { ok: false, violations: v } : { ok: true, value: raw as unknown as StoryV1 };
}

/** The hero's window onto the timeline, +-1 s, as documented in the header. */
export function heroSlice(t: TimelineV1, hero: StoryV1["hero"]) {
  const sliceStartS = Math.max(0, hero.startS - 1);
  const sliceEndS = Math.min(t.track.durationS, hero.endS + 1);
  const a = Math.round(sliceStartS * t.fps);
  const b = Math.round(sliceEndS * t.fps) + 1;
  const inside = (x: number) => x >= sliceStartS && x <= sliceEndS;
  const overlaps = (s: { startS: number; endS: number }) => s.endS >= sliceStartS && s.startS <= sliceEndS;
  return {
    fps: t.fps,
    sliceStartS,
    sliceEndS,
    durationS: t.track.durationS,
    bpmGlobal: t.tempo.bpmGlobal,
    hero,
    beats: t.beats.filter((x) => inside(x.t)),
    onsets: t.onsets.filter(inside),
    sections: t.sections.filter(overlaps),
    lyrics: t.lyrics.filter(overlaps),
    voice: t.voice.filter(overlaps),
    bands: { low: t.bands.low.slice(a, b), mid: t.bands.mid.slice(a, b), high: t.bands.high.slice(a, b), rms: t.bands.rms.slice(a, b) },
    intensity: t.intensity.slice(a, b),
  };
}

/** The strip lint's purity rules, with its API rules replaced by the hero contract's. */
export function lintHero(html: string): string[] {
  const purity = lintStrip(html).filter((f) => !f.rule.startsWith("api:") && !f.rule.startsWith("frames:"));
  const out = purity.map((f) => (f.excerpt ? `${f.rule} - ${f.excerpt}` : f.rule));
  if (!/window\.render\s*=|function\s+render\s*\(/.test(html)) out.push("api: window.render is not defined");
  if (!/__TIMELINE__/.test(html)) out.push("api: window.__TIMELINE__ is never read");
  return out;
}

// ---- the browser

export async function launch(): Promise<Browser> {
  try {
    // The strip renderer's flags (pipeline/strips/render.mts): no GPU raster, so a sheet is the same pixels twice.
    return await chromium.launch({ headless: true, args: ["--disable-partial-raster", "--disable-gpu", "--disable-lcd-text"] });
  } catch (e) {
    throw new ClipError(`headless Chromium failed to launch: ${e instanceof Error ? e.message : String(e)}; run "npx playwright install chromium"`, "playwright");
  }
}

/** A page that can reach only file:, data:, blob: and about: - the board's own promise, enforced. */
export async function offlinePage(browser: Browser, width: number, height: number, blocked: string[]): Promise<Page> {
  const p = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await p.route("**/*", (route) => {
    const u = route.request().url();
    if (/^(file|data|blob|about):/i.test(u)) return route.continue();
    blocked.push(u);
    return route.abort();
  });
  return p;
}

export const settle = (p: Page, ms: number) => p.evaluate((n) => new Promise<void>((r) => setTimeout(r, n)), ms);

export interface BoardResult {
  html: string;
  sheet: string;
  stage: StateV1["stage"];
  warnings: string[];
  lint?: string[];
  framesDiffer?: boolean;
}

const now = () => new Date().toISOString();

export function readDirections(dir: string): DirectionsV1 {
  const checked = validateDirections(readJsonFile(clipPath(dir, "directions.json"), "directions.json"));
  if (!checked.ok) throw new ClipError(`directions.json refused: ${checked.violations.join("; ")}`, "invalid");
  return checked.value;
}

export function readStory(dir: string, t: TimelineV1, pickA: string | undefined, pickT?: string): StoryV1 {
  const checked = validateStory(readJsonFile(clipPath(dir, "story.json"), "story.json"), t, pickA, pickT);
  if (!checked.ok) throw new ClipError(`story.json refused: ${checked.violations.join("; ")}`, "invalid");
  return checked.value;
}

export async function renderBoardA(dir: string): Promise<BoardResult> {
  const state = requireState(dir);
  const t = readTimeline(dir);
  const { directions } = readDirections(dir);
  const fragments = new Map<string, string>();
  const warnings: string[] = [];
  for (const d of directions) {
    const f = clipPath(dir, "board-a", `${d.id}.html`);
    if (fs.existsSync(f)) fragments.set(d.id, fs.readFileSync(f, "utf8"));
    else warnings.push(`${d.id}: no board-a/${d.id}.html, palette card drawn`);
  }
  const html = clipPath(dir, "board-a.html");
  fs.writeFileSync(html, boardAPage(t, directions, fragments));
  const sheet = clipPath(dir, "board-a-sheet.png");
  const blocked: string[] = [];
  const browser = await launch();
  try {
    const p = await offlinePage(browser, 1920, 1080, blocked);
    await p.goto(pathToFileURL(html).href, { waitUntil: "load", timeout: 30_000 });
    await settle(p, 800);
    await p.screenshot({ path: sheet, fullPage: true });
  } finally {
    await browser.close();
  }
  if (blocked.length) warnings.push(`blocked ${blocked.length} network request(s): ${blocked.slice(0, 3).join(", ")}`);
  const ids = directions.map((d) => d.id);
  const next = state.picks.a !== undefined && !ids.includes(state.picks.a) ? resetTo(state, "board-a", now()) : advanceTo(state, "board-a", now());
  if (next !== state) writeState(dir, next);
  return { html, sheet, stage: next.stage, warnings };
}

export async function renderBoardB(dir: string): Promise<BoardResult> {
  const state = requireState(dir);
  if (state.picks.a === undefined) throw new ClipError(`board b needs a direction: pick <dir> a:<id> (stage ${state.stage})`, "stage");
  if (state.picks.t === undefined || !atLeast(state, "picked-t")) throw new ClipError(`board b needs a treatment: board t <dir>, then pick <dir> t:<id> (stage ${state.stage})`, "stage");
  const t = readTimeline(dir);
  const direction = readDirections(dir).directions.find((d) => d.id === state.picks.a);
  if (!direction) throw new ClipError(`picked direction "${state.picks.a}" is no longer in directions.json; render board a and pick again`, "stage");
  const story = readStory(dir, t, state.picks.a, state.picks.t);
  const heroPath = clipPath(dir, "board-b", "hero.html");
  if (!fs.existsSync(heroPath)) throw new ClipError(`hero page is missing: ${heroPath}`, "missing");
  const heroHtml = fs.readFileSync(heroPath, "utf8");
  const lint = lintHero(heroHtml);
  const warnings = lint.map((l) => `hero lint: ${l}`);
  const heroDoc = injectTimeline(heroHtml, heroSlice(t, story.hero));
  const cells: StoryCell[] = story.sections.map((s) => {
    const ts = t.sections.find((x) => x.id === s.id);
    return { ...s, label: ts?.label ?? "verse", intensity: ts?.intensity ?? 0, startS: ts?.startS ?? 0, endS: ts?.endS ?? 0, hero: s.id === story.hero.sectionId };
  });
  const html = clipPath(dir, "board-b.html");
  fs.writeFileSync(html, boardBPage(t, direction, heroDoc, story.hero, cells));

  const { startS, endS } = story.hero;
  const last = endS - 1 / t.fps;
  // Out of order and cold: mid first, then end, then start, each on a fresh page.
  const times = [(startS + endS) / 2, last, startS];
  const blocked: string[] = [];
  const browser = await launch();
  const shots = new Map<number, Buffer>();
  let board: Buffer;
  try {
    for (const at of times) {
      const p = await offlinePage(browser, 1920, 1080, blocked);
      await p.goto(`${pathToFileURL(html).href}#t=${at.toFixed(4)}`, { waitUntil: "load", timeout: 30_000 });
      await p.waitForFunction(() => (window as unknown as { __HERO_READY__?: boolean }).__HERO_READY__ === true, undefined, { timeout: 15_000 }).catch(() => undefined);
      const probe = await p.evaluate(() => {
        const w = window as unknown as { __HERO_RENDER__?: boolean; __HERO_ERROR__?: string };
        return { rendered: w.__HERO_RENDER__ === true, error: w.__HERO_ERROR__ };
      });
      if (!probe.rendered) warnings.push(`t ${at.toFixed(2)} s: window.render was not callable`);
      if (probe.error) warnings.push(`t ${at.toFixed(2)} s: render threw: ${probe.error}`);
      await settle(p, 150);
      shots.set(at, await p.locator("#hero").screenshot());
      await p.close();
    }
    const p = await offlinePage(browser, 1920, 1080, blocked);
    await p.goto(`${pathToFileURL(html).href}#t=${((startS + endS) / 2).toFixed(4)}`, { waitUntil: "load", timeout: 30_000 });
    await settle(p, 300);
    board = await p.screenshot({ fullPage: true });
    await p.close();
    const ordered = [startS, (startS + endS) / 2, last].map((x) => ({ t: x, png: (shots.get(x) as Buffer).toString("base64") }));
    const distinct = new Set(ordered.map((f) => f.png)).size;
    const differ = distinct === ordered.length;
    if (!differ) warnings.push(`hero frames: ${ordered.length - distinct + 1} of ${ordered.length} identical; render(t) does not move with t`);
    const sheetHtml = clipPath(dir, "board-b-sheet.html");
    fs.writeFileSync(sheetHtml, sheetBPage(`${direction.name} - B sheet`, ordered, differ, board.toString("base64")));
    const sp = await offlinePage(browser, 1920, 1080, blocked);
    await sp.goto(pathToFileURL(sheetHtml).href, { waitUntil: "load", timeout: 30_000 });
    const sheet = clipPath(dir, "board-b-sheet.png");
    await sp.screenshot({ path: sheet, fullPage: true });
    fs.rmSync(sheetHtml, { force: true });
    if (blocked.length) warnings.push(`blocked ${blocked.length} network request(s): ${blocked.slice(0, 3).join(", ")}`);
    const next = state.picks.b !== undefined && state.picks.b !== story.direction ? resetTo(state, "board-b", now()) : advanceTo(state, "board-b", now());
    if (next !== state) writeState(dir, next);
    return { html, sheet, stage: next.stage, warnings, lint, framesDiffer: differ };
  } finally {
    await browser.close();
  }
}

