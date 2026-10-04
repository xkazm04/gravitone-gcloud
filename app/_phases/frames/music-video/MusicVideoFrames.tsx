"use client";

// THE MUSIC-VIDEO DISCIPLINE'S FRAMES STEP. No shot ledger, no alternatives
// grid, no script to derive plates from — one poster, generated once, and an
// effects studio that animates it against the baked envelope WP2 wrote. This
// is the FIRST top-level discipline branch in this file's history (every
// other discipline's variation lives inside `useFrames`/`framesLane`
// instead); `ScriptStep.tsx` and `ScoreSpotting.tsx` already route a
// music-video project away from their standard surface the same way, at the
// top of the component, before any of the standard hooks mount.

import { useEffect, useState } from "react";

import { Tally } from "@/components/ui/signal";
import { elapsed, useJobs, type Job } from "@/lib/jobs";
import { useAuth } from "@/lib/useAuth";

import { type MusicVideoSourceStepData } from "../../_shared/stepStore";
import { useStepFor } from "../../_shared/useLoadFor";
import { usePhaseReport } from "../../_shared/usePhaseReport";

import EffectsStudio from "./EffectsStudio";
import { loadPosterAsset, useMusicVideoComposition } from "./useMusicVideoComposition";

/** Real, measured progress language — not an indefinite spinner. ~57s is what
 *  WP1 measured for `agy` serving the call; the cloud fallback can be faster,
 *  so this names the number it has without claiming it always applies. */
function PosterProgress({ job }: { job: Job }) {
  return (
    <p className="font-jetbrains text-label text-cyan-200/80" role="status" data-testid="music-video-poster-progress">
      generating the poster… {elapsed(job)} elapsed (agy measures ~57s; the cloud fallback can be quicker)
    </p>
  );
}

export default function MusicVideoFrames({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const jobs = useJobs();
  const comp = useMusicVideoComposition(projectId, user?.uid ?? null, jobs);
  const runningJob = jobs.runningFor(projectId, "poster-generate")[0];

  // THE ENVELOPE IS READ SEPARATELY, from Research's own record
  // (`music-video-source`, the same key this hook already writes
  // `posterAssetId`/`seed`/`effectParams` into) — it is WP2's output, not
  // this hook's to own, and a project whose track decode failed or has not
  // happened yet has no envelope to animate against at all. Through
  // `useStepFor` (the honest read: a failed read leaves this un-hydrated
  // rather than reading as "no envelope"), not a hand-rolled `let alive`.
  const [envelope, setEnvelope] = useState<MusicVideoSourceStepData["envelope"] | undefined>(undefined);
  const envelopeChecked = useStepFor<MusicVideoSourceStepData>(projectId, "music-video-source", (data) =>
    setEnvelope(data?.envelope),
  );

  // POSTER BYTES, resolved from the asset id into an object URL this
  // component owns and must revoke — `lib/assets.ts#hydrateUploadSrcs`'s own
  // discipline, applied by hand because this is one asset, not a gallery.
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  useEffect(() => {
    // No poster yet: nothing to load, and `posterUrl` already starts `null` —
    // a project never regains "no poster" after generating one, so there is
    // no transition here that needs to clear a stale url.
    if (!comp.posterAssetId) return;
    let alive = true;
    let ownUrl: string | null = null;
    void loadPosterAsset(comp.posterAssetId).then((r) => {
      if (!alive) {
        if (r) URL.revokeObjectURL(r.url);
        return;
      }
      if (r) {
        ownUrl = r.url;
        setPosterUrl(r.url);
      }
    });
    // The revoke runs on unmount/id-change either way; clearing the pointer
    // happens HERE, in the cleanup, rather than as a synchronous write at the
    // top of the effect body.
    return () => {
      alive = false;
      if (ownUrl) {
        URL.revokeObjectURL(ownUrl);
        setPosterUrl((cur) => (cur === ownUrl ? null : cur));
      }
    };
  }, [comp.posterAssetId]);

  // DERIVE, NEVER ASSERT (the Frames rule every other branch of this step
  // follows, per usePhaseReport's own header): a poster on screen is "done";
  // a generation in flight is "working"; nothing yet says nothing.
  usePhaseReport(
    projectId,
    "frames",
    !comp.hydrated ? null : comp.posterAssetId ? "done" : comp.status === "generating" ? "working" : null,
  );

  if (!comp.hydrated || !envelopeChecked)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase">
        reading the composition…
      </p>
    );

  if (!envelope)
    return (
      <p className="font-jetbrains text-label text-amber-200/85" data-testid="music-video-no-envelope">
        no analyzed track yet — attach one in Research before generating a poster.
      </p>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Tally label="duration" value={Math.round(envelope.durationS)} tone="neutral" title="seconds" />
        <Tally label="frames" value={envelope.frameCount} tone="neutral" />
        {comp.seed !== undefined && <Tally label="seed" value={comp.seed} tone="cyan" title="locked once set — reused on every render" />}
      </div>

      {!comp.posterAssetId && (
        <div className="space-y-2">
          <label className="block space-y-1.5">
            <span className="font-jetbrains text-label uppercase tracking-[0.14em] text-white/45">
              style (carried from Research, editable here)
            </span>
            <input
              type="text"
              value={comp.style}
              onChange={(e) => comp.setStyle(e.target.value)}
              placeholder="neon-drenched, slow dissolve, film-grain"
              data-testid="music-video-frames-style-input"
              className="font-hanken w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-content leading-snug text-slate-200 focus:border-cyan-400/40"
            />
          </label>
          <button
            type="button"
            onClick={() => void comp.generatePoster()}
            disabled={comp.status === "generating" || !user?.uid}
            data-testid="music-video-generate-poster"
            className="font-jetbrains rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-label text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            generate the poster
          </button>
          {runningJob && <PosterProgress job={runningJob} />}
          {comp.status === "error" && comp.error && (
            <p className="font-jetbrains text-label text-rose-200/85" role="alert" data-testid="music-video-poster-error">
              {comp.error}
            </p>
          )}
        </div>
      )}

      {comp.posterAssetId && comp.seed !== undefined && comp.effectParams && posterUrl && (
        <div className="space-y-2">
          <EffectsStudio posterUrl={posterUrl} envelope={envelope} seed={comp.seed} effectParams={comp.effectParams} />
          {comp.provider && (
            <p className="font-jetbrains text-label text-white/35" data-testid="music-video-poster-provider">
              poster generated via {comp.provider}
            </p>
          )}
        </div>
      )}

      {comp.posterAssetId && (!comp.effectParams || comp.seed === undefined) && (
        <p className="font-jetbrains text-label text-amber-200/85" data-testid="music-video-composition-incomplete">
          this composition is missing its seed or effect parameters — re-generate the poster.
        </p>
      )}
    </div>
  );
}
