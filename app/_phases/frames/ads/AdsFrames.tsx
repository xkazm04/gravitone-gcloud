"use client";

// THE ADS DISCIPLINE'S FRAMES STEP — per shot of the picked scenario: three
// key-image takes, one adopted, then a costed image-to-video clip on demand.
// Re-animating is explicit and costed again; earlier clips are kept and any
// finished one can be adopted. Finish concatenates the adopted clips.
//
// Mounted by FramesStep's discipline router before any standard hook runs.
// State and every write live in ./useAdsFrames; this file only draws.

import { useState } from "react";

import Clip from "@/components/ui/Clip";
import { Button } from "@/components/ui/Primitives";
import { Select } from "@/components/ui/Select";
import { CHIP_CLASS, Ghost, Provenance, StaleBadge, TALLY_TONE, TabRail, Tally, UpstreamBreak } from "@/components/ui/signal";
import type { AdShotSpec } from "@/lib/ads/types";
import { clipFileUrl } from "@/lib/imaging/video/client";
import { CLIP_DURATIONS, type ClipDuration, type ClipRecord, type CostBasis, type VideoModel } from "@/lib/imaging/video/types";

import { usePhaseReport } from "../../_shared/usePhaseReport";
import Notice from "../../_shared/ui/Notice";

import { clipDurationFor, EMPTY_SHOT, useAdsFrames, useAssetUrls, type AdsFramesApi } from "./useAdsFrames";

/** A figure with how to read it: an estimate says so, a missing one is "unpriced". */
const money = (usd: number | null, basis: CostBasis) =>
  usd === null ? "unpriced" : `$${usd.toFixed(2)}${basis === "estimated" ? " est." : ""}`;

const ASPECT_CLASS: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
};

const STATUS_TONE: Record<ClipRecord["status"], keyof typeof TALLY_TONE> = {
  queued: "neutral",
  rendering: "cyan",
  done: "emerald",
  failed: "rose",
  refused: "amber",
};

export default function AdsFrames({ projectId }: { projectId: string }) {
  const ctl = useAdsFrames(projectId);
  const [chosen, setChosen] = useState<string | null>(null);

  const total = ctl.shots.length;
  const anyWork = Object.values(ctl.shotsData.shots).some((s) => s.imageTakes.length || s.clips.length);
  // Derived, never asserted: done when every shot has an adopted, finished clip.
  usePhaseReport(
    projectId,
    "frames",
    !ctl.loaded || !ctl.picked || ctl.stale ? null : total > 0 && ctl.adoptedCount === total ? "done" : anyWork ? "working" : null,
  );

  const takeIds = Object.values(ctl.shotsData.shots).flatMap((s) => s.imageTakes);
  const urls = useAssetUrls(takeIds);

  if (!ctl.loaded)
    return (
      <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase" data-testid="AdsFrames-loading">
        reading the shots…
      </p>
    );

  if (ctl.refused)
    return (
      <Notice title={ctl.refused.refused}>
        <p className="font-jetbrains text-content text-white/45">{ctl.refused.detail}</p>
      </Notice>
    );

  if (!ctl.picked)
    return (
      <div data-testid="AdsFrames-no-scenario">
        <UpstreamBreak
          blockedAt="script"
          current="frames"
          done={ctl.scenarios?.options.length ? ["research"] : []}
          action={{ label: "Open Scenario", href: `/studio/${projectId}?step=script` }}
        />
      </div>
    );

  const active = ctl.shots.find((s) => s.id === chosen) ?? ctl.shots[0];

  return (
    <div className="space-y-4" data-testid="AdsFrames" data-project={projectId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tally label="clips" value={ctl.adoptedCount} of={total} tone={ctl.adoptedCount === total && total ? "emerald" : "cyan"} />
          <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>{ctl.aspect}</span>
          <p className="font-jetbrains text-content text-white/35">&ldquo;{ctl.picked.title}&rdquo;</p>
        </div>
        <p className={`font-jetbrains text-content ${ctl.hasProjectStyle ? "text-white/40" : "text-amber-200/90"}`}>
          style · {ctl.styleName}
        </p>
      </div>

      {ctl.stale && (
        <div className="flex flex-wrap items-center gap-3" data-testid="AdsFrames-stale">
          <StaleBadge words="other scenario" why="these shots were made for a scenario that is no longer picked" glyph="history" />
          <Button variant="ghost" size="sm" onClick={ctl.resetToPicked}>
            start over on &ldquo;{ctl.picked.title}&rdquo;
          </Button>
        </div>
      )}

      {ctl.writeError && (
        <Notice title="not saved">
          <p className="font-jetbrains text-content text-white/45">{ctl.writeError}</p>
        </Notice>
      )}

      {active && (
        <>
          <TabRail
            label="shots"
            active={active.id}
            onSelect={setChosen}
            tabs={ctl.shots.map((s, i) => {
              const st = ctl.shotsData.shots[s.id] ?? EMPTY_SHOT;
              const clip = st.adoptedClip ? ctl.clipRecords[st.adoptedClip] : undefined;
              return {
                id: s.id,
                label: `shot ${i + 1}`,
                testId: `ads-shot-tab-${s.id}`,
                tally:
                  clip?.status === "done"
                    ? { value: 1, of: 1, label: "clip", tone: "emerald" as const }
                    : { value: st.imageTakes.length, label: "takes", tone: st.adoptedImage ? ("cyan" as const) : ("neutral" as const) },
                tone: ctl.shotError[s.id] ? ("rose" as const) : undefined,
              };
            })}
          />
          <ShotPanel key={active.id} ctl={ctl} shot={active} index={ctl.shots.indexOf(active)} urls={urls} />
        </>
      )}
    </div>
  );
}

function ShotPanel({ ctl, shot, index, urls }: { ctl: AdsFramesApi; shot: AdShotSpec; index: number; urls: Map<string, string> }) {
  const st = ctl.shotsData.shots[shot.id] ?? EMPTY_SHOT;
  const busy = ctl.busy[shot.id];
  const err = ctl.shotError[shot.id];
  const frame = ASPECT_CLASS[ctl.aspect] ?? "aspect-video";
  const locked = ctl.stale;
  const adoptedUrl = st.adoptedImage ? urls.get(st.adoptedImage) : undefined;
  const adoptedClip = st.adoptedClip ? ctl.clipRecords[st.adoptedClip] : undefined;

  return (
    <section className="space-y-4" aria-label={`shot ${index + 1}`} data-testid={`ads-shot-${shot.id}`}>
      {/* The shot as Scenario wrote it — work content, verbatim. */}
      <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>{shot.durationS}s</span>
          {shot.super && <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>super · {shot.super}</span>}
        </div>
        <p className="font-hanken text-content leading-snug text-slate-200">{shot.image}</p>
        <p className="font-jetbrains text-label leading-snug text-cyan-200/70">motion · {shot.motion}</p>
      </div>

      {err && (
        <p
          data-testid="ads-shot-error"
          className={`rounded-xl border px-4 py-2.5 text-content leading-snug ${err.refused ? "border-amber-300/25 bg-amber-300/5 text-amber-100/90" : "border-rose-400/30 bg-rose-400/5 text-rose-200"}`}
        >
          {err.refused && <span className="font-jetbrains mr-2 uppercase tracking-[0.12em]">refused</span>}
          {err.text}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Key-image takes. */}
        <div className="min-w-0">
          {st.imageTakes.length === 0 ? (
            <Ghost
              shape="card"
              count={3}
              label="no key images yet"
              action={
                <Button onClick={() => void ctl.generateTakes(shot)} disabled={Boolean(busy) || locked} data-testid="ads-generate-takes">
                  {busy === "takes" ? "generating…" : "generate 3 takes"}
                </Button>
              }
            />
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-3" data-testid="ads-takes">
                {st.imageTakes.map((id, i) => {
                  const adopted = st.adoptedImage === id;
                  const src = urls.get(id);
                  return (
                    <figure
                      key={id}
                      className={`overflow-hidden rounded-xl border ${adopted ? "border-cyan-400/60" : "border-white/10"} bg-white/[0.02]`}
                    >
                      <div className={`${frame} w-full bg-white/[0.03]`}>
                        {src && (
                          // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from IndexedDB; next/image cannot optimise it
                          <img src={src} alt={`shot ${index + 1}, take ${i + 1}`} className="h-full w-full object-cover" />
                        )}
                      </div>
                      <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5">
                        <span className="font-jetbrains text-label text-white/40">take {i + 1}</span>
                        {adopted ? (
                          <span className={`${CHIP_CLASS} ${TALLY_TONE.cyan}`}>adopted</span>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => ctl.adoptImage(shot.id, id)} disabled={locked} data-testid="ads-adopt-take">
                            adopt
                          </Button>
                        )}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
              <Button variant="ghost" size="sm" onClick={() => void ctl.generateTakes(shot)} disabled={Boolean(busy) || locked}>
                {busy === "takes" ? "generating…" : "3 more takes"}
              </Button>
            </div>
          )}
        </div>

        {/* Motion: only once a key image is adopted. */}
        <div className="min-w-0 space-y-3">
          {st.adoptedImage && (
            <AnimateBar ctl={ctl} shot={shot} disabled={Boolean(busy) || locked} animating={busy === "animate"} hasClips={st.clips.length > 0} />
          )}

          {adoptedClip?.status === "done" && (
            <div
              className={`${frame} ${ctl.aspect === "9:16" ? "max-w-xs" : "w-full"} overflow-hidden rounded-xl border border-emerald-400/30`}
              data-testid="ads-adopted-clip"
            >
              <Clip
                sources={[{ src: clipFileUrl(adoptedClip.clipId), type: "video/mp4" }]}
                poster={adoptedUrl ?? ""}
                label={`shot ${index + 1} clip: ${shot.motion}`}
                className="h-full w-full"
              />
            </div>
          )}

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
  ctl: AdsFramesApi;
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
  if (!cap.configured)
    return (
      <p className="font-jetbrains text-label text-white/45" data-testid="ads-animate-unavailable">
        animate · no video vendor key on this server
      </p>
    );

  const m = model ?? cap.models[0];
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
