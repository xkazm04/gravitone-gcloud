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
/**
 * The bytes of UPLOADED references, one Blob per row, keyed by upload id.
 *
 * A separate store rather than a field on the asset, and that is the whole
 * point of it. `listAssets` reads and sorts every row of ASSETS_STORE to build
 * the folder tree, so a picture living in that store would be pulled through
 * IndexedDB in full every time the rail was drawn. Here the asset keeps a
 * `upload:<id>` pointer — the same shape a promoted proof already uses for
 * bytes inside a theme — and these are read only for what is actually shown.
 */
export const UPLOADS_STORE = "uploads";
/** Index over the owning uid — listing is always "this account's projects". */
export const BY_UID = "by-uid";
/** Index over the owning project, on STEPS_STORE only. Named here rather than
 *  spelled as a literal at the one call site, because that call site is
 *  `deleteProject` and a typo there deletes nothing while reporting success. */
export const BY_PROJECT = "by-project";
// 5 adds UPLOADS_STORE. The upgrade is additive like every one before it, and
// the stale-tab handling below is what makes a bump safe: an old tab yields on
// `versionchange` instead of blocking the upgrade forever, and a tab left
// behind gets a sentence telling it to reload rather than a raw VersionError.
const DB_VERSION = 5;

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
      // No uid index: these are never listed, only fetched by the id an asset
      // row names. The account scoping lives on the asset that points here, and
      // a second place to get it wrong would be a second place it can disagree.
      if (!db.objectStoreNames.contains(UPLOADS_STORE)) {
        db.createObjectStore(UPLOADS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // THE STALE TAB YIELDS.
      //
      // Without this handler an old tab left open after a DB_VERSION bump holds
      // its connection, and the new tab's upgrade never runs: it sits on
      // `onblocked` below until a human closes the first tab. `versionchange`
      // fires on exactly that — another connection wants a version this one is
      // standing in front of — and closing is the standard answer.
      //
      // Nothing reopens here, and nothing needs to: every helper in this file
      // opens per operation, so the next read or write in this tab opens a fresh
      // connection. That connection is the one that discovers the tab is now
      // behind, and `onerror` below is where it says so.
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => {
      // AND THEN IT SAYS SO. After yielding, this tab is old code asking for an
      // old version of a database that has moved on, which Chrome answers with a
      // bare `VersionError` ("The requested version (4) is less than the existing
      // version (5)") — true, and useless to a person. Replace it with the
      // sentence that names the cause and the fix.
      //
      // "another tab" is load-bearing: it is what stepStore's `classify()`
      // matches on to reach the `blocked` kind, which is the one the notification
      // bell already explains as a two-tab version mismatch. The raw sentence is
      // printed beside that copy, and it is the half that says which side of the
      // mismatch this tab is on.
      const e = req.error;
      if (e?.name === "VersionError") {
        reject(
          new Error(
            "another tab upgraded this browser's storage while this page was open — reload this page to catch up",
          ),
        );
        return;
      }
      reject(e ?? new Error("could not open storage"));
    };
    // A second tab holding the old version open blocks the upgrade forever;
    // say so instead of hanging on a promise that never settles. Rarer now that
    // an open connection yields on `versionchange` — this is what is left when
    // the holder is a tab too old to have that handler.
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

    // THE REAL ERROR, CAUGHT WHERE IT STILL EXISTS.
    //
    // When a request inside a transaction fails, the browser aborts the
    // transaction with that error — but `tx.error` is still NULL at the moment
    // `tx.onerror` fires (measured in Chromium, 2026-08-14: a ConstraintError on
    // `add` arrived at `tx.onerror` with `tx.error === null`). Rejecting with
    // `tx.error ?? new Error("write failed")` therefore handed every caller a
    // generic sentence with a useless name — and stepStore's `classify()` reads
    // exactly that name, so a quota exhaustion and a constraint violation both
    // came out as the catch-all `failed`.
    //
    // The REQUEST's own `error` is the DOMException. A capture-phase listener on
    // the transaction sees the event on its way down to the request, before any
    // handler that would report on it, so the first real failure is kept.
    let cause: DOMException | null = null;
    tx.addEventListener(
      "error",
      (e) => {
        const target = e.target as IDBRequest | null;
        if (!cause && target && "error" in target) cause = target.error;
      },
      true,
    );

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(cause ?? tx.error ?? new Error("write failed"));
    tx.onabort = () => reject(cause ?? tx.error ?? new Error("write aborted"));
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
