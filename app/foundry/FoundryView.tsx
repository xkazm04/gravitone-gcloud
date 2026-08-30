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
import type { CommitResult, RunDetail, RunSummary, Verdict, Verdicts } from "@/lib/foundry/types";
import { usePolling } from "@/lib/usePolling";

import { CullGrid } from "./CullGrid";
import { DojoView } from "./DojoView";
import { ExtractView } from "./ExtractView";
import { Lightbox } from "./Lightbox";
import { StylesShelf } from "./StylesShelf";
import { commitRun, fetchRun, fetchRuns, saveVerdicts } from "./foundryClient";
import { LIVE, STATUS_WORD } from "./parts";

const TABS = [
  { id: "cull", label: "Cull", blurb: "Read the grid, keep the good, commit. Rejected files are deleted; the verdicts are what stays." },
  {
    id: "extract",
    label: "Extract",
    blurb: "Drop a gallery. Its looks are read back, grouped into styles, replicated from words alone with self-critique, then transferred onto a scene the gallery never showed. Keep the styles that held; they join the catalogue.",
  },
  { id: "styles", label: "Styles", blurb: "The catalogue the forge draws from, and the evidence each style has earned." },
  {
    id: "dojo",
    label: "Dojo",
    blurb: "Gate the training loop's A/B cycles: read each claimed improvement's seed-matched pairs, approve what genuinely held, and commit — the media is culled, the verdicts are what the loop learns from.",
  },
] as const;
type Tab = (typeof TABS)[number]["id"];

type SaveState = "idle" | "saving" | "saved" | "error";

export default function FoundryView() {
  const [tab, setTab] = useState<Tab>("cull");
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
    try {
      const r = await commitRun(selected, "reject");
      setResult(r);
      setConfirm(false);
      setOpen(null);
      loadDetail(selected, false);
      loadRuns();
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const active = TABS.find((t) => t.id === tab)!;
  const run = detail?.run ?? null;

  return (
    <StudioFrame>
      <main className="pb-24">
        <header className="pt-6">
          <Eyebrow>foundry</Eyebrow>
          <h1 className="font-instrument mt-3 text-4xl text-white">Foundry</h1>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-white/8 pb-3">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`font-jetbrains rounded-full border px-3.5 py-1.5 text-[12px] transition ${
                  t.id === tab ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-white/50 hover:text-white/80"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="font-hanken mt-3 max-w-xl text-sm text-slate-400">{active.blurb}</p>
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
                <div className="font-jetbrains text-[11px] tracking-[0.14em] text-white/45 uppercase">runs</div>
                {runsError && <p className="font-jetbrains mt-2 text-[11px] text-rose-200">{runsError}</p>}
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
                        <div className="font-jetbrains truncate text-[12px] text-white/90">{r.id}</div>
                        <div className="font-jetbrains mt-0.5 text-[10px] text-white/45">
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
                {!run && selected && <p className="font-jetbrains text-[12px] text-white/40">loading…</p>}
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
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
              <div className="font-jetbrains flex flex-wrap gap-4 text-[11px] text-white/60">
                <span>
                  <span className="text-emerald-200">{counts.kept}</span> kept
                </span>
                <span>
                  <span className="text-rose-200">{counts.rejected}</span> rejected
                </span>
                <span>
                  <span className="text-white/90">{counts.undecided}</span> undecided
                </span>
                <span className={save === "error" ? "text-rose-200" : "text-white/35"}>
                  {readOnly ? "committed · verdicts are final" : save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed — retry a verdict" : ""}
                </span>
                {!readOnly && <span className="hidden text-white/30 md:inline">arrows move · K keep · X reject · U clear · Enter compare</span>}
              </div>
              {readOnly ? (
                <span className="font-jetbrains rounded-full border border-emerald-400/30 px-4 py-2 text-[11px] tracking-[0.14em] text-emerald-200 uppercase">
                  committed
                </span>
              ) : (
                <Button
                  disabled={run.status !== "done" || counts.kept === 0}
                  onClick={() => setConfirm(true)}
                  className="cursor-pointer px-5 py-2 text-[12px] disabled:cursor-not-allowed"
                  title={run.status !== "done" ? `Run is ${STATUS_WORD[run.status]}` : counts.kept === 0 ? "Keep at least one candidate first" : "Delete everything not kept and write the ledger"}
                >
                  Commit the cull
                </Button>
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
          onClose={() => !committing && setConfirm(false)}
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
                className="font-jetbrains cursor-pointer rounded-full border border-rose-400/40 bg-rose-400/10 px-5 py-2 text-[12px] text-rose-200 transition hover:bg-rose-400/20 disabled:opacity-50"
              >
                {committing ? "committing…" : `Delete ${counts.rejected + counts.undecided}, keep ${counts.kept}`}
              </button>
            </div>
          }
        >
          <p className="font-hanken text-sm text-slate-300">
            <span className="text-emerald-200">{counts.kept}</span> kept candidates stay on disk untouched.{" "}
            <span className="text-rose-200">{counts.rejected}</span> rejected and <span className="text-white">{counts.undecided}</span> undecided
            are deleted — undecided counts as rejected: the cull is what you chose, not what you skipped. Every decided candidate is written to{" "}
            <code className="font-jetbrains text-[11px] text-white/70">pipeline/foundry/ledger.json</code> and the style catalogue. This cannot be undone.
          </p>
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
        className={`font-jetbrains rounded-full border px-2 py-0.5 text-[10px] tracking-[0.14em] uppercase ${
          run.status === "committed"
            ? "border-emerald-400/40 text-emerald-200"
            : run.status === "failed"
              ? "border-rose-400/40 text-rose-200"
              : live
                ? "border-amber-400/40 text-amber-200"
                : "border-cyan-400/40 text-cyan-200"
        }`}
      >
        {STATUS_WORD[run.status]}
        {live && run.progress.total > 0 ? ` ${run.progress.done}/${run.progress.total}` : ""}
      </span>
      <span className="font-jetbrains text-[11px] text-white/50">
        {run.scenes.length} scene{run.scenes.length === 1 ? "" : "s"} · {run.plan.styles.length} styles · {run.plan.mechanisms.length} mechanisms · {run.candidates.length} candidates
      </span>
      {run.committed && (
        <span className="font-jetbrains text-[11px] text-white/50">
          committed: {run.committed.kept} kept, {run.committed.deleted} deleted
        </span>
      )}
      {run.error && <span className="font-jetbrains text-[11px] text-rose-200">{run.error}</span>}
      {live && last && <span className="font-jetbrains ml-auto truncate text-[10px] text-white/35">{last.msg}</span>}
    </div>
  );
}

function CommitReport({ result }: { result: CommitResult }) {
  return (
    <details open className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04]">
      <summary className="font-jetbrains cursor-pointer px-4 py-2 text-[11px] tracking-[0.14em] text-emerald-200 uppercase">
        committed · {result.kept} kept · {result.deleted} deleted · findings.md written
      </summary>
      <pre className="font-jetbrains max-h-96 overflow-auto px-4 pb-4 text-[11px] leading-relaxed whitespace-pre-wrap text-slate-300">{result.findings}</pre>
    </details>
  );
}

function ForgeHint() {
  return (
    <div className="mt-2 rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <p className="font-hanken text-[12px] text-slate-400">No runs yet. Forge one from a plan:</p>
      <pre className="font-jetbrains mt-2 text-[10px] leading-relaxed whitespace-pre-wrap text-white/60">{`cd pipeline/foundry
python forge.py plans/dry-run.json`}</pre>
    </div>
  );
}
