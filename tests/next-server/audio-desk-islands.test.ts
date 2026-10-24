// THE AUDIO DESK'S ARRANGE ISLAND, ITS REQUEST POSTURE (app/(studio)/audio/_audio/Arrange.tsx).
// The board's writes are requests to the sound store (drag-drop ownership-boundaries): a move is
// drawn provisional until the store answers, and "nothing floats provisional forever". These
// cases hold the one helper every board write awaits through, `answered`: a write that answers is
// its answer, one that never answers is "no-answer" at the wait, and one that REJECTS - a Server
// Action whose round trip failed rejects rather than answering `ok: false` - is its words, never a
// rejection that skips the caller's settle and strands the card (and, for the rows, `rowsBusy`).
//
// THE CARD DRAG (./useCardDrag.ts), driven through the node lane's one hook dispatcher
// (tests/golden-path/_studio/hooks.ts) over EventTarget stand-ins for the card and the document:
// the cancel paths drag-drop drag-lifecycle names and the board's drag lacked - Escape mid-drag
// is a cancel, never the drop the next release would have made - and one drag at a time: a second
// press while a drag is live is inert, and a press that never travelled does not block the next.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("../../app/(studio)/_shell/Providers.tsx", () => ({ useShell: () => ({ toast: () => {} }) }));

import type { PointerEvent as ReactPointerEvent } from "react";

import { answered } from "../../app/(studio)/audio/_audio/Arrange.tsx";
import { useCardDrag } from "../../app/(studio)/audio/_audio/useCardDrag.ts";
import { harness } from "../golden-path/_studio/hooks.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("answered - every board write's wait", () => {
  it("a write that answers is its answer, and leaves no timer behind", async () => {
    vi.useFakeTimers();
    const r = await answered(Promise.resolve({ ok: true as const, value: 1 }), 15_000);
    expect(r).toEqual({ ok: true, value: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a write that never answers is no-answer at the wait", async () => {
    vi.useFakeTimers();
    const r = answered(new Promise<never>(() => {}), 15_000);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await r).toBe("no-answer");
  });

  it("a write that rejects resolves to its words, so the caller settles the card", async () => {
    const r = await answered(Promise.reject(new Error("Failed to fetch")), 15_000).catch((e: unknown) => ({ rejected: String(e) }));
    expect(r).toEqual({ threw: "Failed to fetch" });
  });
});

// ── the card drag ──

const CELL = "pending|drone";
const g = globalThis as Record<string, unknown>;
g["Element"] ??= class Element {};
g["document"] ??= Object.assign(new EventTarget(), { elementFromPoint: () => ({ closest: () => ({ getAttribute: () => CELL }) }) });

type Card = EventTarget & { setPointerCapture: (id: number) => void };
const card = (): Card => Object.assign(new EventTarget(), { setPointerCapture: () => {} });
const pointer = (type: string, x: number): Event => Object.assign(new Event(type), { clientX: x, clientY: 0, pointerId: 1 });
const press = (el: Card): ReactPointerEvent<HTMLElement> => ({ button: 0, target: null, currentTarget: el, clientX: 0, clientY: 0 }) as unknown as ReactPointerEvent<HTMLElement>;

async function drag() {
  const drops: string[] = [];
  const h = harness(() => useCardDrag((id, key) => drops.push(`${id}@${key}`)));
  return { drops, d: await h.settleUp() };
}

describe("useCardDrag - the drag's exits", () => {
  it("a press that travels past the slop and releases over a cell is the drop", async () => {
    const { drops, d } = await drag();
    const el = card();
    d.start("a", press(el));
    el.dispatchEvent(pointer("pointermove", 20));
    el.dispatchEvent(pointer("pointerup", 20));
    expect(drops).toEqual([`a@${CELL}`]);
  });

  it("Escape mid-drag is a cancel: the release after it drops nothing", async () => {
    const { drops, d } = await drag();
    const el = card();
    d.start("a", press(el));
    el.dispatchEvent(pointer("pointermove", 20));
    (g["document"] as EventTarget).dispatchEvent(Object.assign(new Event("keydown"), { key: "Escape" }));
    el.dispatchEvent(pointer("pointerup", 20));
    expect(drops).toEqual([]);
  });

  it("a second press while a drag is live is inert: the live drag still drops", async () => {
    const { drops, d } = await drag();
    const a = card();
    const b = card();
    d.start("a", press(a));
    a.dispatchEvent(pointer("pointermove", 20));
    d.start("b", press(b));
    b.dispatchEvent(pointer("pointermove", 20));
    b.dispatchEvent(pointer("pointerup", 20));
    a.dispatchEvent(pointer("pointerup", 20));
    expect(drops).toEqual([`a@${CELL}`]);
  });

  it("a press that never travelled does not block the next drag", async () => {
    const { drops, d } = await drag();
    d.start("a", press(card()));
    const b = card();
    d.start("b", press(b));
    b.dispatchEvent(pointer("pointermove", 20));
    b.dispatchEvent(pointer("pointerup", 20));
    expect(drops).toEqual([`b@${CELL}`]);
  });
});
