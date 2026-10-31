// THE FOLDER CONTRACT of /music-clip. In: one *.mp3 (or --audio), a lyrics file
// and a style prompt, side by side, as Suno hands them over. Out: everything
// under `<dir>/music-clip/`, and nowhere else - `clipPath` refuses any name that
// would resolve outside it, so a direction id or a stack name read from a JSON
// file can never become a write into the operator's album folder.
//
// The `analyze` verb lives here too (`runAnalyze`), because it is the one verb
// whose input IS the folder: it reads the three files, refuses without an
// explicit spend decision, and writes the timeline and the first state. The
// analyser is a parameter so a test hands in a stand-in and nothing reaches the
// network; the CLI hands in `analyzeTrack`.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AnalyzeInput, StateV1, TimelineV1 } from "./types";
import { ClipError, parseState, stageAfterAnalyze } from "./state";

export { ClipError };

export const CLIP_DIR = "music-clip";
export const LYRICS_NAMES = ["lyrics.txt", "lyrics.md"] as const;
export const STYLE_NAMES = ["style.txt", "style.md", "prompt.md", "prompt.txt"] as const;

export const clipRoot = (dir: string) => path.join(path.resolve(dir), CLIP_DIR);

/** A path under `<dir>/music-clip/`; a name that escapes it is refused, not resolved. */
export function clipPath(dir: string, ...parts: string[]): string {
  const root = clipRoot(dir);
  const p = path.resolve(root, ...parts);
  const rel = path.relative(root, p);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new ClipError(`refusing to write outside ${root}: ${parts.join("/")}`, "outside");
  return p;
}

export function ensureDir(p: string): string {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/** Keys sorted at every depth, so the same value always writes the same bytes. */
export function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => [k, sort(o[k])]));
    }
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

export function writeClipJson(dir: string, name: string, value: unknown): string {
  const p = clipPath(dir, name);
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, stableJson(value));
  return p;
}

export function readJsonFile(p: string, what: string): unknown {
  if (!fs.existsSync(p)) throw new ClipError(`${what} is missing: ${p}`, "missing");
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    throw new ClipError(`${what} is not valid JSON (${p}): ${e instanceof Error ? e.message : String(e)}`, "invalid");
  }
}

export const sha1Of = (buf: Buffer | string) => createHash("sha1").update(buf).digest("hex");
export const sha1File = (p: string) => sha1Of(fs.readFileSync(p));

export interface ClipFolder {
  dir: string;
  audioPath: string;
  lyricsPath: string;
  lyricsText: string;
  stylePath: string;
  styleText: string;
}

/** Reads the folder, naming EVERY missing input in one refusal rather than the first. */
export function readFolder(dir: string, audio?: string): ClipFolder {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new ClipError(`not a folder: ${root}`, "missing");
  const names = fs.readdirSync(root);
  const problems: string[] = [];
  let audioPath: string | undefined;
  if (audio) {
    audioPath = path.resolve(root, audio);
    if (!fs.existsSync(audioPath)) problems.push(`--audio ${audioPath} does not exist`);
  } else {
    const mp3s = names.filter((n) => n.toLowerCase().endsWith(".mp3")).sort();
    if (mp3s.length === 0) problems.push("no *.mp3 (or pass --audio <file>)");
    else if (mp3s.length > 1) problems.push(`${mp3s.length} mp3 files (${mp3s.join(", ")}); pass --audio <file>`);
    else audioPath = path.join(root, mp3s[0] as string);
  }
  const find = (choices: readonly string[]) => choices.find((c) => names.some((n) => n.toLowerCase() === c));
  const lyricsName = find(LYRICS_NAMES);
  const styleName = find(STYLE_NAMES);
  if (!lyricsName) problems.push(`no lyrics file (${LYRICS_NAMES.join(" | ")})`);
  if (!styleName) problems.push(`no style prompt (${STYLE_NAMES.join(" | ")})`);
  if (problems.length || !audioPath || !lyricsName || !styleName) throw new ClipError(`${root}: ${problems.join("; ")}`, "missing");
  const actual = (want: string) => names.find((n) => n.toLowerCase() === want) as string;
  const lyricsPath = path.join(root, actual(lyricsName));
  const stylePath = path.join(root, actual(styleName));
  return {
    dir: root,
    audioPath,
    lyricsPath,
    lyricsText: fs.readFileSync(lyricsPath, "utf8"),
    stylePath,
    styleText: fs.readFileSync(stylePath, "utf8"),
  };
}

export const analyzeInput = (f: ClipFolder, dry: boolean): AnalyzeInput => ({ audioPath: f.audioPath, lyricsText: f.lyricsText, styleText: f.styleText, dry });

export function readTimeline(dir: string): TimelineV1 {
  const t = readJsonFile(clipPath(dir, "timeline.json"), "timeline.json (run analyze first)") as TimelineV1;
  if (!t || t.v !== 1 || !t.track || !Array.isArray(t.sections)) throw new ClipError(`timeline.json is not a TimelineV1: ${clipPath(dir, "timeline.json")}`, "invalid");
  return t;
}

export function readState(dir: string): StateV1 | undefined {
  const p = clipPath(dir, "state.json");
  if (!fs.existsSync(p)) return undefined;
  const parsed = parseState(readJsonFile(p, "state.json"));
  if (typeof parsed === "string") throw new ClipError(`state.json: ${parsed} (${p})`, "invalid");
  return parsed;
}

/** The state, or the refusal that names the verb to run first. */
export function requireState(dir: string): StateV1 {
  const s = readState(dir);
  if (!s) throw new ClipError(`no state in ${clipRoot(dir)}; run analyze first`, "missing");
  return s;
}

export const writeState = (dir: string, s: StateV1) => writeClipJson(dir, "state.json", s);

export type Analyser = (input: AnalyzeInput) => Promise<TimelineV1>;

export interface AnalyzeFlags {
  yes?: boolean;
  dry?: boolean;
  audio?: string;
}

export type AnalyzeOutcome =
  | { status: "refused"; plan: string[] }
  | { status: "ok"; dry: boolean; timeline: string; state: StateV1; reset: boolean; warnings: string[] };

/**
 * NO SPEND WITHOUT A DECISION. With neither --yes nor --dry the verb reads the
 * folder (so a missing file is still named) and returns the plan; the analyser
 * is never called. --dry is the analyser's own dry mode: no vendor call.
 */
export async function runAnalyze(dir: string, flags: AnalyzeFlags, analyser: Analyser, now = () => new Date().toISOString()): Promise<AnalyzeOutcome> {
  if (flags.yes && flags.dry) throw new ClipError("give --yes or --dry, not both", "usage");
  const folder = readFolder(dir, flags.audio);
  if (!flags.yes && !flags.dry) {
    const mb = (fs.statSync(folder.audioPath).size / 1e6).toFixed(1);
    return {
      status: "refused",
      plan: [
        `audio  ${folder.audioPath} (${mb} MB)`,
        `lyrics ${folder.lyricsPath}`,
        `style  ${folder.stylePath}`,
        "live: local beat/section analysis + one Gemini call for lyric line times",
        "dry:  local analysis only; lyric times section-only",
        "pass --yes to spend one Gemini call, --dry for none",
      ],
    };
  }
  const dry = !flags.yes;
  const timeline = await analyser(analyzeInput(folder, dry));
  const timelinePath = writeClipJson(dir, "timeline.json", timeline);
  const { state, reset } = stageAfterAnalyze(readState(dir), timeline.track.sha1, now());
  writeState(dir, state);
  return { status: "ok", dry, timeline: timelinePath, state, reset, warnings: timeline.warnings };
}
