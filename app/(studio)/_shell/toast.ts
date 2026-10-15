// THE RECEIPT QUEUE behind the shell's toast region: one message at a time, as the prototype's
// `GT.toast` was (shell.js: a newer receipt replaces the older and restarts its 3400ms clock).
// A store outside React, so a receipt can come from anywhere that learns an outcome - an
// effect syncing storage, a Firebase callback, a button - and the region subscribes to it.

export type Receipt = { readonly message: string; readonly open: boolean };

/** How long a receipt stays up (shell.js `toast`). */
export const TOAST_MS = 3400;

const CLOSED: Receipt = { message: "", open: false };
let current: Receipt = CLOSED;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: Receipt): void {
  current = next;
  for (const l of listeners) l();
}

export function showToast(message: string): void {
  if (timer !== null) clearTimeout(timer);
  set({ message, open: true });
  timer = setTimeout(() => {
    timer = null;
    set({ message: current.message, open: false });
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
