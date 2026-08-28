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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Primitives";
import { foreignLease, hasFailures } from "@/lib/foundry/extract/engine";
import type { ExtractCommitResult, ExtractDetail, ExtractSummary, ExtractVerdict, ExtractVerdicts } from "@/lib/foundry/extract/types";

import { ExtractBoard } from "./ExtractBoard";
import { commitExtractRun, createExtractRun, fetchExtractRun, fetchExtractRuns, prepareUpload, saveExtractVerdicts, stepExtractRun } from "./extractClient";
import { EXTRACT_LIVE, EXTRACT_STATUS_WORD } from "./parts";

type SaveState = "idle" | "saving" | "saved" | "error";

export function ExtractView() {
  const [runs, setRuns] = useState<ExtractSummary[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExtractDetail | null>(null);
  const [verdicts, setVerdicts] = useState<ExtractVerdicts>({});
  const [save, setSave] = useState<SaveState>("idle");
  const [focused, setFocused] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [driving, setDriving] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ExtractCommitResult | null>(null);
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

  const loadDetail = useCallback(
    (id: string, keepVerdicts: boolean) =>
      fetchExtractRun(id).then((d) => {
        setDetail(d);
        setLoadedAt(Date.now());
        if (!keepVerdicts) adoptVerdicts(d.verdicts);
        return d;
      }),
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

  const startRun = async (slug: string, files: File[], options: { rounds: number; replicas: number; transfers: number }) => {
    setCreating(true);
    setRunsError(null);
    try {
      const uploads = [];
      for (const f of files) uploads.push(await prepareUpload(f));
      const run = await createExtractRun(slug, uploads, options);
      loadRuns();
      selectRun(run.id);
      void drive(run.id);
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "could not create the run");
    } finally {
      setCreating(false);
    }
  };

  // A live run this tab is NOT driving — the CLI, or another tab — rewrites
  // its manifest after every unit; poll it, keeping the local verdicts.
  const live = detail ? EXTRACT_LIVE.includes(detail.run.status) : false;
  useEffect(() => {
    if (!selected || !live || driving) return;
    const t = window.setInterval(() => {
      loadDetail(selected, true);
      loadRuns();
    }, 4000);
    return () => window.clearInterval(t);
  }, [selected, live, driving, loadDetail, loadRuns]);

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

  const doCommit = async () => {
    if (!selected) return;
    setCommitting(true);
    try {
      const r = await commitExtractRun(selected);
      setResult(r);
      setConfirm(false);
      loadDetail(selected, false);
      loadRuns();
    } catch (e) {
      setRunsError(e instanceof Error ? e.message : "commit failed");
    } finally {
      setCommitting(false);
    }
  };

  const run = detail?.run ?? null;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside>
          <button
            onClick={() => selectRun(null)}
            className={`font-jetbrains w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-[12px] transition ${
              selected === null ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-200" : "border-white/10 text-white/70 hover:bg-white/[0.03]"
            }`}
          >
            + new extraction
          </button>
          <div className="font-jetbrains mt-4 text-[11px] tracking-[0.14em] text-white/45 uppercase">runs</div>
          {runsError && <p className="font-jetbrains mt-2 text-[11px] text-rose-200">{runsError}</p>}
          {runs && runs.length === 0 && <p className="font-hanken mt-2 text-[12px] text-slate-400">No extractions yet.</p>}
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
                    {EXTRACT_STATUS_WORD[r.status]}
                    {EXTRACT_LIVE.includes(r.status) && r.progress.total > 0 ? ` ${r.progress.done}/${r.progress.total}` : ""}
                    {" · "}
                    {r.sources} src · {r.styles} styles · {r.kept} kept
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div>
          {selected === null && <NewRun busy={creating} onStart={startRun} />}
          {selected && !run && <p className="font-jetbrains text-[12px] text-white/40">loading…</p>}
          {run && (
            <>
              <StatusStrip run={run} now={loadedAt} driving={driving} driveError={driveError} onResume={() => drive(run.id)} onRetry={() => drive(run.id, true)} onPause={pause} />
              {result && (
                <div className="font-jetbrains mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-4 py-2 text-[11px] text-emerald-200">
                  committed · {result.written.join(", ")} → pipeline/foundry/styles.json · {result.rejected.length} rejected
                </div>
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[var(--gt-ink)]/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="font-jetbrains flex flex-wrap gap-4 text-[11px] text-white/60">
              <span>
                <span className="text-emerald-200">{counts.kept}</span> kept
              </span>
              <span>
                <span className="text-rose-200">{counts.rejected}</span> thrown
              </span>
              <span>
                <span className="text-white/90">{counts.undecided}</span> undecided
              </span>
              <span className={save === "error" ? "text-rose-200" : "text-white/35"}>
                {readOnly ? "committed · verdicts are final" : save === "saving" ? "saving…" : save === "saved" ? "saved" : save === "error" ? "save failed — retry a verdict" : ""}
              </span>
              {!readOnly && <span className="hidden text-white/30 md:inline">↑↓ rows · K keep · X throw · U clear</span>}
            </div>
            {readOnly ? (
              <span className="font-jetbrains rounded-full border border-emerald-400/30 px-4 py-2 text-[11px] tracking-[0.14em] text-emerald-200 uppercase">committed</span>
            ) : (
              <Button
                disabled={run.status !== "done" || counts.kept === 0}
                onClick={() => setConfirm(true)}
                className="cursor-pointer px-5 py-2 text-[12px] disabled:cursor-not-allowed"
                title={run.status !== "done" ? `Run is ${EXTRACT_STATUS_WORD[run.status]}` : counts.kept === 0 ? "Keep at least one style first" : "Write the kept styles to the catalogue"}
              >
                Learn the kept styles
              </Button>
            )}
          </div>
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => !committing && setConfirm(false)}
        title="Learn the kept styles?"
        className="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="cursor-pointer px-4 py-2" onClick={() => setConfirm(false)} disabled={committing}>
              Not yet
            </Button>
            <Button onClick={doCommit} disabled={committing} className="cursor-pointer px-5 py-2 text-[12px]">
              {committing ? "writing…" : `Learn ${counts.kept}, throw ${counts.rejected + counts.undecided}`}
            </Button>
          </div>
        }
      >
        <p className="font-hanken text-sm text-slate-300">
          <span className="text-emerald-200">{counts.kept}</span> kept style{counts.kept === 1 ? "" : "s"} join{counts.kept === 1 ? "s" : ""}{" "}
          <code className="font-jetbrains text-[11px] text-white/70">pipeline/foundry/styles.json</code> as candidates, with their sources, best replicas and transfers as exemplars. The forge
          can be pointed at them from the next plan. Undecided counts as thrown. Nothing is deleted, but the verdicts are final.
        </p>
      </Modal>
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function StatusStrip({
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
  const pct = run.progress.total ? Math.round((100 * run.progress.done) / run.progress.total) : 0;
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
          {EXTRACT_STATUS_WORD[run.status]}
          {live && run.progress.total > 0 ? ` ${run.progress.done}/${run.progress.total}` : ""}
        </span>
        <span className="font-jetbrains text-[11px] text-white/50">
          {run.sources.length} source{run.sources.length === 1 ? "" : "s"} · {run.styles.length} style{run.styles.length === 1 ? "" : "s"} · {run.options.replicas}×{run.options.rounds} rounds ·{" "}
          {run.options.transfers} transfer{run.options.transfers === 1 ? "" : "s"}
        </span>
        {(run.engines.vision || run.engines.generator || run.engines.reasoner) && (
          <span className="font-jetbrains text-[10px] text-white/35">
            {[run.engines.vision && `eyes ${run.engines.vision}`, run.engines.generator && `pixels ${run.engines.generator}`, run.engines.reasoner && `words ${run.engines.reasoner}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        {run.error && <span className="font-jetbrains text-[11px] text-rose-200">{run.error}</span>}
        {retryable && (
          <span className="ml-auto flex items-center gap-2">
            {driveError && <span className="font-jetbrains text-[11px] text-rose-200">{driveError}</span>}
            <Button className="cursor-pointer px-3 py-1 text-[11px]" onClick={onRetry} title="Prune every failed unit and take it again">
              retry failed
            </Button>
          </span>
        )}
        {live && (
          <span className="ml-auto flex items-center gap-2">
            {driveError && <span className="font-jetbrains text-[11px] text-rose-200">{driveError}</span>}
            {other ? (
              <span className="font-jetbrains rounded-full border border-amber-400/30 px-3 py-1 text-[10px] tracking-[0.14em] text-amber-200 uppercase" title={`lease stamped ${other.at}`}>
                driven by the {other.owner}
              </span>
            ) : driving ? (
              <Button variant="ghost" className="cursor-pointer px-3 py-1 text-[11px]" onClick={onPause}>
                pause
              </Button>
            ) : (
              <Button className="cursor-pointer px-3 py-1 text-[11px]" onClick={onResume}>
                {driveError ? "retry" : run.progress.done ? "resume" : "start"}
              </Button>
            )}
          </span>
        )}
      </div>
      {live && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-cyan-300/70 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      {live && last && <p className="font-jetbrains mt-1.5 truncate text-[10px] text-white/35">{last.msg}</p>}
    </div>
  );
}

function NewRun({ busy, onStart }: { busy: boolean; onStart: (slug: string, files: File[], o: { rounds: number; replicas: number; transfers: number }) => void }) {
  const [slug, setSlug] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [rounds, setRounds] = useState(2);
  const [replicas, setReplicas] = useState(2);
  const [transfers, setTransfers] = useState(1);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <div
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
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border border-dashed px-6 py-10 text-center transition ${
          dragging ? "border-cyan-300/60 bg-cyan-400/5" : "border-white/15 hover:border-white/30"
        }`}
      >
        <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => accept(e.target.files)} />
        <p className="font-hanken text-sm text-slate-300">Drop screenshots and images here, or click to choose.</p>
        <p className="font-jetbrains mt-1 text-[11px] text-white/40">PNG · JPEG · WebP · up to 60 · shrunk to 1280px before upload</p>
      </div>

      {previews.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
          {previews.map((p, i) => (
            <button
              key={`${p.f.name}-${i}`}
              onClick={() => setFiles((fs) => fs.filter((_, k) => k !== i))}
              title={`${p.f.name} — click to remove`}
              className="group relative aspect-video overflow-hidden rounded-md border border-white/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
              <img src={p.url} alt={p.f.name} className="h-full w-full object-cover" />
              <span className="font-jetbrains absolute inset-0 hidden items-center justify-center bg-black/60 text-[10px] text-rose-200 group-hover:flex">remove</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="flex flex-col gap-1">
          <span className="font-jetbrains text-[10px] tracking-[0.14em] text-white/45 uppercase">slug</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-gallery"
            className="font-jetbrains rounded-lg border border-white/10 bg-transparent px-3 py-2 text-[12px] text-white/90 outline-none focus:border-cyan-400/40"
          />
        </label>
        <Num label="rounds" value={rounds} min={1} max={4} onChange={setRounds} hint="self-critique rounds per replica" />
        <Num label="replicas" value={replicas} min={1} max={4} onChange={setReplicas} hint="sources replicated per style" />
        <Num label="transfers" value={transfers} min={0} max={4} onChange={setTransfers} hint="neutral scenes per style" />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="font-hanken max-w-lg text-[12px] text-slate-400">
          Each source costs one recognition; each style costs up to replicas × rounds + transfers generations, each read back once. The run pauses if you leave this tab and resumes where it
          stopped.
        </p>
        <Button disabled={!ready} onClick={() => onStart(slug.trim(), files, { rounds, replicas, transfers })} className="cursor-pointer px-5 py-2 text-[12px] disabled:cursor-not-allowed">
          {busy ? "uploading…" : `Extract from ${files.length} image${files.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </div>
  );
}

function Num({ label, value, min, max, onChange, hint }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; hint: string }) {
  return (
    <label className="flex flex-col gap-1" title={hint}>
      <span className="font-jetbrains text-[10px] tracking-[0.14em] text-white/45 uppercase">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="font-jetbrains w-20 rounded-lg border border-white/10 bg-transparent px-3 py-2 text-[12px] text-white/90 outline-none focus:border-cyan-400/40"
      />
    </label>
  );
}
