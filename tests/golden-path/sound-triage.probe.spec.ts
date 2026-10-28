// LANE — TRIAGE JUDGES IN THE RIGHT ORDER, ON THE RIGHT KEYS, AND NEVER CLAIMS
// WHAT THREE TAKES HAVE NOT EARNED (static, pure).
//
// The Sound lab's triage (app/playground/triage, round 4, 2026-10-05) turned
// listening into prompt knowledge. Since Phase 3 the verdict is the Board's
// audio packet and since Phase 6 (L66) the rest is the audio desk's; the four
// things that decide whether it still works are pure and tested here, against
// the modules that hold them now:
//
//   1. THE QUEUE (lib/sound/triageOrder.ts, the Board pile's order). Agents'
//      takes first (the main inflow, via pipeline/sound.mts generate), oldest
//      first within an origin; judged takes and fixture rows never wait in it.
//   2. THE KEYS (@gt/ui keymap, mode board.cull). The number row decides: 1
//      keeps, 2-4 reject with the first three audio defects in their order, 5
//      rejects bare (spark scout-storyboards); the other defects are chips, and
//      the legend may not name a key the table does not bind. v1's judge-only keys
//      (N/P to walk, 1-0 to score) are the desk's rubric now.
//   3. THE CELL (@gt/ui audio/strengths.ts). A strengths cell under n=3 carries
//      no rate and no mean — not a rounded one, not a zero — and a missing
//      number sorts below every real one in either direction.
//   4. THE BATCH (@gt/ui audio/batch.ts, lib/sound/sfxJob.ts). N identical
//      briefs, effects briefed envelope-first; the technique tags are the
//      kind's own vocabulary.

import { test, expect } from "@playwright/test";

import { keyedReason, reasonVocabulary, SOURCES } from "@gt/domain/source";
import { batchBrief, batchProblem, blankBatch, composeSfxPrompt, priceSeconds } from "@gt/ui/components/audio/batch.ts";
import { briefCheck } from "@gt/ui/components/audio/brief.ts";
import { dimsFor, isProven, rubricMean } from "@gt/ui/components/audio/rubric.ts";
import { cellView, claimDraft, evidenceFor, MIN_N, pivot, sortRows, type EvidenceTake, type StrengthCell } from "@gt/ui/components/audio/strengths.ts";
import { KEYMAP } from "@gt/ui/keymap/bindings";

import { clipRequest } from "@/lib/sound/sfxJob";
import { judgingOrder } from "@/lib/sound/triageOrder";
import type { SoundTake } from "@/lib/sound/types";

type QueueTake = Pick<SoundTake, "id" | "origin" | "verdict" | "createdAt" | "kind">;
const q = (id: string, p: Partial<QueueTake> = {}): QueueTake => ({ id, origin: "agent", verdict: "unjudged", createdAt: "2026-10-05T10:00:00.000Z", kind: "music", ...p });

function cell(p: Partial<StrengthCell>): StrengthCell {
  return { kind: "music", provider: "elevenlabs", facet: "genre", value: "synthwave", n: 0, kept: 0, rejected: 0, meanScore: null, topDefect: null, ...p };
}

/* ── 1 · the queue ────────────────────────────────────────────────────── */

test("queue: agents first, oldest first within an origin, judged and fixture rows never wait", () => {
  const ts = [
    q("lab-old", { origin: "lab", createdAt: "2026-10-05T08:00:00.000Z" }),
    q("agent-new", { createdAt: "2026-10-05T12:00:00.000Z" }),
    q("agent-old", { createdAt: "2026-10-05T09:00:00.000Z" }),
    q("import", { origin: "import", createdAt: "2026-10-04T00:00:00.000Z" }),
    q("suno", { origin: "suno-return", createdAt: "2026-10-04T00:00:00.000Z" }),
    q("hunt", { origin: "hunt", createdAt: "2026-10-05T11:00:00.000Z" }),
    q("fixture", { origin: "fixture", createdAt: "2026-10-01T00:00:00.000Z" }),
    q("kept", { verdict: "kept", createdAt: "2026-10-01T00:00:00.000Z" }),
  ];
  expect(judgingOrder(ts).map((t) => t.id)).toEqual(["agent-old", "agent-new", "lab-old", "hunt", "suno", "import"]);
});

/* ── 2 · the keys ─────────────────────────────────────────────────────── */

const cull = (verb: string) => KEYMAP.rows.filter((r) => r.binding.mode === "board.cull" && r.binding.verb === verb);

test("keys: 1 keeps, 5 rejects, U undecides on the Board's cull, and 2-4 name the first audio defects in order", () => {
  expect(cull("keep").flatMap((r) => r.caps)).toEqual(["1"]);
  expect(cull("reject").flatMap((r) => r.caps)).toEqual(["5"]);
  expect(cull("undecide").flatMap((r) => r.caps)).toEqual(["U"]);
  expect(cull("reason").flatMap((r) => r.caps)).toEqual(["2", "3", "4"]);
  // Fifteen defects in v1's order: the first three on keys, every one on a chip.
  expect(SOURCES.audio.reasons).toHaveLength(15);
  expect(keyedReason(reasonVocabulary("audio"), undefined, "2")).toBe("smeared-transients");
  expect(keyedReason(reasonVocabulary("audio"), undefined, "4")).toBe("section-bleed");
  expect(keyedReason(reasonVocabulary("audio"), undefined, "-")).toBeUndefined();
  expect(cull("play").map((r) => [r.caps, r.binding.when])).toEqual([[["Space"], "audio"]]);
  expect(KEYMAP.problems).toEqual([]);
});

/* ── 3 · the cell ─────────────────────────────────────────────────────── */

test("cell: under n=3 there is no rate and no mean — only how much evidence is missing", () => {
  expect(cellView(null)).toEqual({ state: "empty" });
  expect(cellView(cell({ n: 0 }))).toEqual({ state: "empty" });
  for (const n of [1, 2]) {
    const v = cellView(cell({ n, kept: n, meanScore: 9.5 }));
    expect(v).toEqual({ state: "insufficient", n, need: MIN_N - n });
    // The shape itself has nowhere to put a figure.
    expect(Object.keys(v).sort()).toEqual(["n", "need", "state"]);
  }
  const m = cellView(cell({ n: 3, kept: 2, rejected: 1, meanScore: 6.666, topDefect: "off-brief" }));
  expect(m).toMatchObject({ state: "measured", n: 3, keepPct: "67%", mean: "6.7", topDefect: "off-brief", heat: 1 });
  expect(cellView(cell({ n: 4, kept: 4, meanScore: null }))).toMatchObject({ keepPct: "100%", mean: null, heat: 2 });
  expect(cellView(cell({ n: 4, kept: 0 }))).toMatchObject({ keepPct: "0%", heat: -2 });
  expect(cellView(cell({ n: 10, kept: 5 }))).toMatchObject({ heat: 0 });
});

test("cell: a missing rate sorts below every real one, in both directions", () => {
  const cells = [
    cell({ value: "a", n: 4, kept: 1 }),
    cell({ value: "b", n: 2, kept: 2 }), // insufficient: 100% that is not allowed to count
    cell({ value: "c", n: 5, kept: 4 }),
    cell({ value: "d", provider: "suno", n: 3, kept: 3 }),
  ];
  const rows = pivot(cells, "genre");
  const desc = sortRows(rows, { key: "keep", provider: "elevenlabs", dir: "desc" }).map((r) => r.value);
  const asc = sortRows(rows, { key: "keep", provider: "elevenlabs", dir: "asc" }).map((r) => r.value);
  expect(desc.slice(0, 2)).toEqual(["c", "a"]);
  expect(asc.slice(0, 2)).toEqual(["a", "c"]);
  expect(desc.slice(2).sort()).toEqual(["b", "d"]);
  expect(asc.slice(2).sort()).toEqual(["b", "d"]);
  expect(sortRows(rows, { key: "n", provider: null, dir: "desc" })[0]?.value).toBe("c");
  expect(sortRows(rows, { key: "value", provider: null, dir: "asc" }).map((r) => r.value)).toEqual(["a", "b", "c", "d"]);
});

test("cell: a lesson's evidence is computed from the takes behind the cell, and the draft states it", () => {
  const terms = { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null };
  const ev = (id: string, p: Partial<EvidenceTake> = {}): EvidenceTake => ({ id, provider: "suno", verdict: "kept", origin: "agent", technique: [], terms, mean: null, ...p });
  const ts = [
    ev("k1", { mean: rubricMean("music", { melody: 8, instrument_choice: 8, instrument_quality: 8 }) }),
    ev("k2", { mean: rubricMean("music", { melody: 7 }) }),
    ev("r1", { verdict: "rejected" }),
    ev("other", { provider: "elevenlabs" }),
    ev("open", { verdict: "unjudged" }),
    ev("demo", { origin: "fixture" }),
  ];
  const c = cell({ provider: "suno", value: "lo-fi", n: 3, kept: 2, rejected: 1, meanScore: 7.5 });
  expect(evidenceFor(ts, c)).toEqual({ n: 3, keepRate: 0.667, meanScore: 7.5, takeIds: ["k1", "k2", "r1"] });
  const draft = claimDraft(c);
  expect(draft).toContain("Suno");
  expect(draft).toContain("kept 2 of 3");
  expect(draft.startsWith("When ")).toBe(true);
  expect(claimDraft(cell({ facet: "technique", value: "tag-list", n: 4, kept: 1, topDefect: "smeared-transients" }))).toMatch(/avoid the tag-list technique.*smeared transients/);
});

/* ── 4 · the batch ────────────────────────────────────────────────────── */

test("batch: N identical lab briefs, effects briefed envelope-first", () => {
  const f = { ...blankBatch("music"), prompt: "slow synthwave", technique: ["tag-list", "not-a-technique"], genre: "synthwave, retro", count: 3 };
  const b = batchBrief("music", f);
  expect(b).toMatchObject({ kind: "music", technique: ["tag-list"], loop: null });
  expect(b.terms.genre).toEqual(["synthwave", "retro"]);

  const s = { ...blankBatch("sfx"), event: "door slam", material: "oak", space: "stone hall", loop: true, sfxCategory: "impact" };
  expect(composeSfxPrompt(s)).toBe("door slam, oak, stone hall. seamless loop");
  const sb = batchBrief("sfx", s);
  // Every clip of the batch is the one brief: they differ by their title alone.
  const reqs = [1, 2, 3].map((i) => clipRequest(sb, i, 3));
  expect(new Set(reqs.map((r) => JSON.stringify({ ...r, title: null }))).size).toBe(1);
  expect(reqs[0]).toMatchObject({ kind: "sfx", op: "sfx", origin: "lab", provider: "elevenlabs", loop: true, tempoBpm: null, key: null, technique: ["envelope-first-briefing"] });
  expect(reqs[0]?.terms).toEqual({ genre: [], mood: [], instrument: [], sfxCategory: "impact" });

  expect(batchProblem("music", blankBatch("music"))).toBe("no prompt");
  expect(batchProblem("sfx", blankBatch("sfx"))).toBe("no event");
  expect(batchProblem("sfx", { ...s, durationS: 31 })).toBe("length 0.5–30s");
  expect(batchProblem("music", { ...f, count: 7 })).toBe("1–6 takes");

  // Prompt influence (r4 closeout): an effect batch sends it, null is the
  // vendor's default, music never carries it, and out of range is refused.
  expect(sb.promptInfluence, "blank form = vendor default").toBe(null);
  expect(batchBrief("sfx", { ...s, promptInfluence: 0.7 }).promptInfluence).toBe(0.7);
  expect(batchBrief("music", { ...f, promptInfluence: 0.7 }).promptInfluence).toBe(null);
  expect(batchProblem("sfx", { ...s, promptInfluence: 1.4 })).toBe("influence 0–1");
});

test("price: a sub-10s effect is priced at its tenth (1.5s, not 2s); longer lengths at the whole second", () => {
  expect(priceSeconds(1.5)).toBe(1.5);
  expect(priceSeconds(0.04 + 0.5)).toBe(0.5);
  expect(priceSeconds(9.96)).toBe(10);
  expect(priceSeconds(12.4)).toBe(12);
});

/* ── readings shared with arrange and hunt ────────────────────────────── */

test("readings: a one-shot effect is not scored on a seam; proven is a kept mean of 7", () => {
  expect(dimsFor({ kind: "sfx", loop: false })).toEqual(["event_match", "sound_quality"]);
  expect(dimsFor({ kind: "sfx", loop: true })).toEqual(["event_match", "sound_quality", "loop_seam"]);
  expect(dimsFor({ kind: "music", loop: null })).toEqual(["melody", "instrument_choice", "instrument_quality"]);
  expect(rubricMean("music", {})).toBeNull();
  expect(rubricMean("music", { melody: 6, instrument_choice: null, instrument_quality: 8 })).toBe(7);
  expect(isProven({ kind: "music", verdict: "kept", ratings: { melody: 7 } })).toBe(true);
  expect(isProven({ kind: "music", verdict: "kept", ratings: { melody: 6 } })).toBe(false);
  expect(isProven({ kind: "music", verdict: "kept", ratings: {} })).toBe(false);
  expect(isProven({ kind: "music", verdict: "rejected", ratings: { melody: 9 } })).toBe(false);
  // the onset tracker's octave error is not the provider's miss
  const tempo = (asked: number | null, measured: number | null) => briefCheck("music", { tempoBpm: asked, key: null, durationS: null }, { tempoBpm: measured, key: null, durationS: null }).axes[0]?.verdict;
  expect(tempo(120, 60)).toBe("octave");
  expect(tempo(120, 121)).toBe("held");
  expect(tempo(120, 98.5)).toBe("missed");
  expect(tempo(null, 98.5)).toBe("unasked");
});

test("length: a measured take reads the length its bytes are; a Suno return with no ask reads its measured length, never a dash", () => {
  const len = (asked: number | null, measured: number | null, kind: "music" | "sfx" = "music") => briefCheck(kind, { tempoBpm: null, key: null, durationS: asked }, { tempoBpm: null, key: null, durationS: measured }).axes.find((a) => a.axis === "length");
  expect(len(150, 154.3)).toMatchObject({ verdict: "held", measured: "2:34" });
  expect(len(null, 154.3)).toMatchObject({ verdict: "unasked", measured: "2:34" });
  expect(len(30, null)).toMatchObject({ verdict: "unmeasured", asked: "0:30" });
  expect(len(null, 1.48, "sfx")).toMatchObject({ measured: "1.5s" });
});
