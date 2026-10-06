"use client";

// /foundry — where art styles and shot grammar are forged in bulk and culled
// by hand.
//
// Two phases, two halves of this page:
//
//   FORGE   (not here) pipeline/foundry/forge.py runs for hours on the local
//           GPU: reference frames → craft annotation → N styles × M mechanisms
//           of candidates → automatic pre-grade. This page only WATCHES it, by
//           polling the manifest it rewrites after every step.
//   CULL    (here) the human reads the grid, keeps the good, and commits.
//           A commit deletes the rejected files and writes the judgement into
//           the versioned indices — that is the "training" step: the style
//           catalogue and the ledger learn what held, and the findings draft
//           is what the knowledge write-up starts from.
//
// Why a separate module and not a Library tab: the Library holds RATIFIED
// things a project stands on. The foundry is upstream of ratification — most
// of what it produces is meant to be deleted.
//
// VERDICTS ARE IMMEDIATE AND IDEMPOTENT. A keep is a keep however many times
// it is pressed; clearing is its own action (U). The state is applied
// synchronously from a ref — not inside a React updater — so a burst of
// keystrokes cannot read a stale map, and the tile/lightbox re-render before
// the (debounced) save leaves. A COMMITTED run is read-only: its rejected
// files are gone and its rows are in the ledger, so the controls are removed
// rather than left to fail quietly.
//
// THE PAGE IS A PLANT, NOT A DOCUMENT (2026-10-05, round-2 UI pass). It was
// drawn from the kit (components/kit) inside a `WorldRoot`: a giant serif
// "Foundry", the Fornax constellation as a hero, then flat lists — the Almanac
// print idiom on an Obsidian ground, which the operator read as wireframes.
// What replaces it is the /projects and /library idiom (glass, rounded-2xl,
// real pictures large, the state tones) and a header that IS the plant's
// state: the Pipeline stations of ./plant.tsx, the operator's pick of three
// round-2 directions (round 3 deleted the other two, and the `?v=` switch with
// them). This file still owns the cull's whole state, and nothing below it
// fetches on its own except the header's read-only previews (./plant.tsx).
//
// THE CHROME IS SPENT ONCE (round 3). Stations, run strip, run header and the
// scene's own header stood ~560px tall before the first candidate; the strip
// and stations now scroll away and the run bar (./RunCards.tsx RunBar) sticks,
// carrying what the old crumbs carried — which run, which candidate — plus the
// live figure, because a sticky bar is the one place a reader deep in a cull of
// hundreds can still see both.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import StudioFrame from "@/components/ui/StudioFrame";
import { Keycaps } from "@/components/ui/signal";
import { calibrate, seriesKey } from "@/lib/foundry/calibration";
import type { CommitResult, ForgeCommitPlan, RunDetail, RunSummary, Verdict, Verdicts } from "@/lib/foundry/types";
import { usePolling } from "@/lib/usePolling";

import { CullGrid } from "./CullGrid";
import { DojoView } from "./DojoView";
import { ExtractView } from "./ExtractView";
import { Lightbox } from "./Lightbox";
import { PipelineHeader, usePlant, useRunPreviews, type Tab } from "./plant";
import { ForgeEmpty, RunBar, RunStrip } from "./RunCards";
import { StripsView } from "./StripsView";
import { StylesShelf } from "./StylesShelf";
import { commitRun, fetchRun, fetchRuns, previewCommit, saveVerdicts } from "./foundryClient";
import { COMMITTABLE, LIVE, STATUS_WORD } from "./parts";
import {
  BarCount,
  CommitDialog,
  ErrorNote,
  Glass,
  Label,
  Loading,
  LockNote,
  PlanFact,
  PrimaryAction,
  Rise,
  SaveNote,
  StatusChip,
  DecisionBar,
  useCommitPlan,
  type SaveKind,
} from "./ui";

// THE TABS CARRIED A BLURB AND SO THE BLURB GOT WRITTEN — up to 45 words per
// tab, printed as a paragraph under the row. None of the three headers has a
// slot for one, on purpose (components/ui/signal/README.md). What each blurb
// was reaching for was the STATE behind its tab, and that rides on the tab:
//
//   Cull    how many forge runs there are to read, and whether one is live
//   Extract how many extraction runs exist
//   Styles  how big the catalogue is
//   Dojo    how many cycles are parked waiting for a human verdict
//   Strips  how many code-rendered strip runs wait on a triage
//
// The facts the blurbs also carried are recorded where they are enforced
// rather than where they were narrated: a cull DELETES the files it rejects
// (the commit dialog says so, over a rail that draws it), an extraction's kept
// styles join pipeline/foundry/styles.json (the Extract dialog), and a Dojo
// commit deletes decided media keeping one thumbnail per approved improvement
// (the Dojo dialog). Each is a consequence stated at the moment it is ordered.

const CULL_KEYS = [
  { keys: ["←", "→", "↑", "↓"], does: "move" },
  { keys: ["K"], does: "keep" },
  { keys: ["X"], does: "reject" },
  { keys: ["U"], does: "clear" },
  { keys: ["Enter"], does: "compare" },
];

export default function FoundryView() {
  const [tab, setTab] = useState<Tab>("cull");
  const plant = usePlant();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [save, setSave] = useState<SaveKind>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  /** The server's plan for the cull, asked for when the confirm opens. */
  const plan = useCommitPlan<ForgeCommitPlan>();
  const commitPlan = plan.plan;
  const clearPlan = plan.clear;
  const [result, setResult] = useState<CommitResult | null>(null);
  const [findingsOpen, setFindingsOpen] = useState(false);
  /** A commit that FAILED, shown inside the dialog that asked for it.
   *
   *  The catch used to write `runsError`, which renders beside the run list —
   *  and the confirm dialog is a fixed overlay over a blurred backdrop,
   *  carrying `aria-modal="true"`. So the message landed somewhere the reader
   *  could not see it and a screen reader would not reach: aria-modal removes
   *  the rest of the page from the accessibility tree. The dialog meanwhile
   *  went from "committing…" back to its button, which is indistinguishable
   *  from a click that never registered.
   *
   *  This repo has already written the rule down, in
   *  tests/golden-path/dialog-closes-on-success.probe.spec.ts: "closing a
   *  confirmation over work that was not done is the same small lie as a
   *  button that does nothing." Staying open was right; saying nothing was
   *  not. */
  const [commitError, setCommitError] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  /** The latest verdict map, readable synchronously — see the header. */
  const verdictsRef = useRef<Verdicts>({});
  const previews = useRunPreviews(runs);

  const adoptVerdicts = useCallback((v: Verdicts) => {
    verdictsRef.current = v;
    setVerdicts(v);
  }, []);

  /** The newest detail request. A response holding an older ticket is dropped.
   *
   *  THIS USED TO WRITE ONE RUN'S HUMAN VERDICTS ONTO ANOTHER RUN. `loadDetail`
   *  awaited `fetchRun(id)` and applied the result with no check that `id` was
   *  still the selected run. Two paths reach it — `selectRun`, and the 4s poll —
   *  so: click run A, click run B before A's fetch lands, and A's response calls
   *  `adoptVerdicts(A.verdicts)` while `selected` is B. The next verdict edit then
   *  autosaves that map to B (`setVerdict` reads `verdictsRef.current`), and B's
   *  manifest now carries judgements a human made about A. Silent, and the poll
   *  makes the window recur every four seconds rather than once.
   *
   *  A monotonic ticket rather than an `id === selected` comparison, because the
   *  poll re-requests the SAME id: two in-flight loads for one run must still
   *  resolve latest-wins, and comparing ids cannot express that. Same shape as
   *  `claimSaveSlot` in app/_phases/_shared/stepStore.ts, for the same reason —
   *  arrival order is not issue order. The ticket is taken at CALL time and
   *  checked before anything is applied. */
  const detailTicket = useRef(0);

  const loadDetail = useCallback(
    (id: string, keepVerdicts: boolean) => {
      const ticket = ++detailTicket.current;
      // AND A REJECTION PATH, because in this app an unhandled one is not
      // silence -- it is a WRONG MESSAGE. GlobalErrorBridge listens on
      // `unhandledrejection` and reports what it catches as
      // `reportStorageTrouble("write", ...)`, so a failed READ of a run surfaces
      // in the bell as the user's work failing to SAVE, and NotificationBell
      // announces that one assertively (it is the app's only assertive case).
      // On a 4s poll, a foundry that cannot be reached tells a screen-reader
      // user their studio is not saving. `loadRuns` in this same file has
      // always had its handler; this one did not.
      fetchRun(id).then(
        (d) => {
          if (ticket !== detailTicket.current) return;
          setDetail(d);
          if (!keepVerdicts) adoptVerdicts(d.verdicts);
          setRunsError(null);
        },
        (e) => {
          if (ticket !== detailTicket.current) return;
          setRunsError(e instanceof Error ? e.message : "could not load that run");
        },
      );
    },
    [adoptVerdicts],
  );

  // Selecting a run is an event, not a derived state: the reset of the
  // per-run UI happens here, once, in the handler that chose it.
  const selectRun = useCallback(
    (id: string) => {
      setSelected(id);
      setDetail(null);
      setResult(null);
      setFocused(null);
      setOpen(null);
      setFindingsOpen(false);
      clearPlan();
      setSave("idle");
      loadDetail(id, false);
    },
    [loadDetail, clearPlan],
  );

  const loadRuns = useCallback(() => {
    fetchRuns().then(
      (r) => {
        setRuns(r);
        setRunsError(null);
        setSelected((s) => {
          if (s || !r[0]) return s;
          loadDetail(r[0].id, false);
          return r[0].id;
        });
      },
      (e) => setRunsError(e instanceof Error ? e.message : "failed"),
    );
  }, [loadDetail]);
  useEffect(loadRuns, [loadRuns]);

  // A live run rewrites its manifest after every candidate; poll it — but
  // keep the local verdicts, which are the human's and never the forge's.
  //
  // Through `usePolling`, which pauses while the tab is hidden. This ran every
  // four seconds against a backgrounded tab before, for a run nobody could see —
  // half the load lib/apiAuth.ts sizes its limiter against.
  const live = detail ? LIVE.includes(detail.run.status) : false;
  usePolling(
    () => {
      if (!selected) return;
      loadDetail(selected, true);
      loadRuns();
    },
    4000,
    Boolean(selected) && live,
  );

  const readOnly = detail?.run.status === "committed";

  /** Apply one verdict to one or many candidates. Idempotent; null clears. */
  const setVerdict = useCallback(
    (ids: string | string[], v: Verdict | null) => {
      if (!selected || readOnly) return;
      const list = Array.isArray(ids) ? ids : [ids];
      const at = new Date().toISOString();
      const next = { ...verdictsRef.current };
      for (const id of list) {
        if (v) next[id] = { verdict: v, at };
        else delete next[id];
      }
      adoptVerdicts(next);
      setSave("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const runId = selected;
      saveTimer.current = window.setTimeout(() => {
        saveVerdicts(runId, next).then(
          () => setSave("saved"),
          () => setSave("error"),
        );
      }, 400);
    },
    [selected, readOnly, adoptVerdicts],
  );

  const order = useMemo(() => detail?.run.candidates.map((c) => c.id) ?? [], [detail]);
  const stepOpen = useCallback(
    (d: 1 | -1) => {
      if (!open) return;
      const i = order.indexOf(open);
      const n = Math.min(order.length - 1, Math.max(0, i + d));
      setOpen(order[n]);
      setFocused(order[n]);
    },
    [open, order],
  );

  const counts = useMemo(() => {
    const cs = detail?.run.candidates.filter((c) => c.status !== "pending" && c.status !== "failed" && !c.deleted) ?? [];
    const kept = cs.filter((c) => verdicts[c.id]?.verdict === "keep").length;
    const rejected = cs.filter((c) => verdicts[c.id]?.verdict === "reject").length;
    return { total: cs.length, kept, rejected, undecided: cs.length - kept - rejected };
  }, [detail, verdicts]);

  const openConfirm = () => {
    if (!selected) return;
    const runId = selected;
    setConfirm(true);
    setCommitError(null);
    plan.prepare(() => previewCommit(runId, "reject"));
  };
  const closeConfirm = () => {
    setConfirm(false);
    setCommitError(null);
    clearPlan();
  };

  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const r = await commitRun(selected, "reject", commitPlan?.token);
      setResult(r);
      setConfirm(false);
      clearPlan();
      setOpen(null);
      loadDetail(selected, false);
      loadRuns();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const run = detail?.run ?? null;

  // THE GRADER, MEASURED AGAINST THE HUMAN. The catalogue's ledger holds every
  // decided candidate beside its automatic grade; the run's own grader picks
  // the series (a grade from another grader version is another instrument).
  // Keyed on the series STRING, so the 4s poll of a live run does not re-run
  // the bootstrap.
  const firstGrade = run?.candidates.find((c) => c.grade)?.grade;
  const series = seriesKey({ grader: firstGrade?.grader, grader_digest: firstGrade?.grader_digest });
  const ledger = plant.catalogue?.ledger;
  const calibration = useMemo(() => (ledger ? calibrate(ledger, { series }) : null), [ledger, series]);

  /** Why Commit will not go, in one clause — null when it will. The status
   *  half is read from COMMITTABLE, never from an inline status comparison:
   *  tests/golden-path/commit-gate-parity.probe.spec.ts holds that constant
   *  equal to the server's own guard. */
  const blocked = !run
    ? null
    : !COMMITTABLE.includes(run.status)
      ? `run is ${STATUS_WORD[run.status]}`
      : counts.kept === 0
        ? "keep one first"
        : null;

  const closeLevels = () => {
    setOpen(null);
    setFindingsOpen(false);
  };
  const selectTab = (t: Tab) => {
    closeLevels();
    setTab(t);
  };

  const committedReport = result && (
    <Rise>
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3">
        <span className="font-jetbrains text-label text-emerald-100/90">
          committed · {result.kept} kept · {result.deleted} deleted · findings.md written
        </span>
        <button type="button" onClick={() => setFindingsOpen(true)} className="font-jetbrains cursor-pointer text-label text-emerald-200 underline-offset-4 hover:underline">
          Read findings.md →
        </button>
      </div>
    </Rise>
  );
  const grid = run && (
    <CullGrid
      run={run}
      verdicts={verdicts}
      focused={focused}
      readOnly={readOnly}
      onFocus={setFocused}
      onVerdict={setVerdict}
      onOpen={setOpen}
      keysEnabled={!open && !confirm && !findingsOpen}
      calibration={calibration}
    />
  );
  const noRuns = runs !== null && runs.length === 0;
  const pending = !run && selected ? <Loading label="reading the run" /> : null;

  const focusedCandidate = run && focused ? (run.candidates.find((c) => c.id === focused) ?? null) : null;

  const cull = noRuns ? (
    <>
      {runsError && <ErrorNote>{runsError}</ErrorNote>}
      <ForgeEmpty />
    </>
  ) : (
    <div className="flex flex-col gap-4">
      <RunStrip runs={runs} previews={previews} selected={selected} onSelect={selectRun} error={runsError} onRetry={loadRuns} />
      {run && <RunBar run={run} focused={focusedCandidate} />}
      {committedReport}
      {runs === null && !runsError && <Loading label="reading the runs" />}
      {pending}
      {grid}
    </div>
  );

  return (
    <StudioFrame>
      {/* tabIndex={-1}: the landmark a closing dialog hands focus to when the
          control it was opened from did not survive it (components/ui/Modal.tsx
          #restoreFocus). pb clears the floating decision bar. */}
      <main tabIndex={-1} className="pb-36">
        <h1 className="sr-only">Foundry</h1>
        <header className="pt-2">
          <PipelineHeader tab={tab} onSelect={selectTab} runs={runs} plant={plant} previews={previews} />
        </header>

        <section role="tabpanel" aria-label={tab} className="mt-4">
          {tab === "styles" ? (
            <StylesShelf />
          ) : tab === "extract" ? (
            <ExtractView />
          ) : tab === "dojo" ? (
            <DojoView />
          ) : tab === "strips" ? (
            <StripsView />
          ) : (
            cull
          )}
        </section>

        {run && tab === "cull" && (
          <DecisionBar label="Decisions">
            <BarCount tone="emerald" n={counts.kept} label="kept" />
            <BarCount tone="rose" n={counts.rejected} label="rejected" />
            <BarCount tone="neutral" n={counts.undecided} label="undecided" />
            <SaveNote state={save} final={readOnly} />
            {!readOnly && <Keycaps label="Cull shortcuts" map={CULL_KEYS} />}
            <span className="ml-auto flex items-center gap-3">
              {readOnly ? (
                <StatusChip kind="committed" word="committed" />
              ) : (
                // A DISABLED BUTTON'S REASON IS NOT A HOVER ESSAY. It used to be
                // three sentences of `title=` re-teaching what a failed or
                // incomplete run is — which the status chip above already says
                // in one word. What is left is the one clause the reader cannot
                // see anywhere else: why THIS button will not go.
                <>
                  {blocked && <LockNote>{blocked}</LockNote>}
                  <PrimaryAction disabled={Boolean(blocked)} onClick={openConfirm}>
                    Commit the cull
                  </PrimaryAction>
                </>
              )}
            </span>
          </DecisionBar>
        )}

        {run && (
          <Lightbox
            run={run}
            candidate={open ? (run.candidates.find((c) => c.id === open) ?? null) : null}
            verdict={open ? verdicts[open] : undefined}
            readOnly={readOnly}
            onClose={() => setOpen(null)}
            onVerdict={(v) => open && setVerdict(open, v)}
            onStep={stepOpen}
            index={open ? order.indexOf(open) : 0}
            count={order.length}
            calibration={calibration}
          />
        )}

        <Modal
          open={findingsOpen && Boolean(result)}
          onClose={() => setFindingsOpen(false)}
          title="findings.md"
          eyebrow={<Label>{selected}</Label>}
          className="max-w-3xl"
        >
          {result && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <StatusChip kind="committed" word={`${result.kept} kept · ${result.deleted} deleted`} />
              </div>
              <Glass className="p-4">
                <pre className="font-jetbrains text-label leading-7 whitespace-pre-wrap text-white/80">{result.findings}</pre>
              </Glass>
            </div>
          )}
        </Modal>

        <CommitDialog
          open={confirm}
          onClose={() => {
            if (committing) return;
            setConfirm(false);
            setCommitError(null);
            clearPlan();
          }}
          title="Commit the cull?"
          eyebrow={<Label>{selected}</Label>}
          railLabel="commit"
          rail={[
            { n: commitPlan ? commitPlan.counts.kept : counts.kept, tone: "emerald", label: "kept" },
            { n: commitPlan ? commitPlan.counts.deleted : counts.rejected, tone: "rose", label: "rejected" },
            { n: commitPlan ? commitPlan.counts.undecided : counts.undecided, tone: "rose", label: "undecided", hatched: true },
          ]}
          consequence={
            <>
              Everything not kept is deleted from disk. Every decided candidate is written to <code>pipeline/foundry/ledger.json</code> and the style catalogue. This cannot be undone.
            </>
          }
          busy={committing}
          preparing={plan.loading}
          confirmLabel={`Delete ${commitPlan ? commitPlan.counts.deleted + commitPlan.counts.undecided : counts.rejected + counts.undecided}, keep ${commitPlan ? commitPlan.counts.kept : counts.kept}`}
          onConfirm={doCommit}
          onCancel={closeConfirm}
        >
          {commitPlan && commitPlan.promotions.length > 0 && (
            <PlanFact label="Promoted to proven">{commitPlan.promotions.join(", ")}</PlanFact>
          )}
          {plan.error && (
            <div className="mt-4">
              <ErrorNote role="alert">Could not prepare the commit: {plan.error}</ErrorNote>
            </div>
          )}
          {commitError && (
            <div className="mt-4">
              <ErrorNote role="alert">The commit failed and nothing was deleted: {commitError}</ErrorNote>
            </div>
          )}
        </CommitDialog>
      </main>
    </StudioFrame>
  );
}

