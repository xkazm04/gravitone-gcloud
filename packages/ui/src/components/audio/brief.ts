// BRIEF VS MEASURED - did a take do what its brief asked: tempo, key, length. Pure (Phase 6, L66).
//
// v1's judge drew the asked figures beside the measured ones in its right column and flagged a
// tempo off by more than 4 % (app/playground/triage/Judge.tsx over shared/format.ts `tempoOff`),
// so a verdict was made with the brief in view - which turns the verdict into evidence about the
// PROMPT, not only about taste. The Board's audio cull showed the prompt as text and nothing
// else; this is what both the Board tile and the /audio rubric read now.
//
// ./audio.ts `measureCells` already draws the six measured cells and marks a disagreement in
// amber, at 3 % and with a half-time read counted as one - right for a detail panel, whose job
// is to show what the bytes are. This answers a different question, "did the PROVIDER ignore
// its brief", and keeps v1's reason for its looser rule: a clean double or half is the onset
// tracker's octave error, not the provider's miss (v1 `tempoOff`), so it is named `octave` and
// never counted against the take.
//
// Three states are kept apart that a plain number would merge (measurement-honesty
// unmeasurable-vs-zero): a brief that asked nothing (`unasked`), a take nobody could measure
// (`unmeasured`), and a measure that agrees (`held`). Only `missed` counts.

export type BriefKind = "music" | "sfx";
export type Axis = "tempo" | "key" | "length";
export type AxisVerdict = "held" | "missed" | "octave" | "unmeasured" | "unasked";

export type BriefAsked = { readonly tempoBpm: number | null; readonly key: string | null; readonly durationS: number | null };
export type BriefMeasured = { readonly tempoBpm: number | null; readonly key: string | null; readonly durationS: number | null };

export type AxisCheck = {
  readonly axis: Axis;
  readonly verdict: AxisVerdict;
  readonly asked: string | null;
  readonly measured: string | null;
  /** Signed, in the axis's unit (bpm, seconds); only on a miss of a numeric axis. */
  readonly delta?: string;
};

export type BriefCheck = { readonly axes: readonly AxisCheck[]; readonly missed: number };

/** v1 tempoOff's tolerance: 4 % either way. */
export const TEMPO_TOLERANCE = 0.04;
/** A render is never cut to the frame it was asked; under ten seconds a second is a lot. */
export const LENGTH_TOLERANCE = { seconds: 1, share: 0.1 } as const;

const near = (a: number, b: number): boolean => Math.abs(a - b) / b <= TEMPO_TOLERANCE;
const bpm = (n: number): string => String(Math.round(n * 10) / 10);
const signed = (n: number, unit: string): string => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n)}${unit}`;
/** Rounded half away from zero: a take 21.5 bpm slow is 22 slow, as it is 22 fast. */
const away = (n: number, step = 1): number => (Math.sign(n) * Math.round(Math.abs(n) / step) * step);

function tempo(asked: number | null, measured: number | null): AxisCheck {
  const base = { axis: "tempo" as const, asked: asked === null ? null : `${bpm(asked)} bpm`, measured: measured === null ? null : `${bpm(measured)} bpm` };
  if (asked === null || asked <= 0) return { ...base, verdict: "unasked" };
  if (measured === null) return { ...base, verdict: "unmeasured" };
  if (near(measured, asked)) return { ...base, verdict: "held" };
  if (near(measured * 2, asked) || near(measured / 2, asked)) return { ...base, verdict: "octave" };
  return { ...base, verdict: "missed", delta: signed(away(measured - asked), " bpm") };
}

const keyNorm = (k: string): string => k.trim().toLowerCase().replace(/\s+/g, " ").replace(/\bmaj(or)?\b/, "major").replace(/\bmin(or)?\b/, "minor");

function key(asked: string | null, measured: string | null): AxisCheck {
  const a = asked === null || asked.trim() === "" ? null : asked.trim();
  const base = { axis: "key" as const, asked: a, measured };
  if (a === null) return { ...base, verdict: "unasked" };
  if (measured === null) return { ...base, verdict: "unmeasured" };
  return { ...base, verdict: keyNorm(a) === keyNorm(measured) ? "held" : "missed" };
}

/** Seconds as the kind reads them: an effect in tenths ("2.5s"), music as m:ss. */
export function lengthWord(kind: BriefKind, s: number): string {
  if (kind === "sfx") return `${Math.round(s * 10) / 10}s`;
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}

function length(kind: BriefKind, asked: number | null, measured: number | null): AxisCheck {
  const base = { axis: "length" as const, asked: asked === null ? null : lengthWord(kind, asked), measured: measured === null ? null : lengthWord(kind, measured) };
  if (asked === null || asked <= 0) return { ...base, verdict: "unasked" };
  if (measured === null) return { ...base, verdict: "unmeasured" };
  const d = measured - asked;
  if (Math.abs(d) <= Math.max(LENGTH_TOLERANCE.seconds, asked * LENGTH_TOLERANCE.share)) return { ...base, verdict: "held" };
  return { ...base, verdict: "missed", delta: signed(kind === "sfx" ? Math.round(away(d, 0.1) * 10) / 10 : away(d), "s") };
}

/** The brief held against the bytes. An effect is briefed by length alone: no tempo, no key. */
export function briefCheck(kind: BriefKind, asked: BriefAsked, measured: BriefMeasured | null): BriefCheck {
  const m = measured ?? { tempoBpm: null, key: null, durationS: null };
  const axes = kind === "sfx" ? [length(kind, asked.durationS, m.durationS)] : [tempo(asked.tempoBpm, m.tempoBpm), key(asked.key, m.key), length(kind, asked.durationS, m.durationS)];
  return { axes, missed: axes.filter((a) => a.verdict === "missed").length };
}

/** One axis as a line of work facts: `tempo 120 → 96 bpm −24 bpm`. Only the axes worth saying. */
export function axisWords(a: AxisCheck): string | null {
  switch (a.verdict) {
    case "missed":
      return `${a.axis} ${a.asked ?? "?"} → ${a.measured ?? "?"}${a.delta === undefined ? "" : ` ${a.delta}`}`;
    case "octave":
      return `${a.axis} ${a.asked ?? "?"} → ${a.measured ?? "?"} octave`;
    default:
      return null;
  }
}

/** The misses (and octave reads) of a check as one short line, or null when the brief held. */
export function briefWords(c: BriefCheck): string | null {
  const said = c.axes.map(axisWords).filter((w): w is string => w !== null);
  return said.length === 0 ? null : said.join(" · ");
}
