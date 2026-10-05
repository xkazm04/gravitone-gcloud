"use client";

// THE ADS CONCEPT RUNS — round 1 (ideas) and round 2 (scenarios), held ABOVE
// React so a run outlives the step it was started from.
//
// The lifetime argument is research/run/live.ts's, inherited rather than
// rediscovered: a concept round is a model turn of a minute or more, and a
// fetch owned by a component is a fetch abandoned — and BILLED — the moment the
// creator clicks another tab. So the request, its job id and the WRITE of its
// answer all live in this module's closure, keyed by project and round. A
// component that unmounted mid-run finds the answer on disk when it comes back,
// and one still mounted is handed it through `useConceptRun`.
//
// WHAT IS SAVED, AND WHEN. The round's record is written HERE, before the job
// is settled, so the bell and the disk cannot disagree about whether a set of
// options exists. A new set replaces the old one whole and clears the pick: a
// pick names an option of a set that no longer exists.

import { useCallback, useSyncExternalStore } from "react";

import { accessHeader } from "@/lib/imagingClient";
import {
  digestBrief,
  type AdBrief,
  type AdEngine,
  type AdErrorBody,
  type AdIdea,
  type AdIdeasRequest,
  type AdIdeasResponse,
  type AdScenariosRequest,
  type AdScenariosResponse,
  type AdsIdeasData,
  type AdsScenariosData,
} from "@/lib/ads/types";

import { ADS_IDEAS, ADS_SCENARIOS } from "../../_shared/records/ads";
import { patchRecord, type RecordWriteOutcome } from "../../_shared/records/patch";

/** A failed write's own words — the store's trouble or the record's refusal. */
function unsaved(o: Exclude<RecordWriteOutcome, { ok: true }>): string {
  return "trouble" in o ? o.trouble.message : o.detail;
}

export type Round = "ideas" | "scenarios";

/** What the round's route answered when it was not a set of options. */
export interface RunFailure {
  /** The route's `error` code — `needs-brief`, `bad-response`, `no-key`, … */
  error: string;
  /** The route's message, verbatim. */
  message: string;
  /** The validator's findings, when the engine answered with something that is
   *  not a round. */
  findings?: string[];
}

export type RunState<D> =
  | { status: "idle" }
  | { status: "running"; startedAt: number }
  | { status: "done"; data: D; at: number }
  | ({ status: "failed"; at: number } & RunFailure);

type Data = { ideas: AdsIdeasData; scenarios: AdsScenariosData };

const IDLE = { status: "idle" } as const;
const states = new Map<string, RunState<unknown>>();
const subs = new Map<string, Set<() => void>>();

const keyOf = (projectId: string, round: Round) => `${projectId}:${round}`;
const read = (k: string): RunState<unknown> => states.get(k) ?? IDLE;

function write(k: string, next: RunState<unknown>) {
  states.set(k, next);
  subs.get(k)?.forEach((f) => f());
}

function subscribe(k: string, f: () => void) {
  let set = subs.get(k);
  if (!set) subs.set(k, (set = new Set()));
  set.add(f);
  return () => void set.delete(f);
}

/** Whoever started the run hears how it ended — the bell round-trip, frozen at
 *  click time (research/run/live.ts's `Ending`). */
export type Ending = (outcome: "done" | "failed", detail: string) => void;

const ROUTE: Record<Round, string> = { ideas: "/api/ads/ideas", scenarios: "/api/ads/scenarios" };

async function post<R>(round: Round, body: unknown): Promise<{ ok: true; data: R } | { ok: false; failure: RunFailure }> {
  try {
    const res = await fetch(ROUTE[round], {
      method: "POST",
      headers: { "content-type": "application/json", ...accessHeader() },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Partial<AdErrorBody> & { findings?: unknown };
    if (!res.ok)
      return {
        ok: false,
        failure: {
          error: typeof json.error === "string" ? json.error : `http-${res.status}`,
          message:
            typeof json.message === "string" && json.message
              ? json.message
              : `The ${round} round failed with HTTP ${res.status} and said nothing about why.`,
          findings: Array.isArray(json.findings) ? (json.findings as string[]) : undefined,
        },
      };
    return { ok: true, data: json as R };
  } catch {
    return {
      ok: false,
      failure: { error: "offline", message: `The studio could not be reached, so no ${round} were generated.` },
    };
  }
}

/** Start round 1. False if one is already live for this project, so the caller
 *  never opens a job nothing will settle. */
export function startIdeas(projectId: string, req: AdIdeasRequest, onEnd: Ending): boolean {
  const k = keyOf(projectId, "ideas");
  if (read(k).status === "running") return false;
  write(k, { status: "running", startedAt: Date.now() });
  void (async () => {
    const r = await post<AdIdeasResponse>("ideas", req);
    if (!r.ok) {
      write(k, { status: "failed", at: Date.now(), ...r.failure });
      onEnd("failed", r.failure.message);
      return;
    }
    const data: AdsIdeasData = {
      briefDigest: digestBrief(req.brief),
      options: r.data.options,
      pickedId: null,
      engine: r.data.engine,
      savedAt: Date.now(),
    };
    // Written before the ending fires. A fresh set clears the pick.
    const saved = await patchRecord(ADS_IDEAS, projectId, (cur) => ({ ...cur, ...data }));
    if (!saved.ok) {
      const message = `The ideas arrived and could not be saved: ${unsaved(saved)}`;
      write(k, { status: "failed", at: Date.now(), error: "not-saved", message });
      onEnd("failed", message);
      return;
    }
    write(k, { status: "done", data, at: data.savedAt! });
    onEnd("done", `${data.options.length} ideas`);
  })();
  return true;
}

/** Start round 2 for the picked idea. */
export function startScenarios(projectId: string, req: AdScenariosRequest, onEnd: Ending): boolean {
  const k = keyOf(projectId, "scenarios");
  if (read(k).status === "running") return false;
  write(k, { status: "running", startedAt: Date.now() });
  void (async () => {
    const r = await post<AdScenariosResponse>("scenarios", req);
    if (!r.ok) {
      write(k, { status: "failed", at: Date.now(), ...r.failure });
      onEnd("failed", r.failure.message);
      return;
    }
    const data: AdsScenariosData = {
      ideaId: req.idea.id,
      options: r.data.options,
      pickedId: null,
      engine: r.data.engine,
      savedAt: Date.now(),
    };
    const saved = await patchRecord(ADS_SCENARIOS, projectId, (cur) => ({ ...cur, ...data }));
    if (!saved.ok) {
      const message = `The scenarios arrived and could not be saved: ${unsaved(saved)}`;
      write(k, { status: "failed", at: Date.now(), error: "not-saved", message });
      onEnd("failed", message);
      return;
    }
    write(k, { status: "done", data, at: data.savedAt! });
    onEnd("done", `${data.options.length} scenarios`);
  })();
  return true;
}

/** Forget a finished or failed run for this project (both rounds). A RUNNING
 *  one is left alone: its answer is being paid for and lands on disk. The ads
 *  discipline has no Clear today; this is the reset one would call — see
 *  tests/golden-path/step-clear-completeness.probe.spec.ts. */
export function resetConceptRuns(projectId: string) {
  for (const round of ["ideas", "scenarios"] as const) {
    const k = keyOf(projectId, round);
    if (read(k).status !== "running") write(k, IDLE);
  }
}

export function useConceptRun<R extends Round>(projectId: string, round: R): RunState<Data[R]> {
  const k = keyOf(projectId, round);
  return useSyncExternalStore(
    useCallback((f: () => void) => subscribe(k, f), [k]),
    useCallback(() => read(k), [k]),
    () => IDLE,
  ) as RunState<Data[R]>;
}

/**
 * The record to SHOW: what the hook read off disk, or a run that landed after
 * it. `useRecord` hydrates once per project, so a set written by a run while
 * the step was mounted reaches the screen through the store; once the creator
 * acts on it (a pick), the record on screen is newer again and wins.
 */
export function newest<D extends { savedAt?: number }>(saved: D | null, run: RunState<D>): D | null {
  if (run.status !== "done") return saved;
  if (!saved || (saved.savedAt ?? 0) < run.at) return run.data;
  return saved;
}

/* ── the pick ─────────────────────────────────────────────────────────────── */

/** The one gate Script's explainer path reads (`research.researched`) is written
 *  by `pickIdea` in ./pick.ts; it lives there so a Node probe can drive it
 *  without React. */

/* ── the pre-flight ───────────────────────────────────────────────────────── */

/** GET /api/ads/<round>: who would serve, before the button is pressed. */
export interface Preflight {
  serving: string | null;
  candidates: { provider: string; ok: boolean; detail: string }[];
}

const preflights = new Map<Round, Promise<Preflight | null>>();

/** Memoised per page load — it probes a local binary, and every remount would
 *  re-ask. `null` on any failure: the surface says "engine unknown", never a
 *  guess. */
export function preflight(round: Round): Promise<Preflight | null> {
  let p = preflights.get(round);
  if (!p) {
    p = fetch(ROUTE[round], { headers: accessHeader() })
      .then((r) => (r.ok ? (r.json() as Promise<Preflight>) : null))
      .catch(() => null);
    preflights.set(round, p);
  }
  return p;
}

/* ── words for the receipt ────────────────────────────────────────────────── */

/** `$0.0123`, or `unpriced` — an unpriced turn is unpriced, never free. */
export function costWords(e: Pick<AdEngine, "costUsd" | "costBasis">): string {
  if (e.costUsd === null || e.costBasis === "unpriced") return "unpriced";
  const n = e.costUsd < 0.01 ? e.costUsd.toFixed(4) : e.costUsd.toFixed(2);
  return `$${n}${e.costBasis === "estimated" ? " est." : ""}`;
}

/** The brief fields a round cannot start without, by name — the message the
 *  disabled button stands beside. */
export function missingFields(b: AdBrief): string[] {
  return (["product", "proposition", "cta"] as const).filter((k) => !b[k].trim());
}

/** The idea a picked id names, or null. */
export const pickedIdea = (d: AdsIdeasData | null): AdIdea | null =>
  d?.options.find((o) => o.id === d.pickedId) ?? null;
