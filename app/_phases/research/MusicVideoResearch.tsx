"use client";

// THE MUSIC-VIDEO DISCIPLINE'S RESEARCH SURFACE. No notebook, no scope, no
// beat board — one attach and an optional style line. `useMusicVideoSource`
// owns the whole record (the upload, the baked envelope, and marking the
// project researched); this file is drawing only.

import { Dropzone } from "@/components/kit";
import { Tally } from "@/components/ui/signal";
import { useAuth } from "@/lib/useAuth";

import { usePhaseReport } from "../_shared/usePhaseReport";
import { useMusicVideoSource } from "./useMusicVideoSource";

export default function MusicVideoResearch({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const mv = useMusicVideoSource(projectId, user?.uid ?? null);

  // WHAT THIS SURFACE REPORTS TO THE SHELF (derive, never assert — the Frames
  // rule every other branch of this step follows). A decoded envelope is the
  // sign-off (it is also what unblocks Script, via `markResearched` inside the
  // hook); an attach in flight is `working`; nothing attached says nothing.
  usePhaseReport(
    projectId,
    "research",
    !mv.hydrated ? null : mv.envelope ? "done" : mv.status === "decoding" ? "working" : null,
  );

  if (!mv.hydrated)
    return <p className="font-jetbrains text-label text-white/35">opening the project’s track…</p>;

  return (
    <div className="space-y-5">
      {!mv.envelope && (
        <Dropzone
          accept="audio/*"
          constraints="mp3 · wav · m4a — one track, analyzed once on drop"
          label="Attach the track this video is cut to"
          onFiles={mv.attach}
          testId="music-video-dropzone"
        />
      )}

      {mv.status === "decoding" && (
        <p className="font-jetbrains text-label text-cyan-200/80" role="status" data-testid="music-video-decoding">
          decoding {mv.fileName ?? "the track"}…
        </p>
      )}

      {mv.status === "error" && mv.error && (
        <p
          className="font-jetbrains text-label text-rose-200/85"
          role="alert"
          data-testid="music-video-decode-error"
        >
          {mv.error}
        </p>
      )}

      {mv.envelope && (
        <div className="flex flex-wrap items-center gap-2" data-testid="music-video-envelope-summary">
          <Tally label="duration" value={Math.round(mv.envelope.durationS)} tone="neutral" title="seconds" />
          <Tally label="frames" value={mv.envelope.frameCount} tone="neutral" />
          <Tally label="fps" value={mv.envelope.fps} tone="neutral" />
          {mv.envelope.tempo.confidence > 0 ? (
            <>
              <Tally label="tempo" value={Math.round(mv.envelope.tempo.baseBpm)} tone="cyan" />
              <Tally label="half" value={Math.round(mv.envelope.tempo.halfBpm)} tone="neutral" />
              <Tally label="double" value={Math.round(mv.envelope.tempo.doubleBpm)} tone="neutral" />
            </>
          ) : (
            <Tally label="tempo" value={0} tone="rose" title="no onsets found — confidence 0" />
          )}
        </div>
      )}

      <label className="block space-y-1.5">
        <span className="font-jetbrains text-label uppercase tracking-[0.14em] text-white/45">
          style (optional)
        </span>
        <input
          type="text"
          value={mv.style}
          onChange={(e) => mv.setStyle(e.target.value)}
          placeholder="neon-drenched, slow dissolve, film-grain"
          data-testid="music-video-style-input"
          className="font-hanken w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-content leading-snug text-slate-200 focus:border-cyan-400/40"
        />
      </label>
    </div>
  );
}
