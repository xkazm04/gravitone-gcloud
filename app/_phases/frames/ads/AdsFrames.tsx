"use client";

// THE ADS DISCIPLINE'S FRAMES STEP — per shot of the picked scenario: three
// key-image takes, one adopted. The adopted images are what Motion animates
// (app/_phases/motion/ads); clips are not drawn here.
//
// Mounted by FramesStep's discipline router before any standard hook runs.
// State and every write live in ./useAdsFrames (on ./useAdsShots); this file
// only draws.

import { useState } from "react";

import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, Ghost, TALLY_TONE } from "@/components/ui/signal";
import type { AdShotSpec } from "@/lib/ads/types";

import { usePhaseReport } from "../../_shared/usePhaseReport";

import { AdsGate, AdsHeader, AdsLoading, ASPECT_CLASS, ShotErrorLine, ShotRail, ShotSpecCard } from "./parts";
import { useAdsFrames, type AdsFramesApi } from "./useAdsFrames";
import { EMPTY_SHOT, useAssetUrls } from "./useAdsShots";

export default function AdsFrames({ projectId }: { projectId: string }) {
  const ctl = useAdsFrames(projectId);
  const [chosen, setChosen] = useState<string | null>(null);

  const total = ctl.shots.length;
  const anyTakes = Object.values(ctl.shotsData.shots).some((s) => s.imageTakes.length > 0);
  // Derived, never asserted: done when every shot has an adopted key image.
  usePhaseReport(
    projectId,
    "frames",
    !ctl.loaded || !ctl.picked || ctl.stale ? null : total > 0 && ctl.adoptedCount === total ? "done" : anyTakes ? "working" : null,
  );

  const takeIds = Object.values(ctl.shotsData.shots).flatMap((s) => s.imageTakes);
  const urls = useAssetUrls(takeIds);

  if (!ctl.loaded) return <AdsLoading testId="AdsFrames-loading" />;
  const gate = <AdsGate base={ctl} projectId={projectId} current="frames" testId="AdsFrames-no-scenario" />;
  if (ctl.refused || !ctl.picked) return gate;

  const active = ctl.shots.find((s) => s.id === chosen) ?? ctl.shots[0];

  return (
    <div className="space-y-4" data-testid="AdsFrames" data-project={projectId}>
      <AdsHeader base={ctl} count={{ label: "adopted", value: ctl.adoptedCount, of: total }} onReset={ctl.resetToPicked} />
      {active && (
        <>
          <ShotRail
            shots={ctl.shots}
            active={active.id}
            onSelect={setChosen}
            errors={ctl.shotError}
            tallyOf={(s) => {
              const st = ctl.shotsData.shots[s.id] ?? EMPTY_SHOT;
              return { value: st.imageTakes.length, label: "takes", tone: st.adoptedImage ? "cyan" : "neutral" };
            }}
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
  const frame = ASPECT_CLASS[ctl.aspect] ?? "aspect-video";
  const locked = ctl.stale;
  // A 9:16 take is tall; six columns keeps a row of three on one screen.
  const cols = ctl.aspect === "9:16" ? "grid-cols-3 lg:grid-cols-6" : "grid-cols-2 lg:grid-cols-3";

  return (
    <section className="space-y-4" aria-label={`shot ${index + 1}`} data-testid={`ads-shot-${shot.id}`}>
      <ShotSpecCard shot={shot} />
      <ShotErrorLine err={ctl.shotError[shot.id]} />

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
          <div className={`grid ${cols} gap-3`} data-testid="ads-takes">
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
    </section>
  );
}
