import "server-only";

import { createHash } from "node:crypto";

import { planParts, recipeById, type GateVerdict, type Recipe, type WorkKind } from "@gt/catalog/recipes";
import type { JobState } from "@gt/domain/job.machine";
import type { PartState } from "@gt/domain/part.machine";
import { LANE_CAPACITY, type MediaLane, type ResourceLane } from "@gt/domain/lane";
import { partStatesOf, type PartFacts } from "@gt/domain/plan";
import type { ModelOption, ReceiptMode } from "@gt/domain/produce";

import { KEPT_TAKES, OPTIONS, SEED_INTERRUPTED, SEED_PROJECTS, SEED_RUNNING_ARTICLE, type SeedProject } from "./fixtureData.ts";
import { schedule, type Item, type Phase, type Placed } from "./schedule.ts";

// THE FIXTURE PRODUCE UNIVERSE - an in-memory studio with the kernel's rules. It was written (L28)
// so the Floor composers, the Plan, Compose and the Runs acts could be built before the records
// module and the worker existed; they exist now (./real.ts, L35), and the fixture stays for /kit,
// the fixture lane and GRAVITONE_PRODUCE_SIDE=fixture - so where it and the kernel disagree, the
// kernel is right (tests/next-server/produce-fixture-parity.test.ts drives both). Not a mock that
// answers yes: what a screen depends on is enforced here the way the kernel enforces it
// (@gt/domain/produce, COMMON decisions 3-7):
//   · every write names its revision; a stale one is `conflict` and writes nothing;
//   · a launch is a receipt first: its token is a digest of the inputs AND of the queue state
//     read, and a confirm whose token no longer matches launches nothing and answers the fresh
//     receipt (`StaleReceipt`);
//   · a ceiling is a stop point the job carries, never a refusal at confirm (the receipt marks a
//     worst case over it); unpriced work is counted, never priced;
//   · part and project state are DERIVED (`partStatesOf`, the domain's one rule), never stored;
//   · a job interrupted on a paid lane HOLDS the lane until an operator acknowledges it, and
//     nothing claims a held lane; interrupted work never resumes on its own;
//   · every job runs DRY - the fixture universe is GRAVITONE_DRY_ONLY by decision 4.
// Nothing here advances a job by itself: there is no worker in the fixture, so what was queued
// stays queued, and the clock moves only the NOW the schedule is drawn from.
// State lives on globalThis for the server process (Next loads a module per bundle and per hot
// reload; one universe must answer them all); `resetProduce` starts it over.

const MIN = 60_000;

export type FxPart = {
  readonly id: string;
  readonly key: string;
  readonly kind: WorkKind | "gate" | "slot";
  readonly after: readonly string[];
  units: number;
  readonly unitsRange?: readonly [number, number];
  option?: string;
  readonly judges?: string;
  readonly verdict?: GateVerdict;
  packet?: "open" | "committed";
};

export type FxProject = {
  readonly id: string;
  rev: number;
  title: string;
  readonly recipe: Recipe;
  readonly styleId?: string;
  readonly takeId?: string;
  readonly topic?: string;
  readonly runtimeS?: number;
  readonly createdAt: number;
  launchedAt?: number;
  launched: boolean;
  readonly parts: FxPart[];
  updatedAt: number;
};

export type FxJob = {
  readonly id: string;
  readonly of: { readonly kind: "part" | "run"; readonly id: string };
  readonly projectId?: string;
  readonly partId?: string;
  readonly title: string;
  readonly kind: WorkKind;
  readonly media?: MediaLane;
  option: ModelOption;
  units: number;
  state: JobState;
  order: number;
  attempt: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  stage?: string;
  ceilingUsd?: number;
  readonly mode: ReceiptMode;
};

export type FxHold = { readonly jobId: string; readonly stage?: string; readonly at: number };

export type Universe = {
  projects: Map<string, FxProject>;
  jobs: Map<string, FxJob>;
  holds: Map<ResourceLane, FxHold>;
  seq: number;
  order: number;
  born: number;
};

declare global {
  var __gtProduceFixture: Universe | undefined;
}

export const isWorkKind = (k: FxPart["kind"]): k is WorkKind => k !== "gate" && k !== "slot";
export const optionsOf = (k: WorkKind): readonly ModelOption[] => OPTIONS[k].options;
export const optionOf = (k: WorkKind, key: string | undefined): ModelOption | undefined => optionsOf(k).find((o) => o.key === key) ?? optionsOf(k)[0];
export const nounOf = (k: WorkKind): string => OPTIONS[k].noun;
export const partJobId = (partId: string): string => `job:part:${partId}`;

/** The plan's words for a part (`frames`, `verdict · frames`, `slot`). */
export function partLabel(p: Pick<FxPart, "kind" | "key" | "judges">): string {
  if (p.kind === "gate") return `verdict · ${(p.judges ?? p.key).split(":").at(-1) ?? p.key}`;
  return p.kind;
}

export function partsOf(projectId: string, recipe: Recipe, units: Readonly<Record<string, number>>): FxPart[] {
  return planParts(recipe, units).map((pp) => {
    const id = `${projectId}:${pp.key}`;
    const after = pp.after.map((a) => `${projectId}:${a}`);
    if (pp.kind === "gate") return { id, key: pp.key, kind: "gate", after, units: 0, judges: `${projectId}:${pp.judges}`, verdict: pp.verdict, packet: "open" };
    if (pp.kind === "slot") return { id, key: pp.key, kind: "slot", after, units: 0 };
    return { id, key: pp.key, kind: pp.kind, after, units: pp.units, ...(pp.unitsRange === undefined ? {} : { unitsRange: pp.unitsRange }), option: optionsOf(pp.kind)[0]?.key ?? "" };
  });
}

function seedProject(u: Universe, sp: SeedProject, now: number): void {
  const recipe = recipeById(sp.recipe);
  if (recipe === undefined) return;
  const parts = partsOf(sp.id, recipe, sp.units ?? {});
  const take = KEPT_TAKES.find((t) => t.id === sp.takeId);
  const p: FxProject = {
    id: sp.id,
    rev: 1,
    title: sp.title,
    recipe,
    ...(sp.styleId === undefined ? {} : { styleId: sp.styleId }),
    ...(sp.takeId === undefined ? {} : { takeId: sp.takeId }),
    ...(sp.topic === undefined ? {} : { topic: sp.topic }),
    ...(take === undefined ? {} : { runtimeS: take.durationS }),
    createdAt: now - 26 * 60 * MIN,
    launched: sp.launched,
    parts,
    updatedAt: now - 60 * MIN,
  };
  for (const part of parts) if (part.kind === "gate" && sp.gates.includes(part.key)) part.packet = "committed";
  if (sp.launched) {
    p.launchedAt = now - 25 * 60 * MIN;
    for (const part of parts) {
      if (!isWorkKind(part.kind)) continue;
      const seed = sp.jobs[part.key];
      const option = optionOf(part.kind, part.option);
      if (option === undefined) continue;
      const startedAt = seed?.at === undefined ? undefined : now + seed.at * MIN;
      u.jobs.set(partJobId(part.id), {
        id: partJobId(part.id),
        of: { kind: "part", id: part.id },
        projectId: p.id,
        partId: part.id,
        title: `${p.title} · ${part.kind}`,
        kind: part.kind,
        option,
        units: part.units,
        state: seed?.state ?? "queued",
        order: u.order++,
        attempt: 1,
        ...(startedAt === undefined ? {} : { startedAt }),
        ...(startedAt === undefined || seed?.took === undefined ? {} : { endedAt: startedAt + seed.took * MIN }),
        ...(seed?.error === undefined ? {} : { error: seed.error }),
        ...(seed?.stage === undefined ? {} : { stage: seed.stage }),
        mode: "dry",
      });
    }
  }
  u.projects.set(p.id, p);
}

function seedRuns(u: Universe, now: number): void {
  const suno = optionOf("track", undefined);
  const article = optionOf("article", undefined);
  if (suno !== undefined) {
    const id = "job:run:run-seed-suno";
    u.jobs.set(id, { id, of: { kind: "run", id: "run-seed-suno" }, title: SEED_INTERRUPTED.title, kind: "track", media: "audio", option: suno, units: 4, state: "interrupted", order: u.order++, attempt: 1, startedAt: now + SEED_INTERRUPTED.at * MIN, endedAt: now + (SEED_INTERRUPTED.at + 9) * MIN, stage: SEED_INTERRUPTED.stage, error: "the render box restarted mid-run", mode: "dry" });
    u.holds.set(suno.lane, { jobId: id, stage: SEED_INTERRUPTED.stage, at: now + (SEED_INTERRUPTED.at + 9) * MIN });
  }
  if (article !== undefined) {
    const id = "job:run:run-seed-article";
    u.jobs.set(id, { id, of: { kind: "run", id: "run-seed-article" }, title: SEED_RUNNING_ARTICLE.title, kind: "article", media: "article", option: article, units: 1, state: "running", order: u.order++, attempt: 1, startedAt: now + SEED_RUNNING_ARTICLE.at * MIN, stage: SEED_RUNNING_ARTICLE.stage, mode: "dry" });
  }
}

function born(now: number): Universe {
  const u: Universe = { projects: new Map(), jobs: new Map(), holds: new Map(), seq: 0, order: 0, born: now };
  for (const sp of SEED_PROJECTS) seedProject(u, sp, now);
  seedRuns(u, now);
  return u;
}

export function universe(now: number = Date.now()): Universe {
  return (globalThis.__gtProduceFixture ??= born(now));
}

/** Start the universe over (the live lane's reset). */
export function resetProduce(now: number = Date.now()): void {
  globalThis.__gtProduceFixture = born(now);
}

/* ── the schedule over the whole universe ─────────────────────────────────── */

function jobPhase(s: JobState): Phase {
  switch (s) {
    case "done":
      return "done";
    case "running":
      return "running";
    case "paused":
      return "paused";
    case "failed":
    case "interrupted":
    case "cancelled":
      return "failed";
    case "planned":
    case "queued":
      return "waiting";
  }
}

const jobOfPart = (u: Universe, partId: string): FxJob | undefined => u.jobs.get(partJobId(partId));

/** Schedule items for a project: launched, or previewed as if launched now (`preview`). */
function projectItems(u: Universe, p: FxProject, preview: boolean): Item[] {
  if (!p.launched && !preview) return [];
  const items: Item[] = [];
  p.parts.forEach((part, i) => {
    if (isWorkKind(part.kind)) {
      const j = jobOfPart(u, part.id);
      const o = j?.option ?? optionOf(part.kind, part.option);
      if (o === undefined) return;
      items.push({
        key: part.id,
        lane: o.lane,
        seconds: o.secondsPerUnit * Math.max(1, j?.units ?? part.units),
        after: part.after,
        phase: j === undefined ? "waiting" : jobPhase(j.state),
        order: j?.order ?? u.order + i,
        ...(j?.startedAt === undefined ? {} : { startedAt: j.startedAt }),
        ...(j?.endedAt === undefined ? {} : { endedAt: j.endedAt }),
      });
      return;
    }
    const judged = part.judges === undefined ? undefined : jobOfPart(u, part.judges);
    const phase: Phase = part.kind === "slot" ? "slot" : judged?.state === "done" ? (part.packet === "committed" ? "gate-done" : "gate-open") : "waiting";
    const at = judged?.endedAt;
    items.push({ key: part.id, lane: null, seconds: 0, after: part.after, phase, order: u.order + i, ...(phase === "gate-done" && at !== undefined ? { startedAt: at, endedAt: at + 20 * MIN } : {}) });
  });
  return items;
}

function runItems(u: Universe): Item[] {
  return [...u.jobs.values()]
    .filter((j) => j.of.kind === "run")
    .map((j) => ({ key: j.id, lane: j.option.lane, seconds: j.option.secondsPerUnit * Math.max(1, j.units), after: [], phase: jobPhase(j.state), order: j.order, ...(j.startedAt === undefined ? {} : { startedAt: j.startedAt }), ...(j.endedAt === undefined ? {} : { endedAt: j.endedAt }) }));
}

/** Every item placed: launched work, Floor runs, and `extra` items (a receipt's would-be job). */
export function placeAll(u: Universe, now: number, opts: { readonly preview?: string; readonly extra?: readonly Item[] } = {}): Map<string, Placed> {
  const items = [...[...u.projects.values()].flatMap((p) => projectItems(u, p, p.id === opts.preview)), ...runItems(u), ...(opts.extra ?? [])];
  return schedule(items, now, LANE_CAPACITY, new Set(u.holds.keys()));
}

/** Part states by the domain's one rule. */
export function partStates(u: Universe, p: FxProject): Map<string, PartState> {
  const facts = new Map<string, PartFacts>();
  for (const part of p.parts) {
    if (isWorkKind(part.kind)) {
      const j = jobOfPart(u, part.id);
      if (j !== undefined) facts.set(part.id, { job: j.state });
    } else if (part.kind === "gate") facts.set(part.id, { packet: part.packet === "committed" ? "committed" : "open" });
  }
  return partStatesOf(p.parts.map((x) => ({ id: x.id, kind: x.kind, after: x.after })), facts, p.launched);
}

/* ── the token ────────────────────────────────────────────────────────────── */

/**
 * What a receipt read of the queue: every job's state, order, route and units, every hold, every
 * project's revision. Any act anywhere changes it, so a confirm against an old read is stale -
 * the fail-closed side: a receipt is re-read rather than trusted across a change it never saw.
 */
export function queueSignature(u: Universe): string {
  const jobs = [...u.jobs.values()].map((j) => `${j.id}|${j.state}|${j.order}|${j.option.key}|${j.units}`).sort();
  const holds = [...u.holds.entries()].map(([l, h]) => `${l}|${h.jobId}`).sort();
  const revs = [...u.projects.values()].map((p) => `${p.id}|${p.rev}`).sort();
  return [...jobs, "#", ...holds, "#", ...revs].join("\n");
}

export function tokenOf(subject: unknown, spec: unknown, u: Universe): string {
  return createHash("sha256").update(JSON.stringify({ subject, spec })).update("\n").update(queueSignature(u)).digest("hex").slice(0, 40);
}
