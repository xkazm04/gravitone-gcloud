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
// AND THEN IT RE-READS. `apply(r.item)` folds the answer in by the RETURNED
// item's id, which is the right id for the card the authority kept and the
// wrong one for the card it replaced: a move can come back as a different item
// (an audio prompt dragged to the queue comes back as a job, under a new id) or
// land somewhere the request did not name. The card then has nothing to be
// applied to, and the board would draw the old card in the old cell until the
// next poll. So every batch that resolved anything ends in one `reload()` - the
// source's own account is the only one that knows what the move became.
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
    reload,
  }: {
    liveRef: React.RefObject<Live | null>;
    deadRef: React.RefObject<boolean>;
    arm: "stub" | "live";
    setPending: React.Dispatch<React.SetStateAction<ReadonlySet<string>>>;
    reload(): Promise<void>;
  },
): Promise<Outcome> {
  const todo = ids.filter((id) => liveRef.current!.layout.entryOf.has(id));
  setPending((p) => new Set([...p, ...todo]));
  const failed: string[] = [];
  let stubbed = 0;
  let resolved = 0;
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
      resolved++;
      liveRef.current!.apply(r.item);
      if (isStubbedMove(r)) stubbed++;
    } else {
      failed.push(id);
      first ??= { reason: r.reason, retryable: r.retryable };
    }
  }
  if (resolved > 0 && !deadRef.current) void reload();
  if (!deadRef.current)
    setPending((p) => {
      const n = new Set(p);
      todo.forEach((i) => n.delete(i));
      return n;
    });
  return first ? { ok: false, ...first, failed } : { ok: true, stubbed };
}
