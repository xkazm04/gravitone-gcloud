// PER RESOURCE (prototype projects.js `ResourceSummary`, projects.css `.psum`, `.res`, `.res-bar`,
// `.sum-grid`, `.launch-plan`): each lane the plan holds - its jobs, a bar of its work against the
// busiest lane, its minutes and dollars, and, before launch, where its first job would queue -
// then the totals and the plan's one act: Launch (which opens the receipt) or, once launched, the
// way to Runs.
//
// Runs' ResourceSummary (@gt/ui runs) measures OCCUPANCY - what a lane is running now - because
// v1 work carries no estimate. A plan does carry one, so this one is the prototype's: planned
// minutes per lane. Two meters, two facts; neither is drawn as the other.
import type { PlanView } from "@gt/domain/produce";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { LaunchButton } from "@gt/ui/components/produce/Composer.tsx";
import { costWords, fmtDur, fmtUsd, when } from "@gt/ui/components/produce/produce.ts";
import { LaneChip } from "@gt/ui/components/runs/LaneChip.tsx";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";
import { vars } from "@gt/ui/components/vars.ts";

import s from "./Plan.module.css";

export type PlanSummaryProps = {
  readonly view: PlanView;
  readonly nowMs: number;
  readonly busy: boolean;
  readonly onLaunch: () => void;
  readonly onDiscard: () => void;
};

export function PlanSummary({ view, nowMs, busy, onLaunch, onDiscard }: PlanSummaryProps) {
  const { project: p, totals: t, lanes } = view;
  const most = Math.max(1, ...lanes.map((l) => l.seconds));
  const cost = t.usdRange !== undefined ? costWords(t) : fmtUsd(t.usd);
  return (
    <aside className={s.psum} aria-label="per resource" data-component="PlanSummary">
      <CapsHeading text="per resource" tally={{ value: lanes.length }} />
      <ul className={s.resList}>
        {lanes.map((l) => (
          <li key={l.lane} className={s.res}>
            <span className={s.resH}>
              <LaneChip lane={l.lane} />
              <span className={s.mono}>
                {l.jobs} job{l.jobs === 1 ? "" : "s"}
              </span>
              {l.queuePos !== null && <Chip label="queue" value={`#${l.queuePos}`} name={`queue position ${l.queuePos}`} />}
            </span>
            <span className={s.resBar} role="meter" aria-valuemin={0} aria-valuemax={most} aria-valuenow={l.seconds} aria-label={`${l.lane}: ${fmtDur(l.seconds)} of work`}>
              <i style={vars({ "--share": l.seconds / most })} />
            </span>
            <span className={s.resN}>
              <span>{fmtDur(l.seconds)}</span>
              <span>
                {fmtUsd(l.usd)}
                {l.unpriced > 0 && <span className={s.unpricedN}> +{l.unpriced} unpriced</span>}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <CapsHeading text="total" />
      <dl className={s.sumGrid}>
        <dt>work</dt>
        <dd>{fmtDur(t.seconds)}</dd>
        <dt>cost est</dt>
        <dd>
          {cost} <SourceTag kind={t.src} />
        </dd>
        {t.unpriced > 0 && (
          <>
            <dt>unpriced</dt>
            <dd>{t.unpriced}</dd>
          </>
        )}
        <dt>spent</dt>
        <dd>{fmtUsd(t.spentUsd)}</dd>
        <dt>{p.launched ? "eta" : "eta if launched"}</dt>
        <dd>{t.etaAt === null ? "—" : when(t.etaAt, nowMs)}</dd>
        <dt>gates</dt>
        <dd>{t.gates} · yours</dd>
      </dl>
      {p.launched ? (
        <Button label="Open in Runs" tone="cyan" href={`/projects/runs?project=${encodeURIComponent(p.id)}`} shortcut={{ mode: "projects", verb: "runs" }} />
      ) : (
        <>
          <LaunchButton label="Launch plan" detail={`${cost} · ${fmtDur(t.seconds)}`} size="plan" busy={busy} onPress={onLaunch} shortcut={{ mode: "projects", verb: "launch" }} />
          <span className={s.discard}>
            <Button label="Discard plan" size="sm" tone="rose" onPress={onDiscard} />
          </span>
        </>
      )}
    </aside>
  );
}
