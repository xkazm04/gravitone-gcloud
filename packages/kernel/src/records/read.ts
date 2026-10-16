import { recipeById } from "@gt/catalog/recipes";
import { parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { jobSchema, type Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import { isWork, type Part } from "@gt/domain/part";
import { partStatesOf, type PacketFact, type PartFacts } from "@gt/domain/plan";
import type { PartState } from "@gt/domain/part.machine";
import type { LaneLoad, ModelOption, PlanEstimate, PlanPart, PlanView, ProjectGroup, ProjectList, ProjectSummary } from "@gt/domain/produce";
import { projectStateOf, type Project } from "@gt/domain/project";
import type { ProjectState } from "@gt/domain/project.machine";
import { canonical, sha256Hex } from "../canonical.ts";
import type { Reader, Store } from "../store.ts";
import { modelOptions, unitNounOf } from "./options.ts";
import { priceLine, placePlan, totalsOf, type PlanLine, type QueueRead } from "./receipt.ts";
import { etaOf, type SchedItem } from "./schedule.ts";
import { loadParts, loadProject, quotedSecondsOf, type PartRow } from "./schema.ts";

// THE READS - a project as the Plan draws it, the list as the left column groups it, and the
// queue state every receipt is computed against. Everything is assembled from the records, the
// jobs and the option table at read; nothing here is stored.

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/** What the reads need from outside the store: the clock, and the gate facts (Wave C wires packets). */
export type ReadContext = {
  readonly now: number;
  readonly capacity?: Readonly<Record<ResourceLane, number>>;
  /** Read inside the SAME snapshot as the plan (`r`): a store read cannot nest another. */
  readonly packetOf?: (partId: string, r: Reader) => PacketFact | undefined;
  readonly slottedOf?: (partId: string) => boolean;
};

const capOf = (ctx: ReadContext): Readonly<Record<ResourceLane, number>> => ctx.capacity ?? LANE_CAPACITY;
const dayOf = (now: number): string => new Date(now).toISOString().slice(0, 10);

const ms = (iso: string | undefined): number | undefined => (iso === undefined ? undefined : Date.parse(iso));

function jobOf(r: Reader, id: string): Job | undefined {
  const raw = r.get("SELECT record FROM jobs WHERE id = ?", id);
  return raw === undefined ? undefined : must(parseJsonAt("job record", jobSchema, String(raw["record"])));
}

function orderOf(r: Reader, id: string): number {
  const v = r.get("SELECT ord FROM jobs WHERE id = ?", id)?.["ord"];
  return typeof v === "number" ? v : Number.MAX_SAFE_INTEGER;
}

/** When a finished job last ran: its last claim and its finish, from its own events. */
function ranAt(r: Reader, jobId: string): { start?: number; end?: number } {
  const rows = r.all("SELECT type, at FROM events WHERE subject_id = ? AND type IN ('job.claimed', 'job.done') ORDER BY seq", jobId);
  let start: number | undefined;
  let end: number | undefined;
  for (const row of rows) {
    const at = Date.parse(String(row["at"]));
    if (row["type"] === "job.claimed") start = at;
    else end = at;
  }
  return { ...(start === undefined ? {} : { start }), ...(end === undefined ? {} : { end }) };
}

/**
 * The live queue - every queued or running job, except those `exclude` names (the plan being
 * priced is placed as itself, not as somebody else's work). Its digest is half a receipt's token.
 */
export function readQueue(r: Reader, exclude: ReadonlySet<string> = new Set()): QueueRead {
  const rows = r.all("SELECT id, lane, state, ord FROM jobs WHERE state IN ('queued', 'running') ORDER BY lane, ord, n");
  const others: SchedItem[] = [];
  const seen: unknown[] = [];
  for (const row of rows) {
    const id = String(row["id"]);
    if (exclude.has(id)) continue;
    const job = jobOf(r, id);
    if (job === undefined) continue;
    const order = typeof row["ord"] === "number" ? row["ord"] : 0;
    seen.push([id, job.lane, job.state, order]);
    const started = ms(job.lease?.acquiredAt);
    others.push({
      key: `job:${id}`,
      lane: job.lane,
      seconds: quotedSecondsOf(r, id),
      after: [],
      order,
      status: job.state === "running" ? "running" : "pending",
      ...(started === undefined ? {} : { startedAt: started }),
    });
  }
  return { others, digest: sha256Hex(canonical(seen)) };
}

/** A part's schedule status from its derived state. */
function statusOf(state: PartState): SchedItem["status"] {
  if (state === "ratified") return "done";
  if (state === "running") return "running";
  if (state === "failed" || state === "blocked" || state === "paused") return "stuck";
  return "pending";
}

export type ProjectModel = {
  readonly project: Project;
  readonly rows: readonly PartRow[];
  readonly states: ReadonlyMap<string, PartState>;
  readonly jobs: ReadonlyMap<string, Job>;
  readonly options: ReadonlyMap<string, readonly ModelOption[]>;
  readonly lines: readonly PlanLine[];
  readonly state: ProjectState;
};

/** The chosen option, or - when the catalog dropped it - the first, so the plan still prices. */
export function chosenOf(options: readonly ModelOption[], key: string): ModelOption | undefined {
  return options.find((o) => o.key === key) ?? options[0];
}

export function projectModel(r: Reader, id: string, ctx: ReadContext): ProjectModel {
  const project = loadProject(r, id);
  const rows = loadParts(r, id);
  const day = dayOf(ctx.now);
  const jobs = new Map<string, Job>();
  const facts = new Map<string, PartFacts>();
  for (const row of rows) {
    const p = row.part;
    if (row.jobId !== null) {
      const job = jobOf(r, row.jobId);
      if (job !== undefined) {
        jobs.set(p.id, job);
        facts.set(p.id, { job: job.state });
      }
    } else if (p.kind === "gate") {
      const packet = ctx.packetOf?.(p.id, r);
      if (packet !== undefined) facts.set(p.id, { packet });
    } else if (p.kind === "slot") {
      facts.set(p.id, { slotted: ctx.slottedOf?.(p.id) === true });
    }
  }
  const launched = project.launchedAt !== undefined;
  const states = partStatesOf(rows.map((x) => x.part), facts, launched);
  const options = new Map<string, readonly ModelOption[]>();
  const lines = rows.map((row): PlanLine => {
    const p = row.part;
    const state = states.get(p.id) ?? "draft";
    const job = jobs.get(p.id);
    const status = launched ? statusOf(state) : "pending";
    const ran = job !== undefined && (status === "done" || status === "running") ? ranAt(r, job.id) : {};
    const started = ms(job?.lease?.acquiredAt) ?? ran.start;
    const timing = { ...(started === undefined ? {} : { startedAt: started }), ...(ran.end === undefined ? {} : { endedAt: ran.end }) };
    if (!isWork(p)) return { key: p.id, label: p.kind === "gate" ? `◆ ${p.verdict}` : "slot", lane: null, units: 0, after: p.after, order: row.ord, status, ...timing };
    const opts = modelOptions(p.kind, day);
    options.set(p.id, opts);
    const option = chosenOf(opts, p.option);
    const order = job === undefined ? 1e9 + row.ord : orderOf(r, job.id);
    return { key: p.id, label: p.kind, lane: option?.lane ?? null, units: p.units, ...(option === undefined ? {} : { option }), after: p.after, order, status, ...timing };
  });
  return { project, rows, states, jobs, options, lines, state: projectStateOf([...states.values()].map((state) => ({ state }))) };
}

const groupOf = (s: ProjectState): ProjectGroup =>
  s === "awaiting_gate" ? "weir" : s === "blocked" ? "blocked" : s === "draft" ? "plans" : s === "ratified" ? "shipped" : "active";

const iso = (n: number | null): string | null => (n === null ? null : new Date(n).toISOString());

function view(m: ProjectModel, queue: QueueRead, ctx: ReadContext): PlanView {
  const placed = placePlan(m.lines, queue, capOf(ctx), ctx.now);
  const launched = m.project.launchedAt !== undefined;
  const estimates: PlanEstimate[] = [];
  const lanes = new Map<ResourceLane, { jobs: number; seconds: number; usd: number; unpriced: number; queuePos: number | null }>();
  let spent = 0;
  const parts = m.rows.map((row, i): PlanPart => {
    const p: Part = row.part;
    const line = m.lines[i];
    const at = placed.get(p.id);
    const schedule = at === undefined ? undefined : { start: new Date(at.start).toISOString(), end: new Date(at.end).toISOString(), queuePos: at.queuePos };
    const base = { id: p.id, after: p.after, state: m.states.get(p.id) ?? "draft", ...(schedule === undefined ? {} : { schedule }) };
    if (!isWork(p)) return { ...base, kind: p.kind, label: line?.label ?? p.kind, ...(p.kind === "gate" ? { judges: p.judges, verdict: p.verdict } : {}) };
    const options = m.options.get(p.id) ?? [];
    const option = line?.option;
    const est: PlanEstimate = option === undefined ? { seconds: 0, usd: null, unpricedReason: `no option ${p.option} for ${p.kind}`, src: "illustrative" } : priceLine(p.units, option);
    estimates.push(est);
    const job = m.jobs.get(p.id);
    if (job !== undefined) spent += job.spend.usd;
    if (option !== undefined) {
      const l = lanes.get(option.lane) ?? { jobs: 0, seconds: 0, usd: 0, unpriced: 0, queuePos: null };
      const q = launched ? null : (at?.queuePos ?? null);
      lanes.set(option.lane, { jobs: l.jobs + 1, seconds: l.seconds + est.seconds, usd: l.usd + (est.usd ?? 0), unpriced: l.unpriced + (est.usd === null ? 1 : 0), queuePos: l.queuePos === null ? q : q === null ? l.queuePos : Math.min(l.queuePos, q) });
    }
    const range = rangeOf(m.project, p.id);
    return {
      ...base,
      kind: p.kind,
      label: p.kind,
      units: p.units,
      unitNoun: unitNounOf(p.kind),
      ...(range === undefined ? {} : { unitsRange: range }),
      options,
      chosen: option?.key ?? p.option,
      estimate: est,
      ...(row.jobId === null ? {} : { jobId: row.jobId }),
      ...(job === undefined ? {} : { jobState: job.state, attempt: job.attempt, ...(job.error === undefined ? {} : { error: job.error.message }) }),
    };
  });
  const t = totalsOf(estimates);
  const workKeys = new Set(m.lines.filter((l) => l.lane !== null).map((l) => l.key));
  const eta = etaOf(new Map([...placed].filter(([k]) => workKeys.has(k))));
  const recipe = recipeById(m.project.recipe);
  const laneLoads: LaneLoad[] = [...lanes].map(([lane, l]) => ({ lane, jobs: l.jobs, seconds: l.seconds, usd: Math.round(l.usd * 100) / 100, unpriced: l.unpriced, queuePos: l.queuePos }));
  return {
    project: {
      id: m.project.id,
      rev: m.project.rev,
      title: m.project.title,
      recipe: m.project.recipe,
      recipeLabel: recipe?.label ?? m.project.recipe,
      state: m.state,
      launched,
      createdAt: m.project.createdAt,
      ...(m.project.styleId === undefined ? {} : { styleId: m.project.styleId }),
      ...(m.project.takeId === undefined ? {} : { takeId: m.project.takeId }),
      ...(m.project.topic === undefined ? {} : { topic: m.project.topic }),
      ...(m.project.runtimeS === undefined ? {} : { runtimeS: m.project.runtimeS }),
      ...(m.project.launchedAt === undefined ? {} : { launchedAt: m.project.launchedAt }),
    },
    parts,
    totals: {
      seconds: t.seconds,
      usd: t.usd,
      ...(t.usdRange === undefined ? {} : { usdRange: t.usdRange }),
      unpriced: t.unpriced,
      spentUsd: Math.round(spent * 1e6) / 1e6,
      src: t.src,
      etaAt: iso(eta),
      gates: [...m.states].filter(([k, s]) => s === "awaiting_gate" && m.rows.some((x) => x.part.id === k && x.part.kind === "gate")).length,
    },
    lanes: laneLoads,
  };
}

/** A part's units bounds from its recipe (part ids are `<projectId>/<recipe key>`). */
function rangeOf(project: Project, partId: string): readonly [number, number] | undefined {
  const key = partId.slice(project.id.length + 1);
  const decl = recipeById(project.recipe)?.parts.find((x) => x.key === key);
  return decl === undefined || decl.kind === "gate" || decl.kind === "slot" || "fixed" in decl.units ? undefined : decl.units.range;
}

export function planViewIn(r: Reader, id: string, ctx: ReadContext): PlanView {
  const m = projectModel(r, id, ctx);
  const own = new Set([...m.jobs.values()].map((j) => j.id));
  return view(m, readQueue(r, own), ctx);
}

export function readProject(store: Store, id: string, ctx: ReadContext): Result<PlanView> {
  return store.read((r) => planViewIn(r, id, ctx));
}

export const LIST_LIMIT = 100;

/** The projects the left column lists, newest first, bounded (registry bounded-enumeration). */
export function listProjects(store: Store, ctx: ReadContext, limit = LIST_LIMIT): Result<ProjectList> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) return { ok: false, error: new AppError("invalid", `list limit ${limit} is not 1..500`) };
  return store.read((r) => {
    const ids = r.all("SELECT id FROM projects WHERE listed = 1 ORDER BY updated_at DESC, id LIMIT ?", limit + 1).map((x) => String(x["id"]));
    const truncated = ids.length > limit;
    const queue = readQueue(r);
    const projects = ids.slice(0, limit).map((id): ProjectSummary => {
      const m = projectModel(r, id, ctx);
      const v = view(m, queue, ctx);
      const updated = r.get("SELECT updated_at FROM projects WHERE id = ?", id)?.["updated_at"];
      const pips = v.parts.map((p) => p.state);
      return {
        id,
        rev: m.project.rev,
        title: m.project.title,
        recipe: m.project.recipe,
        state: m.state,
        group: groupOf(m.state),
        pips,
        etaAt: v.totals.etaAt,
        gates: v.totals.gates,
        failed: pips.filter((s) => s === "failed" || s === "blocked").length,
        usd: v.totals.usd,
        unpriced: v.totals.unpriced,
        updatedAt: String(updated ?? m.project.createdAt),
      };
    });
    return { projects, truncated };
  });
}
