// AUDIO ACCEPTANCE - a delivered take measured against where it ships. The registry's
// generated-music-acceptance subject, technique loudness-and-peak-acceptance: integrated
// loudness is the delivery target (a property of the DESTINATION, not of the take), true peak
// is the ceiling, loudness range is a diagnostic and never a pass/fail number. Unmeasured is
// not pass: a missing integrated loudness fails with that reason rather than passing quietly.
//
// The verdict is ADVISORY (operator decision, 2026-10-24): it is recorded as one `audio.accept`
// ledger event and marked on the take; the cut gate does not read it.
//
// Pure: no zod, no I/O, so the producers, the ledger writer and a client mark share it.

//
// Two destinations, because a narration TAKE does not ship - it is a stem that enters a mix,
// and the mix ships. Holding a raw take to -14 LUFS would fail nearly every take for a number
// the export's loudnorm sets anyway; a take is held to a usable range and to the ceiling, the
// export to the platform's target.
export const AUDIO_PROFILES = {
  /** A stem entering the mix: usable level, no overs, so the mix can set the target. */
  "voice-take": { lufsMin: -28, lufsMax: -10, truePeakMaxDb: -1 },
  /** The delivered file. Streaming normalisation lands near -14 LUFS; -1 dBTP leaves room for the lossy encode. */
  youtube: { lufsMin: -15, lufsMax: -13, truePeakMaxDb: -1 },
} as const;

export type AudioProfile = keyof typeof AUDIO_PROFILES;
export const AUDIO_PROFILE_IDS = ["voice-take", "youtube"] as const satisfies readonly AudioProfile[];

/** What the sidecar measures (pipeline/audio/sidecar.py `measure`). Null = could not measure. */
export type AudioMeasureFull = {
  readonly integratedLufs: number | null;
  readonly truePeakDb: number | null;
  readonly lra: number | null;
  readonly clippedSamples: number;
  readonly leadSilenceS: number;
  readonly tailSilenceS: number;
  readonly durationS: number;
};

export type Acceptance = {
  readonly profile: AudioProfile;
  readonly verdict: "pass" | "fail";
  readonly reasons: readonly string[];
};

/** The explainer read rate (lib/producers/voice.ts WORDS_PER_S), for an expected line length. */
export const WORDS_PER_S = 2.5;
/** How far a spoken line may sit from its expected length before it is a length fail. */
export const LENGTH_TOLERANCE = 0.35;
/** A tail of silence longer than this is a defect (a broken ending), not a breath. */
export const TAIL_SILENCE_MAX_S = 1.5;

export function expectedSecondsOf(text: string): number | null {
  const words = text.trim().split(/\s+/).filter((w) => w !== "").length;
  return words === 0 ? null : words / WORDS_PER_S;
}

const fix1 = (n: number): string => n.toFixed(1);

/**
 * The verdict for one measure at one profile. `expectedS` null = the take committed to no length
 * (verify what was committed and nothing more - structure-verification-against-plan).
 */
export function judgeAcceptance(m: AudioMeasureFull, profile: AudioProfile, expectedS: number | null): Acceptance {
  const p = AUDIO_PROFILES[profile];
  const reasons: string[] = [];
  if (m.integratedLufs === null) reasons.push("loudness not measured");
  else if (m.integratedLufs < p.lufsMin || m.integratedLufs > p.lufsMax) reasons.push(`loudness ${fix1(m.integratedLufs)} LUFS outside ${p.lufsMin}..${p.lufsMax}`);
  if (m.truePeakDb === null) reasons.push("true peak not measured");
  else if (m.truePeakDb > p.truePeakMaxDb) reasons.push(`true peak ${fix1(m.truePeakDb)} dBTP over ${p.truePeakMaxDb}`);
  if (m.clippedSamples > 0) reasons.push(`clipped ${m.clippedSamples} samples`);
  if (m.tailSilenceS > TAIL_SILENCE_MAX_S) reasons.push(`silent tail ${fix1(m.tailSilenceS)} s`);
  if (expectedS !== null && expectedS > 0 && Math.abs(m.durationS - expectedS) / expectedS > LENGTH_TOLERANCE)
    reasons.push(`length ${fix1(m.durationS)} s vs expected ${fix1(expectedS)} s`);
  return { profile, verdict: reasons.length === 0 ? "pass" : "fail", reasons };
}
