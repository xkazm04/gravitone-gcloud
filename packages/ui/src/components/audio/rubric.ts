// THE AUDIO RUBRIC - what a take is scored on, how its score is read, and what "proven" means,
// pure (Phase 6, L66). v1 kept the dimensions on the take's kind (lib/sound/types.ts `RUBRIC`),
// the mean twice (app/playground/shared/format.ts `meanScore` over every number in the bag, and
// lib/sound/ledger.ts `rubricMean` over the kind's dimensions with a fallback) and "proven" as a
// kept take whose mean reaches 7 (`readVerdict`). The two means could disagree on a bag scored
// before the sfx rubric existed; the ledger's is the one written as `score` and read by the
// strengths, so it is the ONE here, and tests/next-server/audio-insight.test.ts pins this copy
// to lib/sound's (scoring-rubrics rubric-stability: two implementations of one composite).
//
// Upgraded (scoring-rubrics score-explanation, unmeasured-honesty): a score ships with its
// breakdown - each dimension measured or absent, and the coverage beside the mean - and an
// absent dimension is never a zero. A one-shot effect has no seam, so `loop_seam` is not one of
// its dimensions at all (v1 `dimsFor`): scoring it would put a number on a property the sound
// does not have.

export type RubricKind = "music" | "sfx";

/** v1 lib/sound/types.ts RUBRIC, in its order: the order the keys walk. */
export const RUBRIC: { readonly [K in RubricKind]: readonly string[] } = {
  music: ["melody", "instrument_choice", "instrument_quality"],
  sfx: ["event_match", "sound_quality", "loop_seam"],
};

/** A kept take whose mean reaches this is "proven" (v1 lib/sound/types.ts Verdict). */
export const PROVEN_MEAN = 7;

export const SCORE_MIN = 1;
export const SCORE_MAX = 10;

export type Ratings = Readonly<Record<string, number | null>>;

/** v1 format.ts DIM_LABEL: a dimension's words and its three-letter row label. */
const DIM: Readonly<Record<string, { readonly label: string; readonly short: string }>> = {
  melody: { label: "melody", short: "MEL" },
  instrument_choice: { label: "instrument choice", short: "CHO" },
  instrument_quality: { label: "instrument quality", short: "QUA" },
  event_match: { label: "event match", short: "EVT" },
  sound_quality: { label: "sound quality", short: "SND" },
  loop_seam: { label: "loop seam", short: "SEAM" },
};

export const dimLabel = (d: string): { readonly label: string; readonly short: string } => DIM[d] ?? { label: d.replace(/_/g, " "), short: d.slice(0, 3).toUpperCase() };

/** The dimensions a take is scored on: its kind's, without the seam on an effect that is not a loop. */
export function dimsFor(t: { readonly kind: RubricKind; readonly loop: boolean | null }): readonly string[] {
  const all = RUBRIC[t.kind];
  return t.kind === "sfx" && t.loop !== true ? all.filter((d) => d !== "loop_seam") : all;
}

const scored = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * v1 lib/sound/ledger.ts `rubricMean`, the ledger's `score`: the mean over the kind's dimensions
 * the take carries; a bag with none of them but other numbers (scored before the sfx rubric
 * existed) averages what it has. Null when nothing is scored - never 0.
 */
export function rubricMean(kind: RubricKind, ratings: Ratings | null | undefined): number | null {
  if (ratings === null || ratings === undefined) return null;
  let vals = RUBRIC[kind].map((k) => ratings[k]).filter(scored);
  if (vals.length === 0) vals = Object.values(ratings).filter(scored);
  return vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Kept, and its mean reaches PROVEN_MEAN. An unscored keep is kept, not proven and not failed. */
export function isProven(t: { readonly kind: RubricKind; readonly verdict: string; readonly ratings: Ratings | null | undefined }): boolean {
  if (t.verdict !== "kept") return false;
  const m = rubricMean(t.kind, t.ratings);
  return m !== null && m >= PROVEN_MEAN;
}

export type DimScore = { readonly dim: string; readonly label: string; readonly short: string; readonly value: number | null };

/** The breakdown that ships with the mean: every dimension of the take, scored or absent. */
export type RubricRead = {
  readonly dims: readonly DimScore[];
  readonly mean: number | null;
  /** Dimensions scored, of those the take has. */
  readonly scored: number;
  readonly of: number;
  readonly proven: boolean;
};

export function readRubric(t: { readonly kind: RubricKind; readonly loop: boolean | null; readonly verdict: string; readonly ratings: Ratings }): RubricRead {
  const ds = dimsFor(t);
  const dims = ds.map((dim) => {
    const v = t.ratings[dim];
    return { dim, ...dimLabel(dim), value: scored(v) ? v : null };
  });
  return { dims, mean: rubricMean(t.kind, t.ratings), scored: dims.filter((d) => d.value !== null).length, of: ds.length, proven: isProven(t) };
}

/** The mean as drawn: one decimal, or a dash for nothing scored. */
export const meanWord = (m: number | null): string => (m === null ? "—" : (Math.round(m * 10) / 10).toFixed(1));

/** The number row, as v1's judge read it: 1-9 score themselves, 0 is ten. */
export function scoreOfKey(key: string): number | null {
  if (!/^[0-9]$/.test(key)) return null;
  return key === "0" ? SCORE_MAX : Number(key);
}

export type RatingsCheck = { readonly ok: true; readonly ratings: Ratings } | { readonly ok: false; readonly error: string };

/**
 * The door a rating crosses (the client before it sends, lib/sound/rubric.ts before it writes):
 * whole scores 1-10 on the take's own dimensions, or null to clear one. v1 accepted any
 * `[a-z_]` key and rounded to a tenth (lib/sound/takes.ts `ratingsOf`), so a typo'd dimension
 * was a silent extra number in the mean; here a dimension the take does not have is refused.
 */
export function checkRatings(t: { readonly kind: RubricKind; readonly loop: boolean | null }, ratings: Ratings): RatingsCheck {
  const dims = dimsFor(t);
  const keys = Object.keys(ratings);
  if (keys.length === 0) return { ok: false, error: "no dimension scored" };
  for (const k of keys) {
    if (!dims.includes(k)) return { ok: false, error: `${k.replace(/_/g, " ")} is not scored on ${t.kind === "sfx" && t.loop !== true ? "a one-shot effect" : `a ${t.kind} take`}` };
    const v = ratings[k];
    if (v === null || v === undefined) continue;
    if (!Number.isInteger(v) || v < SCORE_MIN || v > SCORE_MAX) return { ok: false, error: `${dimLabel(k).label} is scored ${SCORE_MIN}-${SCORE_MAX}, not ${String(v)}` };
  }
  return { ok: true, ratings };
}
