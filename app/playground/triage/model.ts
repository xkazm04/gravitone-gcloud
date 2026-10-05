// TRIAGE'S MODEL — pure. No React, no fetch, no clock except where a caller
// passes one. Read by tests/golden-path/sound-triage.probe.spec.ts.
//
// Triage exists to turn listening into knowledge (the operator, 2026-10-05:
// "judge all generated tracks, goal to use feedback for knowledge extension of
// prompt engineering — discovering which prompt techniques, genres and
// instruments are good choice to understand strengths of each audio
// provider"). So this file holds the three things that decide whether that
// works: the ORDER takes are judged in, the KEYS a judge's hand stays on, and
// how a strengths cell is allowed to speak — which is never with a number when
// fewer than three takes stand behind it (knowledge/README.md's evidence
// contract: nothing below n=3 is claimed).

import {
  TECHNIQUES,
  type GenerateRequest,
  type InsightCell,
  type ProviderId,
  type SoundKind,
  type SoundTake,
  type SoundTerms,
  type TakeOrigin,
} from "@/lib/sound/types";

import { PROVIDER_NAME, meanScore } from "../shared/format";

/* ── the queue ────────────────────────────────────────────────────────── */

/** Agents first: they are the main inflow (pipeline/sound.mts generate lands
 *  takes unjudged with origin "agent"), and a batch an agent made is a batch
 *  somebody is waiting on. Then the operator's own lab batches, hunt renders,
 *  Suno returns, imports. Fixture rows never reach the queue: they are design
 *  samples, excluded from the ledger, so judging one would teach nothing. */
export const ORIGIN_RANK: Record<TakeOrigin, number> = {
  agent: 0,
  lab: 1,
  hunt: 2,
  "suno-return": 3,
  import: 4,
  fixture: 9,
};

/** The judging queue: unjudged, non-fixture takes of one kind — by origin
 *  rank, then OLDEST first, so a batch is heard in the order it was made and
 *  a take that has waited longest is not buried by a fresh one. */
export function queueOrder(takes: readonly SoundTake[], kind?: SoundKind): SoundTake[] {
  return takes
    .filter((t) => t.verdict === "unjudged" && t.origin !== "fixture" && (!kind || t.kind === kind))
    .sort(
      (a, b) =>
        ORIGIN_RANK[a.origin] - ORIGIN_RANK[b.origin] ||
        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

/** Where the judge lands after a take leaves the queue: the take that followed
 *  it, else the one before it, else nothing (the queue is clear). */
export function nextAfter(queue: readonly Pick<SoundTake, "id">[], id: string): string | null {
  const i = queue.findIndex((t) => t.id === id);
  if (i < 0) return queue[0]?.id ?? null;
  return queue[i + 1]?.id ?? queue[i - 1]?.id ?? null;
}

/** Step along a list of ids by `by`, clamped. */
export function step(ids: readonly string[], id: string | null, by: number): string | null {
  if (ids.length === 0) return null;
  const i = id ? ids.indexOf(id) : -1;
  if (i < 0) return ids[0];
  return ids[Math.max(0, Math.min(ids.length - 1, i + by))];
}

/* ── the keys ─────────────────────────────────────────────────────────── */

/**
 * The judge's hand stays on the left of the keyboard and the number row.
 *
 * K and X are the two calls (keep / reject), so next and previous cannot be
 * J/K — K is taken by keep, which the brief names. N / P (next / previous) is
 * the pair that collides with nothing else bound here. ↑/↓ and Tab move the
 * rubric dimension; ←/→ seek, as on every transport in the app.
 *
 * In `defects` mode (after X) the number row toggles defect chips instead of
 * scoring, Enter files the rejection, Escape backs out.
 */
export type TriageAction =
  | { type: "play" }
  | { type: "seek"; by: number }
  | { type: "score"; value: number }
  | { type: "dim"; by: 1 | -1 }
  | { type: "keep" }
  | { type: "reject" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "clear" }
  | { type: "defect"; index: number }
  | { type: "confirm" }
  | { type: "cancel" };

export type KeyMode = "judge" | "defects";

const DEFECT_ROW = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"];

export function resolveKey(key: string, mode: KeyMode, shift = false): TriageAction | null {
  if (key === " ") return { type: "play" };
  if (key === "ArrowLeft") return { type: "seek", by: shift ? -15 : -5 };
  if (key === "ArrowRight") return { type: "seek", by: shift ? 15 : 5 };
  if (mode === "defects") {
    const i = DEFECT_ROW.indexOf(key);
    if (i >= 0) return { type: "defect", index: i };
    if (key === "Enter") return { type: "confirm" };
    if (key === "Escape") return { type: "cancel" };
    return null;
  }
  if (/^[0-9]$/.test(key)) return { type: "score", value: key === "0" ? 10 : Number(key) };
  if (key === "ArrowDown" || (key === "Tab" && !shift)) return { type: "dim", by: 1 };
  if (key === "ArrowUp" || (key === "Tab" && shift)) return { type: "dim", by: -1 };
  switch (key.toLowerCase()) {
    case "k":
      return { type: "keep" };
    case "x":
      return { type: "reject" };
    case "n":
      return { type: "next" };
    case "p":
      return { type: "prev" };
    case "u":
      return { type: "clear" };
  }
  return null;
}

/** The legend, in the order a judgement happens. Same table as resolveKey. */
export const KEYMAP: Record<KeyMode, { keys: string[]; does: string }[]> = {
  judge: [
    { keys: ["Space"], does: "play" },
    { keys: ["←", "→"], does: "seek 5s" },
    { keys: ["1", "…", "0"], does: "score" },
    { keys: ["↑", "↓"], does: "dimension" },
    { keys: ["K"], does: "keep" },
    { keys: ["X"], does: "reject" },
    { keys: ["N", "P"], does: "next · prev" },
    { keys: ["U"], does: "unjudge" },
  ],
  defects: [
    { keys: ["1", "…", "−"], does: "defect" },
    { keys: ["Enter"], does: "reject" },
    { keys: ["Esc"], does: "back" },
  ],
};

/* ── strengths ────────────────────────────────────────────────────────── */

export type Facet = InsightCell["facet"];

export const FACETS: Record<SoundKind, readonly Facet[]> = {
  music: ["genre", "mood", "instrument", "technique"],
  sfx: ["sfxCategory", "technique", "mood"],
};

export const FACET_WORD: Record<Facet, string> = {
  genre: "genre",
  mood: "mood",
  instrument: "instrument",
  technique: "technique",
  sfxCategory: "category",
};

/** Below this, a cell shows how much evidence it is waiting for, never a rate. */
export const MIN_N = 3;

export type CellView =
  | { state: "empty" }
  | { state: "insufficient"; n: number; need: number }
  | {
      state: "measured";
      n: number;
      keepRate: number;
      keepPct: string;
      mean: string | null;
      topDefect: string | null;
      /** -2 … 2: how far the keep rate sits from a coin toss, and which way. */
      heat: -2 | -1 | 0 | 1 | 2;
    };

/** How a strengths cell may speak. n = 0 is empty; n < 3 is insufficient and
 *  carries NO rate, NO mean — only how many more takes it needs. */
export function cellView(c: InsightCell | null | undefined): CellView {
  if (!c || c.n <= 0) return { state: "empty" };
  if (c.n < MIN_N) return { state: "insufficient", n: c.n, need: MIN_N - c.n };
  const keepRate = c.kept / c.n;
  const heat = keepRate >= 0.75 ? 2 : keepRate >= 0.55 ? 1 : keepRate > 0.4 ? 0 : keepRate > 0.2 ? -1 : -2;
  return {
    state: "measured",
    n: c.n,
    keepRate,
    keepPct: `${Math.round(keepRate * 100)}%`,
    mean: c.meanScore == null ? null : c.meanScore.toFixed(1),
    topDefect: c.topDefect,
    heat,
  };
}

export interface StrengthRow {
  value: string;
  cells: Partial<Record<ProviderId, InsightCell>>;
  /** Judged takes behind the row, all providers. */
  n: number;
}

/** The providers a table draws as columns: every provider with a cell in this
 *  kind, and ElevenLabs always — it is the one this studio renders through, so
 *  its column is never allowed to vanish just because nothing is judged yet. */
export function providerColumns(cells: readonly InsightCell[]): ProviderId[] {
  const order: ProviderId[] = ["elevenlabs", "suno", "local"];
  const have = new Set<ProviderId>(["elevenlabs", ...cells.map((c) => c.provider)]);
  return order.filter((p) => have.has(p));
}

/** Rows of the provider × value table for one facet. */
export function pivot(cells: readonly InsightCell[], facet: Facet): StrengthRow[] {
  const by = new Map<string, StrengthRow>();
  for (const c of cells) {
    if (c.facet !== facet) continue;
    const r = by.get(c.value) ?? { value: c.value, cells: {}, n: 0 };
    r.cells[c.provider] = c;
    r.n += c.n;
    by.set(c.value, r);
  }
  return [...by.values()];
}

export type SortKey = "value" | "n" | "keep" | "mean";
export interface Sort {
  key: SortKey;
  /** For keep / mean: whose column. */
  provider: ProviderId | null;
  dir: "asc" | "desc";
}

/** Sort rows. An insufficient or empty cell has no rate, so on a keep / mean
 *  sort it falls BELOW every measured row in either direction — a missing
 *  number is not a low one. */
export function sortRows(rows: readonly StrengthRow[], s: Sort): StrengthRow[] {
  const metric = (r: StrengthRow): number | null => {
    if (s.key === "n") return r.n;
    if (s.key === "value") return null;
    const p = s.provider ?? "elevenlabs";
    const v = cellView(r.cells[p]);
    if (v.state !== "measured") return null;
    return s.key === "keep" ? v.keepRate : r.cells[p]?.meanScore ?? null;
  };
  const sign = s.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (s.key === "value") return sign * a.value.localeCompare(b.value);
    const ma = metric(a);
    const mb = metric(b);
    if (ma == null && mb == null) return a.value.localeCompare(b.value);
    if (ma == null) return 1;
    if (mb == null) return -1;
    return sign * (ma - mb) || a.value.localeCompare(b.value);
  });
}

/** Does a take stand behind this cell? */
export function inCell(t: SoundTake, provider: ProviderId, facet: Facet, value: string): boolean {
  if (t.provider !== provider || t.verdict === "unjudged" || t.origin === "fixture") return false;
  switch (facet) {
    case "technique":
      return t.technique.includes(value);
    case "sfxCategory":
      return t.terms.sfxCategory === value;
    default:
      return t.terms[facet].includes(value);
  }
}

/** The evidence a lesson from this cell carries — computed from the takes
 *  themselves, so the ids and the figures cannot disagree. */
export function evidenceFor(takes: readonly SoundTake[], cell: InsightCell) {
  const ts = takes.filter((t) => inCell(t, cell.provider, cell.facet, cell.value));
  const kept = ts.filter((t) => t.verdict === "kept").length;
  const means = ts.map(meanScore).filter((m): m is number => m != null);
  return {
    n: ts.length,
    keepRate: ts.length ? Math.round((kept / ts.length) * 1000) / 1000 : null,
    meanScore: means.length ? Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 10) / 10 : null,
    takeIds: ts.map((t) => t.id),
  };
}

/** A first draft of the claim — "when X, brief Y, because Z" — for the
 *  operator to rewrite. It states the evidence; the judgement is theirs. */
export function claimDraft(cell: InsightCell, kind: SoundKind): string {
  const v = cellView(cell);
  const who = PROVIDER_NAME[cell.provider];
  const what = kind === "sfx" ? "effects" : "music";
  const good = v.state === "measured" ? v.keepRate >= 0.5 : true;
  const fig = v.state === "measured" ? `it kept ${cell.kept} of ${cell.n}${v.mean ? ` (mean ${v.mean})` : ""}` : `n=${cell.n}`;
  const defect = cell.topDefect && !good ? `; the usual defect is ${cell.topDefect.replace(/-/g, " ")}` : "";
  if (cell.facet === "technique")
    return `When briefing ${who} for ${what}, ${good ? "use" : "avoid"} the ${cell.value} technique, because ${fig}${defect}.`;
  return `When the brief's ${FACET_WORD[cell.facet]} is ${cell.value}, ${good ? "send it to" : "do not send it to"} ${who}, because ${fig}${defect}.`;
}

/* ── the batch ────────────────────────────────────────────────────────── */

export interface BatchForm {
  prompt: string;
  negative: string;
  technique: string[];
  genre: string;
  mood: string;
  instrument: string;
  /** sfx: envelope-first fields (sound-effect-generation / envelope-first-briefing). */
  event: string;
  material: string;
  space: string;
  sfxCategory: string;
  loop: boolean;
  durationS: number;
  count: number;
  tempoBpm: number | null;
  key: string | null;
}

export const blankBatch = (kind: SoundKind): BatchForm => ({
  prompt: "",
  negative: "",
  technique: kind === "sfx" ? ["envelope-first-briefing"] : [],
  genre: "",
  mood: "",
  instrument: "",
  event: "",
  material: "",
  space: "",
  sfxCategory: "",
  loop: false,
  durationS: kind === "sfx" ? 3 : 30,
  count: kind === "sfx" ? 3 : 2,
  tempoBpm: null,
  key: null,
});

/** Duration bounds the provider accepts per kind. Effects are 0.5–30 s
 *  (the brief's SFX decision); music 10–300 s (lib/music's compose bounds). */
export const DURATION: Record<SoundKind, { min: number; max: number; step: number }> = {
  music: { min: 10, max: 300, step: 5 },
  sfx: { min: 0.5, max: 30, step: 0.5 },
};

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

/** An effect is briefed envelope-first: the event, then what it is made of,
 *  then where it sits — the shape the registry's sound-effect-generation
 *  technique puts first. Free text after it is kept verbatim. */
export function composeSfxPrompt(f: Pick<BatchForm, "event" | "material" | "space" | "prompt" | "loop">): string {
  const head = [f.event, f.material, f.space].map((x) => x.trim()).filter(Boolean).join(", ");
  const tail = f.prompt.trim();
  const loop = f.loop ? "seamless loop" : "";
  return [head, tail, loop].filter(Boolean).join(". ");
}

export function batchPrompt(kind: SoundKind, f: BatchForm): string {
  return kind === "sfx" ? composeSfxPrompt(f) : f.prompt.trim();
}

export function batchTerms(kind: SoundKind, f: BatchForm): SoundTerms {
  return {
    genre: kind === "music" ? list(f.genre) : [],
    mood: list(f.mood),
    instrument: kind === "music" ? list(f.instrument) : [],
    sfxCategory: kind === "sfx" ? f.sfxCategory.trim() || null : null,
  };
}

/** What the form can send, or why not. */
export function batchProblem(kind: SoundKind, f: BatchForm): string | null {
  if (!batchPrompt(kind, f)) return kind === "sfx" ? "name the event" : "write a prompt";
  const d = DURATION[kind];
  if (!(f.durationS >= d.min && f.durationS <= d.max)) return `length ${d.min}–${d.max}s`;
  if (!(f.count >= 1 && f.count <= 6)) return "1–6 takes";
  return null;
}

/** One GenerateRequest per take of the batch — a batch is N identical briefs,
 *  so the takes differ only by the provider's own variance, which is what a
 *  judge is measuring. */
export function batchRequests(kind: SoundKind, f: BatchForm): GenerateRequest[] {
  const prompt = batchPrompt(kind, f);
  const req: GenerateRequest = {
    kind,
    provider: "elevenlabs",
    op: kind === "sfx" ? "sfx" : "compose",
    prompt,
    negative: f.negative.trim() || null,
    durationS: f.durationS,
    loop: kind === "sfx" ? f.loop : null,
    technique: f.technique.filter((t) => TECHNIQUES[kind].includes(t)),
    terms: batchTerms(kind, f),
    tempoBpm: kind === "music" ? f.tempoBpm : null,
    key: kind === "music" ? f.key : null,
    origin: "lab",
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: null,
    nodeId: null,
    title: null,
  };
  return Array.from({ length: Math.max(1, Math.min(6, Math.round(f.count))) }, () => ({ ...req }));
}
