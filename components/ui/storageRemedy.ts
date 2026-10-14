"use client";

// STORAGE TROUBLE AS A REMEDY, NOT A REPORT.
//
// stepStore classifies a failure and its own header says what each kind calls
// for: "`quota` means stop and export, `blocked` means close the other tab". The
// bell, the one surface that reports it, offered neither verb — only `dismiss`,
// which called clearStorageTrouble() and so erased the fact that saving had
// stopped. This module is the two pure halves of the fix and the one store that
// joins them to stepStore:
//
//   remedyFor       kind -> at most one verb that lands at the fix, plus the
//                   measured quota as a fact (never a guessed one)
//   troubleReducer  report / dismiss / ok over clear | active | deferred, keeping
//                   EVERY step at risk (stepStore's slot holds only the last) and
//                   resolving a step on evidence — a successful operation of the
//                   same op on the same project and step — instead of on a click
//   useTroubleLedger the reducer, fed from stepStore and held at module level so a
//                   route change that remounts the bell neither forgets which
//                   steps are at risk nor un-defers a card the user put away
//
// Dismiss is DEFERRAL: the badge goes quiet, the row stays, because "nothing more
// will be saved" is still true. Only a `non-storage` trouble is resolved by a
// dismiss — nothing was being written, so nothing stays at risk.

import { useSyncExternalStore } from "react";

import {
  lastStorageTrouble,
  onStorageOk,
  onStorageTrouble,
  type StorageFailure,
  type StorageTrouble,
} from "@/lib/steps";
import { studioHref } from "@/lib/jobLinks";
import { PHASES, type PhaseKey } from "@/lib/projects";

/* ─────────────────────────────── the remedy ─────────────────────────────── */

export type RemedyAction =
  | { kind: "archive"; uid: string } // pack the shelf into a .gravitone file
  | { kind: "reload" } // the other tab is closed, or the store needs re-opening
  | { kind: "open"; href: string }; // the step a background task failed in

export interface StorageFact {
  used: number;
  of: number;
  unit: "MB" | "GB";
}

export interface Remedy {
  actions: RemedyAction[];
  fact: StorageFact | null;
}

export interface RemedyContext {
  uid?: string | null;
  /** `navigator.storage.estimate()`'s answer, when it gave one. */
  estimate?: { usage?: number; quota?: number } | null;
}

const isPhase = (p: string | undefined): p is PhaseKey => !!p && (PHASES as readonly string[]).includes(p);

/** Bytes as the unit a person reads a disk in. Decimal, as browsers report it. */
function factOf(estimate: RemedyContext["estimate"]): StorageFact | null {
  const usage = estimate?.usage;
  const quota = estimate?.quota;
  if (typeof usage !== "number" || typeof quota !== "number" || !(quota > 0)) return null;
  const gb = quota >= 1e10;
  const scale = gb ? 1e9 : 1e6;
  return { used: Math.round(usage / scale), of: Math.round(quota / scale), unit: gb ? "GB" : "MB" };
}

/**
 * The one verb per kind, and the number that makes `quota` a fact.
 *
 *   quota          -> archive (needs a uid: no account, no shelf to pack)
 *   blocked        -> reload  (after the other tab is closed)
 *   missing-store  -> reload
 *   unavailable    -> nothing: this session stored nothing, an archive is empty
 *   failed         -> nothing: the cause is unknown, so no verb is honest
 *   non-storage    -> open the studio step it failed in, when there is one
 */
export function remedyFor(
  trouble: Pick<StorageTrouble, "kind"> & Partial<Pick<StorageTrouble, "op" | "projectId" | "phase">>,
  ctx: RemedyContext = {},
): Remedy {
  const kind: StorageFailure = trouble.kind;
  switch (kind) {
    case "quota":
      return { actions: ctx.uid ? [{ kind: "archive", uid: ctx.uid }] : [], fact: factOf(ctx.estimate) };
    case "blocked":
    case "missing-store":
      return { actions: [{ kind: "reload" }], fact: null };
    case "non-storage":
      return {
        actions:
          trouble.projectId && trouble.projectId !== "app" && isPhase(trouble.phase)
            ? [{ kind: "open", href: studioHref(trouble.projectId, trouble.phase) }]
            : [],
        fact: null,
      };
    case "unavailable":
    case "failed":
      return { actions: [], fact: null };
  }
}

/* ─────────────────────────────── the ledger ─────────────────────────────── */

/** One place work is at risk: what failed there, and how. */
export interface TroubleScope {
  op: "read" | "write";
  projectId: string;
  phase: string;
  kind: StorageFailure;
  /** The newest trouble raised here — what the card shows if this is the
   *  scope left standing after the newer ones recover. */
  trouble: StorageTrouble;
}

export interface TroubleState {
  status: "clear" | "active" | "deferred";
  /** The most recent trouble — the card's heading and its kind's sentence. */
  trouble: StorageTrouble | null;
  scopes: TroubleScope[];
  /** Distinct steps at risk, in the order they first failed. */
  phases: string[];
  /** Set only by the transition that cleared the card; the announcer keys on it. */
  announce: { key: string; text: string } | null;
}

export type TroubleEvent =
  | { type: "report"; trouble: StorageTrouble }
  | { type: "dismiss" }
  | { type: "ok"; op: "read" | "write"; projectId: string; phase: string };

export const CLEAR_TROUBLE: TroubleState = { status: "clear", trouble: null, scopes: [], phases: [], announce: null };

const sameScope = (a: { op: string; projectId: string; phase: string }, b: typeof a) =>
  a.op === b.op && a.projectId === b.projectId && a.phase === b.phase;

const phasesOf = (scopes: TroubleScope[]) => [...new Set(scopes.map((s) => s.phase))];

/** What the card shows once some scopes are gone: the newest trouble still standing. */
const standing = (scopes: TroubleScope[]) => ({
  scopes,
  phases: phasesOf(scopes),
  trouble: scopes.reduce((a, b) => (b.trouble.at >= a.trouble.at ? b : a)).trouble,
});

/** What the bell's badge owes this state: one, only while the card is news. */
export const troubleBadge = (s: TroubleState): 0 | 1 => (s.status === "active" ? 1 : 0);

/**
 * Pure. A no-op returns `s` ITSELF — the store and the tests both read "nothing
 * changed, nothing to announce" off reference equality, and `ok` runs on every
 * keystroke's write.
 */
export function troubleReducer(s: TroubleState, e: TroubleEvent): TroubleState {
  switch (e.type) {
    case "report": {
      const t = e.trouble;
      if (s.trouble === t) return s;
      const scope: TroubleScope = { op: t.op, projectId: t.projectId, phase: t.phase, kind: t.kind, trouble: t };
      // Report order: a step that fails again keeps its place.
      const scopes = s.scopes.some((x) => sameScope(x, scope))
        ? s.scopes.map((x) => (sameScope(x, scope) ? scope : x))
        : [...s.scopes, scope];
      // Deferred stays deferred for the same news; a different kind is news.
      const status = s.status === "deferred" && s.trouble?.kind === t.kind ? "deferred" : "active";
      return { status, trouble: t, scopes, phases: phasesOf(scopes), announce: null };
    }
    case "dismiss": {
      if (s.status !== "active") return s;
      // A failed task left nothing at risk; a storage failure still has.
      const scopes = s.scopes.filter((x) => x.kind !== "non-storage");
      if (!scopes.length) return CLEAR_TROUBLE;
      return { ...s, status: "deferred", ...standing(scopes), announce: null };
    }
    case "ok": {
      if (s.status === "clear") return s;
      const scopes = s.scopes.filter((x) => x.kind === "non-storage" || !sameScope(x, e));
      if (scopes.length === s.scopes.length) return s;
      if (scopes.length) return { ...s, ...standing(scopes), announce: null };
      const at = s.trouble?.at ?? 0;
      return {
        ...CLEAR_TROUBLE,
        announce: { key: `trouble-cleared:${at}`, text: e.op === "write" ? "Saving again." : "Loading again." },
      };
    }
  }
}

/* ──────────────────────── the store the bell mounts ─────────────────────── */

let ledger: TroubleState = CLEAR_TROUBLE;
const subscribers = new Set<() => void>();
let wired = false;

function dispatch(e: TroubleEvent): void {
  const next = troubleReducer(ledger, e);
  if (next === ledger) return;
  ledger = next;
  subscribers.forEach((f) => f());
}

/** Wired once, on first subscribe, and never unwired: the ledger outlives any one
 *  bell, which is the point of holding it here. */
function wire(): void {
  if (wired) return;
  wired = true;
  const seed = lastStorageTrouble();
  if (seed) dispatch({ type: "report", trouble: seed });
  onStorageTrouble(() => {
    const t = lastStorageTrouble();
    if (t) dispatch({ type: "report", trouble: t });
  });
  onStorageOk((op, projectId, phase) => dispatch({ type: "ok", op, projectId, phase }));
}

function subscribe(f: () => void): () => void {
  wire();
  subscribers.add(f);
  return () => void subscribers.delete(f);
}

const snapshot = () => ledger;
const serverSnapshot = () => CLEAR_TROUBLE;

/** The bell's view of storage trouble: every step at risk, deferred or not. */
export function useTroubleLedger(): TroubleState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** The card's dismiss: the badge goes quiet, the row stays until a save lands. */
export function deferTrouble(): void {
  dispatch({ type: "dismiss" });
}
