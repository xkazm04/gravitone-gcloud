// THE SAVE WATCHER SET: each whole-record save is heard synchronously as it is
// issued. `saveWatchers` is owned by this file and nowhere else; saveStep notifies it
// and onSaveIssued subscribes to it. Split out of the stepStore.ts door.

/* ───────────────────── saves, heard as they are issued (2026-10-07) ─────────
 *
 * A reader that mirrors one record in memory needs to hear a write at the
 * moment it is ISSUED, not when it lands. Re-reading after the fact races the
 * write: `readStep` is not in the issue-order chain above, and a read issued in
 * the same tick as a save can open its transaction first and return what the
 * save is about to replace. That is exactly the shape of the Research step's
 * Clear (`resetLive` writes the cleared notebook record, and the board re-renders
 * in the same tick), and _shared/notebook/useActiveNotebook.ts would deal the
 * cleared notebook for as long as the stale read won.
 *
 * Fired synchronously, in issue order, with what was handed to `saveStep` —
 * which, since the latest issued save is the one that lands, is what the disk
 * will hold. Whole-record saves only: `patchStep` decides inside its own
 * transaction, so what it will write is not known when it is issued. A watcher
 * must not throw; it runs inside a save that promises never to reject. */
export type SaveWatcher = (projectId: string, phase: string, data: unknown) => void;
export const saveWatchers = new Set<SaveWatcher>();

export function onSaveIssued(watcher: SaveWatcher): () => void {
  saveWatchers.add(watcher);
  return () => void saveWatchers.delete(watcher);
}
