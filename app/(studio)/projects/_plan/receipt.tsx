"use client";

// THE RECEIPT FLOW - one for every launch: a Floor composer's, a plan's, a re-route's (COMMON
// decision 3). It reads the receipt, raises it in the sheet layer, and on ⏎ sends its token back.
// A confirm the server finds stale answers the fresh receipt; the sheet then shows THAT, with
// what moved marked (receiptChanges), and waits for a second ⏎ - nothing launches on a receipt
// the operator has not seen. Esc closes the sheet and launches nothing (the layer router's).
//
// The confirm is disarmed synchronously (a ref, not state): a second ⏎ that lands before the
// re-render cannot send a second confirm (async-ui-states/action-busy-states). The ceiling the
// operator types travels with the confirm; a worst case over it is marked on the receipt (a
// ceiling is a stop point, never a refusal), and a refusal's words are drawn verbatim under it.
//
// ARMING LIVE (COMMON decision 4). A launch is dry unless the operator arms it, here, on the
// receipt: the `live` toggle re-reads the receipt in live mode - its token binds the mode, so the
// ⏎ that follows confirms the live receipt the operator is looking at, never a dry one quietly
// promoted. A process that may only run dry refuses the live read, and its words are the error
// line. A re-route keeps its job's mode and offers no toggle (`armable` absent).

import { useCallback, useRef, useState, type ReactNode } from "react";

import type { Receipt as ReceiptValue, ReceiptMode } from "@gt/domain/produce";
import { LevelSheet } from "@gt/ui/components/sheet/LevelSheet.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";
import type { ToastLedger } from "@gt/ui/components/toast/Toast.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { parseCeiling, receiptChanges, type ReceiptChanges } from "@gt/ui/components/produce/produce.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { ActionResult } from "../../../_server/actionCore.ts";
import { settled } from "../../audio/_hunt/settled.ts";

/** What a confirm came to: launched (with the toast's words), stale (with the fresh receipt), or refused. */
export type Outcome = { readonly kind: "done"; readonly note: string; readonly ledger?: ToastLedger } | { readonly kind: "stale"; readonly fresh: ReceiptValue } | { readonly kind: "error"; readonly message: string };

export type ReceiptSpec = {
  /** The sheet's place: `Floor › image`, `Projects › Glass Harbor`. */
  readonly trail: readonly { readonly label: string; readonly href: string }[];
  readonly here: string;
  readonly read: (mode: ReceiptMode) => Promise<ActionResult<ReceiptValue>>;
  readonly confirm: (token: string, ceilingUsd: number | undefined, mode: ReceiptMode) => Promise<Outcome>;
  /** The receipt may be armed live (a launch); absent for an act that keeps its job's mode. */
  readonly armable?: boolean;
  readonly done: (note: string, ledger?: ToastLedger) => void;
  readonly failed: (message: string) => void;
};

type Open = {
  readonly spec: ReceiptSpec;
  readonly receipt: ReceiptValue;
  readonly changes?: ReceiptChanges;
  readonly ceiling: string;
  readonly busy: boolean;
  readonly error?: string;
};

export type ReceiptFlow = {
  readonly open: (spec: ReceiptSpec) => Promise<void>;
  readonly reading: boolean;
  readonly sheet: ReactNode;
};

// An answer lands on the sheet AS IT NOW READS, never on the copy the await started from: the
// ceiling field stays live while a re-read or a confirm is in flight, and a dollar figure typed in
// that window must be the one the next confirm sends (the old spread put the pre-await ceiling back).
export const onOpen =
  (patch: Partial<Open>) =>
  (cur: Open | null): Open | null =>
    cur === null ? cur : { ...cur, ...patch };

export function useReceipt(nowMs: number): ReceiptFlow {
  const [st, setSt] = useState<Open | null>(null);
  const [reading, setReading] = useState(false);
  const inflight = useRef(false);
  // Each open sheet is a generation; an answer that lands after its sheet was closed is dropped
  // rather than raising the sheet again (a stale receipt arriving after Esc).
  const gen = useRef(0);

  const open = useCallback(async (spec: ReceiptSpec): Promise<void> => {
    if (inflight.current) return;
    inflight.current = true;
    setReading(true);
    try {
      const r = await settled(spec.read("dry"));
      gen.current++;
      if (r.ok) setSt({ spec, receipt: r.value, ceiling: "", busy: false });
      else spec.failed(r.error.error);
    } finally {
      inflight.current = false;
      setReading(false);
    }
  }, []);

  const close = useCallback(() => {
    gen.current++;
    setSt(null);
  }, []);

  /** Re-read the open receipt in the other mode; the sheet shows THAT receipt, or the refusal. */
  const arm = useCallback(
    async (mode: ReceiptMode): Promise<void> => {
      if (st === null || inflight.current) return;
      inflight.current = true;
      const mine = gen.current;
      setSt(onOpen({ busy: true }));
      try {
        const r = await settled(st.spec.read(mode));
        if (gen.current !== mine) return;
        if (r.ok)
          setSt((cur) => {
            if (cur === null) return cur;
            const { error: _error, changes: _changes, ...rest } = cur;
            return { ...rest, receipt: r.value, busy: false };
          });
        else setSt(onOpen({ busy: false, error: r.error.error }));
      } finally {
        inflight.current = false;
      }
    },
    [st],
  );

  const confirm = useCallback(async (): Promise<void | false> => {
    if (st === null || inflight.current) return false;
    const c = parseCeiling(st.ceiling);
    if (!c.ok) return false;
    inflight.current = true;
    const mine = gen.current;
    setSt(onOpen({ busy: true }));
    try {
      const out = await settledOutcome(st.spec.confirm(st.receipt.token, c.value, st.receipt.mode));
      if (out.kind === "done") st.spec.done(out.note, out.ledger);
      if (gen.current !== mine) return;
      if (out.kind === "done") {
        setSt(null);
      } else if (out.kind === "stale") setSt(onOpen({ receipt: out.fresh, changes: receiptChanges(st.receipt, out.fresh), busy: false }));
      else setSt(onOpen({ busy: false, error: out.message }));
    } finally {
      inflight.current = false;
    }
  }, [st]);

  useKeys(
    "receipt",
    {
      confirm: () => {
        if (st === null || st.busy) return false;
        void confirm();
      },
    },
    { enabled: st !== null },
  );

  const sheet =
    st === null ? null : (
      <LevelSheet trail={st.spec.trail} here={st.spec.here} mode="receipt" back="back" onClose={close} fit>
        <Receipt
          receipt={st.receipt}
          {...(st.changes === undefined ? {} : { changes: st.changes })}
          ceiling={st.ceiling}
          onCeiling={(ceiling) => setSt((cur) => (cur === null ? cur : { ...cur, ceiling }))}
          onConfirm={() => void confirm()}
          busy={st.busy}
          {...(st.error === undefined ? {} : { error: st.error })}
          nowMs={nowMs}
        />
        {st.spec.armable === true && <Toggle label="live" name={`arm live, now ${st.receipt.mode}`} on={st.receipt.mode === "live"} onToggle={(on) => void arm(on ? "live" : "dry")} />}
      </LevelSheet>
    );
  return { open, reading, sheet };
}

/** A confirm whose round trip failed (a Server Action that REJECTS, not one that answers no) is
 * an `error` in settled's words, so the sheet leaves busy and names it rather than going dead. */
export async function settledOutcome(p: Promise<Outcome>): Promise<Outcome> {
  const r = await settled<Outcome>(p.then((value) => ({ ok: true as const, value })));
  return r.ok ? r.value : { kind: "error", message: r.error.error };
}

/** An action's envelope as an Outcome: refused is `error` with the server's words verbatim. */
export function outcomeOf<T>(r: ActionResult<T>, read: (v: T) => Outcome): Outcome {
  return r.ok ? read(r.value) : { kind: "error", message: r.error.error };
}
