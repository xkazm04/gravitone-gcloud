// THE RUNS ACTS (prototype projects.js Inspector `.acts`, `alt`; studio.js `pause`, `resume`,
// `retry`, `move`, `reroute`): what the operator can do to a produce job, beside what it is -
// its route, units, time, cost and where each came from, its place in its lane's queue, its
// attempt, and whether it runs dry or live.
//
//   P      pause a queued or running job; resume a paused one
//   T      retry a failed or interrupted one, on the same route, under an optional raised ceiling
//   [ ]    move a queued job earlier or later in its lane's queue
//   O      the re-route list: each alternative with its ±Δ; choosing one opens its RECEIPT
//   A      acknowledge a lane's HOLD (an interrupted paid job: "credits may be spent - look first")
//
// The prototype applied every act at once and wrote it to its journal. Here pause, resume,
// retry and move are immediate (they spend nothing and can be undone by their opposite); a
// re-route moves spend to another vendor and goes through a receipt, as every launch does.
// Each act's outcome is the server's words on the toast.
//
// Only jobs the produce port answers for carry acts; v1's live work stays read-only here (its
// writer is v1 until its producer migrates, COMMON decision 9) and keeps its way out to v1.
import type { RefObject } from "react";

import { jobMachine } from "@gt/domain/job.machine";
import type { RerouteOption } from "@gt/domain/produce";
import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Facts, type Fact } from "@gt/ui/components/facts/Facts.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { LaneHold } from "@gt/ui/components/produce/LaneHold.tsx";
import { RerouteList } from "@gt/ui/components/produce/RerouteList.tsx";
import { costWords, fmtDur, parseCeiling } from "@gt/ui/components/produce/produce.ts";
import { SourceTag } from "@gt/ui/components/source/SourceTag.tsx";

import type { LaneHoldView, ProduceJob } from "../../_port/contract.ts";
import s from "./Runs.module.css";

export type JobActsProps = {
  readonly job: ProduceJob;
  readonly busy: boolean;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onRetry: (ceilingUsd: number | undefined) => void;
  readonly onMove: (dir: "earlier" | "later") => void;
  readonly retryCeiling: string;
  readonly onRetryCeiling: (text: string) => void;
  readonly options: readonly RerouteOption[] | null;
  readonly optionsError?: string;
  readonly reading: string | null;
  readonly onReroute: (key: string) => void;
  readonly altsRef: RefObject<HTMLDivElement | null>;
  readonly holds: readonly LaneHoldView[];
};

/** The job machine's own edge: a planned job has not joined the line, so the kernel refuses its pause. */
export const canPause = (j: ProduceJob): boolean => jobMachine.can(j.state, "paused");
/** The job a lane's hold names: both port sides refuse its retry and its re-route until the hold is acknowledged. */
export const heldFor = (j: ProduceJob, holds: readonly LaneHoldView[]): boolean => holds.some((h) => h.jobId === j.id);
export const canRetry = (j: ProduceJob, holds: readonly LaneHoldView[] = []): boolean => (j.state === "failed" || j.state === "interrupted") && !heldFor(j, holds);
export const canReroute = (j: ProduceJob, holds: readonly LaneHoldView[] = []): boolean => j.reroutable && !heldFor(j, holds);
export const canMove = (j: ProduceJob): boolean => (j.state === "queued" || j.state === "planned") && !j.blocked;

export function JobActs({ job: j, busy, onPause, onResume, onRetry, onMove, retryCeiling, onRetryCeiling, options, optionsError, reading, onReroute, altsRef, holds }: JobActsProps) {
  const ceiling = parseCeiling(retryCeiling);
  const facts: Fact[] = [
    { term: "model", value: j.model },
    { term: "units", value: `${j.units} ${j.units === 1 ? j.noun : `${j.noun}s`}` },
    { term: "time", value: fmtDur(j.seconds) },
    { term: "cost", value: j.usd === null && j.usdRange === undefined ? (j.unpricedReason ?? "unpriced") : costWords(j) },
    ...(j.queuePos === null || j.state === "done" ? [] : [{ term: "queue", value: `#${j.queuePos}` }]),
    ...(j.stage === undefined ? [] : [{ term: "stage", value: j.stage }]),
    ...(j.ceilingUsd === undefined ? [] : [{ term: "ceiling", value: `$${j.ceilingUsd}` }]),
  ];
  return (
    <>
      <div className={s.inspH}>
        <Chip label={j.mode} tone={j.mode === "live" ? "rose" : "cyan"} dot name={`mode ${j.mode}`} />
        <SourceTag kind={j.src} />
        {j.held && <Chip label="lane on hold" tone="rose" />}
        {j.blocked && <Chip label="after a stuck part" tone="rose" casing="lower" />}
      </div>
      <Facts facts={facts} />
      <div className={s.acts} data-component="JobActs">
        {canMove(j) && (
          <>
            <Button size="sm" glyph="up" label="earlier" onPress={() => onMove("earlier")} disabled={busy} />
            <Button size="sm" glyph="down" label="later" onPress={() => onMove("later")} disabled={busy} />
          </>
        )}
        {canPause(j) && <Button size="sm" label="pause" onPress={onPause} disabled={busy} shortcut={{ mode: "projects.runs", verb: "pause" }} />}
        {j.state === "paused" && <Button size="sm" tone="cyan" label="resume" onPress={onResume} disabled={busy} shortcut={{ mode: "projects.runs", verb: "pause" }} />}
        {canRetry(j, holds) && (
          <span className={s.retry}>
            <Button size="sm" tone="amber" label="retry · same route" onPress={() => (ceiling.ok ? onRetry(ceiling.value) : undefined)} disabled={busy || !ceiling.ok} shortcut={{ mode: "projects", verb: "retry" }} />
            <label className={s.ceil}>
              <span>ceiling $</span>
              <input className={s.ceilIn} inputMode="decimal" aria-label="retry ceiling in dollars" aria-invalid={ceiling.ok ? undefined : true} placeholder="none" value={retryCeiling} onChange={(e) => onRetryCeiling(e.currentTarget.value)} />
            </label>
          </span>
        )}
      </div>
      {canReroute(j, holds) && (
        <section className={s.sect}>
          <CapsHeading text="re-route" tally={{ value: options === null ? 0 : options.filter((o) => !o.current).length, label: "options" }} />
          <div ref={altsRef}>
            {options !== null && <RerouteList options={options} units={j.units} onPick={onReroute} busy={reading} />}
            {optionsError !== undefined && <span className={s.dm}>{optionsError}</span>}
          </div>
        </section>
      )}
    </>
  );
}

export function Holds({ holds, nowMs, busy, onAck }: { readonly holds: readonly LaneHoldView[]; readonly nowMs: number; readonly busy: boolean; readonly onAck: (lane: LaneHoldView["lane"]) => void }) {
  if (holds.length === 0) return null;
  return (
    <section className={`${s.sect} ${s.rose ?? ""}`}>
      <CapsHeading text="on hold" tally={{ value: holds.length }} />
      {holds.map((h) => (
        <LaneHold key={h.lane} lane={h.lane} job={h.title} {...(h.stage === undefined ? {} : { stage: h.stage })} since={h.since} nowMs={nowMs} busy={busy} onAck={() => onAck(h.lane)} href={`/projects/runs?job=${encodeURIComponent(`kernel:${h.jobId}`)}`} />
      ))}
    </section>
  );
}
