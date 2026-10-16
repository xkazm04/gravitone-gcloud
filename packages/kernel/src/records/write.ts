import { planParts, recipeById, type Recipe } from "@gt/catalog/recipes";
import { TEMPLATES } from "@gt/catalog/projects";
import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { isWork, type PartInput } from "@gt/domain/part";
import { composeInputSchema, partPatchSchema } from "@gt/domain/produce.schema";
import type { ComposeInput, PartPatch } from "@gt/domain/produce";
import { projectPlanSchema, type Project } from "@gt/domain/project";
import { append } from "../events.ts";
import { releaseIn } from "../job.ts";
import type { Store, Tx } from "../store.ts";
import { modelOptions } from "./options.ts";
import { projectModel, type ReadContext } from "./read.ts";
import { insertPart, insertProject, loadParts, loadProject, putPart, putProject } from "./schema.ts";

// THE PLAN'S WRITERS - compose, change a part, rename, discard, and release what the launch
// held. Each is ONE transaction with its event (the record and the ledger never disagree), and
// each that edits a plan takes the revision it was computed from (`baseRev`): a write on a plan
// that moved is refused with the current revision, the Board's compare-and-set
// (kernel/decision/driver.ts `stale`), never a silent overwrite of somebody else's change.
//
// v1 created a project in the browser (lib/useProjects.ts `create`) and let any tab write any
// step row at any time (patchStep); two tabs on one project raced with last-writer-wins.

export type Outcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AppError; readonly current?: { readonly rev: number } };

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const dayOf = (at: string): string => at.slice(0, 10);

/** Run `fn` in one transaction; a stale revision comes back as an outcome, not a throw. */
function guarded<T>(store: Store, fn: (t: Tx) => Outcome<T>): Outcome<T> {
  const r = store.tx(fn);
  return r.ok ? r.value : r;
}

function stale<T>(id: string, rev: number): Outcome<T> {
  return { ok: false, error: new AppError("conflict", `project ${id} moved on (now at revision ${rev}); re-read the plan and send it again`), current: { rev } };
}

function projectEvent(t: Tx, actor: Actor, p: Project, type: string, data: Record<string, unknown>): void {
  append(t, { actor, type, subject: { kind: "project", id: p.id }, data: { projectId: p.id, rev: p.rev, ...data } });
}

/** The prototype's titles (projects.js compose): "Untitled film", "<take> — music video", "<topic> — explainer". */
function titleFor(recipe: Recipe, input: ComposeInput): string {
  if (input.title !== undefined) return input.title;
  if (recipe.family === "album") return `${input.takeId ?? "Untitled take"} — music video`;
  if (recipe.family === "explainer" || recipe.family === "article") return `${input.topic ?? "Untitled topic"} — ${recipe.family}`;
  if (recipe.family === "film") return "Untitled film";
  return `Untitled ${recipe.label.toLowerCase()}`;
}

export type ComposeContext = { readonly id: string };

/** A draft project with its parts from the recipe, each on its kind's first option. */
export function compose(store: Store, raw: unknown, actor: Actor, ctx: ComposeContext): Outcome<{ id: string; rev: number }> {
  return guarded(store, (t) => {
    const input = must(parseAt("compose", composeInputSchema, raw));
    const recipe = recipeById(input.recipe);
    if (recipe === undefined) throw new AppError("invalid", `compose: no recipe ${input.recipe}`);
    const at = t.at;
    const idOf = (key: string): string => `${ctx.id}/${key}`;
    const units = input.units === undefined ? {} : Object.fromEntries(Object.entries(input.units).filter((e): e is [string, number] => e[1] !== undefined));
    const parts = planParts(recipe, units).map((p): PartInput => {
      const after = p.after.map(idOf);
      if (p.kind === "gate") return { id: idOf(p.key), kind: "gate", judges: idOf(p.judges), verdict: p.verdict, after };
      if (p.kind === "slot") return { id: idOf(p.key), kind: "slot", after };
      const first = modelOptions(p.kind, dayOf(at))[0];
      if (first === undefined) throw new AppError("internal", `compose: part kind ${p.kind} has no option`);
      return { id: idOf(p.key), kind: p.kind, option: first.key, units: p.units, after };
    });
    const template = recipe.template === undefined ? undefined : TEMPLATES.find((x) => x.id === recipe.template);
    const head = {
      id: ctx.id,
      title: titleFor(recipe, input),
      recipe: recipe.id,
      ...(input.styleId === undefined ? {} : { styleId: input.styleId }),
      ...(input.takeId === undefined ? {} : { takeId: input.takeId }),
      ...(input.topic === undefined ? {} : { topic: input.topic }),
      ...(template === undefined ? {} : { runtimeS: template.defaultS }),
      rev: 1,
      createdAt: at,
    };
    const plan = must(parseAt("project plan", projectPlanSchema, { project: head, parts }));
    if (t.get("SELECT 1 AS x FROM projects WHERE id = ?", plan.project.id) !== undefined) throw new AppError("conflict", `project ${plan.project.id} already exists`);
    insertProject(t, plan.project);
    plan.parts.forEach((p, i) => insertPart(t, plan.project.id, i, p));
    projectEvent(t, actor, plan.project, "project.composed", { recipe: recipe.id, parts: plan.parts.length });
    return { ok: true, value: { id: plan.project.id, rev: 1 } };
  });
}

/** Load a draft at `baseRev`, or say why not. */
function draftAt(t: Tx, id: string, baseRev: number): { project: Project } | { staleRev: number } {
  const project = loadProject(t, id);
  if (project.rev !== baseRev) return { staleRev: project.rev };
  if (project.launchedAt !== undefined) throw new AppError("refused", `project ${id} is launched; a launched plan changes by re-routing its jobs`);
  return { project };
}

/** Change a part's option and/or units (the Plan's picker and units field) before it launches: a
 *  draft's part, or a launched plan's part with no job yet (an import's unworked part, L43). */
export function setPart(store: Store, input: { id: string; baseRev: number; partId: string; patch: PartPatch }, actor: Actor): Outcome<{ rev: number }> {
  return guarded(store, (t) => {
    const patch = must(parseAt("part change", partPatchSchema, input.patch));
    const cur = loadProject(t, input.id);
    if (cur.rev !== input.baseRev) return stale(input.id, cur.rev);
    const row = loadParts(t, input.id).find((x) => x.part.id === input.partId);
    if (row === undefined) throw new AppError("not-found", `project ${input.id} has no part ${input.partId}`);
    if (cur.launchedAt !== undefined && row.jobId !== null) throw new AppError("refused", `project ${input.id} is launched; a launched plan changes by re-routing its jobs`);
    const d = { project: cur };
    const part = row.part;
    if (!isWork(part)) throw new AppError("refused", `part ${part.id} is a ${part.kind}; it has no model or units`);
    let next = part;
    if (patch.option !== undefined) {
      if (!modelOptions(part.kind, dayOf(t.at)).some((o) => o.key === patch.option)) throw new AppError("invalid", `${patch.option} is not an option for a ${part.kind} part`);
      next = { ...next, option: patch.option };
    }
    if (patch.units !== undefined) {
      const recipe = recipeById(d.project.recipe);
      const key = part.id.slice(d.project.id.length + 1);
      const decl = recipe?.parts.find((x) => x.key === key);
      if (decl === undefined || decl.kind === "gate" || decl.kind === "slot" || "fixed" in decl.units) throw new AppError("refused", `part ${part.id} has fixed units`);
      const [lo, hi] = decl.units.range;
      if (patch.units < lo || patch.units > hi) throw new AppError("invalid", `units ${patch.units} is outside ${lo}..${hi} for ${part.kind}`);
      next = { ...next, units: patch.units };
    }
    putPart(t, input.id, { ...row, part: next });
    const project = { ...d.project, rev: d.project.rev + 1 };
    putProject(t, project, d.project.rev);
    projectEvent(t, actor, project, "project.part-set", { partId: part.id, ...(patch.option === undefined ? {} : { option: patch.option }), ...(patch.units === undefined ? {} : { units: patch.units }) });
    return { ok: true, value: { rev: project.rev } };
  });
}

export function rename(store: Store, input: { id: string; baseRev: number; title: string }, actor: Actor): Outcome<{ rev: number }> {
  return guarded(store, (t) => {
    const cur = loadProject(t, input.id);
    if (cur.rev !== input.baseRev) return stale(input.id, cur.rev);
    const title = input.title.trim();
    if (title.length === 0 || title.length > 200) throw new AppError("invalid", "a title is 1..200 characters");
    if (title === cur.title) return { ok: true, value: { rev: cur.rev } };
    const project = { ...cur, title, rev: cur.rev + 1 };
    putProject(t, project, cur.rev);
    projectEvent(t, actor, project, "project.renamed", { from: cur.title, to: title });
    return { ok: true, value: { rev: project.rev } };
  });
}

/**
 * Discard a DRAFT. A draft owns no job and no output, so the blast radius is its own rows, and
 * the event names how many parts went with it (registry entity-lifecycle: consequences computed
 * before the act; history survives the entity - the row stays as a tombstone and the events keep
 * every revision). A launched project is not discarded: its jobs are cancelled one by one in Runs.
 */
export function discard(store: Store, input: { id: string; baseRev: number }, actor: Actor): Outcome<{ rev: number }> {
  return guarded(store, (t) => {
    const d = draftAt(t, input.id, input.baseRev);
    if ("staleRev" in d) return stale(input.id, d.staleRev);
    const project = { ...d.project, rev: d.project.rev + 1, discardedAt: t.at };
    putProject(t, project, d.project.rev);
    projectEvent(t, actor, project, "project.discarded", { parts: loadParts(t, input.id).length });
    return { ok: true, value: { rev: project.rev } };
  });
}

/**
 * Release the jobs a launch enqueued `planned` (launch.ts `launchProject`) once every part they
 * wait for is ratified: L25's `releaseIn` moves each planned -> queued with `job.released`. The
 * dependency is the plan's, so the plan's module moves it, in one transaction per project. Two
 * callers: the job driver, in the SAME transaction that books a part's job done (job-run.ts - so
 * a crash can never leave a finished part with its dependents parked), and wave C's gate commit.
 */
export function releaseHeldIn(t: Tx, projectId: string, actor: Actor, ctx: ReadContext): string[] {
  const m = projectModel(t, projectId, ctx);
  const released: string[] = [];
  for (const row of m.rows) {
    const job = m.jobs.get(row.part.id);
    if (row.jobId === null || job?.state !== "planned") continue;
    if (!row.part.after.every((dep) => m.states.get(dep) === "ratified")) continue;
    // A producer's preflight (L45): a part whose act waits on a human act stays planned, named,
    // instead of being released into a failure its receipt could already see.
    if (ctx.preflightOf?.(job, t) !== undefined) continue;
    releaseIn(t, row.jobId, actor);
    released.push(row.jobId);
  }
  return released;
}

export function releaseHeld(store: Store, projectId: string, actor: Actor, ctx: ReadContext): Result<string[]> {
  return store.tx((t) => releaseHeldIn(t, projectId, actor, ctx));
}
