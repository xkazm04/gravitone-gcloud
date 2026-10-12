// THE TREATMENT TURN — a track's clean title and its analysis in; one
// Leonardo still prompt, the pulsing element and the particle knobs out.
// Server-only: one lib/text turn per call ("mv-treatment", lib/text/types.ts),
// the prompt read per call from pipeline/MV-TREATMENT-PROMPT.md, exactly as
// lib/sound/suno/propose.ts reads its own.
//
// WHAT THE TURN IS GIVEN: the title and MvAnalysis, and nothing else. No
// lyrics, ever, even where Suno holds them (operator, 2026-10-12). The input is
// built by `treatmentInput`, which copies named keys rather than spreading an
// object, so a field added to a take or a clip later cannot ride along.
//
// WHAT THE MODEL MAY DECIDE: the words of the still and where the pulsing
// element sits. What it may not:
//   · a number out of range - every one is clamped here (MvMotion's ranges);
//   · a focal kind the compositor does not draw - replaced by DEFAULT_FOCAL;
//   · text in the image - the registry's image-prompt-composition subject makes
//     the no-text constraint a property of the COMPILER, not of the prompt
//     author's memory: it is appended to every positive prompt and welded into
//     every negative here, whatever the model wrote (golden path "the
//     constraint block is welded on, not remembered"; law
//     checkability-routes-the-pixel - the thumbnail's title is drawn by code);
//   · the reserved area - the model is asked to leave the focal's spot calm,
//     and the compiler restates WHERE in words derived from the clamped x/y
//     (golden path "reserve dead space"), so the still and the overlay agree
//     even when the model's prose forgot to say it;
//   · the length - Leonardo refuses a prompt past 1500 characters
//     (lib/imaging/providers/leonardo.ts MAX_PROMPT_CHARS); the model's text is
//     cut to leave room for the two welded clauses (technique
//     prompt-budget-limits: enforce the hard ceiling before the call).
//
// A MOTION REGENERATE is the same turn class with its own section: the current
// treatment is shown and the answer's schema holds `motion` ONLY, so the
// prompt, negative prompt and rationale are kept by construction rather than
// by instruction. Chosen over a code-only perturbation because the operator's
// note ("slower, cooler, fewer particles") is words, and turning words into
// these numbers is the model's job; one text turn is the whole cost.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { reason as routerReason } from "@/lib/text/router";
import type { TextRequest, TextResult, TurnClass } from "@/lib/text/types";

import { sectionsOf } from "../hunt";
import { SoundError } from "../store";
import { MV_FOCAL_KINDS, type MvAnalysis, type MvChapter, type MvFocalKind, type MvMotion, type MvTreatment } from "./types";

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

export const TREATMENT_TURN: TurnClass = "mv-treatment";

/** Leonardo's own ceiling (see the header). */
export const PROMPT_MAX = 1500;
const NEGATIVE_MAX = 400;
const RATIONALE_MAX = 240;

/** The kind drawn when the model names one the compositor does not have: a
 *  halo is the quietest of the four, the least likely to fight a still that
 *  was composed for something else. */
export const DEFAULT_FOCAL: MvFocalKind = "halo";

/** The welded constraint, positive half. Last in the prompt, where the
 *  registry's style-first-token-ordering puts the constraint clause. */
export const NO_TEXT_CLAUSE = "No text, no letters, no numbers, no logos, no watermarks anywhere in the image.";
/** The welded constraint, negative half (technique negative-prompting: the
 *  architectural ban, restated in the channel the sampler acts on). */
export const NO_TEXT_NEGATIVE = ["text", "letters", "numbers", "words", "typography", "logo", "watermark", "signature"];

/* ── the input ─────────────────────────────────────────────────────────────── */

/** Exactly what the text turns read. Two keys; see the header. */
export interface TreatmentInput {
  title: string;
  analysis: MvAnalysis;
}

/** Build the turn input from a clean title and an analysis, copying only the
 *  analysis' declared fields. */
export function treatmentInput(title: string, a: MvAnalysis): TreatmentInput {
  return {
    title,
    analysis: {
      durationS: a.durationS,
      tempoBpm: [...a.tempoBpm],
      energyShape: [...a.energyShape],
      sections: a.sections.map((s) => ({ startS: s.startS, label: s.label })),
    },
  };
}

/** m:ss, or h:mm:ss past an hour - YouTube's chapter clock. */
export function clock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const sectionLines = (sections: readonly MvChapter[]) => (sections.length ? sections.map((c) => `${clock(c.startS)} ${c.label}`).join("; ") : "(none found)");

/** The analysis as the prompt states it: numbers, not adjectives. */
export function analysisText(a: MvAnalysis): string {
  return [
    `duration: ${clock(a.durationS)} (${Math.round(a.durationS)} s)`,
    `tempo candidates, strongest first: ${a.tempoBpm.length ? a.tempoBpm.map((b) => `${Math.round(b)} bpm`).join(", ") : "none found"}`,
    `energy per tenth of the track (0 silent .. 1 loudest): ${a.energyShape.map((e) => (Math.round(e * 100) / 100).toFixed(2)).join(" ")}`,
    `sections: ${sectionLines(a.sections)}`,
  ].join("\n");
}

/* ── the prompt file ──────────────────────────────────────────────────────── */

export async function promptSections(file: string, needs: readonly string[]): Promise<Record<string, string>> {
  const at = path.join(process.cwd(), "pipeline", file);
  let md: string;
  try {
    md = await readFile(at, "utf8");
  } catch {
    throw new SoundError(`the prompt file ${path.relative(process.cwd(), at)} is missing — it is part of the code`, 500);
  }
  const s = sectionsOf(md);
  const missing = needs.filter((n) => !s[n]);
  if (missing.length) throw new SoundError(`${file} needs the section(s) ${missing.map((m) => `"${m}"`).join(", ")}`, 500);
  return s;
}

export const fill = (tpl: string, slots: Record<string, string>) => tpl.replace(/\{\{([A-Z_]+)\}\}/g, (all, k: string) => (k in slots ? slots[k] : all));

const motionText = (m: MvMotion) =>
  `focal: ${m.focal.kind} at x=${m.focal.x}, y=${m.focal.y}, r=${m.focal.r}, hue=${m.focal.hue}; particleDensity=${m.particleDensity}, particleHue=${m.particleHue}, pulseStrength=${m.pulseStrength}`;

/** The whole prompt. Pure over its inputs, so a probe reads what would be sent. */
export function treatmentPrompt(
  sections: Record<string, string>,
  input: TreatmentInput,
  mode: "image" | "motion",
  note: string | undefined,
  current: MvTreatment | undefined,
): string {
  const slots = {
    TITLE: input.title,
    ANALYSIS: analysisText(input.analysis),
    NOTE: note?.trim() ? note.trim() : "(none)",
    FOCAL_KINDS: MV_FOCAL_KINDS.join(", "),
    PROMPT_MAX: String(PROMPT_MAX - 300),
    CURRENT: current ? `prompt: ${current.prompt}\n${motionText(current.motion)}\nrationale: ${current.rationale}` : "(none)",
  };
  return [fill(sections.shared, slots), fill(mode === "image" ? sections.image : sections.motion, slots)].join("\n\n");
}

const MOTION_PROPS: Record<string, unknown> = {
  type: "object",
  required: ["focal", "particleDensity", "particleHue", "pulseStrength"],
  properties: {
    focal: {
      type: "object",
      required: ["kind", "x", "y", "r", "hue"],
      properties: { kind: { type: "string" }, x: { type: "number" }, y: { type: "number" }, r: { type: "number" }, hue: { type: "number" } },
    },
    particleDensity: { type: "number" },
    particleHue: { type: "number" },
    pulseStrength: { type: "number" },
  },
};

export const TREATMENT_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["prompt", "motion", "rationale"],
  properties: { prompt: { type: "string" }, negativePrompt: { type: "string" }, motion: MOTION_PROPS, rationale: { type: "string" } },
};

export const MOTION_SCHEMA: Record<string, unknown> = { type: "object", required: ["motion"], properties: { motion: MOTION_PROPS } };

/* ── what the model answered, held to the engine's ranges ──────────────────── */

/** Each knob's range and the value an absent / non-numeric answer gets. x and
 *  y stop short of the edge: an element centred ON the edge is half drawn. r
 *  is against the frame height; past 0.4 the "one element" is the frame. */
export const RANGES = {
  x: { min: 0.05, max: 0.95, fallback: 0.5 },
  y: { min: 0.05, max: 0.95, fallback: 0.5 },
  r: { min: 0.04, max: 0.4, fallback: 0.15 },
  hue: { min: 0, max: 360, fallback: 200 },
  particleDensity: { min: 0, max: 1, fallback: 0.5 },
  particleHue: { min: 0, max: 360, fallback: 200 },
  pulseStrength: { min: 0, max: 1, fallback: 0.6 },
} as const;

function clampTo(v: unknown, r: { min: number; max: number; fallback: number }): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : r.fallback;
  return Math.round(Math.min(r.max, Math.max(r.min, n)) * 1000) / 1000;
}

export function parseMotion(v: unknown): MvMotion {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const f = (o.focal && typeof o.focal === "object" ? o.focal : {}) as Record<string, unknown>;
  const kind = MV_FOCAL_KINDS.find((k) => k === (typeof f.kind === "string" ? f.kind.trim().toLowerCase() : "")) ?? DEFAULT_FOCAL;
  return {
    focal: { kind, x: clampTo(f.x, RANGES.x), y: clampTo(f.y, RANGES.y), r: clampTo(f.r, RANGES.r), hue: clampTo(f.hue, RANGES.hue) },
    particleDensity: clampTo(o.particleDensity, RANGES.particleDensity),
    particleHue: clampTo(o.particleHue, RANGES.particleHue),
    pulseStrength: clampTo(o.pulseStrength, RANGES.pulseStrength),
  };
}

/** Where the focal sits, in words a prompt can carry. Thirds, because "the
 *  upper right" is what an image model can place; "x=0.71" is not. */
export function placeWords(x: number, y: number): string {
  const h = x < 0.36 ? "left" : x > 0.64 ? "right" : "centre";
  const v = y < 0.36 ? "upper" : y > 0.64 ? "lower" : "middle";
  if (h === "centre" && v === "middle") return "centre";
  if (h === "centre") return `${v} centre`;
  if (v === "middle") return `middle ${h}`;
  return `${v} ${h}`;
}

export const reservedClause = (m: MvMotion) =>
  `Keep the ${placeWords(m.focal.x, m.focal.y)} of the frame calm and nearly empty: a soft, low-detail field with no object in it.`;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const at = Math.max(head.lastIndexOf(". "), head.lastIndexOf(", "), head.lastIndexOf(" "));
  return (at > max * 0.6 ? head.slice(0, at) : head).replace(/[\s,;:]+$/, "");
}

/** The model's prompt, its welded clauses appended, within PROMPT_MAX. */
export function compilePrompt(modelPrompt: string, motion: MvMotion): string {
  const tail = `${reservedClause(motion)} ${NO_TEXT_CLAUSE}`;
  const body = cut(oneLine(modelPrompt), PROMPT_MAX - tail.length - 1);
  return `${body} ${tail}`;
}

/** The model's negative, with the no-text ban welded in, deduplicated. */
export function compileNegative(modelNegative: unknown): string {
  const own = typeof modelNegative === "string" ? modelNegative.split(",").map((t) => oneLine(t)).filter(Boolean) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...NO_TEXT_NEGATIVE, ...own]) {
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return cut(out.join(", "), NEGATIVE_MAX);
}

/** A full treatment from the model's JSON. A missing prompt is the engine
 *  failing the turn (502), not an empty still. */
export function parseTreatment(json: unknown): MvTreatment {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const prompt = typeof o.prompt === "string" ? oneLine(o.prompt) : "";
  if (!prompt) throw new SoundError("the text engine's treatment had no image prompt", 502);
  const motion = parseMotion(o.motion);
  const rationale = typeof o.rationale === "string" ? cut(oneLine(o.rationale), RATIONALE_MAX) : "";
  return { prompt: compilePrompt(prompt, motion), negativePrompt: compileNegative(o.negativePrompt), motion, rationale };
}

/* ── the turns ────────────────────────────────────────────────────────────── */

export const TREATMENT_PROMPT_FILE = "MV-TREATMENT-PROMPT.md";

/** A new treatment: a new still prompt and new motion. */
export async function writeTreatment(input: TreatmentInput, opts: { note?: string; reason?: ReasonFn } = {}): Promise<MvTreatment> {
  const sections = await promptSections(TREATMENT_PROMPT_FILE, ["shared", "image", "motion"]);
  const out = await (opts.reason ?? routerReason)({ turn: TREATMENT_TURN, prompt: treatmentPrompt(sections, input, "image", opts.note, undefined), schema: TREATMENT_SCHEMA });
  return parseTreatment(out.json);
}

/** New motion over the SAME still: everything but `motion` is the current
 *  treatment's, verbatim, the focal keeps its x/y, and the reserved-area
 *  clause is NOT rewritten - the
 *  still was composed around the old spot and is not being redrawn, so the
 *  prompt that describes it must stay the prompt that made it. */
export async function writeMotion(input: TreatmentInput, current: MvTreatment, opts: { note?: string; reason?: ReasonFn } = {}): Promise<MvTreatment> {
  const sections = await promptSections(TREATMENT_PROMPT_FILE, ["shared", "image", "motion"]);
  const out = await (opts.reason ?? routerReason)({ turn: TREATMENT_TURN, prompt: treatmentPrompt(sections, input, "motion", opts.note, current), schema: MOTION_SCHEMA });
  const o = (out.json && typeof out.json === "object" ? out.json : {}) as Record<string, unknown>;
  if (!o.motion || typeof o.motion !== "object") throw new SoundError("the text engine's answer had no motion", 502);
  const motion = parseMotion(o.motion);
  // The focal stays WHERE the still left room for it: that calm area is in
  // the pixels now, and an element moved off it pulses over detail.
  motion.focal.x = current.motion.focal.x;
  motion.focal.y = current.motion.focal.y;
  return { ...current, motion };
}
