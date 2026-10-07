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
//
// ── A WATCHER, NOT A REQUEST (AIO-A stage 4b, 2026-10-07) ───────────────────
//
// The run is a TURN the server owns (lib/turns/kinds/research.ts). `startLive`
// asks /api/research through the one client door, which answers 202 with a
// turn id as soon as the ledger has the record; from there this store only
// WATCHES the turn and lands what it settles to. A reload, or leaving the
// step, drops the watcher and not the run, and the next mount asks the ledger
// (`resumeLive`) and lands a settled turn it has not taken.
//
// THE NOTEBOOK IS WRITTEN ONCE PER TURN ID. The id this project last took is
// kept here and on the `research-notebook` record itself (`turn`), so the
// landing a watcher makes, the one a later mount makes and the one a reload
// makes are one landing — and a Clear writes the id it saw, so a turn that was
// already taken can never put a cleared notebook back.

import { useCallback, useSyncExternalStore } from "react";

import type { SourceReceipt } from "@/lib/text/types";
import {
  cancelTurn,
  getTurn,
  isLiveTurn,
  researchPreflight,
  resumeTurn,
  startResearch,
  type TurnRecord,
  type TurnSummary,
} from "@/lib/turns/client";
import type { Notebook } from "../../_shared/notebook/types";
import { onSaveIssued, saveStep, type ResearchNotebookStepData } from "../../_shared/stepStore";

/** The turn kind the real run is (lib/turns/kinds/research.ts), which is also
 *  its job kind in the bell. */
export const LIVE_KIND = "research";
/** The record a landed notebook is written to. */
const PHASE = "research-notebook";

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
  /** Did the engine fetch anything? `false` on every reasoned run. On the
   *  retrieval rung (TEXT_RETRIEVE, research-run-engine-B) it is DERIVED by the
   *  route from `sources` — `sources.length > 0` — never set by hand. */
  searched: boolean;
  /** Retrieval runs only: one receipt per page the engine fetched. Absent on a
   *  reasoned run, which fetched nothing and has nothing to show. */
  sources?: SourceReceipt[];
  /** Retrieval runs only: one line per fact the cross-check downgraded
   *  ("cited, not fetched"). */
  crossCheck?: string[];
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
/** The turn this store is watching per project, with the timer of its next
 *  look. Held here for the same reason the state is: Stop has to still work
 *  after the creator has left the step and come back. */
type Watch = { turnId: string; topic: string; timer?: ReturnType<typeof setTimeout> };
const watching = new Map<string, Watch>();
/** The last turn per project whose answer was taken — landed, or found to have
 *  nothing to land. Mirrored on the record as `turn`; see the header. */
const consumed = new Map<string, string>();
/** What this tab last knew of each project's `research-notebook` record — read
 *  at hydration, then every save issued for it. A failed turn's id is merged
 *  into it rather than written over it. */
const records = new Map<string, ResearchNotebookStepData>();

onSaveIssued((projectId, phase, data) => {
  if (phase === PHASE && data && typeof data === "object") records.set(projectId, data as ResearchNotebookStepData);
});

/** How often a watched turn is asked about. The jobs provider polls the
 *  project's list for the bell; this reads the single record, because only it
 *  carries the notebook. */
const LOOK_MS = 1500;

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

/** What a hydrated record says about this project: the last turn it took, and
 *  the record itself. Never over what this tab already knows, which is newer. */
function seed(projectId: string, saved: ResearchNotebookStepData | undefined) {
  if (!saved) return;
  if (saved.turn && !consumed.has(projectId)) consumed.set(projectId, saved.turn);
  if (!records.has(projectId)) records.set(projectId, saved);
}

/** Adopt a notebook read back off disk. Used by hydration, and refused while a
 *  run is live for the same reason the simulated engine's `load` is: adopting a
 *  saved result over a run in flight throws away work that is being paid for.
 *
 *  `notebook: null` is the CLEARED record and is not adopted — the creator threw
 *  a notebook away here, and putting it back on the next mount would undo their
 *  clear silently. */
export function adoptSaved(projectId: string, saved: ResearchNotebookStepData | undefined) {
  seed(projectId, saved);
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
  // GATED (the route's GET discloses key-and-posture state), so it is asked
  // through the one client door, which carries the access header.
  preflightOnce ??= researchPreflight().then((p) => (p ?? null) as Preflight | null);
  return preflightOnce;
}

/* ─────────────────────────────── the run itself ──────────────────────────── */

const msOf = (iso: string | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : Date.now();
};

/** Stop looking at this project's turn. The turn itself is untouched. */
function unwatch(projectId: string) {
  const w = watching.get(projectId);
  if (w?.timer) clearTimeout(w.timer);
  watching.delete(projectId);
}

/** Watch a live turn until it settles, then land it. A turn already watched is
 *  not watched twice. */
function watch(projectId: string, turnId: string, topic: string, startedAt: number) {
  if (watching.get(projectId)?.turnId === turnId) return;
  unwatch(projectId);
  const w: Watch = { turnId, topic };
  watching.set(projectId, w);
  write(projectId, { status: "running", topic, startedAt });

  const look = () => {
    w.timer = setTimeout(() => {
      // A hidden tab does not ask; it asks again on the next look.
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return look();
      void getTurn(turnId)
        .then((rec) => {
          if (watching.get(projectId) !== w) return; // stopped, cleared or replaced
          if (!rec) {
            unwatch(projectId);
            write(projectId, {
              status: "failed",
              topic,
              detail: "The studio no longer has a record of this run, so its notebook cannot be read.",
              code: "orphaned",
            });
            return;
          }
          if (isLiveTurn(rec.status)) return look();
          landLive(projectId, rec);
        })
        .catch(() => {
          // Offline for a moment is not an ending: the turn runs on the server.
          if (watching.get(projectId) === w) look();
        });
    }, LOOK_MS);
  };
  look();
}

/**
 * Take a settled turn onto the board — AT MOST ONCE PER TURN ID.
 *
 * SAVING HAPPENS HERE, not in a component effect: the watcher outlives the
 * mount, and a mount that lands a turn the watcher never saw (a reload) comes
 * through here too. The consumed id is checked and set in one synchronous
 * block, so two pick-ups of one turn cannot both write.
 */
export function landLive(projectId: string, rec: TurnRecord) {
  const w = watching.get(projectId);
  const topicSeen = w?.turnId === rec.id ? w.topic : "";
  if (w?.turnId === rec.id) unwatch(projectId);
  // Already taken: the first pick-up wrote the record and the state.
  if (consumed.get(projectId) === rec.id) return;
  consumed.set(projectId, rec.id);

  if (rec.status === "done") {
    const result = (rec.result ?? {}) as { notebook?: Notebook; engine?: EngineReceipt };
    const notebook = result.notebook as Notebook;
    const engine = result.engine as EngineReceipt;
    // parseNotebook re-stamped the topic, so the notebook is the authority on
    // what was asked.
    const topic = notebook?.topic ?? topicSeen;
    const at = Date.now();
    // Written before the state changes, so the board and the disk cannot
    // disagree about whether a notebook exists.
    void saveStep<ResearchNotebookStepData>(projectId, PHASE, { topic, notebook, engine, turn: rec.id, savedAt: at });
    write(projectId, { status: "done", topic, notebook, engine, at });
    return;
  }

  // Nothing to write but the fact that this turn was taken — merged into the
  // record this tab knows, so the notebook already on it stays exactly as it
  // was. With no record at all there is nothing to merge into, and a reload
  // shows this failure once more, which is still the truth about the last run.
  const known = records.get(projectId);
  if (known) void saveStep<ResearchNotebookStepData>(projectId, PHASE, { ...known, turn: rec.id });
  if (rec.status === "cancelled") {
    write(projectId, { status: "idle" });
    return;
  }
  write(projectId, {
    status: "failed",
    topic: topicSeen,
    detail:
      rec.error?.message ||
      (rec.status === "orphaned"
        ? "The server stopped before this run finished, so nothing was researched."
        : "The research run failed and said nothing about why."),
    code: rec.error?.kind ?? (rec.status === "orphaned" ? "orphaned" : undefined),
    findings: rec.error?.findings?.length ? rec.error.findings : undefined,
  });
}

/**
 * Start a real run for this project. Resolves to the turn id the caller should
 * track in the jobs provider — the new run's or, when another tab or device
 * already holds this project's slot, THAT run's, which is watched instead of
 * starting a second one. `null` when nothing runs: one was already live here,
 * or the route refused (the reason is on the store's `failed` state).
 */
export async function startLive(projectId: string, topic: string): Promise<string | null> {
  if (read(projectId).status === "running") return null;
  // Locked from the click, before the 202: no turn id exists yet, and a second
  // click must already lose.
  const startedAt = Date.now();
  const pending: LiveState = { status: "running", topic, startedAt };
  write(projectId, pending);

  let out: Awaited<ReturnType<typeof startResearch>>;
  try {
    out = await startResearch(projectId, topic);
  } catch {
    if (read(projectId) === pending)
      write(projectId, {
        status: "failed",
        topic,
        detail: "The studio could not be reached, so nothing was researched.",
        code: "offline",
      });
    return null;
  }
  // Stopped or cleared between the click and the 202: the run started anyway,
  // and is ended rather than watched.
  if (read(projectId) !== pending) {
    if (out.ok) void cancelTurn(out.turnId).catch(() => undefined);
    return null;
  }
  if (out.ok) {
    watch(projectId, out.turnId, topic, startedAt);
    return out.turnId;
  }
  // The rule working, server-side: this project's slot is held.
  if (out.status === 409 && out.holder) {
    watch(projectId, out.holder, topic, startedAt);
    return out.holder;
  }
  // Refused before any turn existed (401, an empty or over-long topic).
  write(projectId, {
    status: "failed",
    topic,
    detail: out.detail || "The research run failed and said nothing about why.",
    code: out.code,
  });
  return null;
}

/**
 * What a mount does about this project's newest research turn once its record
 * has been read: a live one is watched, a settled one it has not taken is
 * landed. Resolves to the live turn the caller should track, or null.
 *
 * `saved` is the `research-notebook` record as hydration read it — the consumed
 * id lives there. `topic` is what the run card shows for a turn this tab did
 * not start (the ledger keeps a digest of the prompt, never the topic).
 */
export async function resumeLive(
  projectId: string,
  saved: ResearchNotebookStepData | undefined,
  topic = "",
): Promise<TurnSummary | null> {
  seed(projectId, saved);
  if (watching.has(projectId)) return null;
  const l = await resumeTurn(projectId, LIVE_KIND, consumed.get(projectId) ?? null);
  if (l.action === "watch") {
    // A run started here between the ask and the answer is already watched.
    if (!watching.has(projectId) && read(projectId).status !== "running")
      watch(projectId, l.turn.id, topic, msOf(l.turn.startedAt));
    return l.turn;
  }
  if (l.action === "land") landLive(projectId, l.turn);
  return null;
}

/** Stop the run. On the server the record says `cancelled` and the engine's
 *  process tree is ended (lib/turns/runner.ts). Resolves to the record the
 *  cancel came back with, so the caller can fold it into the bell at once.
 *
 *  A cancel that lost the race to the turn's own ending finds it `done` or
 *  `failed`: that answer was paid for, so it is landed rather than dropped. */
export async function stopLive(projectId: string): Promise<TurnSummary | null> {
  const w = watching.get(projectId);
  unwatch(projectId);
  write(projectId, { status: "idle" });
  if (!w) return null;
  const out = await cancelTurn(w.turnId).catch(() => null);
  const turn = out?.turn ?? null;
  if (turn && (turn.status === "done" || turn.status === "failed")) {
    const rec = await getTurn(w.turnId).catch(() => null);
    if (rec) landLive(projectId, rec);
  }
  return turn;
}

/** Discard the live notebook — the Clear path. The saved record goes with it,
 *  IN THE SAME TICK, because a cleared step that leaves a notebook on disk
 *  re-adopts it on the next mount and the creator's clear silently undoes
 *  itself. A run still going is stopped, and the record keeps the id of the
 *  newest turn this tab knew of, so neither it nor one already taken can land
 *  over the clear later. */
export function resetLive(projectId: string) {
  const w = watching.get(projectId);
  unwatch(projectId);
  if (w) consumed.set(projectId, w.turnId);
  write(projectId, { status: "idle" });
  const turn = consumed.get(projectId);
  // An EMPTY RECORD, not an absent one. `saveStep` spreads what it is given, so
  // writing `null` would store `{savedAt}` and leave the next reader guessing;
  // and a key that is merely never written is "this project has never run" —
  // a different fact from "the creator cleared what was here".
  void saveStep<ResearchNotebookStepData>(projectId, PHASE, {
    topic: "",
    notebook: null,
    engine: null,
    ...(turn ? { turn } : {}),
  });
  if (w) void cancelTurn(w.turnId).catch(() => undefined);
}

/** Forget everything this module holds, as a reload does. The ledger and the
 *  step store are untouched. For probes. */
export function __forgetLive() {
  for (const p of [...watching.keys()]) unwatch(p);
  states.clear();
  consumed.clear();
  records.clear();
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
    start: useCallback((topic: string) => startLive(projectId, topic), [projectId]),
    stop: useCallback(() => stopLive(projectId), [projectId]),
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
