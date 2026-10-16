import "server-only";

import type { Notebook } from "@/lib/notebook/types";
import { sourceOf, type NotebookSource } from "@/lib/notebook/source";
import type { AdBrief, AdIdea, AdScenario } from "@/lib/ads/types";
import type { ScriptRender } from "@/lib/script/types";
import { BASELINE, type Note, type Version } from "@/lib/script/versions";
import { derive, newLog, type CutLog } from "@/lib/script/trailer/ops";
import type { TrailerCut, WithholdingBudget } from "@/lib/script/trailer/types";
import type { BeatSlot } from "@/lib/research/beats";
import { kernel } from "@/lib/kernelStore";
import { keyOf, projectRead, type ProjectRead } from "@/lib/parts/context";
import { LIVE_GATES, openReadyGates, type GateDeps } from "@/lib/parts/gates";
import { partTrail, readPartIn, undoPart, writePartIn, type PartSnapshot } from "@gt/kernel/parts/driver";
import type { Reader, Store } from "@gt/kernel/store";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { WorkPlanPart } from "@gt/domain/produce";
import { OPS_SHOWN, isEditorKind, opLabel, type EditorKind, type PartActKind, type PartOp, type PartProject, type PartRef, type PartView, type ResearchOp, type ScriptOp } from "@gt/domain/partView";

import type { ServerPart } from "./port.ts";
import { RESEARCH, type ResearchRec } from "./fixtureResearch.ts";
import { SCRIPT, type ScriptRec } from "./fixtureScript.ts";
import { emptyBrief } from "./fixtureAds.ts";
import { receiptOf } from "./fixtureActs.ts";
import type { ActBasis, Ctx } from "./fixture.ts";

// THE REAL PART SIDE (L36) - the PartPort over the kernel's `parts` module: the part's records
// are rows under their v1 keys, every edit is a row in an append-only op log, undo appends the
// prior value (refused when a job rewrote the record since), a stale base is a conflict that
// hands back the view as it is now. What each op MEANS, each act's units and dry landing, each
// verdict and each view are L38's per-kind modules (./fixtureResearch.ts, ./fixtureScript.ts),
// called, not forked: this file maps the kernel's records to and from their working records and
// supplies the context they read - this project's plan and records, and nothing else.
//
// Every act runs DRY (GRAVITONE_DRY_ONLY, COMMON decision 4): the confirm lands the act's stand-in
// as a job write (`land`, by the job id). The studio step producers (L37) replace the landing
// with a kernel job whose output lands the same way.

export type RealDeps = { readonly store: () => Result<Store>; readonly now: () => number; readonly gates: GateDeps };

type Recs = PartSnapshot["records"];
type Obj = Readonly<Record<string, unknown>>;

/** The records came through their doors and were written by these same typed appliers; the door
 *  checks what readers key on and carries the rest, so lib's types are read back here (the
 *  boundary v1 cast at too: ResearchNotebookStepData "casts at its own boundary"). */
const written = <T,>(x: unknown): T => x as T;
const obj = (x: unknown): Obj | undefined => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Obj) : undefined);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

/* ── records <-> the working records L38's modules read ───────────────────── */

type SourceMeta = { readonly kind: NotebookSource["kind"]; readonly conclusions: NotebookSource["conclusions"]; readonly dimensions: NotebookSource["dimensions"]; readonly tags: NotebookSource["tags"]; readonly digest: string };

/** A stored notebook as its source. The digest is restored, not recomputed: the store keeps JSON
 *  canonically (keys sorted) and v1's digest hashes key order, so a recomputed one would orphan
 *  every scope decided on this notebook (lib/research/scopeDigest.ts) after a reload. */
function sourceFrom(nb: Obj): NotebookSource | null {
  const notebook = obj(nb["notebook"]);
  if (notebook === undefined) return null;
  const meta = obj(nb["source"]) === undefined ? undefined : written<SourceMeta>(nb["source"]);
  const src = sourceOf(written<Notebook>(notebook), meta === undefined ? { kind: "researched" } : { kind: meta.kind, conclusions: meta.conclusions, dimensions: meta.dimensions, tags: meta.tags });
  return meta === undefined ? src : { ...src, digest: meta.digest };
}

export function researchOf(project: { readonly title: string }, recs: Recs): ResearchRec {
  const nb = recs.get("research-notebook");
  const scope = recs.get("research-scope");
  const beats = recs.get("research-beats");
  const ideas = recs.get("ads-ideas");
  const engine = obj(nb?.["engine"]);
  const adsEngine = obj(ideas?.["engine"]);
  const digest = str(scope?.["digest"]);
  return {
    choice: beats?.["mode"] === "facts" ? "notebook" : "beats",
    topic: str(recs.get("research")?.["topic"]) ?? str(nb?.["topic"]) ?? project.title,
    base: nb === undefined ? null : sourceFrom(nb),
    ...(engine === undefined ? {} : { engine: written<NonNullable<ResearchRec["engine"]>>(engine) }),
    scope: written<ResearchRec["scope"]>(scope?.["scope"] ?? {}),
    confirmed: written<ResearchRec["confirmed"]>(scope?.["confirmed"] ?? null),
    ...(digest === undefined ? {} : { scopeDigest: digest }),
    followUps: written<ResearchRec["followUps"]>(nb?.["followUps"] ?? []),
    revisions: written<ResearchRec["revisions"]>(nb?.["revisions"] ?? []),
    slots: written<readonly BeatSlot[] | null>(beats?.["slots"] ?? null),
    picks: written<ResearchRec["picks"]>(beats?.["picks"] ?? {}),
    spine: written<ResearchRec["spine"]>(beats?.["confirmed"] ?? null),
    brief: obj(recs.get("ads-brief")?.["brief"]) === undefined ? emptyBrief() : written<AdBrief>(recs.get("ads-brief")?.["brief"]),
    ideas: written<readonly AdIdea[]>(ideas?.["options"] ?? []),
    ideasDigest: str(ideas?.["briefDigest"]) ?? null,
    picked: str(ideas?.["pickedId"]) ?? null,
    ...(adsEngine === undefined ? {} : { adsEngine: written<NonNullable<ResearchRec["adsEngine"]>>(adsEngine) }),
  };
}

function researchRecords(r: ResearchRec): Record<string, Obj> {
  const b = r.base;
  return {
    research: { topic: r.topic, researched: r.confirmed !== null || r.spine !== null || r.picked !== null },
    "research-notebook": {
      topic: r.topic,
      notebook: b?.notebook ?? null,
      engine: r.engine ?? null,
      followUps: r.followUps,
      revisions: r.revisions,
      ...(b === null ? {} : { source: { kind: b.kind, conclusions: b.conclusions, dimensions: b.dimensions, tags: b.tags, digest: b.digest } }),
    },
    "research-scope": { scope: r.scope, confirmed: r.confirmed, ...(r.scopeDigest === undefined ? {} : { digest: r.scopeDigest }) },
    "research-beats": { mode: r.choice === "notebook" ? "facts" : "beats", picks: r.picks, confirmed: r.spine, slots: r.slots },
    "ads-brief": { brief: r.brief },
    "ads-ideas": { briefDigest: r.ideasDigest, options: r.ideas, pickedId: r.picked, engine: r.adsEngine ?? null },
  };
}

export function scriptOf(recs: Recs): ScriptRec {
  const sv = recs.get("script-versions");
  const st = recs.get("script-trailer");
  const as = recs.get("ads-scenarios");
  const engine = obj(sv?.["engine"]);
  const adsEngine = obj(as?.["engine"]);
  const staged = obj(sv?.["staged"]);
  const cut: CutLog | null =
    st === undefined ? null : obj(st["origin"]) !== undefined ? written<CutLog>({ origin: st["origin"], originBudget: st["originBudget"], ops: st["ops"] ?? [], head: st["head"] ?? 0 }) : newLog(written<TrailerCut>(st["cut"]), written<WithholdingBudget>(st["budget"]));
  return {
    candidates: written<readonly ScriptRender[]>(sv?.["candidates"] ?? []),
    adopted: str(recs.get("script-adopted")?.["renderId"]) || null,
    ...(engine === undefined ? {} : { engine: written<NonNullable<ScriptRec["engine"]>>(engine) }),
    notes: written<readonly Note[]>(sv?.["notes"] ?? []),
    // v1 never stored the baseline (ScriptVersionsData.accepted); it is dealt first on read.
    accepted: [BASELINE, ...written<readonly Version[]>(sv?.["accepted"] ?? []).filter((v) => v.id !== BASELINE.id)],
    staged: staged === undefined ? null : written<Version>(staged),
    cut,
    spineKey: str(st?.["spineKey"]) ?? null,
    scenarios: written<readonly AdScenario[]>(as?.["options"] ?? []),
    scenariosIdea: str(as?.["ideaId"]) ?? null,
    picked: str(as?.["pickedId"]) ?? null,
    ...(adsEngine === undefined ? {} : { adsEngine: written<NonNullable<ScriptRec["adsEngine"]>>(adsEngine) }),
  };
}

function scriptRecords(s: ScriptRec): Record<string, Obj> {
  const out: Record<string, Obj> = {
    "script-adopted": { renderId: s.adopted ?? "" },
    "script-versions": { notes: s.notes, accepted: s.accepted.filter((v) => v.id !== BASELINE.id), ...(s.staged === null ? {} : { staged: s.staged }), candidates: s.candidates, engine: s.engine ?? null },
    "ads-scenarios": { ideaId: s.scenariosIdea, options: s.scenarios, pickedId: s.picked, engine: s.adsEngine ?? null },
  };
  if (s.cut !== null) {
    const d = derive(s.cut);
    out["script-trailer"] = { cut: d.cut, budget: d.budget, origin: s.cut.origin, originBudget: s.cut.originBudget, ops: s.cut.ops, head: s.cut.head, ...(s.spineKey === null ? {} : { spineKey: s.spineKey }) };
  }
  return out;
}

/** Only the records whose mapped value moved: an op touches what it touches, nothing it did not.
 *  (A false "moved" costs nothing - the kernel drops a write whose digest did not change.) */
function changed(before: Record<string, Obj>, after: Record<string, Obj>): Record<string, Obj> {
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => before[k] === undefined || JSON.stringify(before[k]) !== JSON.stringify(v)));
}

/* ── the context and the view ─────────────────────────────────────────────── */

type Scene = { readonly read: ProjectRead; readonly ctx: Ctx; readonly part: WorkPlanPart; readonly kind: EditorKind; readonly snap: PartSnapshot };

function sceneOf(r: Reader, projectId: string, key: string, now: number): Result<Scene> {
  const read = projectRead(r, projectId, now);
  const part = read.plan.parts.find((p) => keyOf(projectId, p.id) === key);
  if (part === undefined || !isEditorKind(part.kind) || !("options" in part)) return err("not-found", `no editor for ${key} in ${read.plan.project.title}`);
  const kind = part.kind;
  const snap = readPartIn(r, { projectId, partId: part.id });
  const p = read.plan.project;
  const project: PartProject = { id: p.id, title: p.title, recipe: p.recipe, recipeLabel: p.recipeLabel, discipline: read.discipline, targetS: read.targetS };
  const ctx: Ctx = { project, plan: read.plan, now, research: () => researchOf(project, snap.records) };
  return ok({ read, ctx, part, kind, snap });
}

const verdictOf = (s: Scene, kind: EditorKind) => (kind === "research" ? RESEARCH.verdict(s.ctx, s.ctx.research()) : SCRIPT.verdict(s.ctx, scriptOf(s.snap.records)));
const refOf = (projectId: string, p: { id: string; kind: PartRef["kind"]; label: string }): PartRef => ({ partId: p.id, key: keyOf(projectId, p.id), kind: p.kind, label: p.label });

function viewOf(r: Reader, s: Scene): PartView {
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
    running: [],
  };
  if (s.kind === "research") {
    const rec = s.ctx.research();
    return { ...base, kind: "research", verdict: RESEARCH.verdict(s.ctx, rec), acts: RESEARCH.acts(s.ctx, rec), data: RESEARCH.data(s.ctx, rec) };
  }
  const rec = scriptOf(s.snap.records);
  return { ...base, kind: "script", verdict: SCRIPT.verdict(s.ctx, rec), acts: SCRIPT.acts(s.ctx, rec), data: SCRIPT.data(s.ctx, rec) };
}

/* ── the port ─────────────────────────────────────────────────────────────── */

const OPERATOR: Actor = { kind: "operator", id: "operator" };

/** The next records an op or a landing writes, through L38's per-kind function. */
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

const nope = (kind: string) => (): Result<never> => err("invalid", `not a ${kind} op`);

export function makeRealPart(deps: RealDeps): ServerPart {
  const withStore = <T,>(fn: (s: Store) => Result<T>): Result<T> => {
    const k = deps.store();
    return k.ok ? fn(k.value) : k;
  };
  const kick = (store: Store, projectId: string): void => {
    void openReadyGates({ ...deps.gates, store: () => ok(store) }, projectId, { by: "agent", surface: "parts", who: "part-gates" }).then((r) => {
      if (!r.ok) console.error(`[part-gates] ${projectId}: ${r.error.message}`);
    });
  };
  const read = (store: Store, projectId: string, key: string): Result<PartView> =>
    unwrap(
      store.read((r) => {
        const s = sceneOf(r, projectId, key, deps.now());
        return s.ok ? ok(viewOf(r, s.value)) : s;
      }),
    );
  const write = (projectId: string, key: string, baseRev: number, op: PartOp | null, run: (t: Reader, s: Scene) => { act: "op" | "land"; label: string; by: Actor; next: Result<Record<string, Obj>>; raw: unknown }) =>
    withStore((store) => {
      const w = store.tx((t) => {
        const s = sceneOf(t, projectId, key, deps.now());
        if (!s.ok) return s;
        const plan = run(t, s.value);
        return writePartIn(t, { projectId, partId: s.value.part.id, baseRev: op === null ? "current" : baseRev, act: plan.act, op: plan.raw, label: plan.label, by: plan.by, next: () => plan.next });
      });
      const o = unwrap(w);
      if (!o.ok) return o;
      kick(store, projectId);
      const view = read(store, projectId, key);
      if (!view.ok) return view;
      return ok({ outcome: o.value, view: view.value });
    });

  return {
    loadPart: ({ projectId, key }) => withStore((store) => read(store, projectId, key)),
    opPart: ({ projectId, key, baseRev, op }) => {
      const w = write(projectId, key, baseRev, op, (_t, s) => ({
        act: "op",
        label: opLabel(op),
        by: OPERATOR,
        raw: op,
        next: nextOf(s, {
          research: (rec) => (isResearchOp(op) ? RESEARCH.apply(s.ctx, rec, op) : nope("research")()),
          script: (rec) => (isScriptOp(op) ? SCRIPT.apply(s.ctx, rec, op) : nope("script")()),
        }),
      }));
      if (!w.ok) return w;
      return ok(w.value.outcome.kind === "conflict" ? { kind: "conflict", current: w.value.view } : { kind: "applied", view: w.value.view });
    },
    undoPart: ({ projectId, key, baseRev }) =>
      withStore((store) => {
        const at = store.read((r) => {
          const s = sceneOf(r, projectId, key, deps.now());
          return s.ok ? ok(s.value.part.id) : s;
        });
        const partId = unwrap(at);
        if (!partId.ok) return partId;
        const u = undoPart(store, { projectId, partId: partId.value, baseRev, by: OPERATOR });
        if (!u.ok) return u;
        kick(store, projectId);
        const view = read(store, projectId, key);
        if (!view.ok) return view;
        return ok(u.value.kind === "conflict" ? { kind: "conflict", current: view.value } : { kind: "applied", view: view.value });
      }),
    actReceipt: ({ projectId, key, act }) => receiptFor(deps, projectId, key, act),
    act: ({ projectId, key, act, token }) => {
      const fresh = receiptFor(deps, projectId, key, act);
      if (!fresh.ok) return fresh;
      if (fresh.value.token !== token) return ok({ kind: "stale", fresh: fresh.value });
      const jobId = `job:part:${fresh.value.subject.partId}:${act}:${fresh.value.subject.rev}`;
      const w = write(projectId, key, 0, null, (_t, s) => ({
        act: "land",
        label: act,
        by: { kind: "machine", id: jobId },
        raw: { act, token },
        next: nextOf(s, { research: (rec) => RESEARCH.land(s.ctx, rec, act, s.ctx.now), script: (rec) => SCRIPT.land(s.ctx, rec, act, s.ctx.now) }),
      }));
      return w.ok ? ok({ kind: "launched", jobId, view: w.value.view }) : w;
    },
  };
}

function unwrap<T>(r: Result<Result<T>>): Result<T> {
  return r.ok ? r.value : r;
}

const RESEARCH_OPS: ReadonlySet<string> = new Set<ResearchOp["op"]>(["descope", "restore", "like", "deepen", "confirm-scope", "queue-follow-up", "drop-follow-up", "decide-effect", "set-face", "pick-beat", "compose-spine", "set-brief", "pick-idea"]);
const isResearchOp = (op: PartOp): op is ResearchOp => RESEARCH_OPS.has(op.op);
const isScriptOp = (op: PartOp): op is ScriptOp => !RESEARCH_OPS.has(op.op);

/** The act's subject as the receipt prices it: L38's ActBasis, built from the kernel's part. */
function basisOf(r: Reader, projectId: string, key: string, act: PartActKind, now: number): Result<ActBasis> {
  const s = sceneOf(r, projectId, key, now);
  if (!s.ok) return s;
  const units = s.value.kind === "research" ? RESEARCH.units(s.value.ctx, s.value.ctx.research(), act) : SCRIPT.units(s.value.ctx, scriptOf(s.value.snap.records), act);
  if (!units.ok) return units;
  return ok({ ctx: s.value.ctx, kind: s.value.kind, part: s.value.part, rev: s.value.snap.rev, units: units.value });
}

function receiptFor(deps: RealDeps, projectId: string, key: string, act: PartActKind) {
  const k = deps.store();
  if (!k.ok) return k;
  const b = unwrap(k.value.read((r) => basisOf(r, projectId, key, act, deps.now())));
  return b.ok ? ok(receiptOf(b.value, act)) : b;
}

export const realPart: ServerPart = makeRealPart({
  store: () => {
    const k = kernel();
    return k.ok ? ok(k.value.store) : k;
  },
  now: () => Date.now(),
  gates: LIVE_GATES,
});
