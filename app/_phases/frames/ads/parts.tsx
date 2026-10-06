"use client";

// THE PARTS BOTH ADS SHOT STEPS DRAW — Frames (images) and Motion (clips) show
// the same scenario header, the same shot rail and the same shot card, so they
// are drawn here once. Each step passes what its rail counts.

import { Button } from "@/components/ui/Primitives";
import { CHIP_CLASS, StaleBadge, TALLY_TONE, TabRail, Tally, UpstreamBreak } from "@/components/ui/signal";
import type { TallyTone } from "@/components/ui/signal";
import type { AdShotSpec } from "@/lib/ads/types";
import type { PhaseKey } from "@/lib/projects";

import Notice from "../../_shared/ui/Notice";

import type { AdsShotsApi, ShotTrouble } from "./useAdsShots";

export const ASPECT_CLASS: Record<string, string> = {
  "9:16": "aspect-[9/16]",
  "16:9": "aspect-video",
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
};

export function AdsLoading({ testId }: { testId: string }) {
  return (
    <p className="font-jetbrains py-16 text-center text-content tracking-[0.18em] text-white/30 uppercase" data-testid={testId}>
      reading the shots…
    </p>
  );
}

/** The states before any shot can be drawn: a refused record, or no picked
 *  scenario. Returns null when the step may draw its shots. */
export function AdsGate({ base, projectId, current, testId }: { base: AdsShotsApi; projectId: string; current: PhaseKey; testId: string }) {
  if (base.refused)
    return (
      <Notice title={base.refused.refused}>
        <p className="font-jetbrains text-content text-white/45">{base.refused.detail}</p>
      </Notice>
    );
  if (!base.picked)
    return (
      <div data-testid={testId}>
        <UpstreamBreak
          blockedAt="script"
          current={current}
          done={base.scenarios?.options.length ? ["research"] : []}
          action={{ label: "Open Scenario", href: `/studio/${projectId}?step=script` }}
        />
      </div>
    );
  return null;
}

/** Scenario title, aspect, style, the step's own count, and — when the shots
 *  were made for another scenario — the stale mark (and, where the step owns
 *  it, the reset). */
export function AdsHeader({
  base,
  count,
  onReset,
}: {
  base: AdsShotsApi;
  count: { label: string; value: number; of: number };
  onReset?: () => void;
}) {
  if (!base.picked) return null;
  const full = count.of > 0 && count.value === count.of;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tally label={count.label} value={count.value} of={count.of} tone={full ? "emerald" : "cyan"} />
          <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>{base.aspect}</span>
          <p className="font-jetbrains text-content text-white/35">&ldquo;{base.picked.title}&rdquo;</p>
        </div>
        <p className={`font-jetbrains text-content ${base.hasProjectStyle ? "text-white/40" : "text-amber-200/90"}`}>
          style · {base.styleName}
        </p>
      </div>

      {base.stale && (
        <div className="flex flex-wrap items-center gap-3" data-testid="ads-shots-stale">
          <StaleBadge words="other scenario" why="these shots were made for a scenario that is no longer picked" glyph="history" />
          {onReset && (
            <Button variant="ghost" size="sm" onClick={onReset}>
              start over on &ldquo;{base.picked.title}&rdquo;
            </Button>
          )}
        </div>
      )}

      {base.writeError && (
        <Notice title="not saved">
          <p className="font-jetbrains text-content text-white/45">{base.writeError}</p>
        </Notice>
      )}
    </>
  );
}

export interface RailTally {
  value: number;
  of?: number;
  label: string;
  tone: TallyTone;
}

export function ShotRail({
  shots,
  active,
  onSelect,
  tallyOf,
  errors,
}: {
  shots: AdShotSpec[];
  active: string;
  onSelect: (id: string) => void;
  tallyOf: (shot: AdShotSpec) => RailTally;
  errors: Record<string, ShotTrouble | undefined>;
}) {
  return (
    <TabRail
      label="shots"
      active={active}
      onSelect={onSelect}
      tabs={shots.map((s, i) => ({
        id: s.id,
        label: `shot ${i + 1}`,
        testId: `ads-shot-tab-${s.id}`,
        tally: tallyOf(s),
        tone: errors[s.id] ? ("rose" as const) : undefined,
      }))}
    />
  );
}

/** The shot as Scenario wrote it — work content, verbatim. */
export function ShotSpecCard({ shot }: { shot: AdShotSpec }) {
  return (
    <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>{shot.durationS}s</span>
        {shot.super && <span className={`${CHIP_CLASS} ${TALLY_TONE.neutral}`}>super · {shot.super}</span>}
      </div>
      <p className="font-hanken text-content leading-snug text-slate-200">{shot.image}</p>
      <p className="font-jetbrains text-label leading-snug text-cyan-200/70">motion · {shot.motion}</p>
    </div>
  );
}

/** A shot's last trouble, in the vendor's or the store's own words. Announced
 *  by the hook (useShotFlags), so this is the visual channel only. */
export function ShotErrorLine({ err }: { err: ShotTrouble | undefined }) {
  if (!err) return null;
  return (
    <p
      data-testid="ads-shot-error"
      className={`rounded-xl border px-4 py-2.5 text-content leading-snug ${err.refused ? "border-amber-300/25 bg-amber-300/5 text-amber-100/90" : "border-rose-400/30 bg-rose-400/5 text-rose-200"}`}
    >
      {err.refused && <span className="font-jetbrains mr-2 uppercase tracking-[0.12em]">refused</span>}
      {err.text}
    </p>
  );
}
