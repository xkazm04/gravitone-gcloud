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
/** Visual identities — see lib/themes.ts. Account-scoped like projects, and
 *  read by /library and by the gate on project creation. */
export const THEMES_STORE = "themes";
/** Reusable shelf entries — see lib/assets.ts. Pointers to bytes that live
 *  elsewhere, so this store stays small however many plates it indexes. */
export const ASSETS_STORE = "assets";
/** Index over the owning uid — listing is always "this account's projects". */
export const BY_UID = "by-uid";
/** Index over the owning project, on STEPS_STORE only. Named here rather than
 *  spelled as a literal at the one call site, because that call site is
 *  `deleteProject` and a typo there deletes nothing while reporting success. */
export const BY_PROJECT = "by-project";
const DB_VERSION = 4;

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
        // That promise is kept by lib/projects.ts#deleteProject — it was written
        // here, indexed here, and then not used for a long time, so every
        // deleted project left its steps orphaned in this store forever.
        const steps = db.createObjectStore(STEPS_STORE, { keyPath: "id" });
        steps.createIndex(BY_PROJECT, "projectId", { unique: false });
      }
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const store = db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
        store.createIndex(BY_UID, "uid", { unique: false });
      }
      if (!db.objectStoreNames.contains(THEMES_STORE)) {
        const themes = db.createObjectStore(THEMES_STORE, { keyPath: "id" });
        themes.createIndex(BY_UID, "uid", { unique: false });
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        const assets = db.createObjectStore(ASSETS_STORE, { keyPath: "id" });
        assets.createIndex(BY_UID, "uid", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("could not open storage"));
    // A second tab holding the old version open blocks the upgrade forever;
    // say so instead of hanging on a promise that never settles.
    req.onblocked = () => reject(new Error("storage is open in another tab"));
  });
}

/** Run one transaction to completion, resolving when it commits.
 *
 *  `stores` may name SEVERAL, in which case they share one transaction and
 *  therefore one all-or-nothing commit — the guarantee `putProjects` already
 *  gave the seed, extended to the delete that spans the project row and its
 *  steps. `work` gets the first named store directly (what every single-store
 *  caller wants) and the transaction itself (how a multi-store caller reaches
 *  the others). */
export function runTx(
  db: IDBDatabase,
  stores: string | string[],
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, tx: IDBTransaction) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const names = Array.isArray(stores) ? stores : [stores];
    const tx = db.transaction(names.length === 1 ? names[0] : names, mode);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("write failed"));
    tx.onabort = () => reject(tx.error ?? new Error("write aborted"));
    try {
      work(tx.objectStore(names[0]), tx);
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

/** Read every PRIMARY KEY on one index value — keys only, no records.
 *
 *  The distinction is the whole point at the one size that matters: the records
 *  behind a project's steps hold base64 plates, ~5MB for a composed sixteen-frame
 *  cut (app/_phases/frames/useFrames.ts). Counting them, or naming which steps
 *  they are, must not read a single one of those bytes.
 *
 *  EXACT MATCH, not a prefix scan. `getAllKeys(value)` on an index compares the
 *  indexed FIELD for equality, so a project whose id is a prefix of another
 *  project's id cannot be caught by its neighbour's query. That is the property
 *  the delete path depends on and the reason it goes through the index rather
 *  than an `IDBKeyRange` over the `${projectId}:${phase}` key. */
export function getKeysByIndex(
  db: IDBDatabase,
  store: string,
  index: string,
  value: IDBValidKey,
): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).index(index).getAllKeys(value);
    req.onsuccess = () => resolve((req.result as IDBValidKey[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("read failed"));
  });
}

/** Delete every record on one index value, INSIDE a transaction the caller owns.
 *
 *  Synchronous by shape because that is what an IDB transaction requires: the
 *  `getAllKeys` request is issued now and the deletes are issued from its own
 *  success callback, which keeps the transaction alive rather than letting it
 *  auto-commit between the read and the writes. An error on either half is left
 *  unhandled ON PURPOSE — it propagates to the transaction and aborts the whole
 *  thing, so a delete that spans two stores cannot half-commit.
 *
 *  `onKeys` is called once, with exactly the keys about to go, before any of
 *  them do — so a caller can report what it destroyed and have that number be
 *  the one the transaction acted on, not an estimate from a separate read. */
export function deleteByIndex(
  store: IDBObjectStore,
  index: string,
  value: IDBValidKey,
  onKeys?: (keys: IDBValidKey[]) => void,
): void {
  const req = store.index(index).getAllKeys(value);
  req.onsuccess = () => {
    const keys = (req.result as IDBValidKey[]) ?? [];
    onKeys?.(keys);
    for (const k of keys) store.delete(k);
  };
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
