// THE TREATMENT TURN — a track's clean title and its analysis in; one
// Leonardo still prompt and the particle knobs out.
// Server-only: one lib/text turn per call ("mv-treatment", lib/text/types.ts),
// the prompt read per call from pipeline/MV-TREATMENT-PROMPT.md, exactly as
// lib/sound/suno/propose.ts reads its own.
//
// WHAT THE TURN IS GIVEN: the title and MvAnalysis, and nothing else. No
// lyrics, ever, even where Suno holds them (operator, 2026-10-12). The input is
// built by `treatmentInput`, which copies named keys rather than spreading an
// object, so a field added to a take or a clip later cannot ride along.
//
// WHAT THE MODEL MAY DECIDE: the words of the still and the particle knobs.
// What it may not:
//   · a number out of range - every one is clamped here (MvMotion's ranges);
//   · text in the image - the registry's image-prompt-composition subject makes
//     the no-text constraint a property of the COMPILER, not of the prompt
//     author's memory: it is appended to every positive prompt and welded into
//     every negative here, whatever the model wrote (golden path "the
//     constraint block is welded on, not remembered"; law
//     checkability-routes-the-pixel);
//   · the length - Leonardo refuses a prompt past 1500 characters
//     (lib/imaging/providers/leonardo.ts MAX_PROMPT_CHARS); the model's text is
//     cut to leave room for the welded clause (technique
//     prompt-budget-limits: enforce the hard ceiling before the call).
//
// THE PULSING ELEMENT IS DESCOPED (operator, 2026-10-12: low quality beside
// the light effects). The turn used to place one code-drawn halo/ring/light/orb
// and the compiler welded a "keep this area calm" clause for it; neither is
// asked for or written now. A treatment made before carries `motion.focal`,
// which parseMotion drops and the render ignores.
//
// THE OPERATOR'S OWN PROMPT (`operatorTreatment`) replaces the turn on an
// image regenerate that carries one: the prompt as written plus the welded
// no-text clause, the current motion kept. No text turn runs for it.
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
import type { MvAnalysis, MvChapter, MvMotion, MvTreatment } from "./types";

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

export const TREATMENT_TURN: TurnClass = "mv-treatment";

/** Leonardo's own ceiling (see the header). */
export const PROMPT_MAX = 1500;
const NEGATIVE_MAX = 400;
const RATIONALE_MAX = 240;

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

const motionText = (m: MvMotion) => `particleDensity=${m.particleDensity}, particleHue=${m.particleHue}, pulseStrength=${m.pulseStrength}`;

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
    PROMPT_MAX: String(PROMPT_MAX - 300),
    CURRENT: current ? `prompt: ${current.prompt}\n${motionText(current.motion)}\nrationale: ${current.rationale}` : "(none)",
  };
  return [fill(sections.shared, slots), fill(mode === "image" ? sections.image : sections.motion, slots)].join("\n\n");
}

const MOTION_PROPS: Record<string, unknown> = {
  type: "object",
  required: ["particleDensity", "particleHue", "pulseStrength"],
  properties: {
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

/** Each knob's range and the value an absent / non-numeric answer gets. */
export const RANGES = {
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
  // A `focal` in the answer is dropped: the element is descoped (header).
  return {
    particleDensity: clampTo(o.particleDensity, RANGES.particleDensity),
    particleHue: clampTo(o.particleHue, RANGES.particleHue),
    pulseStrength: clampTo(o.pulseStrength, RANGES.pulseStrength),
  };
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const at = Math.max(head.lastIndexOf(". "), head.lastIndexOf(", "), head.lastIndexOf(" "));
  return (at > max * 0.6 ? head.slice(0, at) : head).replace(/[\s,;:]+$/, "");
}

/** A prompt with the no-text clause welded on, within PROMPT_MAX. */
export function compilePrompt(prompt: string): string {
  const body = cut(oneLine(prompt), PROMPT_MAX - NO_TEXT_CLAUSE.length - 1);
  return `${body} ${NO_TEXT_CLAUSE}`;
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
  return { prompt: compilePrompt(prompt), negativePrompt: compileNegative(o.negativePrompt), motion, rationale };
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
 *  treatment's, verbatim - the still is not being redrawn, so the prompt that
 *  describes it must stay the prompt that made it. */
export async function writeMotion(input: TreatmentInput, current: MvTreatment, opts: { note?: string; reason?: ReasonFn } = {}): Promise<MvTreatment> {
  const sections = await promptSections(TREATMENT_PROMPT_FILE, ["shared", "image", "motion"]);
  const out = await (opts.reason ?? routerReason)({ turn: TREATMENT_TURN, prompt: treatmentPrompt(sections, input, "motion", opts.note, current), schema: MOTION_SCHEMA });
  const o = (out.json && typeof out.json === "object" ? out.json : {}) as Record<string, unknown>;
  if (!o.motion || typeof o.motion !== "object") throw new SoundError("the text engine's answer had no motion", 502);
  return { ...current, motion: parseMotion(o.motion) };
}

/** The operator's own still prompt in place of the turn: their words with the
 *  no-text clause welded on, the current motion kept (defaults on a job that
 *  has none). No negative prompt: the operator's prompt is the whole ask, and
 *  the studio's GPT Image model takes none. */
export function operatorTreatment(prompt: string, current: MvTreatment | undefined): MvTreatment {
  const own = oneLine(prompt);
  if (!own) throw new SoundError("the operator's prompt is empty", 400);
  return { prompt: compilePrompt(own), motion: parseMotion(current?.motion), rationale: "the operator's own prompt" };
}
