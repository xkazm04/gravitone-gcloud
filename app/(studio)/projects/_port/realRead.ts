import "server-only";

import { parseJsonAt } from "@gt/domain/door";
import { jobSchema, type Job, type JobState } from "@gt/domain/job";
import { LANE_CAPACITY, RESOURCE_LANES, type MediaLane } from "@gt/domain/lane";
import { isWork, type Part, type WorkPart } from "@gt/domain/part";
import type { ModelOption, PlanEstimate } from "@gt/domain/produce";
import type { Project } from "@gt/domain/project";
import { runSchema, type Run } from "@gt/domain/run";
import { laneHold } from "@gt/kernel/job-queue";
import { launchOf, modelOptions, unitNounOf } from "@gt/kernel/records/options";
import { chosenOf } from "@gt/kernel/records/read";
import { priceLine } from "@gt/kernel/records/receipt";
import { runPlanOf } from "@gt/kernel/records/runplan";
import { schedule, type SchedItem } from "@gt/kernel/records/schedule";
import { loadParts, loadProject, type PartRow } from "@gt/kernel/records/schema";
import type { Reader } from "@gt/kernel/store";

import type { LaneHoldView, ProduceJob } from "./contract.ts";

// THE REAL SIDE'S READS - the kernel's jobs as Runs draws and acts on them, and the lanes a
// crash holds. Every figure is derived at read from the records (a part's option and units, a
// run's quote), the option table and the job record; nothing here is stored. The fixture's twin
// is ./fixtureRead.ts `jobsView` / `holdsView`, and the shape is the contract's.
//
// THE SCHEDULE IS THE RECEIPT'S. A job is placed by the records scheduler (L26 records/
// schedule.ts) - the same function a receipt's queue position came from - so "queue #3" on a
// receipt and the bar Runs draws for the same job cannot disagree about how the line is
// computed. A finished job keeps the clock its own events recorded (its last claim, its end).

/** Bounded like Runs' kernel read (runs/_runs/load.ts KERNEL_CAP): the newest jobs. */
export const JOBS_CAP = 500;
const IDS_PER_QUERY = 200;
const ENDED = ["job.done", "job.failed", "job.interrupted", "job.cancelled"] as const;

const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10);

/** The media lane of a job no Run row describes: the producer's own (records/runplan.ts NATIVE). */
const MEDIA_OF: Readonly<Record<string, MediaLane>> = { extract: "image", forge: "image", dojo: "image", article: "article", mv: "video", strips: "video", suno: "audio" };

/** The first sentence of a composer's text: a Floor run's name, as the fixture and the prototype drew it. */
export function firstSentence(text: string, fallback: string): string {
  const t = text.trim().split(/(?<=[.!?…])\s/)[0]?.trim() ?? "";
  return t === "" ? fallback : t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

type Times = { start?: number; end?: number };

/** When each job last started and ended, from its own events, a bounded query per 200 ids. */
function timesOf(r: Reader, ids: readonly string[]): Map<string, Times> {
  const out = new Map<string, Times>();
  for (let i = 0; i < ids.length; i += IDS_PER_QUERY) {
    const batch = ids.slice(i, i + IDS_PER_QUERY);
    const marks = batch.map(() => "?").join(", ");
    const rows = r.all(`SELECT subject_id, type, at FROM events WHERE subject_kind = 'job' AND subject_id IN (${marks}) AND type IN ('job.claimed', ${ENDED.map(() => "?").join(", ")}) ORDER BY seq`, ...batch, ...ENDED);
    for (const row of rows) {
      const id = String(row["subject_id"]);
      const at = Date.parse(String(row["at"]));
      const t = out.get(id) ?? {};
      if (row["type"] === "job.claimed") t.start = at;
      else t.end = at;
      out.set(id, t);
    }
  }
  return out;
}

type Served =
  | { readonly kind: "part"; readonly project: Project; readonly rows: readonly PartRow[]; readonly row: PartRow & { readonly part: WorkPart } }
  | { readonly kind: "run"; readonly run: Run }
  | { readonly kind: "none" };

type Priced = { readonly option?: ModelOption; readonly options: readonly ModelOption[]; readonly units: number; readonly noun: string; readonly estimate: PlanEstimate; readonly media?: MediaLane; readonly title: string };

const UNQUOTED = "no receipt priced this job: it was enqueued before launches carried one";

function pricedOf(job: Job, s: Served, day: string): Priced {
  if (s.kind === "part") {
    const p = s.row.part;
    const options = modelOptions(p.kind, day);
    const option = chosenOf(options, p.option);
    const estimate: PlanEstimate = option === undefined ? { seconds: 0, usd: null, unpricedReason: `no option ${p.option} for ${p.kind}`, src: "illustrative" } : priceLine(p.units, option);
    return { ...(option === undefined ? {} : { option }), options, units: p.units, noun: unitNounOf(p.kind), estimate, title: `${s.project.title} · ${p.kind}` };
  }
  if (s.kind === "run") {
    const run = s.run;
    const plan = runPlanOf(run.input, run.units);
    const own = "producer" in run.input ? run.input.producer : undefined;
    // A producer's own run moves only between the options that producer makes (records/launch.ts).
    const options = modelOptions(plan.kind, day).filter((o) => own === undefined || launchOf(plan.kind, o.key, day)?.producer === run.producer);
    const option = options.find((o) => o.key === run.option);
    const e = run.estimate;
    const estimate: PlanEstimate = {
      seconds: e.seconds,
      usd: e.usd,
      ...(e.usd !== null && e.usdRange !== undefined ? { usdRange: [e.usdRange[0], e.usdRange[1]] as const } : {}),
      ...(e.usd === null && e.unpricedReason !== undefined ? { unpricedReason: e.unpricedReason } : {}),
      src: option?.src ?? "model",
    };
    const title = "lane" in run.input && "text" in run.input ? firstSentence(run.input.text, `${run.producer} · ${run.id}`) : `${run.producer} · ${run.id}`;
    return { ...(option === undefined ? {} : { option }), options, units: run.units, noun: unitNounOf(plan.kind), estimate, media: run.lane, title };
  }
  const media = MEDIA_OF[job.producer];
  return {
    options: [],
    units: Math.max(1, job.progress.total),
    noun: "step",
    estimate: { seconds: 0, usd: null, unpricedReason: UNQUOTED, src: "illustrative" },
    ...(media === undefined ? {} : { media }),
    title: `${job.producer} · ${job.of.id}`,
  };
}

/** The work jobs a part waits for, walking through gates and slots (they are not jobs). */
function upstreamJobs(rows: readonly PartRow[], part: Part, seen = new Set<string>()): string[] {
  const out: string[] = [];
  for (const a of part.after) {
    if (seen.has(a)) continue;
    seen.add(a);
    const up = rows.find((x) => x.part.id === a);
    if (up === undefined) continue;
    if (isWork(up.part)) {
      if (up.jobId !== null) out.push(up.jobId);
    } else out.push(...upstreamJobs(rows, up.part, seen));
  }
  return out;
}

function statusOf(state: JobState): SchedItem["status"] {
  if (state === "running") return "running";
  if (state === "done" || state === "cancelled") return "done";
  if (state === "queued" || state === "planned") return "pending";
  return "stuck";
}

/** The newest jobs, each served, priced and placed. */
export function jobsView(r: Reader, now: number, cap = JOBS_CAP): ProduceJob[] {
  const day = dayOf(now);
  const jobs = r.all("SELECT record, ord FROM jobs ORDER BY n DESC LIMIT ?", cap).flatMap((row) => {
    const j = parseJsonAt("job record", jobSchema, String(row["record"]));
    return j.ok ? [{ job: j.value, ord: typeof row["ord"] === "number" ? row["ord"] : 0 }] : [];
  });
  const projects = new Map<string, { project: Project; rows: PartRow[] }>();
  const servedOf = (job: Job): Served => {
    if (job.of.kind === "part") {
      const pid = job.correlation?.projectId;
      if (pid === undefined) return { kind: "none" };
      let p = projects.get(pid);
      if (p === undefined) {
        p = { project: loadProject(r, pid), rows: loadParts(r, pid) };
        projects.set(pid, p);
      }
      const row = p.rows.find((x) => x.jobId === job.id);
      if (row === undefined || !isWork(row.part)) return { kind: "none" };
      return { kind: "part", project: p.project, rows: p.rows, row: { ...row, part: row.part } };
    }
    const raw = r.get("SELECT record FROM runs WHERE job_id = ?", job.id);
    if (raw === undefined) return { kind: "none" };
    const run = parseJsonAt("run record", runSchema, String(raw["record"]));
    return run.ok ? { kind: "run", run: run.value } : { kind: "none" };
  };
  const times = timesOf(
    r,
    jobs.filter(({ job }) => job.state !== "queued" && job.state !== "planned" && job.state !== "running").map(({ job }) => job.id),
  );
  const built = jobs.map(({ job, ord }) => {
    const served = servedOf(job);
    return { job, ord, served, priced: pricedOf(job, served, day) };
  });
  const ids = new Set<string>(built.map((b) => b.job.id));
  const items: SchedItem[] = built.map(({ job, ord, served, priced }) => {
    const t = times.get(job.id) ?? {};
    const started = job.lease === undefined ? t.start : Date.parse(job.lease.acquiredAt);
    return {
      key: job.id,
      lane: job.lane,
      seconds: priced.estimate.seconds,
      after: served.kind === "part" ? upstreamJobs(served.rows, served.row.part).filter((x) => ids.has(x)) : [],
      order: ord,
      status: statusOf(job.state),
      ...(started === undefined ? {} : { startedAt: started }),
      ...(t.end === undefined ? {} : { endedAt: t.end }),
    };
  });
  const placed = schedule({ items, capacity: LANE_CAPACITY, now });
  const held = new Set(RESOURCE_LANES.filter((l) => laneHold(r, l) !== undefined));
  return built.flatMap(({ job, served, priced }): ProduceJob[] => {
    const at = placed.get(job.id);
    if (at === undefined) return [];
    const e = priced.estimate;
    const stage = job.progress.stage ?? job.interruption?.stage;
    return [
      {
        id: job.id,
        title: priced.title,
        lane: job.lane,
        state: job.state,
        ...(priced.media === undefined ? {} : { media: priced.media }),
        ...(served.kind === "part" ? { projectId: served.project.id, projectTitle: served.project.title, partId: served.row.part.id } : {}),
        after: served.kind === "part" ? upstreamJobs(served.rows, served.row.part) : [],
        s: at.start,
        e: at.end,
        queuePos: at.queuePos,
        blocked: at.blocked,
        held: held.has(job.lane) && (job.state === "queued" || job.state === "planned"),
        attempt: job.attempt,
        ...(job.error === undefined ? {} : { error: job.error.message }),
        ...(stage === undefined ? {} : { stage }),
        model: priced.option?.label ?? job.producer,
        units: priced.units,
        noun: priced.noun,
        seconds: e.seconds,
        usd: e.usd,
        ...(e.usdRange === undefined ? {} : { usdRange: e.usdRange }),
        ...(e.unpricedReason === undefined ? {} : { unpricedReason: e.unpricedReason }),
        src: e.src,
        mode: job.mode.kind,
        ...(job.ceilingUsd === undefined ? {} : { ceilingUsd: job.ceilingUsd }),
        reroutable: priced.options.length > 1 && job.state !== "running" && job.state !== "done" && job.state !== "cancelled",
      },
    ];
  });
}

/** Every held lane: the oldest hold names the job (as Runs names it) and the stage that may have spent. */
export function holdsView(r: Reader, titles: ReadonlyMap<string, string> = new Map()): LaneHoldView[] {
  return RESOURCE_LANES.flatMap((lane): LaneHoldView[] => {
    const h = laneHold(r, lane);
    if (h === undefined) return [];
    let title = titles.get(h.jobId);
    if (title === undefined) {
      // A hold older than the newest JOBS_CAP jobs: read its job alone.
      const raw = r.get("SELECT record FROM jobs WHERE id = ?", h.jobId);
      const job = raw === undefined ? undefined : parseJsonAt("job record", jobSchema, String(raw["record"]));
      title = job?.ok === true ? `${job.value.producer} · ${job.value.of.id}` : h.jobId;
    }
    return [{ lane, jobId: h.jobId, title, ...(h.stage === undefined ? {} : { stage: h.stage }), since: h.at }];
  });
}
