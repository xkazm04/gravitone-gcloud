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
import { seededResearchTopic } from "@/app/_studio/projectSeed";

import type { ScoreSpot } from "../score/spots";
import type { TrailerCut, WithholdingBudget } from "../script/trailer/types";

export interface ResearchStepData {
  topic: string;
  researched: boolean;
  savedAt?: number;
}

/** THE NOTEBOOK A REAL RUN PRODUCED, under phase key `"research-notebook"`.
 *
 *  Its own record, and its own key, for the cadence reason every type in this
 *  file gives — but here there is a second and stronger reason. `ResearchStepData`
 *  above is the SIMULATED path's record: `researched: true` there means "this
 *  project shows the saved 2026-08-11 Bitcoin run", which is what the seed writes
 *  and what four harness scripts drive. Folding a real notebook into that boolean
 *  would make the one bit downstream reads mean two different things — a replayed
 *  fixture and a creator's own reasoned notebook — which is the exact
 *  indistinguishability app/_phases/research/guided/RunStage.tsx's `StandInNote`
 *  exists to prevent.
 *
 *  So the two paths write two records, and WHICH RECORD A NOTEBOOK CAME FROM IS
 *  ITS PROVENANCE. A reader that finds this key knows the notebook was reasoned
 *  by an engine for `topic`; a reader that finds only `research` knows it is the
 *  replay. Nothing has to be inferred from content.
 *
 *  `engine` is the run's receipt (`/api/research`'s `engine` block), kept ON the
 *  record rather than beside it so that what a notebook cost, which rung served
 *  it, and — the field no other receipt in this app has — whether the engine
 *  could search, all survive the reload with the work they describe.
 *
 *  `notebook: null` is the CLEARED state and is distinct from no record at all:
 *  the creator discarded a notebook here, and re-adopting one on the next mount
 *  would silently undo their clear.
 *
 *  Typed loosely on purpose. `Notebook` lives in `_shared/notebook/types.ts` and
 *  importing it here would put the whole fixture-adjacent type graph into every
 *  module that touches the step store, including five that never see a notebook.
 *  The one consumer (`research/run/live.ts`) casts at its own boundary, which is
 *  also the boundary where `lib/notebook/validate.ts` has already checked it. */
export interface ResearchNotebookStepData {
  /** The topic as the creator typed it — the authority on what was asked. */
  topic: string;
  /** A validated notebook, or `null` for "cleared here". */
  notebook: unknown | null;
  /** The run's receipt, or `null` alongside a cleared notebook. */
  engine: unknown | null;
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
  /** The `digest` of the NotebookSource these decisions were made on
   *  (_shared/notebook/source.ts), stamped on every save since
   *  research-scope-board-A stage 3. A scope is a set of verdicts on card ids,
   *  and two notebooks can share an id while meaning different cards — so a
   *  scope whose digest is not the dealt source's is ORPHANED and applies
   *  nothing (research/useScope.ts). Absent on every record written before the
   *  stamp, and every one of those was written against the fixture: absent
   *  means the fixture's digest. */
  digest?: string;
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

/** Which face of a step the creator works in — the guided card wizard or the
 *  full expert surface — under phase keys `"research-mode"` and `"script-mode"`.
 *
 *  Its own record per step for the cadence reason above, and its own TYPE
 *  because the mode must never ride along with a step's decisions: switching
 *  faces discards nothing (the ModeChooser doctrine), so the record that says
 *  "guided" cannot be the record that holds what was decided there. Absent
 *  means never chosen — surfaces default to guided only while the step has no
 *  prior decisions, and that default is computed, never stored. */
export interface GuidedModeStepData {
  mode: "guided" | "expert";
  savedAt?: number;
}

/** WHICH candidate script this project adopted, under phase key
 *  `"script-adopted"` — the record frames.ts:300 names as missing.
 *
 *  One field on purpose: adoption is a pointer into the render registry, not a
 *  copy of the render. The Frames step resolves it against RENDER_BY_ID and
 *  falls back to the positional default when the id is unknown or the record
 *  absent — absence keeps today's behaviour, honestly. Separate from
 *  `"script-versions"` because the duel writes on a card click and the version
 *  ledger on accept, and one record shared between them would have each save
 *  erase the other's field. */
export interface ScriptAdoptionStepData {
  renderId: string;
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
  /** THE SPINE THIS CUT WAS COMPOSED FROM — the confirmed picks, slot → variant,
   *  as they stood at compose time (added 2026-09-05). A cut is composed ONCE
   *  and then edited; the board's picks are its history, not its source. So
   *  when the creator reopens the spine in Step 1 and composes a different one,
   *  the Script step needs a way to tell that the cut on screen predates the
   *  spine on the board — this is that record. Absent on cuts saved before the
   *  field existed, which readers treat as "unknown", never as "current". */
  spine?: Record<string, string>;
  savedAt?: number;
}

/** The drift the creator has dialled into the Cut's sync bench, clip id → offset
 *  in milliseconds.
 *
 *  Small on purpose, and that is what makes it storable. The Cut and Score steps
 *  were the two of five phases that persisted nothing, and they are not the same
 *  problem: this is a handful of integers, while a Score take is an object URL
 *  over megabytes of decoded audio that no `blob:` string survives a reload to
 *  reach. So the offsets land here now and the audio question stays open — see
 *  .vault/Architect/decisions/2026-08-29-score-take-persistence.md.
 *
 *  ABSENT IS NOT ZERO. A clip nobody has touched must report what the cut itself
 *  says about it (`TimelineClip.offsetMs`), not a dialled-in zero — `offsetFrom`
 *  in the Cut step reads the record that way, and storing a zero for every clip
 *  on first load would erase the distinction between "at its mark" and "brought
 *  back to its mark", which the surface colours differently. Only clips the
 *  creator has actually nudged appear in this map. */
export interface CutStepData {
  offsets: Record<string, number>;
  savedAt?: number;
}

/** THE SPOTTING SESSION — where the cues go, and what each one is for.
 *
 *  The other half of the paragraph above, and it lands here on the same terms.
 *  A spot is a title, a scene range, a purpose sentence and (once somebody
 *  chooses one) a tempo: plain data, a few dozen bytes a row. A TAKE is still
 *  an object URL over megabytes of decoded audio that no `blob:` string
 *  survives a reload to reach, and this record does not carry one, does not
 *  have a field for one, and must not grow one without answering the question
 *  .vault/Architect/decisions/2026-08-29-score-take-persistence.md leaves open.
 *  Spots survive a reload; takes do not, and the surface says so rather than
 *  implying otherwise.
 *
 *  WHY IT IS THE WHOLE LIST AND NOT A DIFF AGAINST THE PROPOSAL. Spots are
 *  seeded once — proposed from the script's movements the first time this step
 *  meets a project with a picture (app/_phases/score/spots.ts), saved, and
 *  after that they are the creator's. A record that stored only the edits would
 *  have to re-derive the proposal on every load to know what the edits were
 *  against, which makes a change upstream silently rewrite work downstream. The
 *  same rule `useTrailerCut` composes a cut under: composed once from the
 *  confirmed spine, then owned.
 *
 *  An EMPTY array is a decision — every spot deleted — and is distinct from no
 *  record at all, which means this step has never been opened with a picture in
 *  front of it. The seeder writes nothing in the second case, so re-opening the
 *  step after composing a spine still proposes. */
export interface ScoreStepData {
  spots: ScoreSpot[];
  savedAt?: number;
}

/** THE MUSIC-VIDEO DISCIPLINE'S WHOLE RESEARCH OUTPUT, under phase key
 *  `"music-video-source"` — a sibling of `research`/`research-beats`/etc.,
 *  not a new phase (see lib/projects.ts PHASES for the steps).
 *
 *  Written once by Research (the mp3 upload pointer, the style line, and the
 *  baked `AudioEnvelope` — `lib/audioEnvelope.ts`, computed once and never
 *  re-derived live), then GROWN by later work packages rather than replaced:
 *  `posterAssetId` is Frames' (WP3) to fill once the poster generates, `seed`
 *  and `effectParams` are the effects-studio's (also WP3) determinism inputs.
 *  All three stay `undefined` here — absence, never a placeholder — exactly
 *  the convention `Asset.meta` already uses elsewhere in this file.
 *
 *  `sourceAssetId` points at the Asset row `assetFromUpload` wrote (kind
 *  `"audio"`); the bytes themselves live in `UPLOADS_STORE` behind that
 *  asset's `upload:` pointer (lib/assets.ts) and are never duplicated here. */
export interface MusicVideoSourceStepData {
  /** The attached track's Asset id, or absent if none has been attached yet. */
  sourceAssetId?: string;
  /** The optional one-line style/direction text typed alongside the upload. */
  style?: string;
  /** The baked analysis — see `lib/audioEnvelope.ts`. Absent until a track has
   *  been attached and successfully decoded. */
  envelope?: import("@/lib/audioEnvelope").AudioEnvelope;
  /** Frames' (WP3) poster Asset id — not this package's to fill. */
  posterAssetId?: string;
  /** The effects-studio's (WP3) determinism seed — not this package's to fill. */
  seed?: number;
  /** The effects-studio's (WP3) compositor parameters — not this package's to
   *  fill. */
  effectParams?: Record<string, unknown>;
  savedAt?: number;
}

/** How many of the fields keyed to the attached track Frames has filled in. A
 *  replacement clears them, so this is what a replace has to confirm. */
export function downstreamCount(data: MusicVideoSourceStepData | undefined): number {
  if (!data) return 0;
  return [data.posterAssetId, data.seed, data.effectParams].filter((v) => v !== undefined).length;
}

/** A NEW TRACK REPLACING THE ATTACHED ONE. The fields keyed to the old track
 *  (Frames' poster, the effects-studio's locked seed and compositor parameters)
 *  are dropped, not carried: a poster, a "locked once set" seed and parameters
 *  made for another song would survive against this one with nothing marking
 *  them. Frames reads their absence as "not generated yet", so it needs no
 *  change. The style line is the creator's own direction and stays; any key
 *  this build does not know stays too. The result has no `undefined` keys. */
export function withTrack(
  current: MusicVideoSourceStepData | undefined,
  track: { sourceAssetId: string; envelope: import("@/lib/audioEnvelope").AudioEnvelope },
): MusicVideoSourceStepData {
  const { posterAssetId: _poster, seed: _seed, effectParams: _params, ...kept } = current ?? {};
  void _poster;
  void _seed;
  void _params;
  return { ...kept, ...track };
}

/* ────────────────────────────── what went wrong ──────────────────────────── */

/** WHY the operation failed. Five storage destinations that used to be one
 *  `return fallback`, and they call for different things from a surface:
 *  `quota` means stop and export, `blocked` means close the other tab, and
 *  `unavailable` means this browser session was never going to persist.
 *
 *  `non-storage` is the sixth and it is NOT a storage failure — it is how a
 *  failure that merely arrived through this channel says so. The only producer
 *  is `reportTaskTrouble` (lib/GlobalErrorBridge's unhandled-rejection route),
 *  and it exists because the alternative was worse: every non-storage rejection
 *  — a `void fetch(...)` that dropped, an AbortError, a TypeError thrown in
 *  fire-and-forget code — fell through `classify` into `failed` and was voiced
 *  as "Not saved: the browser refused the operation", sending the creator to
 *  check a quota that was never the problem. A kind rather than a second
 *  channel, so the bell keeps one vocabulary and every exhaustive switch over
 *  this union is forced to learn it. */
export type StorageFailure =
  | "unavailable" // no IndexedDB at all — private mode, or a server render
  | "missing-store" // the DB opened without the steps store
  | "blocked" // another tab holds the old version open (studioDb's onblocked)
  | "quota" // out of room. The expensive one, and the reachable one
  | "failed" // everything else STORAGE-SHAPED, reported rather than guessed at
  | "non-storage"; // not storage at all — it only travelled this channel

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

/**
 * Publish a failure that reached NO owner — an unhandled promise rejection —
 * through this same channel, without claiming it was a storage write.
 *
 * `reportStorageTrouble` is for a caller that KNOWS it was doing storage work
 * and merely lost the error; this is for the last-resort reporter, which knows
 * only that something rejected. The difference matters at the bell: `failed`
 * prints "the browser refused the operation" and sends the creator to look at
 * their quota, which is the wrong remedy for a dropped fetch.
 *
 * The three RECOGNISED storage kinds are still honoured, because a rejection
 * really can be one: `saveStep` never rejects (see its header), but a direct
 * IndexedDB user in fire-and-forget code can, and a QuotaExceededError arriving
 * this way is still a quota. It is only `classify`'s catch-all — the bucket that
 * means "not storage-shaped as far as anything here can tell" — that becomes
 * `non-storage` and carries the reason's own message instead.
 */
export function reportTaskTrouble(phase: string, e: unknown): StorageTrouble {
  const storageShaped = classify(e);
  const t: StorageTrouble = {
    kind: storageShaped === "failed" ? "non-storage" : storageShaped,
    op: "write",
    projectId: "app",
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

/* ───────────────────────── issue order (added 2026-10-05) ──────────────────
 *
 * The ticket above decides which of two WHOLE-RECORD saves may land. It cannot
 * order a PATCH, because a patch is not superseded by a later write — it carries
 * a field nobody else is writing, and abandoning it loses that field. That is
 * the bug the four copied read-merge-writes had: each claimed a ticket, so the
 * first of two patches issued in one tick abandoned and its field was gone.
 *
 * So every write to a key — whole save or patch — runs in ISSUE order through
 * one chain per key. `openDb()` is awaited before a transaction exists, so
 * without the chain a later call can create its transaction first; IndexedDB
 * then serialises them in the wrong order. With it, a save issued before a
 * patch lands before it, and the patch merges onto what the save wrote.
 *
 * A link never rejects (`withStore` resolves every failure to an outcome), and
 * the chain is dropped once it drains, so the map holds only keys with a write
 * in flight. */
const writeChains = new Map<string, Promise<void>>();

function inIssueOrder<T>(k: string, run: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(k) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  writeChains.set(k, tail);
  void tail.then(() => {
    if (writeChains.get(k) === tail) writeChains.delete(k);
  });
  return next;
}

/** The steps store is created lazily rather than in the projects upgrade path,
 *  so an existing browser DB does not need a version bump to gain it.
 *
 *  THE CONNECTION IS OWNED HERE, and it used to leak. `openDb()` is not cached —
 *  it calls `indexedDB.open` fresh every time — so every caller owns the handle
 *  it gets back and has to close it. Every other call site in the data layer
 *  does, wrapping the work in `try { db = await openDb(); … } finally {
 *  db?.close(); }`. This was the one that did not — while being by a wide margin
 *  the most frequently called of them, because every caller above it fires
 *  `void saveStep(...)` on a keystroke.
 *
 *  THE COUNT IS NOT WRITTEN HERE ANY MORE, and that is the point. It said
 *  "thirteen other call sites… `lib/assets.ts` (3)"; measured 2026-09-06 there
 *  were twenty-one across five files and assets.ts held eight. The property was
 *  still true and the number had been wrong for long enough that nobody could
 *  have said when it stopped. The population is walked and the rule is gated in
 *  tests/golden-path/shared-notebook-contracts.probe.spec.ts — which is also
 *  where the one file that still does not close is listed, with its reason.
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
/** The shape version stamped on every record this build writes.
 *
 *  WHAT THE DATABASE VERSION DOES NOT COVER. `DB_VERSION` in lib/studioDb.ts
 *  versions the database — which stores exist, which indexes they carry — and its
 *  upgrade path has never rewritten a record. The records INSIDE the stores had
 *  no version of any kind, so a blob written by any earlier build was
 *  indistinguishable from a current one and nothing could have noticed. The
 *  compensation for that is already spread through the tree: three readers
 *  optional-chain through fields their own interface declares REQUIRED, and
 *  frames/frames.ts says it plainly — "there is no migration seam to hang this
 *  off".
 *
 *  THE POLICY, in full at
 *  .vault/Architect/decisions/2026-08-29-persisted-payload-versioning.md:
 *
 *   1. ABSENT MEANS v1, permanently. A record with no `v` is version 1, and v1 is
 *      the shape as of 2026-08-29 WITH EVERY FIELD OPTIONAL — the only honest
 *      description, since records predating a field genuinely lack it. This is
 *      what guarantees no stored work is ever stranded: the absent case has a
 *      meaning rather than being an error deferred to whoever hits it.
 *   2. New writes carry `v` — this constant, stamped below. Additive, and safe
 *      against every existing reader, which destructures what it knows.
 *   3. A record from the FUTURE is refused, never downgraded. The dangerous
 *      direction is new data meeting OLD code, which is real here: `e242b89`
 *      documents two tabs on different builds sharing one database. Applying v2
 *      assumptions to a v3 payload and then SAVING the result destroys work,
 *      where refusing merely fails to show it.
 *   4. Migrations are pure vN→vN+1 functions applied at the read seam, and each
 *      one ships in the same commit as the shape change that needs it.
 *
 *  Rules 3 and 4 are built at the RECORD seam, not here (2026-10-05):
 *  `app/_phases/_shared/records/registry.ts` reads `v` (absent = 1), refuses a
 *  record from the future, chains a def's migrations, and parses. A record with
 *  a def is written with ITS version through the `v` option below; this constant
 *  stays the stamp for every write that has no def yet, and both are 1 today.
 *
 *  Deleting it as unused would silently restore the ambiguity it exists to end. */
export const SCHEMA_VERSION = 1;

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
const saveWatchers = new Set<SaveWatcher>();

export function onSaveIssued(watcher: SaveWatcher): () => void {
  saveWatchers.add(watcher);
  return () => void saveWatchers.delete(watcher);
}

export async function saveStep<T>(
  projectId: string,
  phase: string,
  data: T,
  /** `v`: the record version to stamp — a record def's own (records/patch.ts).
   *  Absent means `SCHEMA_VERSION`, which is every caller without a def. */
  opts?: { v?: number },
): Promise<SaveOutcome> {
  // Ticket taken HERE — at call time, in issue order — not inside the write,
  // which would be the same race one layer down. See the block above.
  const slot = claimSaveSlot(projectId, phase);
  saveWatchers.forEach((w) => w(projectId, phase, data));
  // An early out for the common overtaking case, so a superseded keystroke does
  // not even open the database. It is an optimisation, not the guard: the guard
  // is the check inside the transaction callback, which is the only one that
  // cannot be raced.
  if (!slot.stillNewest()) return { ok: true, superseded: true };

  return inIssueOrder(key(projectId, phase), async () => {
    let wrote = false;
    const r = await withStore("write", projectId, phase, (db) =>
      runTx(db, STEPS_STORE, "readwrite", (store) => {
        // The check and the put are in ONE synchronous block, so no later save can
        // be issued between them.
        if (!slot.stillNewest()) return;
        wrote = true;
        store.put({
          id: key(projectId, phase),
          projectId,
          phase,
          data: { ...data, savedAt: Date.now(), v: opts?.v ?? SCHEMA_VERSION },
        });
      }),
    );
    if (!r.ok) return r;
    return wrote ? { ok: true } : { ok: true, superseded: true };
  });
}

/** What a patch decided, having read the stored record inside its own
 *  transaction: write this, or write nothing and say why. */
export type StepDecision = { put: object } | { skip: unknown };

export type PatchStepOutcome =
  | { ok: true; wrote: true }
  | { ok: true; wrote: false; skip: unknown }
  | { ok: false; trouble: StorageTrouble };

/**
 * Read a record and write its successor in ONE readwrite transaction.
 *
 * The read-merge-write this replaces was `loadStep` then `saveStep`: two
 * transactions, so a write could land between them, and a read that FAILED came
 * back as `{}` — after which the "merge" wrote one field over the whole record.
 * Here the read and the put share a transaction: a failed read aborts it and
 * nothing is written, and no other write to this key can interleave (IndexedDB
 * serialises readwrite transactions on a store, and `inIssueOrder` makes their
 * order the order they were issued in).
 *
 * `decide` is synchronous on purpose — the transaction would auto-commit across
 * an `await`. It receives the stored data exactly as written (with its `v`), or
 * the seeded default when nothing is stored, and a throw from it aborts the
 * transaction and reports as a write failure.
 *
 * Exported for `records/patch.ts`, which supplies the version check and the
 * parse; a call site wants `patchRecord`, not this.
 */
export function patchStep(
  projectId: string,
  phase: string,
  decide: (stored: unknown) => StepDecision,
  opts?: { v?: number },
): Promise<PatchStepOutcome> {
  return inIssueOrder(key(projectId, phase), async () => {
    // A holder rather than two `let`s: assignments inside the request callback
    // are invisible to control-flow narrowing after the await.
    const seen: { decided?: StepDecision; thrown?: unknown } = {};
    const r = await withStore("write", projectId, phase, (db) =>
      runTx(db, STEPS_STORE, "readwrite", (store, tx) => {
        const req = store.get(key(projectId, phase));
        req.onsuccess = () => {
          let d: StepDecision;
          try {
            d = decide(req.result?.data ?? seededFor(projectId, phase));
          } catch (e) {
            seen.thrown = e;
            tx.abort();
            return;
          }
          seen.decided = d;
          if ("put" in d)
            store.put({
              id: key(projectId, phase),
              projectId,
              phase,
              data: { ...d.put, savedAt: Date.now(), v: opts?.v ?? SCHEMA_VERSION },
            });
        };
      }).catch((e: unknown) => {
        throw seen.thrown ?? e;
      }),
    );
    if (!r.ok) return r;
    const d = seen.decided;
    if (d && "put" in d) return { ok: true, wrote: true };
    return { ok: true, wrote: false, skip: d && "skip" in d ? d.skip : undefined };
  });
}

/** A seeded project ships with the research its own seed row claims.
 *
 *  THE MATCH USED TO BE `/bitcoin/i` (fixed 2026-09-09). The reasoning was
 *  sound for the project it named — the shipped notebook is the real 2026-08-11
 *  Bitcoin run, so that project's honest starting state is "already has a
 *  notebook" rather than an empty field — but the test was the project's NAME,
 *  and three other seed rows declare `progress.research: "done"` without having
 *  it in theirs. Those three printed "locked" on the shelf and then opened Step
 *  1 on an empty topic field with the guided wizard parked at stage 1 and every
 *  later stage unreachable. The shelf and the step contradicted each other about
 *  the same project, and the step was the one telling the truth.
 *
 *  It asks the seed itself now (`seededResearchTopic`), so the two cannot
 *  disagree again: a row that claims done gets a record, a row that does not,
 *  does not. A project the USER made still starts empty, which is honest —
 *  nothing has been researched for it. */
function seededFor(projectId: string, phase: string): ResearchStepData | undefined {
  if (phase !== "research") return undefined;
  const topic = seededResearchTopic(projectId);
  return topic ? { topic, researched: true } : undefined;
}
