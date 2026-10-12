// REFERENCE TRACKS — the measured reference recordings, how each tempo and key
// method did against the known truth, and the concept a reference yields. Split
// out of book.ts. Moved verbatim.
import { REFERENCES, type ReferenceTrack } from "./audioRefs";
import { verdict } from "./derived";
import type { Seed } from "./prompts";
import type { Take } from "./take";
import type { Facet } from "./vocabulary";

/* ── reference tracks ──────────────────────────────────────────────────── */

export interface TempoError {
  ok: boolean;
  pct: number;
  kind: string;
}

/** What kind of tempo error a method made: the method matters, not just the
 *  number. A half-time read is a different failure from a 20% miss. */
export function tempoError(est: number, truth: number): TempoError {
  const r = est / truth;
  const pct = Math.abs(r - 1) * 100;
  const named = (
    [
      [0.5, "half-time"],
      [2, "double-time"],
      [2 / 3, "2:3"],
      [3 / 2, "3:2"],
      [3 / 4, "3:4"],
      [4 / 3, "4:3"],
    ] as const
  ).find(([k]) => Math.abs(r / k - 1) < 0.03);
  if (pct <= 3) return { ok: true, pct, kind: `within ${pct.toFixed(1)}%` };
  if (named) return { ok: false, pct, kind: `${named[1]} error` };
  return { ok: false, pct, kind: `${pct.toFixed(0)}% off` };
}

const REL_OF: Record<string, string> = {
  "D minor": "F major",
  "F major": "D minor",
  "A minor": "C major",
  "C major": "A minor",
  "G minor": "Bb major",
  "Bb major": "G minor",
  "F minor": "Ab major",
  "Ab major": "F minor",
};

export type KeyRelation = "exact" | "relative" | "wrong";

export function keyRelation(est: string, truth: string): KeyRelation {
  if (est === truth) return "exact";
  if (REL_OF[est] === truth) return "relative";
  return "wrong";
}

export interface RefMethodRow {
  id: "librosa" | "fft_autocorr";
  label: string;
  tempo: number;
  key: string;
  err: TempoError;
  keyRel: KeyRelation;
}

export interface RefView {
  ref: ReferenceTrack;
  methods: RefMethodRow[];
  children: Take[];
  kept: number;
  rejected: number;
}

export function references(takes: readonly Take[]): RefView[] {
  return REFERENCES.map((ref) => {
    const kids = takes.filter((t) => t.reference_track_id === ref.id);
    const row = (id: "librosa" | "fft_autocorr", label: string): RefMethodRow => {
      const m = ref.measured[id];
      return {
        id,
        label,
        tempo: m.tempo_bpm,
        key: m.key,
        err: tempoError(m.tempo_bpm, ref.truth.tempo_bpm),
        keyRel: keyRelation(m.key, ref.truth.key),
      };
    };
    return {
      ref,
      methods: [row("librosa", "librosa"), row("fft_autocorr", "fft autocorr")],
      children: kids,
      kept: kids.filter((k) => k.status === "kept").length,
      rejected: kids.filter((k) => k.status === "rejected").length,
    };
  });
}

/** The concept a reference yields: its measured tempo/key plus the terms its
 *  kept descendants share. No model guesses a genre here (core.js#conceptFor). */
export function conceptFor(refId: string, measured: { tempo: number; key: string }, takes: readonly Take[]): Seed {
  const kids = takes.filter((t) => t.reference_track_id === refId && t.kind === "track");
  const top = (k: Facet, n: number) => {
    const c = new Map<string, number>();
    for (const t of kids) {
      const v = verdict(t);
      const w = v === "proven" ? 2 : v === "kept" ? 1 : v === "rejected" ? -1 : 0;
      for (const term of t[k]) c.set(term, (c.get(term) ?? 0) + w);
    }
    return [...c.entries()]
      .filter((e) => e[1] > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map((e) => e[0]);
  };
  return {
    genres: top("genre_tags", 2),
    moods: top("mood_tags", 2),
    instruments: top("instrumentation", 4),
    bpm: measured.tempo,
    key: measured.key,
    avoid: [],
  };
}

/** Proven tracks near a measured tempo; their terms are the suggestion. */
export function nearestTerms(tempo: number, takes: readonly Take[]) {
  const near = takes.filter(
    (t) => t.kind === "track" && t.tempo_bpm && Math.abs(t.tempo_bpm - tempo) <= 8 && verdict(t) === "proven",
  );
  const pool = near.length ? near : takes.filter((t) => t.kind === "track" && verdict(t) === "proven");
  const top = (k: Facet) => {
    const c = new Map<string, number>();
    for (const t of pool) for (const x of t[k]) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  };
  return {
    genres: top("genre_tags").slice(0, 2),
    moods: top("mood_tags").slice(0, 2),
    instruments: top("instrumentation").slice(0, 4),
    evidence: pool.length,
  };
}
