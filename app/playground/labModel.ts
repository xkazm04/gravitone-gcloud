// THE SOUND LAB'S MODEL — pure. No React, no storage, no fetch, no clock except
// where a caller passes one; read by a Node probe
// (tests/golden-path/sound-lab.probe.spec.ts).
//
// The lab exists to close one loop the codebase had split in two. Generation
// lived here, on a bench whose renders were session-only blob URLs that
// vanished on reload; judging lived in the Library's audio module
// (app/library/audio), the only place a take persisted and earned a verdict.
// So nothing generated was ever judged, and nothing judged had been generated
// by the studio. This file is the join: every render, and every file returned
// from Suno, maps to the SAME AudioMeta the Library reads — vendor, recipe
// terms, prompt text, parent, plan, stored-song id — and goes into the same
// store (lib/assets#putUploads, via app/library/audio/useAudioShelf.ts).
//
// The recipe vocabulary is the Library's too (./book.ts: Seed, compose,
// variations). A lab take carries its seed's genre / mood / instrument terms,
// so judging it moves those terms' keep-rates, and the next recipe the lab
// suggests reads them. That is the loop.

import {
  blankSeed,
  compose,
  score,
  seedOf,
  variationsOfSeed,
  verdict,
  type Hand,
  type Seed,
  type Take,
  type TermEntry,
  type Variation,
} from "@/app/library/audio/book";
import type { AudioMeta, LabEditMode, LabOp } from "@/lib/assets";
import type {
  DetailedMusicResult,
  MusicAudio,
  WireChunk,
  WireGenerationChunk,
  WirePlan,
} from "@/lib/music/types";

import type { EngineDef, EngineId } from "./engines";

/* ── the plan, read ───────────────────────────────────────────────────── */

export function isGenChunk(c: WireChunk): c is WireGenerationChunk {
  return (c as WireGenerationChunk).text !== undefined;
}

export function chunkMs(c: WireChunk): number {
  return isGenChunk(c) ? c.duration_ms : c.range.end_ms - c.range.start_ms;
}

export const planMs = (p: WirePlan | null | undefined) => (p ? p.chunks.reduce((n, c) => n + chunkMs(c), 0) : 0);

/** Where the joints fall, as fractions of the whole — interior boundaries
 *  only, since the ends of a piece are not seams. Carried over from the bench
 *  this lab replaced (PlaygroundView.tsx#seams, 2026-09). */
export function seams(chunks: readonly WireChunk[]): number[] {
  const total = chunks.reduce((n, c) => n + chunkMs(c), 0);
  if (total <= 0) return [];
  const out: number[] = [];
  let at = 0;
  for (const c of chunks.slice(0, -1)) {
    at += chunkMs(c);
    out.push(at / total);
  }
  return out;
}

/** Each section's span as fractions of the whole: [start, end). */
export function spans(chunks: readonly WireChunk[]): [number, number][] {
  const total = chunks.reduce((n, c) => n + chunkMs(c), 0);
  if (total <= 0) return [];
  let at = 0;
  return chunks.map((c) => {
    const a = at;
    at += chunkMs(c);
    return [a / total, at / total];
  });
}

const STOP = new Set(["a", "an", "the", "to", "of", "and", "on", "with", "in", "into", "for", "at", "by"]);

/** A short name for a section, read off its own text: the vendor's plan
 *  carries a description per chunk and no title, so the first words of the
 *  description ARE its name. */
export function sectionName(c: WireChunk, i: number): string {
  if (!isGenChunk(c)) return `S${i + 1} · kept`;
  const words = c.text.replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).slice(0, 3);
  // "Release to a" is not a name; a trailing function word is dropped.
  while (words.length > 1 && STOP.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ") || `S${i + 1}`;
}

/* ── the section edit ─────────────────────────────────────────────────── */

/** The keep/condition grammar as a ramp: a link, one to three pips of hold on
 *  the original, the dice. `spoken` is the non-visual channel. Carried over
 *  verbatim from the bench this replaced (PlaygroundView.tsx#EDIT_RAMP). */
export const EDIT_RAMP: { id: LabEditMode; pips: number; spoken: string; word: string }[] = [
  { id: "keep", pips: 0, spoken: "keep — reference the original, never re-rendered", word: "keep" },
  { id: "low", pips: 1, spoken: "regenerate, conditioned lightly on the original", word: "low" },
  { id: "medium", pips: 2, spoken: "regenerate, conditioned moderately on the original", word: "med" },
  { id: "high", pips: 3, spoken: "regenerate, conditioned closely on the original", word: "high" },
  { id: "free", pips: 0, spoken: "regenerate freely, ignoring the original", word: "free" },
];

/**
 * The edit plan: kept sections become audio references at their measured
 * ranges (byte-identical, never re-rendered); regenerated ones become
 * generation chunks, optionally conditioned on the original at the chosen
 * strength. The ranges come from the SOURCE's own plan, which is the vendor's
 * ground truth for where each section sits.
 */
export function buildEditPlan(
  source: WirePlan,
  songId: string,
  modes: readonly LabEditMode[],
  texts: readonly string[],
): WirePlan {
  const gen = source.chunks.filter(isGenChunk);
  let cursor = 0;
  const chunks: WireChunk[] = [];
  gen.forEach((c, i) => {
    const start = cursor;
    const end = cursor + c.duration_ms;
    cursor = end;
    const mode = modes[i] ?? "keep";
    if (mode === "keep") {
      chunks.push({ song_id: songId, range: { start_ms: start, end_ms: end } });
    } else {
      chunks.push({
        ...c,
        text: texts[i] ?? c.text,
        ...(mode === "free"
          ? {}
          : { conditioning_ref: { song_id: songId, range: { start_ms: start, end_ms: end } }, condition_strength: mode }),
      });
    }
  });
  return { chunks };
}

/** Seconds of NEW audio an edit asks for — the kept sections are references,
 *  so the seconds a person is about to spend are only the regenerated ones. */
export function editSeconds(source: WirePlan, modes: readonly LabEditMode[]): number {
  const gen = source.chunks.filter(isGenChunk);
  return Math.round(gen.reduce((n, c, i) => n + ((modes[i] ?? "keep") === "keep" ? 0 : c.duration_ms), 0) / 1000);
}

/* ── the recipe, as each engine reads it ───────────────────────────────── */

/** The plan route's style fields, from a seed. */
export function planStyle(seed: Seed): { style: string; negativeStyle: string } {
  const bits = [...seed.genres, ...seed.moods, ...seed.instruments];
  if (seed.bpm) bits.push(`${Math.round(seed.bpm)} BPM`);
  if (seed.key) bits.push(seed.key);
  return { style: [...bits, "instrumental"].join(", "), negativeStyle: seed.avoid.join(", ") };
}

/** Suno's custom mode has three boxes, so a Suno prompt is three strings, each
 *  copied on its own. The section tags come from the plan when there is one
 *  (its sections, in order) and from the book's default arc when there is not
 *  (./book.ts#compose). */
export interface SunoFields {
  style: string;
  exclude: string;
  lyrics: string;
}

const DEFAULT_ARC = ["Intro", "Build", "Drop", "Breakdown", "Outro"];

export function sunoFields(seed: Seed, hands: Record<string, Hand>, plan?: WirePlan | null): SunoFields {
  // The style line is exactly the book's: compose() for suno, first line.
  const fromBook = compose(seed, "suno", hands).split("\n");
  const style = (fromBook[0] ?? "").replace(/^Style:\s*/, "");
  const tags = plan
    ? plan.chunks.filter(isGenChunk).map((c, i) => `[${titleCase(sectionName(c, i))}]`)
    : DEFAULT_ARC.map((t) => `[${t}]`);
  return { style, exclude: seed.avoid.join(", "), lyrics: ["[Instrumental]", ...tags].join("\n") };
}

/** One draft text for the three fields — the same `Style:` / `Exclude:` /
 *  tags shape the Library's Drafts list prints (./book.ts#compose). */
export function sunoDraftText(f: SunoFields): string {
  const lines = [`Style: ${f.style}`];
  if (f.exclude) lines.push(`Exclude: ${f.exclude}`);
  lines.push("", f.lyrics);
  return lines.join("\n");
}

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

/* ── the take a render becomes ─────────────────────────────────────────── */

export interface RenderOrigin {
  op: LabOp;
  seed: Seed;
  /** The prompt as sent, verbatim (or the plan's own text, for a plan render). */
  prompt: string;
  parent?: Take | null;
  editModes?: LabEditMode[];
  variation?: { axis: string; diff: string[] } | null;
  huntId?: string | null;
  sfx?: { category: string; loop: boolean } | null;
}

/**
 * THE MAPPING. What a render handed back, plus what the lab asked for, as the
 * AudioMeta the Library reads. `verdict` is not set here — the shelf files
 * every new take unjudged (useAudioShelf#attachReturn). `duration_s`, `peaks`
 * and `measured` are not set here either: they are MEASURED on the bytes by the
 * caller, and a field nobody measured stays absent.
 */
export function renderMeta(r: Pick<DetailedMusicResult, "songId" | "plan">, o: RenderOrigin): Partial<AudioMeta> {
  const m: Partial<AudioMeta> = {
    vendor: "elevenlabs",
    lab_op: o.op,
    prompt_text: o.prompt,
    genre_tags: o.op === "sfx" ? [] : o.seed.genres.slice(),
    mood_tags: o.op === "sfx" ? [] : o.seed.moods.slice(),
    instrumentation: o.op === "sfx" ? [] : o.seed.instruments.slice(),
    tempo_bpm: o.op === "sfx" ? undefined : (o.seed.bpm ?? undefined),
    key: o.op === "sfx" ? undefined : (o.seed.key ?? undefined),
    song_id: r.songId ?? undefined,
    plan: r.plan ?? undefined,
    parent_id: o.parent?.id,
    reference_track_id: o.parent?.reference_track_id ?? undefined,
    edit_modes: o.editModes,
    variation: o.variation ?? undefined,
    hunt_id: o.huntId ?? undefined,
    sfx_category: o.sfx?.category,
    loopable: o.sfx ? o.sfx.loop : undefined,
  };
  for (const k of Object.keys(m) as (keyof AudioMeta)[]) if (m[k] === undefined) delete m[k];
  return m;
}

const EXT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};

/** A take's title: what it is, how it was made, and its place in the lab's
 *  count — "Synthwave take 4", "Impact sfx 9". The title is the file name, so
 *  the Library shows exactly this. */
export function labTitle(seed: Seed, op: LabOp, n: number, sfxCategory?: string | null): string {
  const head =
    op === "sfx"
      ? titleCase((sfxCategory ?? "effect").replace(/-/g, " "))
      : titleCase(seed.genres[0] ?? seed.moods[0] ?? "Sketch");
  const word = op === "compose" ? "take" : op === "plan" ? "plan take" : op === "section-edit" ? "edit" : "sfx";
  return `${head} ${word} ${n}`;
}

export function fileName(title: string, mime: string): string {
  return `${title}.${EXT[mime] ?? "mp3"}`;
}

/** The returned bytes, as the Blob the shelf files. */
export function audioBytes(a: MusicAudio): Uint8Array<ArrayBuffer> {
  const bin = atob(a.b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ── the hunt: one seed, fanned out one change at a time ──────────────── */

export interface HuntLane {
  /** "control", or the variation's axis with its index — stable within a hunt. */
  id: string;
  axis: "control" | Variation["axis"];
  diff: string[];
  seed: Seed;
  why: string;
}

/** The lanes of a hunt: the seed itself as the CONTROL, then each one-change
 *  variation the book proposes for it. Without the control a hunt can only
 *  say which change won, never whether any change beat doing nothing. */
export function fanOut(seed: Seed, voc: readonly TermEntry[]): HuntLane[] {
  const vs = variationsOfSeed({ ...blankSeed(), ...seed }, voc);
  return [
    { id: "control", axis: "control", diff: [], seed, why: "unchanged" },
    ...vs.map((v, i) => ({ id: `${v.axis}-${i}`, axis: v.axis, diff: v.diff, seed: v.seed, why: v.why })),
  ];
}

/** The engines a lane can be sent to, in registry order, each with how. */
export function laneTargets(reg: readonly EngineDef[]): { id: EngineId; how: "render" | "draft" | "declared" }[] {
  return reg.map((e) => ({
    id: e.id,
    how: e.ops.includes("compose") ? "render" : e.ops.includes("prompt-copy") ? "draft" : "declared",
  }));
}

/** Seconds of audio a fan-out would buy: one render per lane for every engine
 *  that renders over an API. Drafts and declared lanes cost nothing here. */
export function fanOutSeconds(lanes: readonly HuntLane[], reg: readonly EngineDef[], lengthS: number): number {
  const renderers = laneTargets(reg).filter((t) => t.how === "render").length;
  return lanes.length * renderers * lengthS;
}

/** The lane a take answers in a hunt: the control when it carries no change,
 *  otherwise the lane whose diff matches its own. */
export function laneOf(t: Take, lanes: readonly HuntLane[]): HuntLane | undefined {
  if (!t.variation) return lanes.find((l) => l.axis === "control");
  const key = t.variation.diff.join("|");
  return lanes.find((l) => l.axis === t.variation!.axis && l.diff.join("|") === key);
}

export interface HuntView {
  id: string;
  takes: Take[];
  alive: Take[];
  out: Take[];
  /** The kept take, if the hunt has been called. Two kept is a hunt with two
   *  winners, which is allowed — the best-scoring is named. */
  winner: Take | null;
  created_at: number;
}

/** Every hunt on the shelf, newest first, read off `hunt_id`. Knocked out is a
 *  rejection; the winner is a keep — the hunt has no verdicts of its own, so
 *  the Library reads the same calls. */
export function hunts(takes: readonly Take[]): HuntView[] {
  const by = new Map<string, Take[]>();
  for (const t of takes) if (t.hunt_id) by.set(t.hunt_id, [...(by.get(t.hunt_id) ?? []), t]);
  return [...by.entries()]
    .map(([id, ts]) => {
      const kept = ts.filter((t) => verdict(t) === "kept" || verdict(t) === "proven");
      return {
        id,
        takes: ts,
        alive: ts.filter((t) => verdict(t) !== "rejected"),
        out: ts.filter((t) => verdict(t) === "rejected"),
        winner: kept.sort((a, b) => avgScore(b) - avgScore(a))[0] ?? null,
        created_at: Math.min(...ts.map((t) => t.created_at)),
      };
    })
    .sort((a, b) => b.created_at - a.created_at);
}

function avgScore(t: Take): number {
  if (!t.ratings) return 0;
  const v = Object.values(t.ratings).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
}

export const newHuntId = (now: number = Date.now()) => `hunt-${now.toString(36)}`;

/* ── effects ──────────────────────────────────────────────────────────── */

/** The trailer grammar as presets, carried over from the SFX bench
 *  (PlaygroundView.tsx#SFX_PRESETS), each now naming the Library's category so
 *  a rendered effect lands in the same column as the fixture's. */
export const SFX_PRESETS: { label: string; category: string; text: string; seconds: number; loop: boolean }[] = [
  { label: "hit", category: "impact", text: "Massive cinematic impact hit, sharp metallic attack, sub-heavy body, short controlled tail, dry", seconds: 2, loop: false },
  { label: "riser", category: "riser", text: "Tense orchestral riser, swelling from silence to a sharp cutoff, rising pitch and density throughout", seconds: 6, loop: false },
  { label: "whoosh", category: "whoosh", text: "Fast air whoosh transition, soft attack, strong stereo motion left to right, clean tail", seconds: 1.5, loop: false },
  { label: "drone", category: "ambience-loop", text: "Low ominous drone, dark evolving texture, no melody, no rhythm, steady featureless body", seconds: 20, loop: true },
  { label: "boom", category: "impact", text: "Deep sub bass drop boom, slow decay, felt more than heard, no transient click", seconds: 4, loop: false },
];

/* ── where a session starts ───────────────────────────────────────────── */

/** The recipe a lab opens on: the newest lab track's, or else the
 *  best-scoring proven track on the shelf — evidence, not a default string. */
export function startingSeed(takes: readonly Take[]): { seed: Seed; from: Take | null } {
  const lab = takes
    .filter((t) => t.kind === "track" && isLabTake(t))
    .sort((a, b) => b.created_at - a.created_at)[0];
  if (lab) return { seed: seedOf(lab), from: lab };
  const best = takes
    .filter((t) => t.kind === "track" && verdict(t) === "proven")
    .sort((a, b) => (score(b) ?? 0) - (score(a) ?? 0))[0];
  return best ? { seed: seedOf(best), from: best } : { seed: blankSeed(), from: null };
}

/* ── which takes the lab shows ────────────────────────────────────────── */

/** A take the lab made or received: rendered here, or returned against a
 *  draft. Fixture rows are neither. */
export const isLabTake = (t: Take) => t.lab_op != null || t.draft_id != null;

/** A take a section edit can start from: a stored song and the plan it was
 *  rendered from. */
export const isEditable = (t: Take) => !!t.song_id && !!t.plan && t.plan.chunks.some(isGenChunk);
