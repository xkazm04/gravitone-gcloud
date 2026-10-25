// THE INSPECTOR beside the day-line (projects.js `Inspector`, `ProjectInspector`,
// `LanesInspector`): a selected job, a selected project, or - nothing selected - every
// resource: what is on hold, what failed, what waits at the Weir, what runs, and which sources
// could not be read. A produce job carries its acts (./Acts.tsx: pause, retry, earlier/later,
// re-route); v1's live work keeps its ways OUT - the v1 page that decides it today, the
// project's thread, the ledger - and acts there stay v1's until its producer migrates.
import type { ReactNode } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { Facts, type Fact } from "@gt/ui/components/facts/Facts.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";
import { CapsHeading } from "@gt/ui/components/heading/CapsHeading.tsx";
import { Keycaps } from "@gt/ui/components/keycaps/Keycaps.tsx";
import { LedgerLink } from "@gt/ui/components/ledgerlink/LedgerLink.tsx";
import { LaneChip, laneLabel } from "@gt/ui/components/runs/LaneChip.tsx";
import { ResourceSummary } from "@gt/ui/components/runs/ResourceSummary.tsx";
import type { Dep } from "@gt/ui/components/runs/thread.ts";
import { EntryPill, StatusPill } from "@gt/ui/components/status/StatusPill.tsx";
import { STATUS } from "@gt/ui/components/status/status.ts";

import type { LaneHoldView } from "../../_port/contract.ts";
import { canReroute, Holds, JobActs, type JobActsProps } from "./Acts.tsx";
import { MvActs, mvTrackOf, type MvChannel, type MvPart } from "./MvActs.tsx";
import type { RunJob, RunWeir, RunsModel } from "./model.ts";
import { RUNS_KEYS } from "./readKeys.ts";
import { holdingOf, membersOf, when } from "./view.ts";
import s from "./Runs.module.css";

/** What the acts need, gathered by Runs (./Runs.tsx owns the calls and their state). */
export type InspectorActs = Omit<JobActsProps, "job"> & {
  readonly onAck: (lane: LaneHoldView["lane"]) => void;
  /** A music video's Regenerate and Send to Calendar (./MvActs.tsx), when the page hands its port. */
  readonly mv?: { readonly onRegenerate: (track: string, part: MvPart) => void; readonly onSchedule: (track: string, channel: MvChannel, publishAt: string) => void };
};

type Props = {
  readonly acts: InspectorActs;
  /** The selected project's title, when the produce port names it. */
  readonly projectTitle: string | null;
  readonly m: RunsModel;
  readonly job: string | null;
  readonly project: string | null;
  readonly deps: readonly Dep[];
  readonly blocked: ReadonlyMap<string, string>;
  readonly onSelect: (key: string) => void;
};

const ledgerHref = (q: string): string => `/ledger?q=${encodeURIComponent(q)}`;
/** The page an href leads to, named by its first segment: `/floor?lane=image` -> `floor` (a v1
 *  job's href is its Floor lane since v1's /foundry and /articles retired, Phase 6 wave C). */
const placeOf = (href: string): string => href.split(/[/?#]/).find((x) => x !== "") ?? "page";

export function Inspector({ acts, projectTitle, m, job, project, deps, blocked, onSelect }: Props) {
  const j = job === null ? undefined : m.jobs.find((x) => x.key === job);
  const w = job === null ? undefined : m.weir.find((x) => x.key === job);
  return (
    <aside className={s.inspector} aria-label="inspector">
      <div className={s.inspIn}>
        {j !== undefined ? (
          <JobView j={j} m={m} deps={deps} blocked={blocked} onSelect={onSelect} acts={acts} />
        ) : w !== undefined ? (
          <WeirView w={w} m={m} />
        ) : project !== null ? (
          <ProjectView id={project} title={projectTitle ?? project} m={m} onSelect={onSelect} />
        ) : (
          <Everything m={m} onSelect={onSelect} acts={acts} />
        )}
      </div>
    </aside>
  );
}

/** A job in a list: its state, its title, and either a time or (in "every resource") its lane. */
function DepRow({ j, m, at, onSelect }: { readonly j: RunJob; readonly m: RunsModel; readonly at: number | "lane"; readonly onSelect: (key: string) => void }) {
  return (
    <button type="button" className={s.deprow} onClick={() => onSelect(j.key)}>
      <StatusPill machine="job" state={j.state} />
      <span className={s.ell}>{j.title}</span>
      <span className={s.dm}>{at === "lane" ? laneLabel(j.lane) : when(at, m.now, j.approx)}</span>
    </button>
  );
}

function JobView({ j, m, deps, blocked, onSelect, acts }: { readonly j: RunJob; readonly m: RunsModel; readonly deps: readonly Dep[]; readonly blocked: ReadonlyMap<string, string>; readonly onSelect: (key: string) => void; readonly acts: InspectorActs }) {
  const byKey = new Map(m.jobs.map((x) => [x.key, x]));
  const after = deps.filter((d) => d.to === j.key).flatMap((d) => byKey.get(d.from) ?? []);
  const blocks = deps.filter((d) => d.from === j.key).flatMap((d) => byKey.get(d.to) ?? []);
  const block = blocked.get(j.key);
  const track = j.from === "kernel" && (j.state === "done" || j.state === "failed") ? mvTrackOf(j.id) : null;
  const mv = acts.mv;
  const facts: Fact[] = [
    { term: "source", value: j.source },
    ...(j.laneFrom === undefined ? [] : [{ term: "lane from", value: j.laneFrom }]),
    ...(j.progress === undefined ? [] : [{ term: "units", value: `${j.progress.done} of ${j.progress.total}${j.progress.stage === undefined ? "" : ` · ${j.progress.stage}`}` }]),
    { term: "start", value: when(j.s, m.now, j.approx) },
    { term: "end", value: j.open ? "running now" : when(j.e, m.now, j.approx) },
    ...(j.attempt !== undefined && j.attempt > 1 ? [{ term: "attempt", value: j.attempt }] : []),
  ];
  return (
    <>
      <div className={s.inspH}>
        <LaneChip lane={j.lane} />
        <StatusPill machine="job" state={j.state} />
      </div>
      <h2 className={s.inspT}>{j.title}</h2>
      {j.projectId !== undefined && (
        <a className={s.inspP} href={`/projects/runs?project=${encodeURIComponent(j.projectId)}`}>
          {j.projectId}
        </a>
      )}
      <Facts facts={facts} />
      {j.act !== undefined && <JobActs job={j.act} {...acts} />}
      {j.error !== undefined && <ErrorLine message={j.error} />}
      {block !== undefined && <ErrorLine message={`blocked by ${byKey.get(block)?.title ?? block}`} />}
      {track !== null && mv !== undefined && (
        <MvActs key={j.key} track={track} finished={j.state === "done"} nowMs={m.now} busy={acts.busy} onRegenerate={(part) => mv.onRegenerate(track, part)} onSchedule={(channel, at) => mv.onSchedule(track, channel, at)} />
      )}
      {j.act !== undefined && <Holds holds={acts.holds.filter((h) => h.lane === j.lane)} nowMs={m.now} busy={acts.busy} onAck={acts.onAck} />}
      {after.length > 0 && <Section title="after" n={after.length}>{after.map((d) => <DepRow key={d.key} j={d} m={m} at={d.e} onSelect={onSelect} />)}</Section>}
      {blocks.length > 0 && <Section title="blocks" n={blocks.length}>{blocks.map((d) => <DepRow key={d.key} j={d} m={m} at={d.s} onSelect={onSelect} />)}</Section>}
      <div className={s.acts}>
        {j.act === undefined && <Button size="sm" label={placeOf(j.href)} href={j.href} glyphAfter="chevR" />}
        {j.projectId !== undefined && j.act !== undefined && <Button size="sm" label="plan" href={`/projects/${encodeURIComponent(j.projectId)}`} glyphAfter="chevR" />}
        <LedgerLink href={ledgerHref(j.id)} subject={j.title} />
      </div>
      <Keycaps mode="projects" label="keys" map={RUNS_KEYS} facts={new Set(["job", ...(j.act !== undefined && canReroute(j.act, acts.holds) ? ["reroutable"] : []), ...(acts.holds.length > 0 ? ["hold"] : [])])} />
    </>
  );
}

function WeirView({ w, m }: { readonly w: RunWeir; readonly m: RunsModel }) {
  const facts: Fact[] = [
    { term: "source", value: w.source },
    ...(w.kind === undefined ? [] : [{ term: "verdict", value: w.kind }]),
    ...(w.pending === undefined ? [] : [{ term: "to judge", value: w.pending }]),
    ...(w.decided === undefined ? [] : [{ term: "judged", value: w.decided }]),
    { term: w.done ? "committed" : "since", value: when(w.at, m.now, w.approx) },
  ];
  return (
    <>
      <div className={s.inspH}>
        <LaneChip lane="weir" />
        <EntryPill entry={w.done ? STATUS.packet.committed : STATUS.packet.open} />
      </div>
      <h2 className={s.inspT}>{w.title}</h2>
      <Facts facts={facts} />
      <div className={s.acts}>
        {!w.done && <Button size="sm" tone="amber" label="open at the weir" href={w.href} glyphAfter="chevR" />}
        <LedgerLink href={ledgerHref(w.id)} subject={w.title} />
      </div>
    </>
  );
}

function ProjectView({ id, title, m, onSelect }: { readonly id: string; readonly title: string; readonly m: RunsModel; readonly onSelect: (key: string) => void }) {
  const members = membersOf(m, id);
  const jobs = m.jobs.filter((j) => members.has(j.key));
  const need = jobs.filter((j) => j.state === "failed" || j.state === "interrupted" || j.state === "paused");
  const slots = m.pins.filter((p) => p.projectId === id);
  return (
    <>
      <h2 className={s.inspT}>{title}</h2>
      <Section title="needs you" n={need.length}>
        {need.length === 0 ? <Ghost label="nothing needs you" /> : need.map((j) => <DepRow key={j.key} j={j} m={m} at={j.s} onSelect={onSelect} />)}
      </Section>
      <Section title="slots" n={slots.length}>
        {slots.map((p) => (
          <a key={p.key} className={s.deprow} href={p.href}>
            <StatusPill machine="slot" state={p.status} />
            <span className={s.ell}>{p.title}</span>
            <span className={s.dm}>{when(p.at, m.now)}</span>
          </a>
        ))}
      </Section>
      <div className={s.acts}>
        <LedgerLink href={ledgerHref(id)} subject={id} />
      </div>
      <Keycaps mode="projects" label="keys" map={RUNS_KEYS} />
    </>
  );
}

function Everything({ m, onSelect, acts }: { readonly m: RunsModel; readonly onSelect: (key: string) => void; readonly acts: InspectorActs }) {
  const live = m.jobs.filter((j) => j.from !== "ledger");
  const failed = live.filter((j) => j.state === "failed" || j.state === "interrupted");
  const running = live.filter((j) => j.state === "running");
  const weir = m.weir.filter((w) => !w.done);
  const holding = holdingOf(m);
  return (
    <>
      <h2 className={s.inspT}>Every resource</h2>
      <Holds holds={acts.holds} nowMs={m.now} busy={acts.busy} onAck={acts.onAck} />
      <Section title="failed" n={failed.length} tone="rose">
        {failed.length === 0 ? <Ghost label="nothing failed" /> : failed.map((j) => <DepRow key={j.key} j={j} m={m} at="lane" onSelect={onSelect} />)}
      </Section>
      <Section title="at the weir" n={weir.length} tone="amber">
        {weir.map((w) => (
          <button key={w.key} type="button" className={s.deprow} onClick={() => onSelect(w.key)}>
            <EntryPill entry={STATUS.packet.open} />
            <span className={s.ell}>{w.title}</span>
            <span className={s.dm}>{laneLabel("weir")}</span>
          </button>
        ))}
      </Section>
      <Section title="running" n={running.length} tone="cyan">
        {running.map((j) => <DepRow key={j.key} j={j} m={m} at="lane" onSelect={onSelect} />)}
      </Section>
      {holding.length > 0 && (
        <Section title="resources" n={holding.length}>
          <ResourceSummary label="resources" lines={holding} />
        </Section>
      )}
      {m.unplaced > 0 && (
        <Section title="no lane on record" n={m.unplaced}>
          <a className={s.inspP} href="/ledger?type=run.end">
            ledger · run.end
          </a>
        </Section>
      )}
    </>
  );
}

function Section({ title, n, tone, children }: { readonly title: string; readonly n: number; readonly tone?: "rose" | "amber" | "cyan"; readonly children: ReactNode }) {
  return (
    <section className={tone === undefined ? s.sect : `${s.sect} ${s[tone] ?? ""}`}>
      <CapsHeading text={title} tally={{ value: n }} />
      <div className={s.deplist}>{children}</div>
    </section>
  );
}
