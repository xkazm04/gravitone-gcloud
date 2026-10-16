"use client";

// THE RECEIPT FLOW - one for every launch: a Floor composer's, a plan's, a re-route's (COMMON
// decision 3). It reads the receipt, raises it in the sheet layer, and on ⏎ sends its token back.
// A confirm the server finds stale answers the fresh receipt; the sheet then shows THAT, with
// what moved marked (receiptChanges), and waits for a second ⏎ - nothing launches on a receipt
// the operator has not seen. Esc closes the sheet and launches nothing (the layer router's).
//
// The confirm is disarmed synchronously (a ref, not state): a second ⏎ that lands before the
// re-render cannot send a second confirm (async-ui-states/action-busy-states). The ceiling the
// operator types travels with the confirm; the server refuses a breach with `budget`, and its
// words are drawn verbatim under the receipt.

import { useCallback, useRef, useState, type ReactNode } from "react";

import type { Receipt as ReceiptValue } from "@gt/domain/produce";
import { LevelSheet } from "@gt/ui/components/sheet/LevelSheet.tsx";
import type { ToastLedger } from "@gt/ui/components/toast/Toast.tsx";
import { Receipt } from "@gt/ui/components/produce/Receipt.tsx";
import { parseCeiling, receiptChanges, type ReceiptChanges } from "@gt/ui/components/produce/produce.ts";
import { useKeys } from "@gt/ui/keymap/dispatch";

import type { ActionResult } from "../../../_server/actionCore.ts";

/** What a confirm came to: launched (with the toast's words), stale (with the fresh receipt), or refused. */
export type Outcome = { readonly kind: "done"; readonly note: string; readonly ledger?: ToastLedger } | { readonly kind: "stale"; readonly fresh: ReceiptValue } | { readonly kind: "error"; readonly message: string };

export type ReceiptSpec = {
  /** The sheet's place: `Floor › image`, `Projects › Glass Harbor`. */
  readonly trail: readonly { readonly label: string; readonly href: string }[];
  readonly here: string;
  readonly read: () => Promise<ActionResult<ReceiptValue>>;
  readonly confirm: (token: string, ceilingUsd: number | undefined) => Promise<Outcome>;
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
      const r = await spec.read();
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

  const confirm = useCallback(async (): Promise<void | false> => {
    if (st === null || inflight.current) return false;
    const c = parseCeiling(st.ceiling);
    if (!c.ok) return false;
    inflight.current = true;
    const mine = gen.current;
    setSt({ ...st, busy: true });
    try {
      const out = await st.spec.confirm(st.receipt.token, c.value);
      if (out.kind === "done") st.spec.done(out.note, out.ledger);
      if (gen.current !== mine) return;
      if (out.kind === "done") {
        setSt(null);
      } else if (out.kind === "stale") setSt({ ...st, receipt: out.fresh, changes: receiptChanges(st.receipt, out.fresh), busy: false });
      else setSt({ ...st, busy: false, error: out.message });
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
      </LevelSheet>
    );
  return { open, reading, sheet };
}

/** An action's envelope as an Outcome: refused is `error` with the server's words verbatim. */
export function outcomeOf<T>(r: ActionResult<T>, read: (v: T) => Outcome): Outcome {
  return r.ok ? read(r.value) : { kind: "error", message: r.error.error };
}
