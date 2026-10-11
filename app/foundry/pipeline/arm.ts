"use client";

// THE MONEY SWITCH, AND THE TWO COPIES OF IT.
//
// STUB IS THE DEFAULT AND IT SURVIVES A RELOAD. It is not decoration: in LIVE an
// articles dispatch spends the operator's own Claude seat at the figures
// RUN_COST_HINT carries, and an audio dispatch bills ElevenLabs per call.
//
// `MoveRequest.live` is the flag that decides, and lib/board/pipeline.ts is
// explicit that "an unset `live` never bills". A shell cannot simply LABEL that,
// because one path does not come through it: the canvas's own `MovePrompt`
// answers a `needs: "confirm"` offer with `{ live: true }` unconditionally, and
// the submit hands that straight to `source.move()`.
//
// SO THERE ARE TWO GUARDS AND BOTH MUST AGREE, deliberately. The engine clamps
// every request at its own chokepoint (./submitMoves.ts) — that is the belt, and
// it covers paths a shell does not know about. `armSource` below is the braces:
// it is what counts the dry runs and keeps the last `wouldCall` for the receipt,
// and it would still hold if somebody mounted the canvas without the `arm` prop.
// A switch that spends $47-92 when it is wrong is worth two independent guards.
//
// A dry move comes back as `stubbedMove(item, wouldCall)` — a SUCCESS whose
// `wouldCall` names the route that was not called. That string is drawn in the
// control cluster, because a switch whose only evidence is that nothing happened
// is a switch nobody trusts.
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

import { useCallback, useMemo, useState } from "react";

import { PIPELINE_ARM_KEY } from "@/lib/identityEviction";
import type { BoardVerb, MoveRequest, MoveResult, PipelineSource, VerbInput, VerbResult, VerbTarget } from "@/lib/board/pipeline";

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
  // A VERB IS A WRITE TOO. `move()` carries its own `live` flag for the adapter
  // to honour; a verb has none, so the arm answers a spending verb HERE, before
  // the source is asked. Which verbs spend is the SOURCE's word (`spends: true`),
  // read off the very list it handed the menu for that target - never a second
  // list kept on this side, which would drift the first time a verb was added.
  const spendingVerb = (verbId: string, target: VerbTarget): BoardVerb | undefined => {
    const list = target.itemId !== undefined ? base.cardVerbs?.(target.itemId) : base.cellVerbs?.(target);
    return list?.find((v) => v.id === verbId && v.spends === true);
  };
  return {
    ...base,
    async move(req: MoveRequest): Promise<MoveResult> {
      const r = await base.move({ ...req, live: currentArm() === "live" && req.live === true });
      if (r.ok && r.stub) onStub(r.wouldCall ?? "");
      return r;
    },
    ...(base.cellVerbs ? { cellVerbs: (t: VerbTarget) => base.cellVerbs!(t) } : {}),
    ...(base.cardVerbs ? { cardVerbs: (id: string) => base.cardVerbs!(id) } : {}),
    ...(base.pollMs ? { pollMs: () => base.pollMs!() } : {}),
    ...(base.runVerb
      ? {
          async runVerb(verbId: string, target: VerbTarget, input?: VerbInput): Promise<VerbResult> {
            const spends = spendingVerb(verbId, target);
            if (spends && currentArm() !== "live") {
              // The dry receipt names the verb that was NOT run, as the move's
              // names the route that was not called.
              onStub(spends.label);
              return { ok: true, announce: "dry: nothing was spent" };
            }
            return base.runVerb!(verbId, target, input);
          },
        }
      : {}),
  };
}

/* ── the shell's half of it ───────────────────────────────────────────────── */

/** THE ARM, THE WRAPPED SOURCE AND THE DRY-RUN RECEIPT, as one thing.
 *
 *  `flipArm` is the single writer for both copies — the module's (what `move()`
 *  reads) and React's (what the control draws) — so the two cannot drift.
 *
 *  The wrapped source's identity is stable for the life of one media choice: the
 *  canvas memoises on source identity, and a fresh source every render defeats
 *  the engine. Flipping the arm therefore does not reload the board. */
export function useArmedSource(base: PipelineSource) {
  const [arm, setArm] = useState<Arm>(currentArm);
  const [stub, setStub] = useState<{ n: number; wouldCall: string } | null>(null);

  const flipArm = useCallback((a: Arm) => {
    setLiveArm(a);
    setArm(a);
  }, []);

  const onStub = useCallback((wouldCall: string) => setStub((s) => ({ n: (s?.n ?? 0) + 1, wouldCall })), []);
  const source = useMemo(() => armSource(base, onStub), [base, onStub]);

  return { arm, flipArm, stub, source };
}
