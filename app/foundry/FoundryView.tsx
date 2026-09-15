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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button, Eyebrow } from "@/components/ui/Primitives";
import StudioFrame from "@/components/ui/StudioFrame";
import { Hint, Keycaps, StackBar, TabRail, type TabDef } from "@/components/ui/signal";
import type { CommitResult, RunDetail, RunSummary, Verdict, Verdicts } from "@/lib/foundry/types";
import { usePolling } from "@/lib/usePolling";

import { CullGrid } from "./CullGrid";
import { DojoView } from "./DojoView";
import { ExtractView } from "./ExtractView";
import { Lightbox } from "./Lightbox";
import { StylesShelf } from "./StylesShelf";
import { fetchExtractRuns } from "./extractClient";
import { commitRun, fetchCatalogue, fetchRun, fetchRuns, fetchTrainingCycles, saveVerdicts } from "./foundryClient";
import { COMMITTABLE, LIVE, STATUS_WORD } from "./parts";

// THE TABS CARRIED A BLURB AND SO THE BLURB GOT WRITTEN — up to 45 words per
// tab, printed as a paragraph under the row. <TabRail> has no slot for one, on
// purpose (components/ui/signal/README.md). What each blurb was reaching for
// was the STATE behind its tab, and that rides as a <Tally> on the tab itself:
//
//   Cull    how many forge runs there are to read
//   Extract how many extraction runs exist
//   Styles  how big the catalogue is
//   Dojo    how many cycles are parked waiting for a human verdict
//
// The facts the blurbs also carried are recorded where they are enforced
// rather than where they were narrated: a cull DELETES the files it rejects
// (the commit dialog says so, over a rail that draws it), an extraction's kept
// styles join pipeline/foundry/styles.json (the Extract dialog), and a Dojo
// commit deletes decided media keeping one thumbnail per approved improvement
// (the Dojo dialog). Each is a consequence stated at the moment it is ordered.
type Tab = "cull" | "extract" | "styles" | "dojo";

/** The three counts the rail cannot derive from this component's own state.
 *
 *  Each tab's view loads its own list when it opens; this asks for the same
 *  three lists once, at mount, so the rail is honest before anything is
 *  clicked. A list that cannot be read leaves its tally OFF rather than
 *  showing a zero — a zero meaning "we could not ask" is worse than no chip,
 *  and the failure already has a home in each view's own error line. */
function useShelfCounts() {
  const [counts, setCounts] = useState<{ extract?: number; styles?: number; parked?: number }>({});
  useEffect(() => {
    // NO `alive` GUARD, deliberately. Each list is asked for exactly once for
    // the life of the page, so there is no newer response for a late one to
    // overwrite — the race app/_phases/_shared/useLoadFor.ts exists to close
    // cannot arise, and a setState after unmount is a no-op. A REJECTION
    // handler there must be: an unhandled one is picked up by
    // GlobalErrorBridge and announced as the user's work failing to save (the
    // same reasoning as `loadDetail` below).
    const put = (patch: { extract?: number; styles?: number; parked?: number }) => setCounts((c) => ({ ...c, ...patch }));
    const drop = () => undefined;
    fetchExtractRuns().then((r) => put({ extract: r.length }), drop);
    fetchCatalogue().then((c) => put({ styles: c.styles.length }), drop);
    fetchTrainingCycles().then((c) => put({ parked: c.filter((x) => x.status === "awaiting-gate").length }), drop);
  }, []);
  return counts;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function FoundryView() {
  const [tab, setTab] = useState<Tab>("cull");
  const shelf = useShelfCounts();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [verdicts, setVerdicts] = useState<Verdicts>({});
  const [save, setSave] = useState<SaveState>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResult | null>(null);
  /** A commit that FAILED, shown inside the dialog that asked for it.
   *
   *  The catch used to write `runsError`, which renders beside the run list —
   *  and the confirm dialog is `fixed inset-0 z-50` over a backdrop at 80%
   *  with a blur, carrying `aria-modal="true"`. So the message landed
   *  somewhere the reader could not see it and a screen reader would not
   *  reach: aria-modal removes the rest of the page from the accessibility
   *  tree. The dialog meanwhile went from "committing…" back to its button,
   *  which is indistinguishable from a click that never registered.
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
      setSave("idle");
      loadDetail(id, false);
    },
    [loadDetail],
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

  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const r = await commitRun(selected, "reject");
      setResult(r);
      setConfirm(false);
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

  /** Why Commit will not go, in one clause — null when it will. The status
   *  half is read from COMMITTABLE, never from an inline status comparison:
   *  tests/golden-path/commit-gate-parity.probe.spec.ts holds that constant
   *  equal to the server's own guard. */
  const blocked = !run
    ? null
    : !COMMITTABLE.includes(run.status)
      ? `run is ${STATUS_WORD[run.status]}`
      : counts.kept === 0
        ? "keep at least one candidate first"
        : null;

  // A tally is left OFF while its count is unknown; `undefined` is not zero.
  // The tone is news, not decoration: amber where something is running or
  // waiting on the human, neutral where it is only an inventory.
  const anyLive = Boolean(runs?.some((r) => LIVE.includes(r.status)));
  const tally = (value: number | undefined, tone: "neutral" | "amber") => (value === undefined ? undefined : { value, tone });
  const tabs: TabDef<Tab>[] = [
    { id: "cull", label: "Cull", testId: "foundry-tab-cull", tally: tally(runs?.length, anyLive ? "amber" : "neutral") },
    { id: "extract", label: "Extract", testId: "foundry-tab-extract", tally: tally(shelf.extract, "neutral") },
    { id: "styles", label: "Styles", testId: "foundry-tab-styles", tally: tally(shelf.styles, "neutral") },
    { id: "dojo", label: "Dojo", testId: "foundry-tab-dojo", tally: tally(shelf.parked, shelf.parked ? "amber" : "neutral") },
  ];

  return (
    <StudioFrame>
      <main className="pb-24">
        <header className="pt-6">
          <Eyebrow>foundry</Eyebrow>
          <h1 className="font-instrument mt-3 text-4xl text-white">Foundry</h1>
          <TabRail label="foundry modules" tabs={tabs} active={tab} onSelect={setTab} className="mt-5" />
        </header>

        <section className="mt-6">
          {tab === "styles" ? (
            <StylesShelf />
          ) : tab === "extract" ? (
            <ExtractView />
          ) : tab === "dojo" ? (
            <DojoView />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              <aside>
                <div className="font-jetbrains text-label tracking-[0.14em] text-white/60 uppercase">runs</div>
                {runsError && <p className="font-jetbrains mt-2 text-content text-rose-200">{runsError}</p>}
                {runs && runs.length === 0 && <ForgeHint />}
                <ul className="mt-2 flex flex-col gap-1">
                  {runs?.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => selectRun(r.id)}
                        className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition ${
                          r.id === selected ? "border-cyan-400/40 bg-cyan-400/10" : "border-white/8 hover:bg-white/[0.03]"
                        }`}
                      >
                        <div className="font-jetbrains truncate text-label text-white/90">{r.id}</div>
                        <div className="font-jetbrains mt-0.5 text-label text-white/60">
                          {STATUS_WORD[r.status]}
                          {LIVE.includes(r.status) && r.progress.total > 0 ? ` ${r.progress.done}/${r.progress.total}` : ""}
                          {" · "}
                          {r.kept}/{r.candidates} kept
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>

              <div>
                {!run && selected && <p className="font-jetbrains text-content text-white/60">loading…</p>}
                {run && (
                  <>
                    <StatusStrip run={run} />
                    {result && <CommitReport result={result} />}
                    <div className="mt-5">
                      <CullGrid
                        run={run}
                        verdicts={verdicts}
                        focused={focused}
                        readOnly={readOnly}
                        onFocus={setFocused}
                        onVerdict={setVerdict}
                        onOpen={setOpen}
                        keysEnabled={!open && !confirm}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {run && tab === "cull" && (
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[var(--gt-ink)]/90 backdrop-blur">
            <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-3 px-2 py-3">
              <div className="font-jetbrains flex flex-wrap gap-4 text-label text-white/60">
                <span>
                  <span className="text-emerald-200">{counts.kept}</span> kept
                </span>
                <span>
                  <span className="text-rose-200">{counts.rejected}</span> rejected
                </span>
                <span>
                  <span className="text-white/90">{counts.undecided}</span> undecided
                </span>
                <span className={save === "error" ? "text-rose-200" : "text-white/55"}>
                  {readOnly ? "committed · verdicts are final" : save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed — retry a verdict" : ""}
                </span>
                {!readOnly && (
                  <Keycaps
                    label="Cull shortcuts"
                    map={[
                      { keys: ["←", "→", "↑", "↓"], does: "move" },
                      { keys: ["K"], does: "keep" },
                      { keys: ["X"], does: "reject" },
                      { keys: ["U"], does: "clear" },
                      { keys: ["Enter"], does: "compare" },
                    ]}
                  />
                )}
              </div>
              {readOnly ? (
                <span className="font-jetbrains rounded-full border border-emerald-400/30 px-4 py-2 text-label tracking-[0.14em] text-emerald-200 uppercase">
                  committed
                </span>
              ) : (
                // A DISABLED BUTTON'S REASON IS NOT A HOVER ESSAY. It used to be
                // three sentences of `title=` re-teaching what a failed or
                // incomplete run is — which the status pill on the strip above
                // already says in one word. What is left is the one clause the
                // reader cannot see anywhere else: why THIS button will not go.
                <span className="flex items-center gap-2">
                  {blocked && (
                    <Hint variant="lock" tone="amber" label="Why Commit is unavailable">
                      {blocked}
                    </Hint>
                  )}
                  <Button
                    disabled={Boolean(blocked)}
                    onClick={() => setConfirm(true)}
                    className="cursor-pointer px-5 py-2 text-label disabled:cursor-not-allowed"
                  >
                    Commit the cull
                  </Button>
                </span>
              )}
            </div>
          </div>
        )}

        {run && (
          <Lightbox
            run={run}
            candidate={open ? (run.candidates.find((c) => c.id === open) ?? null) : null}
            verdict={open ? verdicts[open]?.verdict : undefined}
            readOnly={readOnly}
            onClose={() => setOpen(null)}
            onVerdict={(v) => open && setVerdict(open, v)}
            onStep={stepOpen}
          />
        )}

        <Modal
          open={confirm}
          onClose={() => {
            if (committing) return;
            setConfirm(false);
            setCommitError(null);
          }}
          title="Commit the cull?"
          className="max-w-md"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={() => setConfirm(false)} disabled={committing}>
                Not yet
              </Button>
              <button
                onClick={doCommit}
                disabled={committing}
                className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-5 py-2 text-label text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
              >
                {committing ? "committing…" : `Delete ${counts.rejected + counts.undecided}, keep ${counts.kept}`}
              </button>
            </div>
          }
        >
          {/* THE RAIL IS THE SENTENCE. "undecided counts as rejected: the cull
              is what you chose, not what you skipped" was the app explaining a
              picture — kept on one side, rejected on the other, and undecided
              hatched into the rejected side because it is not a third outcome.
              What stays in prose is the consequence a destructive confirm is
              entitled to state, and the path the judgement is written to. */}
          <StackBar
            label="commit"
            segments={[
              { n: counts.kept, tone: "emerald", label: "kept" },
              { n: counts.rejected, tone: "rose", label: "rejected" },
              { n: counts.undecided, tone: "rose", label: "undecided", hatched: true },
            ]}
          />
          <p className="font-hanken mt-3 text-content text-slate-300">
            Everything not kept is deleted from disk. Every decided candidate is written to{" "}
            <code className="font-jetbrains text-label text-white/70">pipeline/foundry/ledger.json</code> and the style catalogue. This cannot be undone.
          </p>
          {commitError && (
            <p role="alert" className="font-jetbrains mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-content text-rose-200">
              The commit failed and nothing was deleted: {commitError}
            </p>
          )}
        </Modal>
      </main>
    </StudioFrame>
  );
}

function StatusStrip({ run }: { run: RunDetail["run"] }) {
  const live = LIVE.includes(run.status);
  const last = run.log[run.log.length - 1];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5">
      <span
        className={`font-jetbrains rounded-full border px-2 py-0.5 text-label tracking-[0.14em] uppercase ${
          run.status === "committed"
            ? "border-emerald-400/40 text-emerald-200"
            : run.status === "failed"
              ? "border-rose-400/40 text-rose-200"
              : run.status === "incomplete"
                ? "border-amber-400/40 text-amber-200"
                : live
                ? "border-amber-400/40 text-amber-200"
                : "border-cyan-400/40 text-cyan-200"
        }`}
      >
        {STATUS_WORD[run.status]}
        {live && run.progress.total > 0 ? ` ${run.progress.done}/${run.progress.total}` : ""}
      </span>
      <span className="font-jetbrains text-label text-white/65">
        {run.scenes.length} scene{run.scenes.length === 1 ? "" : "s"} · {run.plan.styles.length} styles · {run.plan.mechanisms.length} mechanisms · {run.candidates.length} candidates
      </span>
      {run.committed && (
        <span className="font-jetbrains text-label text-white/65">
          committed: {run.committed.kept} kept, {run.committed.deleted} deleted
        </span>
      )}
      {run.error && <span className="font-jetbrains text-label text-rose-200">{run.error}</span>}
      {live && last && <span className="font-jetbrains ml-auto truncate text-label text-white/55">{last.msg}</span>}
    </div>
  );
}

function CommitReport({ result }: { result: CommitResult }) {
  return (
    <details open className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04]">
      <summary className="font-jetbrains cursor-pointer px-4 py-2 text-label tracking-[0.14em] text-emerald-200 uppercase">
        committed · {result.kept} kept · {result.deleted} deleted · findings.md written
      </summary>
      <pre className="font-jetbrains max-h-96 overflow-auto px-4 pb-4 text-content leading-relaxed whitespace-pre-wrap text-slate-300">{result.findings}</pre>
    </details>
  );
}

/** No runs. The command IS the answer, so the sentence introducing it was the
 *  only part worth deleting — the shelf label says the state. */
function ForgeHint() {
  return (
    <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <div className="font-jetbrains text-label tracking-[0.14em] text-white/50 uppercase">none yet — forge one</div>
      <pre className="font-jetbrains mt-2 text-content leading-relaxed whitespace-pre-wrap text-white/60">{`cd pipeline/foundry
python forge.py plans/dry-run.json`}</pre>
    </div>
  );
}
