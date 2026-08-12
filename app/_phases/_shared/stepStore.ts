"use client";

// Per-project step content.
//
// A project's steps are its own: opening the Research step of project A must not
// show project B's notebook. This is the store that makes "load the project, load
// its step data" true.
//
// It sits in the same IndexedDB as the projects (lib/studioDb.ts) in its own
// object store, keyed `${projectId}:${phase}`. Kept separate from the project
// record deliberately — step content is large and grows, and a project row that
// carried every notebook would have to be read in full just to draw the shelf.

import { STEPS_STORE, openDb, runTx } from "@/lib/studioDb";



export interface ResearchStepData {
  topic: string;
  researched: boolean;
  savedAt?: number;
}

/** The creator's scoping decisions, kept under their own phase key.
 *
 *  Separate from ResearchStepData on purpose: the two are written by different
 *  components on different cadences, and sharing one record would have them
 *  overwrite each other's field on every save. */
export interface ScopeStepData {
  scope: Record<string, { descoped: boolean; liked: boolean; deepen: boolean }>;
  confirmed: Record<string, { descoped: boolean; liked: boolean; deepen: boolean }> | null;
  savedAt?: number;
}

const key = (projectId: string, phase: string) => `${projectId}:${phase}`;

/** The steps store is created lazily rather than in the projects upgrade path,
 *  so an existing browser DB does not need a version bump to gain it. */
async function withStore<T>(fn: (db: IDBDatabase) => Promise<T>, fallback: T): Promise<T> {
  if (typeof indexedDB === "undefined") return fallback;
  try {
    const db = await openDb();
    if (!db.objectStoreNames.contains(STEPS_STORE)) return fallback;
    return await fn(db);
  } catch {
    return fallback;
  }
}

export async function loadStep<T = ResearchStepData>(
  projectId: string,
  phase: string,
): Promise<T | undefined> {
  return withStore(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        const tx = db.transaction(STEPS_STORE, "readonly");
        const req = tx.objectStore(STEPS_STORE).get(key(projectId, phase));
        req.onsuccess = () => resolve(req.result?.data);
        req.onerror = () => resolve(undefined);
      }),
    undefined,
  ).then((v) => v ?? (seededFor(projectId, phase) as T | undefined));
}

export async function saveStep<T>(
  projectId: string,
  phase: string,
  data: T,
): Promise<void> {
  await withStore(
    (db) =>
      runTx(db, STEPS_STORE, "readwrite", (store) => {
        store.put({ id: key(projectId, phase), projectId, phase, data: { ...data, savedAt: Date.now() } });
      }),
    undefined as void,
  );
}

/** The Bitcoin project ships researched.
 *
 *  Its notebook is the real 2026-08-11 run, so the honest starting state for that
 *  project is "already has a notebook" — not an empty topic field the user would
 *  have to re-run to see anything. Every other project starts empty, which is
 *  also honest: nothing has been researched for them. */
function seededFor(projectId: string, phase: string): ResearchStepData | undefined {
  if (phase !== "research") return undefined;
  if (!/bitcoin/i.test(projectId)) return undefined;
  return { topic: "Why Bitcoin price does not rise", researched: true };
}
