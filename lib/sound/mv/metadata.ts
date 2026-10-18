// THE METADATA TURN — the clean title, the analysis and the treatment's
// rationale in; a YouTube title, description and tags out. Server-only: one
// lib/text turn ("mv-metadata"), prompt pipeline/MV-METADATA-PROMPT.md.
//
// WHAT CODE DRAWS, NOT THE MODEL: the chapter lines. They are timestamps, and
// a timestamp a viewer can click is checkable - so they come from the section
// pass (MvAnalysis.sections) and are appended here, never written by the turn
// (law checkability-routes-the-pixel, applied to words). YouTube only turns
// them into chapters when there are at least three, the first at 0:00 and each
// at least ten seconds long; fewer is no chapter list at all rather than a
// list YouTube ignores.
//
// HELD TO lib/publish/youtube.ts snippetProblem - the same validator Send to
// Calendar (lib/producers/mvActs.ts; v1's was lib/publish/schedule.ts
// parseScheduleInput, gone at L75) and the uploader apply, so a proposal that passes here cannot be refused at 3 a.m. by the
// slot it was sent to. A model's answer that overruns is TRIMMED by code
// first (the title at a word, the description body before the chapters, tags
// from the end); one that still fails - an empty title is the case trimming
// cannot fix - fails the job with the validator's own sentence.
//
// AN OPERATOR'S EDIT IS NOT TRIMMED. `parseMetadataPatch` refuses with the
// same sentence instead: cutting somebody's own words silently would be worse
// than telling them which limit they hit.

import { reason as routerReason } from "@/lib/text/router";
import type { TurnClass } from "@/lib/text/types";
import { snippetProblem } from "@/lib/publish/youtube";

import { SoundError } from "../store";
import { analysisText, clock, fill, promptSections, type ReasonFn, type TreatmentInput } from "./treatment";
import type { MvAnalysis, MvChapter, MvMetadata, MvPatchRequest } from "./types";

export const METADATA_TURN: TurnClass = "mv-metadata";
export const METADATA_PROMPT_FILE = "MV-METADATA-PROMPT.md";

/** What the video shows when no look says otherwise: the studio's own visualizer. */
export const DEFAULT_PICTURE = "one generated still image with drifting particles and edge light pulsing on the beat";

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX_BYTES = 5000;
export const TAGS_MAX_CHARS = 500;
export const TAG_COUNT_MAX = 15;
const TAG_MAX = 40;

/** YouTube's chapter rules (see the header). */
export const CHAPTERS_MIN = 3;
export const CHAPTER_MIN_S = 10;

export const METADATA_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["title", "description", "tags"],
  properties: { title: { type: "string" }, description: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
};

/* ── chapters ─────────────────────────────────────────────────────────────── */

/** The section pass as YouTube chapters, or [] when it does not give three
 *  that YouTube would accept. A section shorter than ten seconds is folded
 *  into the one before it (its boundary dropped), and the first chapter is
 *  moved to 0:00 - a section pass that starts at 0.4 s is still the intro. */
export function chaptersOf(a: Pick<MvAnalysis, "durationS" | "sections">): MvChapter[] {
  const sorted = [...a.sections]
    .filter((s) => Number.isFinite(s.startS) && s.startS >= 0 && s.startS < a.durationS && typeof s.label === "string" && s.label.trim())
    .sort((x, y) => x.startS - y.startS)
    .map((s) => ({ startS: Math.floor(s.startS), label: s.label.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) }));
  if (!sorted.length) return [];
  sorted[0] = { ...sorted[0], startS: 0 };
  const out: MvChapter[] = [];
  for (const s of sorted) {
    const prev = out.at(-1);
    if (prev && s.startS - prev.startS < CHAPTER_MIN_S) continue;
    out.push(s);
  }
  // The last chapter runs to the end of the track and has to be long enough too.
  while (out.length > 1 && a.durationS - out.at(-1)!.startS < CHAPTER_MIN_S) out.pop();
  return out.length >= CHAPTERS_MIN ? out : [];
}

export const chapterLines = (chapters: readonly MvChapter[]): string => chapters.map((c) => `${clock(c.startS)} ${c.label}`).join("\n");

/* ── fitting an answer to the platform's limits ───────────────────────────── */

const noAngles = (s: string) => s.replace(/[<>]/g, "");
const oneLine = (s: string) => noAngles(s).replace(/\s+/g, " ").trim();

function cutChars(s: string, max: number): string {
  const cps = [...s];
  if (cps.length <= max) return s;
  const head = cps.slice(0, max).join("");
  const at = head.lastIndexOf(" ");
  return (at > max * 0.6 ? head.slice(0, at) : head).replace(/[\s,;:\-|·]+$/, "");
}

function cutBytes(s: string, max: number): string {
  if (Buffer.byteLength(s, "utf8") <= max) return s;
  let out = "";
  for (const ch of s) {
    if (Buffer.byteLength(out + ch, "utf8") > max) break;
    out += ch;
  }
  const at = Math.max(out.lastIndexOf("\n"), out.lastIndexOf(" "));
  return (at > out.length * 0.6 ? out.slice(0, at) : out).trimEnd();
}

const tagCost = (tags: readonly string[]) => tags.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0) + Math.max(0, tags.length - 1);

/** Tags as YouTube counts them: no commas or angle brackets inside one, no
 *  duplicates (case-blind), at most TAG_COUNT_MAX, and dropped from the END
 *  (the model is asked to list them most specific first) until they fit. */
export function fitTags(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.filter((t): t is string => typeof t === "string") : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of list) {
    const tag = oneLine(t.replace(/[,#]/g, " ")).slice(0, TAG_MAX).trim();
    const k = tag.toLowerCase();
    if (!tag || seen.has(k)) continue;
    seen.add(k);
    out.push(tag);
    if (out.length >= TAG_COUNT_MAX) break;
  }
  while (out.length && tagCost(out) > TAGS_MAX_CHARS) out.pop();
  return out;
}

/** The title with the track's own title FIRST - an honest title names what is
 *  playing before it says anything else - within 100 characters. */
export function fitTitle(raw: unknown, trackTitle: string): string {
  let t = typeof raw === "string" ? oneLine(raw) : "";
  const track = oneLine(trackTitle);
  if (track && !t.toLowerCase().startsWith(track.toLowerCase())) t = t ? `${track} · ${t}` : track;
  return cutChars(t, TITLE_MAX);
}

/** The model's description with the chapter lines appended, the body cut to
 *  leave the chapters whole. */
export function fitDescription(raw: unknown, chapters: readonly MvChapter[]): string {
  const body = typeof raw === "string" ? noAngles(raw).replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  const lines = chapterLines(chapters);
  if (!lines) return cutBytes(body, DESCRIPTION_MAX_BYTES);
  const tail = `\n\n${lines}`;
  const room = DESCRIPTION_MAX_BYTES - Buffer.byteLength(tail, "utf8");
  return `${cutBytes(body, Math.max(0, room))}${tail}`.trim();
}

/** The whole answer, fitted and validated. Throws the validator's sentence. */
export function fitMetadata(json: unknown, trackTitle: string, analysis: Pick<MvAnalysis, "durationS" | "sections">): MvMetadata {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const chapters = chaptersOf(analysis);
  const meta: MvMetadata = { title: fitTitle(o.title, trackTitle), description: fitDescription(o.description, chapters), tags: fitTags(o.tags), chapters };
  const problem = snippetProblem(meta);
  if (problem) throw new SoundError(problem, 502);
  return meta;
}

/* ── the turn ─────────────────────────────────────────────────────────────── */

/** Pure over its inputs, so a probe reads what would be sent. */
export function metadataPrompt(sections: Record<string, string>, input: TreatmentInput, rationale: string | undefined, note: string | undefined, picture?: string): string {
  return fill(sections.metadata, {
    PICTURE: picture?.trim() || DEFAULT_PICTURE,
    TITLE: input.title,
    ANALYSIS: analysisText(input.analysis),
    RATIONALE: rationale?.trim() || "(none)",
    NOTE: note?.trim() || "(none)",
    TAG_COUNT_MAX: String(TAG_COUNT_MAX),
  });
}

export async function writeMetadata(input: TreatmentInput, opts: { rationale?: string; note?: string; picture?: string; reason?: ReasonFn } = {}): Promise<MvMetadata> {
  const sections = await promptSections(METADATA_PROMPT_FILE, ["metadata"]);
  const out = await (opts.reason ?? routerReason)({ turn: METADATA_TURN, prompt: metadataPrompt(sections, input, opts.rationale, opts.note, opts.picture), schema: METADATA_SCHEMA });
  return fitMetadata(out.json, input.title, input.analysis);
}

/* ── the operator's edit ──────────────────────────────────────────────────── */

/** Merge a PATCH's metadata into the job's, validated and NOT trimmed. */
export function applyMetadataPatch(current: MvMetadata, patch: unknown): MvMetadata {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new SoundError('"metadata" must be an object with "title", "description" and/or "tags"', 400);
  const p = patch as Record<string, unknown> & NonNullable<MvPatchRequest["metadata"]>;
  const next: MvMetadata = { ...current, tags: [...current.tags], chapters: [...current.chapters] };
  if ("title" in p) {
    if (typeof p.title !== "string") throw new SoundError('"metadata.title" must be a string', 400);
    next.title = p.title.trim();
  }
  if ("description" in p) {
    if (typeof p.description !== "string") throw new SoundError('"metadata.description" must be a string', 400);
    next.description = p.description.replace(/\r\n/g, "\n").trim();
  }
  if ("tags" in p) {
    if (!Array.isArray(p.tags) || p.tags.some((t) => typeof t !== "string")) throw new SoundError('"metadata.tags" must be an array of strings', 400);
    next.tags = p.tags.map((t) => t.trim()).filter(Boolean);
  }
  if (!("title" in p) && !("description" in p) && !("tags" in p)) throw new SoundError('name a change: "metadata.title", "metadata.description" and/or "metadata.tags"', 400);
  const problem = snippetProblem(next);
  if (problem) throw new SoundError(problem, 400);
  return next;
}
