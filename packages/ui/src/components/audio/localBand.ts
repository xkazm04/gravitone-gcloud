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
