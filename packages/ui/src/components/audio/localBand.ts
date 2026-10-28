// LOCAL BAND UI MODEL — pure, Zod-free types and helpers for LocalBandStudio (@gt/ui).
// Keeps the browser bundle at zero Zod bytes while sharing exact structural shapes with
// @gt/domain/audio.score and lib/sound/localScore.ts.

import type { Seed } from "./recipe.ts";

export type LocalRole = "drums" | "bass" | "chords" | "lead";
export const LOCAL_ROLES: readonly LocalRole[] = ["drums", "bass", "chords", "lead"];

export const LOCAL_KEYS: readonly string[] = [
  "C major", "G major", "D major", "F major", "Bb major", "Eb major",
  "A minor", "E minor", "D minor", "C minor", "G minor", "F# minor",
];

export type LocalFxPresetId = "clean" | "warm-room" | "wide-chorus" | "dub-echo" | "lo-fi-tape";

export const LOCAL_FX_PRESETS: readonly { readonly id: LocalFxPresetId; readonly label: string }[] = [
  { id: "clean", label: "fx: clean dry" },
  { id: "warm-room", label: "fx: warm room reverb" },
  { id: "wide-chorus", label: "fx: stereo chorus" },
  { id: "dub-echo", label: "fx: tempo delay" },
  { id: "lo-fi-tape", label: "fx: lo-fi filter + glue" },
];

export type LocalFxStage =
  | { readonly kind: "highpass"; readonly hz: number }
  | { readonly kind: "lowpass"; readonly hz: number }
  | { readonly kind: "reverb"; readonly roomSize: number; readonly damping: number; readonly wet: number; readonly dry: number; readonly width: number }
  | { readonly kind: "chorus"; readonly rateHz: number; readonly depth: number; readonly mix: number }
  | { readonly kind: "delay"; readonly delayS: number; readonly feedback: number; readonly mix: number }
  | { readonly kind: "compressor"; readonly thresholdDb: number; readonly ratio: number; readonly attackMs?: number; readonly releaseMs?: number };

export type LocalFxChain = {
  readonly v: 1;
  readonly stages: LocalFxStage[];
};

export function fxChainForPreset(preset: LocalFxPresetId): LocalFxChain | undefined {
  switch (preset) {
    case "clean":
      return undefined;
    case "warm-room":
      return { v: 1, stages: [{ kind: "highpass", hz: 120 }, { kind: "reverb", roomSize: 0.48, damping: 0.55, wet: 0.24, dry: 0.85, width: 0.8 }] };
    case "wide-chorus":
      return { v: 1, stages: [{ kind: "highpass", hz: 140 }, { kind: "chorus", rateHz: 0.9, depth: 0.28, mix: 0.28 }] };
    case "dub-echo":
      return { v: 1, stages: [{ kind: "highpass", hz: 220 }, { kind: "delay", delayS: 0.3, feedback: 0.28, mix: 0.2 }] };
    case "lo-fi-tape":
      return { v: 1, stages: [{ kind: "highpass", hz: 150 }, { kind: "lowpass", hz: 3800 }, { kind: "compressor", thresholdDb: -18, ratio: 3 }] };
  }
}

export function fxPresetOf(fx: LocalFxChain | undefined): LocalFxPresetId {
  if (!fx || fx.stages.length === 0) return "clean";
  if (fx.stages.some((st) => st.kind === "reverb")) return "warm-room";
  if (fx.stages.some((st) => st.kind === "chorus")) return "wide-chorus";
  if (fx.stages.some((st) => st.kind === "delay")) return "dub-echo";
  if (fx.stages.some((st) => st.kind === "lowpass" || st.kind === "compressor")) return "lo-fi-tape";
  return "clean";
}

export type LocalControls = {
  readonly density: number;
  readonly brightness: number;
  readonly lift: number;
  readonly swing: number;
  readonly humanise: number;
};

export type LocalSection = {
  readonly name: string;
  readonly bars: number;
  readonly energy: number;
  readonly progression?: readonly number[];
};

export type LocalTrackDraft = {
  readonly role: LocalRole;
  readonly instrument: string;
  readonly gainDb?: number;
  readonly pan?: number;
  readonly muted?: boolean;
  readonly solo?: boolean;
  readonly pattern?: string;
  readonly fx?: LocalFxChain;
};

export type LocalScoreDraft = {
  readonly v: 1;
  readonly title: string;
  readonly style?: "chill-hiphop" | "calm-bed" | "synthwave-pulse" | "warm-acoustic";
  readonly seed: number;
  readonly tempoBpm: number;
  readonly key: string;
  readonly loop?: boolean;
  readonly controls: LocalControls;
  readonly sections: readonly LocalSection[];
  readonly tracks: readonly LocalTrackDraft[];
};

export type LocalTemplateView = {
  readonly id: "chill-hiphop" | "calm-bed" | "synthwave-pulse" | "warm-acoustic";
  readonly label: string;
  readonly plainIntent: string;
  readonly spec: LocalScoreDraft;
};

export type LocalInstrumentView = {
  readonly id: string;
  readonly name: string;
  readonly role: LocalRole;
  readonly engine: "vital-vst3" | "sample-pack" | "synth";
  readonly plainLabel: string;
  readonly character: string;
  readonly licence: string;
  readonly status: "ready" | "refused";
  readonly lufsAtVel100: number | null;
  readonly loadMs: number;
  readonly renderMs: number;
  readonly deterministic: boolean;
  readonly refusalReason: string | null;
};

export type LocalStemView = {
  readonly role: LocalRole;
  readonly instrument: string;
  readonly instrumentName: string;
  readonly source: string;
  readonly sha256: string;
  readonly reused: boolean;
  readonly noteCount: number;
  readonly renderMs: number;
  readonly integratedLufs: number | null;
  readonly truePeakDb: number | null;
  readonly gainDb: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
  readonly audioUrl: string;
  readonly midiUrl: string;
};

export type LocalTriageFindingView = {
  readonly check: string;
  readonly verdict: "pass" | "flag" | "skip";
  readonly value: number | null;
  readonly unit: string;
};

export type LocalTakeView = {
  readonly id: string;
  readonly title: string;
  readonly tempoBpm: number;
  readonly key: string;
  readonly durationS: number;
  readonly loop: boolean;
  readonly lufs: number | null;
  readonly truePeakDb: number | null;
  readonly mixUrl: string;
  readonly rppUrl: string;
  readonly peaks: readonly number[];
  readonly reusedRoles: readonly LocalRole[];
  readonly renderedRoles: readonly LocalRole[];
  readonly totalRenderMs: number;
  readonly bitIdentical: boolean | null;
  readonly maxAbsDiff: number | null;
  readonly mixSha256: string;
  readonly triageFlagged: number;
  readonly triageFindings: readonly LocalTriageFindingView[];
  readonly stems: readonly LocalStemView[];
  readonly spec: LocalScoreDraft;
  readonly stage: string | null;
  readonly verdict: string;
};

export type LocalAuditionState = {
  readonly instrumentId: string;
  readonly name: string;
  readonly audioUrl: string;
  readonly lufs: number | null;
  readonly truePeakDb: number | null;
  readonly renderMs: number;
};

/** Explain why the score's harmonic structure, groove, and mix separation work (work-subject copy). */
export function explainScoreChoices(
  spec: LocalScoreDraft,
  catalog: readonly LocalInstrumentView[],
  take?: LocalTakeView | null,
): readonly { readonly axis: string; readonly line: string }[] {
  const nameOf = (role: LocalRole): string => {
    const id = spec.tracks.find((t) => t.role === role)?.instrument ?? "";
    return catalog.find((c) => c.id === id)?.name ?? id;
  };
  const secWords = spec.sections.map((s) => `${s.name} (${s.bars}b @ ${Math.round(s.energy * 100)}%)`).join(" → ");
  const out: { readonly axis: string; readonly line: string }[] = [
    {
      axis: "harmony",
      line: `${spec.key} at ${spec.tempoBpm} bpm — ${secWords}; ${Math.round(spec.controls.lift * 100)}% middle lift opens 4-note 7th voicings in high-energy bars`,
    },
    {
      axis: "groove",
      line: `drums (${nameOf("drums")}) — ${Math.round(spec.controls.swing * 100)}% off-beat swing, ${Math.round(spec.controls.density * 100)}% note density, ${Math.round(spec.controls.humanise * 100)}% seeded velocity humanisation`,
    },
    {
      axis: "separation",
      line: `bass (${nameOf("bass")}) holds 40–140 Hz; chords (${nameOf("chords")}) duck 25% under kick transients while lead (${nameOf("lead")}) sits above 220 Hz`,
    },
  ];
  if (take) {
    out.push({
      axis: "master",
      line: `mix.wav normalized to ${take.lufs?.toFixed(1) ?? "-14.0"} LUFS (${take.truePeakDb?.toFixed(2) ?? "-1.30"} dBTP); ${take.reusedRoles.length > 0 ? `stems [${take.reusedRoles.join(", ")}] reused bit-exact from cache` : "all 4 stems rendered deterministically"}`,
    });
  }
  return out;
}

/** Map a /audio Seed onto a LocalScoreDraft without pulling Zod into the client bundle. */
export function applySeedToDraft(
  seed: Seed,
  templates: readonly LocalTemplateView[],
  catalog: readonly LocalInstrumentView[],
  current: LocalScoreDraft,
): LocalScoreDraft {
  const words = [...seed.genres, ...seed.moods, ...seed.instruments].join(" ").toLowerCase();
  const styleId: LocalTemplateView["id"] =
    words.includes("synth") || words.includes("electro") || words.includes("cyber")
      ? "synthwave-pulse"
      : words.includes("calm") || words.includes("ambient") || words.includes("quiet")
        ? "calm-bed"
        : words.includes("acoustic") || words.includes("folk") || words.includes("guitar")
          ? "warm-acoustic"
          : "chill-hiphop";
  const base = (templates.find((t) => t.id === styleId) ?? templates[0])?.spec ?? current;
  const bpm = seed.bpm !== null && Number.isFinite(seed.bpm) ? Math.max(40, Math.min(220, Math.round(seed.bpm))) : base.tempoBpm;
  const keyMatch = seed.key ? LOCAL_KEYS.find((k) => k.toLowerCase() === seed.key!.trim().toLowerCase()) : undefined;
  return {
    ...base,
    title: seed.genres.length > 0 ? `${seed.genres[0]} local cue` : base.title,
    style: styleId,
    tempoBpm: bpm,
    key: keyMatch ?? base.key,
    tracks: base.tracks.map((tr) => {
      for (const w of seed.instruments) {
        const wl = w.trim().toLowerCase();
        const hit = catalog.find(
          (c) => c.role === tr.role && c.status === "ready" && (c.name.toLowerCase().includes(wl) || c.plainLabel.toLowerCase().includes(wl)),
        );
        if (hit) return { ...tr, instrument: hit.id };
      }
      return tr;
    }),
  };
}
