// THE RECIPE BOOK'S MODEL — every number the audio module draws, read off the
// takes on each render. Pure: no React, no storage, no clock except where a
// caller passes one.
//
// Ported from the contest entry's core.js (the WB object) and app.js's derived
// half. The shape of the argument is unchanged: a take's verdict is the
// person's (kept / rejected / not yet); "proven" is a kept take that also
// SCORES — kept-but-weak is its own state (core.js#verdict). A term's evidence
// is read off the ledger every time and never stored; only the team's hand
// (prefer / avoid, and the phrasing a term becomes in a prompt) persists.

// The kit's own clock, from its module rather than the kit index: the index
// imports the kit's stylesheets, and this model is also read by a Node probe
// (tests/golden-path/library-audio.probe.spec.ts) that has no CSS loader.
import { clock } from "@/components/kit/Player";
import type { Asset, AudioMeta, LabEditMode, LabOp, MeasuredAudio } from "@/lib/assets";
import type { WirePlan } from "@/lib/music/types";

import { REFERENCES, refById, type ReferenceTrack } from "./audioRefs";

/* ── the take ─────────────────────────────────────────────────────────── */

export type Kind = "track" | "sfx";
export type Status = "kept" | "rejected" | "unrated";
export type Verdict = "proven" | "kept" | "unjudged" | "rejected";
export const VORDER: readonly Verdict[] = ["proven", "kept", "unjudged", "rejected"];

export type RatingKey = "melody" | "instrument_choice" | "instrument_quality";
export type Ratings = Record<RatingKey, number | null>;

export const RUBRIC: readonly {
  key: RatingKey;
  short: string;
  label: string;
}[] = [
  { key: "melody", short: "MEL", label: "Melody" },
  { key: "instrument_choice", short: "CHO", label: "Instrument choice" },
  { key: "instrument_quality", short: "QUA", label: "Instrument quality" },
];

export interface Take {
  id: string;
  kind: Kind;
  title: string;
  duration_s: number | null;
  vendor: string | null;
  status: Status;
  created_at: number;
  ratings: Ratings | null;
  reject_reason: string | null;
  genre_tags: string[];
  mood_tags: string[];
  instrumentation: string[];
  tempo_bpm: number | null;
  key: string | null;
  reference_track_id: string | null;
  prompt_round: string | null;
  sfx_category: string | null;
  loopable: boolean;
  parent_id: string | null;
  draft_id: string | null;
  prompt_text: string | null;
  /** The returned file's name, when the take came back from a vendor. */
  file_name: string | null;
  /** Its bytes in studioDb's uploads store (lib/assets#putUploads). Null for a
   *  fixture row, which has none and plays through ./engine.ts's sketch. */
  upload_id: string | null;
  // ── what the Sound lab (app/playground) records on a take it rendered. All
  // null on a fixture row and on a file returned by hand: they are facts the
  // render handed back, never something this module infers.
  /** How the lab made it: one prompt, a rendered plan, a section edit, an effect. */
  lab_op: LabOp | null;
  /** The vendor's stored-song id — the handle a later section edit references. */
  song_id: string | null;
  /** The vendor's own composition plan for what was rendered. */
  plan: WirePlan | null;
  /** A section edit's per-section mode, in plan order. */
  edit_modes: LabEditMode[] | null;
  /** Magnitude per slice, measured off the bytes (./analysis.ts). */
  peaks: number[] | null;
  /** Tempo and key MEASURED on the bytes — beside `tempo_bpm`/`key`, which are
   *  what the recipe asked for. The two disagreeing is a finding, not a bug. */
  measured: MeasuredAudio | null;
  /** The one change that produced this take, when it came out of a fan-out. */
  variation: { axis: string; diff: string[] } | null;
  hunt_id: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const EDIT_MODES: readonly LabEditMode[] = ["keep", "low", "medium", "high", "free"];
const LAB_OPS: readonly LabOp[] = ["compose", "plan", "section-edit", "sfx"];

function planOf(v: unknown): WirePlan | null {
  if (!v || typeof v !== "object") return null;
  const chunks = (v as { chunks?: unknown }).chunks;
  return Array.isArray(chunks) ? ({ chunks } as WirePlan) : null;
}

function measuredOf(v: unknown): MeasuredAudio | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const tempo = num(m.tempo_bpm);
  const key = str(m.key);
  if (tempo == null || !key) return null;
  const e = m.energy;
  return {
    tempo_bpm: tempo,
    key,
    energy: e === "high" || e === "medium" || e === "low" ? e : null,
    method: str(m.method) ?? "unknown",
  };
}

function variationOf(v: unknown): { axis: string; diff: string[] } | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const axis = str(r.axis);
  return axis ? { axis, diff: strs(r.diff) } : null;
}

function ratingsOf(v: unknown): Ratings | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  return {
    melody: num(r.melody),
    instrument_choice: num(r.instrument_choice),
    instrument_quality: num(r.instrument_quality),
  };
}

/** An audio Asset as the book reads it. `meta` is an untyped bag (lib/assets
 *  #AudioMeta is a cast, not a schema), so every field is read defensively and
 *  an absent one is null — never a guessed default. A stored "proven" (the
 *  previous module wrote it) reads as kept: proven is derived here. */
export function takeFromAsset(a: Asset): Take {
  const m = (a.meta ?? {}) as Record<string, unknown>;
  const v = m.verdict as AudioMeta["verdict"] | undefined;
  return {
    id: a.id,
    kind: str(m.sfx_category) ? "sfx" : "track",
    title: a.name,
    duration_s: num(m.duration_s),
    vendor: str(m.vendor),
    status: v === "kept" || v === "proven" ? "kept" : v === "rejected" ? "rejected" : "unrated",
    created_at: a.createdAt,
    ratings: ratingsOf(m.ratings),
    reject_reason: str(m.reject_reason),
    genre_tags: strs(m.genre_tags),
    mood_tags: strs(m.mood_tags),
    instrumentation: strs(m.instrumentation),
    tempo_bpm: num(m.tempo_bpm),
    key: str(m.key),
    reference_track_id: str(m.reference_track_id),
    prompt_round: str(m.prompt_round),
    sfx_category: str(m.sfx_category),
    loopable: m.loopable === true,
    parent_id: str(m.parent_id),
    draft_id: str(m.draft_id),
    prompt_text: str(m.prompt_text),
    file_name: str(m.fileName),
    upload_id: str(m.uploadId),
    lab_op: LAB_OPS.find((o) => o === m.lab_op) ?? null,
    song_id: str(m.song_id),
    plan: planOf(m.plan),
    edit_modes: Array.isArray(m.edit_modes)
      ? m.edit_modes.map((x) => EDIT_MODES.find((e) => e === x) ?? "keep")
      : null,
    peaks: Array.isArray(m.peaks) ? m.peaks.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : 0)) : null,
    measured: measuredOf(m.measured),
    variation: variationOf(m.variation),
    hunt_id: str(m.hunt_id),
  };
}

export function score(t: Take): number | null {
  if (!t.ratings) return null;
  const v = RUBRIC.map((r) => t.ratings![r.key]).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function verdict(t: Take): Verdict {
  if (t.status === "rejected") return "rejected";
  if (t.status === "kept") return (score(t) ?? 0) >= 7 ? "proven" : "kept";
  return "unjudged";
}

/** The rubric dimensions a take can be scored on. A looping effect has no
 *  melody (app.js#dimsFor). */
export function dimsFor(t: Take | undefined): number[] {
  return RUBRIC.map((_, i) => i).filter((i) => !(t && t.kind === "sfx" && t.loopable && i === 0));
}

export function counts(rows: readonly Take[]): Record<Verdict, number> {
  const c: Record<Verdict, number> = {
    proven: 0,
    kept: 0,
    unjudged: 0,
    rejected: 0,
  };
  for (const r of rows) c[verdict(r)]++;
  return c;
}

/** Reject reasons in use, most common first. */
export function reasons(takes: readonly Take[]): [string, number][] {
  const c = new Map<string, number>();
  for (const t of takes) if (t.reject_reason) c.set(t.reject_reason, (c.get(t.reject_reason) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

/* ── the vocabulary ────────────────────────────────────────────────────── */

export type Facet = "genre_tags" | "mood_tags" | "instrumentation";
export type TermFacet = Facet | "sfx_category";
export type Stance = "prefer" | "avoid";

export interface Hand {
  stance?: Stance | null;
  phrase?: string;
}

export interface TermEntry {
  id: string;
  term: string;
  facet: TermFacet;
  n: number;
  kept: number;
  proven: number;
  rejected: number;
  judged: number;
  avg: number | null;
  keepRate: number | null;
  stance: Stance | null;
  phrase: string;
  topReason: [string, number] | null;
  sfx: boolean;
}

export const FACETS: readonly { key: Facet; label: string }[] = [
  { key: "genre_tags", label: "Genre" },
  { key: "mood_tags", label: "Mood" },
  { key: "instrumentation", label: "Instrument" },
];

interface Acc {
  n: number;
  kept: number;
  proven: number;
  rejected: number;
  sum: number;
  rated: number;
  reasons: Map<string, number>;
}

function tally(acc: Acc, t: Take) {
  acc.n++;
  const v = verdict(t);
  if (v === "proven") acc.proven++;
  if (v === "proven" || v === "kept") acc.kept++;
  if (v === "rejected") {
    acc.rejected++;
    if (t.reject_reason) acc.reasons.set(t.reject_reason, (acc.reasons.get(t.reject_reason) ?? 0) + 1);
  }
  const s = score(t);
  if (s != null) {
    acc.sum += s;
    acc.rated++;
  }
}

function finish(id: string, term: string, facet: TermFacet, acc: Acc, hand: Hand | undefined): TermEntry {
  const judged = acc.kept + acc.rejected;
  const top = [...acc.reasons.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    id,
    term,
    facet,
    n: acc.n,
    kept: acc.kept,
    proven: acc.proven,
    rejected: acc.rejected,
    judged,
    avg: acc.rated ? acc.sum / acc.rated : null,
    keepRate: judged ? acc.kept / judged : null,
    stance: facet === "sfx_category" ? null : (hand?.stance ?? null),
    phrase: facet === "sfx_category" ? "" : (hand?.phrase ?? ""),
    topReason: top,
    sfx: facet === "sfx_category",
  };
}

const fresh = (): Acc => ({
  n: 0,
  kept: 0,
  proven: 0,
  rejected: 0,
  sum: 0,
  rated: 0,
  reasons: new Map(),
});

/** Track terms, one entry per facet:term, with the team's hand laid over. */
export function vocabulary(takes: readonly Take[], hands: Record<string, Hand>): TermEntry[] {
  const m = new Map<string, { term: string; facet: Facet; acc: Acc }>();
  for (const t of takes) {
    if (t.kind !== "track") continue;
    for (const f of FACETS)
      for (const term of t[f.key]) {
        const k = `${f.key}:${term}`;
        if (!m.has(k)) m.set(k, { term, facet: f.key, acc: fresh() });
        tally(m.get(k)!.acc, t);
      }
  }
  return [...m.entries()].map(([id, e]) => finish(id, e.term, e.facet, e.acc, hands[id]));
}

/** Effect categories, read the same way. No stance: a category is not a word
 *  that goes into a prompt (app.js#sfxVocab). */
export function sfxVocabulary(takes: readonly Take[]): TermEntry[] {
  const m = new Map<string, Acc>();
  for (const t of takes) {
    if (t.kind !== "sfx" || !t.sfx_category) continue;
    if (!m.has(t.sfx_category)) m.set(t.sfx_category, fresh());
    tally(m.get(t.sfx_category)!, t);
  }
  return [...m.entries()].map(([term, acc]) => finish(`sfx_category:${term}`, term, "sfx_category", acc, undefined));
}

export type TermSort = "rate" | "n" | "name";

/** "keep %" sorts by a Laplace-smoothed rate, so one kept take of one does not
 *  outrank nine of ten (app.js#sortTerms). */
export function sortTerms(list: readonly TermEntry[], k: TermSort): TermEntry[] {
  return list
    .slice()
    .sort((a, b) =>
      k === "name"
        ? a.term.localeCompare(b.term)
        : k === "n"
          ? b.n - a.n || a.term.localeCompare(b.term)
          : (b.kept + 1) / (b.judged + 2) - (a.kept + 1) / (a.judged + 2) || b.judged - a.judged,
    );
}

/* ── prompts: text for a human to paste, never a request ───────────────── */

export type Target = "suno" | "elevenlabs";

export interface Seed {
  genres: string[];
  moods: string[];
  instruments: string[];
  bpm: number | null;
  key: string | null;
  avoid: string[];
}

export const blankSeed = (): Seed => ({
  genres: [],
  moods: [],
  instruments: [],
  bpm: null,
  key: null,
  avoid: [],
});

export function seedOf(t: Take): Seed {
  return {
    genres: t.genre_tags.slice(),
    moods: t.mood_tags.slice(),
    instruments: t.instrumentation.slice(),
    bpm: t.tempo_bpm,
    key: t.key,
    avoid: [],
  };
}

const phraseOf = (hands: Record<string, Hand>, facet: Facet, term: string) => hands[`${facet}:${term}`]?.phrase || term;

/** The two vendors' prompt dialects (core.js#compose): ElevenLabs reads a
 *  sentence, Suno a style line plus section tags. */
export function compose(seed: Seed, target: Target, hands: Record<string, Hand>): string {
  const g = seed.genres.map((t) => phraseOf(hands, "genre_tags", t));
  const mo = seed.moods.map((t) => phraseOf(hands, "mood_tags", t));
  const ins = seed.instruments.map((t) => phraseOf(hands, "instrumentation", t));
  const avoid = seed.avoid;
  const tk = [seed.bpm ? `${Math.round(seed.bpm)} BPM` : null, seed.key || null].filter((x): x is string => Boolean(x));
  if (target === "elevenlabs") {
    const head = [mo.join(", "), g.join(" / ")].filter(Boolean).join(" ");
    let s = `${head ? head.charAt(0).toUpperCase() + head.slice(1) : "Instrumental"} instrumental`;
    if (tk.length) s += `, ${tk.join(", ")}`;
    if (ins.length)
      s += `. Built on ${ins.slice(0, -1).join(", ")}${ins.length > 1 ? " and " : ""}${ins[ins.length - 1]}.`;
    if (avoid.length) s += ` No ${avoid.join(", no ")}.`;
    return s;
  }
  const style = [...g, ...mo, ...ins, ...tk].join(", ");
  const lines = [`Style: ${style}`];
  if (avoid.length) lines.push(`Exclude: ${avoid.join(", ")}`);
  lines.push("", "[Instrumental]", "[Intro]", "[Build]", "[Drop]", "[Breakdown]", "[Outro]");
  return lines.join("\n");
}

/* ── variations: one axis each, so a verdict on the result says which axis mattered ── */

export interface Variation {
  axis: "swap" | "mood" | "tempo" | "key" | "fence";
  diff: string[];
  seed: Seed;
  why: string;
}

const REL: Record<string, string> = {
  "A minor": "C major",
  "C major": "A minor",
  "F minor": "Ab major",
  "D minor": "F major",
  "F major": "D minor",
  "E minor": "G major",
  "G minor": "Bb major",
  "C minor": "Eb major",
  "B minor": "D major",
  "G major": "E minor",
};

const pctKept = (e: TermEntry) => (e.keepRate != null ? `${Math.round(e.keepRate * 100)}% kept` : "");

export function variations(t: Take, voc: readonly TermEntry[]): Variation[] {
  if (t.kind !== "track") return [];
  return variationsOfSeed(seedOf(t), voc);
}

/** The one-change variations of a SEED, which is what `variations` always
 *  read off a take (its terms, tempo and key — `seedOf`). Split out so a
 *  recipe that is not yet a take — the Sound lab's working seed, a reference
 *  track's concept — fans out by the same rules rather than a second copy of
 *  them (app/playground/labModel.ts#fanOut). For a take the result is
 *  identical: `seedOf` starts with no fence, so the fence line below adds
 *  exactly the one term it always did. */
export function variationsOfSeed(base: Seed, voc: readonly TermEntry[]): Variation[] {
  const best = (facet: Facet, not: string[]) =>
    voc
      .filter((v) => v.facet === facet && !not.includes(v.term) && v.stance !== "avoid" && v.judged >= 2)
      .sort(
        (a, b) =>
          Number(b.stance === "prefer") - Number(a.stance === "prefer") ||
          (b.keepRate ?? 0) - (a.keepRate ?? 0) ||
          (b.avg ?? 0) - (a.avg ?? 0),
      )[0];
  const worst = (facet: Facet, among: string[]) =>
    voc
      .filter((v) => v.facet === facet && among.includes(v.term))
      .sort((a, b) => (a.stance === "avoid" ? -1 : 0) || (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  const clone = (): Seed => ({
    genres: base.genres.slice(),
    moods: base.moods.slice(),
    instruments: base.instruments.slice(),
    bpm: base.bpm,
    key: base.key,
    avoid: base.avoid.slice(),
  });
  const out: Variation[] = [];
  const wi = worst("instrumentation", base.instruments);
  const bi = best("instrumentation", base.instruments);
  if (wi && bi) {
    const s = clone();
    s.instruments = s.instruments.map((x) => (x === wi.term ? bi.term : x));
    out.push({
      axis: "swap",
      diff: [`−${wi.term}`, `+${bi.term}`],
      seed: s,
      why: pctKept(bi),
    });
  }
  const wm = worst("mood_tags", base.moods);
  const bm = best("mood_tags", base.moods);
  if (wm && bm) {
    const s = clone();
    s.moods = s.moods.map((x) => (x === wm.term ? bm.term : x));
    out.push({
      axis: "mood",
      diff: [`−${wm.term}`, `+${bm.term}`],
      seed: s,
      why: pctKept(bm),
    });
  }
  const bpm = base.bpm || 100;
  for (const d of [-6, 6]) {
    const s = clone();
    s.bpm = bpm + d;
    out.push({
      axis: "tempo",
      diff: [`${d > 0 ? "+" : ""}${d} BPM`],
      seed: s,
      why: `${Math.round(bpm + d)} BPM`,
    });
  }
  if (base.key && REL[base.key]) {
    const s = clone();
    s.key = REL[base.key];
    out.push({
      axis: "key",
      diff: [`${base.key} → ${REL[base.key]}`],
      seed: s,
      why: "relative",
    });
  }
  const fence =
    voc.find((v) => v.stance === "avoid" && v.facet === "instrumentation" && !base.instruments.includes(v.term)) ??
    voc
      .filter((v) => v.facet === "instrumentation" && v.judged >= 4 && !base.instruments.includes(v.term))
      .sort((a, b) => (a.keepRate ?? 1) - (b.keepRate ?? 1))[0];
  if (fence) {
    const s = clone();
    s.avoid = [...s.avoid.filter((x) => x !== fence.term), fence.term];
    out.push({
      axis: "fence",
      diff: [`no ${fence.term}`],
      seed: s,
      why: pctKept(fence),
    });
  }
  return out;
}

/* ── drafts: the manual round-trip through Suno / ElevenLabs ───────────── */

export interface Draft {
  id: string;
  created_at: number;
  copied_at: number | null;
  text: string;
  target: Target;
  seed: Seed;
  parent_id: string | null;
  ref_id: string | null;
  /** Set when the draft was one lane of a Sound lab hunt (app/playground):
   *  the return then joins that hunt, carrying the change it was sent for.
   *  Absent on every draft the Library writes. */
  hunt_id?: string;
  variation?: { axis: string; diff: string[] };
}

/** A draft's returns are the takes that name it — derived, not stored, so a
 *  deleted take cannot linger in a draft's list. */
export const returnsOf = (draftId: string, takes: readonly Take[]) => takes.filter((t) => t.draft_id === draftId);

/** A new draft, before it is copied. Was inline in AudioWorkbench#copyDraft;
 *  lifted so the Sound lab files its Suno drafts into the SAME book, and a
 *  return dropped in either place attaches to the draft that asked for it. */
export function newDraft(
  seed: Seed,
  target: Target,
  text: string,
  parent: string | null,
  ref: string | null,
  now: number = Date.now(),
): Draft {
  return {
    id: `dr-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    created_at: now,
    copied_at: null,
    text,
    target,
    seed,
    parent_id: parent,
    ref_id: ref,
  };
}

/** What a returned file is filed with: its draft, its parent, the recipe it
 *  was asked for (core.js#attachReturn). Was inline in AudioWorkbench#attach;
 *  the Sound lab's drop zone files through the same function. Absent fields
 *  are dropped, never written as undefined. */
export function returnMeta(d: Draft | undefined, parent: Take | undefined): Partial<AudioMeta> {
  const seed = d?.seed ?? (parent ? seedOf(parent) : blankSeed());
  const meta: Partial<AudioMeta> = {
    vendor: d?.target,
    parent_id: parent?.id,
    draft_id: d?.id,
    prompt_text: d?.text,
    genre_tags: seed.genres,
    mood_tags: seed.moods,
    instrumentation: seed.instruments,
    tempo_bpm: seed.bpm ?? undefined,
    key: seed.key ?? undefined,
    reference_track_id: parent?.reference_track_id ?? d?.ref_id ?? undefined,
    sfx_category: parent?.sfx_category ?? undefined,
    loopable: parent ? parent.loopable : undefined,
    hunt_id: d?.hunt_id,
    variation: d?.variation,
  };
  for (const k of Object.keys(meta) as (keyof AudioMeta)[]) if (meta[k] === undefined) delete meta[k];
  return meta;
}

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

/* ── the ledger's grouping ─────────────────────────────────────────────── */

export const ROUNDS: Record<string, { s: string; retired: boolean; label: string }> = {
  round1: { s: "r1 fft", retired: false, label: "round 1 · fft autocorr" },
  round2: { s: "r2 librosa", retired: false, label: "round 2 · librosa" },
  round3: { s: "r3 cloud", retired: true, label: "round 3 · cloud read" },
};

export const roundOf = (k: string) => ROUNDS[k.slice(0, 6)] ?? { s: k, retired: false, label: k };

const FAMILY: Record<string, string> = {
  "nu-disco": "House & disco",
  "80s french touch": "House & disco",
  "deep house": "House & disco",
  "melodic house": "House & disco",
  "progressive house": "House & disco",
  "organic house": "House & disco",
  synthwave: "Synth & retro",
  "retro electronic": "Synth & retro",
  outrun: "Synth & retro",
  "future bass": "Bass music",
  "melodic dubstep": "Bass music",
  chillstep: "Bass music",
  "drum and bass": "Bass music",
  "liquid dnb": "Bass music",
  trap: "Bass music",
  "dark trap": "Bass music",
  "808-driven": "Bass music",
  "boom bap": "Hip hop & downtempo",
  "jazz rap": "Hip hop & downtempo",
  "golden age hip hop": "Hip hop & downtempo",
  "lo-fi hip hop": "Hip hop & downtempo",
  "dusty sample": "Hip hop & downtempo",
  "trip hop": "Hip hop & downtempo",
  downtempo: "Hip hop & downtempo",
  "ambient drone": "Ambient & cinematic",
  textural: "Ambient & cinematic",
  "cinematic ambient": "Ambient & cinematic",
  "orchestral-electronic": "Ambient & cinematic",
};

export function recipeOf(t: Take): string {
  if (t.kind === "sfx") return `Effects · ${t.draft_id ? "drafted" : "no recipe"}`;
  if (t.draft_id) return "Draft returns";
  if (t.reference_track_id) {
    const r = refById(t.reference_track_id);
    return `Ref · ${r ? `${r.artist} — ${r.title}` : t.reference_track_id}`;
  }
  if (t.prompt_round) return `Round · ${roundOf(t.prompt_round).label}`;
  return t.parent_id ? "Returns" : "Hand prompt";
}

export type Grouping = "none" | "recipe" | "family" | "sfx";

export function groupOf(t: Take, g: Grouping): string | null {
  if (g === "recipe") return recipeOf(t);
  if (g === "family") return t.kind === "sfx" ? "Effects" : (FAMILY[t.genre_tags[0] ?? ""] ?? "Other");
  if (g === "sfx") return t.kind === "sfx" ? (t.sfx_category ?? "uncategorized") : "Tracks";
  return null;
}

export function tagsOf(t: Take): string[] {
  return t.kind === "sfx"
    ? [t.sfx_category ?? "", ...(t.loopable ? ["loop"] : [])].filter(Boolean)
    : [...t.genre_tags, ...t.mood_tags, ...t.instrumentation];
}

/* ── formatting ────────────────────────────────────────────────────────── */

export function dur(s: number | null): string {
  if (s == null) return "—";
  return s < 10 ? `${s.toFixed(1)}s` : clock(s);
}

/** When the document opened. Ages are read against this one instant rather
 *  than a clock per render, so a re-render never moves "1h" to "2h" under a
 *  glance — and a render stays a pure function of its inputs. */
export const OPENED_AT = typeof performance !== "undefined" ? performance.timeOrigin : 0;

export function ago(ms: number, now: number): string {
  const d = (now - ms) / 86400000;
  if (d < 0) return new Date(ms).toISOString().slice(0, 10);
  if (d < 1 / 24) return `${Math.max(1, Math.round(d * 1440))}m`;
  if (d < 1) return `${Math.round(d * 24)}h`;
  if (d < 60) return `${Math.round(d)}d`;
  return `${Math.round(d / 30)}mo`;
}

/* ── deterministic waveform shape per row ──────────────────────────────── */

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const peakCache = new Map<string, number[]>();

/** Max-pool (or stretch) a measured envelope to n slices, so a 120-slice
 *  measurement draws in a 96-stroke waveform without losing its transients. */
export function resample(src: readonly number[], n: number): number[] {
  if (src.length === n) return src.slice();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * src.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * src.length));
    let m = 0;
    for (let j = a; j < b && j < src.length; j++) m = Math.max(m, src[j]);
    out.push(m);
  }
  return out;
}

/** A fixture row has no bytes to read a waveform off, so its shape is drawn
 *  from its id: an effect as an attack and decay (or a level for a loop), a
 *  track as four sections. Same rows, same shape, every visit (core.js#peaks). */
export function peaksOf(t: Take, n = 96): number[] {
  // A take whose bytes were measured draws ITS waveform, resampled to n — the
  // shape below is only for a row that has nothing to measure.
  if (t.peaks && t.peaks.length) return resample(t.peaks, n);
  const k = `${t.id}:${n}`;
  const hit = peakCache.get(k);
  if (hit) return hit;
  const r = rng(hash(t.id));
  const out: number[] = [];
  if (t.kind === "sfx") {
    const att = 0.04 + r() * 0.1;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const env = t.loopable
        ? 0.55 + 0.25 * Math.sin(x * 14 + r())
        : x < att
          ? x / att
          : Math.exp(-(x - att) * (3 + r() * 5));
      out.push(Math.max(0.04, Math.min(1, env * (0.7 + r() * 0.3))));
    }
  } else {
    const secs = [0.12 + r() * 0.08, 0.4 + r() * 0.1, 0.62 + r() * 0.08, 0.86 + r() * 0.06];
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const lvl =
        x < secs[0]
          ? 0.25 + x * 2
          : x < secs[1]
            ? 0.6
            : x < secs[2]
              ? 0.35
              : x < secs[3]
                ? 0.9
                : 0.9 - (x - secs[3]) * 6;
      out.push(Math.max(0.05, Math.min(1, lvl * (0.6 + r() * 0.4))));
    }
  }
  peakCache.set(k, out);
  return out;
}
