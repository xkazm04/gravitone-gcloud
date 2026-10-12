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
//
// THE SOURCE'S OWN VERBS ride under the moves: `cardVerbs(id)`, the same list
// the card's menu draws, as a row of buttons. A click takes the menu's path -
// a verb that asks for input or states a consequence opens VerbAsk (which
// REPLACES the detail, as an order does), one that does not runs at once - and
// the source handed in is the ARMED one, so a spending verb is answered dry
// while STUB exactly as from the menu. A refusal stays in the detail, which is
// `aria-modal`: drawn anywhere else it would reach nobody. An `ok` is spoken
// through the one announcer, re-reads the board and closes the detail, whose
// entry was read before the write and no longer describes the item.
//
// The target names the source's DEFAULT axis: the detail does not know which
// grouping the board is read under, and no card verb reads a lane - a lane is
// a cell's, and cell verbs are not offered here.

import { useCallback, useId, useRef, useState } from "react";

import dynamic from "next/dynamic";

import { useAnnounce } from "@/lib/announcer";
import type { BoardVerb, CanonStage, MoveResult, PipelineEntry, PipelineSource, VerbInput, VerbResult } from "@/lib/board/pipeline";

import { Failure } from "./modals/write";

import type { Arm, OfferedMove } from "../pipelineModals";
import type { PipelineHandle } from "./types";

const DispatchConfirm = dynamic(() => import("./modals/DispatchConfirm").then((m) => m.DispatchConfirm));
const ReworkNote = dynamic(() => import("./modals/ReworkNote").then((m) => m.ReworkNote));
const DetailModal = dynamic(() => import("./modals/ItemDetail").then((m) => m.DetailModal));
const VerbAsk = dynamic(() => import("./modals/VerbAsk").then((m) => m.VerbAsk));

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
  const [ask, setAsk] = useState<BoardVerb | null>(null);
  /** A verb run from the detail: in flight, or refused (kept with the item it
   *  was refused for, so another item's detail never wears it). */
  const [verbState, setVerbState] = useState<{ itemId: string; busy?: string; failed?: string } | null>(null);
  const announce = useAnnounce();
  const said = useRef(0);
  const uid = useId();

  const closeOrder = useCallback(() => {
    setOrder(null);
    setAsk(null);
    setVerbState(null);
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

  const perform = useCallback(
    async (verbId: string, input?: VerbInput): Promise<VerbResult> => {
      if (!open) return { ok: false, reason: "nothing is open" };
      let r: VerbResult;
      try {
        r = source.runVerb
          ? await source.runVerb(verbId, { axis: source.groupAxes[0].id, itemId: open.item.id }, input)
          : { ok: false, reason: `${source.label} carries out no verbs` };
      } catch (e) {
        r = { ok: false, reason: e instanceof Error ? e.message : String(e) };
      }
      if (r.ok) {
        announce({ key: `${uid}:verb:${++said.current}`, text: r.announce });
        await apiRef.current?.reload();
      }
      return r;
    },
    [open, source, announce, uid, apiRef],
  );

  const startVerb = (v: BoardVerb) => {
    if (v.disabled || !open) return;
    if (v.input || v.confirm) {
      setVerbState(null);
      setAsk(v);
      return;
    }
    const itemId = open.item.id;
    setVerbState({ itemId, busy: v.id });
    void perform(v.id).then((r) => {
      if (r.ok) closeOrder();
      else setVerbState({ itemId, failed: r.reason });
    });
  };

  const verbs = open ? (source.cardVerbs?.(open.item.id) ?? []) : [];
  const mine = verbState && open && verbState.itemId === open.item.id ? verbState : null;

  const moveButtons = offers.map((o) => (
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

  const actions = (
    <>
      {moveButtons}
      {verbs.length > 0 && (
        <div role="group" aria-label="Actions" className="flex basis-full flex-wrap items-center gap-2" data-testid="pipeline-detail-verbs">
          {verbs.map((v) => {
            const why = `${uid}-why-${v.id}`;
            return (
              <span key={v.id} className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => startVerb(v)}
                  disabled={Boolean(v.disabled) || Boolean(mine?.busy)}
                  aria-busy={mine?.busy === v.id}
                  aria-describedby={v.disabled ? why : undefined}
                  data-testid={`pipeline-detail-verb-${v.id}`}
                  className={`font-jetbrains cursor-pointer rounded-full border px-3.5 py-1.5 text-label transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45 ${
                    v.destructive ? "border-rose-300/40 text-rose-100 hover:bg-rose-300/10" : "border-white/15 text-white/85 hover:bg-white/5"
                  }`}
                >
                  {v.label}
                </button>
                {v.disabled && (
                  <span id={why} className="font-jetbrains text-label text-white/45">
                    {v.disabled}
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}
      {mine?.failed && (
        <div className="basis-full">
          <Failure reason={mine.failed} />
        </div>
      )}
    </>
  );

  return (
    <>
      <DetailModal entry={order || ask ? null : open} stageWord={word(open?.placement.stage ?? "proposed")} actions={actions} onClose={() => setOpen(null)} />
      {ask && open && <VerbAsk verb={ask} where={open.item.title} run={(input) => perform(ask.id, input)} onClose={closeOrder} />}
      {order?.needs === "confirm" && open && <DispatchConfirm open title={open.item.title} move={order} arm={arm} run={runOrder} onClose={closeOrder} />}
      {order?.needs === "note" && open && <ReworkNote open title={open.item.title} move={order} arm={arm} run={runOrder} onClose={closeOrder} />}
    </>
  );
}
