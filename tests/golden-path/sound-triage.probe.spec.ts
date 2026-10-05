// LANE — TRIAGE JUDGES IN THE RIGHT ORDER, ON THE RIGHT KEYS, AND NEVER CLAIMS
// WHAT THREE TAKES HAVE NOT EARNED (static, pure).
//
// The Sound lab's triage module (app/playground/triage, round 4,
// 2026-10-05) turns listening into prompt knowledge. Four things decide
// whether it does, and each is pure and tested here:
//
//   1. THE QUEUE. Agents' takes first (they are the main inflow, via
//      pipeline/sound.mts generate), oldest first within an origin; judged
//      takes and fixture rows never wait in it.
//   2. THE KEYS. One table (resolveKey) drives the handler AND the legend. K
//      keeps, so next/prev cannot be J/K; the legend may not name a key the
//      table does not bind.
//   3. THE CELL. A strengths cell under n=3 carries no rate and no mean —
//      not a rounded one, not a zero — and a missing number sorts below every
//      real one in either direction, because absent is not low.
//   4. THE BATCH. N identical briefs, origin "lab", effects briefed
//      envelope-first; the technique tags are the kind's own vocabulary.

import { test, expect } from "@playwright/test";

import {
  KEYMAP,
  MIN_N,
  batchProblem,
  batchRequests,
  blankBatch,
  cellView,
  claimDraft,
  composeSfxPrompt,
  evidenceFor,
  nextAfter,
  pivot,
  queueOrder,
  resolveKey,
  sortRows,
  step,
} from "@/app/playground/triage/model";
import { dimsFor, meanScore, readVerdict, tempoOff } from "@/app/playground/shared/format";
import type { InsightCell, SoundTake } from "@/lib/sound/types";

function take(p: Partial<SoundTake> & { id: string }): SoundTake {
  return {
    kind: "music",
    title: p.id,
    provider: "elevenlabs",
    op: "compose",
    origin: "agent",
    technique: [],
    prompt: "",
    negative: null,
    terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
    tempoBpm: null,
    key: null,
    durationS: 30,
    loop: null,
    file: { path: `files/${p.id}.wav`, mime: "audio/wav", bytes: 1 },
    peaks: null,
    measured: null,
    ratings: {},
    verdict: "unjudged",
    reasons: [],
    note: null,
    stage: null,
    group: null,
    label: null,
    parentId: null,
    huntId: null,
    nodeId: null,
    songId: null,
    plan: null,
    createdAt: "2026-10-05T10:00:00.000Z",
    judgedAt: null,
    finalizedAt: null,
    ...p,
  };
}

function cell(p: Partial<InsightCell>): InsightCell {
  return { kind: "music", provider: "elevenlabs", facet: "genre", value: "synthwave", n: 0, kept: 0, rejected: 0, meanScore: null, topDefect: null, ...p };
}

/* ── 1 · the queue ────────────────────────────────────────────────────── */

test("queue: agents first, oldest first within an origin, judged and fixture rows never wait", () => {
  const ts = [
    take({ id: "lab-old", origin: "lab", createdAt: "2026-10-05T08:00:00.000Z" }),
    take({ id: "agent-new", origin: "agent", createdAt: "2026-10-05T12:00:00.000Z" }),
    take({ id: "agent-old", origin: "agent", createdAt: "2026-10-05T09:00:00.000Z" }),
    take({ id: "import", origin: "import", createdAt: "2026-10-04T00:00:00.000Z" }),
    take({ id: "suno", origin: "suno-return", createdAt: "2026-10-04T00:00:00.000Z" }),
    take({ id: "hunt", origin: "hunt", createdAt: "2026-10-05T11:00:00.000Z" }),
    take({ id: "fixture", origin: "fixture", createdAt: "2026-10-01T00:00:00.000Z" }),
    take({ id: "kept", origin: "agent", verdict: "kept", createdAt: "2026-10-01T00:00:00.000Z" }),
    take({ id: "sfx", origin: "agent", kind: "sfx", createdAt: "2026-10-01T00:00:00.000Z" }),
  ];
  expect(queueOrder(ts, "music").map((t) => t.id)).toEqual(["agent-old", "agent-new", "lab-old", "hunt", "suno", "import"]);
  expect(queueOrder(ts, "sfx").map((t) => t.id)).toEqual(["sfx"]);
});

test("queue: after a verdict the judge lands on the take that followed, else the one before", () => {
  const q = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(nextAfter(q, "a")).toBe("b");
  expect(nextAfter(q, "c")).toBe("b");
  expect(nextAfter([{ id: "a" }], "a")).toBeNull();
  expect(step(["a", "b", "c"], "c", 1)).toBe("c");
  expect(step(["a", "b", "c"], "a", -1)).toBe("a");
  expect(step(["a", "b"], null, 1)).toBe("a");
  expect(step([], "a", 1)).toBeNull();
});

/* ── 2 · the keys ─────────────────────────────────────────────────────── */

test("keys: the judge table", () => {
  expect(resolveKey(" ", "judge")).toEqual({ type: "play" });
  expect(resolveKey("ArrowLeft", "judge")).toEqual({ type: "seek", by: -5 });
  expect(resolveKey("ArrowRight", "judge", true)).toEqual({ type: "seek", by: 15 });
  for (let d = 1; d <= 9; d++) expect(resolveKey(String(d), "judge")).toEqual({ type: "score", value: d });
  expect(resolveKey("0", "judge")).toEqual({ type: "score", value: 10 });
  expect(resolveKey("ArrowDown", "judge")).toEqual({ type: "dim", by: 1 });
  expect(resolveKey("Tab", "judge")).toEqual({ type: "dim", by: 1 });
  expect(resolveKey("Tab", "judge", true)).toEqual({ type: "dim", by: -1 });
  expect(resolveKey("ArrowUp", "judge")).toEqual({ type: "dim", by: -1 });
  expect(resolveKey("k", "judge")).toEqual({ type: "keep" });
  expect(resolveKey("K", "judge")).toEqual({ type: "keep" });
  expect(resolveKey("x", "judge")).toEqual({ type: "reject" });
  expect(resolveKey("n", "judge")).toEqual({ type: "next" });
  expect(resolveKey("p", "judge")).toEqual({ type: "prev" });
  expect(resolveKey("u", "judge")).toEqual({ type: "clear" });
  // J is NOT next: K is keep, so the J/K pair would put "next" beside a verdict.
  expect(resolveKey("j", "judge")).toBeNull();
  expect(resolveKey("Enter", "judge")).toBeNull();
});

test("keys: in defects mode the number row toggles defects, never scores", () => {
  for (let i = 0; i < 9; i++) expect(resolveKey(String(i + 1), "defects")).toEqual({ type: "defect", index: i });
  expect(resolveKey("0", "defects")).toEqual({ type: "defect", index: 9 });
  expect(resolveKey("-", "defects")).toEqual({ type: "defect", index: 10 });
  expect(resolveKey("Enter", "defects")).toEqual({ type: "confirm" });
  expect(resolveKey("Escape", "defects")).toEqual({ type: "cancel" });
  expect(resolveKey("k", "defects")).toBeNull();
  expect(resolveKey(" ", "defects")).toEqual({ type: "play" });
});

test("keys: every key the legend shows is bound in its mode", () => {
  const NAME: Record<string, string> = { Space: " ", "←": "ArrowLeft", "→": "ArrowRight", "↑": "ArrowUp", "↓": "ArrowDown", Esc: "Escape", "−": "-" };
  for (const mode of ["judge", "defects"] as const) {
    for (const row of KEYMAP[mode]) {
      for (const k of row.keys) {
        if (k === "…") continue;
        const key = NAME[k] ?? (k.length === 1 ? k.toLowerCase() : k);
        expect(resolveKey(key, mode), `${mode}: legend shows ${k} (${row.does}) but nothing is bound`).not.toBeNull();
      }
    }
  }
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
  expect(sortRows(rows, { key: "n", provider: null, dir: "desc" })[0].value).toBe("c");
  expect(sortRows(rows, { key: "value", provider: null, dir: "asc" }).map((r) => r.value)).toEqual(["a", "b", "c", "d"]);
});

test("cell: a lesson's evidence is computed from the takes behind the cell, and the draft states it", () => {
  const ts = [
    take({ id: "k1", verdict: "kept", terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null }, provider: "suno", ratings: { melody: 8, instrument_choice: 8, instrument_quality: 8 } }),
    take({ id: "k2", verdict: "kept", terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null }, provider: "suno", ratings: { melody: 7 } }),
    take({ id: "r1", verdict: "rejected", terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null }, provider: "suno" }),
    take({ id: "other", verdict: "kept", terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null }, provider: "elevenlabs" }),
    take({ id: "open", terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null }, provider: "suno" }),
    take({ id: "demo", origin: "fixture", verdict: "kept", terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null }, provider: "suno" }),
  ];
  const c = cell({ provider: "suno", value: "lo-fi", n: 3, kept: 2, rejected: 1, meanScore: 7.5 });
  expect(evidenceFor(ts, c)).toEqual({ n: 3, keepRate: 0.667, meanScore: 7.5, takeIds: ["k1", "k2", "r1"] });
  const draft = claimDraft(c, "music");
  expect(draft).toContain("Suno");
  expect(draft).toContain("kept 2 of 3");
  expect(draft.startsWith("When ")).toBe(true);
  expect(claimDraft(cell({ facet: "technique", value: "tag-list", n: 4, kept: 1, topDefect: "smeared-transients" }), "music")).toMatch(
    /avoid the tag-list technique.*smeared transients/,
  );
});

/* ── 4 · the batch ────────────────────────────────────────────────────── */

test("batch: N identical lab briefs, effects briefed envelope-first", () => {
  const f = { ...blankBatch("music"), prompt: "slow synthwave", technique: ["tag-list", "not-a-technique"], genre: "synthwave, retro", count: 3 };
  const reqs = batchRequests("music", f);
  expect(reqs).toHaveLength(3);
  expect(new Set(reqs.map((r) => JSON.stringify(r))).size).toBe(1);
  expect(reqs[0]).toMatchObject({ kind: "music", op: "compose", origin: "lab", provider: "elevenlabs", technique: ["tag-list"], loop: null });
  expect(reqs[0].terms.genre).toEqual(["synthwave", "retro"]);

  const s = { ...blankBatch("sfx"), event: "door slam", material: "oak", space: "stone hall", loop: true, sfxCategory: "impact" };
  expect(composeSfxPrompt(s)).toBe("door slam, oak, stone hall. seamless loop");
  const sr = batchRequests("sfx", s)[0];
  expect(sr).toMatchObject({ kind: "sfx", op: "sfx", loop: true, tempoBpm: null, key: null, technique: ["envelope-first-briefing"] });
  expect(sr.terms).toEqual({ genre: [], mood: [], instrument: [], sfxCategory: "impact" });

  expect(batchProblem("music", blankBatch("music"))).toBe("write a prompt");
  expect(batchProblem("sfx", blankBatch("sfx"))).toBe("name the event");
  expect(batchProblem("sfx", { ...s, durationS: 31 })).toBe("length 0.5–30s");
  expect(batchProblem("music", { ...f, count: 7 })).toBe("1–6 takes");
});

/* ── readings shared with arrange and hunt ────────────────────────────── */

test("readings: a one-shot effect is not scored on a seam; proven is a kept mean of 7", () => {
  expect(dimsFor({ kind: "sfx", loop: false })).toEqual(["event_match", "sound_quality"]);
  expect(dimsFor({ kind: "sfx", loop: true })).toEqual(["event_match", "sound_quality", "loop_seam"]);
  expect(dimsFor({ kind: "music", loop: null })).toEqual(["melody", "instrument_choice", "instrument_quality"]);
  expect(meanScore({ ratings: {} })).toBeNull();
  expect(meanScore({ ratings: { a: 6, b: null, c: 8 } })).toBe(7);
  expect(readVerdict({ verdict: "kept", ratings: { a: 7 } })).toBe("proven");
  expect(readVerdict({ verdict: "kept", ratings: { a: 6 } })).toBe("kept");
  expect(readVerdict({ verdict: "kept", ratings: {} })).toBe("kept");
  expect(readVerdict({ verdict: "rejected", ratings: { a: 9 } })).toBe("rejected");
  // the onset tracker's octave error is not the provider's miss
  expect(tempoOff(120, 60)).toBe(false);
  expect(tempoOff(120, 121)).toBe(false);
  expect(tempoOff(120, 98.5)).toBe(true);
  expect(tempoOff(null, 98.5)).toBe(false);
});
