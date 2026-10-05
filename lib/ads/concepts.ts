// THE ADS CONCEPT ROUNDS — prompt assembly and the two route bodies behind
// POST /api/ads/ideas and POST /api/ads/scenarios.
//
// SERVER-ONLY: it reaches lib/text/router.ts (a subprocess or a metered cloud
// endpoint) and reads pipeline/*.md off disk. Never import it from a component.
//
// WHY THE HANDLERS LIVE HERE AND NOT IN THE ROUTE FILES. A route module may
// only export its HTTP verbs and config, and a probe needs to drive the whole
// request → prompt → reason → validate → response path with a FAKE engine. So
// each route is its auth door (`guardRequest`, in the route's own file where
// tests/golden-path/imaging-auth.probe.spec.ts can see it) and one call into
// here, and `reason` is injectable exactly as lib/sound/hunt.ts makes it
// (`ReasonFn`). Nothing here re-checks auth: it is reached only through a route
// that already did.
//
// THE PROMPT IS READ PER CALL, the file is the instruction and THE RUN is the
// payload: pipeline/ADS-IDEAS-PROMPT.md / ADS-SCENARIOS-PROMPT.md, then the
// brief verbatim, the format (lib/formatBrief.ts — the same compiler the Frames
// pass reads), the round's assignments, and the schema. A missing prompt file
// is `PromptUnavailable` and a 500 that says which file, before any engine is
// started (/api/research's pattern).

import { readFile } from "node:fs/promises";
import path from "node:path";

import { compileFormatBrief } from "@/lib/formatBrief";
import { TextError, statusFor } from "@/lib/text/errors";
import { engineStatus, reason as routerReason } from "@/lib/text/router";
import type { TextProvenance, TextRequest, TextResult } from "@/lib/text/types";

import {
  AD_ANGLES,
  AD_END_CARD_HOLD_S,
  AD_NATIVE_ASPECT,
  AD_RUNTIME_RANGE,
  isAdTemplate,
  type AdAngle,
  type AdBrief,
  type AdEngine,
  type AdErrorBody,
  type AdIdea,
  type AdIdeasRequest,
  type AdIdeasResponse,
  type AdScenariosRequest,
  type AdScenariosResponse,
  type AdTemplateId,
} from "./types";
import {
  AdBriefQuestion,
  AdConceptError,
  BRIEF_CAPS,
  IDEAS_SCHEMA,
  SCENARIOS_SCHEMA,
  assignAngles,
  parseIdeas,
  parseScenarios,
} from "./validate";

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

/** What a probe swaps out. Production passes nothing. */
export interface ConceptDeps {
  reason?: ReasonFn;
  /** Reads a prompt document by file name. Default: pipeline/<name> on disk. */
  readPrompt?: (name: string) => Promise<string>;
  /** Id minting for the validator — deterministic in a probe. */
  mint?: () => string;
  /** The seed-shuffle's starting point. Default: random, so a regenerated set
   *  starts from different personas ("generate the next one from different
   *  angles and seeds", divergence-before-selection). */
  seed?: number;
}

/* ── input caps ───────────────────────────────────────────────────────────── */

/** The idea a scenarios request carries back: the client sends the picked idea
 *  as it received it, so these are generous over what the validator lets out. */
const IDEA_FIELD_CAP = 800;

class BadRequest extends Error {}
class PromptUnavailable extends Error {}

function readBrief(x: unknown): AdBrief {
  if (typeof x !== "object" || x === null || Array.isArray(x)) throw new BadRequest("`brief` must be an AdBrief object.");
  const b = x as Record<string, unknown>;
  const field = (k: keyof typeof BRIEF_CAPS & keyof AdBrief): string => {
    const v = b[k];
    if (v !== undefined && typeof v !== "string") throw new BadRequest(`brief.${k} must be text.`);
    const t = (v ?? "").trim();
    const cap = BRIEF_CAPS[k];
    if (t.length > cap) throw new BadRequest(`brief.${k} is ${t.length} characters; it takes ${cap}. Nothing was dispatched.`);
    return t;
  };
  const brief: AdBrief = {
    product: field("product"),
    audience: field("audience"),
    proposition: field("proposition"),
    tone: field("tone"),
    mustInclude: [],
    cta: field("cta"),
    platform: field("platform"),
  };
  const mi = b.mustInclude ?? [];
  if (!Array.isArray(mi) || mi.some((s) => typeof s !== "string")) throw new BadRequest("brief.mustInclude must be a list of text.");
  brief.mustInclude = (mi as string[]).map((s) => s.trim()).filter(Boolean);
  if (brief.mustInclude.length > BRIEF_CAPS.mustIncludeItems)
    throw new BadRequest(`brief.mustInclude has ${brief.mustInclude.length} items; it takes ${BRIEF_CAPS.mustIncludeItems}.`);
  const long = brief.mustInclude.find((s) => s.length > BRIEF_CAPS.mustIncludeChars);
  if (long) throw new BadRequest(`A must-include item is ${long.length} characters; each takes ${BRIEF_CAPS.mustIncludeChars}.`);

  // The three fields the round cannot start without — the same three the
  // surface disables Generate on. Named, so the 400 says which.
  const missing = (["product", "proposition", "cta"] as const).filter((k) => !brief[k]);
  if (missing.length) throw new BadRequest(`The brief has no ${missing.join(", ")}. Nothing was dispatched.`);
  return brief;
}

function readFormat(body: Record<string, unknown>): { template: AdTemplateId; targetS: number } {
  if (!isAdTemplate(body.template)) throw new BadRequest("`template` must be ad-social-15 or ad-spot-30.");
  const [min, max] = AD_RUNTIME_RANGE[body.template];
  const t = body.targetS;
  if (typeof t !== "number" || !Number.isFinite(t) || t < min || t > max)
    throw new BadRequest(`\`targetS\` must be a number of seconds within ${min}–${max} for ${body.template}.`);
  return { template: body.template, targetS: t };
}

function readIdea(x: unknown): AdIdea {
  if (typeof x !== "object" || x === null || Array.isArray(x)) throw new BadRequest("`idea` must be the picked AdIdea.");
  const o = x as Record<string, unknown>;
  const str = (k: string, required = true): string => {
    const v = o[k];
    if (v === undefined || v === null) {
      if (required) throw new BadRequest(`idea.${k} is missing.`);
      return "";
    }
    if (typeof v !== "string") throw new BadRequest(`idea.${k} must be text.`);
    if (v.length > IDEA_FIELD_CAP) throw new BadRequest(`idea.${k} is ${v.length} characters; it takes ${IDEA_FIELD_CAP}.`);
    return v.trim();
  };
  const angle = str("angle") as AdAngle;
  if (!(AD_ANGLES as readonly string[]).includes(angle)) throw new BadRequest(`idea.angle "${angle}" is not an angle.`);
  const id = str("id");
  if (!id) throw new BadRequest("idea.id is empty.");
  const pictureClaim = str("pictureClaim", false);
  return {
    id,
    angle,
    title: str("title"),
    hook: str("hook"),
    twist: str("twist"),
    whyItWorks: str("whyItWorks"),
    risk: str("risk"),
    truth: str("truth", false) || undefined,
    pictureClaim: pictureClaim || null,
  };
}

/* ── the seeds ────────────────────────────────────────────────────────────── */

// ORDINARY PEOPLE, not famous ones: "famous-genius personas did worse than
// ordinary ones" (divergence-before-selection). Each slot's long list starts
// from one of these people's view of the product.
export const PERSONAS = [
  "a night-shift nurse",
  "a retired plumber",
  "a fourteen-year-old",
  "a wedding caterer",
  "a long-haul truck driver",
  "a primary-school teacher",
  "a bike courier in the rain",
  "a new father on his first week alone with the baby",
  "a hotel housekeeper",
  "a fishmonger at a Saturday market",
  "a call-centre agent on a late shift",
  "a grandmother who swims every morning",
  "a stagehand during a show",
  "a dog walker with seven dogs",
  "a student working nights at a petrol station",
  "a farmer at harvest",
] as const;

// FORCED CONNECTIONS — "connecting unrelated concepts raised originality"
// (divergence-before-selection). Given to every other slot, so half the set
// starts from a person and half from a person plus a constraint.
export const FORCED_CONNECTIONS = [
  "the product is never seen directly until the end",
  "the idea runs through a kitchen timer",
  "the idea runs through a lost-property office",
  "the idea runs through a weather forecast",
  "the idea happens entirely in a lift",
  "the idea runs through a queue",
  "the idea runs through a photograph from years ago",
  "the idea runs through a houseplant",
  "the idea runs through a parking ticket",
  "the idea runs through an alarm clock",
] as const;

/** A small deterministic generator so a probe can pin the seeds and production
 *  can vary them per call. mulberry32. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(list: readonly T[], n: number, next: () => number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(next() * pool.length), 1)[0]);
  return out;
}

export interface Slot {
  n: number;
  angle: AdAngle;
  persona: string;
  connection: string | null;
}

/** Each slot: its assigned angle (lib/ads/validate.ts::assignAngles — the
 *  validator re-derives the same list), an ordinary person, and on every other
 *  slot a forced connection. */
export function slotsFor(seed: number): { slots: Slot[]; reserve: AdAngle } {
  const { slots, reserve } = assignAngles();
  const next = rng(seed);
  const personas = pick(PERSONAS, slots.length, next);
  const connections = pick(FORCED_CONNECTIONS, Math.ceil(slots.length / 2), next);
  return {
    reserve,
    slots: slots.map((angle, i) => ({
      n: i + 1,
      angle,
      persona: personas[i],
      connection: i % 2 === 1 ? (connections[(i - 1) / 2] ?? null) : null,
    })),
  };
}

/* ── prompt assembly (pure) ───────────────────────────────────────────────── */

const or = (s: string) => (s ? s : "(not stated)");

/** The brief as fixed fields — verbatim, never paraphrased. */
export function briefBlock(b: AdBrief): string {
  return [
    "## THE BRIEF — fixed fields, verbatim from the creator",
    "",
    `- product: ${b.product}`,
    `- audience: ${or(b.audience)}`,
    `- proposition: ${b.proposition}`,
    `- tone: ${or(b.tone)}`,
    `- must include: ${b.mustInclude.length ? b.mustInclude.join("; ") : "(nothing listed)"}`,
    `- call to action: ${b.cta}`,
    `- platform: ${or(b.platform)}`,
  ].join("\n");
}

function deliverable(schema: Record<string, unknown>): string {
  return [
    "## THE DELIVERABLE",
    "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
    "It must satisfy this schema; `nullable` fields take JSON null when the rule above says null.",
    "",
    JSON.stringify(schema, null, 2),
  ].join("\n");
}

export function ideasPrompt(doc: string, req: AdIdeasRequest, seed: number): string {
  const { slots, reserve } = slotsFor(seed);
  return [
    doc.trim(),
    "",
    "---",
    "",
    "# THE RUN",
    "",
    briefBlock(req.brief),
    "",
    compileFormatBrief(req.template, req.targetS),
    "",
    `Native aspect: ${AD_NATIVE_ASPECT[req.template]}. ${
      req.template === "ad-spot-30"
        ? "This is the thirty-second template: answer `needsTurn` for every idea."
        : "This is the fifteen-second template: `needsTurn` is null for every idea."
    }`,
    "",
    "## THE SLOTS — angles assigned before generation",
    "",
    ...slots.map(
      (s) =>
        `${s.n}. **${s.angle}** — start the long list as ${s.persona} would see the product` +
        (s.connection ? `; forced connection: ${s.connection}.` : "."),
    ),
    "",
    `Reserve angle: **${reserve}** — used only to fill a slot whose angle the tone excludes (\`exclusion\`).`,
    "",
    deliverable(IDEAS_SCHEMA),
  ].join("\n");
}

export function scenariosPrompt(doc: string, req: AdScenariosRequest): string {
  const [min, max] = AD_RUNTIME_RANGE[req.template];
  const i = req.idea;
  const budget = Math.round((req.targetS - AD_END_CARD_HOLD_S) * 10) / 10;
  return [
    doc.trim(),
    "",
    "---",
    "",
    "# THE RUN",
    "",
    briefBlock(req.brief),
    "",
    "## THE PICKED IDEA — fixed; execute it, do not reinterpret it",
    "",
    `- angle: ${i.angle}`,
    `- title: ${i.title}`,
    `- hook: ${i.hook}`,
    `- twist: ${i.twist}`,
    `- why it works: ${i.whyItWorks}`,
    `- product truth: ${i.truth ? i.truth : "(not recorded with this idea — use the one the idea runs through)"}`,
    ...(i.pictureClaim ? [`- what the picture claims: ${i.pictureClaim}`] : []),
    `- its risk: ${i.risk}`,
    "",
    compileFormatBrief(req.template, req.targetS),
    "",
    "## THE RUNTIME — binding in this round",
    "",
    `- Runtime: **${req.targetS}s**. Shot durations plus the end card equal it exactly.`,
    `- End card hold: **${AD_END_CARD_HOLD_S}s**, reserved first. Picture budget: **${budget}s**.`,
    `- The template's band is ${min}–${max}s; a scenario outside it is not kept.`,
    `- Native aspect: **${AD_NATIVE_ASPECT[req.template]}**.`,
    `- Rung: **${req.template === "ad-spot-30" ? "30s — hook, set-up, truth, turn, payoff, end card" : "15s — hook, truth, payoff, end card"}**.`,
    `- Call to action for \`endCard.cta\`, verbatim: ${req.brief.cta}`,
    "",
    deliverable(SCENARIOS_SCHEMA),
  ].join("\n");
}

/* ── the engine receipt ───────────────────────────────────────────────────── */

export function engineOf(p: TextProvenance): AdEngine {
  return {
    provider: p.provider,
    model: p.model,
    // `undefined` on the provenance means UNPRICED, never free; the wire's
    // absent-value convention is null.
    costUsd: typeof p.costUsd === "number" ? p.costUsd : null,
    costBasis: p.costBasis,
    durationMs: p.durationMs,
  };
}

/* ── responses ────────────────────────────────────────────────────────────── */

const fail = (status: number, error: string, message: string, extra?: Record<string, unknown>) =>
  Response.json({ error, message, ...extra } satisfies AdErrorBody, { status });

async function defaultReadPrompt(name: string): Promise<string> {
  const at = path.join(process.cwd(), "pipeline", name);
  try {
    return await readFile(at, "utf8");
  } catch {
    throw new PromptUnavailable(`The prompt could not be read from ${at}.`);
  }
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new BadRequest("The body must be JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new BadRequest("The body must be a JSON object.");
  return body as Record<string, unknown>;
}

/** One error map for both rounds. */
function failureFor(e: unknown, round: "ideas" | "scenarios"): Response {
  if (e instanceof BadRequest) return fail(400, "bad-request", e.message);
  // Before anything ran: a broken install, not a broken turn.
  if (e instanceof PromptUnavailable)
    return fail(500, "prompt-unavailable", `${e.message} The engine was never started, so nothing was billed.`);
  // The model asked the creator a question instead of inventing a claim. Not
  // a server failure: 422, and the question verbatim.
  if (e instanceof AdBriefQuestion) return fail(422, "needs-brief", e.question);
  // It answered, and the answer is not a round this studio keeps. Every
  // finding travels — the fix is a prompt edit.
  if (e instanceof AdConceptError)
    return fail(statusFor("bad-response"), "bad-response", `${e.message} Nothing was saved.`, { findings: e.findings });
  // One taxonomy, one status map: the message names every engine tried and
  // why each dropped out (lib/text/errors.ts). It stands alone — see
  // /api/research's note on not appending a reassurance.
  if (e instanceof TextError) return fail(statusFor(e.kind), e.kind, e.message);
  console.error(`[ads/${round}]`, e);
  return fail(502, "failed", `The ${round} round failed. Nothing was saved.`);
}

/** GET — who would serve this round, before the creator presses the button. A
 *  `claude --version`-class probe, free. */
export async function conceptPreflight(turn: "ad-ideas" | "ad-scenarios"): Promise<Response> {
  const s = await engineStatus(turn);
  return Response.json({ serving: s.serving, candidates: s.candidates });
}

export async function ideasResponse(req: Request, deps: ConceptDeps = {}): Promise<Response> {
  try {
    const body = await readBody(req);
    const brief = readBrief(body.brief);
    const { template, targetS } = readFormat(body);
    const request: AdIdeasRequest = { brief, template, targetS };
    const doc = await (deps.readPrompt ?? defaultReadPrompt)("ADS-IDEAS-PROMPT.md");
    const seed = deps.seed ?? Math.floor(Math.random() * 2 ** 31);
    const run = await (deps.reason ?? routerReason)({
      prompt: ideasPrompt(doc, request, seed),
      turn: "ad-ideas",
      schema: IDEAS_SCHEMA,
    });
    const options = parseIdeas(run.json ?? run.text, request, { mint: deps.mint });
    return Response.json({ options, engine: engineOf(run.provenance) } satisfies AdIdeasResponse);
  } catch (e) {
    return failureFor(e, "ideas");
  }
}

export async function scenariosResponse(req: Request, deps: ConceptDeps = {}): Promise<Response> {
  try {
    const body = await readBody(req);
    const brief = readBrief(body.brief);
    const { template, targetS } = readFormat(body);
    const idea = readIdea(body.idea);
    const request: AdScenariosRequest = { brief, template, targetS, idea };
    const doc = await (deps.readPrompt ?? defaultReadPrompt)("ADS-SCENARIOS-PROMPT.md");
    const run = await (deps.reason ?? routerReason)({
      prompt: scenariosPrompt(doc, request),
      turn: "ad-scenarios",
      schema: SCENARIOS_SCHEMA,
    });
    const options = parseScenarios(run.json ?? run.text, request, { mint: deps.mint });
    return Response.json({ options, engine: engineOf(run.provenance) } satisfies AdScenariosResponse);
  } catch (e) {
    return failureFor(e, "scenarios");
  }
}
