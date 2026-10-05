// LANE — THE BOARD DECIDES IN ONE VOCABULARY AND WRITES IN EACH SOURCE'S OWN (dynamic).
//
// /board (platform-consolidation WP3) reads every human gate in the app
// through an adapter and writes the verdict back through that gate's existing
// writer. The translation table is the Board's correctness: an adapter that
// read "keep" as approve but wrote approve as "approved" would pass every
// screen test and corrupt the source on the first key press. So this file
// asserts, without a browser:
//
//   · every source's verdict mapping, both directions (lib/board/verdicts.ts)
//   · the undo stack — supersede, cap, and the replay order a one-of-N source
//     needs (lib/board/undo.ts)
//   · the key handler's suppression rules — typing, an overlay that is not the
//     loupe, key repeat, modifiers (lib/board/keys.ts)
//   · the URL state round trip (lib/board/url.ts)
//   · two adapters end to end over their real writers: the cull over a
//     replaced `fetch` (the whole-map PUT, read fresh), and adoption + triage
//     over the real step store on fake-indexeddb.
//
// The import below has a SIDE EFFECT and must come first — it installs the
// storage engine on globalThis before any module under test reads `indexedDB`.
import "fake-indexeddb/auto";
import { test, expect } from "@playwright/test";

import {
  decodeNote,
  encodeNote,
  fromAdoption,
  fromAlternative,
  fromKeep,
  fromProof,
  fromSlot,
  fromTraining,
  fromTriage,
  rescheduleAt,
  toAdoption,
  toKeep,
  toProof,
  toTraining,
  toTriage,
  withCullVerdict,
  withExtractVerdict,
} from "@/lib/board/verdicts";
import { diffVerdicts, popUndo, pushUndo, reversal, undoFor, UNDO_CAP, type UndoEntry, type VerdictState } from "@/lib/board/undo";
import { boardKeyAction, enterBelongsToTarget, LOUPE_MARK, overlayOpen, typing, type KeyLike } from "@/lib/board/keys";
import { inFilter, parseQuery, writeQuery } from "@/lib/board/url";
import { countEntries, itemId, keyOf, keyOfItem } from "@/lib/board/source";
import { makeCullSource } from "@/lib/board/sources/cull";
import { ADOPTION_REJECT_REFUSAL, makeAdoptionSource } from "@/lib/board/sources/adoption";
import { makeTriageSource } from "@/lib/board/sources/triage";
import { __resetSaveSlots, readStep, saveStep } from "@/app/_phases/_shared/stepStore";
import { addProjects } from "@/lib/projects";
import { RENDERS } from "@/app/_phases/script/renders";

/* ── verdict mapping, per adapter ─────────────────────────────────────────── */

test("board: cull + extract — keep|reject|absent read as approve|reject|null and write back the same words", () => {
  expect(fromKeep({ verdict: "keep" })).toBe("approve");
  expect(fromKeep({ verdict: "reject" })).toBe("reject");
  expect(fromKeep(undefined)).toBe(null);
  expect(toKeep("approve")).toBe("keep");
  expect(toKeep("reject")).toBe("reject");
  expect(toKeep(null)).toBe(undefined);

  // The whole-map write: one key changed, the rest byte-identical, null DELETES.
  const map = { a: { verdict: "keep" as const, at: "t0" }, b: { verdict: "reject" as const, at: "t0" } };
  const approved = withCullVerdict(map, "c", "approve", [], null, "t1");
  expect(approved).toEqual({ ...map, c: { verdict: "keep", at: "t1" } });
  expect(map).not.toHaveProperty("c"); // input untouched
  const cleared = withCullVerdict(map, "a", null);
  expect(cleared).toEqual({ b: map.b });

  const ex = withExtractVerdict({ s1: { verdict: "keep", at: "t0" } }, "s2", "reject", "t1");
  expect(ex).toEqual({ s1: { verdict: "keep", at: "t0" }, s2: { verdict: "reject", at: "t1" } });
  expect(withExtractVerdict(ex, "s1", null)).toEqual({ s2: ex.s2 });
});

test("board: cull reasons ride the note and read back; an approve carries none", () => {
  const rejected = withCullVerdict({}, "c", "reject", ["style", "subject"], "too dark", "t");
  expect(rejected.c.note).toBe("reasons: style, subject\ntoo dark");
  expect(decodeNote(rejected.c.note)).toEqual({ reasons: ["style", "subject"], note: "too dark" });
  // A note the forge or a human wrote by hand, with no reasons line, is kept whole.
  expect(decodeNote("plain words")).toEqual({ reasons: [], note: "plain words" });
  expect(decodeNote(undefined)).toEqual({ reasons: [], note: null });
  // Reasons are a REJECT's: approving drops them but keeps the note.
  expect(withCullVerdict({}, "c", "approve", ["style"], "fine", "t").c).toEqual({ verdict: "keep", at: "t", note: "fine" });
  expect(encodeNote([], null)).toBe(undefined);
});

test("board: dojo — the training writer's words ARE the Board's", () => {
  expect(fromTraining("approve")).toBe("approve");
  expect(fromTraining("reject")).toBe("reject");
  expect(fromTraining(null)).toBe(null);
  expect(fromTraining(undefined)).toBe(null);
  expect(toTraining("approve")).toBe("approve");
  expect(toTraining(null)).toBe(null);
});

test("board: proof — pending is a stored word, not an absence", () => {
  expect(fromProof("approved")).toBe("approve");
  expect(fromProof("rejected")).toBe("reject");
  expect(fromProof("pending")).toBe(null);
  expect(toProof("approve")).toBe("approved");
  expect(toProof("reject")).toBe("rejected");
  expect(toProof(null)).toBe("pending");
});

test("board: adoption — one pointer; approve writes the id, clearing the adopted one writes \"\", the others write nothing", () => {
  expect(fromAdoption("adjudication", "adjudication")).toBe("approve");
  expect(fromAdoption("adjudication", "reversal-chain")).toBe(null);
  expect(fromAdoption("", "reversal-chain")).toBe(null);
  expect(fromAdoption(undefined, "reversal-chain")).toBe(null);
  expect(toAdoption(undefined, "x", "approve")).toBe("x");
  expect(toAdoption("x", "x", null)).toBe(""); // the cleared convention, never a deletion
  expect(toAdoption("y", "x", null)).toBe(undefined); // not the adopted one: nothing to write
});

test("board: alternative — the active plate is the approved one", () => {
  expect(fromAlternative("alt-2", "alt-2")).toBe("approve");
  expect(fromAlternative("alt-2", "alt-1")).toBe(null);
  expect(fromAlternative(null, "alt-1")).toBe(null);
});

test("board: triage — the default is not a decision until the scope is confirmed", () => {
  const kept = { descoped: false, liked: false, deepen: false };
  const cut = { descoped: true, liked: false, deepen: false };
  expect(fromTriage(undefined, kept, false)).toBe(null);
  expect(fromTriage(kept, kept, false)).toBe("approve");
  expect(fromTriage(cut, cut, false)).toBe("reject");
  expect(fromTriage(undefined, cut, true)).toBe("reject"); // confirmed: the default is theirs now
  expect(toTriage(undefined, kept, "reject")).toEqual(cut);
  expect(toTriage(cut, kept, "approve")).toEqual(kept);
  expect(toTriage(cut, kept, null)).toBe(undefined); // U deletes the entry: back to default
  // …unless the entry also holds a like, which is the creator's too.
  expect(toTriage({ ...cut, liked: true }, kept, null)).toEqual({ descoped: false, liked: true, deepen: false });
});

test("board: publish — missed/failed wait; a slot that never missed is not a Board item", () => {
  const slot = (status: "scheduled" | "missed" | "failed" | "cancelled" | "published", missedAt: string | null = null, error: string | null = null) => ({ status, missedAt, error });
  expect(fromSlot(slot("missed", "t"))).toBe(null);
  expect(fromSlot(slot("failed", null, "quota"))).toBe(null);
  expect(fromSlot(slot("scheduled"))).toBe(undefined);
  expect(fromSlot(slot("scheduled", "t"))).toBe("approve"); // rescheduled after missing
  expect(fromSlot(slot("published", null, "retry ok"))).toBe("approve");
  expect(fromSlot(slot("cancelled", "t"))).toBe("reject");
  expect(fromSlot(slot("cancelled"))).toBe(undefined); // cancelled without ever missing
  const now = new Date("2026-10-05T10:00:00Z");
  expect(rescheduleAt(now)).toBe("2026-10-05T11:00:00.000Z");
});

test("board: ids round-trip and counts never invent a zero", () => {
  expect(keyOfItem(itemId("cull", "run::scene/a--b--s1"))).toBe("run::scene/a--b--s1");
  expect(keyOf(null)).toBe("clear");
  const e = (verdict: "approve" | "reject" | null) => ({ item: { verdict } }) as never;
  expect(countEntries([e(null), e("approve"), e("reject"), e("reject")])).toEqual({ total: 4, pending: 1, decided: 3, rejected: 2 });
});

/* ── the undo stack ───────────────────────────────────────────────────────── */

const vs = (verdict: "approve" | "reject" | null): VerdictState => ({ verdict, reasons: [], note: null });
const entry = (id: number, changes: [string, "approve" | "reject" | null, "approve" | "reject" | null][]): UndoEntry => ({
  id,
  itemId: changes[0][0],
  label: `e${id}`,
  at: id,
  changes: changes.map(([itemId, prev, next]) => ({ itemId, prev: vs(prev), next: vs(next) })),
});

test("board: undo — newest last, a newer decision on the same item supersedes, bounded", () => {
  let st = pushUndo([], entry(1, [["a", null, "reject"]]));
  st = pushUndo(st, entry(2, [["b", null, "approve"]]));
  st = pushUndo(st, entry(3, [["a", "reject", "approve"]]));
  expect(st.map((e) => e.id)).toEqual([2, 3]); // entry 1 superseded: Z never walks a back through "reject"
  const [top, rest] = popUndo(st);
  expect(top?.id).toBe(3);
  expect(rest.map((e) => e.id)).toEqual([2]);
  expect(undoFor(st, "b")?.id).toBe(2);
  expect(undoFor(st, "zz")).toBe(null);

  let big: UndoEntry[] = [];
  for (let i = 0; i < UNDO_CAP + 5; i++) big = pushUndo(big, entry(i, [[`i${i}`, null, "approve"]]));
  expect(big.length).toBe(UNDO_CAP);
  expect(big[0].id).toBe(5);
});

test("board: undo — a one-of-N pick replays the old pick BEFORE clearing the new one", () => {
  // Approving B moved A off: the source diff records both.
  const before = new Map([
    ["A", vs("approve")],
    ["B", vs(null)],
    ["C", vs(null)],
  ]);
  const after = new Map([
    ["A", vs(null)],
    ["B", vs("approve")],
    ["C", vs(null)],
  ]);
  const changes = diffVerdicts(before, after);
  expect(changes.map((c) => c.itemId).sort()).toEqual(["A", "B"]);
  const e: UndoEntry = { id: 1, itemId: "B", label: "B", at: 0, changes };
  // A scene always uses one plate: the clear of B is only writable once A is back.
  expect(reversal(e).map((w) => [w.itemId, w.to.verdict])).toEqual([
    ["A", "approve"],
    ["B", null],
  ]);
});

/* ── the key handler ──────────────────────────────────────────────────────── */

const press = (key: string, over: Partial<KeyLike> = {}): KeyLike => ({ key, ctrlKey: false, metaKey: false, altKey: false, repeat: false, target: null, ...over });
const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, closest: () => null, getAttribute: () => null, ...extra });

test("board keys: the map", () => {
  expect(boardKeyAction(press("a"), false)).toBe("approve");
  expect(boardKeyAction(press("A"), false)).toBe("approve"); // caps lock is not a different verb
  expect(boardKeyAction(press("x"), false)).toBe("reject");
  expect(boardKeyAction(press("u"), false)).toBe("clear");
  expect(boardKeyAction(press("j"), false)).toBe("next");
  expect(boardKeyAction(press("k"), false)).toBe("prev");
  expect(boardKeyAction(press("Enter"), false)).toBe("loupe");
  expect(boardKeyAction(press("Escape"), false)).toBe("close");
  expect(boardKeyAction(press("z"), false)).toBe("undo");
  expect(boardKeyAction(press("q"), false)).toBe(null);
});

test("board keys: typing owns its letters", () => {
  for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
    expect(typing(el(tag) as never)).toBe(true);
    expect(boardKeyAction(press("x", { target: el(tag) as never }), false), tag).toBe(null);
  }
  expect(typing(el("DIV", { isContentEditable: true }) as never)).toBe(true);
  // A span inside a contenteditable is still typing.
  expect(typing(el("SPAN", { closest: (s: string) => (s.includes("contenteditable") ? {} : null) }) as never)).toBe(true);
  expect(typing(el("BUTTON") as never)).toBe(false);
  expect(typing(null)).toBe(false);
});

test("board keys: a held key decides ONE item; navigation may repeat", () => {
  for (const k of ["a", "x", "u", "z", "Enter"]) expect(boardKeyAction(press(k, { repeat: true }), false), k).toBe(null);
  expect(boardKeyAction(press("j", { repeat: true }), false)).toBe("next");
  expect(boardKeyAction(press("k", { repeat: true }), false)).toBe("prev");
});

test("board keys: modifiers belong to the browser", () => {
  expect(boardKeyAction(press("a", { ctrlKey: true }), false)).toBe(null);
  expect(boardKeyAction(press("z", { metaKey: true }), false)).toBe(null);
  expect(boardKeyAction(press("x", { altKey: true }), false)).toBe(null);
});

test("board keys: a dialog owns the keyboard — except the loupe — and Escape always closes", () => {
  expect(boardKeyAction(press("a"), true)).toBe(null);
  expect(boardKeyAction(press("j"), true)).toBe(null);
  expect(boardKeyAction(press("Escape"), true)).toBe("close");

  const dialog = (loupe: boolean) => ({
    hasAttribute: () => false,
    querySelector: (s: string) => (loupe && s === `[${LOUPE_MARK}]` ? {} : null),
  });
  const root = (els: ReturnType<typeof dialog>[]) => ({ querySelectorAll: () => els });
  expect(overlayOpen(root([]))).toBe(false);
  expect(overlayOpen(root([dialog(true)]))).toBe(false); // the loupe keeps its keys
  expect(overlayOpen(root([dialog(false)]))).toBe(true); // any other dialog takes them
  expect(overlayOpen(root([dialog(true), dialog(false)]))).toBe(true);
  expect(overlayOpen(null)).toBe(false);
});

test("board keys: Enter on a focused control is the control's, not the loupe's", () => {
  for (const tag of ["BUTTON", "A", "SUMMARY", "SELECT"]) expect(enterBelongsToTarget(el(tag) as never), tag).toBe(true);
  expect(enterBelongsToTarget(el("DIV", { getAttribute: (n: string) => (n === "role" ? "tab" : null) }) as never)).toBe(true);
  expect(enterBelongsToTarget(el("BODY") as never)).toBe(false);
  expect(enterBelongsToTarget(el("DIV") as never)).toBe(false);
});

/* ── URL state ────────────────────────────────────────────────────────────── */

test("board url: parse is defensive and write keeps foreign params", () => {
  const p = (qs: string) => new URLSearchParams(qs);
  expect(parseQuery(p(""))).toEqual({ src: null, st: "pending", i: null });
  expect(parseQuery(p("src=cull&st=rejected&i=cull:r::c"))).toEqual({ src: "cull", st: "rejected", i: "cull:r::c" });
  expect(parseQuery(p("src=nope&st=weird"))).toEqual({ src: null, st: "pending", i: null });
  expect(writeQuery("v=3", { src: "proof", st: "pending", i: null })).toBe("v=3&src=proof");
  expect(writeQuery("v=2&src=cull&st=decided", { src: null, st: "pending", i: "x" })).toBe("v=2&i=x");
  expect(inFilter({ verdict: null }, "pending")).toBe(true);
  expect(inFilter({ verdict: "approve" }, "decided")).toBe(true);
  expect(inFilter({ verdict: "approve" }, "rejected")).toBe(false);
  expect(inFilter({ verdict: "reject" }, "rejected")).toBe(true);
});

/* ── adapters over their real writers ─────────────────────────────────────── */

test("board: the cull adapter reads FRESH and PUTs the whole map with one key changed", async () => {
  const disk: Record<string, { verdict: "keep" | "reject"; at: string; note?: string }> = {
    // Written by the /foundry tab after the Board loaded — must survive.
    "harbor/ink--words--s1": { verdict: "keep", at: "t0" },
  };
  const puts: unknown[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      puts.push(body);
      Object.assign(disk, body.verdicts);
      for (const k of Object.keys(disk)) if (!(k in body.verdicts)) delete disk[k];
      return new Response(JSON.stringify({ ok: true }));
    }
    if (u.endsWith("/api/foundry/runs/fx-run"))
      return new Response(JSON.stringify({ run: { id: "fx-run", candidates: [] }, verdicts: { ...disk } }));
    return new Response(JSON.stringify({ detail: "no" }), { status: 404 });
  }) as typeof fetch;
  try {
    const src = makeCullSource();
    await src.decide("cull:fx-run::harbor/blueprint--ref--s1", "reject", ["subject"]);
    expect(puts).toHaveLength(1);
    expect(disk["harbor/ink--words--s1"]).toEqual({ verdict: "keep", at: "t0" });
    expect(disk["harbor/blueprint--ref--s1"].verdict).toBe("reject");
    expect(disk["harbor/blueprint--ref--s1"].note).toBe("reasons: subject");
    await src.decide("cull:fx-run::harbor/blueprint--ref--s1", null);
    expect(disk).not.toHaveProperty("harbor/blueprint--ref--s1");
    // A route that is not there is UNAVAILABLE, not an error page.
    await expect(src.count()).rejects.toMatchObject({ name: "SourceUnavailable" });
  } finally {
    globalThis.fetch = real;
  }
});

test("board: adoption + triage write through the real step store and read back", async () => {
  __resetSaveSlots();

  const uid = "board-probe-uid";
  const pid = "board-probe-project";
  const now = Date.now();
  await addProjects([
    {
      id: pid,
      uid,
      title: "Probe",
      logline: "",
      template: "mid-educational-video",
      discipline: "educational",
      targetS: 300,
      createdAt: now,
      updatedAt: now,
      phase: "research",
      progress: { research: "done", script: "empty", frames: "empty", score: "empty", cut: "empty" },
    } as never,
  ]);
  await saveStep(pid, "research", { topic: "probe", researched: true });

  const adoption = makeAdoptionSource({ uid });
  let rows = await adoption.loadEntries();
  expect(rows).toHaveLength(RENDERS.length);
  expect(rows.every((r) => r.item.verdict === null)).toBe(true);
  const [a, b] = rows;
  await adoption.decide(a.item.id, "approve");
  await adoption.decide(b.item.id, "approve"); // B displaces A — one pointer
  rows = await adoption.loadEntries();
  expect(rows.find((r) => r.item.id === a.item.id)?.item.verdict).toBe(null);
  expect(rows.find((r) => r.item.id === b.item.id)?.item.verdict).toBe("approve");
  const rec = await readStep<{ renderId: string }>(pid, "script-adopted");
  expect(rec.ok && rec.data?.renderId).toBe(RENDERS[1].id);
  await expect(adoption.decide(a.item.id, "reject")).rejects.toThrow(ADOPTION_REJECT_REFUSAL);
  await adoption.decide(b.item.id, null);
  const cleared = await readStep<{ renderId: string }>(pid, "script-adopted");
  expect(cleared.ok && cleared.data?.renderId).toBe(""); // cleared, never deleted

  const triage = makeTriageSource({ uid });
  const cards = await triage.loadEntries();
  expect(cards.length).toBeGreaterThan(0);
  expect(cards.every((c) => c.item.verdict === null)).toBe(true);
  const cuttable = cards.find((c) => !c.refuse.reject)!;
  await triage.decide(cuttable.item.id, "reject");
  const again = await triage.loadEntries();
  expect(again.find((c) => c.item.id === cuttable.item.id)?.item.verdict).toBe("reject");
  const required = cards.find((c) => c.refuse.reject);
  if (required) await expect(triage.decide(required.item.id, "reject")).rejects.toMatchObject({ name: "VerdictRefused" });
  await triage.decide(cuttable.item.id, null);
  const back = await triage.loadEntries();
  expect(back.find((c) => c.item.id === cuttable.item.id)?.item.verdict).toBe(null);
});
