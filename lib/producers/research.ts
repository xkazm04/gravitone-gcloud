import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { jobIdSchema } from "@gt/domain/ids";
import type { ResourceLane } from "@gt/domain/lane";
import { researchFaceOf, type EngineView } from "@gt/domain/partView";
import { blobStore } from "@gt/kernel/blob";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import type { Ending, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { get } from "@gt/kernel/job";
import { recover, runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import type { PartSnapshot } from "@gt/kernel/parts/driver";
import { processKernel, storeLocation } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { defineResearch, researchPlan, type ResearchView } from "@gt/producers/research/define";
import { followUpJsonSchema, followUpPrompt, parseFollowUp } from "@gt/producers/research/followUp";
import { failureOf, meteredCall } from "@gt/producers/research/metered";
import { madeFree, madePaid, type ActAsk, type ActPlan, type ActUnit } from "@gt/producers/research/partAct";
import { landPart, partSnapshot, projectOf } from "@gt/producers/research/partJob";

import { resultFor, type FollowUpResult } from "@/lib/research/followup";
import { reviseNotebook, type NotebookRevision } from "@/lib/research/revisions";
import { engineOf as adEngineOf, ideasPrompt } from "@/lib/ads/concepts";
import type { AdBrief, AdTemplateId } from "@/lib/ads/types";
import { assignAngles, IDEAS_SCHEMA, parseIdeas } from "@/lib/ads/validate";
import { OUT_DIRNAME } from "@/lib/fixtures/mode";
import { fixtureSource, sourceOf, type NotebookSource } from "@/lib/notebook/source";
import type { Notebook } from "@/lib/notebook/types";
import { GLASS_HARBOR_SLOTS } from "@/lib/studio/trailerFixtures";
import { TextError } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";
import type { TextProvenance, TextRequest, TextResult } from "@/lib/text/types";
import { PromptUnavailable, topicRefusal } from "@/lib/turns/assemble/research";
import { RESEARCH_SPEC, type ResearchResult } from "@/lib/turns/kinds/research";


// THE RESEARCH PRODUCER, BOUND (Phase 4 wave C, L37) - packages/producers/src/research's ports
// over v1's engines, and, first, THE GLUE EVERY STUDIO STEP BINDING SHARES (the kernel this
// process drives, the part's plan facts, a metered text turn, a text failure's class, a drive).
// It lives here because research is the first step and a lib path is a write set.
//
// The part's records are the artefact store (STEPS-DESIGN §3): a unit's answer is booked on the
// job; `land` writes it into the records under their v1 keys, as the job, in one transaction
// fenced by the job's slot. Nothing here imports `server-only`, so the worker and a CLI bind it.

/* ── shared by every step binding ─────────────────────────────────────────── */

import { partFacts, preflightFrom, priceOf, shortDigest, withRecords, type PartFacts } from "@gt/producers/research/facts";
export { followUpPrompt, parseFollowUp } from "@gt/producers/research/followUp";
export { actReceiptIn, disciplineFor, launchPartAct, partActReceipt, partFacts, partFactsIn, preflightFrom, priceOf, shortDigest, TEXT_SEAT, withRecords } from "@gt/producers/research/facts";
export type { ActLaunched, PartActRef, PartFacts, ReceiptOptions, StepReceipt, UnitsFn } from "@gt/producers/research/facts";

export type StepKernel = { readonly store: Store; readonly fx: Effects };

/** The blob root beside a store - the one lib/parts/gates.ts reads (a plate a job lands is a
 *  candidate the gate packet points at). */
export const blobRootOf = (store: Store): string => (store.location === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(store.location), "blobs"));

export const effectsOf = (store: Store): Effects => liveEffects(store, blobStore(blobRootOf(store)));

export function stepKernel(): StepKernel {
  const k = processKernel(storeLocation(OUT_DIRNAME));
  if (!k.ok) throw k.error;
  return { store: k.value.store, fx: effectsOf(k.value.store) };
}

export function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}


/** A text engine's failure, classed for the breaker (v1 lib/text/errors.ts kinds): a vendor that
 *  may answer next time retries; a missing engine, a refusal or an answer this app cannot use is
 *  the job's sentence - "the fix is a prompt change, not a retry" (v1 recalibrate). */
export function textFailure(e: unknown): StepOutcome {
  // A door that refused the answer names every finding; the job's sentence carries them all.
  if (e instanceof Error && !(e instanceof TextError) && "findings" in e && Array.isArray(e.findings) && e.findings.length > 0)
    return { kind: "fatal", code: "invalid", message: `${e.message} ${e.findings.map(String).join("; ")}` };
  return failureOf(e, (x) => {
    if (x instanceof PromptUnavailable) return "fatal";
    if (!(x instanceof TextError)) return undefined;
    return x.kind === "rate-limited" || x.kind === "timeout" || x.kind === "failed" ? "retry" : "fatal";
  });
}

/** A text request through the meter: declared (dry = `stand`), booked with the turn's cost. */
export function meteredText<T>(ctx: StepContext, unit: ActUnit, req: TextRequest, stand: () => T, live: () => Promise<{ value: T; provenance: TextProvenance }>): Promise<T> {
  return meteredCall(ctx, {
    provider: "text-router",
    model: req.turn,
    payload: { turn: req.turn, prompt: req.prompt },
    estimate: unit.estimate,
    stand,
    live: async () => {
      const out = await live();
      const p = out.provenance;
      return { value: out.value, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for the ${req.turn} turn` } : { usd: p.costUsd }) };
    },
  });
}

/** The receipt block a landing stores (`EngineView`): the vendor's own figures, or the dry mark. */
export function engineView(job: Job, p: TextProvenance | undefined, fallback: { provider: string; model: string }): EngineView {
  if (p === undefined) return { provider: fallback.provider, model: fallback.model, usd: null, unpricedReason: "dry run", seconds: 0, mode: "dry" };
  return {
    provider: p.provider,
    model: p.model,
    usd: p.costUsd ?? null,
    ...(p.costUsd === undefined ? { unpricedReason: `${p.provider} reported no cost (${p.costBasis})` } : {}),
    seconds: Math.round(p.durationMs / 100) / 10,
    mode: job.mode.kind,
  };
}

/** Plain JSON of a typed value (a notebook, an answer) for a booking: the kernel stores JSON. */
export const asData = (x: unknown): EventData => must(parseJsonAt("booked output", z.record(z.string(), z.unknown()), JSON.stringify(x)));

/** A record this binding's own landing wrote, read back as the v1 type it was written from: the
 *  door (@gt/domain/steps) checks what readers key on and carries the rest (real.ts `written`). */
export const written = <T,>(x: unknown): T => x as T;

const obj = (x: unknown): Readonly<Record<string, unknown>> | undefined => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Readonly<Record<string, unknown>>) : undefined);
export const recOf = (s: PartSnapshot, key: string): Readonly<Record<string, unknown>> => s.records.get(key) ?? {};
export const field = obj;
export const text = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);

export type DriveHooks = {
  readonly onSettled?: (job: Job, ending: Ending) => Promise<void>;
  /** The text engine a LIVE unit calls (default: the v1 router's `reason`) - a test's fake vendor. */
  readonly reason?: (req: TextRequest) => Promise<TextResult>;
};

/** The engines a unit calls, resolved once per producer. */
export type Engines = { readonly reason: (req: TextRequest) => Promise<TextResult> };
export const enginesOf = (hooks: DriveHooks): Engines => ({ reason: hooks.reason ?? reason });
export type StepFactory = (lane: ResourceLane, hooks?: DriveHooks) => Producer;

/**
 * Drive one part job on THIS process, with the producer built for the job's own lane (a part's
 * option decides its lane; the worker's registry binds one lane per name until the kernel picks
 * producers by lane - reported). The startup sweep runs first (background-jobs: startup-sweeps).
 */
export async function driveStep(factory: StepFactory, store: Store, jobId: string, o: { readonly fx?: Effects; readonly hooks?: DriveHooks; readonly run?: Omit<RunOptions, "dryOnly">; readonly dryOnly?: boolean } = {}): Promise<Result<RunReport>> {
  const fx = o.fx ?? effectsOf(store);
  const swept = recover(fx, o.run?.holder === undefined ? {} : { holder: o.run.holder, ...(o.run.alive === undefined ? {} : { alive: o.run.alive }) });
  if (!swept.ok) return swept;
  const id = parseAt("job id", jobIdSchema, jobId);
  if (!id.ok) return id;
  const j = get(store, id.value);
  if (!j.ok) return j;
  return runJob(fx, factory(j.value.job.lane, o.hooks), jobId, { ...o.run, dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}

/* ── research ─────────────────────────────────────────────────────────────── */

/** The transcribed runs a DRY research can stand in with: only a project's OWN (L38's rule - any
 *  other topic lands no notebook, never Bitcoin's). The beat board likewise. */
const DRY_NOTEBOOKS: Readonly<Record<string, () => NotebookSource>> = { "why-bitcoin": fixtureSource };
const BEAT_BOARDS: Readonly<Record<string, unknown>> = { "glass-harbor-trailer": GLASS_HARBOR_SLOTS };

const REQUIRED_BRIEF = ["product", "proposition", "cta"] as const;

type FollowUpRec = { readonly id: string; readonly kind: string; readonly cardId?: string; readonly prompt: string; readonly status: string; readonly result?: FollowUpResult };

function baseSource(nb: Readonly<Record<string, unknown>>): NotebookSource | null {
  const notebook = obj(nb["notebook"]);
  if (notebook === undefined) return null;
  const meta = obj(nb["source"]);
  const src = sourceOf(written<Notebook>(notebook), meta === undefined ? {} : { kind: written<NotebookSource["kind"]>(meta["kind"]), conclusions: written<NotebookSource["conclusions"]>(meta["conclusions"]), dimensions: written<NotebookSource["dimensions"]>(meta["dimensions"]), tags: written<NotebookSource["tags"]>(meta["tags"]) });
  const digest = text(meta?.["digest"]);
  return digest === undefined ? src : { ...src, digest };
}

/** The notebook dealt now: the stored base with every revision laid over it (L38's activeSource). */
export function activeSourceOf(s: PartSnapshot): NotebookSource | null {
  const nb = recOf(s, "research-notebook");
  const base = baseSource(nb);
  if (base === null) return null;
  const revs = revisionsOf(nb);
  if (revs.length === 0) return base;
  return sourceOf(reviseNotebook(base.notebook, revs).notebook, { kind: base.kind, conclusions: base.conclusions, dimensions: base.dimensions, tags: base.tags });
}

const followUpsOf = (nb: Readonly<Record<string, unknown>>): FollowUpRec[] => (Array.isArray(nb["followUps"]) ? written<FollowUpRec[]>(nb["followUps"]) : []);
const revisionsOf = (nb: Readonly<Record<string, unknown>>): NotebookRevision[] => (Array.isArray(nb["revisions"]) ? written<NotebookRevision[]>(nb["revisions"]) : []);
export const adTemplateOf = (recipe: string): AdTemplateId => (recipe.endsWith("ad-spot-30") ? "ad-spot-30" : "ad-social-15");
export const briefOf = (s: PartSnapshot): AdBrief | undefined => {
  const b = obj(recOf(s, "ads-brief")["brief"]);
  return b === undefined ? undefined : written<AdBrief>(b);
};

export function researchView(s: PartSnapshot, f: PartFacts): ResearchView {
  const beats = recOf(s, "research-beats");
  const nb = recOf(s, "research-notebook");
  const face = researchFaceOf(f.discipline, beats["mode"] === "facts" ? "notebook" : "beats") ?? "notebook";
  const brief = briefOf(s);
  return {
    face,
    topic: text(recOf(s, "research")["topic"]) ?? text(nb["topic"]) ?? f.plan.project.title,
    hasNotebook: obj(nb["notebook"]) !== undefined,
    queued: followUpsOf(nb)
      .filter((q) => q.status === "queued")
      .map((q) => ({ id: q.id, prompt: q.prompt, ...(q.cardId === undefined ? {} : { cardId: q.cardId }) })),
    briefMissing: REQUIRED_BRIEF.filter((k) => String(brief?.[k] ?? "").trim() === ""),
  };
}

/** The receipt's units for a research act, statically (no step performed). */
export function researchUnits(s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act">): Result<ActPlan> {
  return researchPlan(researchView(s, f), ask.act, priceOf(f.option, { text: true }));
}

const DRY = { provider: "dry", model: "stand-in" };

async function notebookUnit(ctx: StepContext, unit: ActUnit, engine: Engines, injected: boolean): Promise<StepOutcome> {
  const topic = String(unit.input["topic"] ?? "");
  const checked = topicRefusal(topic);
  if (!checked.ok) return { kind: "fatal", code: "invalid", message: checked.refusal.detail };
  const prep = await RESEARCH_SPEC.prepare({ topic });
  const signal = new AbortController().signal;
  const run = await meteredText<{ served: TextResult; via?: unknown } | null>(ctx, unit, { prompt: prep.prompt, turn: "research", ...(prep.schema === undefined ? {} : { schema: prep.schema }) }, () => null, async () => {
    // An injected engine is asked directly; the default walks the kind's own rungs (retrieval first).
    const d = injected || RESEARCH_SPEC.dispatch === undefined ? { served: await engine.reason({ prompt: prep.prompt, turn: "research", ...(prep.schema === undefined ? {} : { schema: prep.schema }), signal }), prompt: prep.prompt } : await RESEARCH_SPEC.dispatch({ prompt: prep.prompt, ...(prep.schema === undefined ? {} : { schema: prep.schema }), input: prep.input, turn: "research", signal });
    return { value: d, provenance: d.served.provenance };
  });
  if (run === null) {
    const replay = DRY_NOTEBOOKS[projectOf(ctx.job)]?.();
    return madeFree(replay === undefined ? { notebook: null, engine: engineView(ctx.job, undefined, DRY) } : { notebook: asData(replay.notebook), kind: replay.kind, engine: engineView(ctx.job, undefined, DRY) });
  }
  let settled: ResearchResult;
  try {
    settled = await RESEARCH_SPEC.settle(run.served, prep.input, run.via);
  } catch (e) {
    // The engine answered and the answer is not a notebook: its sentence, every finding. Not retried.
    return { kind: "fatal", code: "invalid", message: errorMessage(e) };
  }
  const searched = obj(settled.engine)?.["searched"] === true;
  return madePaid({ notebook: asData(settled.notebook), kind: searched ? "researched" : "reasoned", engine: engineView(ctx.job, run.served.provenance, DRY) }, ctx);
}

/* follow-ups: a REAL turn now - its prompt and its allowlist door are
   packages/producers/src/research/followUp.ts (pure). */
const FOLLOW_UP_JSON_SCHEMA: Record<string, unknown> = followUpJsonSchema();

async function followUpUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, engine: Engines): Promise<StepOutcome> {
  const nbRec = recOf(s, "research-notebook");
  const base = baseSource(nbRec);
  if (base === null) return { kind: "fatal", code: "invalid", message: "a follow-up needs a notebook" };
  const active = reviseNotebook(base.notebook, revisionsOf(nbRec)).notebook;
  const q = { prompt: String(unit.input["prompt"] ?? ""), ...(typeof unit.input["cardId"] === "string" ? { cardId: unit.input["cardId"] } : {}) };
  const req: TextRequest = { prompt: followUpPrompt(active, q), turn: "research", schema: FOLLOW_UP_JSON_SCHEMA };
  // Dry: v1's two transcribed answers, on their own notebook only (`resultFor`); else unanswered.
  const stand = (): FollowUpResult | null => resultFor({ kind: q.cardId === undefined ? "question" : "deepen-card", prompt: q.prompt, ...(q.cardId === undefined ? {} : { cardId: q.cardId }) }, base) ?? null;
  const answer = await meteredText<FollowUpResult | null>(ctx, unit, req, stand, async () => {
    const served = await engine.reason(req);
    const parsed = parseFollowUp(served.json ?? served.text, active);
    if (!parsed.ok) throw parsed.error;
    return { value: parsed.value, provenance: served.provenance };
  });
  return (ctx.job.mode.kind === "dry" ? madeFree : (o: EventData) => madePaid(o, ctx))({ id: String(unit.input["id"]), result: answer === null ? null : asData(answer) });
}

async function ideasUnit(ctx: StepContext, unit: ActUnit, s: PartSnapshot, f: PartFacts, engine: Engines): Promise<StepOutcome> {
  const brief = briefOf(s);
  if (brief === undefined) return { kind: "fatal", code: "invalid", message: "the brief is empty" };
  const template = adTemplateOf(f.plan.project.recipe);
  const request = { brief, template, targetS: template === "ad-spot-30" ? 30 : 15 };
  const doc = await readFile(path.join(process.cwd(), "pipeline", "ADS-IDEAS-PROMPT.md"), "utf8").catch(() => {
    throw new PromptUnavailable("The prompt could not be read from pipeline/ADS-IDEAS-PROMPT.md.");
  });
  // Deterministic per job and attempt-stable: the angle draw is the job's, not Math.random's.
  const seed = parseInt(createHash("sha256").update(ctx.key).digest("hex").slice(0, 7), 16);
  const req: TextRequest = { prompt: ideasPrompt(doc, request, seed), turn: "ad-ideas", schema: IDEAS_SCHEMA };
  const answer = await meteredText<{ raw: unknown; provenance?: TextProvenance }>(ctx, unit, req, () => ({ raw: ideasStandIn(brief, template) }), async () => {
    const served = await engine.reason(req);
    return { value: { raw: served.json ?? served.text, provenance: served.provenance }, provenance: served.provenance };
  });
  // VALIDATED, NEVER TRUSTED - the stand-in answer passes the same door a live one does.
  const options = parseIdeas(answer.raw, request);
  const receipt: EngineView = answer.provenance === undefined ? engineView(ctx.job, undefined, DRY) : { ...engineView(ctx.job, answer.provenance, DRY), usd: adEngineOf(answer.provenance).costUsd };
  return (answer.provenance === undefined ? madeFree : (o: EventData) => madePaid(o, ctx))(asData({ options, briefDigest: shortDigest(brief), engine: receipt }));
}

/* The ideas round's DRY stand-in: a model ANSWER around this brief, which then passes the same
   validator a live answer does (lib/ads/validate.ts parseIdeas: the assigned angles, five reasoned
   gates, one risk each) - so a dry round obeys the round's rules or fails with its findings. The
   shape is the validator's regression's (pipeline/ads-prompts-regression.mts), as L38's fixture
   side wrote it (app/(studio)/projects/[id]/_part/fixtureAds.ts), here without its import of
   `server-only` so the worker can run it. */
export function ideasStandIn(brief: AdBrief, template: AdTemplateId): unknown {
  const { slots } = assignAngles();
  const yes = (x: string): string => `yes — ${x}`;
  return {
    proposition: brief.proposition,
    truth: `${brief.product} holds its promise where the category usually fails`,
    ask: null,
    exclusion: null,
    longlist: Array.from({ length: 14 }, (_, i) => `${brief.product.split(" ")[0] ?? "idea"} title ${i + 1}`),
    ideas: slots.map((angle, i) => ({
      slot: i + 1,
      angle,
      classifiedAs: angle,
      title: `${angle} — ${brief.product}`.slice(0, 80),
      hook: `${brief.audience || "a viewer"} meets the moment the ${angle} turns on`,
      twist: "the problem gives up before the product is named",
      whyItWorks: `the truth is shown to ${brief.audience || "the audience"}, not stated`,
      gates: { swap: yes("a rival cannot claim this picture"), singleMinded: yes(brief.proposition), oneLine: yes("one picture, one turn"), ownable: yes("nobody in the category shows it"), filmable: yes("stills and one motion each, no dialogue") },
      pictureClaim: angle === "demo" ? `the picture shows the brief's own claim: ${brief.proposition}` : null,
      needsTurn: template === "ad-spot-30" ? false : null,
      risk: `the ${angle} can upstage the product in a feed scroll`,
    })),
  };
}

function landResearch(plan: ActPlan, made: ReadonlyMap<string, EventData>, s: PartSnapshot, at: string): Result<Record<string, unknown>> {
  const nbRec = recOf(s, "research-notebook");
  const out: Record<string, unknown> = {};
  if (plan.act === "generate-ideas") {
    const m = made.get("ideas");
    if (m === undefined) return err("internal", "ideas: no answer booked");
    out["ads-ideas"] = { ...recOf(s, "ads-ideas"), // Digested when the round was ASKED, over the brief as the part read it (the key order the
    // record's door gives it - the verdict digests the same read), so a brief edited while the
    // round ran reads "brief changed since these ideas", never a false fresh.
    briefDigest: m["briefDigest"], options: m["options"], pickedId: null, engine: m["engine"] };
    return ok(out);
  }
  if (plan.act === "run-research") {
    const deal = made.get("deal");
    if (deal !== undefined) {
      const beats = recOf(s, "research-beats");
      out["research-beats"] = { mode: beats["mode"] ?? "beats", picks: beats["picks"] ?? {}, confirmed: beats["confirmed"] ?? null, slots: deal["slots"] ?? null };
      return ok(out);
    }
    const m = made.get("notebook");
    if (m === undefined) return err("internal", "run-research: no answer booked");
    const notebook = obj(m["notebook"]);
    if (notebook === undefined) return ok(out);
    const src = sourceOf(written<Notebook>(notebook), { kind: written<NotebookSource["kind"]>(text(m["kind"]) ?? "reasoned") });
    const topic = text(recOf(s, "research")["topic"]) ?? notebook["topic"];
    out["research-notebook"] = { ...nbRec, topic, notebook, engine: m["engine"], followUps: [], revisions: [], source: asData({ kind: src.kind, conclusions: src.conclusions, dimensions: src.dimensions, tags: src.tags, digest: src.digest }) };
    out["research"] = { topic, researched: recOf(s, "research")["researched"] === true };
    return ok(out);
  }
  // follow-up: each answered question becomes a revision whose effects wait for a decision.
  const revisions = [...revisionsOf(nbRec)];
  const followUps = followUpsOf(nbRec).map((q): FollowUpRec => {
    const m = made.get(`fu:${q.id}`);
    if (m === undefined || q.status !== "queued") return q;
    const r = obj(m["result"]);
    const result = r === undefined ? undefined : written<FollowUpResult>(r);
    if (result === undefined) return { ...q, status: "unanswered" };
    revisions.push({ id: `rev-${q.id}`, requestId: q.id, effects: result.effects, decided: {}, at });
    return { ...q, status: "returned", result };
  });
  out["research-notebook"] = { ...nbRec, followUps, revisions };
  return ok(out);
}

export function researchProducer(lane: ResourceLane = "seat.text", hooks: DriveHooks = {}): Producer {
  const engine = enginesOf(hooks);
  return defineResearch(lane, {
    // Held at the release, not failed by the worker, while its act waits on a human act (L45).
    preflight: preflightFrom(withRecords(researchUnits)),
    async plan(_job, ask, ctx) {
      const s = partSnapshot(ctx);
      if (!s.ok) return s;
      const f = partFacts(ctx);
      if (!f.ok) return f;
      return researchUnits(s.value, f.value, ask);
    },
    async perform(_job, _plan, unit, ctx) {
      try {
        if (unit.name === "deal") return madeFree(asData({ slots: BEAT_BOARDS[projectOf(ctx.job)] ?? null }));
        if (unit.name === "notebook") return await notebookUnit(ctx, unit, engine, hooks.reason !== undefined);
        const s = must(partSnapshot(ctx));
        if (unit.name === "ideas") return await ideasUnit(ctx, unit, s, must(partFacts(ctx)), engine);
        if (unit.name.startsWith("fu:")) return await followUpUnit(ctx, unit, s, engine);
        return { kind: "fatal", code: "invalid", message: `research: no unit ${unit.name}` };
      } catch (e) {
        return textFailure(e);
      }
    },
    async land(_job, plan, made, ctx) {
      return landPart(ctx, plan.act, (s) => landResearch(plan, made, s, new Date().toISOString()));
    },
    ...(hooks.onSettled === undefined ? {} : { settled: hooks.onSettled }),
  });
}
