// THE SCENE ENGINE - what the scout-scene producer (lib/producers/scoutScene.ts) knows about a
// found shot, with no kernel in it: the readback prompt and the frame it is handed, the door a
// model's answer passes to become a SceneRecipe, the replica request, the clip-source guard, and
// the dry stand-ins. Pure apart from reading the prompt file and one committed picture.
//
// A SOURCE SEEDS WORDS, NEVER PIXELS (visual-style-locking / style-onboarding-from-sample). The
// keyframes are read back into a recipe; the replica stills are drawn from the recipe's words with
// no reference image attached; a clip animates one of OUR replicas. `clipSourceOf` is the one
// place a path becomes a clip's image, and it refuses anything that is not this candidate's own
// replica - a source keyframe can never reach a video vendor, whatever night.json says.
//
// ONE KEYFRAME PER RECOGNIZE CALL, IN TIME ORDER. The recognizer takes one image (RecognizeRequest
// `image`), and composing a contact sheet would need an image codec this repo does not carry (no
// ffmpeg on the scout box, no image library in package.json). So the shot is read as a chain: call
// k sees keyframe k and, as words, what keyframes 1..k-1 read as, and answers for the shot so far;
// the last answer is the recipe. Motion is the field this is weakest on - stills sampled from a
// shot are not motion evidence (the technique's own caveat) - so the prompt asks only for change
// the frames show, and says to write what holds still otherwise.

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { studioShaped } from "../../imaging/studio/still";
import type { GenerateRequest } from "../../imaging/types";
import { replicaGenerator, type ReplicaGenerator } from "./stillEngine";
import { SHOT_SIZES, type Night, type SceneCandidate, type SceneRecipe, type ScoutSource } from "./types";

/* ── Limits ──────────────────────────────────────────────────────────────── */

/** Keyframes read per scene: three to five tell a shot; more only re-say it at a cent each. */
export const MAX_READ_FRAMES = 5;
/** Replica stills per scene (the brief: one or two). */
export const SCENE_REPLICAS = 2;
export const PALETTE_JOBS = ["ground", "figure", "accent", "shadow", "highlight", "light", "atmosphere"] as const;
export const REPLICA_NEGATIVE = "text, watermark, logo, caption, signage, lettering";

export const PROMPT_FILE = "SCOUT-SCENE-PROMPT.md";

/** The prompt as sent: pipeline/SCOUT-SCENE-PROMPT.md with its HTML comments stripped. */
export async function scenePrompt(root: string = process.cwd()): Promise<string> {
  const file = path.join(root, "pipeline", PROMPT_FILE);
  const text = await readFile(file, "utf8").catch(() => {
    throw new Error(`The scene prompt could not be read from ${file}.`);
  });
  return stripComments(text);
}

export const stripComments = (doc: string): string => doc.replace(/<!--[\s\S]*?-->/g, "").replace(/\n{3,}/g, "\n\n").trim();

/* ── The answer's shape ──────────────────────────────────────────────────── */

const prose = (description: string) => ({ type: "string", description });

/** What the recognizer must answer (Gemini's responseSchema dialect, as extract's READBACK_SCHEMA). */
export const SCENE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    shot: { type: "string", enum: [...SHOT_SIZES], description: "The shot size." },
    camera: prose("Height, angle, placement in frame, and the lens by its effect. Craft words only, lower case."),
    motion: prose("What moves and how, by subject, ground, dressing and camera; only change the keyframes show."),
    composition: prose("How the frame is built: weight, lines, depth, negative space."),
    lighting: prose("The key light's source, quality and temperature in words, and what stays dark."),
    palette: {
      type: "array",
      minItems: 2,
      maxItems: 6,
      items: {
        type: "object",
        properties: { colour: prose("A plain colour word or two."), job: { type: "string", enum: [...PALETTE_JOBS] } },
        required: ["colour", "job"],
      },
    },
    rhythm: prose("The cut's pace around this shot in one line, or 'pace unknown from stills'."),
    duration_s: { type: "number", description: "How long the shot holds, seconds." },
    prompt: prose("50-120 words a text-to-image generator obeys to draw a NEW frame with this craft; the medium first; no names, no writing."),
  },
  required: ["shot", "camera", "motion", "composition", "lighting", "palette", "rhythm", "duration_s", "prompt"],
};

const line = (max: number) => z.string().trim().min(3).max(max);

const draftSchema = z.object({
  shot: z.enum(SHOT_SIZES),
  camera: line(300),
  motion: line(500),
  composition: line(500),
  lighting: line(500),
  palette: z.array(z.object({ colour: z.string().trim().min(2).max(40), job: z.enum(PALETTE_JOBS) })).min(2).max(6),
  rhythm: line(300),
  duration_s: z.number().positive().max(600),
  prompt: z.string().trim().min(40).max(1500),
});
export type SceneDraft = z.output<typeof draftSchema>;

/* ── No names ────────────────────────────────────────────────────────────── */

// The words a title or a channel name shares with craft writing, which the denylist must not
// take from it ("A Quiet Night in the Rain" may not forbid a recipe the word "rain"). Function
// words, platform words, and the plain vocabulary of light, colour, place and weather.
const COMMON = new Set(
  (
    "the and for with from into onto this that these those its his her our your their are was were has have had not but all any " +
    "one two three four out off over under after before how why what who when where more most very just only also than then like " +
    "about new old big small little part full final first last best top official trailer teaser video music clip clips scene scenes " +
    "film films movie short shorts animation animated episode season series edit cut cuts version remastered live studio studios " +
    "channel presents making behind breakdown reel compilation shot shots camera cinematic cinematography color colour colors colours " +
    "light lights lighting dark night day morning evening dawn dusk sunset sunrise golden hour shadow shadows rain snow fog mist " +
    "smoke fire water sea ocean river lake sky sun moon star stars city street streets road forest wood woods mountain desert " +
    "field room house home window door car train black white red blue green yellow orange purple pink gold silver grey gray brown " +
    "neon slow fast quiet loud long wide close still motion moving walk run world life love time way end " +
    // 2026-10-22 dry campaign: a channel called "Every Frame a Painting" banned "frame" from every
    // recipe ("hard key from frame left"); the Met's "open access" banned "open". The vocabulary of
    // framing, shooting, painting and printing, and the plain words of a museum or tutorial title.
    "every frame frames framing painting paintings paint painted painter take takes oner oners strategy strategies " +
    "technique techniques tip tips how filmmaking filmmaker shoot shooting shot director directing direct lens lenses " +
    "angle angles focus depth composition compositions palette print prints printing printed poster posters " +
    "woodblock woodcut lithograph lithographs etching screenprint art arts artist artwork design study studies sketch " +
    "landscape portrait still life open access public domain museum collection gallery archive library " +
    "bridge gorge temple station tower castle village garden park beach hill valley " +
    "twilight midnight noon winter summer spring autumn fall storm wind cloud clouds thunder " +
    "perfect perfected secret secrets rule rules guide explained explain analysis essay lesson lessons " +
    // 2026-10-22 live rehearsal: "How I Lit This Moody Brand Video" banned "lit" from a lighting recipe.
    "moody brand practical practicals performance concert band interview vlog tutorial"
  ).split(" "),
);

/** Capitals a craft sentence may carry mid-sentence: the one craft term with a capital, and acronyms. */
const ALLOWED_CAPS = new Set(["Dutch", "CGI", "HDR", "VHS", "CRT", "LED", "RGB", "POV", "UV"]);

const words = (s: string): string[] => s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];

/** The source's own title and channel words a recipe may not repeat (lower case, 4+ letters: a
 *  three-letter title word - lit, set, cut, key - is craft far more often than it is a name). */
export function denylistOf(sources: readonly Pick<ScoutSource, "title" | "channel">[]): string[] {
  const out = new Set<string>();
  for (const s of sources) {
    for (const w of [...words(s.title), ...words(s.channel ?? "")].flatMap((x) => x.split(/['’-]/))) {
      const lw = w.toLowerCase();
      if (lw.length >= 4 && !COMMON.has(lw)) out.add(lw);
    }
  }
  return [...out];
}

/**
 * What in `fields` reads as a name: a word of the source's title or channel, or a capitalised
 * word that does not start a sentence (the prompt asks for lower case everywhere else). A
 * deterministic check, so it misses a name that opens a sentence and is not in the title - the
 * prompt's rule 2 is the other half.
 *
 * `allow` (spark scout-vision S3) - the names a storyboard panel may carry: its cast's names and their declared parody
 * origins. A capital mid-sentence whose every capitalised part is a word of one of them passes; anything else still
 * refuses. A scene recipe passes [] - it names nobody.
 */
export function namesIn(fields: readonly string[], deny: readonly string[], allow: readonly string[]): string[] {
  const denied = new Set(deny);
  const allowed = new Set(allow.flatMap((a) => words(a)).flatMap((w) => w.split(/['’-]/)).map((p) => p.toLowerCase()));
  const declared = (w: string): boolean => allowed.size > 0 && w.split(/['’-]/).every((p) => !/^\p{Lu}/u.test(p) || allowed.has(p.toLowerCase()));
  const found = new Set<string>();
  for (const f of fields) {
    for (const sentence of f.split(/(?<=[.!?;:])\s+/)) {
      words(sentence).forEach((w, i) => {
        if (w.split(/['’-]/).some((p) => denied.has(p.toLowerCase()))) found.add(`"${w}" (the source's title or channel)`);
        else if (i > 0 && /^\p{Lu}/u.test(w) && !ALLOWED_CAPS.has(w) && !declared(w)) found.add(`"${w}" (a capital mid-sentence)`);
      });
    }
  }
  return [...found];
}

/* ── Timing: the shot's length and the cut's pace, from the source's timestamps ── */

export type SceneTiming = {
  /** The source's cut timestamps, seconds, ascending. */
  readonly cuts: readonly number[];
  /** Each keyframe's time in its source, where known. */
  readonly at: Readonly<Record<string, number>>;
  readonly durationS?: number;
  readonly rhythm?: string;
};

const round = (x: number, d = 1): number => Math.round(x * 10 ** d) / 10 ** d;

/** pipeline/vlm-probe/survey.py `rhythm`: shot lengths between cuts (sub-0.15 s detector noise dropped). */
export function rhythmOf(cuts: readonly number[], duration: number): string | undefined {
  if (cuts.length === 0 || !(duration > 0)) return undefined;
  const first = cuts[0] ?? 0;
  const lastCut = cuts[cuts.length - 1] ?? 0;
  const edges = [...(first > 0 ? [0] : []), ...cuts, ...(lastCut < duration ? [duration] : [])];
  const lens = edges.slice(1).map((b, i) => b - (edges[i] ?? 0)).filter((l) => l > 0.15);
  if (lens.length < 2) return undefined;
  const s = [...lens].sort((a, b) => a - b);
  const mid = s.length / 2;
  const median = s.length % 2 === 1 ? (s[Math.floor(mid)] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
  return `${lens.length} shots over ${round(duration)} s, median ${round(median, 2)} s, ${round(lens.length / (duration / 60))} cuts a minute`;
}

/** The candidate's timing, read off the source its first keyframe came from. */
export function sceneTiming(night: Night, c: SceneCandidate): SceneTiming {
  const src = night.sources.find((s) => s.files.includes(c.keyframes[0] ?? ""));
  const at = src?.at ?? {};
  const cuts = [...new Set(Object.values(at))].filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  const times = c.keyframes.map((f) => at[f]).filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (times.length === 0) return { cuts, at };
  const start = Math.min(...times);
  const last = Math.max(...times);
  const end = cuts.find((t) => t > last) ?? src?.durationS;
  const durationS = end !== undefined && end > start ? round(end - start) : undefined;
  const pace = rhythmOf(cuts, src?.durationS ?? cuts[cuts.length - 1] ?? 0);
  const rhythm = pace === undefined ? undefined : durationS === undefined ? pace : `${pace}; this shot holds ${durationS} s`;
  return { cuts, at, ...(durationS === undefined ? {} : { durationS }), ...(rhythm === undefined ? {} : { rhythm }) };
}

/* ── The frame each call is handed ───────────────────────────────────────── */

export type FrameAsk = { readonly k: number; readonly of: number; readonly file: string; readonly prior: readonly SceneDraft[]; readonly timing: SceneTiming };

export function frameInstruction(prompt: string, f: FrameAsk): string {
  const at = f.timing.at[f.file];
  return [
    prompt,
    "",
    "## THE FRAME",
    `Keyframe ${f.k} of ${f.of}${at === undefined ? "" : `, at ${at} s in the source`}.`,
    f.timing.cuts.length > 1 ? `The source's cut timestamps, seconds: ${f.timing.cuts.join(", ")}.` : "The source gives no cut timestamps.",
    f.prior.length === 0 ? "This is the first keyframe of the shot." : `The earlier keyframes of this shot read as:\n${f.prior.map((d, i) => `${i + 1}. ${JSON.stringify(d)}`).join("\n")}`,
    f.k === f.of ? "This is the last keyframe: your answer is the recipe for the whole shot." : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
}

/** Up to `max` keyframes, evenly spaced and in order (the first and the last always kept). */
export function pickFrames(files: readonly string[], max: number = MAX_READ_FRAMES): string[] {
  if (files.length <= max) return [...files];
  return Array.from({ length: max }, (_, i) => files[Math.round((i * (files.length - 1)) / (max - 1))] ?? "").filter((f) => f !== "");
}

/* ── The door ─────────────────────────────────────────────────────────────── */

/** One answer through the door: its shape, then no names. */
export function draftOf(raw: unknown, deny: readonly string[]): Result<SceneDraft> {
  const d = parseAt("scene recipe", draftSchema, raw);
  if (!d.ok) return d;
  const v = d.value;
  const names = namesIn([v.camera, v.motion, v.composition, v.lighting, v.rhythm, v.prompt, ...v.palette.map((p) => p.colour)], deny, []);
  if (names.length > 0) return err("refused", `the scene recipe names ${names.join(", ")}: craft, not content`);
  return ok(v);
}

/** The recipe from the last answer: palette as `colour job`, length and pace from the cuts where known. */
export function recipeOf(raw: unknown, ctx: { readonly deny: readonly string[]; readonly timing: SceneTiming }): Result<SceneRecipe> {
  const d = draftOf(raw, ctx.deny);
  if (!d.ok) return d;
  const v = d.value;
  return ok({
    shot: v.shot,
    camera: v.camera,
    motion: v.motion,
    composition: v.composition,
    lighting: v.lighting,
    palette: v.palette.map((p) => `${p.colour} ${p.job}`),
    rhythm: ctx.timing.rhythm ?? v.rhythm,
    durationS: ctx.timing.durationS ?? v.duration_s,
    prompt: v.prompt,
  });
}

/* ── Replicas and the clip ───────────────────────────────────────────────── */

// The engine a replica still is drawn by - the Leonardo studio at Low by default, Flare or local Flux 2 by
// SCOUT_REPLICA_GENERATOR - and the lane its job waits on are ./stillEngine.ts's; re-exported here, where
// the replica's callers have always found them. Each is prefer-only in the router, so naming it is the whole
// chain. The readback stays on Google (scoutSceneActs.ts `prefer: "google"`).
export { REPLICA_GENERATOR, REPLICA_GENERATORS, replicaGenerator, stillLane, type ReplicaGenerator } from "./stillEngine";

/**
 * A replica still: the recipe's prompt verbatim (cut to the studio's box when the studio draws it), and
 * NO reference image - the source never conditions it.
 */
export function replicaRequest(recipe: SceneRecipe, k: number, generator: ReplicaGenerator = replicaGenerator()): GenerateRequest {
  return studioShaped({ prompt: recipe.prompt, negativePrompt: REPLICA_NEGATIVE, aspect: "16:9", count: 1, prefer: generator, seed: k });
}

const EXT: Readonly<Record<string, string>> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const replicaFile = (cid: string, k: number, mime: string): string => `scenes/${cid}/replica-${k}.${EXT[mime] ?? "png"}`;
export const clipFile = (cid: string): string => `scenes/${cid}/clip.mp4`;

export function imageMimeOf(rel: string): "image/png" | "image/jpeg" | "image/webp" | undefined {
  const e = path.extname(rel).toLowerCase();
  return e === ".png" ? "image/png" : e === ".jpg" || e === ".jpeg" ? "image/jpeg" : e === ".webp" ? "image/webp" : undefined;
}

/**
 * THE CLIP-SOURCE GUARD: the one door a path passes to become a clip's image. Only one of this
 * candidate's own replica stills, under its own scenes/<id>/ directory, and never a file any
 * source of the night holds - checked against the night, not trusted from the candidate.
 */
export function clipSourceOf(night: Night, c: SceneCandidate, from: string): Result<string> {
  const rel = from.replace(/\\/g, "/");
  if (rel.startsWith("sources/") || c.keyframes.includes(from) || night.sources.some((s) => s.files.includes(from))) {
    return err("refused", `${c.id}: ${from} is a source file (reference-only); it never reaches a video vendor`);
  }
  if (!c.replicas.includes(from) || !rel.startsWith(`scenes/${c.id}/`) || rel.split("/").includes("..")) {
    return err("refused", `${c.id}: ${from} is not one of its replica stills; a clip animates only a replica`);
  }
  return ok(from);
}

export type ClipAsk = { readonly from: string; readonly motion: string };

/** The clip's image and motion line, through the guard: the first replica, the recipe's motion with its style restated. */
export function clipRequestOf(night: Night, c: SceneCandidate): Result<ClipAsk> {
  if (c.recipe === undefined) return err("refused", `${c.id} has no recipe to animate`);
  const from = c.replicas[0];
  if (from === undefined) return err("refused", `${c.id} has no replica still to animate`);
  const guarded = clipSourceOf(night, c, from);
  if (!guarded.ok) return guarded;
  const r = c.recipe;
  return ok({ from: guarded.value, motion: `${r.motion}. Camera: ${r.camera}. Light: ${r.lighting}.`.slice(0, 1200) });
}

/* ── Dry stand-ins ───────────────────────────────────────────────────────── */

/** A dry read's answer: a valid recipe in craft words that says what it is. */
export function standDraft(timing: SceneTiming): SceneDraft {
  return {
    shot: "medium",
    camera: "eye level, the figure on the left third, a normal lens with no distortion",
    motion: "camera holds; the figure holds; dust drifts slowly right to left",
    composition: "one figure against a deep ground, open space to the right",
    lighting: "a soft key from high frame left, cool daylight; the right edge falls to black",
    palette: [
      { colour: "slate", job: "ground" },
      { colour: "bone", job: "figure" },
      { colour: "amber", job: "accent" },
    ],
    rhythm: timing.rhythm ?? "pace unknown from stills",
    duration_s: timing.durationS ?? 3,
    prompt: "A dry stand-in for a photoreal film still: a medium shot at eye level, one figure on the left third against a deep slate ground, a soft cool key from high left, the right edge falling to black, one amber accent, dust drifting in the air.",
  };
}

/** A 1x1 PNG (lib/producers/frames.ts PIXEL). */
const PIXEL_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
/** A committed picture of OUR OWN (a preset poster), never a source's: what a dry replica shows. */
const STAND_STILL = path.join("public", "clips", "presets", "blueprint.jpg");

export function standStill(root: string = process.cwd()): { readonly base64: string; readonly mime: "image/png" | "image/jpeg" } {
  const file = path.join(root, STAND_STILL);
  return existsSync(file) ? { base64: readFileSync(file).toString("base64"), mime: "image/jpeg" } : { base64: PIXEL_PNG, mime: "image/png" };
}

/** A few bytes the dry clip stands on: obviously not a video anyone bought (lib/producers/motion.ts DRY_CLIP). */
export const DRY_CLIP = new TextEncoder().encode("dry-run clip stand-in");
