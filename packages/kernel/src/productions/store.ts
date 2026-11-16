// THE PRODUCTION RECORD, THE STORE'S HALF (spark concept-casting-stages S1). One kept concept, started by the operator,
// walked through the stages of @gt/domain/production.machine. The tables, their triggers and the row door are
// ./schema.ts.
//
// Every write is one transaction: the row(s) and ONE ledger event per thing that happened (`production.started`,
// `production.staged`, `production.take`, `production.proven`) carrying the actor it was handed. A move the machine's
// table refuses is refused here with `refusalOfMove`'s sentence, whoever asked; no layer above can skip it.

import { z } from "zod";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import {
  PRODUCTION_EVENTS,
  PRODUCTION_ID_RE,
  productionAudioSchema,
  productionBoardSchema,
  productionRoleSchema,
  productionSchema,
  refusalOfMove,
  type Production,
  type ProductionAudio,
  type ProductionBoard,
  type ProductionCut,
  type ProductionSource,
  type ProductionStage,
  type ProductionTake,
  type TakeKind,
} from "@gt/domain/production";

import { append } from "../events.ts";
import type { Reader, Row, Tx } from "../store.ts";
import { CUT_COLUMNS, HEAD_COLUMNS, TAKE_COLUMNS, cutRowSchema, headRowSchema, startInputSchema, stringListSchema, takeRowSchema } from "./schema.ts";

const rolesSchema = z.array(productionRoleSchema);

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

function toTake(row: Row): ProductionTake {
  const r = must(parseAt("production take row", takeRowSchema, row));
  return {
    id: r.id,
    kind: r.kind,
    state: r.state,
    beats: must(parseJsonAt(`take ${r.id} beats`, stringListSchema, r.beats)),
    frames: must(parseJsonAt(`take ${r.id} frames`, stringListSchema, r.frames)),
    prompt: r.prompt,
    seed: r.seed,
    engine: r.engine,
    jobId: r.job_id,
    at: r.at,
    ...(r.dry === 1 ? { dry: true as const } : {}),
    ...(r.video === null ? {} : { video: r.video }),
    ...(r.poster === null ? {} : { poster: r.poster }),
    ...(r.error === null ? {} : { error: r.error }),
    ...(r.duration_s === null ? {} : { durationS: r.duration_s }),
    ...(r.gpu_seconds === null ? {} : { gpuSeconds: r.gpu_seconds }),
    ...(r.proven_at === null ? {} : { provenAt: r.proven_at }),
    ...(r.proven_by === null ? {} : { provenBy: r.proven_by }),
    ...(r.stale === 1 ? { stale: true as const } : {}),
    ...(r.speaking === null ? {} : { speaking: must(parseJsonAt(`take ${r.id} speaking`, z.object({ roleId: z.string().min(1) }), r.speaking)) }),
  };
}

function toCut(row: Row): ProductionCut {
  const c = must(parseAt("production cut row", cutRowSchema, row));
  return {
    id: c.id,
    takes: must(parseJsonAt(`cut ${c.id} takes`, z.array(z.string().min(1)), c.takes)),
    format: c.format,
    state: c.state,
    ...(c.receipt === null ? {} : { receipt: c.receipt }),
    ...(c.packet_id === null ? {} : { packetId: c.packet_id }),
    ...(c.video === null ? {} : { video: c.video }),
    ...(c.error === null ? {} : { error: c.error }),
    jobId: c.job_id,
    ...(c.dry === 1 ? { dry: true as const } : {}),
    ...(c.duration_s === null ? {} : { durationS: c.duration_s }),
    ...(c.note === null ? {} : { note: c.note }),
    at: c.at,
  };
}

/** A production's latest cut, the one the screen shows. Cuts are appended, `cut-N`. */
export function latestCut(r: Reader, id: string): ProductionCut | undefined {
  const row = r.get(`SELECT ${CUT_COLUMNS} FROM production_cuts WHERE production_id = ? ORDER BY n DESC LIMIT 1`, id);
  return row === undefined ? undefined : toCut(row);
}

/** Every cut of a production, oldest first: what was said of each stays readable after a later cut. */
export function cutsOf(r: Reader, id: string): readonly ProductionCut[] {
  return r.all(`SELECT ${CUT_COLUMNS} FROM production_cuts WHERE production_id = ? ORDER BY n`, id).map(toCut);
}

/** One cut by id. */
export function readCut(r: Reader, id: string, cutId: string): ProductionCut | undefined {
  const row = r.get(`SELECT ${CUT_COLUMNS} FROM production_cuts WHERE production_id = ? AND id = ?`, id, cutId);
  return row === undefined ? undefined : toCut(row);
}

/** Every cut waiting on the Board, for its pile. */
export function cutsOnBoard(r: Reader): readonly { readonly productionId: string; readonly title: string; readonly cut: ProductionCut }[] {
  return r.all(`SELECT ${CUT_COLUMNS} FROM production_cuts WHERE state = 'on-board' ORDER BY at`).map((row) => {
    const productionId = String(row["production_id"]);
    const title = String(r.get("SELECT title FROM productions WHERE id = ?", productionId)?.["title"] ?? productionId);
    return { productionId, title, cut: toCut(row) };
  });
}

const audioOf = (h: { readonly id: string; readonly audio: string | null }): ProductionAudio | undefined => (h.audio === null ? undefined : must(parseJsonAt(`production ${h.id} audio`, productionAudioSchema, h.audio)));

function takesOf(r: Reader, id: string): ProductionTake[] {
  return r.all(`SELECT ${TAKE_COLUMNS} FROM production_takes WHERE production_id = ? ORDER BY n`, id).map(toTake);
}

function toProduction(r: Reader, row: Row): Production {
  const h = must(parseAt("production row", headRowSchema, row));
  return must(
    parseAt("production", productionSchema, {
      id: h.id,
      title: h.title,
      source: { kind: h.source_kind, ref: h.source_ref },
      stage: h.stage,
      board: must(parseJsonAt(`production ${h.id} board`, productionBoardSchema, h.board)),
      takes: takesOf(r, h.id),
      roles: must(parseJsonAt(`production ${h.id} roles`, rolesSchema, h.roles)),
      ...(audioOf(h) === undefined ? {} : { audio: audioOf(h) }),
      ...(latestCut(r, h.id) === undefined ? {} : { cut: latestCut(r, h.id) }),
      ...(h.venture_id === null ? {} : { ventureId: h.venture_id }),
      startedAt: h.started_at,
      startedBy: h.started_by,
    }),
  );
}

export function readProduction(r: Reader, id: string): Production | undefined {
  const row = r.get(`SELECT ${HEAD_COLUMNS} FROM productions WHERE id = ?`, id);
  return row === undefined ? undefined : toProduction(r, row);
}

/** Every production, newest start first. */
export function listProductions(r: Reader): readonly Production[] {
  return r.all(`SELECT ${HEAD_COLUMNS} FROM productions ORDER BY started_at DESC, rowid DESC`).map((row) => toProduction(r, row));
}

/** The production a concept was started as, if any. */
export function productionOfSource(r: Reader, source: ProductionSource): Production | undefined {
  const row = r.get(`SELECT ${HEAD_COLUMNS} FROM productions WHERE source_kind = ? AND source_ref = ?`, source.kind, source.ref);
  return row === undefined ? undefined : toProduction(r, row);
}

/** The episode ids started as productions (dropped ones too: once started, a night does not take one back). */
export function startedEpisodes(r: Reader): ReadonlySet<string> {
  return new Set(r.all("SELECT source_ref FROM productions WHERE source_kind = 'episode'").map((row) => String(row["source_ref"])));
}

const mustHave = (r: Reader, id: string): Production => {
  const p = readProduction(r, id);
  if (p === undefined) throw new AppError("not-found", `production: no ${id}`);
  return p;
};

const slugOf = (title: string): string => {
  const slug = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  return slug === "" ? "concept" : slug;
};

function mintId(r: Reader, title: string): string {
  const taken = new Set(r.all("SELECT id FROM productions").map((row) => String(row["id"])));
  const base = `prdn:${slugOf(title)}`;
  for (let i = 1; ; i++) {
    const id = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(id)) return id;
  }
}

export type StartInput = { readonly source: ProductionSource; readonly title: string; readonly board: ProductionBoard };

/**
 * Starts a kept concept. Nothing starts itself: only an operator's act reaches here. Idempotent on the concept: a Start
 * pressed twice returns the production it already made and writes nothing. Emits `production.started`.
 */
export function startProductionIn(t: Tx, input: StartInput, actor: Actor): Production {
  if (actor.kind !== "operator") throw new AppError("refused", `production: only the operator starts a production (${actor.kind} ${actor.id} tried)`);
  const v = must(parseAt("production start", startInputSchema, input));
  const prior = productionOfSource(t, v.source);
  if (prior !== undefined) return prior;
  const id = mintId(t, v.title);
  if (!PRODUCTION_ID_RE.test(id)) throw new AppError("internal", `production: minted an id the contract refuses: ${id}`);
  t.run(
    "INSERT INTO productions (id, title, source_kind, source_ref, stage, board, started_at, started_by_kind, started_by) VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?)",
    id,
    v.title,
    v.source.kind,
    v.source.ref,
    JSON.stringify(v.board),
    t.at,
    actor.kind,
    actor.id,
  );
  append(t, { actor, type: PRODUCTION_EVENTS.started, subject: { kind: "production", id }, data: { source: v.source, title: v.title } });
  return mustHave(t, id);
}

export function stageMove(t: Tx, id: string, from: ProductionStage, to: ProductionStage, actor: Actor): void {
  t.run("UPDATE productions SET stage = ? WHERE id = ?", to, id);
  append(t, { actor, type: PRODUCTION_EVENTS.staged, subject: { kind: "production", id }, data: { from, to } });
}

/**
 * Why this stage move may not happen though the machine allows it: audio needs every role cast (and no dry stand-in
 * among the casts), and the way back to casting is a re-cast of a named role, which is what marks later takes stale.
 */
export function refusalOfCastMove(p: Production, to: ProductionStage): string | undefined {
  if (to === "casting" && (p.stage === "audio" || p.stage === "cutting")) return "production: a re-cast names the role it re-casts; the stage does not move back on its own";
  if (to === "cutting" && p.stage === "audio") return p.audio === undefined ? "production: the audio decision comes before the final cut" : undefined;
  if (to === "done" && p.stage === "cutting") return p.cut?.state === "approved" ? undefined : "production: only the Board's approval of a final cut finishes a production";
  if (to !== "audio" || p.stage !== "casting") return undefined;
  if (p.roles.length === 0) return `production: ${p.id} has no roles to cast`;
  const open = p.roles.filter((r) => r.cast === undefined).map((r) => r.name);
  if (open.length > 0) return `production: every role needs a character and a voice before audio (${open.join(", ")} still open)`;
  const dry = p.roles.filter((r) => r.cast?.dry === true).map((r) => r.name);
  if (dry.length > 0) return `production: ${dry.join(", ")} cast on a dry round; a dry stand-in cannot go to audio`;
  return undefined;
}

/** One stage move, refused with `refusalOfMove`'s sentence when the machine forbids it (an operator-only stage included). */
export function moveProductionIn(t: Tx, id: string, to: ProductionStage, actor: Actor): Production {
  const p = mustHave(t, id);
  const refusal = refusalOfMove(p.stage, to, actor.kind) ?? refusalOfCastMove(p, to);
  if (refusal !== undefined) throw new AppError("refused", refusal);
  stageMove(t, id, p.stage, to, actor);
  return mustHave(t, id);
}

export type NewTake = {
  readonly kind: TakeKind;
  readonly beats: readonly string[];
  readonly frames: readonly string[];
  readonly prompt: string;
  readonly seed: number;
  readonly engine: string;
  readonly jobId: string;
  readonly dry: boolean;
  /** A cast character speaking (the S5 route): rendered at `audio`, it walks no stage. */
  readonly speaking?: { readonly roleId: string };
};

/** Why this take may not be asked for at this stage; undefined when it may. A rough cut needs a hero take that landed; a speaking take is rendered only at audio. */
export function refusalOfTake(p: Production, kind: TakeKind, speaking = false): string | undefined {
  if (speaking) return p.stage === "audio" ? undefined : `production: a speaking take is rendered at audio, not ${p.stage}`;
  if (kind === "hero") return p.stage === "accepted" || p.stage === "hero" || p.stage === "rough" ? undefined : `production: a hero take cannot be rendered from ${p.stage}`;
  if (p.stage !== "hero" && p.stage !== "rough") return `production: a rough cut cannot be rendered from ${p.stage}`;
  return p.takes.some((x) => x.kind === "hero" && x.state === "ready") ? undefined : "production: a rough cut comes only after a hero take has landed";
}

/** The stage a take's request walks a production to: hero shots from accepted or a rough cut, a rough cut from hero. */
const stageForTake = (from: ProductionStage, kind: TakeKind): ProductionStage | undefined => {
  if (kind === "hero") return from === "hero" ? undefined : "hero";
  return from === "rough" ? undefined : "rough";
};

/**
 * Appends a take, rendering, and walks the stage on (refused with the machine's sentence when it may not). Takes are
 * numbered, never replaced: `take-1`, `take-2`. Emits `production.take` and, when it moved, `production.staged`.
 */
export function appendTake(t: Tx, id: string, take: NewTake, actor: Actor): { readonly production: Production; readonly take: ProductionTake } {
  const p = mustHave(t, id);
  const why = refusalOfTake(p, take.kind, take.speaking !== undefined);
  if (why !== undefined) throw new AppError("refused", why);
  const to = take.speaking !== undefined ? undefined : stageForTake(p.stage, take.kind);
  if (to !== undefined) {
    const refusal = refusalOfMove(p.stage, to, actor.kind);
    if (refusal !== undefined) throw new AppError("refused", refusal);
    stageMove(t, id, p.stage, to, actor);
  }
  const n = 1 + Number((t.get("SELECT COALESCE(MAX(n), 0) AS n FROM production_takes WHERE production_id = ?", id) ?? { n: 0 })["n"]);
  const takeId = `take-${n}`;
  t.run(
    "INSERT INTO production_takes (production_id, id, n, kind, state, beats, frames, prompt, seed, engine, job_id, dry, at, speaking) VALUES (?, ?, ?, ?, 'rendering', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    takeId,
    n,
    take.kind,
    JSON.stringify(take.beats),
    JSON.stringify(take.frames),
    take.prompt,
    take.seed,
    take.engine,
    take.jobId,
    take.dry ? 1 : 0,
    t.at,
    take.speaking === undefined ? null : JSON.stringify(take.speaking),
  );
  append(t, { actor, type: PRODUCTION_EVENTS.take, subject: { kind: "production", id }, data: { take: takeId, kind: take.kind, state: "rendering", jobId: take.jobId, dry: take.dry } });
  const production = mustHave(t, id);
  const made = production.takes.find((x) => x.id === takeId);
  if (made === undefined) throw new AppError("internal", `production: ${takeId} did not land on ${id}`);
  return { production, take: made };
}

export type TakeOutcome =
  | { readonly state: "ready"; readonly video: string; readonly poster?: string; readonly durationS: number; readonly gpuSeconds: number }
  | { readonly state: "failed"; readonly error: string; readonly gpuSeconds?: number };

/** A take's outcome, once; settling one already settled is a no-op (a re-driven job settles again). Emits `production.take`. */
export function settleTake(t: Tx, id: string, takeId: string, o: TakeOutcome, actor: Actor): ProductionTake {
  const p = mustHave(t, id);
  const take = p.takes.find((x) => x.id === takeId);
  if (take === undefined) throw new AppError("not-found", `production: ${id} has no ${takeId}`);
  if (take.state !== "rendering") return take;
  if (o.state === "ready") {
    t.run("UPDATE production_takes SET state = 'ready', video = ?, poster = ?, duration_s = ?, gpu_seconds = ? WHERE production_id = ? AND id = ?", o.video, o.poster ?? null, o.durationS, o.gpuSeconds, id, takeId);
  } else {
    t.run("UPDATE production_takes SET state = 'failed', error = ?, gpu_seconds = ? WHERE production_id = ? AND id = ?", o.error, o.gpuSeconds ?? null, id, takeId);
  }
  append(t, { actor, type: PRODUCTION_EVENTS.take, subject: { kind: "production", id }, data: { take: takeId, state: o.state, ...(o.state === "failed" ? { error: o.error } : {}) } });
  const done = mustHave(t, id).takes.find((x) => x.id === takeId);
  if (done === undefined) throw new AppError("internal", `production: ${takeId} vanished from ${id}`);
  return done;
}

/**
 * The operator marks one take proven (`OPERATOR_ONLY_STAGES`: an agent is refused by the machine), and the production
 * moves to proven with it. Refused for a take that is not ready or is stale, and from any stage the machine does not
 * reach proven from. Emits `production.proven` and `production.staged`.
 */
export function markTakeProven(t: Tx, id: string, takeId: string, actor: Actor): Production {
  const p = mustHave(t, id);
  const refusal = refusalOfMove(p.stage, "proven", actor.kind);
  if (refusal !== undefined) throw new AppError("refused", refusal);
  const take = p.takes.find((x) => x.id === takeId);
  if (take === undefined) throw new AppError("not-found", `production: ${id} has no ${takeId}`);
  if (take.state !== "ready") throw new AppError("refused", `production: ${takeId} is ${take.state}; only a take that landed can be proven`);
  if (take.stale === true) throw new AppError("refused", `production: ${takeId} is stale after a re-cast`);
  if (take.dry === true) throw new AppError("refused", `production: ${takeId} is a dry stand-in; no render ran, so it cannot prove a concept`);
  t.run("UPDATE production_takes SET proven_at = ?, proven_by = ? WHERE production_id = ? AND id = ?", t.at, actor.id, id, takeId);
  append(t, { actor, type: PRODUCTION_EVENTS.proven, subject: { kind: "production", id }, data: { take: takeId } });
  stageMove(t, id, p.stage, "proven", actor);
  return mustHave(t, id);
}
