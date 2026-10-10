"use client";

// THE MONEY SWITCH, AND THE TWO COPIES OF IT.
//
// The arm decides whether a move spends the operator's own Claude seat. It needs
// to exist in two places at once and they must not drift: React's copy is what
// the control draws, and a MODULE-level copy is what `source.move()` reads,
// because that call happens inside the engine where no React value reaches.
//
// The key is imported from lib/identityEviction.ts rather than spelled here. A
// key spelled in two files is two keys, and the one that drifts is the one that
// never gets evicted — and this one must be: left on the exempt list, an arm set
// to LIVE would survive a sign-out and the next account on that browser would
// inherit it.

import { PIPELINE_ARM_KEY } from "@/lib/identityEviction";
import type { MoveRequest, MoveResult, PipelineSource } from "@/lib/board/pipeline";

import type { Arm } from "../pipelineModals";

/* ── the arm ──────────────────────────────────────────────────────────────── */

// The key itself lives with the eviction list that must know about it: a key
// spelled here and listed there is two copies, and the copy that drifts is
// the one that stops being wiped on sign-out.
const ARM_KEY = PIPELINE_ARM_KEY;

/** STUB unless the operator has said otherwise, and STUB whenever storage
 *  cannot be read: the default of a switch that spends money is the side that
 *  does not. */
export function readArm(): Arm {
  if (typeof window === "undefined") return "stub";
  try {
    return window.localStorage.getItem(ARM_KEY) === "live" ? "live" : "stub";
  } catch {
    return "stub";
  }
}

/** THE ARM AT THE MOMENT A MOVE IS SUBMITTED.
 *
 *  Module state rather than a ref: `armSource` has to read it when `move()` is
 *  CALLED, and the React Compiler rule `react-hooks/refs` forbids handing a ref
 *  to a function during render (the warning buckets in lint-baseline.json are a
 *  two-way ratchet, so a second one is a failed gate, not a note). There is one
 *  pipeline board per document and one arm on it; `localStorage` is the
 *  authority across reloads and this is the live copy.
 *
 *  `null` means nobody has asked yet, so the first read is the stored one. */
let liveArm: Arm | null = null;

export const currentArm = (): Arm => (liveArm ??= readArm());

export function setLiveArm(a: Arm): void {
  liveArm = a;
  try {
    window.localStorage.setItem(ARM_KEY, a);
  } catch {
    // A browser with storage blocked keeps the arm for this page's life only.
    // Failing closed on the next load is the right direction to fail in.
  }
}

/**
 * The source with the arm applied to every write, however the write was ordered.
 *
 * Identity is stable for the life of one media choice — the arm is read from the
 * ref when `move()` is CALLED — so flipping the arm does not re-key the canvas
 * and does not reload the board.
 */
export function armSource(base: PipelineSource, onStub: (wouldCall: string) => void): PipelineSource {
  return {
    ...base,
    async move(req: MoveRequest): Promise<MoveResult> {
      const r = await base.move({ ...req, live: currentArm() === "live" && req.live === true });
      if (r.ok && r.stub) onStub(r.wouldCall ?? "");
      return r;
    },
  };
}
