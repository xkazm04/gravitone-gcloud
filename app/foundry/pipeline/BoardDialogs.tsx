"use client";

// THE THREE DIALOGS A SHELL OWES THE BOARD — the item's own facts, and the two
// orders that need more than a gesture.
//
// AN ORDER REPLACES THE DETAIL rather than stacking on it. Two `aria-modal`
// panels take one Escape and both close; worse, a dialog whose opener is another
// dialog has nowhere to hand focus back to. So closing one — cancelled or done —
// clears both and hands focus to the BOARD. Cancelling writes nothing, so the
// card is exactly where it was.
//
// WHERE FOCUS GOES, and why it is this file's problem: the button that opened the
// order lived inside the detail dialog and went with it, so `Modal`'s own
// `restoreFocus` finds a detached opener and falls back to `<main>` — correct as
// a floor, wrong as a destination, because the operator was on the board. The
// canvas's viewport is the focusable element (it carries `aria-activedescendant`,
// so the card is still the cursor) and the shell reaches it through its own
// wrapper rather than the document. `PipelineHandle` has no `focus()`; it should,
// and until it does this is the seam.
//
// `live: true` ON EVERY ORDER is the INTENT of a confirmed order, and `armSource`
// is what decides whether it survives. Setting it per-need instead would mean a
// rework could never run even in LIVE — the adapter stubs anything whose `live`
// is unset (lib/board/sources/articles.ts).
//
// THE DIALOGS ARE LAZY, and they are the right things to make lazy: none of the
// three is on screen when the board loads, two are reachable only after a
// deliberate order, and together they pull in Modal, the field primitives and the
// article cost table. The board's own chunk is what decides how fast the first
// 500 cards appear, so nothing a user may never open belongs in it. No
// `loading:` state on purpose: each renders INSIDE a modal that is already
// mounted by the click, so a fallback would be a spinner flashing inside a box
// that is itself appearing.

import { useCallback, useState } from "react";

import dynamic from "next/dynamic";

import type { CanonStage, MoveResult, PipelineEntry, PipelineSource } from "@/lib/board/pipeline";

import type { Arm, OfferedMove } from "../pipelineModals";
import type { PipelineHandle } from "./types";

const DispatchConfirm = dynamic(() => import("./modals/DispatchConfirm").then((m) => m.DispatchConfirm));
const ReworkNote = dynamic(() => import("./modals/ReworkNote").then((m) => m.ReworkNote));
const DetailModal = dynamic(() => import("./modals/ItemDetail").then((m) => m.DetailModal));

export function BoardDialogs({
  open,
  setOpen,
  offers,
  source,
  arm,
  apiRef,
  boardRef,
  word,
}: {
  open: PipelineEntry | null;
  setOpen: (e: PipelineEntry | null) => void;
  offers: OfferedMove[];
  source: PipelineSource;
  arm: Arm;
  apiRef: React.RefObject<PipelineHandle | null>;
  boardRef: React.RefObject<HTMLDivElement | null>;
  word(s: CanonStage): string;
}) {
  const [order, setOrder] = useState<OfferedMove | null>(null);

  const closeOrder = useCallback(() => {
    setOrder(null);
    setOpen(null);
    // After Modal's cleanup, which runs synchronously before paint.
    requestAnimationFrame(() => boardRef.current?.querySelector<HTMLElement>('[role="application"]')?.focus());
  }, [setOpen, boardRef]);

  const runOrder = useCallback(
    async (note?: string): Promise<MoveResult> => {
      if (!open || !order) return { ok: false, reason: "nothing is ordered", retryable: false };
      const r = await source.move({ itemId: open.item.id, to: order.to, band: order.band, ...(note ? { note } : {}), live: true });
      if (r.ok && !r.stub) await apiRef.current?.reload();
      return r;
    },
    [open, order, source, apiRef],
  );

  const actions = offers.map((o) => (
    <button
      key={`${o.to}:${o.band ?? ""}`}
      type="button"
      onClick={() => setOrder(o)}
      data-testid={`pipeline-order-${o.to}-${o.band ?? "none"}`}
      className={`font-jetbrains cursor-pointer rounded-full border px-3.5 py-1.5 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
        o.needs === "confirm" ? "border-amber-300/45 text-amber-100 hover:bg-amber-300/10" : "border-white/15 text-white/85 hover:bg-white/5"
      }`}
    >
      {o.verb}
    </button>
  ));

  return (
    <>
      <DetailModal entry={order ? null : open} stageWord={word(open?.placement.stage ?? "proposed")} actions={actions} onClose={() => setOpen(null)} />
      {order?.needs === "confirm" && open && <DispatchConfirm open title={open.item.title} move={order} arm={arm} run={runOrder} onClose={closeOrder} />}
      {order?.needs === "note" && open && <ReworkNote open title={open.item.title} move={order} arm={arm} run={runOrder} onClose={closeOrder} />}
    </>
  );
}
