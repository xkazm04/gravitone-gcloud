import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

import type { BlobRef } from "@gt/domain/blob";
import { parseAt } from "@gt/domain/door";
import { AppError, errorMessage, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { blobStore } from "@gt/kernel/blob";
import type { Ending, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { landCandidateIn, landCardIn, proposeRolesIn, roundOf, setAuditionIn } from "@gt/kernel/productions/cast";
import type { Store } from "@gt/kernel/store";
import { madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import type { CastAuditionRequest, CastPorts, CastRequest, CastRolesRequest, CastRoundRequest } from "@gt/producers/production-cast/define";

import type { AgentResult, RunAgentInput } from "../agent/cliSeam.ts";
import { CARD_LOOK_MAX, CARD_NAME_MAX, CARD_PERSONALITY_MAX, judgeFailure, MUSE_MIN_AGE, type MuseJudge } from "../foundry/scout/muse.ts";
import { judgeStill, STAND_JUDGE } from "../foundry/scout/judge.ts";
import { CODEX_MODEL, drawCodex, type CodexRequest } from "../imaging/local/codex.ts";
import { recognize as LIVE_RECOGNIZE } from "../imaging/router.ts";
import type { Recognition, RecognizeRequest } from "../imaging/types.ts";
import { blobRootOf } from "../kernelProcess.ts";
import { blobRoute } from "../library/media.ts";
import { fakeAuditionWriter, writeAudition, type AuditionWriter } from "../music/voiceDesign.ts";
import { MODEL } from "../model.ts";
import { standIdea } from "./scoutIdeaActs.ts";

// A CASTING JOB'S ACTS (spark concept-casting-stages S4): the ports of packages/producers/src/production-cast/define.ts.
//
//   roles     the seat names the concept's roles; then one audition line per role. A role whose line fails keeps no line
//             and the operator asks for one again: it never loses the others.
//   audition  one role's line.
//   cards     one turn writes a card per new slot. Whatever it could not write is that slot's failure, not the round's.
//   draw      one Codex still at 1:1 with the concept's frames attached, read by the safety judge while still only in
//             memory: a refused still is never stored, and the slot carries `judge: <why>` as its refusal. A slot's
//             failure is booked as that step's output, so the job goes on to the next.
//
// Every record write is fenced against the job's slot first (the take acts' `fence`). A dry job asks no seat, no Codex and
// no eye: each is a declared stand-in.

const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;

export type CastEngines = {
  readonly seat?: (input: RunAgentInput) => Promise<AgentResult>;
  readonly draw?: (req: CodexRequest) => Promise<{ readonly png: Uint8Array }>;
  readonly recognize?: (req: RecognizeRequest) => Promise<Recognition>;
};

export const CAST_ROLES_MAX = 4;
const SEAT_EFFORT = "medium";
const SEAT_TIMEOUT_MIN = 10;
const PROMPT_FILE = "CASTING-PROMPT.md";
const STAND_ROLES = [
  { name: "The Lead", brief: "dry-run stand-in role: the person the story follows, a weathered adult in plain working clothes, low unhurried voice" },
  { name: "The Foil", brief: "dry-run stand-in role: the person who stands in their way, a sharp adult in a dark coat, clipped precise voice" },
];

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; the round is not written`);
  const r = ctx.fx.tx("cast.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

const conflict = (x: unknown): boolean => x instanceof AppError && x.code === "conflict";
const jobFailure = (x: unknown): StepOutcome => ({ kind: "fatal", code: x instanceof AppError ? x.code : "internal", message: errorMessage(x) });

/* ── The prompt file and the seat ─────────────────────────────────────────── */

async function promptSection(heading: string, slots: Readonly<Record<string, string>>): Promise<string> {
  const text = (await readFile(path.join(process.cwd(), "pipeline", PROMPT_FILE), "utf8")).replace(/\r\n/g, "\n");
  const start = text.indexOf(`\n## ${heading}\n`);
  if (start === -1) throw new AppError("unavailable", `pipeline/${PROMPT_FILE} has no section ${heading}`);
  const from = start + heading.length + 5;
  const end = text.indexOf("\n## ", from);
  let body = (end === -1 ? text.slice(from) : text.slice(from, end)).trim();
  for (const [k, v] of Object.entries(slots)) body = body.split(`{{${k}}}`).join(v);
  return body;
}

/** One seat turn: `concept` in inputs/concept.json, a JSON answer read back from out/answer.json. Throws its failure's sentence. */
async function seatAnswer<T>(e: CastEngines, ctx: StepContext, turn: string, prompt: string, concept: unknown, schema: z.ZodType<T>, stand: () => T): Promise<T> {
  return meteredCall<T>(ctx, {
    provider: "claude-seat",
    model: MODEL,
    payload: { turn, concept },
    stand,
    live: async () => {
      const ws = await mkdtemp(path.join(tmpdir(), "gt-production-cast-"));
      try {
        await mkdir(path.join(ws, "inputs"), { recursive: true });
        await mkdir(path.join(ws, "out"), { recursive: true });
        await writeFile(path.join(ws, "inputs", "concept.json"), JSON.stringify(concept, null, 2));
        const seat = e.seat ?? (await import("../agent/cliSeam.ts")).runAgent;
        const ran = await seat({ cwd: ws, prompt: prompt.split("{{WS}}").join(ws), model: MODEL, effort: SEAT_EFFORT, tools: ["Read", "Write"], timeoutMin: SEAT_TIMEOUT_MIN, turn: "casting" });
        if (ran.outcome !== "completed") throw new AppError(ran.outcome === "unavailable" ? "unavailable" : "internal", `the seat's ${turn} turn ${ran.outcome}: ${ran.errors.join(" | ") || "no sentence"}`);
        const file = path.join(ws, "out", "answer.json");
        if (!existsSync(file)) throw new AppError("invalid", `the seat's ${turn} turn wrote no answer`);
        const parsed = parseAt(`seat ${turn}`, schema, JSON.parse(await readFile(file, "utf8")));
        if (!parsed.ok) throw parsed.error;
        return { value: parsed.value as T, unpriced: "the operator's text seat: billed by the turn, reported after it" };
      } finally {
        await rm(ws, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  });
}

/** The real audition writer, bound to the seat: one role's line in that character's voice, from the concept. */
export function seatAuditionWriter(e: CastEngines, ctx: StepContext): AuditionWriter {
  return async ({ role, brief, logline }) => {
    const prompt = await promptSection("audition", {});
    const answer = await seatAnswer(e, ctx, "cast-audition", prompt, { role, brief, logline }, z.object({ line: z.string().trim().min(1) }), () => ({ line: "" }));
    return answer.line;
  };
}

/** A dry job's writer: fixed words, long enough to send, and no seat. */
function writerFor(e: CastEngines, ctx: StepContext): AuditionWriter {
  return ctx.job.mode.kind === "live" ? seatAuditionWriter(e, ctx) : fakeAuditionWriter;
}

/* ── roles and audition ───────────────────────────────────────────────────── */

const rolesAnswer = z.object({ roles: z.array(z.object({ name: z.string().trim().min(1).max(60), brief: z.string().trim().min(1).max(2000) })).min(1).max(CAST_ROLES_MAX) });

async function rolesAct(e: CastEngines, store: Store, req: CastRolesRequest, ctx: StepContext): Promise<StepOutcome> {
  try {
    const prompt = await promptSection("roles", { MAX: String(CAST_ROLES_MAX) });
    const answer = await seatAnswer(e, ctx, "cast-roles", prompt, { logline: req.logline, beats: req.beats }, rolesAnswer, () => ({ roles: STAND_ROLES }));
    const roles: { name: string; brief: string; auditionScript?: string }[] = [];
    for (const r of answer.roles) {
      const line = await writeAudition(writerFor(e, ctx), { role: r.name, brief: r.brief, logline: req.logline });
      roles.push({ name: r.name, brief: r.brief, ...(line.ok ? { auditionScript: line.value } : {}) });
    }
    fence(ctx);
    const landed = ctx.fx.tx("cast.roles", (t) => proposeRolesIn(t, req.productionId, roles, { kind: "machine", id: ctx.job.id }));
    if (!landed.ok) throw landed.error;
    return madePaid(data({ roles: roles.map((r) => r.name), landed: landed.value }), ctx);
  } catch (x) {
    if (conflict(x)) throw x;
    return jobFailure(x);
  }
}

async function auditionAct(e: CastEngines, req: CastAuditionRequest, ctx: StepContext): Promise<StepOutcome> {
  try {
    const line = await writeAudition(writerFor(e, ctx), { role: req.role, brief: req.brief, logline: req.logline });
    if (!line.ok) return { kind: "fatal", code: line.error.code, message: line.error.message };
    fence(ctx);
    const wrote = ctx.fx.tx("cast.audition", (t) => setAuditionIn(t, req.productionId, req.roleId, line.value));
    if (!wrote.ok) throw wrote.error;
    return madePaid(data({ line: line.value, landed: wrote.value }), ctx);
  } catch (x) {
    if (conflict(x)) throw x;
    return jobFailure(x);
  }
}

/* ── cards ────────────────────────────────────────────────────────────────── */

const cardAnswer = z.object({
  name: z.string().trim().min(1).max(CARD_NAME_MAX),
  look: z.string().trim().min(1).max(CARD_LOOK_MAX),
  personality: z.string().trim().min(1).max(CARD_PERSONALITY_MAX),
  age: z.number().int().min(MUSE_MIN_AGE).max(120),
});
const cardsAnswer = z.object({ cards: z.array(z.unknown()) });

const standCard = (slot: number): z.output<typeof cardAnswer> => ({ name: `Stand-in ${slot}`, age: 30 + slot, look: `dry-run stand-in design ${slot}: no seat wrote this and nobody drew it`, personality: "a stand-in, nothing to direct" });

function failSlot(ctx: StepContext, req: CastRoundRequest, slot: number, landing: { readonly state: "failed" | "refused"; readonly error: string }): void {
  fence(ctx);
  const r = ctx.fx.tx("cast.candidate", (t) => landCandidateIn(t, req.productionId, req.roundId, slot, landing));
  if (!r.ok) throw r.error;
}

async function cardsAct(e: CastEngines, req: CastRoundRequest, ctx: StepContext): Promise<StepOutcome> {
  let answer: { readonly cards: readonly unknown[] };
  try {
    const prompt = await promptSection("cards", { COUNT: String(req.cardSlots.length), MIN_AGE: String(MUSE_MIN_AGE), LOOK_MAX: String(CARD_LOOK_MAX), PERSONALITY_MAX: String(CARD_PERSONALITY_MAX) });
    answer = await seatAnswer(e, ctx, "cast-cards", prompt, { role: req.role, brief: req.brief, logline: req.logline, count: req.cardSlots.length }, cardsAnswer, () => ({ cards: req.cardSlots.map(standCard) }));
  } catch (x) {
    if (conflict(x)) throw x;
    const why = `no card written: ${errorMessage(x)}`;
    for (const s of req.cardSlots) failSlot(ctx, req, s, { state: "failed", error: why });
    return madePaid(data({ cards: 0, failed: why }), ctx);
  }
  let landed = 0;
  for (const [i, s] of req.cardSlots.entries()) {
    const card = parseAt("seat card", cardAnswer, answer.cards[i]);
    if (!card.ok) {
      failSlot(ctx, req, s, { state: "failed", error: answer.cards[i] === undefined ? `the seat wrote ${answer.cards.length} cards for ${req.cardSlots.length} slots` : `the seat's card did not read: ${card.error.message}` });
      continue;
    }
    fence(ctx);
    const value = card.value;
    const r = ctx.fx.tx("cast.card", (t) => landCardIn(t, req.productionId, req.roundId, s, value));
    if (!r.ok) throw r.error;
    landed += 1;
  }
  return madePaid(data({ cards: landed }), ctx);
}

/* ── draw ─────────────────────────────────────────────────────────────────── */

const served = (ref: BlobRef): string => blobRoute(ref.sha256, ref.mime) ?? `/api/blob/${ref.sha256}`;

function meteredEye(e: CastEngines, req: CastRoundRequest, slot: number, r: RecognizeRequest, ctx: StepContext): Promise<{ readonly json?: unknown }> {
  return meteredCall<{ readonly json?: unknown }>(ctx, {
    provider: "imaging-router",
    model: "recognize",
    payload: { instruction: r.instruction, schema: r.schema, production: req.productionId, round: req.roundId, slot },
    stand: () => ({ json: { ...STAND_JUDGE, apparentAge: STAND_JUDGE.apparentAge ?? 30 } }),
    live: async () => {
      const out = await (e.recognize ?? LIVE_RECOGNIZE)(r);
      const p = out.provenance;
      return { value: { json: out.json }, served: `${p.provider}/${p.model}`, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for a judge read` } : { usd: p.costUsd }) };
    },
  });
}

async function refBytes(root: string, refs: readonly BlobRef[]): Promise<readonly Uint8Array[]> {
  const blobs = blobStore(root);
  const out: Uint8Array[] = [];
  for (const ref of refs) {
    const r = await blobs.read(ref);
    if (!r.ok) throw r.error;
    out.push(r.value);
  }
  return out;
}

async function drawAct(e: CastEngines, store: Store, root: string, req: CastRoundRequest, slot: number, ctx: StepContext): Promise<StepOutcome> {
  const read = store.read((r) => roundOf(r, req.productionId, req.roundId));
  if (!read.ok) throw read.error;
  const candidate = read.value?.candidates.find((c) => c.slot === slot);
  if (candidate === undefined) return { kind: "fatal", code: "not-found", message: `cast: no slot ${slot} in ${req.roundId}` };
  const failed = (state: "failed" | "refused", error: string, judge?: MuseJudge): StepOutcome => {
    failSlot(ctx, req, slot, { state, error });
    return madePaid(data({ slot, state, error, ...(judge === undefined ? {} : { judge }) }), ctx);
  };
  if (candidate.card === undefined) return failed("failed", candidate.error ?? "no card was written for this design");
  const card = candidate.card;
  if (card.age === undefined || card.age < MUSE_MIN_AGE) return failed("refused", `cast: a design is a fictional adult of at least ${MUSE_MIN_AGE}`);
  let png: Uint8Array;
  let model: string;
  try {
    const prompt = await promptSection("portrait", { AGE: String(card.age), NAME: card.name, LOOK: card.look, PERSONALITY: card.personality });
    const refs = await refBytes(root, req.refs);
    const render = async () => ({ png: (await (e.draw ?? drawCodex)({ prompt, aspect: "1:1", refs })).png, model: CODEX_MODEL });
    const got =
      ctx.job.mode.kind === "live"
        ? await render()
        : await meteredCall<{ png: Uint8Array; model: string }>(ctx, {
            provider: "codex",
            model: CODEX_MODEL,
            payload: { prompt, aspect: "1:1", refs: req.refs.map((r) => r.sha256), slot },
            estimate: req.estimates.draw,
            stand: () => ({ png: new Uint8Array(standIdea(slot)), model: "dry stand-in" }),
            live: async () => ({ value: await render(), unpriced: "the operator's ChatGPT seat: no per-image bill" }),
          });
    png = got.png;
    model = got.model;
  } catch (x) {
    if (conflict(x)) throw x;
    return failed("failed", errorMessage(x));
  }
  const judged = await judgeStill({ base64: Buffer.from(png).toString("base64"), mime: "image/png" }, { recognize: (r) => meteredEye(e, req, slot, r, ctx) });
  if (!judged.ok) return failed("failed", `the safety judge did not read this still: ${judged.error.message}`);
  const why = judgeFailure(judged.value);
  if (why !== null) return failed("refused", `judge: ${why}`, judged.value);
  fence(ctx);
  const blob = await ctx.fx.blob(png, "image/png");
  if (!blob.ok) throw blob.error;
  fence(ctx);
  const ref = blob.value;
  const landed = ctx.fx.tx("cast.candidate", (t) => landCandidateIn(t, req.productionId, req.roundId, slot, { state: "ready", images: [served(ref)], blobs: [ref] }));
  if (!landed.ok) throw landed.error;
  return madePaid(data({ slot, state: "ready", blob: ref, model, judge: judged.value }), ctx);
}

/* ── the ending ───────────────────────────────────────────────────────────── */

/** A job that failed as a whole says so on every slot still waiting; a stop or interruption leaves them for a retry. */
async function ended(store: () => Result<Store>, req: CastRequest, job: Job, ending: Ending): Promise<void> {
  if (ending !== "failed" || req.act !== "round") return;
  const s = store();
  if (!s.ok) throw s.error;
  const said = job.error?.message ?? `job ${job.id} failed`;
  const held = s.value.read((r) => roundOf(r, req.productionId, req.roundId));
  if (!held.ok) throw held.error;
  const waiting = new Set((held.value?.candidates ?? []).filter((c) => c.state === "pending").map((c) => c.slot));
  const write = s.value.tx((t) => {
    for (const slot of req.drawSlots) if (waiting.has(slot)) landCandidateIn(t, req.productionId, req.roundId, slot, { state: "failed", error: said });
  });
  if (!write.ok) throw write.error;
}

export function castActs(store: () => Result<Store>, e: CastEngines): Pick<CastPorts, "roles" | "audition" | "cards" | "draw" | "ended"> {
  const live = (): Store => {
    const s = store();
    if (!s.ok) throw s.error;
    return s.value;
  };
  return {
    roles: (req, ctx) => rolesAct(e, live(), req, ctx),
    audition: (req, ctx) => auditionAct(e, req, ctx),
    cards: (req, ctx) => cardsAct(e, req, ctx),
    draw: async (req, slot, ctx) => {
      try {
        const s = live();
        return await drawAct(e, s, blobRootOf(s), req, slot, ctx);
      } catch (x) {
        if (conflict(x)) throw x;
        return jobFailure(x);
      }
    },
    ended: (req, job, ending) => ended(store, req, job, ending),
  };
}
