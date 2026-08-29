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
//
// FAILURE IS NOT SWALLOWED HERE, and it used to be. `withStore` wrapped every
// operation in `try { … } catch { return fallback }`, so a quota-exceeded write,
// a blocked-tab upgrade and a missing object store all resolved to the same
// quiet nothing — one layer above lib/studioDb.ts's own header promising the
// opposite ("Failures are NOT swallowed here… has to reach the caller"). Base64
// proofs and plates make quota exhaustion a real destination and not a
// theoretical one: a composed 16-frame cut is ~5MB (frames/useFrames.ts) and a
// theme proof sheet ~3.5MB (lib/themes.ts), both measured in this repo.
//
// The shape of the fix is chosen for the call sites that exist. Every caller
// fires and forgets — `void saveStep(...)` on every keystroke — and that is the
// RIGHT ergonomics for a save that runs that often. So nothing here rejects:
// `saveStep` RESOLVES to an outcome a caller may ignore, and every failure is
// also pushed to the one channel below, which a surface subscribes to once. The
// point was never that each call site grows a try/catch; it is that failure
// stops being unobservable.

import { useSyncExternalStore } from "react";

import { STEPS_STORE, openDb, runTx } from "@/lib/studioDb";

import type { TrailerCut, WithholdingBudget } from "../script/trailer/types";

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

/** The beat-variant picks of a trailer / free project's Research step, under
 *  phase key `"research-beats"`.
 *
 *  A separate key from `research` and `research-scope` for the same cadence
 *  reason ScopeStepData gives: the beat board writes on every tile click, the
 *  research record is written by whichever surface owns `researched`, and one
 *  record shared between them would have each save erase the other's field.
 *
 *  `picks` is slot id → chosen variant id, `null` for a slot the creator has
 *  deliberately cleared (absent means never touched). `confirmed` is the frozen
 *  spine — Script opens on THIS, never on the live picks. `mode` is the free
 *  discipline's answer to "facts or beats"; trailer projects store `"beats"`. */
export interface BeatPicksStepData {
  mode: "facts" | "beats";
  picks: Record<string, string | null>;
  confirmed: Record<string, string> | null;
  savedAt?: number;
}

/** The trailer half of the Script step, under phase key `"script-trailer"`.
 *
 *  The cut is composed ONCE from the confirmed spine in `research-beats` and
 *  is then the creator's own: every edit here (a rewritten beat, a connector,
 *  a payer, a raised variable) lands on this record and never back on the
 *  picks. The budget travels with the cut because it is the campaign's object
 *  and the withholding rule reads them together — a budget stored elsewhere
 *  would let the two drift apart between saves. */
export interface TrailerCutStepData {
  cut: TrailerCut;
  budget: WithholdingBudget;
  savedAt?: number;
}

/* ────────────────────────────── what went wrong ──────────────────────────── */

/** WHY the storage operation failed. Five destinations that used to be one
 *  `return fallback`, and they call for different things from a surface:
 *  `quota` means stop and export, `blocked` means close the other tab, and
 *  `unavailable` means this browser session was never going to persist. */
export type StorageFailure =
  | "unavailable" // no IndexedDB at all — private mode, or a server render
  | "missing-store" // the DB opened without the steps store
  | "blocked" // another tab holds the old version open (studioDb's onblocked)
  | "quota" // out of room. The expensive one, and the reachable one
  | "failed"; // everything else, reported rather than guessed at

export interface StorageTrouble {
  kind: StorageFailure;
  op: "read" | "write";
  projectId: string;
  phase: string;
  message: string;
  at: number;
}

/** A caller may ignore this — `void saveStep(...)` still compiles, and still
 *  reports through `onStorageTrouble`. Reading it is the stronger option, not
 *  the required one.
 *
 *  `superseded` is a SUCCESS: the write was deliberately abandoned because a
 *  later save for the same key had already been issued, so the newer data is
 *  what reaches disk. It is not a failure and must not be reported as one —
 *  nothing went wrong, and the user's most recent keystroke is what survives. */
export type SaveOutcome =
  | { ok: true; superseded?: false }
  | { ok: true; superseded: true }
  | { ok: false; trouble: StorageTrouble };

/** `ok: true, data: undefined` means THIS KEY HAS NEVER BEEN WRITTEN.
 *  `ok: false` means the read failed. Both used to be `undefined`, and they mean
 *  opposite things: the first is a new project, the second is a project whose
 *  work is on disk and out of reach. */
export type ReadOutcome<T> = { ok: true; data: T | undefined } | { ok: false; trouble: StorageTrouble };

/* ──────────────────────── the one place to learn about it ────────────────── */

let latest: StorageTrouble | null = null;
const listeners = new Set<() => void>();

/** Subscribe to storage trouble. `useSyncExternalStore`-shaped on purpose —
 *  see `useStorageTrouble` below, which is the one-line way to mount it. */
export function onStorageTrouble(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The most recent failure, or null. Referentially stable between failures, so
 *  it is a valid `useSyncExternalStore` snapshot. */
export function lastStorageTrouble(): StorageTrouble | null {
  return latest;
}

/** Nothing has failed on the server, and nothing can: there is no IndexedDB
 *  there. A constant, so hydration does not tear. */
function serverTrouble(): StorageTrouble | null {
  return null;
}

export function clearStorageTrouble(): void {
  if (!latest) return;
  latest = null;
  listeners.forEach((l) => l());
}

/** The whole subscription, for a surface that wants to say so. A user editing
 *  for an hour against a full quota finds out from this, before they close the
 *  tab — mounting it anywhere in the tree is enough. */
export function useStorageTrouble(): StorageTrouble | null {
  return useSyncExternalStore(onStorageTrouble, lastStorageTrouble, serverTrouble);
}

/** Duck-typed on `name` rather than `instanceof DOMException`: the global is
 *  absent in some runtimes this module is merely IMPORTED into, and a classifier
 *  that throws while classifying is worse than the failure it was reading.
 *  The two message matches are studioDb's own two literal rejections — a
 *  coupling worth naming, because that file is the only source of them. */
function classify(e: unknown): StorageFailure {
  const name = typeof e === "object" && e !== null ? (e as { name?: string }).name : undefined;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("another tab")) return "blocked";
  if (message.includes("IndexedDB unavailable")) return "unavailable";
  return "failed";
}

function report(t: StorageTrouble): { ok: false; trouble: StorageTrouble } {
  latest = t;
  listeners.forEach((l) => l());
  return { ok: false, trouble: t };
}

/**
 * Publish a storage failure raised somewhere OTHER than this module's store,
 * through this module's channel and this module's five kinds.
 *
 * Exported so the PROJECT record's writes (lib/projects.ts, lib/useProjects.ts,
 * the studio's bookmark and the frames step's progress report) land in the same
 * place with the same vocabulary, instead of growing a second error taxonomy one
 * layer up. They already fail for identical reasons — the quota is one quota and
 * a blocked upgrade blocks both stores — and `useProjects` used to degrade all
 * of it to a bare `e.message` with no kind, while `parkAt` and `reportPhase`
 * failures were swallowed by empty catches and reached nobody at all.
 *
 * `phase` is the WHERE, and it is what the bell prints; for a project-level
 * operation pass a short label ("projects", "bookmark") rather than a step key.
 * Returns the classified trouble so a caller can also show it locally.
 */
export function reportStorageTrouble(
  op: "read" | "write",
  projectId: string,
  phase: string,
  e: unknown,
): StorageTrouble {
  const t: StorageTrouble = {
    kind: classify(e),
    op,
    projectId,
    phase,
    message: e instanceof Error ? e.message : String(e),
    at: Date.now(),
  };
  report(t);
  return t;
}

/* ────────────────────────────────── the store ────────────────────────────── */

const key = (projectId: string, phase: string) => `${projectId}:${phase}`;

/* ───────────────────────── latest-wins (added 2026-08-24) ──────────────────
 *
 * THE BUG. Every caller fires `void saveStep(...)` on a keystroke, which is the
 * right ergonomics for a save that runs that often and was, until now, missing
 * its other half: nothing decided which of two in-flight writes for one
 * `${projectId}:${phase}` key was allowed to land. They settled in ARRIVAL
 * order, and arrival order is not issue order — `openDb()` is awaited on every
 * call, a slow first write can be overtaken by a fast second, and the older
 * snapshot then lands on top of the newer one. The user watches their last
 * sentence disappear, the store reports success, and nothing anywhere is wrong
 * enough to notice.
 *
 * THE FIX is a monotonic ticket per key, taken at CALL time — not at write time,
 * which would be the same race one layer down — and checked immediately before
 * the `put` is queued into the transaction. Only the newest ticket for a key may
 * write; anything older abandons. Because the check and the `put` are in the same
 * synchronous block, nothing can be issued between them.
 *
 * Abandoning is a SUCCESS. The newer save carries the newer data, so the older
 * one had nothing left to contribute; reporting it as a failure would put a
 * storage alert in the bell for a keystroke that was superseded a millisecond
 * later. */

/** The newest ticket issued per key. One entry per key ever written in this
 *  session — bounded by the number of steps in the open project, not by the
 *  number of keystrokes. */
const newestTicket = new Map<string, number>();
let ticketSeq = 0;

export interface SaveSlot {
  ticket: number;
  /** Is this still the newest save issued for its key? Checked immediately
   *  before the write is queued; false means abandon. */
  stillNewest: () => boolean;
}

/**
 * Claim the right to write this key, and get back the test for whether that
 * right still holds.
 *
 * Exported and separated from `saveStep` on purpose: the IndexedDB write itself
 * cannot be driven in this repo's Node-context probe suite, and a latest-wins
 * rule that cannot be asserted is a rule nobody can trust. This is the whole
 * ordering decision, and it is a pure function of call order.
 */
export function claimSaveSlot(projectId: string, phase: string): SaveSlot {
  const k = key(projectId, phase);
  const ticket = ++ticketSeq;
  newestTicket.set(k, ticket);
  return { ticket, stillNewest: () => newestTicket.get(k) === ticket };
}

/** Test hook — forget every issued ticket, so one probe's ordering never leaks
 *  into the next one's. */
export function __resetSaveSlots(): void {
  newestTicket.clear();
  ticketSeq = 0;
}

/** The steps store is created lazily rather than in the projects upgrade path,
 *  so an existing browser DB does not need a version bump to gain it.
 *
 *  THE CONNECTION IS OWNED HERE, and it used to leak. `openDb()` is not cached —
 *  it calls `indexedDB.open` fresh every time — so every caller owns the handle
 *  it gets back and has to close it. The thirteen other call sites in the data
 *  layer do: `lib/projects.ts` (6), `lib/themes.ts` (4) and `lib/assets.ts` (3)
 *  all wrap the work in `try { db = await openDb(); … } finally { db?.close(); }`.
 *  This was the fourteenth, and the only one that did not — while being by a wide
 *  margin the most frequently called of the fourteen, because every caller above
 *  it fires `void saveStep(...)` on a keystroke.
 *
 *  The cost was not abstract. The latest-wins ticket below abandons a write only
 *  when a later save for the same key is ISSUED before the earlier one reaches
 *  its `put`; typing at ~150-250ms a character never overlaps a ~1-5ms warm
 *  transaction, so every keystroke's write lands and every keystroke's connection
 *  stayed open for the life of the tab. Each one keeps a live `onversionchange`
 *  handler (lib/studioDb.ts), so a DB_VERSION bump fired one close-race per
 *  keystroke instead of one per tab — the shape of the two-tab upgrade hang that
 *  `e242b89` fixed from the other side, and a plausible source of the `blocked`
 *  failure kind this file exists to report.
 *
 *  The close is in a `finally` and runs after `fn(db)` has settled, never before:
 *  the transaction is live until then, and closing under it would abort the work
 *  rather than release it. Closing does not change an outcome — a successful
 *  write whose connection could not be closed is still a successful write. */
async function withStore<T>(
  op: "read" | "write",
  projectId: string,
  phase: string,
  fn: (db: IDBDatabase) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; trouble: StorageTrouble }> {
  const trouble = (kind: StorageFailure, message: string) =>
    report({ kind, op, projectId, phase, message, at: Date.now() });

  if (typeof indexedDB === "undefined")
    return trouble("unavailable", "IndexedDB unavailable — nothing written in this session will survive it.");
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    if (!db.objectStoreNames.contains(STEPS_STORE))
      return trouble("missing-store", `The "${STEPS_STORE}" store is not in this database.`);
    return { ok: true, value: await fn(db) };
  } catch (e) {
    return trouble(classify(e), e instanceof Error ? e.message : String(e));
  } finally {
    db?.close();
  }
}

/** The honest read: tells a never-written key from a failed read. */
export async function readStep<T = ResearchStepData>(
  projectId: string,
  phase: string,
): Promise<ReadOutcome<T>> {
  const r = await withStore("read", projectId, phase, (db) =>
    new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STEPS_STORE, "readonly");
      const req = tx.objectStore(STEPS_STORE).get(key(projectId, phase));
      req.onsuccess = () => resolve(req.result?.data);
      req.onerror = () => reject(req.error ?? new Error("read failed"));
    }),
  );
  if (!r.ok) return r;
  return { ok: true, data: (r.value ?? seededFor(projectId, phase)) as T | undefined };
}

/** The flattened read, unchanged for its five callers: the stored value, or the
 *  seeded default when nothing is stored. A FAILED read also lands here as the
 *  seeded default — it is reported through `onStorageTrouble`, and a caller that
 *  needs to tell the two apart calls `readStep` instead. */
export async function loadStep<T = ResearchStepData>(
  projectId: string,
  phase: string,
): Promise<T | undefined> {
  const r = await readStep<T>(projectId, phase);
  return r.ok ? r.data : (seededFor(projectId, phase) as T | undefined);
}

/** Never rejects: an ignored `void saveStep(...)` must not become an unhandled
 *  rejection, and a save on every keystroke is a caller with nowhere to put a
 *  catch. The outcome is returned AND pushed to the trouble channel. */
export async function saveStep<T>(
  projectId: string,
  phase: string,
  data: T,
): Promise<SaveOutcome> {
  // Ticket taken HERE — at call time, in issue order — not inside the write,
  // which would be the same race one layer down. See the block above.
  const slot = claimSaveSlot(projectId, phase);
  // An early out for the common overtaking case, so a superseded keystroke does
  // not even open the database. It is an optimisation, not the guard: the guard
  // is the check inside the transaction callback, which is the only one that
  // cannot be raced.
  if (!slot.stillNewest()) return { ok: true, superseded: true };

  let wrote = false;
  const r = await withStore("write", projectId, phase, (db) =>
    runTx(db, STEPS_STORE, "readwrite", (store) => {
      // The check and the put are in ONE synchronous block, so no later save can
      // be issued between them.
      if (!slot.stillNewest()) return;
      wrote = true;
      store.put({ id: key(projectId, phase), projectId, phase, data: { ...data, savedAt: Date.now() } });
    }),
  );
  if (!r.ok) return r;
  return wrote ? { ok: true } : { ok: true, superseded: true };
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
