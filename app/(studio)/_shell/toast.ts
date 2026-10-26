// THE RECEIPT QUEUE behind the shell's toast region: one message at a time, as the prototype's
// `GT.toast` was (shell.js: a newer receipt replaces the older and restarts its 3400ms clock).
// A store outside React, so a receipt can come from anywhere that learns an outcome - an
// effect syncing storage, a Firebase callback, a button - and the region subscribes to it.

import type { ToastLedger } from "@gt/ui/components/toast/Toast.tsx";

/** An act's receipt, and - for an act the ledger records - the door to that record. */
export type Receipt = {
  readonly message: string;
  readonly open: boolean;
  /** Counts receipts shown: an identical repeat is still a new one, so the region re-announces it. */
  readonly seq: number;
  readonly ledger?: ToastLedger;
};

/** How long a receipt stays up (shell.js `toast`). */
export const TOAST_MS = 3400;

const CLOSED: Receipt = { message: "", open: false, seq: 0 };
let current: Receipt = CLOSED;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Receipt): void {
  current = next;
  for (const l of listeners) l();
}

export function showToast(message: string, ledger?: ToastLedger): void {
  if (timer !== null) clearTimeout(timer);
  set({ message, open: true, seq: current.seq + 1, ...(ledger === undefined ? {} : { ledger }) });
  timer = setTimeout(() => {
    timer = null;
    set({ message: current.message, open: false, seq: current.seq });
  }, TOAST_MS);
}

export const receipt = (): Receipt => current;
export const noReceipt = (): Receipt => CLOSED;

export function subscribeReceipts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
