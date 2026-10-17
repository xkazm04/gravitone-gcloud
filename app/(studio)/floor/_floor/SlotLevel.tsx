"use client";

// THE SLOT LEVEL over the Floor (prototype index.html `openLevel({kind:"slot"})`): a level
// sheet holding one slot's record (@gt/ui floor/SlotDetail) and its three verbs, over the
// calendar port. It is a layer (LevelSheet, mode `slot`), so its keys are live while it is on
// top - M move, X cancel, P publish now (keymap/bindings.ts `slot`) - and one Escape closes it
// back to the month or the rail it opened from.
//
// The record comes from the server's first read when the page was loaded at its URL, else from
// the port's `detail`. A verb is disarmed synchronously (a ref, not state): a second press that
// lands before the re-render cannot send a second act (async-ui-states action-busy-states).
// What a verb answers is the slot as it now is; the level redraws from it, the Floor re-reads
// (router.refresh) so the rail and the month agree, and the toast carries the ledger's door.
// A refusal is drawn verbatim and changes nothing.

import { useEffect, useRef, useState } from "react";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { LevelSheet } from "@gt/ui/components/sheet/LevelSheet.tsx";
import { SlotDetail, type SlotVerb, type SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";
import { canCancel, canMove, canPublishNow } from "@gt/ui/components/floor/slot.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { useShell } from "../../_shell/Providers.tsx";
import type { CalendarPort } from "../_calendar/contract.ts";
import s from "./Floor.module.css";

export type SlotRead = { readonly id: string; readonly r: ActionResult<SlotView> };

export type SlotLevelProps = {
  readonly id: string;
  readonly port: CalendarPort;
  readonly nowMs: number;
  /** The server's read, when the page was loaded with this slot open. */
  readonly initial: SlotRead | null;
  /** The month is open beneath: the crumbs and the way back say Calendar. */
  readonly cal: boolean;
  readonly onClose: () => void;
  readonly onFloor: () => void;
  /** A verb landed: the Floor re-reads. */
  readonly onLanded: () => void;
};

const SAID: Readonly<Record<SlotVerb, string>> = { move: "moved", cancel: "cancelled", "publish-now": "published" };

export function SlotLevel({ id, port, nowMs, initial, cal, onClose, onFloor, onLanded }: SlotLevelProps) {
  const { toast } = useShell();
  const [read, setRead] = useState<SlotRead | null>(initial !== null && initial.id === id ? initial : null);
  const [busy, setBusy] = useState<SlotVerb | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [asked, setAsked] = useState<{ readonly verb: SlotVerb; readonly n: number } | undefined>(undefined);
  const armed = useRef(false);

  useEffect(() => {
    if (read !== null && read.id === id) return;
    let live = true;
    void port.detail({ id }).then((r) => {
      if (live) setRead({ id, r });
    });
    return () => {
      live = false;
    };
  }, [id, port, read]);

  const view = read !== null && read.id === id && read.r.ok ? read.r.value : null;

  const run = (verb: SlotVerb, call: () => Promise<ActionResult<SlotView>>): void => {
    if (armed.current || view === null) return;
    armed.current = true;
    setBusy(verb);
    setError(undefined);
    void call().then((r) => {
      armed.current = false;
      setBusy(null);
      if (!r.ok) {
        setError(r.error.error);
        return;
      }
      setRead({ id, r });
      toast(`${r.value.slot.title} · ${SAID[verb]}${r.value.dry === true && verb === "publish-now" ? " · dry run" : ""}`, { href: r.value.ledger, subject: id });
      onLanded();
    });
  };

  const ask = (verb: SlotVerb, may: boolean): void | false => {
    if (!may || busy !== null) return false;
    setAsked((a) => ({ verb, n: (a?.n ?? 0) + 1 }));
  };
  const slot = view?.slot;
  const facts = slot === undefined ? [] : [...(canMove(slot) ? ["movable"] : []), ...(canCancel(slot) ? ["cancellable"] : []), ...(canPublishNow(slot) ? ["publishable"] : [])];
  useKeys(
    "slot",
    {
      move: () => ask("move", slot !== undefined && canMove(slot)),
      cancel: () => ask("cancel", slot !== undefined && canCancel(slot)),
      "publish-now": () => ask("publish-now", slot !== undefined && canPublishNow(slot)),
    },
    { facts },
  );

  const title = slot?.title ?? id;
  return (
    <LevelSheet trail={cal ? [{ label: "Floor", onPress: onFloor }, { label: "Calendar", onPress: onClose }] : [{ label: "Floor", onPress: onClose }]} here={title} mode="slot" back={cal ? "Calendar" : "Floor"} onClose={onClose}>
      {view !== null ? (
        <SlotDetail
          view={view}
          nowMs={nowMs}
          busy={busy}
          {...(error === undefined ? {} : { error })}
          {...(asked === undefined ? {} : { asked })}
          onMove={(at) => run("move", () => port.move({ id, at }))}
          onCancel={() => run("cancel", () => port.cancel({ id }))}
          onPublishNow={() => run("publish-now", () => port.publishNow({ id }))}
        />
      ) : (
        <div className={s.slotWait} aria-busy={read === null || read.id !== id ? true : undefined}>
          {read !== null && read.id === id && !read.r.ok ? <ErrorLine message={read.r.error.error} live /> : <Chip label={id} ghost casing="lower" />}
        </div>
      )}
    </LevelSheet>
  );
}
