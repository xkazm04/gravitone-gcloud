import { z } from "zod";

// AUDIO TRIAGE - what a machine can say about a generated take before anybody listens to it.
// The audio sidecar (pipeline/audio/sidecar.py `triage`) runs one detector per check over one
// file IN THE CONTEXT OF ITS BRIEF and answers with findings; the Board's audio cull shows the
// flagged ones beside the brief check, so a take is heard with its defects already named. The
// verdict stays the human's: triage names evidence, it never keeps or rejects (operator decision,
// 2026-10-24 - the pile order is untouched until labels have calibrated the detectors).
//
// Two families (registry: generated-music-acceptance / generated-audio-defect-taxonomy,
// structure-verification-against-plan; sound-effect-generation / loop-seam-acceptance):
//   TECHNICAL  - properties of the signal alone: clipping, true-peak overs, loudness out of the
//                kind's usable range, dead air inside the take, length against the brief;
//   STRUCTURAL - properties of its shape: a broken ending, tempo that drifts, section boundaries
//                away from the plan, a loop that jumps at its seam, a stereo image that cancels in
//                mono. Each structural check names the human defect code it evidences
//                (lib/sound/types.ts DEFECTS - mirrored here as strings: the domain cannot import
//                lib/; tests/next-server/audio-triage-contract.test.ts pins the two together).
//
// A check whose context was never committed SKIPS rather than guessing (no asked length -> no
// length check; not briefed as a loop -> no seam check): structure-verification's "verify what was
// committed and nothing more". Thresholds are data, per kind, so the eval harness can move them
// with numbers behind the move.

export const TRIAGE_VERSION = 1;

export const TECHNICAL_CHECKS = ["clipping", "true-peak-over", "loudness-range", "dead-air", "duration"] as const;
export const STRUCTURAL_CHECKS = ["broken-ending", "tempo-instability", "section-boundary", "loop-seam", "mono-fold"] as const;
export const TRIAGE_CHECKS = [...TECHNICAL_CHECKS, ...STRUCTURAL_CHECKS] as const;
export type TriageCheck = (typeof TRIAGE_CHECKS)[number];

/** The human defect code (lib/sound/types.ts DEFECTS) a structural check evidences. */
export const CHECK_DEFECT = {
  "broken-ending": "broken-ending",
  "tempo-instability": "tempo-instability",
  "section-boundary": "off-brief",
  "loop-seam": "loop-seam",
  "mono-fold": "phase-width",
} as const satisfies Partial<Record<TriageCheck, string>>;

export const TRIAGE_KINDS = ["music", "sfx", "voice"] as const;
export type TriageKind = (typeof TRIAGE_KINDS)[number];

/**
 * What each check measures, its unit, and when it flags. `flag` is the rule on `value`; every
 * definition below is the one the sidecar implements (pipeline/audio/triage.py header).
 *   clipping          longest run of consecutive samples at |x| >= 0.999, any channel (samples)
 *   true-peak-over    4x-oversampled true peak (dBTP); a take is not the delivered file, so the
 *                     bar is 0 dBTP (inter-sample overs), not the delivery ceiling
 *   loudness-range    integrated loudness (LUFS) outside [min, max]; null loudness flags
 *   dead-air          longest silence (< -50 dBFS, 50 ms windows) strictly INSIDE the take,
 *                     lead and tail excluded (s)
 *   duration          |measured - asked| / asked (ratio); skips without an asked length
 *   broken-ending     the last 50 ms against the 2 s before it (dB): near 0 = the take stops at
 *                     body level, cut mid-signal. Also flags a silent tail longer than `tailS`.
 *                     Skips a take briefed as a loop (a loop's end is its seam)
 *   tempo-instability |tempo of the first third - tempo of the last third| (bpm); music only
 *   section-boundary  the largest distance from a planned section boundary to the nearest
 *                     novelty peak (s); skips without sections
 *   loop-seam         the step across the wrap, last 100 ms -> first 100 ms: the larger of the
 *                     level step and the spectral step, both in dB; skips unless briefed as a loop
 *   mono-fold         integrated loudness lost when L+R are summed to mono (dB); skips mono files
 */
export const TRIAGE_THRESHOLDS = {
  music: { clipping: 3, truePeakDb: 0, lufsMin: -30, lufsMax: -6, deadAirS: 2, durationRatio: 0.1, endingDb: -12, tailS: 3, tempoDriftBpm: 3, sectionS: 2, seamDb: 3, monoLossDb: 3 },
  sfx: { clipping: 3, truePeakDb: 0, lufsMin: -40, lufsMax: -6, deadAirS: 1.5, durationRatio: 0.1, endingDb: -12, tailS: 2, tempoDriftBpm: 3, sectionS: 2, seamDb: 3, monoLossDb: 3 },
  voice: { clipping: 3, truePeakDb: 0, lufsMin: -30, lufsMax: -10, deadAirS: 1.5, durationRatio: 0.35, endingDb: -12, tailS: 2, tempoDriftBpm: 3, sectionS: 2, seamDb: 3, monoLossDb: 3 },
} as const satisfies Record<TriageKind, Record<string, number>>;
export type TriageThresholds = (typeof TRIAGE_THRESHOLDS)[TriageKind];

export const UNITS = {
  clipping: "samples",
  "true-peak-over": "dBTP",
  "loudness-range": "LUFS",
  "dead-air": "s",
  duration: "ratio",
  "broken-ending": "dB",
  "tempo-instability": "bpm",
  "section-boundary": "s",
  "loop-seam": "dB",
  "mono-fold": "dB",
} as const satisfies Record<TriageCheck, string>;

/** The brief a take is judged against. Absent key = not committed = that check skips. */
export const triageContextSchema = z.strictObject({
  kind: z.enum(TRIAGE_KINDS),
  durationS: z.number().positive().optional(),
  tempoBpm: z.number().positive().optional(),
  loop: z.boolean().optional(),
  sections: z.array(z.strictObject({ name: z.string(), startMs: z.number().nonnegative(), endMs: z.number().positive() })).optional(),
});
export type TriageContext = z.output<typeof triageContextSchema>;

export const findingSchema = z.strictObject({
  check: z.enum(TRIAGE_CHECKS),
  /** lib/sound/types.ts DEFECTS code, structural checks only. */
  defect: z.string().min(1).optional(),
  verdict: z.enum(["pass", "flag", "skip"]),
  value: z.number().nullable(),
  threshold: z.number().nullable(),
  unit: z.string(),
  /** Where in the file the evidence is (s). */
  atS: z.number().nonnegative().optional(),
  /** Why it skipped, or what the value means in this file - the detector's own words. */
  note: z.string().optional(),
});
export type Finding = z.output<typeof findingSchema>;

export const triageSchema = z.strictObject({
  version: z.literal(TRIAGE_VERSION),
  findings: z.array(findingSchema),
  flagged: z.number().int().nonnegative(),
});
export type Triage = z.output<typeof triageSchema>;

/** The sidecar's answer to `triage --json` (last stdout line). */
export const triageAnswerSchema = z.strictObject({ ok: z.literal(true), triage: triageSchema });
