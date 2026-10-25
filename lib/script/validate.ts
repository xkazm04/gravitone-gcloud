// COMPOSE — what /api/script's engine returns, and the laws it is held to.
//
// Until this file nothing in the app WROTE a script. The three renders Step 2
// shows were transcribed from a 2026-08-11 terminal run (script/renders.ts),
// and the only verbs a model had were edits over them (script/editPlan.ts).
// A composed render is the first script the app receives from an engine, so
// everything a hand transcription was trusted to get right is checked here:
//
//   · ATTRIBUTION — every card a beat rests on is a card the creator kept, in
//     the notebook that was sent. A descoped card, a conclusion nobody took,
//     or an id no card carries is refused, naming render, beat mark and card.
//   · THE ONE LAW — BUT / THEREFORE between every adjacent pair, never AND
//     THEN. Not restated here: `checkConnectors` in script/gate.ts is the law,
//     and the gate runs the same function on the way out.
//   · THE PROJECT'S CLOCK — each render's runtime inside the template band for
//     the project's `targetS` (`templateBand`). A render cut for somebody
//     else's clock is how the fixture renders came to carry a "runtime
//     mismatch" line on every project.
//   · THE ENGINE — every render's engine is one the notebook's own `engineFit`
//     rates "good" or better. When none qualifies, the valid answer is the
//     refusal `{refused:"no-engine-fits"}` (ENGINES.md § Arbitration: "Zero
//     engines fit is a blocker … not a video yet").
//
// REJECTS RATHER THAN REPAIRS, like parseEditPlan: a violation anywhere
// refuses the whole answer (`DraftError` carrying every finding). An answer
// built around one descoped card is not salvage, and three candidates of
// which one was quietly dropped read as a complete answer.
//
// What it does NOT do: judge the prose. The constraint probes, qualifier
// survival and traceability are the gate's (script/gate.ts), and the route
// runs it on every candidate that clears this file.
//
// Server-safe by construction: nothing here, and nothing it imports, is
// `"use client"`. That is why the template ranges are restated below instead
// of read from lib/projects.ts (see COMPOSE_TEMPLATE_RANGES).

import { buildCards } from "@/lib/notebook/cards";
import type { NotebookSource } from "@/lib/notebook/source";
import type { EngineFit, Fit, Notebook } from "@/lib/notebook/types";
import { RUNTIME_TOLERANCE } from "@/lib/cut/finishLine";
import type { DraftRender } from "@/lib/script/draft";
import { checkConnectors, type Verdict } from "@/lib/script/gate";
import type { Beat, BeatKind, CheckRow, Connector, CutFact } from "@/lib/script/types";

/* ─────────────────────────────── the inputs ──────────────────────────────── */

/** The scope record the triage board writes (research/scope.ts `Scope`), read
 *  loosely: only `descoped` decides what a script may use. */
export type ScopeRecord = Readonly<Record<string, { descoped?: boolean } | undefined>>;

export interface ComposeContext {
  /** The notebook the renders were written from, with its conclusions. */
  source: NotebookSource;
  scope: ScopeRecord;
  template: string;
  targetS: number;
  /** The engines the creator asked for. Narrows the notebook's qualifying
   *  engines; never promotes one the notebook rates poor. */
  engines?: readonly string[];
  /** The template's turn band, when its params state one. */
  turnBand?: [number, number] | null;
}

/* ─────────────────────────── the project's clock ─────────────────────────── */

/** The explainer templates compose can write for, with the band the craft
 *  library measured. A RESTATEMENT of `TEMPLATES[].range` in lib/projects.ts,
 *  which is `"use client"` and cannot be imported by a route handler; the
 *  compose probe holds the two copies equal.
 *
 *  The promotional templates (teaser, trailer, cinematic) are absent on
 *  purpose: their render is a `TrailerCut` (script/trailer), a different
 *  object with a disjoint beat vocabulary. So is music-video, whose runtime is
 *  the track's. */
export const COMPOSE_TEMPLATE_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  "short-form-clip": [15, 60],
  "short-educational-video": [60, 180],
  "mid-educational-video": [180, 360],
  "free-form": [15, 600],
};

/** Measured spoken delivery tops out near 252 wpm (talk-driven, dense, numerate);
 *  the ceiling adds slack so only an arithmetic impossibility is refused. The
 *  floor is far below professional narration (~130-175) and only advises. */
const MAX_SPOKEN_WPM = 260;
const MIN_SPOKEN_WPM = 100;
/** A render may overshoot its own declared word budget by this factor. */
const RATE_BUDGET_SLACK = 1.1;

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The seconds a render may run for THIS project: `targetS` within the Cut
 *  step's runtime tolerance (cut/finishLine.ts — the same number the finish
 *  line will hold the cut to), clipped to the template's band. `null` when the
 *  template is not one compose writes, or the target is outside its band — a
 *  clock no render can honestly meet. */
export function templateBand(template: string, targetS: number): { min: number; max: number } | null {
  if (!own(COMPOSE_TEMPLATE_RANGES, template)) return null;
  const range = COMPOSE_TEMPLATE_RANGES[template]!;
  if (typeof targetS !== "number" || !Number.isFinite(targetS) || targetS < range[0] || targetS > range[1]) return null;
  const tol = Math.max(1, targetS * RUNTIME_TOLERANCE);
  return { min: Math.max(range[0], Math.ceil(targetS - tol)), max: Math.min(range[1], Math.floor(targetS + tol)) };
}

/** No render meets the project's clock. The band-aware form of ScriptStep's
 *  `runtimeMismatch` (ScriptStep.tsx, which compares fixture durations for
 *  equality) — stage 3 of script-phase-B swaps it in. */
export function runtimeMismatch(
  renders: readonly { durationS: number }[],
  template: string,
  targetS: number,
): boolean {
  const band = templateBand(template, targetS);
  if (!band) return true;
  return !renders.some((r) => r.durationS >= band.min && r.durationS <= band.max);
}

/* ─────────────────────────────── the engines ─────────────────────────────── */

const FIT_RANK: Record<Fit, number> = { excellent: 2, good: 1, poor: 0 };

/** The notebook's engines at "good" or better, best fit first, narrowed to
 *  `requested` when the creator named some. A fit word this vocabulary does
 *  not have is not "good" — it ranks as poor rather than being guessed up. */
export function qualifyingEngines(
  notebook: Pick<Notebook, "engineFit">,
  requested?: readonly string[],
): EngineFit[] {
  const ask = requested?.length ? new Set(requested) : null;
  const seen = new Set<string>();
  const rank = (e: EngineFit) => (own(FIT_RANK, String(e.fit)) ? FIT_RANK[e.fit] : 0);
  return (Array.isArray(notebook.engineFit) ? notebook.engineFit : [])
    .filter((e) => e && typeof e.engine === "string" && rank(e) >= FIT_RANK.good && (!ask || ask.has(e.engine)))
    .filter((e) => (seen.has(e.engine) ? false : (seen.add(e.engine), true)))
    .sort((a, b) => rank(b) - rank(a));
}

/* ──────────────────────────────── the scope ──────────────────────────────── */

/** Which card ids exist in this notebook, and which of them the creator kept.
 *  The rule is research/scope.ts::stateOf's (that module is `"use client"`):
 *  an explicit decision wins, else conclusions are OUT until taken and every
 *  other card is kept. */
export function cardsInScope(source: NotebookSource, scope: ScopeRecord): { known: Set<string>; kept: Set<string> } {
  const known = new Set<string>();
  const kept = new Set<string>();
  for (const c of buildCards(source)) {
    known.add(c.id);
    const s = scope[c.id];
    const descoped = s && typeof s === "object" ? s.descoped === true : c.optIn === true;
    if (!descoped) kept.add(c.id);
  }
  return { known, kept };
}

/* ─────────────────────────────── the contract ────────────────────────────── */

export const MAX_RENDERS = 3;

const BEAT_KINDS: readonly BeatKind[] = [
  "hook", "question", "answer", "promise", "movement", "turn", "candidate", "steelman", "verdict", "close",
];

/** The shape the engine must return, as JSON Schema. A function of the
 *  qualifying engines, so a schema-enforcing rung cannot name any other. Key
 *  order is part of the contract: the compose cassettes are keyed by
 *  `sha256(JSON.stringify(schema))`. */
export function composeSchema(engines: readonly string[]) {
  return {
    type: "object",
    properties: {
      renders: {
        type: "array",
        description: `Up to ${MAX_RENDERS} candidate renders, one engine each. Empty only with \`refused\`.`,
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "kebab-case, unique in this answer" },
            engine: { type: "string", enum: [...engines] },
            title: { type: "string" },
            pleasure: { type: "string", description: "the viewer's pleasure this engine sells (ENGINES.md)" },
            promiseForm: { type: "string" },
            feelsLike: { type: "string" },
            bestFor: { type: "string" },
            weakness: { type: "string" },
            wordBudget: { type: "integer", description: "the spoken words this runtime affords at the template's delivery rate" },
            beats: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  kind: { type: "string", enum: [...BEAT_KINDS] },
                  label: { type: "string" },
                  connector: {
                    type: "string",
                    enum: ["BUT", "THEREFORE"],
                    description: "the relation to the PREVIOUS beat. Omitted on the first beat only.",
                  },
                  text: { type: "string", description: "the spoken line" },
                  seconds: { type: "integer", description: "how long the beat holds" },
                  cards: {
                    type: "array",
                    items: { type: "string" },
                    description: "kept card ids this beat states. [] only for a beat that states no notebook claim.",
                  },
                  device: { type: "string" },
                },
                required: ["kind", "label", "text", "seconds", "cards"],
                additionalProperties: false,
              },
            },
            cutFacts: {
              type: "array",
              items: {
                type: "object",
                properties: { factId: { type: "string" }, why: { type: "string" } },
                required: ["factId", "why"],
                additionalProperties: false,
              },
            },
            deviations: { type: "array", items: { type: "string" } },
            selfChecks: {
              type: "array",
              items: {
                type: "object",
                properties: { label: { type: "string" }, detail: { type: "string" } },
                required: ["label", "detail"],
                additionalProperties: false,
              },
            },
          },
          required: [
            "id", "engine", "title", "pleasure", "promiseForm", "feelsLike", "bestFor", "weakness",
            "wordBudget", "beats", "cutFacts", "deviations",
          ],
          additionalProperties: false,
        },
      },
      refused: { type: "string", enum: ["no-engine-fits"], description: "set ONLY when no engine may be composed" },
      why: { type: "string", description: "with `refused`: the reason, for the creator" },
    },
    required: ["renders"],
    additionalProperties: false,
  } as const;
}

/* ─────────────────────────────── the verdict ─────────────────────────────── */

export interface DraftFinding {
  rule: "attribution" | "connector" | "engine" | "duration" | "cut" | "rate";
  renderId: string;
  verdict: Verdict;
  detail: string;
  /** The beat mark — derived, so it is where the reviewer will look. */
  at?: string;
  card?: string;
  quote?: string;
}

export type ComposeOutcome =
  | { kind: "draft"; renders: DraftRender[]; findings: DraftFinding[] }
  | { kind: "refused"; refused: "no-engine-fits"; why: string };

/** The answer is unusable. `findings` is empty for a shape failure (the engine
 *  misread the contract) and lists every violation for a law failure (the
 *  engine misread the notebook) — the first is a prompt fix, the second is a
 *  re-run, and the route says which. */
export class DraftError extends Error {
  constructor(
    message: string,
    readonly findings: DraftFinding[] = [],
  ) {
    super(message);
  }
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const str = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const ID = /^[a-z0-9][a-z0-9-]*$/;

type Loose = Record<string, unknown>;

/** Extract and validate a composed answer from the engine's raw text. */
export function parseDraft(raw: string, ctx: ComposeContext): ComposeOutcome {
  const text = raw.trim();
  // Tolerate a ```json fence; tolerate nothing else.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let j: unknown;
  try {
    j = JSON.parse((fenced ? fenced[1] : text).trim());
  } catch {
    throw new DraftError("The engine did not return JSON.");
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new DraftError("The engine returned JSON that is not an object.");
  const o = j as Loose;

  // THE REFUSAL IS AN ANSWER, not a failure: ENGINES.md's first arbitration
  // cut is a hazard the engine would not defend on air, which the notebook's
  // fit scalar cannot see. It must be the whole answer, and it must say why.
  if (o.refused !== undefined) {
    if (o.refused !== "no-engine-fits")
      throw new DraftError(`The engine refused with "${String(o.refused)}", which is not a refusal this contract has.`);
    if (Array.isArray(o.renders) && o.renders.length)
      throw new DraftError("The engine both refused and returned renders. One answer or the other.");
    if (!str(o.why)) throw new DraftError("The engine refused with no `why`, so the creator cannot act on it.");
    return { kind: "refused", refused: "no-engine-fits", why: o.why.trim() };
  }

  if (!Array.isArray(o.renders) || o.renders.length === 0)
    throw new DraftError("The engine returned no renders and no refusal.");
  if (o.renders.length > MAX_RENDERS)
    throw new DraftError(`The engine returned ${o.renders.length} renders; the contract is at most ${MAX_RENDERS}.`);

  const band = templateBand(ctx.template, ctx.targetS);
  const engines = new Map(qualifyingEngines(ctx.source.notebook, ctx.engines).map((e) => [e.engine, e]));
  const { known, kept } = cardsInScope(ctx.source, ctx.scope);
  const conclusionIds = new Set(ctx.source.conclusions.map((c) => c.id));
  const ids = new Set<string>();
  const findings: DraftFinding[] = [];

  const renders: DraftRender[] = o.renders.map((rawRender, ri) => {
    const r = (rawRender ?? {}) as Loose;
    const where = `renders[${ri}]`;

    /* ── shape: the engine misread the contract ── */
    if (!str(r.id) || !ID.test(r.id)) throw new DraftError(`${where} has no kebab-case \`id\` (${String(r.id)}).`);
    const id = r.id;
    if (ids.has(id)) throw new DraftError(`${where} reuses the id "${id}". Each candidate is its own render.`);
    ids.add(id);
    if (!str(r.engine)) throw new DraftError(`${id} names no engine.`);
    for (const k of ["title", "pleasure", "promiseForm", "feelsLike", "bestFor", "weakness"] as const)
      if (!str(r[k])) throw new DraftError(`${id} has no \`${k}\`.`);
    if (typeof r.wordBudget !== "number" || !Number.isFinite(r.wordBudget) || r.wordBudget <= 0)
      throw new DraftError(`${id} has no positive \`wordBudget\`.`);
    if (!Array.isArray(r.beats) || r.beats.length === 0) throw new DraftError(`${id} has no beats.`);

    // Marks are DERIVED from each beat's seconds, never asserted — the same
    // rule applyEdits keeps, for the same reason: a model asked to keep a
    // timeline arithmetically consistent is being asked to do a `reduce`'s job.
    let clock = 0;
    const beats: Beat[] = [];
    const attribution: Record<string, string[]> = {};
    (r.beats as unknown[]).forEach((rawBeat, bi) => {
      const b = (rawBeat ?? {}) as Loose;
      const bw = `${id} beat ${bi + 1}`;
      if (typeof b.kind !== "string" || !BEAT_KINDS.includes(b.kind as BeatKind))
        throw new DraftError(`${bw} has an unknown kind: ${String(b.kind)}.`);
      if (!str(b.label)) throw new DraftError(`${bw} has no label.`);
      if (!str(b.text)) throw new DraftError(`${bw} has no spoken text.`);
      if (typeof b.seconds !== "number" || !Number.isFinite(b.seconds) || b.seconds <= 0)
        throw new DraftError(`${bw} holds for no positive number of seconds.`);
      // The one rule worth failing the shape over, as in parseEditPlan: a beat
      // that speaks declares what it rests on, because every number in the
      // matrix is derived from that declaration.
      if (!Array.isArray(b.cards) || !b.cards.every((c) => typeof c === "string"))
        throw new DraftError(`${bw} has no \`cards\` list — a beat must declare the notebook ids it rests on.`);
      if (b.connector !== undefined && b.connector !== null && typeof b.connector !== "string")
        throw new DraftError(`${bw} has a connector that is not a word.`);

      const at = mmss(clock);
      clock += Math.max(1, Math.round(b.seconds));
      const beat: Beat = {
        at,
        kind: b.kind as BeatKind,
        // Carried as written — an AND THEN, or a word that is no connector at
        // all, is the connector law's to report, not this parser's to repair.
        connector: (typeof b.connector === "string" ? b.connector : null) as Connector,
        label: b.label.trim(),
        text: b.text.trim(),
      };
      if (str(b.device)) beat.device = b.device.trim();
      beats.push(beat);
      attribution[at] = [...new Set(b.cards as string[])];
    });
    const durationS = clock;

    const cutFacts: CutFact[] = Array.isArray(r.cutFacts)
      ? (r.cutFacts as Loose[]).map((c, ci) => {
          if (!str(c?.factId) || !str(c?.why)) throw new DraftError(`${id} cutFacts[${ci}] needs a factId and a why.`);
          return { factId: c.factId, why: c.why };
        })
      : [];
    const deviations = Array.isArray(r.deviations) ? (r.deviations as unknown[]).filter(str) : [];
    // A SELF-CHECK IS NOT A VERDICT (gate.ts § THE ONE HONESTY RULE). The
    // engine's own table travels so a person can read what it claims, and
    // every row arrives `unmeasured` — the gate is what measures.
    const checks: CheckRow[] = Array.isArray(r.selfChecks)
      ? (r.selfChecks as Loose[])
          .filter((c) => str(c?.label))
          .map((c) => ({ label: String(c.label), state: "unmeasured" as const, detail: str(c.detail) ? c.detail : "" }))
      : [];

    /* ── the laws: the engine misread the notebook ── */
    const fit = engines.get(r.engine);
    if (!fit)
      findings.push({
        rule: "engine", renderId: id, verdict: "violation",
        detail: `${id} is composed on "${r.engine}", which this notebook's engineFit does not rate good or better${
          ctx.engines?.length ? " among the engines asked for" : ""
        }. Qualifying: ${[...engines.keys()].join(", ") || "none"}.`,
      });

    for (const [at, cards] of Object.entries(attribution))
      for (const card of cards) {
        if (kept.has(card)) continue;
        const why = !known.has(card)
          ? "which names no card in the notebook that was sent"
          : conclusionIds.has(card)
            ? "a conclusion the creator has not taken into scope"
            : "which the creator has taken out of scope";
        findings.push({
          rule: "attribution", renderId: id, verdict: "violation", at, card,
          detail: `${id} at ${at} rests on ${card}, ${why}.`,
          quote: beats.find((b) => b.at === at)?.text.slice(0, 140),
        });
      }

    for (const c of cutFacts)
      if (!known.has(c.factId))
        findings.push({
          rule: "cut", renderId: id, verdict: "violation", card: c.factId,
          detail: `${id} declares it cut ${c.factId}, which names no card in the notebook that was sent.`,
        });

    // SHARED, not restated: the gate's own law.
    for (const f of checkConnectors({ id, beats }))
      findings.push({ rule: "connector", renderId: id, verdict: f.verdict, detail: `${id}: ${f.detail}`, at: f.at, quote: f.quote });

    if (!band)
      findings.push({
        rule: "duration", renderId: id, verdict: "violation",
        detail: `${id} runs ${mmss(durationS)}, and ${ctx.template} has no band at ${ctx.targetS}s for any render to meet.`,
      });
    else if (durationS < band.min || durationS > band.max)
      findings.push({
        rule: "duration", renderId: id, verdict: "violation",
        detail: `${id} runs ${durationS}s; this project's clock is ${ctx.targetS}s, so a render runs ${band.min}–${band.max}s.`,
      });

    const spoken = beats.reduce((n, b) => n + words(b.text), 0);

    // RATE x DURATION = WORD BUDGET (registry: creator-voice-and-tone/delivery-rate-budgeting).
    // The clock above is the sum of seconds the ENGINE declared per beat, so
    // "inside the band" is the engine agreeing with itself: 1,374 words declared
    // as 300 s (275 wpm, unspeakable) passed every law until this one. Over-length
    // is the refused direction because the cost of compressing to fit lands on
    // hedges and figures first; under-fill is advisory (the slot is not full).
    if (spoken > r.wordBudget * RATE_BUDGET_SLACK)
      findings.push({
        rule: "rate", renderId: id, verdict: "violation",
        detail: `${id} speaks ${spoken} words against its own budget of ${Math.round(r.wordBudget)}; a script over budget gets cut at render time, and the cheapest words to cut are hedges and figures. Cut it here, or lengthen the video.`,
      });
    const impliedWpm = durationS ? (spoken / durationS) * 60 : 0;
    if (impliedWpm > MAX_SPOKEN_WPM)
      findings.push({
        rule: "rate", renderId: id, verdict: "violation",
        detail: `${id} puts ${spoken} words in ${durationS}s (${Math.round(impliedWpm)} wpm); no narrator speaks faster than ~${MAX_SPOKEN_WPM}, so the declared clock is not the one that will render.`,
      });
    else if (impliedWpm < MIN_SPOKEN_WPM)
      findings.push({
        rule: "rate", renderId: id, verdict: "unmeasured",
        detail: `${id} puts ${spoken} words in ${durationS}s (${Math.round(impliedWpm)} wpm): the slot is mostly silence, so the rendered runtime will run well short of the declared one.`,
      });

    return {
      form: "explainer",
      id,
      engine: r.engine,
      engineLabel: fit?.label ?? r.engine,
      pleasure: String(r.pleasure),
      title: String(r.title),
      template: ctx.template,
      durationS,
      words: spoken,
      wordBudget: Math.round(r.wordBudget),
      wpm: durationS ? Math.round((spoken / durationS) * 60) : 0,
      turns: beats.filter((b) => b.kind === "turn").length,
      turnBand: ctx.turnBand ?? null,
      questionsAloud: beats.filter((b) => b.kind === "question").length,
      promiseForm: String(r.promiseForm),
      feelsLike: String(r.feelsLike),
      bestFor: String(r.bestFor),
      weakness: String(r.weakness),
      beats,
      checks,
      deviations,
      cutFacts,
      // Not counted on a composed render. Unmeasured, never a guess.
      causalDensityPct: null,
      attribution,
    };
  });

  const violations = findings.filter((f) => f.verdict === "violation");
  if (violations.length)
    throw new DraftError(
      `${violations.length} finding${violations.length === 1 ? "" : "s"} refuse${violations.length === 1 ? "s" : ""} this answer: ` +
        violations.map((f) => f.detail).join(" "),
      violations,
    );
  return { kind: "draft", renders, findings };
}

/* ───────────────────────────── the request body ──────────────────────────── */

/** A notebook shaped enough for the cards, the gate and the prompt to read —
 *  or null. Not lib/notebook/validate.ts, which grades a research run's
 *  quality; this is only "can the composer read it without throwing". */
export function asNotebook(x: unknown): Notebook | null {
  if (!x || typeof x !== "object") return null;
  const n = x as Loose;
  const arrays = ["facts", "mechanisms", "reversals", "unknowns", "engineFit", "counterPositions"] as const;
  if (!arrays.every((k) => Array.isArray(n[k]))) return null;
  if (!n.steelMan || typeof n.steelMan !== "object") return null;
  // EVERY FIELD THE CARDS AND THE GATE DEREFERENCE, and no more: buildCards
  // walks each card list, a reversal's evidence, a mechanism's evidence and
  // steps; the gate walks the unknowns and the felt conversions. A notebook
  // that fails one of these used to be admitted here and throw a TypeError one
  // call later - on the script producer's receipt, before any sentence existed.
  const obj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);
  const ids = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === "string");
  const opt = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || ok(v);
  const card = (v: unknown): v is Loose => obj(v) && typeof v.id === "string";
  if (!(n.facts as unknown[]).every((f) => card(f) && typeof f.claim === "string")) return null;
  if (!(n.mechanisms as unknown[]).every((m) => card(m) && opt(m.evidence, ids) && opt(m.steps, (s) => Array.isArray(s) && s.every((st) => obj(st) && opt(st.evidence, ids))))) return null;
  if (!(n.reversals as unknown[]).every((r) => card(r) && ids(r.evidence))) return null;
  if (!(n.unknowns as unknown[]).every(card)) return null;
  if (!opt(n.scaleConversions, (s) => Array.isArray(s) && s.every((c) => obj(c) && typeof c.raw === "string" && typeof c.felt === "string"))) return null;
  return x as Notebook;
}
