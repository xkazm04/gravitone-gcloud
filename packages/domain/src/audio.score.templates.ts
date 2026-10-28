import {
  INSTRUMENT_CATALOG,
  SCORE_KEYS,
  SCORE_SPEC_VERSION,
  type ScoreControls,
  type ScoreKey,
  type ScoreRole,
  type ScoreSpec,
  type StyleTemplateId,
} from "./audio.score.ts";
import type { TriageContext } from "./audio.triage.ts";

// WORKED SCORE EXAMPLES & SEED COMPILER (A1, D6, C6) - pure deterministic compilation from
// plain non-musician controls or a recipe Seed into a closed ScoreSpec, plus exact ground-truth
// timing and section boundaries for triage verification.

export const TAIL_SILENCE_S = 0.5;

export function scoreBarSeconds(tempoBpm: number): number {
  return 240 / tempoBpm;
}

export function scoreTotalBars(spec: Pick<ScoreSpec, "sections">): number {
  return spec.sections.reduce((acc, s) => acc + s.bars, 0);
}

/** Exact expected audio length in seconds (bar duration + non-loop tail silence). */
export function scoreDurationS(spec: Pick<ScoreSpec, "tempoBpm" | "sections" | "loop">): number {
  const bodyS = scoreTotalBars(spec) * scoreBarSeconds(spec.tempoBpm);
  return Math.round((bodyS + (spec.loop === true ? 0 : TAIL_SILENCE_S)) * 10000) / 10000;
}

/** Exact planned section boundaries in milliseconds for @gt/domain/audio.triage. */
export function scoreSectionsMs(spec: Pick<ScoreSpec, "tempoBpm" | "sections">): readonly { readonly name: string; readonly startMs: number; readonly endMs: number }[] {
  const barS = scoreBarSeconds(spec.tempoBpm);
  let atBar = 0;
  return spec.sections.map((s) => {
    const startMs = Math.round(atBar * barS * 1000);
    atBar += s.bars;
    const endMs = Math.round(atBar * barS * 1000);
    return { name: s.name, startMs, endMs };
  });
}

/** Ground-truth TriageContext derived directly from a ScoreSpec. */
export function triageContextFromScore(spec: ScoreSpec): TriageContext {
  const sections = scoreSectionsMs(spec);
  return {
    kind: "music",
    durationS: scoreDurationS(spec),
    tempoBpm: spec.tempoBpm,
    ...(spec.loop === undefined ? {} : { loop: spec.loop }),
    ...(sections.length >= 2 ? { sections: [...sections] } : {}),
  };
}

export type StyleTemplateMeta = {
  readonly id: StyleTemplateId;
  readonly label: string;
  readonly plainIntent: string;
  readonly spec: ScoreSpec;
};

export const WORKED_SCORE_TEMPLATES: readonly StyleTemplateMeta[] = [
  {
    id: "chill-hiphop",
    label: "Chill Lo-Fi Groove",
    plainIntent: "Relaxed head-nod beat with warm electric keys and thumb bell",
    spec: {
      v: SCORE_SPEC_VERSION,
      title: "Midnight Study Loop",
      style: "chill-hiphop",
      seed: 108,
      tempoBpm: 84,
      key: "A minor",
      loop: false,
      controls: { density: 0.55, brightness: 0.45, lift: 0.7, swing: 0.18, humanise: 0.35 },
      sections: [
        { name: "intro", bars: 2, energy: 0.35, progression: [0, 5, 3, 4] },
        { name: "lift", bars: 4, energy: 0.85, progression: [0, 5, 2, 6] },
        { name: "outro", bars: 2, energy: 0.4, progression: [0, 3, 4, 0] },
      ],
      tracks: [
        { role: "drums", instrument: "kit-808-warm", gainDb: -1.5, pan: 0, pattern: "boom-bap" },
        { role: "bass", instrument: "vital-sub-bass", gainDb: -2.0, pan: 0, pattern: "root-fifth" },
        {
          role: "chords",
          instrument: "sample-lofi-keys",
          gainDb: -3.0,
          pan: -0.1,
          pattern: "warm-voicing",
          fx: { v: 1, stages: [{ kind: "highpass", hz: 140 }, { kind: "chorus", rateHz: 0.8, depth: 0.25, mix: 0.25 }] },
        },
        {
          role: "lead",
          instrument: "sample-ikembe-bell",
          gainDb: -3.5,
          pan: 0.12,
          pattern: "call-response",
          fx: { v: 1, stages: [{ kind: "highpass", hz: 220 }, { kind: "reverb", roomSize: 0.45, damping: 0.5, wet: 0.22, dry: 0.85, width: 0.8 }] },
        },
      ],
    },
  },
  {
    id: "calm-bed",
    label: "Calm Narrative Bed",
    plainIntent: "Soft felt piano and warm pad with gentle lift in the middle",
    spec: {
      v: SCORE_SPEC_VERSION,
      title: "Quiet Horizon Bed",
      style: "calm-bed",
      seed: 42,
      tempoBpm: 92,
      key: "C major",
      loop: false,
      controls: { density: 0.4, brightness: 0.5, lift: 0.75, swing: 0.05, humanise: 0.25 },
      sections: [
        { name: "intro", bars: 2, energy: 0.3, progression: [0, 5, 3, 4] },
        { name: "lift", bars: 4, energy: 0.82, progression: [5, 3, 0, 4] },
        { name: "outro", bars: 2, energy: 0.32, progression: [3, 4, 0, 0] },
      ],
      tracks: [
        { role: "drums", instrument: "kit-acoustic-brush", gainDb: -3.0, pan: 0, pattern: "gentle-pulse" },
        { role: "bass", instrument: "sample-mamas-bass", gainDb: -2.5, pan: 0, pattern: "warm-anchor" },
        {
          role: "chords",
          instrument: "sample-felt-piano",
          gainDb: -2.0,
          pan: -0.08,
          pattern: "arpeggio-bed",
          fx: { v: 1, stages: [{ kind: "highpass", hz: 120 }, { kind: "reverb", roomSize: 0.55, damping: 0.6, wet: 0.25, dry: 0.85, width: 0.75 }] },
        },
        {
          role: "lead",
          instrument: "vital-glass-lead",
          gainDb: -4.0,
          pan: 0.1,
          pattern: "sparse-motif",
          fx: { v: 1, stages: [{ kind: "highpass", hz: 250 }, { kind: "delay", delayS: 0.32, feedback: 0.25, mix: 0.18 }] },
        },
      ],
    },
  },
  {
    id: "synthwave-pulse",
    label: "Midnight Synth Pulse",
    plainIntent: "Driving electronic pulse with Vital analog bass and synth pluck",
    spec: {
      v: SCORE_SPEC_VERSION,
      title: "Neon Grid Runner",
      style: "synthwave-pulse",
      seed: 777,
      tempoBpm: 112,
      key: "D minor",
      loop: false,
      controls: { density: 0.7, brightness: 0.72, lift: 0.8, swing: 0.0, humanise: 0.12 },
      sections: [
        { name: "intro", bars: 2, energy: 0.35, progression: [0, 5, 6, 4] },
        { name: "lift", bars: 4, energy: 0.9, progression: [0, 2, 5, 6] },
        { name: "outro", bars: 2, energy: 0.38, progression: [5, 6, 0, 0] },
      ],
      tracks: [
        { role: "drums", instrument: "kit-909-pulse", gainDb: -1.0, pan: 0, pattern: "four-floor" },
        { role: "bass", instrument: "vital-pulse-bass", gainDb: -1.8, pan: 0, pattern: "eighth-drive" },
        {
          role: "chords",
          instrument: "vital-warm-pad",
          gainDb: -3.2,
          pan: -0.1,
          pattern: "wide-pad",
          fx: { v: 1, stages: [{ kind: "highpass", hz: 160 }, { kind: "chorus", rateHz: 1.1, depth: 0.3, mix: 0.3 }] },
        },
        {
          role: "lead",
          instrument: "vital-pluck-lead",
          gainDb: -2.8,
          pan: 0.1,
          pattern: "arp-lead",
          fx: { v: 1, stages: [{ kind: "highpass", hz: 240 }, { kind: "delay", delayS: 0.27, feedback: 0.3, mix: 0.2 }] },
        },
      ],
    },
  },
  {
    id: "warm-acoustic",
    label: "Sunlight Acoustic Sketch",
    plainIntent: "Bright acoustic piano and plucked mallet guitar with finger bass",
    spec: {
      v: SCORE_SPEC_VERSION,
      title: "Morning Workshop",
      style: "warm-acoustic",
      seed: 204,
      tempoBpm: 104,
      key: "G major",
      loop: false,
      controls: { density: 0.58, brightness: 0.65, lift: 0.68, swing: 0.08, humanise: 0.28 },
      sections: [
        { name: "intro", bars: 2, energy: 0.35, progression: [0, 4, 5, 3] },
        { name: "lift", bars: 4, energy: 0.85, progression: [0, 5, 3, 4] },
        { name: "outro", bars: 2, energy: 0.36, progression: [3, 4, 0, 0] },
      ],
      tracks: [
        { role: "drums", instrument: "kit-acoustic-brush", gainDb: -2.0, pan: 0, pattern: "studio-groove" },
        { role: "bass", instrument: "sample-mamas-bass", gainDb: -2.2, pan: 0, pattern: "walking-root" },
        { role: "chords", instrument: "sample-grand-piano", gainDb: -2.5, pan: -0.1, pattern: "open-chords" },
        { role: "lead", instrument: "sample-mallet-guitar", gainDb: -3.0, pan: 0.12, pattern: "plucked-hook" },
      ],
    },
  },
] as const;

export const WORKED_SCORE_SPECS: readonly ScoreSpec[] = WORKED_SCORE_TEMPLATES.map((t) => t.spec);

export function templateById(id: StyleTemplateId): StyleTemplateMeta {
  return WORKED_SCORE_TEMPLATES.find((t) => t.id === id) ?? WORKED_SCORE_TEMPLATES[0]!;
}

const matchKey = (raw: string | null | undefined, fallback: ScoreKey): ScoreKey => {
  if (!raw) return fallback;
  const norm = raw.trim().toLowerCase();
  return SCORE_KEYS.find((k) => k.toLowerCase() === norm) ?? fallback;
};

/** Compile a /audio Seed plus optional non-musician steering controls into a closed ScoreSpec. */
export function compileSeedToScore(
  seedIn: {
    readonly genres?: readonly string[];
    readonly moods?: readonly string[];
    readonly instruments?: readonly string[];
    readonly bpm?: number | null;
    readonly key?: string | null;
  },
  opts: {
    readonly title?: string;
    readonly templateId?: StyleTemplateId;
    readonly seedNumber?: number;
    readonly controls?: Partial<ScoreControls>;
    readonly roleInstruments?: Partial<Record<ScoreRole, string>>;
    readonly loop?: boolean;
  } = {},
): ScoreSpec {
  const words = [...(seedIn.genres ?? []), ...(seedIn.moods ?? []), ...(seedIn.instruments ?? [])].join(" ").toLowerCase();
  const inferredStyle: StyleTemplateId =
    opts.templateId ??
    (words.includes("synth") || words.includes("electro") || words.includes("techno") || words.includes("cyber")
      ? "synthwave-pulse"
      : words.includes("calm") || words.includes("ambient") || words.includes("quiet") || words.includes("bed")
        ? "calm-bed"
        : words.includes("acoustic") || words.includes("folk") || words.includes("guitar") || words.includes("bright")
          ? "warm-acoustic"
          : "chill-hiphop");
  const base = templateById(inferredStyle).spec;
  const bpm = seedIn.bpm !== null && seedIn.bpm !== undefined && Number.isFinite(seedIn.bpm) ? Math.max(40, Math.min(220, Math.round(seedIn.bpm))) : base.tempoBpm;
  const key = matchKey(seedIn.key, base.key);
  const controls: ScoreControls = {
    density: opts.controls?.density ?? base.controls.density,
    brightness: opts.controls?.brightness ?? base.controls.brightness,
    lift: opts.controls?.lift ?? base.controls.lift,
    swing: opts.controls?.swing ?? base.controls.swing,
    humanise: opts.controls?.humanise ?? base.controls.humanise,
  };
  const pickForRole = (role: ScoreRole, defaultId: string): string => {
    const explicit = opts.roleInstruments?.[role];
    if (explicit) {
      const hit = INSTRUMENT_CATALOG.find((c) => c.id === explicit && c.role === role && c.audition.status === "ready");
      if (hit) return hit.id;
    }
    for (const w of seedIn.instruments ?? []) {
      const wl = w.trim().toLowerCase();
      const hit = INSTRUMENT_CATALOG.find(
        (c) => c.role === role && c.audition.status === "ready" && (c.name.toLowerCase().includes(wl) || c.plainLabel.toLowerCase().includes(wl)),
      );
      if (hit) return hit.id;
    }
    return defaultId;
  };
  return {
    ...base,
    title: opts.title?.trim() ? opts.title.trim().slice(0, 120) : base.title,
    style: inferredStyle,
    seed: opts.seedNumber ?? base.seed,
    tempoBpm: bpm,
    key,
    loop: opts.loop ?? base.loop ?? false,
    controls,
    tracks: base.tracks.map((tr) => ({
      ...tr,
      instrument: pickForRole(tr.role, tr.instrument),
    })),
  };
}
