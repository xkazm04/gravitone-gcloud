import "server-only";

import { disciplineOf, templateOf, type Discipline } from "@gt/catalog/projects";
import { recipeById } from "@gt/catalog/recipes";
import { err, ok, type Result } from "@gt/domain/errors";
import type { PlanView, WorkPlanPart } from "@gt/domain/produce";
import { lookOf, type ProjectLook } from "@gt/producers/frames/look";
import {
  OPS_SHOWN,
  isEditorKind,
  opLabel,
  type EditorKind,
  type PartActKind,
  type PartOp,
  type PartOpResult,
  type PartProject,
  type PartRef,
  type PartTab,
  type PartVerdict,
  type PartView,
} from "@gt/domain/partView";

import { fixtureProduce } from "../../_port/port.ts";
import { RESEARCH, type ResearchRec } from "./fixtureResearch.ts";
import { SCRIPT, type ScriptRec } from "./fixtureScript.ts";
import { encodeRecord } from "@gt/domain/steps/registry";
import { isLaterKind, later, type KCtx, type LaterKind, type RecOf as KindRecOf } from "./kinds.ts";

// THE FIXTURE PART UNIVERSE - per project, one revisioned record per editor part and its op
// log, in memory, with the rules L36's server side will keep (STEPS-DESIGN §3, COMMON 3/4):
//   · every op names the rev it was made against; a stale one writes nothing and answers the
//     view as it is now (`conflict`), the decision kernel's shape;
//   · undo reverts the last op still in effect by APPENDING an undo line - the log only grows
//     (registry undo-history/execution-emitted-inverse). The inverse is the op's own `before`
//     of the fields it touched; when a job has written one of those fields since, the undo is
//     refused with the job named rather than wiping the job's work (undo-scope: machine writes
//     are not steps, and undoing a human edit must not undo a job);
//   · a generating act is a receipt first: its token digests the part's rev, the act and the
//     option the plan routes it to, so a confirm after any write is stale and re-prices;
//   · every act runs DRY (GRAVITONE_DRY_ONLY): the confirm runs the act's stand-in end to end
//     and lands its output as a job write (`by` = the job id), the dry mechanism of decision 4;
//   · the project, its parts and their models are the produce port's (one project universe),
//     read through its public `loadPlan`; nothing here knows the produce fixture's insides.
// State is on globalThis for the server process, like the produce fixture.

type Entry<R> = {
  readonly n: number;
  readonly label: string;
  readonly by: string;
  readonly at: number;
  /** Operator edits are undoable; job landings and undo lines are not. */
  readonly kind: "op" | "job" | "undo";
  readonly before: Partial<R>;
  readonly wrote: Partial<R>;
  undone: boolean;
};
type Rec<R> = { rev: number; data: R; readonly log: Entry<R>[] };
type Records = { readonly research: Map<string, Rec<ResearchRec>>; readonly script: Map<string, Rec<ScriptRec>>; seq: number; readonly later: Map<string, Rec<object>> };
type RecOf<K extends EditorKind> = KindRecOf[K];

declare global {
  var __gtPartFixture: Records | undefined;
}

const records = (): Records => (globalThis.__gtPartFixture ??= { research: new Map(), script: new Map(), seq: 0, later: new Map() });
/** Start the part universe over (the live lane's reset, beside `resetProduce`). */
export function resetParts(): void {
  globalThis.__gtPartFixture = { research: new Map(), script: new Map(), seq: 0, later: new Map() };
}

/* ── the project, read from the produce port ─────────────────────────────── */

/** The two projects the produce seed has no discipline for (ads, free), composed through the
 *  produce port's own `compose` the first time any part is read - so they are real projects
 *  with a Plan, not a part-only island. Found again by title after a produce reset. */
const SEEDS: readonly { readonly title: string; readonly recipe: string; readonly takeId?: string }[] = [
  { title: "Rainshell — social 15", recipe: "film/ad-social-15" },
  { title: "Any video — the night market", recipe: "film/free-form" },
  /* L40 - the album video (still · words · render), from a kept take; the produce seed has none. */
  { title: "Salt lines — album video", recipe: "album-video", takeId: "take-salt-lines" },
];

function ensureSeeds(): void {
  const port = fixtureProduce();
  const list = port.listProjects();
  if (!list.ok) return;
  for (const s of SEEDS) if (!list.value.projects.some((p) => p.title === s.title)) port.compose({ recipe: s.recipe, title: s.title, ...(s.takeId === undefined ? {} : { takeId: s.takeId }) });
}

export type Ctx = {
  readonly project: PartProject;
  readonly plan: PlanView;
  readonly now: number;
  /** This project's research record (Script reads its scope, spine or idea). */
  readonly research: () => ResearchRec;
  /** What the project's pictures are drawn in (@gt/producers/frames/look): the real side reads
   *  the Style store; the fixture universe has none, so a bound style reads as `missing`. */
  readonly look: ProjectLook;
};

function disciplineFor(plan: PlanView): Discipline {
  const r = recipeById(plan.project.recipe);
  if (r?.template !== undefined) return disciplineOf(r.template);
  return r?.family === "album" ? "music-video" : "educational";
}

function contextOf(projectId: string, now: number): Result<Ctx> {
  ensureSeeds();
  const plan = fixtureProduce().loadPlan({ id: projectId });
  if (!plan.ok) return plan;
  const r = recipeById(plan.value.project.recipe);
  const targetS = plan.value.project.runtimeS ?? (r?.template === undefined ? null : templateOf(r.template).defaultS);
  const project: PartProject = {
    id: plan.value.project.id,
    title: plan.value.project.title,
    recipe: plan.value.project.recipe,
    recipeLabel: plan.value.project.recipeLabel,
    discipline: disciplineFor(plan.value),
    targetS,
  };
  const ctx: Ctx = { project, plan: plan.value, now, research: () => recOf(ctx, "research").data, look: lookOf(plan.value.project.styleId, undefined) };
  return ok(ctx);
}

/* ── records ──────────────────────────────────────────────────────────────── */

function recOf<K extends EditorKind>(ctx: Ctx, kind: K): Rec<RecOf<K>> {
  if (isLaterKind(kind)) return laterRec(ctx, kind) as Rec<RecOf<K>>;
  const map = records()[kind as "research" | "script"] as Map<string, Rec<RecOf<K>>>;
  let rec = map.get(ctx.project.id);
  if (rec === undefined) {
    const data = (kind === "research" ? RESEARCH.seed(ctx) : SCRIPT.seed(ctx)) as RecOf<K>;
    rec = { rev: 1, data, log: [] };
    map.set(ctx.project.id, rec);
  }
  return rec;
}

/* ── the later kinds (./kinds.ts): one store, one context, the same log rules ── */

/** A later module's output as the record store holds it (records are plain objects). */
const asRec = (x: unknown): object => (typeof x === "object" && x !== null ? x : {});
const seeding = new Set<string>();
function laterRec(ctx: Ctx, kind: LaterKind): Rec<object> {
  const map = records().later;
  const at = `${kind}:${ctx.project.id}`;
  let rec = map.get(at);
  if (rec === undefined) {
    // A seed reading its own kind back (directly or via `records()`) is a module defect, named.
    if (seeding.has(at)) throw new TypeError(`${kind}: its seed reads its own record`);
    seeding.add(at);
    const data = asRec(later(kind).seed(kctxOf(ctx)));
    seeding.delete(at);
    map.set(at, (rec = { rev: 1, data, log: [] }));
  }
  return rec;
}

/** L38's context plus every editor kind's record of this project, and its step records. */
export function kctxOf(ctx: Ctx): KCtx {
  const k: KCtx = {
    ...ctx,
    rec: (kind) => recOf(ctx, kind).data,
    // Through each record's DOOR as the kernel stores them: both sides' readers read one shape.
    records: () => {
      const out = new Map<string, Readonly<Record<string, unknown>>>();
      const put = (key: string, v: object): void => {
        const e = encodeRecord(key, v);
        if (e.ok && typeof e.value === "object" && e.value !== null) out.set(key, { ...e.value });
      };
      const s = recOf(ctx, "script").data;
      if (s.scenarios.length > 0) put("ads-scenarios", { ideaId: s.scenariosIdea, options: s.scenarios, pickedId: s.picked });
      for (const p of ctx.plan.parts) if (isLaterKind(p.kind)) for (const [key, v] of Object.entries(later(p.kind).records(k))) put(key, v);
      return out;
    },
  };
  return k;
}

/** The top-level fields `next` changed from `prev` (records are replaced, never mutated). */
function diff<R extends object>(prev: R, next: R): { before: Partial<R>; wrote: Partial<R> } {
  const before: Partial<R> = {};
  const wrote: Partial<R> = {};
  for (const k of Object.keys(next) as (keyof R)[]) {
    if (prev[k] === next[k]) continue;
    before[k] = prev[k];
    wrote[k] = next[k];
  }
  return { before, wrote };
}

function write<R extends object>(rec: Rec<R>, next: R, meta: { readonly label: string; readonly by: string; readonly kind: Entry<R>["kind"]; readonly at: number }): void {
  const { before, wrote } = diff(rec.data, next);
  rec.log.push({ n: rec.log.length + 1, ...meta, before, wrote, undone: false });
  rec.data = next;
  rec.rev++;
}

/** An operator's edit: the kernel refuses one that changes nothing (@gt/kernel/parts/driver.ts
 *  writePartIn, `<label>: changes nothing`) - no rev, no undo line - and so does this side. The
 *  real side compares the records by JSON (realRecs.ts `changed`); this compares the working record. */
function opWrite<R extends object>(rec: Rec<R>, next: R, label: string, at: number): Result<null> {
  if (JSON.stringify(next) === JSON.stringify(rec.data)) return err("invalid", `${label}: changes nothing`);
  write(rec, next, { label, by: "operator", kind: "op", at });
  return ok(null);
}

const effective = <R>(rec: Rec<R>): Entry<R>[] => rec.log.filter((e) => e.kind === "op" && !e.undone).reverse();

/* ── the view ─────────────────────────────────────────────────────────────── */

const work = (p: PlanView["parts"][number]): p is WorkPlanPart => p.kind !== "gate" && p.kind !== "slot";
/** A part's key is its id less the project's prefix and one separator (`<project>:<key>` on the
 *  produce fixture, `<project>/<key>` in @gt/domain/part) - gate keys carry their own colon. */
const refOf = (projectId: string, p: PlanView["parts"][number]): PartRef => ({
  partId: p.id,
  key: p.id.startsWith(projectId) ? p.id.slice(projectId.length + 1) : p.id,
  kind: p.kind,
  label: p.label,
});

function verdictOf(ctx: Ctx, kind: EditorKind): PartVerdict {
  if (isLaterKind(kind)) return later(kind).verdict(kctxOf(ctx));
  return kind === "research" ? RESEARCH.verdict(ctx, recOf(ctx, "research").data) : SCRIPT.verdict(ctx, recOf(ctx, "script").data);
}

function upstreamOf(ctx: Ctx, part: PlanView["parts"][number]): PartRef[] {
  const byId = new Map(ctx.plan.parts.map((p) => [p.id, p]));
  return part.after.flatMap((id) => {
    const up = byId.get(id);
    if (up === undefined || !isEditorKind(up.kind)) return [];
    return verdictOf(ctx, up.kind).state === "ready" ? [] : [refOf(ctx.project.id, up)];
  });
}

function tabsOf(ctx: Ctx): PartTab[] {
  return ctx.plan.parts.map((p) => {
    const editor = isEditorKind(p.kind);
    return { ...refOf(ctx.project.id, p), editor, verdict: editor && isEditorKind(p.kind) ? verdictOf(ctx, p.kind).state : null };
  });
}

function viewOf(ctx: Ctx, kind: EditorKind): Result<PartView> {
  const part = ctx.plan.parts.find((p) => p.kind === kind);
  if (part === undefined || !work(part)) return err("not-found", `${ctx.project.title} plans no ${kind} part`);
  const rec = recOf(ctx, kind);
  const base = {
    projectId: ctx.project.id,
    partId: part.id,
    key: refOf(ctx.project.id, part).key,
    rev: rec.rev,
    project: ctx.project,
    upstream: { missing: upstreamOf(ctx, part) },
    tabs: tabsOf(ctx),
    ops: effective(rec)
      .slice(0, OPS_SHOWN)
      .map((e) => ({ n: e.n, label: e.label, by: e.by, at: new Date(e.at).toISOString() })),
    running: [],
  };
  if (isLaterKind(kind)) return ok(later(kind).view(kctxOf(ctx), base));
  const r = recOf(ctx, "research").data;
  const view: PartView =
    kind === "research"
      ? { ...base, kind: "research" as const, verdict: RESEARCH.verdict(ctx, r), acts: RESEARCH.acts(ctx, r), data: RESEARCH.data(ctx, r) }
      : (() => {
          const s = recOf(ctx, "script").data;
          return { ...base, kind: "script" as const, verdict: SCRIPT.verdict(ctx, s), acts: SCRIPT.acts(ctx, s), data: SCRIPT.data(ctx, s) };
        })();
  return ok(view);
}

/** The editor kind a route key names in this project, or not-found (no such part, no editor). */
export function kindOf(projectId: string, key: string, now: number): Result<EditorKind> {
  const c = contextOf(projectId, now);
  if (!c.ok) return c;
  const part = c.value.plan.parts.find((p) => refOf(projectId, p).key === key);
  if (part === undefined || !isEditorKind(part.kind)) return err("not-found", `no editor for ${key} in ${c.value.project.title}`);
  return ok(part.kind);
}

export function loadPart(projectId: string, key: string, now: number): Result<PartView> {
  const k = kindOf(projectId, key, now);
  if (!k.ok) return k;
  const c = contextOf(projectId, now);
  return c.ok ? viewOf(c.value, k.value) : c;
}

/* ── edits ────────────────────────────────────────────────────────────────── */

function withPart(projectId: string, key: string, now: number, run: (ctx: Ctx, kind: EditorKind) => Result<null>): Result<{ ctx: Ctx; kind: EditorKind }> {
  const k = kindOf(projectId, key, now);
  if (!k.ok) return k;
  const c = contextOf(projectId, now);
  if (!c.ok) return c;
  const r = run(c.value, k.value);
  return r.ok ? ok({ ctx: c.value, kind: k.value }) : r;
}

export function opPart(projectId: string, key: string, baseRev: number, op: PartOp, now: number): Result<PartOpResult> {
  let stale = false;
  const done = withPart(projectId, key, now, (ctx, kind) => {
    if (isLaterKind(kind)) {
      const rec = laterRec(ctx, kind);
      if (rec.rev !== baseRev) return ((stale = true), ok(null));
      const next = later(kind).apply(kctxOf(ctx), op);
      if (!next.ok) return next;
      return opWrite(rec, asRec(next.value.next), next.value.label, now);
    }
    if (kind === "research") {
      const rec = recOf(ctx, "research");
      if (rec.rev !== baseRev) return ((stale = true), ok(null));
      const next = RESEARCH.apply(ctx, rec.data, op as PartOp<"research">);
      return next.ok ? opWrite(rec, next.value, opLabel(op), now) : next;
    }
    const rec = recOf(ctx, "script");
    if (rec.rev !== baseRev) return ((stale = true), ok(null));
    const next = SCRIPT.apply(ctx, rec.data, op as PartOp<"script">);
    return next.ok ? opWrite(rec, next.value, opLabel(op), now) : next;
  });
  if (!done.ok) return done;
  const view = viewOf(done.value.ctx, done.value.kind);
  if (!view.ok) return view;
  return ok(stale ? { kind: "conflict", current: view.value } : { kind: "applied", view: view.value });
}

function undoIn<R extends object>(rec: Rec<R>, now: number): Result<null> {
  const last = effective(rec)[0];
  // The kernel's refusal, code and words (@gt/kernel/parts/core.ts planUndo).
  if (last === undefined) return err("refused", "nothing on this part is left to undo");
  for (const k of Object.keys(last.wrote) as (keyof R)[]) {
    if (rec.data[k] !== last.wrote[k]) {
      const by = [...rec.log].reverse().find((e) => e.kind === "job" && k in e.wrote)?.by ?? "a later write";
      return err("conflict", `${last.label}: ${String(k)} was rewritten by ${by} since`);
    }
  }
  last.undone = true;
  write(rec, { ...rec.data, ...last.before }, { label: `undo ${last.label}`, by: "operator", kind: "undo", at: now });
  return ok(null);
}

export function undoPart(projectId: string, key: string, baseRev: number, now: number): Result<PartOpResult> {
  let stale = false;
  const done = withPart(projectId, key, now, (ctx, kind) => {
    if (isLaterKind(kind)) {
      const rec = laterRec(ctx, kind);
      return rec.rev !== baseRev ? ((stale = true), ok(null)) : undoIn(rec, now);
    }
    const rec = kind === "research" ? recOf(ctx, "research") : recOf(ctx, "script");
    if (rec.rev !== baseRev) return ((stale = true), ok(null));
    return kind === "research" ? undoIn(recOf(ctx, "research"), now) : undoIn(recOf(ctx, "script"), now);
  });
  if (!done.ok) return done;
  const view = viewOf(done.value.ctx, done.value.kind);
  if (!view.ok) return view;
  return ok(stale ? { kind: "conflict", current: view.value } : { kind: "applied", view: view.value });
}

/* ── acts: what the receipt and the dry landing need from the core ───────── */

export type ActBasis = { readonly ctx: Ctx; readonly kind: EditorKind; readonly part: WorkPlanPart; readonly rev: number; readonly units: number; readonly target?: string };

/** The act's subject as the receipt prices it: its part (for the routed model), rev and units. */
export function actBasis(projectId: string, key: string, act: PartActKind, now: number, target?: string): Result<ActBasis> {
  const k = kindOf(projectId, key, now);
  if (!k.ok) return k;
  const c = contextOf(projectId, now);
  if (!c.ok) return c;
  const ctx = c.value;
  const part = ctx.plan.parts.find((p) => p.kind === k.value);
  if (part === undefined || !work(part)) return err("not-found", `no ${k.value} part`);
  if (isLaterKind(k.value)) {
    const u = later(k.value).units(kctxOf(ctx), act, target);
    if (!u.ok) return u;
    return ok({ ctx, kind: k.value, part, rev: laterRec(ctx, k.value).rev, units: u.value, ...(target === undefined ? {} : { target }) });
  }
  const units = k.value === "research" ? RESEARCH.units(ctx, recOf(ctx, "research").data, act) : SCRIPT.units(ctx, recOf(ctx, "script").data, act);
  if (!units.ok) return units;
  return ok({ ctx, kind: k.value, part, rev: recOf(ctx, k.value).rev, units: units.value });
}

/** Land a dry job's stand-in output as a job write, and answer the view after it. */
export function landAct(b: ActBasis, act: PartActKind, jobId: string): Result<PartView> {
  const at = b.ctx.now;
  if (isLaterKind(b.kind)) {
    const rec = laterRec(b.ctx, b.kind);
    const next = later(b.kind).land(kctxOf(b.ctx), act, at, jobId, b.target);
    if (!next.ok) return next;
    write(rec, asRec(next.value), { label: b.target === undefined ? act : `${act} ${b.target}`, by: jobId, kind: "job", at });
    return viewOf(b.ctx, b.kind);
  }
  if (b.kind === "research") {
    const rec = recOf(b.ctx, "research");
    const next = RESEARCH.land(b.ctx, rec.data, act, at);
    if (!next.ok) return next;
    write(rec, next.value, { label: act, by: jobId, kind: "job", at });
  } else {
    const rec = recOf(b.ctx, "script");
    const next = SCRIPT.land(b.ctx, rec.data, act, at);
    if (!next.ok) return next;
    write(rec, next.value, { label: act, by: jobId, kind: "job", at });
  }
  return viewOf(b.ctx, b.kind);
}

export function nextJobId(b: ActBasis, act: PartActKind): string {
  return `job:part:${b.part.id}:${act}${b.target === undefined ? "" : `:${b.target}`}:${++records().seq}`;
}
