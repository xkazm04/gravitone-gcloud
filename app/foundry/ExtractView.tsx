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
// Drawn from the kit (components/kit), like the rest of /foundry: what is left
// here is the drive loop, the verdict state and the upload form.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  CheckField,
  Chip,
  ConfirmDialog,
  Count,
  Dock,
  DockAction,
  Dropzone,
  ErrorBox,
  FieldRow,
  Final,
  Ghost,
  Hint,
  KeyRow,
  Kicker,
  Loading,
  LockNote,
  NumberField,
  PanelBox,
  Report,
  SaveState,
  SideItem,
  SideList,
  StatusGlyph,
  StatusStrip,
  TextField,
} from "@/components/kit";
import { foreignLease, hasFailures } from "@/lib/foundry/extract/engine";
import type { ExtractCommitPlan, ExtractCommitResult, ExtractDetail, ExtractSummary, ExtractVerdict, ExtractVerdicts } from "@/lib/foundry/extract/types";
import { usePolling } from "@/lib/usePolling";

import { ExtractBoard } from "./ExtractBoard";
import { commitExtractRun, createExtractRun, fetchExtractRun, fetchExtractRuns, prepareUpload, previewExtractCommit, saveExtractVerdicts, stepExtractRun } from "./extractClient";
import { EXTRACT_COMMITTABLE, EXTRACT_LIVE, EXTRACT_STATUS_WORD, extractKind } from "./parts";

type SaveKind = "idle" | "saving" | "saved" | "error";

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
  const [commitPlan, setCommitPlan] = useState<ExtractCommitPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
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
      setCommitPlan(null);
      setFocused(null);
      setSave("idle");
      if (id) loadDetail(id, false);
    },
    [loadDetail],
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
    setConfirm(true);
    setCommitError(null);
    setLoadingPlan(true);
    previewExtractCommit(selected)
      .then(
        (p) => setCommitPlan(p),
        (e) => setCommitError(e instanceof Error ? e.message : "could not prepare commit plan"),
      )
      .finally(() => setLoadingPlan(false));
  };

  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const r = await commitExtractRun(selected, commitPlan?.token);
      setResult(r);
      setConfirm(false);
      setCommitPlan(null);
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
        ? "keep at least one style first"
        : null;

  return (
    <>
      <div className="k-two">
        <SideList
          label="Extraction runs"
          heading="Runs"
          pinned={<SideItem glyph={<StatusGlyph kind="undecided" decorative />} title="+ new extraction" current={selected === null} onSelect={() => selectRun(null)} />}
          aside={
            <>
              {runsError && (
                <ErrorBox
                  action={
                    <Button variant="ghost" size="sm" onClick={loadRuns}>
                      Retry
                    </Button>
                  }
                >
                  {runsError}
                </ErrorBox>
              )}
              {runs && runs.length === 0 && <Ghost shape="row" count={2} label="no extractions yet" />}
            </>
          }
        >
          {runs?.map((r) => (
            <SideItem
              key={r.id}
              glyph={<StatusGlyph kind={extractKind(r.status)} decorative />}
              title={r.id}
              current={r.id === selected}
              onSelect={() => selectRun(r.id)}
              meta={
                <>
                  {EXTRACT_STATUS_WORD[r.status]}
                  {EXTRACT_LIVE.includes(r.status) && r.progress.total > 0 ? (
                    <>
                      {" "}
                      <b className="k-num">
                        {r.progress.done}/{r.progress.total}
                      </b>
                    </>
                  ) : null}
                  {" · "}
                  {r.sources} src · {r.styles} styles · <b className="k-num">{r.kept}</b> kept
                </>
              }
            />
          ))}
        </SideList>

        <div>
          {selected === null && <NewRun busy={creating} shrinking={shrinking} onStart={startRun} />}
          {selected && !run && <Loading />}
          {run && (
            <>
              <RunStrip run={run} now={loadedAt} driving={driving} driveError={driveError} onResume={() => drive(run.id)} onRetry={() => drive(run.id, true)} onPause={pause} />
              {result && (
                <Report>
                  committed · {result.written.join(", ")} → pipeline/foundry/styles.json · {result.rejected.length} rejected
                </Report>
              )}
              <div className="mt-5">
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
              </div>
            </>
          )}
        </div>
      </div>

      {run && (
        <Dock label="Decisions">
          <Count kind="keep" n={counts.kept} label="kept" />
          <Count kind="reject" n={counts.rejected} label="rejected" />
          <Count kind="undecided" n={counts.undecided} label="undecided" />
          <SaveState state={save} final={readOnly} />
          {!readOnly && (
            <KeyRow
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
          <DockAction>
            {readOnly ? (
              <Final>committed</Final>
            ) : (
              // The reason a disabled control will not go, in one clause,
              // beside it — not three sentences behind a hover. The status
              // pill on the strip above already names the run's state.
              <>
                {blocked && <LockNote>{blocked}</LockNote>}
                <Button disabled={Boolean(blocked)} onClick={openConfirm}>
                  Commit the kept styles
                </Button>
              </>
            )}
          </DockAction>
        </Dock>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => {
          if (committing) return;
          setConfirm(false);
          setCommitError(null);
          setCommitPlan(null);
        }}
        title="Commit the kept styles?"
        eyebrow={<Kicker>{selected}</Kicker>}
        railLabel="commit"
        rail={[
          { n: commitPlan ? commitPlan.counts.kept : counts.kept, tone: "emerald", label: "kept" },
          { n: commitPlan ? commitPlan.counts.rejected : counts.rejected, tone: "rose", label: "thrown" },
          { n: commitPlan ? commitPlan.counts.undecided : counts.undecided, tone: "rose", label: "undecided", hatched: true },
        ]}
        consequence={
          <>
            The kept styles join <code>pipeline/foundry/styles.json</code> as candidates, with their sources, best replicas and transfers as exemplars. Nothing is deleted, but the verdicts are final.
            {commitPlan && commitPlan.written.some((w) => w.from !== w.to) && (
              <div className="mt-2 text-xs">
                Renamed on catalogue collision:{" "}
                <b>
                  {commitPlan.written
                    .filter((w) => w.from !== w.to)
                    .map((w) => `${w.from} → ${w.to}`)
                    .join(", ")}
                </b>
              </div>
            )}
            {commitPlan &&
              Object.keys(commitPlan.similar).some((k) => commitPlan.similar[k].length > 0) && (
                <div className="mt-2 text-xs">
                  Near duplicates in catalogue:{" "}
                  <b>
                    {Object.entries(commitPlan.similar)
                      .filter(([, dupes]) => dupes.length > 0)
                      .map(([sid, dupes]) => `${sid} ~ ${dupes.join(", ")}`)
                      .join("; ")}
                  </b>
                </div>
              )}
          </>
        }
        tone="gold"
        busy={committing || loadingPlan}
        confirmLabel={
          loadingPlan
            ? "Preparing..."
            : `Commit ${commitPlan ? commitPlan.counts.kept : counts.kept}, reject ${(commitPlan ? commitPlan.counts.rejected + commitPlan.counts.undecided : counts.rejected + counts.undecided)}`
        }
        onConfirm={doCommit}
        onCancel={() => {
          setConfirm(false);
          setCommitError(null);
          setCommitPlan(null);
        }}
      >
        {commitError && (
          <div className="mt-3">
            <ErrorBox role="alert">The commit failed and no style was written: {commitError}</ErrorBox>
          </div>
        )}
      </ConfirmDialog>
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
  const engines = [run.engines.vision && `eyes ${run.engines.vision}`, run.engines.generator && `pixels ${run.engines.generator}`, run.engines.reasoner && `words ${run.engines.reasoner}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <StatusStrip
      kind={extractKind(run.status)}
      word={EXTRACT_STATUS_WORD[run.status]}
      progress={live ? run.progress : undefined}
      facts={
        <>
          <b>{run.sources.length}</b> source{run.sources.length === 1 ? "" : "s"} · <b>{run.styles.length}</b> style{run.styles.length === 1 ? "" : "s"} · {run.options.replicas}×{run.options.rounds} rounds ·{" "}
          {run.options.transfers} transfer{run.options.transfers === 1 ? "" : "s"}
          {engines && <> · {engines}</>}
        </>
      }
      error={run.error}
      log={live && last ? last.msg : null}
      actions={
        <>
          {driveError && (live || retryable) && <span className="k-err">{driveError}</span>}
          {retryable && (
            <Button variant="ghost" size="sm" onClick={onRetry} title="Prune every failed unit and take it again">
              retry failed
            </Button>
          )}
          {live &&
            (other ? (
              <span title={`lease stamped ${other.at}`}>
                <Chip tone="gold">driven by the {other.owner}</Chip>
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
        </>
      }
    />
  );
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

  const accept = (list: FileList | File[] | null) => {
    if (!list) return;
    const imgs = [...list].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
    setFiles((prev) => [...prev, ...imgs].slice(0, 60));
    if (!slug && imgs[0]) setSlug(imgs[0].name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 24));
  };

  const previews = useMemo(() => files.map((f) => ({ f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const ready = slug.trim().length > 0 && files.length > 0 && !busy;

  return (
    <PanelBox>
      {/* A DASHED BOX SAYS "DROP HERE" — the sentence that said it too went.
          The name is on the control for anyone who cannot see the box; what
          is left visible is the constraint set, which no shape can draw. */}
      <Dropzone
        testId="extract-dropzone"
        label="Drop images here, or click to choose"
        accept="image/png,image/jpeg,image/webp"
        constraints="PNG · JPEG · WebP · up to 60 · shrunk to 1280px before upload"
        onFiles={accept}
      />

      {previews.length > 0 && (
        <div className="k-prev">
          {previews.map((p, i) => (
            <button key={`${p.f.name}-${i}`} type="button" onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))} aria-label={`Remove ${p.f.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={p.url} alt="" />
              <span aria-hidden="true">remove</span>
            </button>
          ))}
        </div>
      )}

      <FieldRow>
        <TextField label="slug" value={slug} onChange={setSlug} placeholder="my-gallery" />
        <NumberField label="rounds" value={rounds} min={1} max={4} onChange={setRounds} hint="self-critique rounds per replica" />
        <NumberField label="replicas" value={replicas} min={1} max={4} onChange={setReplicas} hint="sources replicated per style" />
        <NumberField label="transfers" value={transfers} min={0} max={4} onChange={setTransfers} hint="neutral scenes per style" />
      </FieldRow>

      {/* THE DIFFERENTIATOR IS THE ARITHMETIC, not three sentences of `title=`.
          `N img → 1 style` against `1 img → 1 style` is what the checkbox
          changes; the ≈ chips on the board are what report the overlap after
          the fact, and they carry their own hint there. */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <CheckField label="one style per image — no grouping" checked={singletons} onChange={setSingletons} />
        <span aria-hidden="true">
          <Chip>{singletons ? "1 img → 1 style" : "N img → 1 style"}</Chip>
        </span>
        <Hint>each recipe is written with its own image in view</Hint>
      </div>

      {/* The cost, as arithmetic: one recognition per source, and per style up to
          replicas × rounds + transfers generations. Leaving the tab pauses the run. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip name="reads">{files.length}</Chip>
          <Chip name="generations per style">up to {replicas * rounds + transfers}</Chip>
          <Hint>leaving this tab pauses the run</Hint>
        </div>
        <div className="flex items-center gap-3">
          {/* The live region is rendered THROUGHOUT, empty when idle: a region
              inserted at the same moment it gains text is one a screen reader
              has no prior state to compare against, and announces nothing. */}
          <span aria-live="polite" className="k-muted">
            {shrinking ? `shrinking ${Math.min(shrinking.done + 1, shrinking.total)} of ${shrinking.total}` : ""}
          </span>
          <Button disabled={!ready} onClick={() => onStart(slug.trim(), files, { rounds, replicas, transfers, ...(singletons ? { grouping: "none" as const } : {}) })}>
            {busy ? "uploading…" : `Extract from ${files.length} image${files.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </PanelBox>
  );
}
