// LOCAL BAND UI MODEL — pure, Zod-free types and helpers for LocalBandStudio (@gt/ui).
// Keeps the browser bundle at zero Zod bytes while sharing exact structural shapes with
// @gt/domain/audio.score and lib/sound/localScore.ts.

import type { StudioRole } from "@gt/domain/audio.studio.kinds";

import type { Seed } from "./recipe.ts";

/** A track's role: the studio's seven (stage S2). A role may repeat; a stem's `id` is what is unique. */
export type LocalRole = StudioRole;
/** The roles a catalog instrument is measured for (a pad plays a chords instrument, @gt/domain/audio.score SCORE_ROLE_COMPAT). */
export type LocalInstrumentRole = "drums" | "bass" | "chords" | "lead";
/** The four rows of the retired local-band form (one per catalog role). */
export const LOCAL_ROLES: readonly LocalInstrumentRole[] = ["drums", "bass", "chords", "lead"];
/** A role -> instrument choice; partial, since a track list need not hold every role. */
export type LocalSwapChoice = Readonly<Partial<Record<LocalRole, string>>>;

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

export type LocalControls = { readonly density: number; readonly brightness: number; readonly lift: number; readonly swing: number; readonly humanise: number };
export type LocalSection = { readonly name: string; readonly bars: number; readonly energy: number; readonly progression?: readonly number[] };
export type LocalTrackDraft = {
  readonly role: LocalRole; readonly id?: string; readonly instrument: string; readonly gainDb?: number; readonly pan?: number;
  readonly muted?: boolean; readonly solo?: boolean; readonly pattern?: string; readonly fx?: LocalFxChain;
  readonly enters?: readonly boolean[];
  readonly notes?: readonly { readonly bar: number; readonly beat: number; readonly durationBeats: number; readonly midi: number; readonly velocity: number }[];
};
export type LocalScoreDraft = {
  readonly v: 1; readonly title: string; readonly style?: "chill-hiphop" | "calm-bed" | "synthwave-pulse" | "warm-acoustic";
  readonly seed: number; readonly tempoBpm: number; readonly key: string; readonly loop?: boolean;
  readonly controls: LocalControls; readonly sections: readonly LocalSection[]; readonly tracks: readonly LocalTrackDraft[];
};
export type LocalTemplateView = {
  readonly id: "chill-hiphop" | "calm-bed" | "synthwave-pulse" | "warm-acoustic";
  readonly label: string; readonly plainIntent: string; readonly spec: LocalScoreDraft;
};
export type LocalInstrumentView = {
  readonly id: string; readonly name: string; readonly role: LocalInstrumentRole; readonly engine: "vital-vst3" | "sample-pack" | "synth";
  readonly plainLabel: string; readonly character: string; readonly licence: string; readonly status: "ready" | "refused";
  readonly lufsAtVel100: number | null; readonly loadMs: number; readonly renderMs: number; readonly deterministic: boolean; readonly refusalReason: string | null;
};
export type LocalStemView = {
  /** The track id (its role when the spec gave none): the stem's address in `?stem=`. */
  readonly id: string; readonly role: LocalRole; readonly instrument: string; readonly instrumentName: string;
  /** What really played it; `fallback` = a stand-in played because the request allowed one. */
  readonly source: string; readonly fallback: boolean;
  readonly sha256: string; readonly reused: boolean; readonly noteCount: number; readonly renderMs: number;
  readonly integratedLufs: number | null; readonly truePeakDb: number | null; readonly gainDb: number;
  readonly pan: number; readonly muted: boolean; readonly solo: boolean; readonly audioUrl: string; readonly midiUrl: string;
};
export type LocalTriageFindingView = { readonly check: string; readonly verdict: "pass" | "flag" | "skip"; readonly value: number | null; readonly unit: string };
export type LocalTakeView = {
  readonly id: string; readonly title: string; readonly tempoBpm: number; readonly key: string; readonly durationS: number;
  readonly loop: boolean; readonly lufs: number | null; readonly truePeakDb: number | null; readonly mixUrl: string; readonly rppUrl: string;
  readonly peaks: readonly number[]; readonly reusedIds: readonly string[]; readonly renderedIds: readonly string[];
  readonly reusedRoles: readonly LocalRole[]; readonly renderedRoles: readonly LocalRole[];
  readonly totalRenderMs: number; readonly bitIdentical: boolean | null; readonly maxAbsDiff: number | null; readonly mixSha256: string;
  readonly triageFlagged: number; readonly triageFindings: readonly LocalTriageFindingView[]; readonly stems: readonly LocalStemView[];
  readonly spec: LocalScoreDraft; readonly stage: string | null; readonly verdict: string;
};
export type LocalAuditionState = {
  readonly instrumentId: string; readonly name: string; readonly audioUrl: string;
  readonly lufs: number | null; readonly truePeakDb: number | null; readonly renderMs: number;
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

export type LocalTasteSteerId = "softer-voice" | "warmer-organic" | "punchier-drive" | "brighter-lift";

export type LocalTasteSteer = {
  readonly id: LocalTasteSteerId;
  readonly label: string;
  readonly summary: string;
  readonly roles: LocalSwapChoice;
  readonly controls: Partial<LocalControls>;
};

export const LOCAL_TASTE_STEERS: readonly LocalTasteSteer[] = [
  {
    id: "softer-voice",
    label: "softer under voiceover",
    summary: "brushed kit + upright felt piano + muted guitar clear 1–4 kHz so speech sits clean on top",
    roles: { drums: "kit-acoustic-brush", chords: "sample-felt-piano", lead: "sample-mallet-guitar" },
    controls: { density: 0.38, brightness: 0.35, lift: 0.65 },
  },
  {
    id: "warmer-organic",
    label: "warmer & acoustic",
    summary: "sampled finger bass + lo-fi electric keys + kalimba bell replace synthetic harmonics with natural body",
    roles: { bass: "sample-mamas-bass", chords: "sample-lofi-keys", lead: "sample-ikembe-bell" },
    controls: { brightness: 0.42, swing: 0.16, humanise: 0.35 },
  },
  {
    id: "punchier-drive",
    label: "punchier synth drive",
    summary: "909 kit + Vital analog pulse bass + Vital synth pluck lock 16th-note pulse across bass and lead",
    roles: { drums: "kit-909-pulse", bass: "vital-pulse-bass", chords: "vital-warm-pad", lead: "vital-pluck-lead" },
    controls: { density: 0.72, brightness: 0.7, lift: 0.82, swing: 0 },
  },
  {
    id: "brighter-lift",
    label: "brighter melodic lift",
    summary: "concert grand piano + airy Vital lead open the upper harmonic register in the middle lift",
    roles: { chords: "sample-grand-piano", lead: "vital-glass-lead" },
    controls: { brightness: 0.72, lift: 0.85 },
  },
];

export function applyTasteSteer(
  draft: LocalScoreDraft,
  currentSwap: LocalSwapChoice,
  steerId: LocalTasteSteerId,
): { readonly draft: LocalScoreDraft; readonly swapChoice: LocalSwapChoice; readonly summary: string } {
  const steer = LOCAL_TASTE_STEERS.find((x) => x.id === steerId) ?? LOCAL_TASTE_STEERS[0]!;
  const nextSwap: Partial<Record<LocalRole, string>> = { ...currentSwap };
  const nextTracks = draft.tracks.map((tr) => {
    const picked = steer.roles[tr.role];
    if (picked !== undefined) {
      nextSwap[tr.role] = picked;
      return { ...tr, instrument: picked };
    }
    return tr;
  });
  return {
    draft: { ...draft, controls: { ...draft.controls, ...steer.controls }, tracks: nextTracks },
    swapChoice: nextSwap,
    summary: steer.summary,
  };
}

export function describeStemChoice(
  selectedId: string,
  activeStem: LocalStemView | null,
  catalog: readonly LocalInstrumentView[],
): { readonly tone: "emerald" | "cyan" | "rose"; readonly text: string } {
  const meta = catalog.find((c) => c.id === selectedId);
  if (meta?.status === "refused") {
    return { tone: "rose", text: `refused by A0 gate: ${meta.refusalReason ?? "audition failed"}` };
  }
  if (activeStem !== null && activeStem.instrument !== selectedId && meta !== undefined) {
    return {
      tone: "cyan",
      text: `swap ${activeStem.instrumentName} → ${meta.name}: ${meta.plainLabel.toLowerCase()} (other 3 stems stay bit-identical)`,
    };
  }
  return { tone: "emerald", text: meta?.plainLabel ?? selectedId };
}

const BRIEF_ROLES: readonly (readonly [RegExp, LocalRole, string])[] = [
  [/\b(?:909|electronic\s+kit|tight\s+kit)\b/i, "drums", "kit-909-pulse"],
  [/\b(?:brush|acoustic\s+kit|soft\s+drums)\b/i, "drums", "kit-acoustic-brush"],
  [/\b(?:808|boom[\s-]?bap)\b/i, "drums", "kit-808-warm"],
  [/\b(?:pulse\s+bass|analog\s+bass|synth\s+bass)\b/i, "bass", "vital-pulse-bass"],
  [/\b(?:finger\s+bass|picked\s+bass|warm\s+bass)\b/i, "bass", "sample-mamas-bass"],
  [/\b(?:sub\s+bass|deep\s+bass)\b/i, "bass", "vital-sub-bass"],
  [/\b(?:felt\s+piano|upright\s+piano|piano)\b/i, "chords", "sample-felt-piano"],
  [/\b(?:grand\s+piano|concert\s+piano)\b/i, "chords", "sample-grand-piano"],
  [/\b(?:warm\s+keys|electric\s+keys|lofi\s+keys|lo-fi\s+keys)\b/i, "chords", "sample-lofi-keys"],
  [/\b(?:pad|warm\s+pad|synth\s+pad)\b/i, "chords", "vital-warm-pad"],
  [/\b(?:bell|kalimba|thumb\s+piano)\b/i, "lead", "sample-ikembe-bell"],
  [/\b(?:guitar|mallet\s+guitar|acoustic\s+guitar)\b/i, "lead", "sample-mallet-guitar"],
  [/\b(?:flute|airy|glass\s+lead)\b/i, "lead", "vital-glass-lead"],
  [/\b(?:pluck|synth\s+pluck|arp\s+lead)\b/i, "lead", "vital-pluck-lead"],
];

/** Translate a plain-English non-musician brief into a LocalScoreDraft and swapChoice map. */
export function sketchDraftFromBrief(
  brief: string,
  templates: readonly LocalTemplateView[],
  currentSwap: LocalSwapChoice,
  current: LocalScoreDraft,
): { readonly draft: LocalScoreDraft; readonly swapChoice: LocalSwapChoice; readonly summary: string } {
  const words = brief.trim();
  if (words === "") return { draft: current, swapChoice: currentSwap, summary: "brief unchanged" };
  const lower = words.toLowerCase();
  const styleId: LocalTemplateView["id"] =
    /\b(?:synth|pulse|cyber|electronic|909|drive)\b/.test(lower)
      ? "synthwave-pulse"
      : /\b(?:calm|bed|narrative|quiet|voiceover|ambient|gentle)\b/.test(lower)
        ? "calm-bed"
        : /\b(?:acoustic|folk|workshop|sunlight|guitar)\b/.test(lower)
          ? "warm-acoustic"
          : "chill-hiphop";
  const base = (templates.find((t) => t.id === styleId) ?? templates[0])?.spec ?? current;
  const bpmM = /\b(\d{2,3})\s*bpm\b/i.exec(words);
  const tempoBpm = bpmM ? Math.max(40, Math.min(220, Number(bpmM[1]))) : base.tempoBpm;
  const key = LOCAL_KEYS.find((k) => new RegExp(`\\b${k.replace("#", "\\#")}\\b`, "i").test(words)) ?? base.key;
  const loop = /\b(?:loop|seamless|repeating)\b/i.test(words);
  const secM = /\b(\d{1,3})\s*(?:s|sec|seconds)\b/i.exec(words);
  const totalBars = secM ? Math.max(2, Math.min(64, Math.round(Math.max(4, Number(secM[1])) / (240 / tempoBpm)))) : base.sections.reduce((a, s) => a + s.bars, 0);
  const hasLift = /\b(?:lift|build|middle|swell)\b/i.test(words);
  const sections = loop
    ? [{ name: "loop", bars: Math.min(32, totalBars), energy: 0.82, progression: [0, 5, 3, 4] }]
    : secM
      ? [
          { name: "intro", bars: Math.max(1, Math.floor(totalBars * 0.25)), energy: 0.34, progression: [0, 4, 5, 3] },
          { name: "lift", bars: Math.max(2, totalBars - 2 * Math.max(1, Math.floor(totalBars * 0.25))), energy: hasLift ? 0.88 : 0.82, progression: [3, 0, 4, 5] },
          { name: "outro", bars: Math.max(1, Math.floor(totalBars * 0.25)), energy: 0.35, progression: [0, 3, 0, 0] },
        ]
      : base.sections;
  const nextSwap: Partial<Record<LocalRole, string>> = { ...currentSwap };
  for (const tr of base.tracks) nextSwap[tr.role] = tr.instrument;
  for (const [re, role, instId] of BRIEF_ROLES) if (re.test(words)) nextSwap[role] = instId;
  const tracks = base.tracks.map((tr) => ({ ...tr, instrument: nextSwap[tr.role] ?? tr.instrument }));
  return {
    draft: { ...base, title: words.slice(0, 64), style: styleId, tempoBpm, key, loop, sections, tracks },
    swapChoice: nextSwap,
    summary: `sketched ${styleId} · ${tempoBpm} bpm · ${key} (${sections.reduce((a, s) => a + s.bars, 0)} bars${loop ? " loop" : ""})`,
  };
}
