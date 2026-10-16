import "server-only";

import type { WorkKind } from "@gt/catalog/recipes";
import type { ResourceLane } from "@gt/domain/lane";
import type { FigureSource, ModelOption } from "@gt/domain/produce";

// THE FIXTURE UNIVERSE'S DATA - the prototype's figures, each marked with where it came from
// (docs/next/prototype/app/studio.js CATALOG, model.js estimates). Only the figures the
// prototype itself tagged `model` (forge 1.6 min a plate, the article band $47-92, Suno 4 min a
// prompt, the 31.5 min encode) carry `model`; every other minute and dollar is `illustrative`.
// Where the prototype priced a seat or a credit plan in dollars ($0 for a text-CLI turn), the
// fixture says why it has no price instead (the catalog's own reasons, @gt/catalog/partOptions):
// a $0 beside a measured $0.04 reads as a measurement (measurement-honesty).
// One figure is a measurement, not the prototype's: a strips card is authored on the TEXT SEAT
// and rendered inside the same step (L33), ~1021 s a card-round (strips-r1, 879 s of seat and
// 142 s of capture, 2026-10-06) - the prototype drew it as 0.7 min on the render box, which put
// a paid seat's turns on a free lane that never holds after a crash.

const PROTO = "prototype studio.js CATALOG, a placeholder nobody measured";
const MODEL = "prototype model.js estimate";

export const SEAT = "billed to the text seat; the CLI reports cost after the run";
export const SUNO = "Suno bills subscription credits, not dollars";
export const STUDIO = "Leonardo studio credits from the prepaid plan, not dollars";
export const STRIPS_SEAT = "each card's author turn bills the text seat, reported after the run (pipeline/strips/run.mts)";
/** strips-r1 (lib/producers/strips.ts `stripsOption`): one card-round on the seat, capture included. */
const STRIPS_ROUND_MIN = 1021 / 60;
const STRIPS_ROUND = "strips-r1: 879 s of seat and 142 s of capture per card-round, measured 2026-10-06";

type Price = number | readonly [number, number] | { readonly unpriced: string };

function opt(kind: WorkKind, provider: string, model: string, label: string, lane: ResourceLane, minutes: number, price: Price, src: FigureSource = "illustrative", measured?: string): ModelOption {
  const note = measured ?? (src === "model" ? MODEL : PROTO);
  const usd: { readonly usdPerUnit: number | null; readonly usdRangePerUnit?: readonly [number, number]; readonly unpricedReason?: string } =
    typeof price === "number"
      ? { usdPerUnit: price }
      : "unpriced" in price
        ? { usdPerUnit: null, unpricedReason: price.unpriced }
        : { usdPerUnit: (price[0] + price[1]) / 2, usdRangePerUnit: [price[0], price[1]] };
  return {
    key: `${kind}/${provider}/${model}`,
    lane,
    provider,
    model,
    label,
    secondsPerUnit: Math.round(minutes * 60),
    ...usd,
    src,
    basis: { seconds: { src, note }, usd: { src: usd.usdPerUnit === null ? "real" : src, note: usd.usdPerUnit === null ? (usd.unpricedReason ?? note) : note } },
  };
}

const u = (unpriced: string): Price => ({ unpriced });

export type KindSpec = { readonly noun: string; readonly options: readonly ModelOption[] };

export const OPTIONS: Readonly<Record<WorkKind, KindSpec>> = {
  research: { noun: "brief", options: [opt("research", "claude-cli", "research", "text CLI · research turn", "seat.text", 9, u(SEAT)), opt("research", "google", "gemini-grounded", "Gemini · grounded search", "cloud.google", 4, 0.27)] },
  script: { noun: "draft", options: [opt("script", "claude-cli", "compose", "text CLI · 2 turns", "seat.text", 14, u(SEAT)), opt("script", "google", "gemini", "Gemini · script", "cloud.google", 6, 0.12)] },
  words: { noun: "turn", options: [opt("words", "claude-cli", "mv-metadata", "text CLI · title + description", "seat.text", 3, u(SEAT)), opt("words", "google", "gemini", "Gemini", "cloud.google", 1, 0.02)] },
  frames: {
    noun: "plate",
    options: [
      opt("frames", "comfy", "flux-2-dev-fp8", "Flux 2 dev fp8 · ComfyUI", "gpu.local", 1.6, 0, "model"),
      opt("frames", "google", "nano-banana", "Nano Banana", "cloud.google", 0.35, 0.04),
      opt("frames", "leonardo", "phoenix", "Leonardo · image", "cloud.leonardo", 0.5, 0.06),
    ],
  },
  still: {
    noun: "still",
    options: [
      opt("still", "leonardo-studio", "cdp", "Leonardo · CDP", "box.chrome", 3, u(STUDIO)),
      opt("still", "google", "nano-banana", "Nano Banana", "cloud.google", 0.4, 0.04),
      opt("still", "comfy", "flux-2-dev-fp8", "Flux 2 dev fp8", "gpu.local", 1.6, 0, "model"),
    ],
  },
  motion: { noun: "shot", options: [opt("motion", "wan", "wan-2.2-i2v", "Wan 2.2 · i2v", "gpu.local", 6, 0), opt("motion", "strips", "strip-render", "strips · HTML/SVG 240f", "seat.text", STRIPS_ROUND_MIN, u(STRIPS_SEAT), "real", STRIPS_ROUND)] },
  score: { noun: "prompt", options: [opt("score", "suno", "v6", "Suno v6 · serial", "box.chrome", 4, u(SUNO), "model"), opt("score", "elevenlabs", "music", "ElevenLabs · music", "cloud.elevenlabs", 1.5, 0.36)] },
  track: { noun: "prompt", options: [opt("track", "suno", "v6-wild", "Suno v6 + v6-wild · serial", "box.chrome", 4, u(SUNO), "model"), opt("track", "elevenlabs", "music", "ElevenLabs · music", "cloud.elevenlabs", 1.5, 0.36)] },
  sfx: { noun: "clip", options: [opt("sfx", "elevenlabs", "sfx", "ElevenLabs · sfx", "cloud.elevenlabs", 1, 0.04)] },
  voice: { noun: "take", options: [opt("voice", "elevenlabs", "voice", "ElevenLabs · voice", "cloud.elevenlabs", 2, 0.18), opt("voice", "local-tts", "tts", "local TTS", "seat.text", 5, 0)] },
  article: { noun: "run", options: [opt("article", "articles", "critique-4", "lib/articles · 4-model critique", "seat.text", 38, [47, 92], "model")] },
  strips: { noun: "card", options: [opt("strips", "strips", "strip-render", "strips · HTML/SVG 240f", "seat.text", STRIPS_ROUND_MIN, u(STRIPS_SEAT), "real", STRIPS_ROUND)] },
  render: { noun: "encode", options: [opt("render", "ffmpeg", "libx264", "libx264 · full encode", "box.render", 31.5, 0, "model"), opt("render", "ffmpeg", "libx264-draft", "libx264 · draft preset", "box.render", 9, 0)] },
  cut: { noun: "cut", options: [opt("cut", "ffmpeg", "compositor", "ffmpeg · compositor", "box.render", 7, 0)] },
  extract: { noun: "source", options: [opt("extract", "google", "nano-banana", "Nano Banana · read back + replicate", "cloud.google", 0.8, 0.12)] },
  forge: { noun: "plate", options: [opt("forge", "comfy", "flux-2-dev-fp8", "Flux 2 dev fp8 · ComfyUI", "gpu.local", 1.6, 0, "model")] },
  dojo: { noun: "cycle", options: [opt("dojo", "google", "judge", "Nano Banana · Gemini judge", "cloud.google", 20, 0.45), opt("dojo", "comfy", "pairs", "Flux 2 dev fp8 · local pairs", "gpu.local", 30, 0)] },
};

/* ── what the composers and Compose choose from ───────────────────────────── */

export type StyleChoice = { readonly id: string; readonly name: string; readonly plates: number };
export const CANDIDATE_STYLES: readonly StyleChoice[] = [
  { id: "teal-orange-blockbuster", name: "Teal-orange blockbuster", plates: 6 },
  { id: "ink-wash-dusk", name: "Ink wash dusk", plates: 6 },
  { id: "risograph-signal", name: "Risograph signal", plates: 4 },
];
export const PROVEN_STYLES: readonly StyleChoice[] = [
  { id: "ink-graphic-novel", name: "Ink graphic novel", plates: 6 },
  { id: "cold-documentary", name: "Cold documentary", plates: 6 },
  { id: "glass-harbor-noir", name: "Glass harbor noir", plates: 8 },
];
/** The forge's styles a sweep runs (prototype `Sweep · all N forge styles`), two plates each. */
export const SWEEP_STYLES = 9;
export const SWEEP_PLATES_PER_STYLE = 2;

export type Topic = { readonly slug: string; readonly title: string; readonly bundle: string };
export const TOPICS: readonly Topic[] = [
  { slug: "generative-provider-routing", title: "Generative provider routing", bundle: "media-generation" },
  { slug: "visual-style-locking", title: "Visual style locking", bundle: "media-generation" },
  { slug: "music-prompt-composition", title: "Music prompt composition", bundle: "media-generation" },
  { slug: "video-assembly", title: "Video assembly", bundle: "media-generation" },
  { slug: "agent-run-budgeting", title: "Agent run budgeting", bundle: "software-engineering" },
  { slug: "cost-metering", title: "Cost metering", bundle: "software-engineering" },
  { slug: "retry-backoff", title: "Retry and backoff", bundle: "software-engineering" },
  { slug: "hitl-approval", title: "Human-in-the-loop approval", bundle: "software-engineering" },
];

export type Subject = { readonly id: string; readonly cards: number };
export const SUBJECTS: readonly Subject[] = [
  { id: "edu-radar", cards: 6 },
  { id: "edu-aqueduct", cards: 5 },
  { id: "edu-chokepoint", cards: 7 },
];

export type Take = { readonly id: string; readonly title: string; readonly durationS: number };
export const KEPT_TAKES: readonly Take[] = [
  { id: "take-salt-lines", title: "Salt lines", durationS: 154 },
  { id: "take-low-tide-engine", title: "Low tide engine", durationS: 188 },
  { id: "take-quiet-orbit", title: "Quiet orbit", durationS: 131 },
];

/* ── the seeded projects ──────────────────────────────────────────────────── */

/** A seeded job's history: its state and when it ran, minutes relative to the universe's birth. */
export type SeedJob = { readonly state: "done" | "running" | "failed" | "interrupted" | "queued" | "paused"; readonly at?: number; readonly took?: number; readonly error?: string; readonly stage?: string; readonly option?: number };

export type SeedProject = {
  readonly id: string;
  readonly title: string;
  readonly recipe: string;
  readonly launched: boolean;
  readonly units?: Readonly<Record<string, number>>;
  readonly styleId?: string;
  readonly takeId?: string;
  readonly topic?: string;
  /** By recipe part key: a work part's job, or `committed` for a gate whose packet was decided. */
  readonly jobs: Readonly<Record<string, SeedJob>>;
  readonly gates: readonly string[];
};

export const SEED_PROJECTS: readonly SeedProject[] = [
  {
    id: "glass-harbor-trailer",
    title: "Glass Harbor — trailer",
    recipe: "film/trailer",
    launched: true,
    units: { plates: 24, shots: 10, prompts: 2 },
    styleId: "glass-harbor-noir",
    jobs: { research: { state: "done", at: -960, took: 9 }, script: { state: "done", at: -940, took: 14 }, frames: { state: "done", at: -820, took: 38 }, motion: { state: "done", at: -600, took: 60 }, score: { state: "done", at: -900, took: 8 }, cut: { state: "done", at: -140, took: 7 } },
    gates: ["gate:frames", "gate:score"],
  },
  {
    id: "why-bitcoin",
    title: "Why the Bitcoin price does not rise",
    recipe: "film/short-educational-video",
    launched: true,
    units: { plates: 40, shots: 14, prompts: 3 },
    styleId: "cold-documentary",
    jobs: { research: { state: "done", at: -95, took: 9 }, script: { state: "running", at: -8, stage: "turn 2 of 2" } },
    gates: [],
  },
  {
    id: "the-quiet-tariff",
    title: "The quiet tariff",
    recipe: "film/short-educational-video",
    launched: true,
    units: { plates: 18, shots: 8, prompts: 2 },
    styleId: "ink-graphic-novel",
    jobs: {
      research: { state: "done", at: -1500, took: 9 },
      script: { state: "done", at: -1480, took: 14 },
      frames: { state: "failed", at: -250, took: 29, error: "gate: 0 of 18 plates kept · reason style · re-run needs a new route" },
      score: { state: "done", at: -1420, took: 8 },
    },
    gates: ["gate:score"],
  },
  {
    id: "provider-routing-explainer",
    title: "Generative provider routing — explainer",
    recipe: "explainer",
    launched: true,
    topic: "generative-provider-routing",
    jobs: { article: { state: "done", at: -220, took: 38 } },
    gates: [],
  },
  {
    id: "untitled-port-strike",
    title: "Untitled — the port strike",
    recipe: "film/short-form-clip",
    launched: false,
    jobs: {},
    gates: [],
  },
];

/** A Floor run seeded on the Suno lane that was interrupted mid-run: the lane holds. */
export const SEED_INTERRUPTED = { title: "Hunt · low brass bed", lane: "audio", stage: "submit · 2 of 4 prompts", at: -46 } as const;
/** A Floor run seeded on the text seat, running. */
export const SEED_RUNNING_ARTICLE = { title: "Agent run budgeting", topic: "agent-run-budgeting", at: -12, stage: "critique · 3 of 4 models" } as const;
