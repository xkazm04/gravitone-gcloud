"use client";

// THE MUSIC-VIDEO DISCIPLINE'S CUT STEP — no timeline, no tracks, no sync
// bench (there is nothing to sync: one poster, one baked envelope, one
// render). Pick a resolution, export, download. `CutTimeline.tsx` routes here
// the same way `FramesStep.tsx` routes to `MusicVideoFrames` — before any of
// the standard fixture-reading code runs.

import { useState } from "react";

import { Tally } from "@/components/ui/signal";
import { useElapsed, useJobs, type Job } from "@/lib/jobs";

import { type MusicVideoSourceStepData } from "../../_shared/stepStore";
import { useStepFor } from "../../_shared/useLoadFor";

import { EXPORT_RESOLUTION_IDS, EXPORT_RESOLUTION_LABEL } from "./resolutions";
import { useMusicVideoExport } from "./useMusicVideoExport";

/** The download link's href, with the (already PUBLIC, per lib/apiAuth.ts's
 *  own header) access secret appended as `k=` when one is configured — a plain
 *  `<a href>`/download click cannot carry an `Authorization` header, so the
 *  file route accepts this fallback the same way `app/foundry/foundryClient.ts#fileUrl`
 *  already does for its own gallery tiles. */
function downloadHref(url: string): string {
  const k = process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET?.trim();
  if (!k) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}k=${encodeURIComponent(k)}`;
}

/** Real elapsed time, not a fraction — `lib/jobs.tsx`'s own rule for a driven
 *  job with no schedule. A multi-minute track's frame-by-frame capture has no
 *  mid-flight percentage this app's job system can report (see the hook's own
 *  header), and a surface that invented one would be the "fake progress bar"
 *  the WP5 brief explicitly asks not to build. */
function ExportProgress({ job }: { job: Job }) {
  const clock = useElapsed(job);
  return (
    <p className="font-jetbrains text-label text-cyan-200/80" data-testid="music-video-export-progress">
      <span role="status">rendering frame-by-frame, then muxing…</span>{" "}
      <span aria-hidden="true">{clock} elapsed</span> (no per-frame progress — the whole
      call is one request, not a stream)
    </p>
  );
}

export default function MusicVideoExport({ projectId }: { projectId: string }) {
  const jobs = useJobs();
  const [comp, setComp] = useState<MusicVideoSourceStepData | undefined>(undefined);
  const hydrated = useStepFor<MusicVideoSourceStepData>(projectId, "music-video-source", setComp);
  const exportState = useMusicVideoExport(projectId, jobs);
  const runningJob = jobs.runningFor(projectId, "video-export")[0];

  if (!hydrated)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the composition…
      </p>
    );

  const ready = Boolean(
    comp?.sourceAssetId && comp?.posterAssetId && comp?.envelope && comp?.seed !== undefined && comp?.effectParams,
  );

  if (!ready)
    return (
      <p className="font-jetbrains text-label text-amber-200/85" data-testid="music-video-export-not-ready">
        this composition is not ready to export — attach a track in Research and generate a poster in
        Frames first.
      </p>
    );

  const busy = exportState.status === "preparing" || exportState.status === "exporting";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tally label="duration" value={Math.round(comp!.envelope!.durationS)} tone="neutral" title="seconds" />
        <Tally label="frames" value={comp!.envelope!.frameCount} tone="neutral" />
        <Tally label="fps" value={comp!.envelope!.fps} tone="neutral" />
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="export resolution">
        {EXPORT_RESOLUTION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => exportState.setResolution(id)}
            disabled={busy}
            aria-pressed={exportState.resolution === id}
            data-testid={`music-video-resolution-${id}`}
            className={`font-jetbrains rounded-lg border px-3 py-1.5 text-label transition disabled:cursor-not-allowed disabled:opacity-40 ${
              exportState.resolution === id
                ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                : "border-white/15 text-white/70 hover:bg-white/5"
            }`}
          >
            {EXPORT_RESOLUTION_LABEL[id]}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void exportState.runExport(comp!)}
        disabled={busy}
        data-testid="music-video-run-export"
        className="font-jetbrains rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-label text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "exporting…" : `export · ${EXPORT_RESOLUTION_LABEL[exportState.resolution]}`}
      </button>

      {runningJob && <ExportProgress job={runningJob} />}

      {exportState.status === "error" && exportState.error && (
        <p className="font-jetbrains text-label text-rose-200/85" role="alert" data-testid="music-video-export-error">
          {exportState.error}
        </p>
      )}

      {exportState.status === "done" && exportState.result && (
        <div className="space-y-1.5 rounded-xl border border-emerald-400/25 bg-emerald-400/5 px-4 py-2.5">
          <p className="font-jetbrains text-content text-emerald-200" data-testid="music-video-export-summary">
            {exportState.result.width}×{exportState.result.height} · {exportState.result.frameCount} frames ·{" "}
            {(exportState.result.sizeBytes / (1024 * 1024)).toFixed(1)}MB · {exportState.result.encoder} ·{" "}
            {(exportState.result.wallMs / 1000).toFixed(1)}s total
          </p>
          <a
            href={downloadHref(exportState.result.downloadUrl)}
            download={`music-video-${exportState.result.id}.mp4`}
            data-testid="music-video-download"
            className="font-jetbrains inline-block text-label text-cyan-200 underline underline-offset-2"
          >
            download the mp4
          </a>
        </div>
      )}
    </div>
  );
}
