import { z } from "zod";
import { fxChainSchema, type FxChain } from "./audio.fx.ts";
import { STUDIO_ROLES, type StudioRole } from "./audio.studio.kinds.ts";
import { parseAt, parseJsonAt } from "./door.ts";
import { err, ok, type Result } from "./errors.ts";

// DETERMINISTIC LOCAL SCORE SPEC (A0 + A1 + A2, D6, C6) - the closed symbolic contract between
// the composer / non-musician steering controls and the Python audio sidecar
// (pipeline/audio/render_score.py). Every object is strict, every numeric parameter is bounded,
// and an out-of-range value, silent/refused plugin, or out-of-key note is refused at the door
// with its exact path - never silently clamped.
//
// STAGE S2 (spark audio-agent-studio) grew it ADDITIVELY, still `v: 1`: up to 8 tracks over the 7
// studio roles; a track's optional `id` (absent = its role) is what is unique, so a role may repeat
// only when every track of it carries an id; `enters` (one flag per section, absent = everywhere)
// rests a track in some sections. gainDb / pan are mix-time (the renderer keeps them out of the stem
// hash and the bake). A v1 document validates, hashes and renders as it did.

export const SCORE_SPEC_VERSION = 1;
/** The track roles: the studio's (./audio.studio.kinds.ts), one list. */
export const SCORE_ROLES = STUDIO_ROLES;
export type ScoreRole = StudioRole;
/** The roles an instrument in the catalog is measured for; a studio role plays them through SCORE_ROLE_COMPAT. */
export const INSTRUMENT_ROLES = ["drums", "bass", "chords", "lead"] as const;
export type InstrumentRole = (typeof INSTRUMENT_ROLES)[number];
export const SCORE_MAX_TRACKS = 8;
/** A track id: lower-case letters, digits and dashes, 1..24 characters. */
export const TRACK_ID_RE = /^[a-z0-9-]{1,24}$/;

/**
 * Which catalog roles may play each studio role. MIRRORS packages/domain/src/audio.roles.json `compat`
 * (the file the Python renderer reads); packages/domain/test/audio.score.tracks.test.ts fails when the
 * two drift. Kept as a constant so the door stays a pure module (no JSON import, no fs).
 */
export const SCORE_ROLE_COMPAT: Readonly<Record<ScoreRole, readonly InstrumentRole[]>> = {
  drums: ["drums"],
  percussion: ["drums"],
  bass: ["bass"],
  chords: ["chords"],
  pad: ["chords"],
  lead: ["lead"],
  texture: ["lead", "chords"],
};

/** Can an instrument measured for `instrumentRole` play a `role` track. */
export const instrumentFitsRole = (instrumentRole: InstrumentRole, role: ScoreRole): boolean => SCORE_ROLE_COMPAT[role].includes(instrumentRole);

/** A track's address: its id, or its role when it has none (one per role then). */
export const trackIdOf = (t: { readonly id?: string | undefined; readonly role: ScoreRole }): string => t.id ?? t.role;

export const SCORE_KEYS = [
  "C major", "G major", "D major", "F major", "Bb major", "Eb major",
  "A minor", "E minor", "D minor", "C minor", "G minor", "F# minor",
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const STYLE_TEMPLATES = ["chill-hiphop", "calm-bed", "synthwave-pulse", "warm-acoustic"] as const;
export type StyleTemplateId = (typeof STYLE_TEMPLATES)[number];

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

export const KEY_ROOT_PC: Readonly<Record<ScoreKey, number>> = {
  "C major": 0, "G major": 7, "D major": 2, "F major": 5, "Bb major": 10, "Eb major": 3,
  "A minor": 9, "E minor": 4, "D minor": 2, "C minor": 0, "G minor": 7, "F# minor": 6,
};

export function scalePitchClasses(key: ScoreKey): ReadonlySet<number> {
  const root = KEY_ROOT_PC[key];
  const steps = key.endsWith("minor") ? MINOR_STEPS : MAJOR_STEPS;
  return new Set(steps.map((s) => (root + s) % 12));
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "Bb", "B"] as const;
export const midiNoteName = (midi: number): string => `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

export type AuditionCard = {
  readonly status: "ready" | "refused";
  readonly noteOnWorks: boolean;
  readonly lufsAtVel100: number | null;
  readonly truePeakDb: number | null;
  readonly tailS: number;
  readonly loadMs: number;
  readonly renderMs: number;
  readonly deterministic: boolean;
  readonly maxDiff: number;
  readonly refusalReason: string | null;
};

export type InstrumentCatalogEntry = {
  readonly id: string;
  readonly name: string;
  readonly role: InstrumentRole;
  readonly engine: "vital-vst3" | "sample-pack" | "synth";
  /** Plain non-musician description (<= 12 words). */
  readonly plainLabel: string;
  readonly character: "warm" | "bright" | "soft" | "punchy" | "deep";
  readonly pitchRange: readonly [number, number];
  readonly licence: string;
  readonly audition: AuditionCard;
};

const LIC_PACK = "Local DAW sample pack (licensed to this machine; runtime path only)";
const LIC_VITAL = "Vital Audio EULA: commercial audio output permitted";

const readyCard = (lufs: number, tp: number, tailS: number, loadMs: number, renderMs: number): AuditionCard => ({
  status: "ready", noteOnWorks: true, lufsAtVel100: lufs, truePeakDb: tp, tailS, loadMs, renderMs, deterministic: true, maxDiff: 0, refusalReason: null,
});

/**
 * A0 MEASURED INSTRUMENT CATALOG - every local VST3 and sample instrument known to this box,
 * with its measured audition card. Silent plugins (MiniGrand.vst3) and slow/unlicensed plugins
 * (Hybrid.vst3) stay in the table as refused entries so the door and UI explain why they cannot
 * be picked rather than pretending they do not exist.
 */
export const INSTRUMENT_CATALOG: readonly InstrumentCatalogEntry[] = [
  { id: "kit-808-warm", name: "808 Boom-Bap Kit", role: "drums", engine: "sample-pack", plainLabel: "Deep sub kick, crisp snare, warm vinyl hats", character: "warm", pitchRange: [35, 81], licence: LIC_PACK, audition: readyCard(-15.4, -1.8, 0.35, 12, 38) },
  { id: "kit-909-pulse", name: "909 Tight Electronic Kit", role: "drums", engine: "sample-pack", plainLabel: "Punchy electronic kick, snappy clap, bright hats", character: "punchy", pitchRange: [35, 81], licence: LIC_PACK, audition: readyCard(-14.8, -1.5, 0.28, 11, 35) },
  { id: "kit-acoustic-brush", name: "Soft Studio Brush Kit", role: "drums", engine: "sample-pack", plainLabel: "Gentle acoustic kick, soft rimshot, brushed hats", character: "soft", pitchRange: [35, 81], licence: LIC_PACK, audition: readyCard(-17.2, -2.4, 0.42, 14, 40) },
  { id: "vital-sub-bass", name: "Vital Warm Sub Bass", role: "bass", engine: "vital-vst3", plainLabel: "Deep, smooth low-end anchor from Vital synth", character: "deep", pitchRange: [24, 60], licence: LIC_VITAL, audition: readyCard(-14.2, -1.9, 0.25, 2960, 240) },
  { id: "sample-mamas-bass", name: "Picked Finger Bass", role: "bass", engine: "sample-pack", plainLabel: "Warm sampled bass guitar with natural pluck", character: "warm", pitchRange: [24, 64], licence: LIC_PACK, audition: readyCard(-15.8, -2.1, 0.32, 18, 45) },
  { id: "vital-pulse-bass", name: "Vital Analog Pulse Bass", role: "bass", engine: "vital-vst3", plainLabel: "Rhythmic synth bass with warm filter sweep", character: "punchy", pitchRange: [24, 64], licence: LIC_VITAL, audition: readyCard(-13.9, -1.7, 0.22, 2960, 250) },
  { id: "sample-felt-piano", name: "Upright Felt Piano", role: "chords", engine: "sample-pack", plainLabel: "Intimate upright home piano with soft felt hammers", character: "soft", pitchRange: [36, 88], licence: LIC_PACK, audition: readyCard(-16.1, -2.3, 0.65, 22, 55) },
  { id: "vital-warm-pad", name: "Vital Warm Pad", role: "chords", engine: "vital-vst3", plainLabel: "Floating stereo synth pad that fills the room", character: "warm", pitchRange: [36, 84], licence: LIC_VITAL, audition: readyCard(-14.15, -1.6, 0.85, 2960, 260) },
  { id: "sample-lofi-keys", name: "Lo-Fi Electric Keys", role: "chords", engine: "sample-pack", plainLabel: "Warm vintage electric piano with gentle warble", character: "warm", pitchRange: [36, 84], licence: LIC_PACK, audition: readyCard(-15.6, -2.0, 0.55, 19, 50) },
  { id: "sample-grand-piano", name: "Concert Grand Piano", role: "chords", engine: "sample-pack", plainLabel: "Clear acoustic grand piano across full range", character: "bright", pitchRange: [28, 96], licence: LIC_PACK, audition: readyCard(-15.2, -1.8, 0.7, 24, 58) },
  { id: "vital-pluck-lead", name: "Vital Pluck Synth", role: "lead", engine: "vital-vst3", plainLabel: "Crisp, bell-like synth pluck for clear melodies", character: "bright", pitchRange: [48, 96], licence: LIC_VITAL, audition: readyCard(-14.6, -1.7, 0.4, 2960, 245) },
  { id: "sample-ikembe-bell", name: "Kalimba Thumb Bell", role: "lead", engine: "sample-pack", plainLabel: "Organic metallic thumb piano with woody resonance", character: "warm", pitchRange: [48, 88], licence: LIC_PACK, audition: readyCard(-16.4, -2.2, 0.5, 15, 42) },
  { id: "sample-mallet-guitar", name: "Warm Mallet Guitar", role: "lead", engine: "sample-pack", plainLabel: "Muted plucked acoustic guitar with soft decay", character: "soft", pitchRange: [40, 84], licence: LIC_PACK, audition: readyCard(-15.9, -2.1, 0.48, 16, 44) },
  { id: "vital-glass-lead", name: "Vital Airy Flute Lead", role: "lead", engine: "vital-vst3", plainLabel: "Smooth, breathy synth melody that sits gently", character: "soft", pitchRange: [48, 96], licence: LIC_VITAL, audition: readyCard(-15.1, -1.9, 0.55, 2960, 255) },
  {
    id: "minigrand-vst3", name: "AIR MiniGrand VST3", role: "chords", engine: "vital-vst3",
    plainLabel: "Acoustic piano plugin; refused by silent render gate", character: "bright", pitchRange: [21, 108], licence: "AIR Music Tech standard EULA",
    audition: { status: "refused", noteOnWorks: false, lufsAtVel100: null, truePeakDb: null, tailS: 0, loadMs: 1420, renderMs: 180, deterministic: true, maxDiff: 0, refusalReason: "instrument render is silent (note-on C4 vel 100 measured null LUFS)" },
  },
  {
    id: "hybrid-vst3", name: "AIR Hybrid 3 VST3", role: "lead", engine: "vital-vst3",
    plainLabel: "Subtractive synth plugin; refused by load and licence gate", character: "punchy", pitchRange: [24, 96], licence: "",
    audition: { status: "refused", noteOnWorks: true, lufsAtVel100: -19.21, truePeakDb: -3.4, tailS: 0.8, loadMs: 77600, renderMs: 420, deterministic: false, maxDiff: 0.18, refusalReason: "cold load 77.6 s exceeds 5.0 s ceiling and licence note is empty" },
  },
] as const;

export const instrumentById = (id: string): InstrumentCatalogEntry | undefined => INSTRUMENT_CATALOG.find((x) => x.id === id);
/** The ready, licensed instruments that may play a `role` track (through SCORE_ROLE_COMPAT). */
export const readyInstrumentsForRole = (role: ScoreRole): readonly InstrumentCatalogEntry[] =>
  INSTRUMENT_CATALOG.filter((x) => instrumentFitsRole(x.role, role) && x.audition.status === "ready" && x.licence.trim() !== "");

const num = (min: number, max: number) => z.number().min(min).max(max);

export const scoreControlsSchema = z.strictObject({
  density: num(0, 1),
  brightness: num(0, 1),
  lift: num(0, 1),
  swing: num(0, 0.5),
  humanise: num(0, 1),
});
export type ScoreControls = z.output<typeof scoreControlsSchema>;

export const scoreNoteSchema = z.strictObject({
  bar: z.number().int().min(1).max(64),
  beat: num(0, 3.99),
  durationBeats: num(0.1, 16),
  midi: z.number().int().min(12).max(108),
  velocity: z.number().int().min(1).max(127),
});
export type ScoreNote = z.output<typeof scoreNoteSchema>;

export const scoreSectionSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  bars: z.number().int().min(1).max(32),
  energy: num(0, 1),
  progression: z.array(z.number().int().min(0).max(6)).min(1).max(8).optional(),
});
export type ScoreSection = z.output<typeof scoreSectionSchema>;

export const scoreTrackSchema = z.strictObject({
  role: z.enum(SCORE_ROLES),
  /** Unique across the tracks; absent = the role (then the role appears once). */
  id: z.string().regex(TRACK_ID_RE, "a track id is 1..24 lower-case letters, digits or dashes").optional(),
  instrument: z.string().trim().min(1).max(80),
  /** One flag per section: does this track play there. Absent = everywhere (never written all-true). */
  enters: z.array(z.boolean()).min(1).max(8).optional(),
  muted: z.boolean().optional(),
  solo: z.boolean().optional(),
  gainDb: num(-24, 12).optional(),
  pan: num(-1, 1).optional(),
  pattern: z.string().trim().min(1).max(40).optional(),
  fx: fxChainSchema.optional(),
  notes: z.array(scoreNoteSchema).max(512).optional(),
});
export type ScoreTrack = z.output<typeof scoreTrackSchema>;

export const scoreSpecSchema = z.strictObject({
  v: z.literal(SCORE_SPEC_VERSION),
  title: z.string().trim().min(1).max(120),
  style: z.enum(STYLE_TEMPLATES).optional(),
  seed: z.number().int().min(0).max(2147483647),
  tempoBpm: num(40, 220),
  key: z.enum(SCORE_KEYS),
  loop: z.boolean().optional(),
  controls: scoreControlsSchema,
  sections: z.array(scoreSectionSchema).min(1).max(8),
  tracks: z.array(scoreTrackSchema).min(1).max(SCORE_MAX_TRACKS),
});
export type ScoreSpec = z.output<typeof scoreSpecSchema>;

/** The track-address rules: ids unique, a repeated role only with an id on every track of it, `enters` one flag per section. */
function validateTrackAddresses(spec: ScoreSpec): Result<ScoreSpec> {
  const seen = new Map<string, number>();
  for (let i = 0; i < spec.tracks.length; i++) {
    const tr = spec.tracks[i]!;
    const before = spec.tracks.findIndex((o, j) => j < i && o.role === tr.role && (o.id === undefined || tr.id === undefined));
    if (before >= 0) {
      return err("invalid", `score spec: tracks.${i}.role: duplicate role ${tr.role} (tracks.${before} too) - give every ${tr.role} track an id`);
    }
    const key = trackIdOf(tr);
    const at = seen.get(key);
    if (at !== undefined) return err("invalid", `score spec: tracks.${i}.${tr.id === undefined ? "role" : "id"}: track id ${key} is already tracks.${at}'s`);
    seen.set(key, i);
    if (tr.enters !== undefined) {
      if (tr.enters.length !== spec.sections.length) {
        return err("invalid", `score spec: tracks.${i}.enters: ${tr.enters.length} flags for ${spec.sections.length} sections (one per section)`);
      }
      if (!tr.enters.includes(true)) return err("invalid", `score spec: tracks.${i}.enters: the track plays in no section - remove it or mute it`);
    }
  }
  return ok(spec);
}

/** `enters` all-true says "everywhere", which is written as no `enters` at all: one spelling, one stem hash. */
const canonicalTracks = (spec: ScoreSpec): ScoreSpec =>
  spec.tracks.some((t) => t.enters !== undefined && t.enters.every(Boolean))
    ? { ...spec, tracks: spec.tracks.map((t) => (t.enters !== undefined && t.enters.every(Boolean) ? withoutEnters(t) : t)) }
    : spec;
const withoutEnters = (t: ScoreTrack): ScoreTrack => {
  const { enters: _drop, ...rest } = t;
  return rest;
};

/** Validate catalog eligibility, role matching, track ids, bar bounds, and scale membership. */
export function validateScoreSemantics(specIn: ScoreSpec): Result<ScoreSpec> {
  const totalBars = specIn.sections.reduce((acc, s) => acc + s.bars, 0);
  if (totalBars < 2 || totalBars > 64) return err("invalid", `score spec: sections: total bars ${totalBars} is outside 2..64`);
  const addressed = validateTrackAddresses(specIn);
  if (!addressed.ok) return addressed;
  const spec = canonicalTracks(specIn);
  const allowedPc = scalePitchClasses(spec.key);
  for (let i = 0; i < spec.tracks.length; i++) {
    const tr = spec.tracks[i]!;
    const inst = instrumentById(tr.instrument);
    if (inst === undefined) return err("invalid", `score spec: tracks.${i}.instrument: unknown instrument ${tr.instrument}`);
    if (inst.licence.trim() === "") return err("invalid", `score spec: tracks.${i}.instrument: ${tr.instrument} has an empty licence note`);
    if (inst.audition.status !== "ready" || !inst.audition.noteOnWorks) {
      return err("invalid", `score spec: tracks.${i}.instrument: ${tr.instrument} refused (${inst.audition.refusalReason ?? "audition failed"})`);
    }
    if (!instrumentFitsRole(inst.role, tr.role)) {
      return err("invalid", `score spec: tracks.${i}.instrument: ${tr.instrument} is for ${inst.role}, not ${tr.role} (a ${tr.role} track takes ${SCORE_ROLE_COMPAT[tr.role].join(" or ")} instruments)`);
    }
    if (tr.notes !== undefined) {
      for (let j = 0; j < tr.notes.length; j++) {
        const n = tr.notes[j]!;
        if (n.bar > totalBars) return err("invalid", `score spec: tracks.${i}.notes.${j}.bar: bar ${n.bar} exceeds total bars ${totalBars}`);
        if (n.midi < inst.pitchRange[0] || n.midi > inst.pitchRange[1]) {
          return err("invalid", `score spec: tracks.${i}.notes.${j}.midi: ${n.midi} is outside ${tr.instrument} range ${inst.pitchRange[0]}..${inst.pitchRange[1]}`);
        }
        if (inst.role !== "drums" && !allowedPc.has(((n.midi % 12) + 12) % 12)) {
          return err("invalid", `score spec: tracks.${i}.notes.${j}.midi: ${n.midi} (${midiNoteName(n.midi)}) leaves declared key ${spec.key} in bar ${n.bar}`);
        }
      }
    }
  }
  return ok(spec);
}

export function parseScoreSpec(input: unknown): Result<ScoreSpec> {
  const parsed = parseAt("score spec", scoreSpecSchema, input);
  return parsed.ok ? validateScoreSemantics(parsed.value as ScoreSpec) : parsed;
}

export function parseScoreSpecJson(text: string): Result<ScoreSpec> {
  const parsed = parseJsonAt("score spec", scoreSpecSchema, text);
  return parsed.ok ? validateScoreSemantics(parsed.value as ScoreSpec) : parsed;
}

/** Swap one track's instrument (by its id; absent in the spec = its role), keeping the rest of the ScoreSpec untouched. */
export function swapTrackInstrument(spec: ScoreSpec, trackId: string, instrumentId: string, fx?: FxChain): Result<ScoreSpec> {
  if (!spec.tracks.some((t) => trackIdOf(t) === trackId)) return err("invalid", `score spec: no track ${trackId} (tracks: ${spec.tracks.map(trackIdOf).join(", ")})`);
  const next: ScoreSpec = {
    ...spec,
    tracks: spec.tracks.map((t) => (trackIdOf(t) === trackId ? { ...t, instrument: instrumentId, ...(fx === undefined ? {} : { fx }) } : t)),
  };
  return validateScoreSemantics(next);
}

/** Swap a single role's instrument (v1 callers: one track per role). A role that repeats is addressed by track id instead. */
export function swapRoleInstrument(spec: ScoreSpec, role: ScoreRole, instrumentId: string, fx?: FxChain): Result<ScoreSpec> {
  const of = spec.tracks.filter((t) => t.role === role);
  if (of.length > 1) return err("invalid", `score spec: role ${role} has ${of.length} tracks (${of.map(trackIdOf).join(", ")}) - swap one by its track id`);
  const next: ScoreSpec = {
    ...spec,
    tracks: spec.tracks.map((t) => (t.role === role ? { ...t, instrument: instrumentId, ...(fx === undefined ? {} : { fx }) } : t)),
  };
  return validateScoreSemantics(next);
}

/**
 * Give an id to every track of a role that repeats and has none (`<role>-<n>`, the first free n from 1),
 * so a spec assembled from parts passes the id rule. Tracks of a role that appears once are untouched
 * (a v1 spec comes back as it went in).
 */
export function withTrackIds<T extends { readonly role: ScoreRole; readonly id?: string | undefined }>(tracks: readonly T[]): T[] {
  const repeats = (role: ScoreRole): boolean => tracks.filter((o) => o.role === role).length > 1;
  const taken = new Set(tracks.filter((t) => t.id !== undefined || !repeats(t.role)).map(trackIdOf));
  return tracks.map((t) => {
    if (t.id !== undefined || !repeats(t.role)) return t;
    let n = 1;
    while (taken.has(`${t.role}-${n}`)) n++;
    const id = `${t.role}-${n}`;
    taken.add(id);
    return { ...t, id };
  });
}
