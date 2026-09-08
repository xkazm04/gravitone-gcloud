"use client";

// THE REAL RUN — the second path beside the simulated one, and never a
// replacement for it.
//
// `useResearchRun.ts` next door drives a scripted 41-second trace to one of
// three endings and hands back the saved 2026-08-11 Bitcoin notebook. It is what
// the operator demos with, it is the only path that works with no engine
// configured at all, and it stays the default. This module is the other thing:
// the creator's own topic, over the wire to /api/research, back as a notebook
// that satisfies NOTEBOOK-SCHEMA or as a refusal that says why.
//
// ── THE LIFETIME ARGUMENT, INHERITED RATHER THAN REDISCOVERED ───────────────
//
// The store lives ABOVE REACT, in a module-scope registry keyed by project, for
// the reason `useResearchRun.ts` sets out at length: research is minutes, the
// step's standing promise is that "navigating away, even to another project,
// does not cancel it", and a clock held in a component effect does not outlive
// the click. Here the stakes are higher than there, because there the run was
// mocked and here it is money: a fetch owned by a component is a fetch that is
// abandoned — and BILLED — the moment the creator clicks another tab.
//
// It is a SEPARATE store rather than a branch inside the simulated engine, and
// that is deliberate. That engine is the control: every UAT run, every harness
// script and four live specs drive it, and the one thing this change must not do
// is make "is the simulated path still exactly what it was" a question anybody
// has to answer by reading a diff. Two stores, one per path, and the hook that
// composes them (guided/useEducationalResearch.ts) is where they meet.
//
// ── WHAT IS NOT HERE, ON PURPOSE ───────────────────────────────────────────
//
// No re-running onto a history, no editing, no comparing two notebooks. One live
// notebook per project, replaced by the next run. The path is: a topic reaches
// the engine, a valid notebook comes back, it is saved with its receipt, and it
// is labelled as what it is. Everything past that is a surface nobody has
// designed yet.

import { useCallback, useSyncExternalStore } from "react";

import { accessHeader } from "@/lib/imagingClient";
import type { Notebook } from "../../_shared/notebook/types";
import { saveStep, type ResearchNotebookStepData } from "../../_shared/stepStore";

/* ──────────────────────────────── the receipt ────────────────────────────── */

/**
 * What the run cost and who did it — the `engine` block /api/research returns.
 *
 * Structurally the same receipt /api/recalibrate hands `useVersions`, plus one
 * field neither of the other two reasoning routes has: `searched`. It is `false`
 * on every run this engine can make today, and it is on the RECEIPT rather than
 * in a comment because the receipt is what gets saved — a notebook read back in
 * six months still says that nothing in it was looked up.
 */
export interface EngineReceipt {
  kind: "local-claude-code" | "cloud-api";
  provider: string;
  model: string;
  rung: string;
  transport: string;
  schemaEnforcement: string;
  sessionId?: string;
  /** USD for the turn. `undefined` means UNPRICED, never free. */
  costUsd?: number;
  costBasis: "vendor-reported" | "estimated" | "unpriced";
  durationMs: number;
  promptChars: number;
  /** Did the engine have web search? No, on both rungs — see the route header. */
  searched: boolean;
}

/* ───────────────────────────────── the state ─────────────────────────────── */

export type LiveState =
  | { status: "idle" }
  | { status: "running"; topic: string; startedAt: number }
  | { status: "done"; topic: string; notebook: Notebook; engine: EngineReceipt; at: number }
  /** The run reached a conclusion nobody wants: no engine, a refusal, or an
   *  answer that is not a notebook. `findings` is populated only for the last of
   *  those — the schema report, which is long and is the whole diagnosis. */
  | { status: "failed"; topic: string; detail: string; code?: string; findings?: string[] };

const IDLE: LiveState = { status: "idle" };

const states = new Map<string, LiveState>();
const subs = new Map<string, Set<() => void>>();
/** The in-flight request per project. Held here for the same reason the state is:
 *  Abort has to still work after the creator has left the step and come back. */
const flights = new Map<string, AbortController>();
/** THE JOB THIS RUN IS REPORTING TO, held where the request is.
 *
 *  The same lesson `Run.jobId` records next door, and it cost a real bug there:
 *  a job id kept in component state is one lifetime too short, so Abort after
 *  leaving and returning aborted the work and then found no job to cancel — and
 *  the job sat `running` in the bell for ever. Cleared when the run lands, and
 *  handed back by `stopLive` so the caller can close it. */
const jobIds = new Map<string, string>();

const read = (projectId: string): LiveState => states.get(projectId) ?? IDLE;

function write(projectId: string, next: LiveState) {
  states.set(projectId, next);
  subs.get(projectId)?.forEach((f) => f());
}

function subscribe(projectId: string, f: () => void) {
  let set = subs.get(projectId);
  if (!set) {
    set = new Set();
    subs.set(projectId, set);
  }
  set.add(f);
  return () => void set!.delete(f);
}

/** Adopt a notebook read back off disk. Used by hydration, and refused while a
 *  run is live for the same reason the simulated engine's `load` is: adopting a
 *  saved result over a run in flight throws away work that is being paid for.
 *
 *  `notebook: null` is the CLEARED record and is not adopted — the creator threw
 *  a notebook away here, and putting it back on the next mount would undo their
 *  clear silently. */
export function adoptSaved(projectId: string, saved: ResearchNotebookStepData | undefined) {
  if (!saved?.notebook || !saved.engine) return;
  if (read(projectId).status === "running") return;
  write(projectId, {
    status: "done",
    topic: saved.topic,
    notebook: saved.notebook as Notebook,
    engine: saved.engine as EngineReceipt,
    at: saved.savedAt ?? 0,
  });
}

/* ─────────────────────────────── the pre-flight ──────────────────────────── */

/**
 * What GET /api/research answers: who would serve, and what this app knows about
 * their price.
 *
 * `serving: null` is the whole point of asking — a creator must not press a
 * spend button that cannot work, and `candidates[].detail` carries the reason in
 * lib/text/errors.ts's own words (no key, not installed, not logged in, policy,
 * managed platform), which are five different remedies a shared 503 cannot tell
 * apart after the fact.
 */
export interface Preflight {
  env: string;
  serving: string | null;
  candidates: { provider: string; ok: boolean; detail: string }[];
  prices: {
    provider: string;
    model: string;
    usdPerMInput?: number;
    usdPerMOutput?: number;
    source: string;
    checked: string;
  }[];
  searched: boolean;
  /** The route's own topic budget. Read rather than restated so the field and
   *  the check cannot disagree — see /api/research's note on MAX_TOPIC_CHARS. */
  maxTopicChars: number;
}

/** MEMOISED FOR THE PAGE LOAD, the way `perImagePrice()` and `perSecondPrice()`
 *  are for the other two spend surfaces. The answer probes a local binary; both
 *  faces of this step and every remount would otherwise re-ask it. `null` on any
 *  failure — the client renders "engine unknown", never a guess. */
let preflightOnce: Promise<Preflight | null> | null = null;

export function preflight(): Promise<Preflight | null> {
  preflightOnce ??= fetch("/api/research", { headers: accessHeader() })
    .then((r) => (r.ok ? (r.json() as Promise<Preflight>) : null))
    .catch(() => null);
  return preflightOnce;
}

/* ─────────────────────────────── the run itself ──────────────────────────── */

/** What a landing tells whoever started it — the bell round-trip, frozen at
 *  click time exactly as the simulated engine freezes its own ending. */
type Ending = (final: LiveState) => void;

/**
 * Start a real run for this project. Returns false if one is already live here,
 * so the caller never opens a job nothing will settle.
 *
 * SAVING HAPPENS HERE, not in a component effect, and that is the difference
 * between a notebook that survives and one that does not: the run outlives the
 * mount, so the only place guaranteed to be alive when the answer lands is this
 * closure. A component that unmounted at second 90 of a 200-second run would
 * otherwise have paid for a notebook and written nothing to disk.
 */
export function startLive(projectId: string, topic: string, jobId: string, onEnd: Ending): boolean {
  if (read(projectId).status === "running") return false;

  const ac = new AbortController();
  flights.set(projectId, ac);
  jobIds.set(projectId, jobId);
  write(projectId, { status: "running", topic, startedAt: Date.now() });

  const land = (next: LiveState) => {
    if (flights.get(projectId) === ac) flights.delete(projectId);
    jobIds.delete(projectId);
    write(projectId, next);
    onEnd(next);
  };

  void (async () => {
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json", ...accessHeader() },
        body: JSON.stringify({ topic }),
        signal: ac.signal,
      });
      const json = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (!res.ok) {
        land({
          status: "failed",
          topic,
          detail:
            typeof json.detail === "string" && json.detail
              ? json.detail
              : "The research run failed and said nothing about why.",
          code: typeof json.code === "string" ? json.code : undefined,
          findings: Array.isArray(json.findings) ? (json.findings as string[]) : undefined,
        });
        return;
      }
      const notebook = json.notebook as Notebook;
      const engine = json.engine as EngineReceipt;
      const at = Date.now();
      // Written before the ending fires, so the bell and the disk cannot
      // disagree about whether a notebook exists.
      void saveStep<ResearchNotebookStepData>(projectId, "research-notebook", {
        topic,
        notebook,
        engine,
        savedAt: at,
      });
      land({ status: "done", topic, notebook, engine, at });
    } catch (e) {
      // An abort is not a failure: whoever aborted is standing right there and
      // has already settled the job. Leaving the state alone is correct — `stop`
      // below wrote the ending it wanted.
      if (ac.signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      land({
        status: "failed",
        topic,
        detail: "The studio could not be reached, so nothing was researched.",
        code: "offline",
      });
    }
  })();

  return true;
}

/** Pull the run, and hand back the job it was reporting to.
 *
 *  Fires NO ending, by design and by the same rule the simulated engine's `stop`
 *  follows: the caller owns the job and is about to cancel it, and firing an
 *  ending too would race its own `cancel`. The id is RETURNED rather than
 *  cancelled here so that this module stays free of the jobs provider — it is a
 *  store, and a store that reached into React's context could not be called from
 *  the fetch closure that needs it. */
export function stopLive(projectId: string): string | undefined {
  const ac = flights.get(projectId);
  const job = jobIds.get(projectId);
  jobIds.delete(projectId);
  if (!ac) return job;
  flights.delete(projectId);
  ac.abort();
  write(projectId, { status: "idle" });
  return job;
}

/** Discard the live notebook — the Clear path. The saved record goes with it,
 *  because a cleared step that leaves a notebook on disk re-adopts it on the
 *  next mount and the creator's clear silently undoes itself. */
export function resetLive(projectId: string) {
  stopLive(projectId);
  write(projectId, { status: "idle" });
  // An EMPTY RECORD, not an absent one. `saveStep` spreads what it is given, so
  // writing `null` would store `{savedAt}` and leave the next reader guessing;
  // and a key that is merely never written is "this project has never run" —
  // a different fact from "the creator cleared what was here".
  void saveStep<ResearchNotebookStepData>(projectId, "research-notebook", {
    topic: "",
    notebook: null,
    engine: null,
  });
}

/** One live run per project — the same rule the simulated engine keeps, and for
 *  the same reason: different topics are independent. */
export function useLiveResearch(projectId: string) {
  const state = useSyncExternalStore(
    useCallback((f: () => void) => subscribe(projectId, f), [projectId]),
    useCallback(() => read(projectId), [projectId]),
    () => IDLE,
  );

  return {
    state,
    start: useCallback(
      (topic: string, jobId: string, onEnd: Ending) => startLive(projectId, topic, jobId, onEnd),
      [projectId],
    ),
    stop: useCallback((): string | undefined => stopLive(projectId), [projectId]),
    reset: useCallback(() => resetLive(projectId), [projectId]),
  };
}

/* ────────────────────────────── what to say about it ─────────────────────── */

/**
 * The pre-flight sentence that stands beside the button — text, a tone, and the
 * long form in a `title`.
 *
 * THE MANNER IS THE HOUSE MANNER, matched deliberately rather than invented:
 * `app/library/Playground.tsx::priceLabel` and `lib/musicClient.ts::costLabel`
 * both return exactly this shape, both render it as a plain span beside the
 * action (never a modal), both go amber when the price is not known and white/40
 * when it is, and both put the explanation in the native tooltip. A creator who
 * has learned what that grey line means under an image render should not have to
 * learn a second dialect here.
 *
 * AND THE HOUSE RULE, WHICH IS THE HARD ONE: never invent a price, and never
 * render an unknown one as a numeral. Every text model this app can currently
 * reach is UNPRICED in lib/text/pricing.ts, each row saying why in its own words
 * — the local CLI reports `total_cost_usd` in its own envelope AFTER the run and
 * needs no rate, and nobody on this tree has read Google's published per-token
 * price for the models actually in service. So the honest pre-click sentence
 * today is not a figure; it is which engine will bill and the fact that the
 * figure arrives with the notebook. The moment a rate lands in that table this
 * function starts saying so, with no other change.
 */
export interface SpendNote {
  text: string;
  title: string;
  tone: "quiet" | "warn";
}

export function spendNote(pf: Preflight | null | undefined): SpendNote {
  if (pf === undefined) return { text: "checking the engine…", title: "", tone: "quiet" };
  if (pf === null)
    return {
      text: "engine unknown",
      title:
        "The studio could not be asked which engine would serve this run, so neither its availability " +
        "nor its cost is known in advance. Whatever it costs is reported on the notebook afterwards.",
      tone: "warn",
    };
  if (!pf.serving)
    return {
      text: "no engine configured here",
      title:
        // The taxonomy's own sentences, verbatim. Each names its own remedy —
        // install it, log in, set a key, lift the policy flag, use a cloud
        // provider — and collapsing five remedies into one line is the exact
        // conflation lib/text/errors.ts was written to end.
        pf.candidates.map((c) => `${c.provider}: ${c.detail}`).join("\n\n") ||
        "No provider is planned for a research turn in this environment.",
      tone: "warn",
    };

  const rows = pf.prices.filter((p) => p.provider === pf.serving);
  const priced = rows.filter((r) => r.usdPerMInput !== undefined && r.usdPerMOutput !== undefined);
  const why = (rows[0]?.source ?? "").trim();

  if (!priced.length)
    return {
      text: `bills ${pf.serving} · price not declared in advance`,
      title:
        `${why}\n\n` +
        `An unpriced call is unpriced, not free. What this run actually cost is reported on the ` +
        `notebook when it lands, from the engine's own receipt.`,
      tone: "quiet",
    };

  // A rate exists, so say what it is — per million tokens, which is the unit the
  // table holds. NOT converted into a per-run dollar figure: that needs a token
  // count nobody has for a turn that has not happened, and multiplying a guess
  // by a real rate produces a number that looks measured.
  const dearest = priced.reduce((a, b) => ((b.usdPerMInput ?? 0) > (a.usdPerMInput ?? 0) ? b : a));
  return {
    text: `bills ${pf.serving} · $${dearest.usdPerMInput}/M in, $${dearest.usdPerMOutput}/M out`,
    title:
      `${dearest.source} (checked ${dearest.checked})\n\n` +
      `Per-token rates, not a per-run total: how many tokens a notebook takes is not known until ` +
      `it is written. The run's actual cost is reported on the notebook when it lands.`,
    tone: "quiet",
  };
}
