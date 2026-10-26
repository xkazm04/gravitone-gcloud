import type { MediumTable, Pace, RouterMedium } from "./types.ts";

// THE CAPABILITY TABLES - who can do what, in which posture, in what order.
// Data only; route.ts is the one function that reads them.
//
// IMAGE and TEXT are v1's tables, moved faithfully: lib/imaging/router.ts PLAN
// and providers/*.ts `capabilities` / `supportsReferences`, lib/text/router.ts
// PLAN and RETRIEVE_PLAN. Their orders are measurements and operator rulings,
// and the reasons stay with them:
//   - image dev generate leads with agy, then Google, then Leonardo: the 60-cell
//     style grid found Google $0.052 per USABLE plate against Leonardo's $0.110
//     although Leonardo renders cheaper (lib/imaging/router.ts PLAN).
//   - image dev recognize is the local eye first; Qwen cloud was removed from the
//     plan by the operator (2026-09-01) - "a cloud rung nobody wants billed is
//     not a fallback, it is a surprise". Its candidate stays, reachable by pin.
//   - prod is Google throughout: one vendor, one style-lock mechanism.
//   - text `probe` is single-entry: a health check that walks a chain reports
//     the chain's health, not the engine's.
//   - text cloud lists no CLI: a structurally impossible candidate in every
//     trail is noise that teaches a reader to stop reading trails.
//
// AUDIO and VIDEO are the providers the prototype names (docs/next/prototype/app
// studio.js LANES and CATALOG), with capabilities only where v1 declares them:
//   Suno v6           lib/suno (create from fields), driven in Chrome on the render box
//   ElevenLabs        lib/capabilities.ts musicGenerate / musicSectionEdit / musicSfx
//   "local TTS",      named by the prototype, declared by nothing in v1: listed with
//   ElevenLabs voice  no capability, so a pin to them is refused `unsupported`
//   Wan 2.2 i2v       lib/capabilities.ts localVideoRender (pipeline/video, ComfyUI)
//   strips            pipeline/strips/run.mts, the HTML/SVG card renderer
//   ffmpeg            lib/capabilities.ts localRender (cut export, MV export)
// Their hosted columns are empty: v1's HOSTED_CAPS switches every one of these
// off in a hosted deployment, and an empty row is that absence, refused with a
// sentence instead of a button that answers 503.
//
// PACE is the prototype's per-unit minutes, all marked illustrative there and
// here; a candidate with no pace has an unknown duration, never a zero one.

const proto = (minutes: number, what: string): Pace => ({
  secondsPerUnit: Math.round(minutes * 60),
  basis: "illustrative",
  source: `prototype studio.js CATALOG: ${what}, ${minutes} min per unit, marked illustrative`,
});

export const IMAGE_TABLE: MediumTable = {
  medium: "image",
  candidates: [
    {
      provider: "agy",
      capabilities: ["generate"],
      lane: "seat.text",
      transport: "local-binary",
      honours: [],
      models: { generate: "agy-image-generator" },
      bills: { generate: "image" },
      credential: "the `agy` CLI, installed and authenticated (presence-probed)",
    },
    {
      provider: "google",
      capabilities: ["generate", "edit", "recognize"],
      lane: "cloud.google",
      transport: "cloud",
      honours: ["references"],
      models: { generate: "gemini-3.1-flash-image", edit: "gemini-3.1-flash-image", recognize: "gemini-3.6-flash" },
      bills: { generate: "image", edit: "image" },
      pace: { generate: proto(0.35, "frames on Nano Banana") },
      credential: "GOOGLE_AI_API_KEY",
    },
    {
      provider: "leonardo",
      capabilities: ["generate"],
      lane: "cloud.leonardo",
      transport: "cloud",
      honours: [],
      models: { generate: "lucid-origin" },
      bills: { generate: "image" },
      pace: { generate: proto(0.5, "frames on Leonardo image") },
      credential: "LEONARDO_API_KEY",
    },
    {
      provider: "qwen",
      capabilities: ["recognize"],
      lane: "cloud.qwen",
      transport: "cloud",
      honours: [],
      models: { recognize: "qwen3.8-max" },
      credential: "QWEN_API_KEY",
    },
    {
      provider: "ollama",
      capabilities: ["recognize"],
      lane: "gpu.local",
      transport: "local-daemon",
      honours: [],
      models: { recognize: "qwen3.8:27b" },
      bills: { recognize: "image" },
      credential: "OLLAMA_HOST",
    },
    {
      provider: "leonardo-studio",
      capabilities: ["generate"],
      lane: "box.chrome",
      transport: "browser",
      honours: [],
      preferOnly: true,
      models: { generate: "openai/gpt-image-2.5-sunburst" },
      bills: { generate: "image" },
      pace: { generate: proto(3, "still on Leonardo over CDP") },
      credential: "LEONARDO_STUDIO_CDP",
    },
    {
      // GPT Image 2.5 Flare over the API key (lib/imaging/providers/leonardoFlare.ts):
      // /scout's stills, by the operator's ruling of 2026-10-22. Prefer-only, so no
      // plan row moved for it; LOW at the API's smallest sizes is the adapter's only setting.
      provider: "leonardo-flare",
      capabilities: ["generate"],
      lane: "cloud.leonardo",
      transport: "cloud",
      honours: [],
      preferOnly: true,
      models: { generate: "openai/gpt-image-2.5-flare" },
      bills: { generate: "image" },
      credential: "LEONARDO_API_KEY",
    },
  ],
  plans: {
    dev: { generate: ["agy", "google", "leonardo"], edit: ["google"], recognize: ["ollama", "google"] },
    prod: { generate: ["google"], edit: ["google"], recognize: ["google"] },
  },
};

/** lib/text/types.ts TurnClass, the closed vocabulary turns route and bill by
 *  (mirrored in .ai/use-cases.json; a public enum, plan §5.5). */
export const TURN_CLASSES = [
  "edit-plan",
  "compose",
  "scene-direction",
  "style-synthesis",
  "research",
  "sound-hunt",
  "sound-lesson",
  "suno-propose",
  "suno-riff",
  "mv-treatment",
  "mv-metadata",
  "ad-ideas",
  "ad-scenarios",
  "repair",
  "draft",
  "probe",
] as const;
export type TurnClass = (typeof TURN_CLASSES)[number];

/** lib/text/providers/google.ts MODEL_FOR_TURN: the pro model where a turn
 *  authors a whole deliverable, flash elsewhere. */
const PLAN_CLASS: ReadonlySet<TurnClass> = new Set<TurnClass>(["edit-plan", "compose", "research", "ad-ideas"]);

const perTurn = (f: (turn: TurnClass) => readonly string[]): Record<string, readonly string[]> =>
  Object.fromEntries(TURN_CLASSES.map((turn) => [`reason/${turn}`, f(turn)]));

export const TEXT_TABLE: MediumTable = {
  medium: "text",
  candidates: [
    {
      provider: "claude-cli",
      capabilities: ["reason"],
      lane: "seat.text",
      transport: "local-binary",
      honours: [],
      models: { reason: "claude-opus-5" },
      credential: "the `claude` CLI, installed and logged in (probed)",
    },
    {
      provider: "google",
      capabilities: ["reason"],
      lane: "cloud.google",
      transport: "cloud",
      honours: [],
      models: Object.fromEntries(TURN_CLASSES.map((turn) => [`reason/${turn}`, PLAN_CLASS.has(turn) ? "gemini-3.1-pro-preview" : "gemini-3.6-flash"])),
      credential: "GOOGLE_AI_API_KEY",
    },
    {
      provider: "claude-cli-retrieve",
      capabilities: ["retrieve"],
      lane: "seat.text",
      transport: "local-binary",
      honours: [],
      models: { retrieve: "claude-opus-5" },
      credential: "the `claude` CLI, installed and logged in (probed)",
    },
    {
      // lib/text/providers/ollama.ts: the local daemon leads the `draft` turn
      // alone (spark scout-vision S6); the address is the credential.
      provider: "ollama",
      capabilities: ["reason"],
      lane: "gpu.local",
      transport: "local-daemon",
      honours: [],
      models: { "reason/draft": "qwen3.8:27b" },
      credential: "OLLAMA_HOST",
    },
  ],
  plans: {
    local: {
      ...perTurn((turn) => (turn === "probe" ? ["claude-cli"] : turn === "draft" ? ["ollama", "claude-cli"] : ["claude-cli", "google"])),
      "retrieve/research": ["claude-cli-retrieve"],
    },
    cloud: perTurn((turn) => (turn === "draft" ? ["ollama"] : ["google"])),
  },
};

export const AUDIO_TABLE: MediumTable = {
  medium: "audio",
  candidates: [
    {
      provider: "suno",
      capabilities: ["music"],
      lane: "box.chrome",
      // The driver LAUNCHES Chrome (lib/suno/browser.ts findChrome), so it is a
      // spawned binary as far as posture goes, unlike the studio's CDP attach.
      transport: "local-binary",
      honours: [],
      models: { music: "v6" },
      pace: { music: proto(4, "score on Suno v6, serial") },
      credential: "Chrome signed in to Suno on the render box (SUNO_CHROME_PATH or a standard install)",
    },
    {
      provider: "elevenlabs",
      capabilities: ["music", "section-edit", "sfx"],
      lane: "cloud.elevenlabs",
      transport: "cloud",
      honours: [],
      models: { music: "music_v2/generate", "section-edit": "music_v2/compose", sfx: "eleven_text_to_sound_v2" },
      bills: { music: "audio-second", "section-edit": "audio-second", sfx: "audio-second" },
      credential: "ELEVENLABS_API_KEY",
    },
    { provider: "elevenlabs-voice", capabilities: [], lane: "cloud.elevenlabs", transport: "cloud", honours: [], models: {}, credential: "ELEVENLABS_API_KEY" },
    { provider: "local-tts", capabilities: [], lane: "seat.text", transport: "local-binary", honours: [], models: {}, credential: "none declared in v1" },
  ],
  plans: {
    local: { music: ["suno", "elevenlabs"], "section-edit": ["elevenlabs"], sfx: ["elevenlabs"] },
    hosted: { music: [], "section-edit": [], sfx: [] },
  },
};

export const VIDEO_TABLE: MediumTable = {
  medium: "video",
  candidates: [
    {
      provider: "wan",
      capabilities: ["image-to-video"],
      lane: "gpu.local",
      transport: "local-binary",
      honours: [],
      models: { "image-to-video": "wan2.2-ti2v-5B" },
      pace: { "image-to-video": proto(6, "motion on Wan 2.2 i2v") },
      credential: "ComfyUI on this box (pipeline/video)",
    },
    {
      provider: "strips",
      capabilities: ["strip-render"],
      // On the SEAT, not the render box: a strips card-round's cost and most of its wait are the
      // author/review turns on the operator's text seat, and seat.text is the paid lane that holds
      // on a crash (decision 6); the headless capture is a short tail inside the same step.
      lane: "seat.text",
      transport: "local-binary",
      honours: [],
      models: { "strip-render": "strips-html-svg" },
      pace: {
        "strip-render": {
          secondsPerUnit: 1020,
          basis: "measured",
          source: "strips-r1, 2026-10-06, n=1: ~879 s author turn + ~142 s headless capture, about 1020 s per card-round (pipeline/strips/run.mts)",
        },
      },
      credential: "the operator's text seat (author/review turns) and headless Chromium for the capture",
    },
    {
      provider: "ffmpeg",
      capabilities: ["encode", "composite"],
      lane: "box.render",
      transport: "local-binary",
      honours: [],
      models: { encode: "libx264", composite: "ffmpeg-compositor" },
      pace: {
        encode: { secondsPerUnit: 1890, basis: "illustrative", source: "prototype model.js estimate.mv: a full libx264 encode, 31.5 min (a design report figure, not measured in this repo)" },
        composite: proto(7, "cut on the ffmpeg compositor"),
      },
      credential: "ffmpeg on the render box",
    },
  ],
  plans: {
    local: { "image-to-video": ["wan"], "strip-render": ["strips"], encode: ["ffmpeg"], composite: ["ffmpeg"] },
    hosted: { "image-to-video": [], "strip-render": [], encode: [], composite: [] },
  },
};

export const TABLES: Readonly<Record<RouterMedium, MediumTable>> = { image: IMAGE_TABLE, text: TEXT_TABLE, audio: AUDIO_TABLE, video: VIDEO_TABLE };

/**
 * What is wrong with a table, as sentences; empty when it is sound. A plan
 * entry naming no candidate, a prefer-only candidate inside a plan row (it would
 * be reachable as a fallback, the one thing prefer-only forbids), or a plan's
 * first entry lacking the row's capability are all bugs in the data, caught
 * before any request meets them.
 */
export function tableProblems(t: MediumTable): string[] {
  const out: string[] = [];
  const byId = new Map(t.candidates.map((c) => [c.provider, c]));
  if (byId.size !== t.candidates.length) out.push(`${t.medium}: a provider is declared twice`);
  for (const [env, rows] of Object.entries(t.plans)) {
    for (const [key, chain] of Object.entries(rows)) {
      const cap = key.split("/")[0] ?? key;
      const first = chain[0];
      if (first !== undefined && !(byId.get(first)?.capabilities.includes(cap) ?? false)) out.push(`${t.medium} ${env} ${key}: the first entry ${first} cannot ${cap}`);
      for (const id of chain) {
        const c = byId.get(id);
        if (c === undefined) out.push(`${t.medium} ${env} ${key}: ${id} is not a declared candidate`);
        else if (c.preferOnly === true) out.push(`${t.medium} ${env} ${key}: ${id} is prefer-only and may not sit in a plan row`);
        else if (c.models[key] === undefined && c.models[cap] === undefined) out.push(`${t.medium} ${env} ${key}: ${id} names no model for it`);
      }
    }
  }
  return out;
}
