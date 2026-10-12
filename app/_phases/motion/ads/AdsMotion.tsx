"use client";

// THE ADS DISCIPLINE'S MOTION STEP — per shot: the key image Frames adopted,
// its motion line, and a costed image-to-video clip on demand. The price is
// shown before anything is spent; re-animating is explicit and costed again;
// earlier clips are kept and any finished one can be adopted. Finish
// concatenates the adopted clips.
//
// Mounted by MotionStep's discipline router before any explainer hook runs.
// State and every write live in ./useAdsMotion (on frames/ads/useAdsShots).

import { useState } from "react";

import Clip from "@/components/ui/Clip";
import { Button } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Select";
import { CHIP_CLASS, Provenance, TALLY_TONE, UpstreamBreak } from "@/components/ui/signal";
import type { AdShotSpec } from "@/lib/ads/types";
import { clipFileUrl } from "@/lib/imaging/video/client";
import { CLIP_DURATIONS, type ClipDuration, type ClipRecord, type CostBasis, type VideoModel } from "@/lib/imaging/video/types";

import { usePhaseReport } from "../../_shared/usePhaseReport";
import { AdsGate, AdsHeader, AdsLoading, ASPECT_CLASS, ShotErrorLine, ShotRail, ShotSpecCard } from "../../frames/ads/parts";
import { clipDurationFor, EMPTY_SHOT, useAssetUrls } from "../../frames/ads/useAdsShots";

import { useAdsMotion, type AdsMotionApi } from "./useAdsMotion";

/** A figure with how to read it: an estimate says so, a missing one is "unpriced". */
const money = (usd: number | null, basis: CostBasis) =>
  usd === null ? "unpriced" : `$${usd.toFixed(2)}${basis === "estimated" ? " est." : ""}`;

const STATUS_TONE: Record<ClipRecord["status"], keyof typeof TALLY_TONE> = {
  queued: "neutral",
  rendering: "cyan",
  done: "emerald",
  failed: "rose",
  refused: "amber",
};

export default function AdsMotion({ projectId }: { projectId: string }) {
  const ctl = useAdsMotion(projectId);
  const [chosen, setChosen] = useState<string | null>(null);

  const total = ctl.shots.length;
  // Derived, never asserted: done when every shot has an adopted, finished
  // clip; working once any clip exists.
  usePhaseReport(
    projectId,
    "motion",
    !ctl.loaded || !ctl.picked || ctl.stale ? null : total > 0 && ctl.adoptedCount === total ? "done" : ctl.anyClip ? "working" : null,
  );

  const active = ctl.shots.find((s) => s.id === chosen) ?? ctl.shots[0];
  // The adopted still of the shot ON SCREEN only — the panel draws one; every
  // shot's used to be read and minted on open. useAssetUrls keeps what it has
  // minted, so a shot opened once stays instant.
  const adoptedId = active ? ctl.shotsData.shots[active.id]?.adoptedImage : undefined;
  const urls = useAssetUrls(adoptedId ? [adoptedId] : []);

  if (!ctl.loaded) return <AdsLoading testId="AdsMotion-loading" />;
  if (ctl.refused || !ctl.picked) return <AdsGate base={ctl} projectId={projectId} current="motion" testId="AdsMotion-no-scenario" />;

  return (
    <div className="space-y-4" data-testid="AdsMotion" data-project={projectId}>
      <AdsHeader base={ctl} count={{ label: "clips", value: ctl.adoptedCount, of: total }} />
      {active && (
        <>
          <ShotRail
            shots={ctl.shots}
            active={active.id}
            onSelect={setChosen}
            errors={ctl.shotError}
            tallyOf={(s) => {
              const st = ctl.shotsData.shots[s.id] ?? EMPTY_SHOT;
              const clip = st.adoptedClip ? ctl.clipRecords[st.adoptedClip] : undefined;
              if (clip?.status === "done") return { value: 1, of: 1, label: "clip", tone: "emerald" };
              return { value: st.clips.length, label: "clips", tone: st.adoptedImage ? "cyan" : "neutral" };
            }}
          />
          <ShotPanel key={active.id} ctl={ctl} projectId={projectId} shot={active} index={ctl.shots.indexOf(active)} urls={urls} />
        </>
      )}
    </div>
  );
}

function ShotPanel({
  ctl,
  projectId,
  shot,
  index,
  urls,
}: {
  ctl: AdsMotionApi;
  projectId: string;
  shot: AdShotSpec;
  index: number;
  urls: Map<string, string>;
}) {
  const st = ctl.shotsData.shots[shot.id] ?? EMPTY_SHOT;
  const busy = ctl.busy[shot.id];
  const frame = ASPECT_CLASS[ctl.aspect] ?? "aspect-video";
  const tall = ctl.aspect === "9:16";
  const locked = ctl.stale;
  const adoptedUrl = st.adoptedImage ? urls.get(st.adoptedImage) : undefined;
  const adoptedClip = st.adoptedClip ? ctl.clipRecords[st.adoptedClip] : undefined;

  return (
    <section className="space-y-4" aria-label={`shot ${index + 1}`} data-testid={`ads-shot-${shot.id}`}>
      <ShotSpecCard shot={shot} />
      <ShotErrorLine err={ctl.shotError[shot.id]} />

      {!st.adoptedImage ? (
        <div data-testid="ads-motion-no-image">
          <UpstreamBreak
            blockedAt="frames"
            current="motion"
            done={["research", "script"]}
            action={{ label: "Open Frames", href: `/studio/${projectId}?step=frames` }}
          />
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          {/* The still the clip starts on, and — once one is adopted — the clip. */}
          <div className={`flex flex-wrap items-start gap-4 ${tall ? "" : "flex-col"}`}>
            <figure className={`${frame} ${tall ? "w-56" : "w-full"} overflow-hidden rounded-xl border border-cyan-400/40 bg-white/[0.03]`}>
              {adoptedUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from IndexedDB; next/image cannot optimise it
                <img src={adoptedUrl} alt={`shot ${index + 1}, adopted key image`} decoding="async" className="h-full w-full object-cover" />
              )}
            </figure>
            {adoptedClip?.status === "done" && (
              <div className={`${frame} ${tall ? "w-56" : "w-full"} overflow-hidden rounded-xl border border-emerald-400/30`} data-testid="ads-adopted-clip">
                <Clip
                  sources={[{ src: clipFileUrl(adoptedClip.clipId), type: "video/mp4" }]}
                  poster={adoptedUrl ?? ""}
                  label={`shot ${index + 1} clip: ${shot.motion}`}
                  className="h-full w-full"
                />
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-3">
            <AnimateBar ctl={ctl} shot={shot} disabled={Boolean(busy) || locked} animating={busy === "animate"} hasClips={st.clips.length > 0} />

            {st.clips.length > 0 && (
              <ol className="space-y-2" data-testid="ads-clips" aria-label="clips, newest first">
                {[...st.clips].reverse().map((ref) => {
                  const rec = ctl.clipRecords[ref.clipId];
                  const status = rec?.status ?? "queued";
                  const adopted = st.adoptedClip === ref.clipId;
                  return (
                    <li key={ref.clipId} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                      <span className={`${CHIP_CLASS} ${TALLY_TONE[STATUS_TONE[status]]}`} data-testid="ads-clip-status">
                        {status}
                      </span>
                      <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>{ref.durationS}s</span>
                      <Provenance model={ref.model} vendor="leonardo" cost={money(rec?.costUsd ?? ref.costUsd, rec?.costBasis ?? ref.costBasis)} />
                      {adopted ? (
                        <span className={`${CHIP_CLASS} ${TALLY_TONE.emerald}`}>adopted</span>
                      ) : (
                        status === "done" && (
                          <Button variant="ghost" size="sm" onClick={() => ctl.adoptClip(shot.id, ref.clipId)} disabled={locked}>
                            adopt
                          </Button>
                        )
                      )}
                      {rec?.error && (
                        <p className={`font-jetbrains w-full text-label leading-snug ${status === "refused" ? "text-amber-200/90" : "text-rose-200/90"}`}>
                          {rec.error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AnimateBar({
  ctl,
  shot,
  disabled,
  animating,
  hasClips,
}: {
  ctl: AdsMotionApi;
  shot: AdShotSpec;
  disabled: boolean;
  animating: boolean;
  hasClips: boolean;
}) {
  const cap = ctl.capability;
  const [model, setModel] = useState<VideoModel | null>(null);
  const [duration, setDuration] = useState<ClipDuration>(clipDurationFor(shot.durationS));

  if (ctl.capabilityError)
    return (
      <p className="font-jetbrains text-label text-rose-200/85" data-testid="ads-animate-unavailable">
        {ctl.capabilityError}
      </p>
    );
  if (!cap) return null;
  if (!cap.configured || cap.models.length === 0)
    return (
      <p className="font-jetbrains text-label text-white/45" data-testid="ads-animate-unavailable">
        animate · no video vendor key on this server
      </p>
    );

  const m = model && cap.models.includes(model) ? model : cap.models[0];
  // The capability's table is estimates; null is unpriced, never free.
  const priceOf = (id: VideoModel) => money(cap.priceUsd[id]?.[duration] ?? null, "estimated");
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="ads-animate">
      <Select
        label="model"
        value={m}
        onChange={setModel}
        options={cap.models.map((id) => ({ value: id, label: id, meta: priceOf(id) }))}
        testId="ads-animate-model"
      />
      <Select
        label="length"
        value={String(duration) as `${ClipDuration}`}
        onChange={(v) => setDuration(Number(v) as ClipDuration)}
        options={CLIP_DURATIONS.map((d) => ({ value: String(d) as `${ClipDuration}`, label: `${d}s` }))}
        minWidth={120}
        testId="ads-animate-length"
      />
      <Button onClick={() => void ctl.animate(shot, m, duration)} disabled={disabled} data-testid="ads-animate-go">
        {animating ? "starting…" : `${hasClips ? "re-animate" : "animate"} · ${priceOf(m)}`}
      </Button>
    </div>
  );
}
