"use client";

// The studio's IndexedDB — the same mechanism the parent app used for its
// playground (dolla/arm/gravitone/web/lib/playgroundDb.ts): raw IDB, no
// dependency, ONE database with one connection helper and one transaction
// helper. Stores are added to it; mechanisms are not.
//
// Failures are NOT swallowed here. "Your projects survive a refresh" is a
// promise the UI makes out loud, so a store that cannot be opened or written
// has to reach the caller, which has a banner for exactly that.

const DB_NAME = "gravitone-studio";
export const PROJECTS_STORE = "projects";
/** Per-project step content — see app/_phases/_shared/stepStore.ts. */
export const STEPS_STORE = "steps";
/** Index over the owning uid — listing is always "this account's projects". */
export const BY_UID = "by-uid";
const DB_VERSION = 2;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STEPS_STORE)) {
        // Keyed `${projectId}:${phase}`, with a projectId index so a project's
        // whole body of work can be found (and deleted) in one query.
        const steps = db.createObjectStore(STEPS_STORE, { keyPath: "id" });
        steps.createIndex("by-project", "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const store = db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
        store.createIndex(BY_UID, "uid", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("could not open storage"));
    // A second tab holding the old version open blocks the upgrade forever;
    // say so instead of hanging on a promise that never settles.
    req.onblocked = () => reject(new Error("storage is open in another tab"));
  });
}

/** Run one transaction to completion, resolving when it commits. */
export function runTx(
  db: IDBDatabase,
  store: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("write aborted"));
    try {
      work(tx.objectStore(store));
    } catch (e) {
      // A synchronous throw (quota, DataCloneError) never reaches tx.onerror.
      reject(e);
    }
  });
}

/** Read one record by key. Resolves undefined when the key is absent. */
export function getRecord<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error ?? new Error("read failed"));
  });
}

/** Read every record on one index value. */
export function getByIndex<T>(
  db: IDBDatabase,
  store: string,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve((req.result as T[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("read failed"));
  });
}
