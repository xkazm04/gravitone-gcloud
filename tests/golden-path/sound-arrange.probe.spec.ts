// LANE — THE ARRANGEMENT BOARD'S RULES, WITHOUT A BROWSER (static).
//
// The Sound lab's Arrangement (app/playground/arrange, round 4) places kept
// takes on a board — stages across, groups down — and every rule that decides
// where a card sits and whether it may move lives in app/playground/arrange/
// model.ts as plain functions. A wrong one would pass every screenshot and
// still finalize a take with no label, drop a Suno return's history, or file a
// card into a row nobody can see. So:
//
//   1. VERSION STACKING. A take and every take naming it (transitively) as its
//      parent are one card; the newest is the head. A parent outside the set
//      ends the walk rather than losing the take; a cycle ends it too.
//   2. CELL MAPPING. Declared rows in saved order, then orphans (a group a
//      head carries that the file does not list), then "ungrouped", always
//      last; a kept take with no stage is pending.
//   3. MOVE VALIDATION. Finalized needs a label (new or already carried);
//      same cell is a no-op; a row that does not exist is refused; the patch
//      carries stage + group (+ label).
//   4. LABEL SUGGESTION. Group first, then the strongest terms, case-folded
//      duplicates dropped; an effect's says "loop" when it is one.
//   5. GROUP EDITS and the agent line.

import { test, expect } from "@playwright/test";

import {
  addGroup,
  agentLine,
  buildBoard,
  cellKey,
  cellOf,
  checkMove,
  deleteGroup,
  matchesSuggestion,
  moveGroup,
  renameGroup,
  rowsFor,
  seedSuggestions,
  stackVersions,
  stageCounts,
  step,
  suggestLabel,
  versionNumber,
  UNGROUPED_KEY,
} from "@/app/playground/arrange/model";
import type { SoundTake } from "@/lib/sound/types";

let n = 0;
function take(o: Partial<SoundTake> & { id: string }): SoundTake {
  n += 1;
  return {
    kind: "music",
    title: o.id,
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
    file: null,
    peaks: null,
    measured: null,
    ratings: {},
    verdict: "kept",
    reasons: [],
    note: null,
    stage: "pending",
    group: null,
    label: null,
    parentId: null,
    huntId: null,
    nodeId: null,
    songId: null,
    plan: null,
    referenceTrackId: null,
    promptRound: null,
    draftId: null,
    variation: null,
    editModes: null,
    fileName: null,
    createdAt: `2026-10-05T${String(n).padStart(2, "0")}:00:00.000Z`,
    judgedAt: null,
    finalizedAt: null,
    ...o,
  };
}

/* ── 1 · version stacking ─────────────────────────────────────────────── */

test("stack: a chain of returns is one card, its newest version the head", () => {
  const v1 = take({ id: "a", createdAt: "2026-10-05T01:00:00Z" });
  const v2 = take({ id: "b", parentId: "a", createdAt: "2026-10-05T02:00:00Z", origin: "suno-return" });
  const v3 = take({ id: "c", parentId: "b", createdAt: "2026-10-05T03:00:00Z", origin: "suno-return", stage: "edit" });
  const other = take({ id: "z", createdAt: "2026-10-05T00:30:00Z" });
  const stacks = stackVersions([v2, other, v3, v1]);
  expect(stacks).toHaveLength(2);
  const s = stacks.find((x) => x.rootId === "a")!;
  expect(s.head.id).toBe("c");
  expect(s.versions.map((v) => v.id)).toEqual(["c", "b", "a"]);
  expect(versionNumber(s, "a")).toBe(1);
  expect(versionNumber(s, "c")).toBe(3);
  // the card sits where its HEAD sits
  expect(cellOf(s)).toEqual({ stage: "edit", group: null });
  // newest head first
  expect(stacks[0].rootId).toBe("a");
});

test("stack: the chain orders versions, not the clock — a return stamped earlier than its parent is still the head", () => {
  // A migrated parent keeps its original (here: later) createdAt; the return
  // filed onto it today is older by the clock and newer by the chain.
  const parent = take({ id: "p1", createdAt: "2026-10-06T03:00:00Z", stage: "remaster" });
  const ret = take({ id: "r1", parentId: "p1", createdAt: "2026-10-05T11:00:00Z", stage: "edit", origin: "suno-return" });
  const s = stackVersions([parent, ret])[0];
  expect(s.head.id).toBe("r1");
  expect(cellOf(s).stage).toBe("edit");
  expect(versionNumber(s, "r1")).toBe(2);
  // two returns of the same parent: the clock breaks the tie
  const r2 = take({ id: "r2", parentId: "p1", createdAt: "2026-10-05T12:00:00Z" });
  expect(stackVersions([parent, ret, r2])[0].versions.map((v) => v.id)).toEqual(["r2", "r1", "p1"]);
});

test("stack: a parent outside the set roots its child; a cycle ends the walk", () => {
  const orphan = take({ id: "x", parentId: "gone" });
  expect(stackVersions([orphan])[0].rootId).toBe("x");
  const p = take({ id: "p", parentId: "q" });
  const q = take({ id: "q", parentId: "p" });
  const stacks = stackVersions([p, q]);
  // every take still lands on the board exactly once
  expect(stacks.flatMap((s) => s.versions.map((v) => v.id)).sort()).toEqual(["p", "q"]);
});

/* ── 2 · cell mapping ─────────────────────────────────────────────────── */

test("rows: declared order, then orphans by name, then ungrouped last", () => {
  const stacks = stackVersions([take({ id: "1", group: "trailer" }), take({ id: "2", group: "ambient" }), take({ id: "3", group: "beds" })]);
  const rows = rowsFor(["synthwave", "ambient"], stacks);
  expect(rows.map((r) => [r.name, r.orphan])).toEqual([
    ["synthwave", false],
    ["ambient", false],
    ["beds", true],
    ["trailer", true],
    [null, false],
  ]);
  expect(rows.at(-1)!.key).toBe(UNGROUPED_KEY);
});

test("board: every cell exists, each stack sits in exactly one, stageless kept is pending", () => {
  const stacks = stackVersions([
    take({ id: "a", group: "ambient", stage: "finalized", label: "x" }),
    take({ id: "b", group: "ambient", stage: null }),
    take({ id: "c" }),
  ]);
  const rows = rowsFor(["ambient"], stacks);
  const board = buildBoard(stacks, rows);
  expect(board.size).toBe(rows.length * 4);
  expect(board.get(cellKey({ stage: "finalized", group: "ambient" }))!.map((s) => s.head.id)).toEqual(["a"]);
  expect(board.get(cellKey({ stage: "pending", group: "ambient" }))!.map((s) => s.head.id)).toEqual(["b"]);
  expect(board.get(cellKey({ stage: "pending", group: null }))!.map((s) => s.head.id)).toEqual(["c"]);
  expect(stageCounts(stacks)).toEqual({ pending: 2, remaster: 0, edit: 0, finalized: 1 });
});

test("step: arrows walk stages and rows, null at the edges", () => {
  const rows = rowsFor(["a", "b"], []);
  expect(step({ stage: "pending", group: "a" }, "right", rows)).toEqual({ stage: "remaster", group: "a" });
  expect(step({ stage: "pending", group: "a" }, "left", rows)).toBeNull();
  expect(step({ stage: "finalized", group: "a" }, "right", rows)).toBeNull();
  expect(step({ stage: "edit", group: "b" }, "down", rows)).toEqual({ stage: "edit", group: null });
  expect(step({ stage: "edit", group: null }, "down", rows)).toBeNull();
  expect(step({ stage: "edit", group: "a" }, "up", rows)).toBeNull();
});

/* ── 3 · move validation ──────────────────────────────────────────────── */

test("move: finalized needs a label, same cell is a no-op, unknown rows refused", () => {
  const s = stackVersions([take({ id: "a", group: "ambient" })])[0];
  const rows = rowsFor(["ambient"], [s]);
  expect(checkMove(s, { stage: "pending", group: "ambient" }, rows)).toEqual({ ok: false, reason: "same-cell" });
  expect(checkMove(s, { stage: "finalized", group: "ambient" }, rows)).toEqual({ ok: false, reason: "needs-label" });
  expect(checkMove(s, { stage: "finalized", group: "ambient" }, rows, "   ")).toEqual({ ok: false, reason: "needs-label" });
  expect(checkMove(s, { stage: "remaster", group: "nowhere" }, rows)).toEqual({ ok: false, reason: "unknown-row" });
  expect(checkMove(s, { stage: "finalized", group: "ambient" }, rows, " Ambient · calm ")).toEqual({
    ok: true,
    patch: { stage: "finalized", group: "ambient", label: "Ambient · calm" },
  });
  expect(checkMove(s, { stage: "edit", group: null }, rows)).toEqual({ ok: true, patch: { stage: "edit", group: null } });
});

test("move: a head that already carries a label may be finalized again without one", () => {
  const s = stackVersions([take({ id: "a", group: "g", stage: "edit", label: "G · kept" })])[0];
  const rows = rowsFor(["g"], [s]);
  expect(checkMove(s, { stage: "finalized", group: "g" }, rows)).toEqual({ ok: true, patch: { stage: "finalized", group: "g" } });
});

/* ── 4 · label suggestion ─────────────────────────────────────────────── */

test("label: group first, then moods and an instrument, case-folded duplicates dropped", () => {
  const t = take({ id: "a", terms: { genre: ["Ambient"], mood: ["calm", "Ambient", "warm"], instrument: ["felt piano", "pad"], sfxCategory: null } });
  expect(suggestLabel(t, "ambient")).toBe("Ambient · calm · felt piano");
  // no group: the first genre leads
  expect(suggestLabel(t, null)).toBe("Ambient · calm · felt piano");
  const bare = take({ id: "b", title: "untitled sketch" });
  expect(suggestLabel(bare, null)).toBe("Untitled sketch");
});

test("label: an effect leads with its category and says loop when it is one", () => {
  const t = take({ id: "s", kind: "sfx", loop: true, terms: { genre: [], mood: ["steady"], instrument: [], sfxCategory: "rain" } });
  expect(suggestLabel(t, "ambience")).toBe("Ambience · rain · steady · loop");
  expect(suggestLabel({ ...t, loop: false }, null)).toBe("Rain · steady");
});

/* ── 5 · groups and the agent line ────────────────────────────────────── */

test("suggestions: genres (or sfx categories) on ungrouped heads, minus existing rows", () => {
  const stacks = stackVersions([
    take({ id: "1", terms: { genre: ["lo-fi", "jazz"], mood: [], instrument: [], sfxCategory: null } }),
    take({ id: "2", terms: { genre: ["Lo-Fi"], mood: [], instrument: [], sfxCategory: null } }),
    take({ id: "3", group: "ambient", terms: { genre: ["drone"], mood: [], instrument: [], sfxCategory: null } }),
    take({ id: "4", terms: { genre: ["Jazz"], mood: [], instrument: [], sfxCategory: null } }),
    take({ id: "5", terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null } }),
  ]);
  // counted case-folded; spelled as the NEWEST head spells it (stacks are newest first)
  expect(seedSuggestions(stacks, ["Ambient"], "music")).toEqual([
    { name: "Jazz", n: 2 },
    { name: "Lo-Fi", n: 2 },
  ]);
  expect(stacks.filter((s) => matchesSuggestion(s, "LO-FI", "music")).map((s) => s.head.id).sort()).toEqual(["1", "2"]);
  const sfx = stackVersions([take({ id: "s", kind: "sfx", terms: { genre: [], mood: [], instrument: [], sfxCategory: "whoosh" } })]);
  expect(seedSuggestions(sfx, [], "sfx")).toEqual([{ name: "whoosh", n: 1 }]);
});

test("group edits: add / rename refuse blanks and case-folded duplicates; delete only when empty", () => {
  const g = { music: ["ambient", "synthwave"], sfx: ["impacts"] };
  expect(addGroup(g, "music", "  ")).toEqual({ ok: false, error: "a group needs a name" });
  expect(addGroup(g, "music", "Ambient").ok).toBe(false);
  expect(addGroup(g, "music", " trailer ")).toEqual({ ok: true, groups: { music: ["ambient", "synthwave", "trailer"], sfx: ["impacts"] } });
  expect(renameGroup(g, "music", "ambient", "SYNTHWAVE").ok).toBe(false);
  expect(renameGroup(g, "music", "ambient", "Ambient")).toEqual({ ok: true, groups: { music: ["Ambient", "synthwave"], sfx: ["impacts"] } });
  expect(moveGroup(g, "music", "synthwave", -1)).toEqual({ ok: true, groups: { music: ["synthwave", "ambient"], sfx: ["impacts"] } });
  expect(moveGroup(g, "music", "ambient", -1).ok).toBe(false);
  const stacks = stackVersions([take({ id: "1", group: "ambient" })]);
  expect(deleteGroup(g, "music", "ambient", stacks)).toEqual({ ok: false, error: "“ambient” holds 1 card" });
  expect(deleteGroup(g, "music", "synthwave", stacks)).toEqual({ ok: true, groups: { music: ["ambient"], sfx: ["impacts"] } });
  // the other kind is never touched
  expect(addGroup(g, "sfx", "ui").ok && (addGroup(g, "sfx", "ui") as { groups: typeof g }).groups.music).toEqual(g.music);
});

test("agent line: quotes the group and escapes what a shell would expand", () => {
  expect(agentLine("music", "ambient")).toBe('npx tsx pipeline/sound.mts finalized --kind music --group "ambient" --json');
  expect(agentLine("sfx", null)).toBe("npx tsx pipeline/sound.mts finalized --kind sfx --json");
  expect(agentLine("music", 'say "$HOME"')).toBe('npx tsx pipeline/sound.mts finalized --kind music --group "say \\"\\$HOME\\"" --json');
});
