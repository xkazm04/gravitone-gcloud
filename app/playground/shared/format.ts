// THE SOUND LAB'S READINGS OF A TAKE — pure. No React, no fetch, no clock
// except where a caller passes one. What every module says about a take at
// rest: its mean score, whether it is proven, its rubric dimensions, the words
// for a defect / an origin / a provider. Read by the Node probe
// (tests/golden-path/sound-triage.probe.spec.ts).

import { RUBRIC, type DefectCode, type ProviderId, type SoundKind, type SoundTake, type TakeOrigin } from "@/lib/sound/types";

/** "1:05", "0:04", "—" for unknown. Never "0:00" for a length nobody measured. */
export function dur(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s < 0) return "—";
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}

/** How long a take IS: the decoded file's length when it was measured
 *  (MeasuredSound.durationS), else what the brief asked for, else null. A
 *  Suno return asks for nothing — its length is only ever the measured one. */
export const takeSeconds = (t: Pick<SoundTake, "durationS" | "measured">): number | null =>
  t.measured?.durationS ?? t.durationS ?? null;

/** A take's length in its kind's unit: an effect in tenths of a second
 *  ("2.5s" — a 2.5 s hit is not "0:03"), music as m:ss. */
export function lengthWord(kind: SoundKind, s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s < 0) return "—";
  return kind === "sfx" ? `${Math.round(s * 10) / 10}s` : dur(s);
}

/** "4m", "3h", "2d" — the age of an ISO stamp relative to `now`. */
export function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** The dimensions a take is scored on. A one-shot effect has no seam to judge,
 *  so `loop_seam` is scored only on a take briefed as a loop — scoring it on a
 *  hit would put a number on a property the sound does not have. */
export function dimsFor(t: Pick<SoundTake, "kind" | "loop">): string[] {
  const all = [...RUBRIC[t.kind]];
  return t.kind === "sfx" && t.loop !== true ? all.filter((d) => d !== "loop_seam") : all;
}

/** Mean of the scored dimensions; null when none is scored (never 0). */
export function meanScore(t: Pick<SoundTake, "ratings">): number | null {
  const v = Object.values(t.ratings ?? {}).filter((x): x is number => typeof x === "number");
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** `proven` is read off a kept take's mean (≥ 7), never stored (lib/sound/types.ts#Verdict). */
export function readVerdict(t: Pick<SoundTake, "verdict" | "ratings">): SoundTake["verdict"] | "proven" {
  if (t.verdict !== "kept") return t.verdict;
  const m = meanScore(t);
  return m != null && m >= 7 ? "proven" : "kept";
}

/** Each rubric dimension's name and its three-letter row label. */
export const DIM_LABEL: Record<string, { label: string; short: string }> = {
  melody: { label: "melody", short: "MEL" },
  instrument_choice: { label: "instrument choice", short: "CHO" },
  instrument_quality: { label: "instrument quality", short: "QUA" },
  event_match: { label: "event match", short: "EVT" },
  sound_quality: { label: "sound quality", short: "SND" },
  loop_seam: { label: "loop seam", short: "SEAM" },
};

export const dimLabel = (d: string) => DIM_LABEL[d] ?? { label: d.replace(/_/g, " "), short: d.slice(0, 3).toUpperCase() };

/** A defect code as words — the codes are the wire values (lib/sound/types.ts#DEFECTS). */
export const defectWord = (d: DefectCode | string) => d.replace(/-/g, " ");

/** The defects a judge reaches for first, per kind — the registry's taxonomy
 *  orders them by how often they sink a take of that kind (media-generation /
 *  generated-music-acceptance; sound-effect-generation). Every code stays
 *  reachable; this only decides which ones sit under the number keys first. */
export const DEFECT_ORDER: Record<SoundKind, readonly DefectCode[]> = {
  music: [
    "off-brief",
    "smeared-transients",
    "tempo-instability",
    "section-bleed",
    "broken-ending",
    "spectral-imbalance",
    "vocal-garble",
    "phase-width",
    "confident-hallucination",
    "loop-seam",
    "wrong-event",
  ],
  sfx: [
    "wrong-event",
    "off-brief",
    "smeared-transients",
    "loop-seam",
    "broken-ending",
    "spectral-imbalance",
    "phase-width",
    "confident-hallucination",
    "tempo-instability",
    "section-bleed",
    "vocal-garble",
  ],
};

export const ORIGIN_WORD: Record<TakeOrigin, string> = {
  agent: "agent",
  lab: "lab",
  hunt: "hunt",
  import: "import",
  "suno-return": "suno return",
  fixture: "demo",
};

export const PROVIDER_NAME: Record<ProviderId, string> = {
  elevenlabs: "ElevenLabs",
  suno: "Suno",
  local: "Local",
};

/** What a take's brief asked for, as figures — tempo, key, length. */
export function askedFigures(t: Pick<SoundTake, "kind" | "tempoBpm" | "key" | "durationS">) {
  return {
    tempo: t.kind === "music" && t.tempoBpm != null ? `${Math.round(t.tempoBpm)} BPM` : null,
    key: t.kind === "music" ? t.key : null,
    length: t.durationS != null ? lengthWord(t.kind, t.durationS) : null,
  };
}

/** Whether a measured tempo is off the asked one by more than 4% — or by a
 *  clean double/half, which is the onset tracker's octave error and is NOT a
 *  miss by the provider (app/library/audio/analysis.ts reads 60–180 BPM). */
export function tempoOff(asked: number | null, measured: number | null): boolean {
  if (asked == null || measured == null || asked <= 0) return false;
  const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.04;
  return !(near(measured, asked) || near(measured * 2, asked) || near(measured / 2, asked));
}
