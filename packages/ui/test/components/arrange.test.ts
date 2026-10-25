// The Arrange board's rules (Phase 6, L60), absorbed from v1 lib/sound/arrangeModel.ts and its
// probe (tests/golden-path/sound-arrange.probe.spec.ts): version stacking by the chain, rows and
// cells, the move check and the door's judgement against the store as it is now, the keyboard
// walk, the label suggestion, and the group edits with the takes they carry.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { admitMove, buildBoard, cellKey, cellOf, checkMove, rowsFor, stackVersions, stageCounts, step, suggestLabel, versionNumber, walk, UNGROUPED_KEY, type ArrangeTake, type Stage } from "../../src/components/audio/arrange.ts";
import { ArrangeBoard } from "../../src/components/audio/ArrangeBoard.tsx";
import { EngineList } from "../../src/components/audio/EngineList.tsx";
import { RoundTrip } from "../../src/components/audio/RoundTrip.tsx";
import { TakeCard, type CardTake } from "../../src/components/audio/TakeCard.tsx";
import { RowFoot, RowHead } from "../../src/components/audio/RowHead.tsx";
import { applyGroupOp, carriedBy, deleteGroup, moveGroup, renameGroup, seedSuggestions, type Groups } from "../../src/components/audio/arrangeGroups.ts";

type T = ArrangeTake & { readonly verdict: string };
let n = 0;
const take = (id: string, over: Partial<T> = {}): T => {
  n += 1;
  return {
    id,
    title: id,
    kind: "music",
    stage: "pending",
    group: null,
    label: null,
    parentId: null,
    createdAt: `2026-10-0${(n % 9) + 1}T00:00:00.000Z`,
    loop: null,
    terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
    verdict: "kept",
    ...over,
  };
};

describe("version stacks", () => {
  test("the chain decides the head, not the clock: a return dated before its parent still heads the card", () => {
    const a = take("a", { createdAt: "2026-10-05T00:00:00.000Z" });
    const b = take("b", { parentId: "a", createdAt: "2026-10-01T00:00:00.000Z" });
    const c = take("c", { parentId: "b", createdAt: "2026-09-01T00:00:00.000Z" });
    const [s] = stackVersions([a, c, b]);
    expect(s?.head.id).toBe("c");
    expect(s?.versions.map((v) => v.id)).toEqual(["c", "b", "a"]);
    expect(s?.rootId).toBe("a");
    expect(s === undefined ? null : versionNumber(s, "a")).toBe(1);
  });
  test("a parent outside the set roots its child; a cycle ends at the first repeat", () => {
    expect(stackVersions([take("x", { parentId: "gone" })]).map((s) => s.rootId)).toEqual(["x"]);
    const loop = stackVersions([take("p", { parentId: "q" }), take("q", { parentId: "p" })]);
    expect(loop.flatMap((s) => s.versions).length).toBe(2);
  });
});

describe("rows and cells", () => {
  test("declared rows in order, then orphans, then ungrouped last; a stageless keep is pending", () => {
    const stacks = stackVersions([take("a", { group: "zeta" }), take("b", { group: "ambient", stage: null })]);
    const rows = rowsFor(["ambient", "cinematic"], stacks);
    expect(rows.map((r) => [r.name, r.orphan])).toEqual([
      ["ambient", false],
      ["cinematic", false],
      ["zeta", true],
      [null, false],
    ]);
    expect(rows.at(-1)?.key).toBe(UNGROUPED_KEY);
    const board = buildBoard(stacks, rows);
    expect(board.get(cellKey({ stage: "pending", group: "ambient" }))?.map((s) => s.head.id)).toEqual(["b"]);
    expect(stageCounts(stacks)).toEqual({ pending: 2, remaster: 0, edit: 0, finalized: 0 });
  });
});

describe("the move check", () => {
  const rows = rowsFor(["ambient"], []);
  const [s] = stackVersions([take("a", { stage: "edit", group: "ambient" })]);
  if (s === undefined) throw new Error("no stack");
  test("finalized needs a label; one carried already will do; a given one rides the patch", () => {
    expect(checkMove(s, { stage: "finalized", group: "ambient" }, rows)).toEqual({ ok: false, reason: "needs-label" });
    expect(checkMove(s, { stage: "finalized", group: "ambient" }, rows, "  ")).toEqual({ ok: false, reason: "needs-label" });
    expect(checkMove(s, { stage: "finalized", group: "ambient" }, rows, " Ambient · calm ")).toEqual({ ok: true, patch: { stage: "finalized", group: "ambient", label: "Ambient · calm" } });
    const [labelled] = stackVersions([take("l", { stage: "edit", group: "ambient", label: "Kept" })]);
    expect(labelled === undefined ? null : checkMove(labelled, { stage: "finalized", group: "ambient" }, rows)).toEqual({ ok: true, patch: { stage: "finalized", group: "ambient" } });
  });
  test("the same cell is a no-op and a row that does not exist is refused", () => {
    expect(checkMove(s, cellOf(s), rows)).toEqual({ ok: false, reason: "same-cell" });
    expect(checkMove(s, { stage: "pending", group: "nowhere" }, rows)).toEqual({ ok: false, reason: "unknown-row" });
  });
});

describe("the door judges the store as it is now", () => {
  const a = take("a", { stage: "remaster", group: "ambient" });
  const from = { stage: "remaster" as Stage, group: "ambient" };
  test("a card that moved since it was picked up is refused with where it is", () => {
    const r = admitMove([{ ...a, stage: "edit" }], ["ambient"], { id: "a", from, to: { stage: "finalized", group: "ambient" }, label: "x" });
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["conflict", "a moved since it was picked up: it is in edit · ambient"]);
  });
  test("a card that is no longer its stack's head is refused", () => {
    const r = admitMove([a, take("b", { parentId: "a", stage: "remaster", group: "ambient" })], ["ambient"], { id: "a", from, to: { stage: "edit", group: "ambient" } });
    expect(r.ok ? null : r.error.code).toBe("conflict");
  });
  test("an unkept take, a missing label and a missing take are refused; a landed retry is answered", () => {
    expect(admitMove([{ ...a, verdict: "rejected" }], ["ambient"], { id: "a", from, to: { stage: "edit", group: "ambient" } }).ok).toBe(false);
    const nolabel = admitMove([a], ["ambient"], { id: "a", from, to: { stage: "finalized", group: "ambient" } });
    expect(nolabel.ok ? null : [nolabel.error.code, nolabel.error.message]).toEqual(["refused", "a finalized take needs a library label"]);
    expect(admitMove([a], ["ambient"], { id: "zz", from, to: from }).ok).toBe(false);
    const again = admitMove([{ ...a, stage: "edit" }], ["ambient"], { id: "a", from, to: { stage: "edit", group: "ambient" } });
    expect(again.ok ? again.value.already : null).toBe(true);
    const fresh = admitMove([a], ["ambient"], { id: "a", from, to: { stage: "edit", group: "ambient" } });
    expect(fresh.ok ? [fresh.value.already, fresh.value.patch] : null).toEqual([false, { stage: "edit", group: "ambient" }]);
  });
});

describe("the keyboard", () => {
  const stacks = stackVersions([take("p1", { group: "ambient" }), take("p2", { group: "ambient" }), take("e1", { stage: "edit", group: null })]);
  const rows = rowsFor(["ambient"], stacks);
  const board = buildBoard(stacks, rows);
  test("a step stops at the board's edge", () => {
    expect(step({ stage: "finalized", group: null }, "right", rows)).toBeNull();
    expect(step({ stage: "pending", group: "ambient" }, "up", rows)).toBeNull();
    expect(step({ stage: "pending", group: "ambient" }, "down", rows)).toEqual({ stage: "pending", group: null });
  });
  test("the walk goes down a cell first, then to the next non-empty cell that way", () => {
    const at = { stage: "pending" as Stage, group: "ambient" };
    expect(walk(board, rows, at, 0, "down")).toEqual({ cell: at, index: 1 });
    expect(walk(board, rows, at, 0, "right")).toBeNull();
    expect(walk(board, rows, { stage: "pending", group: null }, 0, "right")).toEqual({ cell: { stage: "edit", group: null }, index: 0 });
  });
});

describe("the label offered at finalize", () => {
  test("the group leads; duplicates fold; an effect says loop", () => {
    expect(suggestLabel(take("m", { terms: { genre: ["Ambient"], mood: ["calm", "Ambient"], instrument: ["piano"], sfxCategory: null } }), "ambient")).toBe("Ambient · calm · piano");
    expect(suggestLabel(take("s", { kind: "sfx", loop: true, terms: { genre: [], mood: ["dark"], instrument: [], sfxCategory: "risers" } }), null)).toBe("Risers · dark · loop");
  });
});

describe("the rows' edits", () => {
  const g: Groups = { music: ["ambient", "cinematic"], sfx: [] };
  test("a name is one row whatever its case; the edge refuses; a held row is not deleted", () => {
    expect(applyGroupOp(g, "music", { op: "add", name: "Ambient" }, [])).toEqual({ ok: false, error: "“Ambient” is already a row" });
    expect(moveGroup(g, "music", "ambient", -1)).toEqual({ ok: false, error: "already at the edge" });
    expect(moveGroup(g, "music", "ambient", 1)).toEqual({ ok: true, groups: { music: ["cinematic", "ambient"], sfx: [] } });
    expect(renameGroup(g, "music", "ambient", " drone ")).toEqual({ ok: true, groups: { music: ["drone", "cinematic"], sfx: [] } });
    expect(deleteGroup(g, "music", "ambient", stackVersions([take("a", { group: "ambient" })]))).toEqual({ ok: false, error: "“ambient” holds 1 card" });
  });
  test("an orphan spelled in another case than a declared row is adopted by merging into the declared row", () => {
    const takes = [take("a", { group: "Ambient" }), take("b", { group: "ambient" }), take("c", { group: "ambient", parentId: "b" }), take("d", { group: null, terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null } })];
    const stacks = stackVersions(takes);
    const declared = ["Ambient"];
    const orphan = rowsFor(declared, stacks).find((r) => r.orphan);
    expect(orphan).toMatchObject({ name: "ambient", orphan: true, into: "Ambient" });
    const gs: Groups = { music: declared, sfx: [] };
    const op = { op: "adopt", name: "ambient" } as const;
    expect(applyGroupOp(gs, "music", op, stacks)).toEqual({ ok: true, groups: gs });
    expect(carriedBy(op, "music", takes, stacks, declared)).toEqual([
      { id: "b", group: "Ambient" },
      { id: "c", group: "Ambient" },
    ]);
    // the typed new-row field still refuses the same name
    expect(applyGroupOp(gs, "music", { op: "add", name: "ambient" }, stacks)).toEqual({ ok: false, error: "“ambient” is already a row" });
    expect(rowsFor(declared, stackVersions(takes.map((t) => (t.group === "ambient" ? { ...t, group: "Ambient" } : t)))).filter((r) => r.orphan)).toEqual([]);
  });
  test("a rename carries every take under the old name, older versions too; an adopt files the ungrouped heads that carry it", () => {
    const takes = [take("a", { group: "ambient" }), take("b", { group: "ambient", parentId: "a" }), take("c", { group: null, terms: { genre: ["Drone"], mood: [], instrument: [], sfxCategory: null } })];
    const stacks = stackVersions(takes);
    expect(carriedBy({ op: "rename", from: "ambient", to: "calm" }, "music", takes, stacks)).toEqual([
      { id: "a", group: "calm" },
      { id: "b", group: "calm" },
    ]);
    expect(seedSuggestions(stacks, ["ambient"], "music")).toEqual([{ name: "Drone", n: 1 }]);
    expect(carriedBy({ op: "adopt", name: "drone" }, "music", takes, stacks)).toEqual([{ id: "c", group: "drone" }]);
  });
});

describe("the parts draw what the rules say", () => {
  const ct = (id: string, over: Partial<CardTake> = {}): CardTake => ({ ...take(id), src: `/f/${id}`, peaks: [0.5, 1], lengthS: 45, prompt: "p", origin: "lab", fileName: null, ...over });
  const none = (): void => undefined;
  test("a card in flight is provisional; a stack with a return names its version; finalized wears its label", () => {
    const stacks = stackVersions([ct("a", { stage: "finalized", label: "Night · calm" }), ct("b", { parentId: "a", stage: "finalized", label: "Night · calm", origin: "suno-return" })]);
    const [s] = stacks;
    if (s === undefined) throw new Error("no stack");
    const html = renderToStaticMarkup(h(TakeCard, { stack: s, focused: false, pending: true, playing: null, open: true, onFocus: none, onPointerDown: none, onPlay: none, onVersions: none }));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="b, v2"');
    expect(html).toContain("Night · calm");
    expect(html).toContain("suno return");
    expect(renderToStaticMarkup(h(TakeCard, { stack: s, focused: false, pending: false, playing: null, open: false, onFocus: none, onPointerDown: none, onPlay: none, onVersions: none }))).not.toContain("aria-busy");
  });
  test("a card spells a take's length as the hunt does: a sub-second effect is not 0:01", () => {
    const card = (lengthS: number | null): string => {
      const [s] = stackVersions([ct("fx", { kind: "sfx", lengthS })]);
      if (s === undefined) throw new Error("no stack");
      return renderToStaticMarkup(h(TakeCard, { stack: s, focused: false, pending: false, playing: null, open: false, onFocus: none, onPointerDown: none, onPlay: none, onVersions: none }));
    };
    for (const [len, said] of [[0.6, "0.6s"], [4.25, "4.3s"], [125, "2:05"], [null, "–"]] as const) expect(card(len), String(len)).toContain(`<span>${said}</span>`);
  });
  test("a row's head offers only the edits its row may take", () => {
    const names = (row: { key: string; name: string | null; orphan: boolean }, held: number, first: boolean, last: boolean): string[] =>
      [...renderToStaticMarkup(h(RowHead, { row, held, first, last, onEdit: none })).matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1] ?? "");
    expect(names({ key: UNGROUPED_KEY, name: null, orphan: false }, 3, false, true)).toEqual([]);
    expect(names({ key: "g:zeta", name: "zeta", orphan: true }, 1, false, false)).toEqual(["adopt zeta as a row"]);
    expect(names({ key: "g:ambient", name: "ambient", orphan: false }, 0, true, false)).toEqual(["rename ambient", "move ambient down", "delete ambient"]);
    expect(names({ key: "g:ambient", name: "ambient", orphan: false }, 2, false, true)).toEqual(["rename ambient", "move ambient up"]);
    const foot = renderToStaticMarkup(h(RowFoot, { suggestions: [{ name: "lofi", n: 3 }], busy: false, onEdit: none }));
    expect([...foot.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1])).toEqual(["new row", "make lofi a row, filing 3"]);
  });
  test("every cell carries its key for the drag, and the lit one is marked", () => {
    const stacks = stackVersions([ct("a")]);
    const rows = rowsFor([], stacks);
    const html = renderToStaticMarkup(h(ArrangeBoard, { stacks, rows, over: cellKey({ stage: "edit", group: null }), renderCard: (x) => x.head.title, renderRowHead: (r) => r.key }));
    expect(html.match(/data-cell="/g)).toHaveLength(4);
    expect(html).toMatch(/class="[^"]*over[^"]*"[^>]*data-cell="edit\|∅"/);
  });
  test("a withheld op keeps its place with its reason; a round trip offers both landing stages", () => {
    const html = renderToStaticMarkup(h(EngineList, { label: "engines", engines: [{ id: "el", name: "ElevenLabs", transport: "api", state: "copy-only", ops: ["prompt-copy"], withheld: [{ op: "compose", reason: "no desk producer" }, { op: "sfx", reason: "no desk producer" }] }] }));
    expect(html).toContain("compose · sfx");
    expect(html.match(/no desk producer/g)).toHaveLength(1);
    const trip = renderToStaticMarkup(h(RoundTrip, { kind: "sfx", title: "Hit", stage: "edit", next: "finalized", download: null, busy: false, onCopyPrompt: null, onFile: none }));
    expect(trip).toContain("trim · fade");
    expect(trip).toContain('aria-label="return for Hit, stays in edit"');
    expect(trip).toContain('aria-label="return for Hit, moves to finalized"');
    expect(trip).toContain("no file");
  });
});
