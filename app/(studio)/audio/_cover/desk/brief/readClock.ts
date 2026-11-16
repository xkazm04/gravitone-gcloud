// WHEN THE DESK LAST READ ITS VIEW (cover brief, WP-B): the "now" a brief's age is measured against. Marked by the
// desk's re-read (../useDesk.ts) and read through useSyncExternalStore, so a render never calls the clock itself
// and the age moves exactly when the record could have. The server's snapshot is none: the age is drawn on the
// client after hydration.
let readAt = Date.now();
const listeners = new Set<() => void>();

export function markRead(): void {
  readAt = Date.now();
  for (const l of listeners) l();
}

export function subscribeRead(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const readSnapshot = (): number => readAt;
export const serverReadSnapshot = (): number | null => null;
