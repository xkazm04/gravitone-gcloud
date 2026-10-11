"use client";

// THE CHOKEPOINT — the one function that asks the authority to move anything.
//
// EVERY PATH REACHES IT: a drag, the context menu, the move map, a Shift+arrow,
// a retry, an answered prompt. That is what makes it the right place for the
// ARM, and the arm being here rather than at each call site is a measured fix:
// a dragged confirm used to set `live: true` unconditionally and no prop could
// disarm it, so a shell displaying STUB could still spend the operator's seat.
// Both must now agree — the dialog's intent AND the canvas's authority.
//
// NOTHING HERE RENDERS A CARD AS MOVED. `MoveResult`'s own contract says "a
// caller that commits on `ok` alone draws a move that never happened", and a
// STUBBED result IS ok: the authority answered, it just did not act. So the
// board reconciles whatever item came back — for a stub, the unchanged one, which
// is why the card returns home — and the count of stubs travels back so the
// announcement can say "not moved: nothing was spent" instead of lying.
//
// ONE REQUEST PER CARD, IN ORDER, and the first failure is the one reported: ten
// refusals with the same reason are one sentence, and the ids that failed are
// kept so the notice can flag exactly those cards and offer one retry for them.
//
// A PLAIN ASYNC FUNCTION, not a hook: it reads `liveRef` at call time (a move
// outlives the render that started it) and the only state it touches is the
// pending set, which it is handed.

import { isStubbedMove, type MoveResult } from "@/lib/board/pipeline";

import type { Live, Outcome } from "./canvasTypes";
import type { PromptAnswer } from "./MovePrompt";
import { requestFor } from "./moves";

export async function submitMoves(
  ids: string[],
  laneKey: string,
  col: number,
  answers: PromptAnswer,
  {
    liveRef,
    deadRef,
    arm,
    setPending,
  }: {
    liveRef: React.RefObject<Live | null>;
    deadRef: React.RefObject<boolean>;
    arm: "stub" | "live";
    setPending: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
  },
): Promise<Outcome> {
  const todo = ids.filter((id) => liveRef.current!.layout.entryOf.has(id));
  setPending((p) => new Set([...p, ...todo]));
  const failed: string[] = [];
  let stubbed = 0;
  let first: { reason: string; retryable: boolean } | null = null;
  for (const id of todo) {
    const L = liveRef.current!;
    const entry = L.layout.entryOf.get(id);
    if (!entry) continue;
    let r: MoveResult;
    try {
      const req = requestFor(L.layout, entry.item, laneKey, col, answers);
      r = await L.source.move({ ...req, live: arm === "live" && req.live === true });
    } catch (e) {
      r = { ok: false, reason: e instanceof Error ? e.message : String(e), retryable: true };
    }
    if (r.ok) {
      liveRef.current!.apply(r.item);
      if (isStubbedMove(r)) stubbed++;
    } else {
      failed.push(id);
      first ??= { reason: r.reason, retryable: r.retryable };
    }
  }
  if (!deadRef.current)
    setPending((p) => {
      const n = new Set(p);
      todo.forEach((i) => n.delete(i));
      return n;
    });
  return first ? { ok: false, ...first, failed } : { ok: true, stubbed };
}
