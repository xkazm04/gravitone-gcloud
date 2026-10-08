"use client";

// THE PROJECT'S ACTIVE NOTEBOOK — the one the board deals (research-scope-board-A,
// stage 3).
//
// Two notebooks can stand on the Research step at once, and they are different
// objects (run/LiveResult.tsx's header): the REPLAY, the shipped 2026-08-11
// Bitcoin run the simulated path lands on, and a LIVE notebook an engine
// reasoned for the creator's own topic, saved under step record
// `"research-notebook"` with its receipt. Stages 1-2 let the board deal either;
// this file decides which one it deals.
//
// THE PRECEDENCE RULE, whole:
//   · a `research-notebook` record with a notebook and a receipt wins. Its kind
//     is the receipt's: `researched` when the engine searched, else `reasoned`.
//   · anything else is the replay — no record, a cleared record (`notebook:
//     null`, which is what `resetLive` writes), or a record the board cannot
//     deal. A cleared notebook is never dealt: a clear that the board ignored
//     would be the creator's clear silently undoing itself.
//   · A record that HAS a notebook but cannot be dealt (not a notebook at all, or
//     no receipt) is still the replay, and is never silent: the hook carries a
//     `trouble` naming it (`refusalOf`), and the Research step draws it. The
//     replay is what the board must deal, and the creator must still be told that
//     the notebook they saved is not the one on screen.
//   · `PIN_REPLAY` overrides both. It is the card's rollback: set it and every
//     project deals the replay, which is the board exactly as it was before this
//     stage.
//
// WHERE THE ANSWER COMES FROM. The step store is the authority, read once per
// mount — and then every save issued for the record is heard as it is issued
// (stepStore.ts `onSaveIssued`), so a run that lands and a Clear both reach the
// board in the same tick. Re-reading the disk after a Clear instead would race
// the write that cleared it, and lose.
//
// THE SOURCE IS STABLE PER RECORD: one NotebookSource per stored notebook object,
// because `useScope` deals its cards on the source's identity and a fresh object
// per render would re-deal the board on every render.

import { useCallback, useSyncExternalStore } from "react";

import type { EngineReceipt } from "../../research/run/live";
import { onSaveIssued, readStep, type ResearchNotebookStepData } from "../stepStore";
import { useLoadFor } from "../useLoadFor";
import { fixtureSource, sourceOf, type NotebookSource } from "./source";
import type { Notebook } from "./types";

/** The live notebook's step record (run/live.ts writes it). */
export const LIVE_NOTEBOOK_PHASE = "research-notebook";

/** THE ROLLBACK PIN. `true` deals the replay for every project whatever is saved. */
export const PIN_REPLAY = false;

/** A saved notebook the board can deal — the fields `buildCards` walks. The route
 *  validated it before it was saved (lib/notebook/validate.ts); this only refuses
 *  a record that is not a notebook at all, which would take the board down. */
function dealable(nb: unknown): nb is Notebook {
  if (!nb || typeof nb !== "object") return false;
  const n = nb as Partial<Notebook>;
  return (
    Array.isArray(n.facts) &&
    Array.isArray(n.mechanisms) &&
    Array.isArray(n.reversals) &&
    Array.isArray(n.counterPositions) &&
    !!n.steelMan &&
    typeof n.steelMan === "object"
  );
}

/** WHY a saved notebook is not dealt, or `null`. Only a record that HAS a
 *  notebook can be refused: no record, and the cleared record (`notebook: null`,
 *  what `resetLive` writes), are the replay by design and nobody's trouble. */
export function refusalOf(record: ResearchNotebookStepData | null | undefined, pin: boolean = PIN_REPLAY): string | null {
  if (pin || !record || record.notebook === null || record.notebook === undefined) return null;
  if (!dealable(record.notebook)) return "the saved notebook is not a notebook this app can deal";
  if (!record.engine || typeof record.engine !== "object") return "the saved notebook has no engine receipt";
  return null;
}

const sources = new WeakMap<Notebook, NotebookSource>();

/** The active source for a `research-notebook` record. Pure: the same stored
 *  notebook always gives the same source object. */
export function activeSourceOf(
  record: ResearchNotebookStepData | null | undefined,
  pin: boolean = PIN_REPLAY,
): NotebookSource {
  if (pin || !record?.engine || typeof record.engine !== "object" || !dealable(record.notebook)) return fixtureSource();
  const notebook = record.notebook;
  let src = sources.get(notebook);
  if (!src) {
    const receipt = record.engine as EngineReceipt;
    src = sourceOf(notebook, { kind: receipt.searched === true ? "researched" : "reasoned", receipt });
    sources.set(notebook, src);
  }
  return src;
}

/** The active source as the disk has it now — for a reader with no mount.
 *  `null` when the record could not be read (the trouble is already reported
 *  through the store's channel), which is not the same answer as the replay. */
export async function readActiveNotebook(projectId: string): Promise<NotebookSource | null> {
  const r = await readStep<ResearchNotebookStepData>(projectId, LIVE_NOTEBOOK_PHASE);
  return r.ok ? activeSourceOf(r.data) : null;
}

/* ─────────────────────────── the record, per project ───────────────────────── */

/** What this tab last knew of each project's record: read at mount, then every
 *  save issued for it. `null` is "no notebook" (never run, or cleared). */
const known = new Map<string, ResearchNotebookStepData | null>();
/** Saves issued per project. A mount's read applies only if none was issued
 *  after the read was — otherwise the read returned what that save replaced. */
const issued = new Map<string, number>();
const subs = new Map<string, Set<() => void>>();

function put(projectId: string, record: ResearchNotebookStepData | null) {
  known.set(projectId, record);
  subs.get(projectId)?.forEach((f) => f());
}

onSaveIssued((projectId, phase, data) => {
  if (phase !== LIVE_NOTEBOOK_PHASE) return;
  issued.set(projectId, (issued.get(projectId) ?? 0) + 1);
  put(projectId, (data ?? null) as ResearchNotebookStepData | null);
});

function subscribe(projectId: string, f: () => void) {
  let set = subs.get(projectId);
  if (!set) subs.set(projectId, (set = new Set()));
  set.add(f);
  return () => void set.delete(f);
}

export interface ActiveNotebook {
  source: NotebookSource;
  /** This mount has read the record. Before that `source` is whatever this tab
   *  already knew — the replay, for a project it has not seen. */
  hydrated: boolean;
  /** Why a saved notebook is NOT the one `source` deals (it is the replay), or
   *  `null`. Never silent: the board draws it (research/_parts/ScopeBar.tsx). */
  trouble: string | null;
}

/** The project's active NotebookSource, kept current as runs land and clears
 *  happen. A failed read leaves it un-hydrated (useStepFor's rule). */
export function useActiveNotebook(projectId: string): ActiveNotebook {
  const record = useSyncExternalStore(
    useCallback((f: () => void) => subscribe(projectId, f), [projectId]),
    useCallback(() => known.get(projectId), [projectId]),
    () => undefined,
  );

  const hydrated = useLoadFor(
    `${projectId}:${LIVE_NOTEBOOK_PHASE}`,
    async () => {
      const before = issued.get(projectId) ?? 0;
      return { before, read: await readStep<ResearchNotebookStepData>(projectId, LIVE_NOTEBOOK_PHASE) };
    },
    ({ before, read }) => {
      if (!read.ok) return false;
      if ((issued.get(projectId) ?? 0) === before) put(projectId, read.data ?? null);
    },
  );

  return { source: activeSourceOf(record), hydrated, trouble: refusalOf(record) };
}
