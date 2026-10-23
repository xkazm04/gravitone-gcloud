import type { WorkKind } from "./recipes.ts";

// THE MODEL OPTIONS PER PART KIND - which provider can make a part, on which lane, at what pace.
//
// Absorbed from the prototype's CATALOG (docs/next/prototype/app/studio.js :35-73), which priced
// every option with a literal and tagged most of them illustrative. Here an option either NAMES A
// ROUTER CANDIDATE (`via: "router"`) - and then its lane, its wire model and its price come from
// the kernel's router table and price table, joined in packages/kernel/src/records/options.ts -
// or it is a producer the router does not route (`via: "local"`: the forge's ComfyUI, the strips
// renderer's draft preset, the article pipeline, local TTS) and declares its own lane here.
//
// What is DROPPED from the prototype: its illustrative dollar figures. A cloud option the price
// table cannot price is shown unpriced WITH the table's reason ("rate unread", "credits"), never
// with the prototype's placeholder - a made-up $0.27 beside a measured $0.045 reads as two
// measurements (registry: measurement-honesty / unmeasurable-vs-zero). Its illustrative MINUTES are
// kept, because a schedule needs a duration and an unknown one is worse; they say so.
//
// Catalog sits below domain and kernel, so lanes, units and media are plain strings here, checked
// against `@gt/domain/lane` and the router tables by packages/kernel/test/records.options.test.ts.

export type FigureSrc = "real" | "model" | "illustrative";

export type PaceDecl = { readonly secondsPerUnit: number; readonly src: FigureSrc; readonly note: string; readonly measuredAt?: string };

export type UsdDecl =
  | { readonly perUnit: number; readonly range?: readonly [number, number]; readonly src: FigureSrc; readonly note: string; readonly measuredAt?: string }
  | { readonly unpriced: string };

export type OptionDecl =
  | {
      readonly via: "router";
      readonly provider: string;
      /** The router plan key, when it is not the kind's own (`reason/compose`, `strip-render`). */
      readonly capability?: string;
      readonly label: string;
      readonly producer?: string;
      /** Overrides (or supplies) the router candidate's pace. */
      readonly pace?: PaceDecl;
      /** What one work unit bills, so the price table can quote it (a prompt = 120 audio-seconds). */
      readonly usage?: { readonly unit: string; readonly perUnit: number; readonly size?: string };
      /** Used when the quote is unpriced: a band the pipeline observed, or the honest reason. */
      readonly fallback?: UsdDecl;
    }
  | {
      readonly via: "local";
      readonly provider: string;
      readonly model: string;
      readonly lane: string;
      readonly label: string;
      readonly producer?: string;
      readonly pace: PaceDecl;
      readonly usd: UsdDecl;
    };

export type KindOptions = {
  readonly unitNoun: string;
  /** The router medium and capability (plan key) this kind routes by, when it routes at all. */
  readonly route?: { readonly medium: string; readonly capability: string };
  /** The `@gt/producers` name a job of this kind runs under, unless the option names its own. */
  readonly producer: string;
  readonly options: readonly OptionDecl[];
};

const proto = (minutes: number, what: string): PaceDecl => ({
  secondsPerUnit: Math.round(minutes * 60),
  src: "illustrative",
  note: `prototype studio.js CATALOG: ${what}, ${minutes} min per unit, a placeholder`,
});
const LOCAL_FREE: UsdDecl = { perUnit: 0, src: "real", note: "runs on this studio's own machine; nobody invoices it" };
const STRIPS_SEAT: UsdDecl = { unpriced: "each card's author turn bills the text seat, reported after the run (pipeline/strips/run.mts)" };
const SEAT: UsdDecl = { unpriced: "billed to the operator's text seat; the CLI reports its own cost after the run, not before" };
/** The unpriced sentences that mean "the operator's Claude seat": an agent may run these live (@gt/domain/mcp isFreeReceipt). */
export const SEAT_UNPRICED_REASONS: readonly string[] = [SEAT.unpriced, STRIPS_SEAT.unpriced];

/** One Suno prompt makes two clips of about two minutes each (prototype model.js estimate.audio). */
const SUNO_CREDITS: UsdDecl = { unpriced: "Suno bills subscription credits, not dollars; the driver reads the credits left, never a price" };
const STUDIO_CREDITS: UsdDecl = { unpriced: "Leonardo studio credits from the prepaid plan (71 for one still, read 2026-10-12); no USD per credit is checked" };

export const PART_OPTIONS: Readonly<Record<WorkKind, KindOptions>> = {
  research: {
    unitNoun: "brief",
    route: { medium: "text", capability: "reason/research" },
    producer: "research",
    options: [
      { via: "router", provider: "claude-cli", label: "text CLI · research turn", pace: proto(9, "research on the text CLI"), fallback: SEAT },
      { via: "router", provider: "google", label: "Gemini · grounded search", pace: proto(4, "research on Gemini") },
    ],
  },
  script: {
    unitNoun: "draft",
    route: { medium: "text", capability: "reason/compose" },
    producer: "script",
    options: [
      { via: "router", provider: "claude-cli", label: "text CLI · 2 turns", pace: proto(14, "script on the text CLI"), fallback: SEAT },
      { via: "router", provider: "google", label: "Gemini · script", pace: proto(6, "script on Gemini") },
    ],
  },
  words: {
    unitNoun: "turn",
    route: { medium: "text", capability: "reason/mv-metadata" },
    producer: "words",
    options: [
      { via: "router", provider: "claude-cli", label: "text CLI · title + description", pace: proto(3, "words on the text CLI"), fallback: SEAT },
      { via: "router", provider: "google", label: "Gemini", pace: proto(1, "words on Gemini") },
    ],
  },
  frames: {
    unitNoun: "plate",
    route: { medium: "image", capability: "generate" },
    producer: "frames",
    options: [
      {
        via: "local",
        provider: "comfy",
        model: "flux-2-dev-fp8",
        lane: "gpu.local",
        label: "Flux 2 dev fp8 · ComfyUI",
        pace: { secondsPerUnit: 96, src: "illustrative", note: "prototype model.js estimate.forge: ~1.6 min a plate, marked illustrative there" },
        usd: LOCAL_FREE,
      },
      { via: "router", provider: "google", label: "Nano Banana", usage: { unit: "image", perUnit: 1, size: "1K" } },
      { via: "router", provider: "leonardo", label: "Leonardo · image", usage: { unit: "image", perUnit: 1 } },
      { via: "router", provider: "agy", label: "agy · image", pace: proto(0.5, "assumed alike Leonardo; agy declares no pace"), usage: { unit: "image", perUnit: 1 } },
    ],
  },
  still: {
    unitNoun: "still",
    route: { medium: "image", capability: "generate" },
    producer: "still",
    options: [
      { via: "router", provider: "leonardo-studio", label: "Leonardo · CDP", usage: { unit: "image", perUnit: 1 }, fallback: STUDIO_CREDITS },
      { via: "router", provider: "google", label: "Nano Banana", pace: proto(0.4, "still on Nano Banana"), usage: { unit: "image", perUnit: 1, size: "1K" } },
      { via: "router", provider: "leonardo", label: "Leonardo · image", usage: { unit: "image", perUnit: 1 } },
      { via: "router", provider: "agy", label: "agy · image", pace: proto(0.5, "assumed alike Leonardo; agy declares no pace"), usage: { unit: "image", perUnit: 1 } },
      {
        via: "local",
        provider: "comfy",
        model: "flux-2-dev-fp8",
        lane: "gpu.local",
        label: "Flux 2 dev fp8",
        pace: { secondsPerUnit: 96, src: "illustrative", note: "prototype model.js estimate.forge: ~1.6 min a plate, marked illustrative there" },
        usd: LOCAL_FREE,
      },
    ],
  },
  motion: {
    unitNoun: "shot",
    route: { medium: "video", capability: "image-to-video" },
    producer: "motion",
    options: [
      { via: "router", provider: "wan", label: "Wan 2.2 · i2v", fallback: LOCAL_FREE },
      { via: "router", provider: "strips", capability: "strip-render", label: "strips · HTML/SVG 240f", fallback: STRIPS_SEAT },
    ],
  },
  score: {
    unitNoun: "prompt",
    route: { medium: "audio", capability: "music" },
    producer: "score",
    options: [
      { via: "router", provider: "suno", label: "Suno v6 · serial", producer: "suno", fallback: SUNO_CREDITS },
      { via: "router", provider: "elevenlabs", label: "ElevenLabs · music", pace: proto(1.5, "score on ElevenLabs music"), usage: { unit: "audio-second", perUnit: 120 } },
    ],
  },
  track: {
    unitNoun: "prompt",
    route: { medium: "audio", capability: "music" },
    producer: "suno",
    options: [
      { via: "router", provider: "suno", label: "Suno v6 + v6-wild · serial", fallback: SUNO_CREDITS },
      { via: "router", provider: "elevenlabs", label: "ElevenLabs · music", producer: "score", pace: proto(1.5, "score on ElevenLabs music"), usage: { unit: "audio-second", perUnit: 120 } },
    ],
  },
  sfx: {
    unitNoun: "clip",
    route: { medium: "audio", capability: "sfx" },
    producer: "sfx",
    options: [{ via: "router", provider: "elevenlabs", label: "ElevenLabs · sfx", pace: proto(1, "an sfx clip, assumed under music's 1.5"), usage: { unit: "audio-second", perUnit: 10 } }],
  },
  voice: {
    unitNoun: "take",
    producer: "voice",
    options: [
      {
        via: "local",
        provider: "elevenlabs-voice",
        model: "elevenlabs-voice",
        lane: "cloud.elevenlabs",
        label: "ElevenLabs · voice",
        pace: proto(2, "voice on ElevenLabs"),
        usd: { unpriced: "no voice model or price is declared in v1; the router lists ElevenLabs voice with no capability" },
      },
      {
        via: "local",
        provider: "local-tts",
        model: "local-tts",
        lane: "seat.text",
        label: "local TTS",
        pace: proto(5, "local TTS"),
        usd: { unpriced: "no local TTS engine is declared in v1; nothing to price until one is" },
      },
    ],
  },
  article: {
    unitNoun: "run",
    producer: "article",
    options: [
      {
        via: "local",
        provider: "articles",
        model: "lib/articles-4-model-critique",
        lane: "seat.text",
        label: "lib/articles · 4-model critique",
        pace: proto(38, "an article run"),
        usd: {
          perUnit: 70,
          range: [47, 92],
          src: "real",
          note: "observed reported spend of article runs, $47-92, median $70 (lib/articles/loop.ts DEFAULT_EST_RUN_USD, 2026-10)",
          measuredAt: "2026-10",
        },
      },
    ],
  },
  strips: {
    unitNoun: "card",
    route: { medium: "video", capability: "strip-render" },
    producer: "strips",
    options: [{ via: "router", provider: "strips", label: "strips · HTML/SVG 240f", fallback: STRIPS_SEAT }],
  },
  render: {
    unitNoun: "encode",
    route: { medium: "video", capability: "encode" },
    producer: "mv",
    options: [
      { via: "router", provider: "ffmpeg", label: "libx264 · full encode", fallback: LOCAL_FREE },
      { via: "local", provider: "ffmpeg", model: "libx264-draft", lane: "box.render", label: "libx264 · draft preset", pace: proto(9, "a draft encode"), usd: LOCAL_FREE },
    ],
  },
  cut: {
    unitNoun: "cut",
    route: { medium: "video", capability: "composite" },
    producer: "cut",
    options: [{ via: "router", provider: "ffmpeg", label: "ffmpeg · compositor", fallback: LOCAL_FREE }],
  },
  extract: {
    unitNoun: "source",
    producer: "extract",
    options: [
      {
        via: "local",
        provider: "google",
        model: "gemini-3.1-flash-image",
        lane: "cloud.google",
        label: "Nano Banana · read back + replicate",
        pace: proto(1, "assumed: one read, a replica and a transfer per source"),
        usd: { perUnit: 0.135, src: "model", note: "v1 extract --dry worst case: three generations a source at $0.045 (lib/foundry/extract)" },
      },
    ],
  },
  forge: {
    unitNoun: "plate",
    producer: "forge",
    options: [
      {
        via: "local",
        provider: "comfy",
        model: "flux-2-dev-fp8",
        lane: "gpu.local",
        label: "Flux 2 dev fp8 · ComfyUI",
        pace: { secondsPerUnit: 96, src: "illustrative", note: "prototype model.js estimate.forge: ~1.6 min a plate, marked illustrative there" },
        usd: LOCAL_FREE,
      },
    ],
  },
  dojo: {
    unitNoun: "cycle",
    producer: "dojo",
    options: [
      {
        via: "local",
        provider: "google",
        model: "gemini-3.1-flash-image",
        lane: "cloud.google",
        label: "Nano Banana · Gemini judge",
        pace: proto(20, "`Dojo · 2 cycles` drawn at 40 min"),
        usd: { unpriced: "a Dojo cycle's render count is set by its gen-spec, unknown until the cycle is planned; the judge calls Gemini unmetered (pipeline/foundry/dojo_judge.py)" },
      },
      {
        via: "local",
        provider: "comfy",
        model: "flux-2-dev-fp8",
        lane: "gpu.local",
        label: "Flux 2 dev fp8 · local pairs",
        pace: proto(20, "a local cycle assumed alike"),
        usd: LOCAL_FREE,
      },
    ],
  },
};

/** The Floor composer's media lane -> the recipe a launch runs (prototype index.html laneOfMedia). */
export const COMPOSER_RECIPE: Readonly<Record<"image" | "article" | "audio" | "video", { readonly music?: string; readonly sfx?: string; readonly recipe: string }>> = {
  image: { recipe: "style/forge-sweep" },
  article: { recipe: "article/post" },
  audio: { recipe: "track/music", music: "track/music", sfx: "track/sfx" },
  video: { recipe: "strips/edu" },
};
