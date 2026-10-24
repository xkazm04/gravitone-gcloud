import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { ResourceLane } from "@gt/domain/lane";
import { scriptFaceOf, type EngineView } from "@gt/domain/partView";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { madeFree, madePaid, type ActAsk, type ActPlan, type ActUnit } from "@gt/producers/research/partAct";
import { landPart, partSnapshot, projectOf } from "@gt/producers/research/partJob";
import { defineScript, scriptPlan, type ScriptView } from "@gt/producers/script/define";

import { recalibrate, recalibrateFromPlan } from "@/lib/script/recalibrate";
import { scenariosPrompt } from "@/lib/ads/concepts";
import { AD_END_CARD_HOLD_S, type AdIdea, type AdTemplateId } from "@/lib/ads/types";
import { parseScenarios, SCENARIOS_SCHEMA } from "@/lib/ads/validate";
import type { BeatSlot } from "@/lib/research/beats";
import { buildCards, optInIds, type Scope } from "@/lib/research/scope";
import { renderPayloadFor } from "@/lib/script/chainBase";
import { admitCompose, composePrompt, type ComposeRun } from "@/lib/script/compose";
import { draftOf } from "@/lib/script/draft";
import { RENDERS } from "@/lib/script/renders";
import { composeCut } from "@/lib/script/trailer/cut";
import { derive, newLog, rebase, type CutLog } from "@/lib/script/trailer/ops";
import type { TrailerCut, WithholdingBudget } from "@/lib/script/trailer/types";
import type { ScriptRender } from "@/lib/script/types";
import { parseDraft } from "@/lib/script/validate";
import { BASELINE, type Note, type Version } from "@/lib/script/versions";
import { GLASS_HARBOR_BUDGET, GLASS_HARBOR_CUE } from "@/lib/studio/trailerFixtures";
import type { TextProvenance, TextRequest } from "@/lib/text/types";
import { recalibrateRefusal, type RecalibrateInput } from "@/lib/turns/assemble/recalibrate";
import { RECALIBRATE_SPEC, type RecalibrateResult } from "@/lib/turns/kinds/recalibrate";

import { activeSourceOf, adTemplateOf, asData, briefOf, disciplineFor, engineView, field, meteredText, must, partFacts, priceOf, promptDoc, recOf, shortDigest, text, textFailure, written, enginesOf, type DriveHooks, type Engines, type PartFacts, preflightFrom, withRecords } from "./research.ts";

// THE SCRIPT PRODUCER, BOUND (Phase 4 wave C, L37) - packages/producers/src/script's ports over
// v1's turns: the COMPOSE turn (lib/script/compose.ts, lifted out of app/api/script/route.ts for
// this caller), the EDIT-PLAN turn (lib/turns/kinds/recalibrate.ts) and the ads SCENARIOS round
// (lib/ads/concepts.ts), each through the step's meter; and the trailer cut, composed from the
// picked spine (pure). Landing writes the part's records under their v1 keys, as the job.
//
// What changed from v1 (INVENTORY §2): compose is called at last, and it is handed the PROJECT
// CLOCK (`targetS`), so "the project asks for 31 s and every candidate is 4:10" cannot be
// written by this act. Recalibrate's note guards refuse at the plan step, before anything is
// sent; its plan guards (stray, blind, the guards in recalibrateFromPlan) at the answer.
// KEPT v1 LIMIT, said: recalibrateFromPlan and the render payload walk v1's three fixture renders
// (lib/script/chainBase.ts); a composed candidate's chain is not yet recalibrated. Lifting that
// is lib/script's change, not a producer's.

const DRY = { provider: "dry", model: "stand-in" };
/** The dry compose answer: the three renders written from THIS notebook only (L38's rule). */
const DRY_COMPOSED: Readonly<Record<string, readonly ScriptRender[]>> = { "why-bitcoin": RENDERS };

const versionsOf = (s: PartSnapshot) => recOf(s, "script-versions");
const acceptedOf = (s: PartSnapshot): Version[] => {
  const a = versionsOf(s)["accepted"];
  return Array.isArray(a) ? written<Version[]>(a) : [];
};
const baselineOf = (s: PartSnapshot): Version => acceptedOf(s).at(-1) ?? BASELINE;
const notesOf = (s: PartSnapshot): Note[] => {
  const n = versionsOf(s)["notes"];
  return Array.isArray(n) ? written<Note[]>(n) : [];
};
const scopeOf = (s: PartSnapshot): Scope => written<Scope>(field(recOf(s, "research-scope")["scope"]) ?? {});
const templateIdOf = (f: PartFacts): string => {
  const t = f.plan.project.recipe.split("/")[1];
  return t ?? "";
};

/** The body v1's Script pad sent /api/recalibrate (app/_phases/script/useVersions.ts `runInput`). */
function recalibrateBody(s: PartSnapshot): RecalibrateInput | undefined {
  const src = activeSourceOf(s);
  if (src === null) return undefined;
  return { notebook: src.notebook, renders: renderPayloadFor(baselineOf(s)), scope: scopeOf(s), conclusions: src.conclusions, notes: notesOf(s) };
}

/** The compose admission over this project's own records - or the work's sentence. */
function composeRun(s: PartSnapshot, f: PartFacts): { run: ComposeRun } | { refusal: string } {
  const src = activeSourceOf(s);
  if (src === null) return { refusal: "compose candidates needs a notebook" };
  const a = admitCompose({ notebook: src.notebook, template: templateIdOf(f), targetS: f.targetS, conclusions: src.conclusions, scope: scopeOf(s) });
  return a.kind === "run" ? { run: a.run } : { refusal: a.kind === "bad" ? a.detail : a.why };
}

export function scriptView(s: PartSnapshot, f: PartFacts): ScriptView {
  const beats = recOf(s, "research-beats");
  const face = scriptFaceOf(f.discipline, beats["mode"] === "facts" ? "notebook" : "beats") ?? "document";
  const body = recalibrateBody(s);
  const refused = body === undefined ? undefined : recalibrateRefusal(body);
  return {
    face,
    scopeConfirmed: recOf(s, "research-scope")["confirmed"] !== undefined && recOf(s, "research-scope")["confirmed"] !== null,
    spineComposed: field(beats["confirmed"]) !== undefined,
    notes: notesOf(s).length,
    staged: field(versionsOf(s)["staged"]) !== undefined,
    ideaPicked: text(recOf(s, "ads-ideas")["pickedId"]) !== undefined,
    ...(refused === null || refused === undefined ? {} : { notesRefused: refused.detail }),
  };
}

/** The receipt's units for a script act, statically - the compose admission included, so a
 *  clock no render can meet is refused on the receipt, before anything is priced to run. */
export function scriptUnits(s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act">): Result<ActPlan> {
  const v = scriptView(s, f);
  const plan = scriptPlan(v, ask.act, priceOf(f.option, { text: true }));
  if (!plan.ok || plan.value.act !== "compose-candidates" || v.face !== "document") return plan;
  const c = composeRun(s, f);
  return "refusal" in c ? err("refused", c.refusal) : plan;
}

/* ── units ────────────────────────────────────────────────────────────────── */

async function composeUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, engine: Engines): Promise<StepOutcome> {
  const c = composeRun(s, f);
  if ("refusal" in c) return { kind: "fatal", code: "refused", message: c.refusal };
  const { prompt, turnBand } = await composePrompt(c.run);
  const req: TextRequest = { prompt, turn: "compose", schema: c.run.schema };
  const answer = await meteredText<{ text: string; provenance?: TextProvenance } | null>(ctx, unit, req, () => null, async () => {
    const served = await engine.reason(req);
    return { value: { text: served.text, provenance: served.provenance }, provenance: served.provenance };
  });
  if (answer === null) {
    const stand = DRY_COMPOSED[projectOf(ctx.job)] ?? [];
    return madeFree(asData({ candidates: stand, engine: engineView(ctx.job, undefined, DRY) }));
  }
  const { run } = c;
  // The door holds the answer to the notebook it was composed from - scope, connectors, THE CLOCK.
  const outcome = parseDraft(answer.text, { source: run.source, scope: run.scope, template: run.template, targetS: run.targetS, ...(run.engines === undefined ? {} : { engines: run.engines }), turnBand });
  if (outcome.kind === "refused") return { kind: "fatal", code: "refused", message: outcome.why };
  const draft = draftOf(outcome.renders, { projectId: projectOf(ctx.job), source: run.source });
  return madePaid(asData({ candidates: draft.renders, engine: engineView(ctx.job, answer.provenance, DRY) }), ctx);
}

async function editPlanUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, engine: Engines): Promise<StepOutcome> {
  const body = recalibrateBody(s);
  if (body === undefined) return { kind: "fatal", code: "refused", message: "recalibrate needs a notebook" };
  const prep = await RECALIBRATE_SPEC.prepare(body);
  const req: TextRequest = { prompt: prep.prompt, turn: "edit-plan", ...(prep.schema === undefined ? {} : { schema: prep.schema }) };
  const answer = await meteredText<{ result: RecalibrateResult } | null>(ctx, unit, req, () => null, async () => {
    const served = await engine.reason(req);
    // The plan guards (stray renders, blind conclusions) run in the kind's door: a refusal throws its sentence.
    return { value: { result: await RECALIBRATE_SPEC.settle(served, prep.input) }, provenance: served.provenance };
  });
  // Dry: the plan is v1's own simulated transform (padState's fallback), marked so on landing.
  return (answer === null ? madeFree : (o: EventData) => madePaid(o, ctx))(asData({ plan: answer?.result.plan ?? null, engine: answer?.result.engine ?? null }));
}

/** The scenarios round's dry stand-in answer, validated by the same door (L38's fixtureAds shape). */
function scenariosStandIn(idea: AdIdea, template: AdTemplateId, cta: string): unknown {
  const body = (template === "ad-social-15" ? 15 : 30) - AD_END_CARD_HOLD_S;
  const r = (x: number): number => Math.round(x * 10) / 10;
  const shot = (parts: string[], link: string | null, durationS: number, sup: string | null) => ({ parts, link, brandCue: link === null, durationS, image: `${idea.hook}, the product in frame`, motion: "slow push in; the subject glances up steadily; glossy studio product film", super: sup });
  const take = (title: string, logline: string, a: number, b: number) => ({
    title,
    logline,
    medium: "glossy studio product film",
    shots: [shot(["hook"], null, r(body * a), null), shot(["truth"], "but", r(body * b), null), shot(["payoff"], "therefore", r(body - r(body * a) - r(body * b)), "Every time.")],
    musicMood: "a dry snare bed that resolves on the card",
    endCard: { cta, line: idea.title.slice(0, 60) },
  });
  return { scenarios: [take(idea.title, idea.hook, 0.2, 0.42), take(`${idea.title} — the long look`, "One held shot of the problem losing.", 0.3, 0.4), take(`${idea.title} — the quick cut`, "Three beats; the problem gives up by the second.", 0.25, 0.35)] };
}

async function scenariosUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, engine: Engines): Promise<StepOutcome> {
  const brief = briefOf(s);
  const ideas = recOf(s, "ads-ideas");
  const picked = text(ideas["pickedId"]);
  const idea = (Array.isArray(ideas["options"]) ? written<AdIdea[]>(ideas["options"]) : []).find((i) => i.id === picked);
  if (brief === undefined || idea === undefined) return { kind: "fatal", code: "refused", message: "generate scenarios needs a picked idea" };
  const template = adTemplateOf(f.plan.project.recipe);
  const request = { brief, template, targetS: template === "ad-spot-30" ? 30 : 15, idea };
  const doc = await promptDoc("ADS-SCENARIOS-PROMPT.md");
  const req: TextRequest = { prompt: scenariosPrompt(doc, request), turn: "ad-scenarios", schema: SCENARIOS_SCHEMA };
  const answer = await meteredText<{ raw: unknown; provenance?: TextProvenance }>(ctx, unit, req, () => ({ raw: scenariosStandIn(idea, template, brief.cta) }), async () => {
    const served = await engine.reason(req);
    return { value: { raw: served.json ?? served.text, provenance: served.provenance }, provenance: served.provenance };
  });
  const options = parseScenarios(answer.raw, request);
  const receipt: EngineView = engineView(ctx.job, answer.provenance, DRY);
  return (answer.provenance === undefined ? madeFree : (o: EventData) => madePaid(o, ctx))(asData({ ideaId: idea.id, options, engine: receipt }));
}

/* ── landing ──────────────────────────────────────────────────────────────── */

function cutLogOf(s: PartSnapshot): CutLog | null {
  const st = s.records.get("script-trailer");
  if (st === undefined) return null;
  if (field(st["origin"]) !== undefined) return written<CutLog>({ origin: st["origin"], originBudget: st["originBudget"], ops: st["ops"] ?? [], head: st["head"] ?? 0 });
  return newLog(written<TrailerCut>(st["cut"]), written<WithholdingBudget>(st["budget"]));
}

function landScript(job: { readonly id: string }, plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot, f: PartFacts, at: number): Result<Record<string, unknown>> {
  const sv = versionsOf(s);
  if (plan.act === "generate-scenarios") {
    const m = made.get("scenarios");
    if (m === undefined) return err("internal", "scenarios: no answer booked");
    return ok({ "ads-scenarios": { ideaId: m["ideaId"], options: m["options"], pickedId: null, engine: m["engine"] } });
  }
  if (plan.act === "recalibrate") {
    const m = made.get("edit-plan");
    const src = activeSourceOf(s);
    if (m === undefined || src === null) return err("internal", "recalibrate: no answer booked");
    const n = acceptedOf(s).length + 2;
    const ctxScope = { cards: buildCards(src), scope: scopeOf(s), optIn: optInIds(src) };
    const planned = field(m["plan"]);
    const v = planned === undefined ? recalibrate(baselineOf(s), notesOf(s), `v${n}`, at, ctxScope) : recalibrateFromPlan(baselineOf(s), notesOf(s), written<RecalibrateResult["plan"]>(planned), `v${n}`, at, ctxScope);
    return ok({ "script-versions": { ...sv, staged: asData({ ...v, label: `Version ${n}`, ...(field(m["engine"]) === undefined ? {} : { engineRun: m["engine"] }) }) } });
  }
  const cut = made.get("cut");
  if (cut !== undefined) {
    const beats = recOf(s, "research-beats");
    const spine = field(beats["confirmed"]);
    const slots = beats["slots"];
    if (spine === undefined || !Array.isArray(slots)) return err("refused", "compose cut needs a composed spine");
    const composed = composeCut({ projectId: f.plan.project.id, title: f.plan.project.title, picks: written<Record<string, string>>(spine), slots: written<BeatSlot[]>(slots), cue: GLASS_HARBOR_CUE });
    const prior = cutLogOf(s);
    const log = prior === null ? newLog(composed, GLASS_HARBOR_BUDGET) : rebase(prior, composed).log;
    const d = derive(log);
    return ok({ "script-trailer": asData({ cut: d.cut, budget: d.budget, origin: log.origin, originBudget: log.originBudget, ops: log.ops, head: log.head, spineKey: shortDigest(spine) }) });
  }
  const m = made.get("compose");
  if (m === undefined) return err("internal", `${job.id}: no answer booked`);
  const candidates = Array.isArray(m["candidates"]) ? written<ScriptRender[]>(m["candidates"]) : [];
  const adopted = text(recOf(s, "script-adopted")["renderId"]) ?? "";
  return ok({
    "script-versions": { ...sv, candidates, engine: m["engine"] },
    ...(adopted !== "" && !candidates.some((c) => c.id === adopted) ? { "script-adopted": { renderId: "" } } : {}),
  });
}

export function scriptProducer(lane: ResourceLane = "seat.text", hooks: DriveHooks = {}): Producer {
  const engine = enginesOf(hooks);
  return defineScript(lane, {
    // Held at the release, not failed by the worker, while its act waits on a human act (L45).
    preflight: preflightFrom(withRecords(scriptUnits)),
    async plan(_job, ask, ctx) {
      const s = partSnapshot(ctx);
      if (!s.ok) return s;
      const f = partFacts(ctx);
      if (!f.ok) return f;
      return scriptUnits(s.value, f.value, ask);
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        if (unit.name === "cut") return madeFree({ composed: true });
        const s = must(partSnapshot(ctx));
        if (unit.name === "compose") return await composeUnit(ctx, unit, s, must(partFacts(ctx)), engine);
        if (unit.name === "edit-plan") return await editPlanUnit(ctx, unit, s, engine);
        if (unit.name === "scenarios") return await scenariosUnit(ctx, unit, s, must(partFacts(ctx)), engine);
        return { kind: "fatal", code: "invalid", message: `script: no unit ${unit.name}` };
      } catch (e) {
        return textFailure(e);
      }
    },
    async land(job, plan, made, ctx) {
      const f = partFacts(ctx);
      if (!f.ok) return f;
      return landPart(ctx, plan.act, (s) => landScript(job, plan, made, s, f.value, Date.now()));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}

export { disciplineFor };
