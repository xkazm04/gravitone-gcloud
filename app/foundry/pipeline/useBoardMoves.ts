"use client";

// A DROP IS A REQUEST — everything between "the operator let go" and "the
// authority answered", and the one place a move is submitted.
//
// `decide` is the one entrance: it reads the verdict for a cell, and either
// refuses with the authority's own words, opens the prompt the authority asked
// for, or submits. ./submitMoves.ts is the chokepoint underneath it — where the
// arm is clamped and the pending set is raised — and it is a separate file
// because it is the only part of this that spends money.
//
// THE GHOST IS WHAT THE OPERATOR SEES OF ALL THIS, and it is ./useGhostFlight.ts:
// the springs, the landing and the return journey. This file decides WHERE it
// lands and whether the landing is allowed to stand.
//
// WHAT IT DOES NOT OWN: the drag gesture (./useCardDrag.ts) and the verb lists
// (./useBoardVerbs.ts). Both call `decide`, which is the seam.

import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { Flight, Live, Notice, PromptState } from "./canvasTypes";
import { tailPos, type Layout } from "./geometry";
import type { PromptAnswer, PromptOutcome } from "./MovePrompt";
import { buildVerdicts, type Verdicts } from "./moves";
import { submitMoves } from "./submitMoves";
import { NONE } from "./tunables";
import { useGhostFlight, type Ghost } from "./useGhostFlight";
import type { Viewport } from "./useViewport";

export interface BoardMoves {
  flight: Flight | null;
  prompt: PromptState | null;
  notice: Notice | null;
  pending: ReadonlySet<string>;
  setNotice: React.Dispatch<React.SetStateAction<Notice | null>>;
  setFlight: React.Dispatch<React.SetStateAction<Flight | null>>;
  ghost: Ghost;
  decide(ids: string[], lane: number, col: number, via: { drag: boolean; verdicts?: Verdicts }): Promise<void>;
  answerPrompt(p: PromptState, a: PromptAnswer): Promise<PromptOutcome>;
  cancelPrompt(p: PromptState): void;
  goHome(f: { ids: string[]; lead: string }): Promise<void>;
  refuse(ids: string[], reason: string, retry?: () => void): void;
  /** The retry the last refusal left on this card, if it left one. */
  retryOf(id: string): (() => void) | undefined;
}

export function useBoardMoves({
  viewportRef,
  deadRef,
  liveRef,
  viewport,
  layout,
  arm,
  calm,
  say,
  colWord,
}: {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  deadRef: React.RefObject<boolean>;
  liveRef: React.RefObject<Live | null>;
  viewport: Viewport;
  layout: Layout;
  arm: "stub" | "live";
  calm: boolean;
  say(text: string): void;
  colWord(L: Layout, col: number): string;
}): BoardMoves {
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(NONE);
  const pendingSayRef = useRef<{ id: string; verb: string; dry?: boolean } | null>(null);
  const { ghost, flight, setFlight, settle, goHome, landDone } = useGhostFlight({ liveRef, deadRef, calm });


  /* ── announcing a settled move ──────────────────────────────────────── */

  // "moved to gate, 4 of 9" needs the card's place AFTER the relayout.
  const onSettled = useEffectEvent((): (() => void) | void => {
    const p = pendingSayRef.current;
    if (!p) return;
    const s = layout.slotOf.get(p.id);
    if (!s) return;
    pendingSayRef.current = null;
    const n = layout.ids[s.lane * layout.columns.length + s.col].length;
    const title = layout.entryOf.get(p.id)?.item.title ?? "";
    // A stubbed move did not happen, so it is not announced as one: the card
    // has returned to where it was and the sentence has to agree with it.
    say(p.dry ? `${title} not moved: nothing was spent` : `${title} moved to ${colWord(layout, s.col)}, ${s.row + 1} of ${n}`);
    const id = requestAnimationFrame(() => viewport.reveal(p.id));
    return () => cancelAnimationFrame(id);
  });
  useEffect(() => onSettled(), [layout]);

  /* ── submit ─────────────────────────────────────────────────────────── */

  /** The chokepoint, with the arm and the pending set bound to this board. */
  const submit = (ids: string[], laneKey: string, col: number, answers: PromptAnswer = {}) => submitMoves(ids, laneKey, col, answers, { liveRef, deadRef, arm, setPending });

  const refuse = (ids: string[], reason: string, retry?: () => void) => {
    setNotice({ ids, text: reason, retry });
    say(reason);
  };

  const retryOf = (id: string) => (notice && notice.ids.includes(id) ? notice.retry : undefined);

  /* ── decide: the verdict, then the request ──────────────────────────── */

  /** Everything that moves cards by a route other than a drag, and the drop
   *  itself once it has landed on a verdict. */
  const decide = async (ids: string[], lane: number, col: number, via: { drag: boolean; verdicts?: Verdicts }) => {
    const L = liveRef.current!;
    const lead = ids[0];
    const laneKey = L.layout.lanes[lane].key;
    const verdict = (via.verdicts ?? buildVerdicts(L.source, L.layout, ids)).verdictFor(lane, col);
    const title = ids.length > 1 ? `${ids.length} cards` : (L.layout.entryOf.get(lead)?.item.title ?? "");
    const dest = colWord(L.layout, col);

    if (verdict.kind === "home") {
      if (via.drag) void goHome({ ids, lead });
      say(`${title} stays where it is`);
      return;
    }
    if (verdict.kind === "refused") {
      if (via.drag) void goHome({ ids, lead });
      refuse(ids, verdict.reason);
      return;
    }
    if (verdict.kind === "needs") {
      const slot = tailPos(L.layout, lane, col);
      if (via.drag) {
        setFlight({ ids, lead, phase: "land", kind: "needs" });
        void settle(slot.x, slot.y);
      }
      setPrompt({ ids, laneKey, col, need: verdict.need, prompt: verdict.prompt, cost: verdict.cost, title, verb: `Move to ${dest}`, flight: via.drag });
      say(`${verdict.prompt}`);
      return;
    }
    // ok
    if (via.drag) {
      setFlight({ ids, lead, phase: "land", kind: "ok" });
      const slot = tailPos(L.layout, lane, col);
      void settle(slot.x, slot.y);
    }
    say(`${title} dropped on ${dest}`);
    const o = await submit(ids, laneKey, col);
    if (o.ok) {
      pendingSayRef.current = { id: lead, verb: dest, dry: o.stubbed > 0 && o.stubbed === ids.length };
      setNotice((n) => (n && n.ids.some((i) => ids.includes(i)) ? null : n));
      if (via.drag) landDone();
    } else {
      if (via.drag) void goHome({ ids: o.failed, lead: o.failed[0] ?? lead });
      refuse(o.failed, o.reason, o.retryable ? () => void decide(o.failed, lane, col, { drag: false }) : undefined);
    }
  };

  const answerPrompt = async (p: PromptState, a: PromptAnswer): Promise<PromptOutcome> => {
    const o = await submit(p.ids, p.laneKey, p.col, a);
    if (o.ok) {
      pendingSayRef.current = { id: p.ids[0], verb: p.verb, dry: o.stubbed > 0 && o.stubbed === p.ids.length };
      setNotice((n) => (n && n.ids.some((i) => p.ids.includes(i)) ? null : n));
      setPrompt(null);
      if (p.flight) landDone();
      viewportRef.current?.focus({ preventScroll: true });
      return { ok: true };
    }
    return { ok: false, reason: o.reason, retryable: o.retryable };
  };

  const cancelPrompt = (p: PromptState) => {
    setPrompt(null);
    if (p.flight) void goHome({ ids: p.ids, lead: p.ids[0] });
    say("cancelled");
    viewportRef.current?.focus({ preventScroll: true });
  };

  return {
    flight,
    prompt,
    notice,
    pending,
    setNotice,
    setFlight,
    ghost,
    decide,
    answerPrompt,
    cancelPrompt,
    goHome,
    refuse,
    retryOf,
  };
}
