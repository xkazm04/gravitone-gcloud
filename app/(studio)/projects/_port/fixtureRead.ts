import "server-only";

import { RECIPES } from "@gt/catalog/recipes";
import { err, ok, type Result } from "@gt/domain/errors";
import type { MediaLane, ResourceLane } from "@gt/domain/lane";
import { weakest } from "@gt/domain/plan";
import type { LaneLoad, ModelOption, PlanPart, PlanTotals, PlanView, ProjectGroup, ProjectList, ProjectSummary } from "@gt/domain/produce";
import { projectStateOf } from "@gt/domain/project";

import type { ComposeChoices, ComposerChoices, LaneHoldView, ProduceJob } from "./contract.ts";
import { CANDIDATE_STYLES, KEPT_TAKES, PROVEN_STYLES, SUBJECTS, SWEEP_STYLES, TOPICS } from "./fixtureData.ts";
import { isWorkKind, nounOf, optionOf, optionsOf, partJobId, partLabel, partStates, placeAll, type FxJob, type FxPart, type FxProject, type Universe } from "./fixture.ts";
import type { Placed } from "./schedule.ts";

// THE FIXTURE'S READS - the universe (./fixture.ts) as the contract's views: a project's plan,
// the project list in the prototype's groups, the jobs Runs draws and acts on, the held lanes,
// and what the composers and Compose offer. Each read derives; nothing it returns is stored.

const iso = (t: number): string => new Date(t).toISOString();
const round2 = (n: number): number => Math.round(n * 100) / 100;

export type CostOf = { readonly usd: number | null; readonly usdRange?: readonly [number, number]; readonly unpricedReason?: string };

export function costOf(o: ModelOption, units: number): CostOf {
  const n = Math.max(1, units);
  return {
    usd: o.usdPerUnit === null ? null : round2(o.usdPerUnit * n),
    ...(o.usdRangePerUnit === undefined ? {} : { usdRange: [o.usdRangePerUnit[0] * n, o.usdRangePerUnit[1] * n] as const }),
    ...(o.unpricedReason === undefined ? {} : { unpricedReason: o.unpricedReason }),
  };
}

const ICONS: Readonly<Record<string, MediaLane>> = { video: "video", audio: "audio", article: "article", image: "image" };

function workView(u: Universe, part: FxPart & { readonly kind: Exclude<FxPart["kind"], "gate" | "slot"> }): { option: ModelOption | undefined; units: number; job: FxJob | undefined } {
  const job = u.jobs.get(partJobId(part.id));
  return { option: job?.option ?? optionOf(part.kind, part.option), units: job?.units ?? part.units, job };
}

export function planView(u: Universe, id: string, now: number): Result<PlanView> {
  const p = u.projects.get(id);
  if (p === undefined) return err("not-found", `no project ${id}`);
  const placed = placeAll(u, now, p.launched ? {} : { preview: p.id });
  const states = partStates(u, p);
  const parts: PlanPart[] = [];
  const lanes = new Map<ResourceLane, { jobs: number; seconds: number; usd: number; unpriced: number; queuePos: number | null }>();
  let seconds = 0;
  let usd = 0;
  let lo = 0;
  let hi = 0;
  let banded = false;
  let unpriced = 0;
  let spent = 0;
  let eta: number | null = null;
  const srcs: ModelOption["src"][] = [];
  for (const part of p.parts) {
    const at: Placed | undefined = placed.get(part.id);
    if (at !== undefined) eta = Math.max(eta ?? 0, at.e);
    const base = { id: part.id, label: partLabel(part), after: part.after, state: states.get(part.id) ?? "blocked", ...(at === undefined ? {} : { schedule: { start: iso(at.s), end: iso(at.e), queuePos: at.queuePos } }) };
    if (!isWorkKind(part.kind)) {
      parts.push(part.kind === "gate" ? { ...base, kind: "gate", ...(part.judges === undefined ? {} : { judges: part.judges }), ...(part.verdict === undefined ? {} : { verdict: part.verdict }) } : { ...base, kind: "slot" });
      continue;
    }
    const { option, units, job } = workView(u, { ...part, kind: part.kind });
    if (option === undefined) continue;
    const c = costOf(option, units);
    const secs = option.secondsPerUnit * Math.max(1, units);
    seconds += secs;
    srcs.push(option.src);
    if (c.usd === null) unpriced++;
    else {
      usd += c.usd;
      lo += c.usdRange?.[0] ?? c.usd;
      hi += c.usdRange?.[1] ?? c.usd;
      banded ||= c.usdRange !== undefined;
      if (job !== undefined && (job.state === "done" || job.state === "running")) spent += c.usd;
    }
    const lane = lanes.get(option.lane) ?? { jobs: 0, seconds: 0, usd: 0, unpriced: 0, queuePos: null };
    lane.jobs++;
    lane.seconds += secs;
    lane.usd += c.usd ?? 0;
    lane.unpriced += c.usd === null ? 1 : 0;
    if (!p.launched && at?.queuePos != null) lane.queuePos = lane.queuePos === null ? at.queuePos : Math.min(lane.queuePos, at.queuePos);
    lanes.set(option.lane, lane);
    parts.push({
      ...base,
      kind: part.kind,
      units,
      unitNoun: nounOf(part.kind),
      ...(!p.launched && part.unitsRange !== undefined ? { unitsRange: part.unitsRange } : {}),
      options: optionsOf(part.kind),
      chosen: option.key,
      estimate: { seconds: secs, ...c, src: option.src },
      ...(job === undefined ? {} : { jobId: job.id, jobState: job.state, attempt: job.attempt, ...(job.error === undefined ? {} : { error: job.error }) }),
    });
  }
  const totals: PlanTotals = {
    seconds,
    usd: round2(usd),
    ...(banded ? { usdRange: [round2(lo), round2(hi)] as const } : {}),
    unpriced,
    spentUsd: round2(spent),
    src: weakest(srcs),
    etaAt: eta === null ? null : iso(eta),
    gates: p.parts.filter((x) => x.kind === "gate").length,
  };
  const loads: LaneLoad[] = [...lanes.entries()].map(([lane, l]) => ({ lane, jobs: l.jobs, seconds: l.seconds, usd: round2(l.usd), unpriced: l.unpriced, queuePos: l.queuePos })).sort((a, b) => b.seconds - a.seconds);
  return ok({
    project: {
      id: p.id,
      rev: p.rev,
      title: p.title,
      recipe: p.recipe.id,
      recipeLabel: p.recipe.label,
      state: projectStateOf([...states.values()].map((state) => ({ state }))),
      launched: p.launched,
      ...(p.styleId === undefined ? {} : { styleId: p.styleId }),
      ...(p.takeId === undefined ? {} : { takeId: p.takeId }),
      ...(p.topic === undefined ? {} : { topic: p.topic }),
      ...(p.runtimeS === undefined ? {} : { runtimeS: p.runtimeS }),
      createdAt: iso(p.createdAt),
      ...(p.launchedAt === undefined ? {} : { launchedAt: iso(p.launchedAt) }),
    },
    parts,
    totals,
    lanes: loads,
  });
}

function groupOf(launched: boolean, state: ProjectSummary["state"]): ProjectGroup {
  if (!launched) return "plans";
  if (state === "awaiting_gate") return "weir";
  if (state === "blocked") return "blocked";
  if (state === "ratified") return "shipped";
  return "active";
}

/** Bounded: the fixture never holds more than its seeds and what a session composed. */
export const LIST_CAP = 200;

export function projectList(u: Universe, now: number): ProjectList {
  const all = [...u.projects.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const projects = all.slice(0, LIST_CAP).flatMap((p): ProjectSummary[] => {
    const v = planView(u, p.id, now);
    if (!v.ok) return [];
    const { project, parts, totals } = v.value;
    return [
      {
        id: p.id,
        rev: p.rev,
        title: p.title,
        recipe: p.recipe.id,
        state: project.state,
        group: groupOf(p.launched, project.state),
        pips: parts.filter((x) => x.kind !== "gate" && x.kind !== "slot").map((x) => x.state),
        etaAt: totals.etaAt,
        gates: parts.filter((x) => x.kind === "gate" && x.state === "awaiting_gate").length,
        failed: parts.filter((x) => x.state === "failed" || x.state === "blocked").length,
        usd: totals.usd,
        unpriced: totals.unpriced,
        updatedAt: iso(p.updatedAt),
        // The fixture universe holds plans, not step records: no picture and no cut to measure.
        poster: null,
        runtimeS: null,
        targetS: p.runtimeS ?? null,
        text: [p.title, p.topic].filter((x) => x !== undefined).join(" ").toLowerCase(),
      },
    ];
  });
  return { projects, truncated: all.length > LIST_CAP };
}

/** The work jobs a part waits for, walking through gates and slots (they are not jobs). */
function upstreamJobs(u: Universe, p: FxProject, part: FxPart, seen = new Set<string>()): string[] {
  const byId = new Map(p.parts.map((x) => [x.id, x]));
  const out: string[] = [];
  for (const a of part.after) {
    if (seen.has(a)) continue;
    seen.add(a);
    const up = byId.get(a);
    if (up === undefined) continue;
    if (isWorkKind(up.kind)) {
      if (u.jobs.has(partJobId(up.id))) out.push(partJobId(up.id));
    } else out.push(...upstreamJobs(u, p, up, seen));
  }
  return out;
}

export function jobsView(u: Universe, now: number): ProduceJob[] {
  const placed = placeAll(u, now);
  return [...u.jobs.values()].flatMap((j): ProduceJob[] => {
    const at = placed.get(j.partId ?? j.id);
    if (at === undefined) return [];
    const p = j.projectId === undefined ? undefined : u.projects.get(j.projectId);
    const part = p?.parts.find((x) => x.id === j.partId);
    const c = costOf(j.option, j.units);
    return [
      {
        id: j.id,
        title: p === undefined ? j.title : `${p.title} · ${j.kind}`,
        lane: j.option.lane,
        state: j.state,
        ...(j.media === undefined ? {} : { media: j.media }),
        ...(p === undefined ? {} : { projectId: p.id, projectTitle: p.title }),
        ...(j.partId === undefined ? {} : { partId: j.partId }),
        after: p === undefined || part === undefined ? [] : upstreamJobs(u, p, part),
        s: at.s,
        e: at.e,
        queuePos: at.queuePos,
        blocked: at.blocked,
        held: at.held,
        attempt: j.attempt,
        ...(j.error === undefined ? {} : { error: j.error }),
        ...(j.stage === undefined ? {} : { stage: j.stage }),
        model: j.option.label,
        units: j.units,
        noun: nounOf(j.kind),
        seconds: j.option.secondsPerUnit * Math.max(1, j.units),
        ...c,
        src: j.option.src,
        mode: j.mode,
        ...(j.ceilingUsd === undefined ? {} : { ceilingUsd: j.ceilingUsd }),
        reroutable: optionsOf(j.kind).length > 1 && j.state !== "running" && j.state !== "done" && j.state !== "cancelled",
      },
    ];
  });
}

export function holdsView(u: Universe): LaneHoldView[] {
  return [...u.holds.entries()].map(([lane, h]) => ({ lane, jobId: h.jobId, title: u.jobs.get(h.jobId)?.title ?? h.jobId, ...(h.stage === undefined ? {} : { stage: h.stage }), since: iso(h.at) }));
}

export function composerChoices(): ComposerChoices {
  return {
    image: { candidates: CANDIDATE_STYLES.map((s) => ({ value: s.id, label: s.name })), proven: PROVEN_STYLES.map((s) => ({ value: s.id, label: s.name })), sweep: SWEEP_STYLES },
    article: { topics: TOPICS.map((t) => ({ value: t.slug, label: t.title, bundle: t.bundle })) },
    video: { subjects: SUBJECTS.map((s) => ({ value: s.id, label: `Strip · ${s.id}` })) },
  };
}

export function composeChoices(u: Universe): ComposeChoices {
  const used = new Set([...u.projects.values()].flatMap((p) => (p.takeId === undefined ? [] : [p.takeId])));
  const fresh = KEPT_TAKES.find((t) => !used.has(t.id));
  return {
    recipes: RECIPES.map((r) => ({ id: r.id, label: r.label, sub: r.sub, icon: ICONS[r.icon] ?? "video" })),
    styles: PROVEN_STYLES.map((s) => ({ value: s.id, label: s.name })),
    takes: KEPT_TAKES.map((t) => ({ value: t.id, label: t.title })),
    topics: TOPICS.map((t) => ({ value: t.slug, label: t.title })),
    ...(fresh === undefined ? {} : { freshTake: fresh.id }),
  };
}
