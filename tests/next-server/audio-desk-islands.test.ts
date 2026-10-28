// THE AUDIO DESK'S ARRANGE ISLAND, ITS REQUEST POSTURE (app/(studio)/audio/_audio/Arrange.tsx).
// The board's writes are requests to the sound store (drag-drop ownership-boundaries): a move is
// drawn provisional until the store answers, and "nothing floats provisional forever". These
// cases hold the one helper every board write awaits through, `answered`: a write that answers is
// its answer, one that never answers is "no-answer" at the wait, and one that REJECTS - a Server
// Action whose round trip failed rejects rather than answering `ok: false` - is its words, never a
// rejection that skips the caller's settle and strands the card (and, for the rows, `rowsBusy`).
// And one write per card at a time, `inFlight`: a move and a Suno return are both writes, and
// either one in flight refuses the other (before, the return consulted nothing and the move
// only another move).
//
// THE CARD DRAG (./useCardDrag.ts), driven through the node lane's one hook dispatcher
// (tests/golden-path/_studio/hooks.ts) over EventTarget stand-ins for the card and the document:
// the cancel paths drag-drop drag-lifecycle names and the board's drag lacked - Escape mid-drag
// is a cancel, never the drop the next release would have made - and one drag at a time: a second
// press while a drag is live is inert, and a press that never travelled does not block the next.
//
// THE TRANSPORT (./useTransport.ts), the same dispatcher over an <audio> stand-in that keeps the
// media element's promise rule: pause() while a play() is pending rejects that play with an
// AbortError. A stop pressed while the take is still loading is the person's own stop, never a
// failure line (media-playback transport-contract: a failure is a play that did not happen).
//
// THE COMPOSER'S HAND (./AudioLane.tsx), the island itself through the same dispatcher (its JSX is
// only walked for the TermRail's props): a hand is drawn the moment it is set, and a hand the store
// refuses - or whose request never comes back - is taken off again, never left drawn.

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
const toasts = vi.hoisted((): string[] => []);
vi.mock("../../app/(studio)/_shell/Providers.tsx", () => ({ useShell: () => ({ toast: (w: string) => toasts.push(w) }) }));
vi.mock("@gt/ui/keymap/dispatch", async (orig) => ({ ...(await orig<object>()), useKeys: () => {} }));

import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { Hand, Term } from "@gt/ui/components/audio/recipe.ts";

import { answered, inFlight } from "../../app/(studio)/audio/_audio/Arrange.tsx";
import { AudioLane, type AudioActs } from "../../app/(studio)/audio/_audio/AudioLane.tsx";
import { useCardDrag } from "../../app/(studio)/audio/_audio/useCardDrag.ts";
import { useTransport } from "../../app/(studio)/audio/_audio/useTransport.ts";
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

describe("inFlight - one write per card", () => {
  const none = new Map<string, { landed: boolean }>();
  it("a card with nothing in flight, or whose move has landed, takes the next write", () => {
    expect(inFlight(none, new Set(), "a")).toBeNull();
    expect(inFlight(new Map([["a", { landed: true }]]), new Set(), "a")).toBeNull();
  });
  it("a move not yet answered refuses the next write, a return included", () => {
    expect(inFlight(new Map([["a", { landed: false }]]), new Set(), "a")).toBe("a move is still in flight");
  });
  it("a return uploading refuses the next write, a move included", () => {
    expect(inFlight(none, new Set(["a"]), "a")).toBe("a return is still uploading");
    expect(inFlight(none, new Set(["b"]), "a")).toBeNull();
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

// ── the transport ──

class FakeAudio extends EventTarget {
  static last: FakeAudio | null = null;
  paused = true;
  src = "";
  preload = "";
  error: { code: number } | null = null;
  currentTime = 0;
  duration = Number.NaN;
  private pending: ((e: Error) => void) | null = null;
  constructor() {
    super();
    FakeAudio.last = this;
  }
  play(): Promise<void> {
    this.paused = false;
    return new Promise((_ok, reject) => {
      this.pending = reject;
    });
  }
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.pending?.(Object.assign(new Error("The play() request was interrupted by a call to pause()."), { name: "AbortError" }));
    this.pending = null;
    setTimeout(() => this.dispatchEvent(new Event("pause")), 0);
  }
  load(): void {}
  removeAttribute(): void {}
}

async function transport() {
  g["Audio"] = FakeAudio;
  const fails: string[] = [];
  // "stable": the hook syncs its onFail ref in a dep-less effect, which re-queues every render.
  const h = harness(() => useTransport((w) => fails.push(w)), { settleWhen: "stable" });
  return { fails, h, t: await h.settleUp() };
}

describe("useTransport - a stop is not a failure", () => {
  it("a stop pressed while the take is still loading says nothing and stops", async () => {
    const { fails, h, t } = await transport();
    t.toggle("a", "/a.wav");
    const loading = await h.settleUp();
    expect([loading.playing, FakeAudio.last?.paused]).toEqual(["a", false]);
    loading.toggle("a", "/a.wav");
    const after = await h.settleUp();
    expect(fails).toEqual([]);
    expect(after.playing).toBeNull();
    h.unmount();
  });

  it("another take pressed while one loads moves the one element, and says nothing", async () => {
    const { fails, h, t } = await transport();
    t.toggle("a", "/a.wav");
    (await h.settleUp()).toggle("b", "/b.wav");
    const after = await h.settleUp();
    expect(fails).toEqual([]);
    expect([after.playing, FakeAudio.last?.src]).toEqual(["b", "/b.wav"]);
    h.unmount();
  });
});

// ── the composer's hand ──

type Rail = { readonly terms: readonly Term[]; readonly onHand: (id: string, h: Hand) => void };
function railOf(node: ReactNode): Rail | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = railOf(n as ReactNode);
      if (r !== null) return r;
    }
    return null;
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return null;
  const p = node.props as Record<string, unknown>;
  if (typeof p["onHand"] === "function" && Array.isArray(p["terms"])) return p as unknown as Rail;
  return railOf(p["children"] as ReactNode);
}

const term: Term = { id: "genre:ambient", term: "ambient", facet: "genre", n: 4, kept: 3, rejected: 1, keepRate: 0.75, stance: null, phrase: "", topDefect: null };
const view = { terms: { ok: true, value: [term] }, takes: { ok: true, value: [] }, concept: [], keys: [], drafts: { ok: true, value: [] }, references: [] } as const;

async function lane(setHand: AudioActs["setHand"]) {
  toasts.length = 0;
  const acts = { setHand, sunoReceipt: vi.fn(), sunoConfirm: vi.fn() } as unknown as AudioActs;
  const h = harness(() => AudioLane({ view, nowMs: 0, acts, engines: [], canSend: true, audible: [] }), { settleWhen: "stable" });
  const rail = async (): Promise<Rail> => {
    const r = railOf(await h.settleUp());
    if (r === null) throw new Error("no TermRail in the lane");
    return r;
  };
  return rail;
}

describe("AudioLane - the hand a person sets", () => {
  it("a hand the store refuses is taken off the rail again, with the store's words", async () => {
    const rail = await lane(async () => ({ ok: false, error: { error: "no term genre:ambient", code: "invalid" } }));
    (await rail()).onHand("genre:ambient", { stance: "prefer" });
    expect((await rail()).terms[0]?.stance).toBeNull();
    expect(toasts).toEqual(["no term genre:ambient"]);
  });

  it("a hand whose request never came back is taken off too, and said", async () => {
    const rail = await lane(() => Promise.reject(new Error("Failed to fetch")));
    (await rail()).onHand("genre:ambient", { stance: "avoid" });
    expect((await rail()).terms[0]?.stance).toBeNull();
    expect(toasts).toEqual(["Failed to fetch"]);
  });

  it("a hand the store takes stays drawn", async () => {
    const rail = await lane(async () => ({ ok: true, value: { id: "genre:ambient" } }));
    (await rail()).onHand("genre:ambient", { stance: "prefer" });
    expect((await rail()).terms[0]?.stance).toBe("prefer");
  });
});
