import "server-only";

import { keyOf, projectRead, type ProjectRead } from "@/lib/parts/context";
import { partTrail, readPartIn, type PartSnapshot } from "@gt/kernel/parts/driver";
import type { StepKind } from "@gt/domain/steps/registry";
import type { Reader } from "@gt/kernel/store";
import { projectLookIn } from "@gt/producers/frames/look";
import { runningActs } from "@gt/producers/research/partJob";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { WorkPlanPart } from "@gt/domain/produce";
import { OPS_SHOWN, actBelongs, isEditorKind, opLabel, type EditorKind, type PartActKind, type PartOp, type PartProject, type PartRef, type PartRunning, type PartView, type ResearchOp, type ScriptOp } from "@gt/domain/partView";

import type { Who } from "../../_port/port.ts";
import { RESEARCH, type ResearchRec } from "./fixtureResearch.ts";
import { SCRIPT, type ScriptRec } from "./fixtureScript.ts";
import type { ActBasis, Ctx } from "./fixture.ts";
import { isLaterKind, later, recReader, type KCtx } from "./kinds.ts";
import { changed, type Obj } from "./realRecs.ts";
import { researchOf, researchRecords } from "./realResearch.ts";
import { scriptOf, scriptRecords } from "./realScript.ts";

// THE REAL SIDE'S SCENE (L36; split out of ./real.ts by L43): one part read from the kernel in
// one reader - its project's plan, its records mapped to every editor kind's working record - and
// what the port derives from it: the view, the next records an op writes, an act's basis.

export type Scene = { readonly read: ProjectRead; readonly ctx: KCtx; readonly part: WorkPlanPart; readonly kind: EditorKind; readonly snap: Pick<PartSnapshot, "records" | "rev"> };

export const OPERATOR: Actor = { kind: "operator", id: "operator" };

/** Who acts, as the part's op log and its act's job name them: the operator unless a caller says
 *  otherwise (the MCP door names its agent, ../../_port/port.ts `Who`). */
export const actorOfWho = (w: Who | undefined): Actor => (w === undefined ? OPERATOR : { kind: w.kind ?? "operator", id: w.who ?? "operator" });

export function unwrap<T>(r: Result<Result<T>>): Result<T> {
  return r.ok ? r.value : r;
}

export function sceneOf(r: Reader, projectId: string, key: string, now: number): Result<Scene> {
  const read = projectRead(r, projectId, now);
  const part = read.plan.parts.find((p) => keyOf(projectId, p.id) === key);
  if (part === undefined || !isEditorKind(part.kind) || !("options" in part)) return err("not-found", `no editor for ${key} in ${read.plan.project.title}`);
  // EVERY EDITOR KIND HOLDS STEP RECORDS (L43 declared the album's and the explainer's): this
  // assignment is the forcing function - an editor kind with no record door does not compile.
  const kind: EditorKind & StepKind = part.kind;
  const snap = readPartIn(r, { projectId, partId: part.id });
  const p = read.plan.project;
  const project: PartProject = { id: p.id, title: p.title, recipe: p.recipe, recipeLabel: p.recipeLabel, discipline: read.discipline, targetS: read.targetS };
  const base: Ctx = { project, plan: read.plan, now, research: () => researchOf(project, snap.records), look: projectLookIn(r, p.styleId) };
  const ctx: KCtx = { ...base, rec: recReader({ research: base.research, script: () => scriptOf(snap.records), later: (k) => later(k).fromRecords(snap.records, base) }), records: () => snap.records };
  return ok({ read, ctx, part, kind, snap });
}

const verdictOf = (s: Scene, kind: EditorKind) => (isLaterKind(kind) ? later(kind).verdict(s.ctx) : kind === "research" ? RESEARCH.verdict(s.ctx, s.ctx.research()) : SCRIPT.verdict(s.ctx, scriptOf(s.snap.records)));
const refOf = (projectId: string, p: { id: string; kind: PartRef["kind"]; label: string }): PartRef => ({ partId: p.id, key: keyOf(projectId, p.id), kind: p.kind, label: p.label });

/** The part's jobs that have not ended, as the view's `running` (an act this editor offers). */
function runningOf(r: Reader, partId: string, kind: EditorKind): PartRunning[] {
  return runningActs(r, partId).flatMap((j) => {
    const act = j.act;
    if (act === null || !actBelongs(kind, act)) return [];
    const since = r.get("SELECT at FROM events WHERE type = 'job.enqueued' AND subject_id = ? ORDER BY seq LIMIT 1", j.jobId)?.["at"];
    return [{ jobId: j.jobId, act, since: typeof since === "string" ? since : new Date(0).toISOString(), ...(j.stage === undefined ? {} : { stage: j.stage }) }];
  });
}

export function viewOf(r: Reader, s: Scene): PartView {
  const id = s.ctx.project.id;
  const byId = new Map(s.read.plan.parts.map((p) => [p.id, p]));
  const base = {
    projectId: id,
    partId: s.part.id,
    key: keyOf(id, s.part.id),
    rev: s.snap.rev,
    project: s.ctx.project,
    upstream: {
      missing: s.part.after.flatMap((up) => {
        const p = byId.get(up);
        return p === undefined || !isEditorKind(p.kind) || verdictOf(s, p.kind).state === "ready" ? [] : [refOf(id, p)];
      }),
    },
    tabs: s.read.plan.parts.map((p) => ({ ...refOf(id, p), editor: isEditorKind(p.kind), verdict: isEditorKind(p.kind) ? verdictOf(s, p.kind).state : null })),
    ops: partTrail(r, { projectId: id, partId: s.part.id }, OPS_SHOWN).map((o) => ({ n: o.n, label: o.label, by: o.by, at: o.at })),
    running: runningOf(r, s.part.id, s.kind),
  };
  if (isLaterKind(s.kind)) return later(s.kind).view(s.ctx, base);
  if (s.kind === "research") {
    const rec = s.ctx.research();
    return { ...base, kind: "research", verdict: RESEARCH.verdict(s.ctx, rec), acts: RESEARCH.acts(s.ctx, rec), data: RESEARCH.data(s.ctx, rec) };
  }
  const rec = scriptOf(s.snap.records);
  return { ...base, kind: "script", verdict: SCRIPT.verdict(s.ctx, rec), acts: SCRIPT.acts(s.ctx, rec), data: SCRIPT.data(s.ctx, rec) };
}

/* ── what an op writes ────────────────────────────────────────────────────── */

export type OpPlan = { act: "op"; label: string; by: Actor; next: Result<Record<string, Obj>>; raw: unknown };

const RESEARCH_OPS: ReadonlySet<string> = new Set<ResearchOp["op"]>(["descope", "restore", "like", "deepen", "confirm-scope", "queue-follow-up", "drop-follow-up", "decide-effect", "set-face", "pick-beat", "compose-spine", "set-brief", "pick-idea"]);
const isResearchOp = (op: PartOp): op is ResearchOp => RESEARCH_OPS.has(op.op);
const isScriptOp = (op: PartOp): op is ScriptOp => !RESEARCH_OPS.has(op.op);
const nope = (kind: string): Result<never> => err("invalid", `not a ${kind} op`);

/** The next records an op writes, through L38's per-kind function (research, script). */
function nextOf(s: Scene, f: { research: (rec: ResearchRec) => Result<ResearchRec>; script: (rec: ScriptRec) => Result<ScriptRec> }): Result<Record<string, Obj>> {
  if (s.kind === "research") {
    const prev = s.ctx.research();
    const next = f.research(prev);
    return next.ok ? ok(changed(researchRecords(prev), researchRecords(next.value))) : next;
  }
  const prev = scriptOf(s.snap.records);
  const next = f.script(prev);
  return next.ok ? ok(changed(scriptRecords(prev), scriptRecords(next.value))) : next;
}

/** A later kind's op as the driver writes it: the module's next record mapped to the step records
 *  it changes (the kernel refuses a key the part neither owns nor grows). */
function laterOp(s: Scene, op: PartOp, by: Actor): OpPlan {
  if (!isLaterKind(s.kind)) return { act: "op", label: op.op, by, raw: op, next: err("internal", `${s.kind} is not a later kind`) };
  const m = later(s.kind);
  const applied = m.apply(s.ctx, op);
  return { act: "op", label: applied.ok ? applied.value.label : op.op, by, raw: op, next: applied.ok ? ok(m.writes(s.ctx, applied.value.next)) : applied };
}

/** An op on any editor kind, as the driver writes it, by the operator unless `by` names another. */
export function opPlan(s: Scene, op: PartOp, by: Actor = OPERATOR): OpPlan {
  if (isLaterKind(s.kind)) return laterOp(s, op, by);
  return {
    act: "op",
    label: opLabel(op),
    by,
    raw: op,
    next: nextOf(s, {
      research: (rec) => (isResearchOp(op) ? RESEARCH.apply(s.ctx, rec, op) : nope("research")),
      script: (rec) => (isScriptOp(op) ? SCRIPT.apply(s.ctx, rec, op) : nope("script")),
    }),
  };
}

/** The act's subject as the receipt prices it: L38's ActBasis, built from the kernel's part. */
export function basisOf(r: Reader, projectId: string, key: string, act: PartActKind, now: number, target?: string): Result<ActBasis> {
  const s = sceneOf(r, projectId, key, now);
  if (!s.ok) return s;
  if (isLaterKind(s.value.kind)) {
    const u = later(s.value.kind).units(s.value.ctx, act, target);
    if (!u.ok) return u;
    return ok({ ctx: s.value.ctx, kind: s.value.kind, part: s.value.part, rev: s.value.snap.rev, units: u.value, ...(target === undefined ? {} : { target }) });
  }
  const units = s.value.kind === "research" ? RESEARCH.units(s.value.ctx, s.value.ctx.research(), act) : SCRIPT.units(s.value.ctx, scriptOf(s.value.snap.records), act);
  if (!units.ok) return units;
  return ok({ ctx: s.value.ctx, kind: s.value.kind, part: s.value.part, rev: s.value.snap.rev, units: units.value });
}
