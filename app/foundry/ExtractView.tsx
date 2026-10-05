"use client";

// THE EXTRACT TAB — a gallery in, a row per extracted style out, and a human
// who keeps or throws each row.
//
// The run is DRIVEN FROM HERE. Unlike the forge, which is a Python process
// the Cull tab only watches, extraction has no process of its own: the
// engine (lib/foundry/extract/engine.ts) does one bounded unit per request,
// and this page calls /step in a loop until the manifest says done. That is
// what lets the same module run on Cloud Run, where nothing outlives a
// response — and it is why closing this tab PAUSES a run rather than
// killing it: the manifest holds every finished unit, and Resume takes the
// next one. The local CLI (pipeline/foundry/extract.mts) drives the same
// engine without a browser; a run it started shows up here to be culled.
//
// VERDICTS are per STYLE, not per image — "does this look hold" is one
// decision across its sources, replicas and transfer. Same discipline as the
// Cull tab: immediate, idempotent, applied from a ref, debounced save, and a
// committed run is read-only.
//
// Drawn in the app's own idiom since the round-2 UI pass (2026-10-05) — glass,
// the state tones, ./ui.tsx — and restyled ONCE for all three prototype
// variants: what differs between the variants is the plant header and the
// cull, not the extraction bench. What is left here is the drive loop, the
// verdict state and the upload form.


import { ImagePlus, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { Hint, Keycaps, Tally } from "@/components/ui/signal";
import { foreignLease, hasFailures } from "@/lib/foundry/extract/engine";
import type { ExtractCommitPlan, ExtractCommitResult, ExtractDetail, ExtractSummary, ExtractVerdict, ExtractVerdicts } from "@/lib/foundry/extract/types";
import { usePolling } from "@/lib/usePolling";

import { ExtractBoard } from "./ExtractBoard";
import { RailFrame, RailItem } from "./RunCards";
import { commitExtractRun, createExtractRun, fetchExtractRun, fetchExtractRuns, prepareUpload, previewExtractCommit, saveExtractVerdicts, stepExtractRun } from "./extractClient";
import { EXTRACT_COMMITTABLE, EXTRACT_LIVE, EXTRACT_STATUS_WORD, extractKind } from "./parts";
import { BarCount, CommitDialog, DecisionBar, ErrorNote, Glass, Label, Loading, LockNote, PlanFact, PrimaryAction, ProgressRail, SaveNote, StatusChip, useCommitPlan, type SaveKind } from "./ui";


export function ExtractView() {
  const [runs, setRuns] = useState<ExtractSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExtractDetail | null>(null);
  const [verdicts, setVerdicts] = useState<ExtractVerdicts>({});
  const [save, setSave] = useState<SaveKind>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** WHICH IMAGE THE SHRINK PASS IS ON, while `creating` is true.
   *
   *  `creating` alone is a boolean over work that is linear in the size of the
   *  gallery: sixty images is sixty decodes, and a boolean renders the same on
   *  the first as on the sixtieth. This is what makes a working upload
   *  distinguishable from a stalled one. */
  const [shrinking, setShrinking] = useState<{ done: number; total: number } | null>(null);
  const [driving, setDriving] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  /** The server's plan for the commit, asked for when the confirm opens. */
  const plan = useCommitPlan<ExtractCommitPlan>();
  const commitPlan = plan.plan;
  const clearPlan = plan.clear;
  const [result, setResult] = useState<ExtractCommitResult | null>(null);
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
  const [zoomOpen, setZoomOpen] = useState(false);
  /** The clock as of the last detail load — the lease is judged against
   *  this, not against render time, so render stays pure. */
  const [loadedAt, setLoadedAt] = useState(0);
  const saveTimer = useRef<number | null>(null);
  const verdictsRef = useRef<ExtractVerdicts>({});
  /** The drive loop reads this, not React state: a loop that captured a
   *  stale `driving` would take one more unit after Pause. */
  const driveRef = useRef(false);

  const adoptVerdicts = useCallback((v: ExtractVerdicts) => {
    verdictsRef.current = v;
    setVerdicts(v);
  }, []);

  /** The newest detail request; an older response is dropped. Identical defect and
   *  identical fix to app/foundry/FoundryView.tsx — this file is the newer copy of
   *  that one (`1e4c8e2`), so the hole was propagated forward rather than
   *  inherited, and both are closed together.
   *
   *  Without it: select run A, select run B before A lands, and A's response runs
   *  `adoptVerdicts(A.verdicts)` while `selected` is B — after which `setVerdict`
   *  autosaves that map under B's id. A human's judgements about one extract run,
   *  written onto another's manifest, silently.
   *
   *  A monotonic ticket rather than an `id === selected` check, because the 4s
   *  poll re-requests the SAME id and two in-flight loads for one run must still
   *  resolve latest-wins. Same shape as `claimSaveSlot` in stepStore. */
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
      return fetchExtractRun(id).then(
        (d) => {
          // Superseded: a newer load is already in flight for this surface. The
          // drive loop awaits this only to sequence itself, never for the value.
          if (ticket !== detailTicket.current) return undefined;
          setDetail(d);
          setLoadedAt(Date.now());
          if (!keepVerdicts) adoptVerdicts(d.verdicts);
          setRunsError(null);
          return d;
        },
        (e) => {
          if (ticket !== detailTicket.current) return undefined;
          // `runsError`, NOT `driveError`: the latter is a statement about the
          // drive loop, and it relabels the control to "retry" whose handler
          // prunes failed units. A poll that could not reach the server must
          // not offer to prune anything. This lands beside the run list, where
          // `loadRuns` failures already show.
          setRunsError(e instanceof Error ? e.message : "could not load that run");
          return undefined;
        },
      );
    },
    [adoptVerdicts],
  );

  const loadRuns = useCallback(() => {
    fetchExtractRuns().then(
      (r) => {
        setRuns(r);
        setRunsError(null);
      },
      (e) => setRunsError(e instanceof Error ? e.message : "failed"),
    );
  }, []);
  useEffect(loadRuns, [loadRuns]);

  const selectRun = useCallback(
    (id: string | null) => {
      driveRef.current = false;
      setDriving(false);
      setDriveError(null);
      setSelected(id);
      setDetail(null);
      setResult(null);
      clearPlan();
      setFocused(null);
      setSave("idle");
      if (id) loadDetail(id, false);
    },
    [loadDetail, clearPlan],
  );

  /* ── The drive loop ───────────────────────────────────────────────────── */

  const drive = useCallback(
    async (id: string, retry = false) => {
      driveRef.current = true;
      setDriving(true);
      setDriveError(null);
      try {
        let first = retry;
        while (driveRef.current) {
          const r = await stepExtractRun(id, 1, first);
          first = false;
          if (!driveRef.current) break;
          await loadDetail(id, true);
          if (r.unit === null || r.unit === "finish" || !EXTRACT_LIVE.includes(r.status)) break;
        }
        loadRuns();
      } catch (e) {
        setDriveError(e instanceof Error ? e.message : "the step failed");
      } finally {
        driveRef.current = false;
        setDriving(false);
      }
    },
    [loadDetail, loadRuns],
  );

  const pause = () => {
    driveRef.current = false;
    setDriving(false);
  };

  // Leaving the tab pauses the run; the manifest keeps every finished unit.
  useEffect(
    () => () => {
      driveRef.current = false;
    },
    [],
  );

  const startRun = async (slug: string, files: File[], options: { rounds: number; replicas: number; transfers: number; grouping?: "none" }) => {
    setCreating(true);
    setShrinking({ done: 0, total: files.length });
    setRunsError(null);
    try {
      const uploads = [];
      // ONE TICK PER IMAGE. The loop stays SERIAL on purpose: overlapping the
      // decodes would hold the whole gallery's bitmaps at once, and peak memory
      // is a separate decision from saying where we are. Each iteration already
      // awaits, so the state written here is committed and painted before the
      // next decode starts — the count is real, not a guess at a rate.
      for (const f of files) {
        uploads.push(await prepareUpload(f));
        setShrinking({ done: uploads.length, total: files.length });
      }
      const run = await createExtractRun(slug, uploads, options);
      loadRuns();
      selectRun(run.id);
      void drive(run.id);
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "could not create the run");
    } finally {
      setCreating(false);
      setShrinking(null);
    }
  };

  // A live run this tab is NOT driving — the CLI, or another tab — rewrites
  // its manifest after every unit; poll it, keeping the local verdicts.
  //
  // Through `usePolling`, which pauses while the tab is hidden — this is the
  // surface most likely to be left in a background tab, since the whole point of
  // the poll is watching a run somebody else is driving.
  const live = detail ? EXTRACT_LIVE.includes(detail.run.status) : false;
  usePolling(
    () => {
      if (!selected) return;
      void loadDetail(selected, true);
      loadRuns();
    },
    4000,
    Boolean(selected) && live && !driving,
  );

  /* ── Verdicts ─────────────────────────────────────────────────────────── */

  const readOnly = detail?.run.status === "committed";

  const setVerdict = useCallback(
    (id: string, v: ExtractVerdict | null) => {
      if (!selected || readOnly) return;
      const next = { ...verdictsRef.current };
      if (v) next[id] = { verdict: v, at: new Date().toISOString() };
      else delete next[id];
      adoptVerdicts(next);
      setSave("saving");
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const runId = selected;
      saveTimer.current = window.setTimeout(() => {
        saveExtractVerdicts(runId, next).then(
          () => setSave("saved"),
          () => setSave("error"),
        );
      }, 400);
    },
    [selected, readOnly, adoptVerdicts],
  );

  const counts = useMemo(() => {
    const ids = detail?.run.styles.map((s) => s.id) ?? [];
    const kept = ids.filter((id) => verdicts[id]?.verdict === "keep").length;
    const rejected = ids.filter((id) => verdicts[id]?.verdict === "reject").length;
    return { total: ids.length, kept, rejected, undecided: ids.length - kept - rejected };
  }, [detail, verdicts]);

  const openConfirm = () => {
    if (!selected) return;
    const runId = selected;
    setConfirm(true);
    setCommitError(null);
    plan.prepare(() => previewExtractCommit(runId));
  };
  // What the server's plan says the commit will do beyond the counts: a kept
  // style whose id the catalogue already holds is written under a suffixed id,
  // and one whose observables match a catalogued style is named beside it.
  const renamed = commitPlan ? commitPlan.written.filter((w) => w.from !== w.to) : [];
  const nearDupes = commitPlan ? Object.entries(commitPlan.similar).filter(([, dupes]) => dupes.length > 0) : [];
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
      const r = await commitExtractRun(selected, commitPlan?.token);
      setResult(r);
      setConfirm(false);
      clearPlan();
      loadDetail(selected, false);
      loadRuns();
    } catch (e) {
      setCommitError(e instanceof Error ? e.message : "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const run = detail?.run ?? null;

  /** Why Commit will not go, in one clause — null when it will. Read from
   *  EXTRACT_COMMITTABLE, never an inline status comparison; commit-gate-parity
   *  holds that constant equal to commitExtractRun's own guard. */
  const blocked = !run
    ? null
    : !EXTRACT_COMMITTABLE.includes(run.status)
      ? `run is ${EXTRACT_STATUS_WORD[run.status]}`
      : counts.kept === 0
        ? "keep one style first"
        : null;


  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <RailFrame label="Extractions" count={runs?.length} error={runsError} onRetry={loadRuns}>
          <RailItem
            title="New extraction"
            icon={
              <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-lg border ${selected === null ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-200" : "border-white/10 text-white/55"}`}>
                <Plus className="h-3.5 w-3.5" />
              </span>
            }
            current={selected === null}
            onSelect={() => selectRun(null)}
          />
          {runs?.map((r) => (
            <RailItem
              key={r.id}
              kind={extractKind(r.status)}
              word={EXTRACT_STATUS_WORD[r.status]}
              title={r.id}
              current={r.id === selected}
              onSelect={() => selectRun(r.id)}
              progress={EXTRACT_LIVE.includes(r.status) ? r.progress : undefined}
              meta={
                <>
                  {r.sources} src · {r.styles} styles · <span className={r.kept ? "text-emerald-200/90" : ""}>{r.kept}</span> kept
                </>
              }
            />
          ))}
        </RailFrame>

        <div className="flex min-w-0 flex-col gap-5">
          {selected === null && <NewRun busy={creating} shrinking={shrinking} onStart={startRun} />}
          {selected && !run && <Loading label="reading the extraction" />}
          {run && (
            <>
              <RunStrip run={run} now={loadedAt} driving={driving} driveError={driveError} onResume={() => drive(run.id)} onRetry={() => drive(run.id, true)} onPause={pause} />
              {result && (
                <div role="status" className="font-jetbrains rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] px-4 py-3 text-label text-emerald-100/90">
                  committed · {result.written.join(", ")} → pipeline/foundry/styles.json · {result.rejected.length} rejected
                </div>
              )}
              <ExtractBoard
                run={run}
                verdicts={verdicts}
                focused={focused}
                readOnly={readOnly}
                onFocus={setFocused}
                onVerdict={setVerdict}
                keysEnabled={!confirm && !zoomOpen}
                onZoomChange={setZoomOpen}
              />
            </>
          )}
        </div>
      </div>

      {run && (
        <DecisionBar label="Decisions">
          <BarCount tone="emerald" n={counts.kept} label="kept" />
          <BarCount tone="rose" n={counts.rejected} label="rejected" />
          <BarCount tone="neutral" n={counts.undecided} label="undecided" />
          <SaveNote state={save} final={readOnly} />
          {!readOnly && (
            <Keycaps
              label="Board shortcuts"
              map={[
                { keys: ["↑", "↓"], does: "move" },
                { keys: ["K"], does: "keep" },
                { keys: ["X"], does: "reject" },
                { keys: ["U"], does: "clear" },
                { keys: ["Enter"], does: "inspect" },
              ]}
            />
          )}
          <span className="ml-auto flex items-center gap-3">
            {readOnly ? (
              <StatusChip kind="committed" word="committed" />
            ) : (
              // The reason a disabled control will not go, in one clause,
              // beside it — not three sentences behind a hover. The status
              // chip on the strip above already names the run's state.
              <>
                {blocked && <LockNote>{blocked}</LockNote>}
                <PrimaryAction disabled={Boolean(blocked)} onClick={openConfirm}>
                  Commit the kept styles
                </PrimaryAction>
              </>
            )}
          </span>
        </DecisionBar>
      )}

      <CommitDialog
        open={confirm}
        onClose={() => {
          if (committing) return;
          setConfirm(false);
          setCommitError(null);
          clearPlan();
        }}
        title="Commit the kept styles?"
        eyebrow={<Label>{selected}</Label>}
        railLabel="commit"
        rail={[
          { n: commitPlan ? commitPlan.counts.kept : counts.kept, tone: "emerald", label: "kept" },
          { n: commitPlan ? commitPlan.counts.rejected : counts.rejected, tone: "rose", label: "thrown" },
          { n: commitPlan ? commitPlan.counts.undecided : counts.undecided, tone: "rose", label: "undecided", hatched: true },
        ]}
        consequence={
          <>
            The kept styles join <code>pipeline/foundry/styles.json</code> as candidates, with their sources, best replicas and transfers as exemplars. Nothing is deleted, but the verdicts are final.
          </>
        }
        danger={false}
        busy={committing}
        preparing={plan.loading}
        confirmLabel={`Commit ${commitPlan ? commitPlan.counts.kept : counts.kept}, reject ${commitPlan ? commitPlan.counts.rejected + commitPlan.counts.undecided : counts.rejected + counts.undecided}`}
        onConfirm={doCommit}
        onCancel={closeConfirm}
      >
        {renamed.length > 0 && <PlanFact label="Renamed on catalogue collision">{renamed.map((w) => `${w.from} → ${w.to}`).join(", ")}</PlanFact>}
        {nearDupes.length > 0 && (
          <PlanFact label="Near duplicates in catalogue">{nearDupes.map(([sid, dupes]) => `${sid} ~ ${dupes.join(", ")}`).join("; ")}</PlanFact>
        )}
        {plan.error && (
          <div className="mt-4">
            <ErrorNote role="alert">Could not prepare the commit: {plan.error}</ErrorNote>
          </div>
        )}
        {commitError && (
          <div className="mt-4">
            <ErrorNote role="alert">The commit failed and no style was written: {commitError}</ErrorNote>
          </div>
        )}
      </CommitDialog>
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function RunStrip({
  run,
  now,
  driving,
  driveError,
  onResume,
  onRetry,
  onPause,
}: {
  run: ExtractDetail["run"];
  now: number;
  driving: boolean;
  driveError: string | null;
  onResume: () => void;
  onRetry: () => void;
  onPause: () => void;
}) {
  const live = EXTRACT_LIVE.includes(run.status);
  const other = foreignLease(run, "app", now);
  const retryable = !driving && !other && (run.status === "failed" || (run.status === "done" && hasFailures(run)));
  const last = run.log[run.log.length - 1];
  const engines = [
    run.engines.vision && ["eyes", run.engines.vision],
    run.engines.generator && ["pixels", run.engines.generator],
    run.engines.reasoner && ["words", run.engines.reasoner],
  ].filter((x): x is [string, string] => Boolean(x));
  return (
    <Glass className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h2 className="font-instrument truncate text-3xl text-white">{run.id}</h2>
          <StatusChip kind={extractKind(run.status)} word={EXTRACT_STATUS_WORD[run.status]} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {driveError && (live || retryable) && <span className="font-jetbrains text-label text-rose-200">{driveError}</span>}
          {retryable && (
            <Button variant="ghost" size="sm" onClick={onRetry} aria-label="Retry failed units: prune every failed unit and take it again">
              retry failed
            </Button>
          )}
          {live &&
            (other ? (
              <span className="font-jetbrains rounded-full border border-amber-400/30 bg-amber-400/[0.08] px-2.5 py-0.5 text-label text-amber-100" title={`lease stamped ${other.at}`}>
                driven by the {other.owner}
              </span>
            ) : driving ? (
              <Button variant="ghost" size="sm" onClick={onPause}>
                pause
              </Button>
            ) : (
              <Button size="sm" onClick={onResume}>
                {driveError ? "retry" : run.progress.done ? "resume" : "start"}
              </Button>
            ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Tally label="sources" value={run.sources.length} />
        <Tally label="styles" value={run.styles.length} />
        <Tally label="rounds" value={run.options.rounds} />
        <Tally label="replicas" value={run.options.replicas} />
        <Tally label="transfers" value={run.options.transfers} />
        {engines.map(([k, v]) => (
          <span key={k} className="font-jetbrains rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-label text-white/55">
            <span className="text-white/35">{k}</span> {v}
          </span>
        ))}
      </div>
      {live && (
        <div className="mt-4 flex flex-col gap-2">
          <ProgressRail done={run.progress.done} total={run.progress.total} />
          {last && <span className="font-jetbrains truncate text-label text-white/45">{last.msg}</span>}
        </div>
      )}
      {run.error && (
        <div className="mt-4">
          <ErrorNote>{run.error}</ErrorNote>
        </div>
      )}
    </Glass>
  );
}

const IMAGE_TYPE = /^image\/(png|jpeg|webp)$/;

/** What the gallery well takes, and the names of what it will not: a file that is not
 *  PNG / JPEG / WebP, and everything past the cap. */
export function acceptGallery(prev: File[], incoming: File[], cap = 60): { files: File[]; refused: string[] } {
  const refused: string[] = [];
  const files = [...prev];
  for (const f of incoming) {
    if (!IMAGE_TYPE.test(f.type) || files.length >= cap) refused.push(f.name);
    else files.push(f);
  }
  return { files, refused };
}

function NewRun({
  busy,
  shrinking,
  onStart,
}: {
  busy: boolean;
  shrinking: { done: number; total: number } | null;
  onStart: (slug: string, files: File[], o: { rounds: number; replicas: number; transfers: number; grouping?: "none" }) => void;
}) {
  const [slug, setSlug] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rounds, setRounds] = useState(2);
  const [replicas, setReplicas] = useState(2);
  const [transfers, setTransfers] = useState(1);
  const [singletons, setSingletons] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const [refused, setRefused] = useState<string[]>([]);

  const accept = (list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = [...list];
    const next = acceptGallery(files, incoming);
    setFiles(next.files);
    setRefused(next.refused);
    const first = incoming.find((f) => IMAGE_TYPE.test(f.type));
    if (!slug && first) setSlug(first.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 24));
  };

  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const ready = slug.trim().length > 0 && files.length > 0 && !busy;

  return (
    <Glass className="flex flex-col gap-5 p-5">
      {/* THE DROP TARGET IS A GLASS WELL, not a dashed box: the dashed outline
          was the kit's drawing of "empty", and on this ground it read as an
          unfinished page. It lights cyan while something is dragged over it.
          The name is on the control for anyone who cannot see the well; what
          is left visible is the constraint set, which no shape can draw. */}
      <div
        role="button"
        tabIndex={0}
        data-testid="extract-dropzone"
        aria-label="Drop images here, or click to choose"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        className={`group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border px-6 py-10 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
          dragging ? "border-cyan-300/60 bg-cyan-400/[0.08] shadow-[var(--gt-shadow-glow)]" : "border-white/10 bg-black/25 hover:border-white/20 hover:bg-white/[0.03]"
        }`}
      >
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => {
            // Copied out first: clearing the value empties the live FileList. Cleared so
            // choosing the SAME file again, after removing it below, fires change again.
            accept(e.target.files ? [...e.target.files] : null);
            e.target.value = "";
          }}
        />
        <span aria-hidden className={`grid h-14 w-14 place-items-center rounded-2xl border transition ${dragging ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-200" : "border-white/12 bg-white/[0.04] text-white/60 group-hover:text-white/85"}`}>
          <ImagePlus className="h-6 w-6" />
        </span>
        <span className="font-instrument text-2xl text-white/90">Drop a gallery</span>
        <span className="font-jetbrains text-label text-white/40">PNG · JPEG · WebP · up to 60 · shrunk to 1280px before upload</span>
      </div>

      {refused.length > 0 && (
        <p className="font-jetbrains rounded-xl border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-label break-words text-amber-200/90">
          Not added — {refused.join(" / ")}
        </p>
      )}

      {previews.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
          {previews.map((p, i) => (
            <button
              key={`${p.f.name}-${i}`}
              type="button"
              onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))}
              aria-label={`Remove ${p.f.name}`}
              className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/10 transition hover:ring-rose-400/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/60 opacity-0 transition group-hover:opacity-100">
                <X className="h-5 w-5 text-rose-200" />
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <label className="flex flex-col gap-1.5">
          <Label>slug</Label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-gallery"
            className="font-hanken h-10 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-content text-white/90 placeholder:text-white/30 focus:border-cyan-400/40"
          />
        </label>
        <Stepper label="rounds" value={rounds} min={1} max={4} onChange={setRounds} />
        <Stepper label="replicas" value={replicas} min={1} max={4} onChange={setReplicas} />
        <Stepper label="transfers" value={transfers} min={0} max={4} onChange={setTransfers} />
      </div>

      {/* THE DIFFERENTIATOR IS THE ARITHMETIC, not three sentences of `title=`.
          `N img → 1 style` against `1 img → 1 style` is what the switch
          changes; the ≈ chips on the board are what report the overlap after
          the fact, and they carry their own hint there. */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" checked={singletons} onChange={(e) => setSingletons(e.target.checked)} className="peer sr-only" />
          <span aria-hidden className="relative h-5 w-9 rounded-full border border-white/15 bg-white/[0.06] transition peer-checked:border-cyan-300/50 peer-checked:bg-cyan-400/25 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cyan-300 after:absolute after:top-0.5 after:left-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-white/70 after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-cyan-200" />
          <span className="font-hanken text-content text-white/80">one style per image — no grouping</span>
        </label>
        <span aria-hidden className="font-jetbrains rounded-full border border-white/10 px-2.5 py-0.5 text-label text-white/55">{singletons ? "1 img → 1 style" : "N img → 1 style"}</span>
        <Hint>each recipe is written with its own image in view</Hint>
      </div>

      {/* The cost, as arithmetic: one recognition per source, and per style up to
          replicas × rounds + transfers generations. Leaving the tab pauses the run. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Tally label="reads" value={files.length} />
          <span className="font-jetbrains inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-label text-white/60">
            <span className="uppercase opacity-55">generations per style</span> up to {replicas * rounds + transfers}
          </span>
          <Hint>leaving this tab pauses the run</Hint>
        </div>
        <div className="flex items-center gap-3">
          {/* The live region is rendered THROUGHOUT, empty when idle: a region
              inserted at the same moment it gains text is one a screen reader
              has no prior state to compare against, and announces nothing. */}
          <span aria-live="polite" className="font-jetbrains text-label text-white/50">
            {shrinking ? `shrinking ${Math.min(shrinking.done + 1, shrinking.total)} of ${shrinking.total}` : ""}
          </span>
          <PrimaryAction disabled={!ready} onClick={() => onStart(slug.trim(), files, { rounds, replicas, transfers, ...(singletons ? { grouping: "none" as const } : {}) })}>
            {busy ? "uploading…" : `Extract from ${files.length} image${files.length === 1 ? "" : "s"}`}
          </PrimaryAction>
        </div>
      </div>
    </Glass>
  );
}

/** A small bounded number, as − n + rather than a native spinner box. */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const btn = "grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-white/60 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:opacity-30";
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div role="group" aria-label={label} className="flex h-10 items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-1">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`fewer ${label}`}>
          <Minus aria-hidden className="h-3.5 w-3.5" />
        </button>
        <span className="font-jetbrains text-content text-white/90 tabular-nums" aria-live="polite">
          {value}
        </span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`more ${label}`}>
          <Plus aria-hidden className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
