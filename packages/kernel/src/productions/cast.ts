// THE CASTING ROUND, THE STORE'S HALF (spark concept-casting-stages S4). A production's roles, one round per role with
// five character candidates, the operator's pick and the re-cast. The tables are ./schema.ts (migration 2); the job that
// fills a round's new designs and the voices job are packages/producers.
//
// Every pick and re-cast is one transaction and its event (`cast.round`, `cast.picked`, `cast.recast`). A candidate's own
// landing has no event of its own: the job already books every step on the ledger.

import { z } from "zod";

import { blobRefSchema, type BlobRef } from "@gt/domain/blob";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import {
  CAST_CANDIDATE_STATES,
  PRODUCTION_EVENTS,
  ROUND_CHARACTERS,
  characterCardSchema,
  type CastCandidateState,
  type CharacterCard,
  type CharacterId,
  type CharacterRecord,
  type Production,
  type ProductionRole,
  type RoleCast,
} from "@gt/domain/production";

import { createCastCharacterIn, readCharacter, recordCharacterUseIn, saveCharacterIn } from "../characters/store.ts";
import { append } from "../events.ts";
import type { Reader, Tx } from "../store.ts";
import { readProduction } from "./store.ts";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const operatorOnly = (actor: Actor, what: string): void => {
  if (actor.kind !== "operator") throw new AppError("refused", `cast: only the operator ${what} (${actor.kind} ${actor.id} tried)`);
};

function production(r: Reader, id: string): Production {
  const p = readProduction(r, id);
  if (p === undefined) throw new AppError("not-found", `production: no ${id}`);
  return p;
}

function casting(p: Production): void {
  if (p.stage !== "casting") throw new AppError("refused", `cast: ${p.id} is at ${p.stage}; roles and rounds are worked at casting`);
}

const writeRoles = (t: Tx, id: string, roles: readonly ProductionRole[]): void => {
  t.run("UPDATE productions SET roles = ? WHERE id = ?", JSON.stringify(roles), id);
};

const slug = (name: string): string => {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return s === "" ? "role" : s;
};

/** A role id new to `taken`, from the name. */
function roleIdFor(name: string, taken: ReadonlySet<string>): string {
  const base = slug(name);
  for (let i = 1; ; i += 1) {
    const id = i === 1 ? base : `${base}-${i}`;
    if (!taken.has(id)) return id;
  }
}

export type RoleEdit = { readonly id?: string; readonly name: string; readonly brief: string; readonly auditionScript?: string };

const editSchema = z.array(z.object({ id: z.string().min(1).max(60).optional(), name: z.string().trim().min(1).max(60), brief: z.string().trim().min(1).max(2000), auditionScript: z.string().trim().min(1).max(1000).optional() }).strict()).min(1).max(8);

/**
 * The operator's list of roles. A role keeps its id through an edit; a cast role must come through unchanged (re-cast it
 * first). Emits `cast.roles`.
 */
export function saveRolesIn(t: Tx, id: string, edits: readonly RoleEdit[], actor: Actor): Production {
  operatorOnly(actor, "edits the roles");
  const p = production(t, id);
  casting(p);
  const parsed = must(parseAt("roles", editSchema, edits));
  const held = new Map(p.roles.map((r) => [r.id, r] as const));
  const seen = new Set<string>();
  const taken = new Set(p.roles.map((r) => r.id));
  const next: ProductionRole[] = [];
  for (const e of parsed) {
    const before = e.id === undefined ? undefined : held.get(e.id);
    if (e.id !== undefined && before === undefined) throw new AppError("not-found", `cast: ${id} has no role ${e.id}`);
    const roleId = before?.id ?? roleIdFor(e.name, taken);
    taken.add(roleId);
    if (seen.has(roleId)) throw new AppError("refused", `cast: role ${roleId} appears twice`);
    seen.add(roleId);
    if (before?.cast !== undefined && (e.name !== before.name || e.brief !== before.brief)) throw new AppError("refused", `cast: ${before.name} is cast; re-cast the role before changing it`);
    const script = e.auditionScript ?? before?.auditionScript;
    next.push({ id: roleId, name: e.name, brief: e.brief, ...(script === undefined ? {} : { auditionScript: script }), ...(before?.cast === undefined ? {} : { cast: before.cast }) });
  }
  for (const r of p.roles) if (r.cast !== undefined && !seen.has(r.id)) throw new AppError("refused", `cast: ${r.name} is cast; re-cast the role before removing it`);
  writeRoles(t, id, next);
  append(t, { actor, type: PRODUCTION_EVENTS.castRoles, subject: { kind: "production", id }, data: { roles: next.map((r) => r.id), by: "operator" } });
  return production(t, id);
}

/** The text seat's proposal, written only while the production holds no roles: it never overwrites what the operator wrote. Emits `cast.roles`. */
export function proposeRolesIn(t: Tx, id: string, roles: readonly { readonly name: string; readonly brief: string; readonly auditionScript?: string }[], actor: Actor): boolean {
  const p = production(t, id);
  if (p.roles.length > 0 || p.stage !== "casting") return false;
  const taken = new Set<string>();
  const next: ProductionRole[] = roles.map((r) => {
    const roleId = roleIdFor(r.name, taken);
    taken.add(roleId);
    return { id: roleId, name: r.name, brief: r.brief, ...(r.auditionScript === undefined ? {} : { auditionScript: r.auditionScript }) };
  });
  writeRoles(t, id, next);
  append(t, { actor, type: PRODUCTION_EVENTS.castRoles, subject: { kind: "production", id }, data: { roles: next.map((r) => r.id), by: "seat" } });
  return true;
}

/** One role's audition line, from the seat or typed by the operator; a role already cast keeps the line it was cast on. */
export function setAuditionIn(t: Tx, id: string, roleId: string, script: string): boolean {
  const p = production(t, id);
  const role = p.roles.find((r) => r.id === roleId);
  if (role === undefined || role.cast !== undefined) return false;
  writeRoles(t, id, p.roles.map((r) => (r.id === roleId ? { ...r, auditionScript: script } : r)));
  return true;
}

/** The latest job of each casting act (`roles`, `audition:<role>`), so the screen can watch it. */
export function setCastJobIn(t: Tx, id: string, key: string, jobId: string): void {
  t.run("UPDATE productions SET cast_jobs = json_set(cast_jobs, ?, ?) WHERE id = ?", `$."${key}"`, jobId, id);
}

const castJobsSchema = z.record(z.string(), z.string());

export function castJobsOf(r: Reader, id: string): Readonly<Record<string, string>> {
  const row = r.get("SELECT cast_jobs FROM productions WHERE id = ?", id);
  return row === undefined ? {} : (must(parseJsonAt(`production ${id} cast_jobs`, castJobsSchema, String(row["cast_jobs"]))) as Readonly<Record<string, string>>);
}

export type ReusedCandidateInput = { readonly slot: number; readonly characterId: CharacterId; readonly card: CharacterCard; readonly images: readonly string[]; readonly match?: string };

export type OpenRoundInput = {
  readonly productionId: string;
  readonly roleId: string;
  readonly dry: boolean;
  readonly voiceJobId: string;
  readonly drawJobId?: string;
  readonly reused: readonly ReusedCandidateInput[];
};

export const roundIdOf = (roleId: string, n: number): string => `rnd-${roleId}-${n}`;

/** The next round number of a role. */
export function nextRoundN(r: Reader, productionId: string, roleId: string): number {
  return 1 + Number(r.get("SELECT COALESCE(MAX(n), 0) AS n FROM cast_rounds WHERE production_id = ? AND role_id = ?", productionId, roleId)?.["n"] ?? 0);
}

/** A round: its reused candidates and the rest of the five waiting on a design. Emits `cast.round`. */
export function openRoundIn(t: Tx, input: OpenRoundInput, actor: Actor): { readonly roundId: string; readonly n: number } {
  operatorOnly(actor, "opens a casting round");
  const p = production(t, input.productionId);
  casting(p);
  const role = p.roles.find((r) => r.id === input.roleId);
  if (role === undefined) throw new AppError("not-found", `cast: ${input.productionId} has no role ${input.roleId}`);
  if (role.cast !== undefined) throw new AppError("refused", `cast: ${role.name} is already cast; re-cast the role first`);
  if (input.reused.length > ROUND_CHARACTERS) throw new AppError("internal", `cast: ${input.reused.length} reused candidates in a round of ${ROUND_CHARACTERS}`);
  const n = nextRoundN(t, input.productionId, input.roleId);
  const roundId = roundIdOf(input.roleId, n);
  const hasNew = input.reused.length < ROUND_CHARACTERS;
  t.run("INSERT INTO cast_rounds (production_id, id, role_id, n, at, dry, voice_job_id, draw_job_id, draw_attempt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", input.productionId, roundId, input.roleId, n, t.at, input.dry ? 1 : 0, input.voiceJobId, input.drawJobId ?? null, hasNew ? 1 : 0);
  const taken = new Set<number>();
  for (const c of input.reused) {
    taken.add(c.slot);
    t.run("INSERT INTO cast_candidates (production_id, round_id, slot, origin, state, character_id, card, images, match) VALUES (?, ?, ?, 'reused', 'ready', ?, ?, ?, ?)", input.productionId, roundId, c.slot, c.characterId, JSON.stringify(c.card), JSON.stringify(c.images), c.match ?? null);
  }
  for (let slot = 1; slot <= ROUND_CHARACTERS; slot += 1) {
    if (taken.has(slot)) continue;
    t.run("INSERT INTO cast_candidates (production_id, round_id, slot, origin, state) VALUES (?, ?, ?, 'new', 'pending')", input.productionId, roundId, slot);
  }
  append(t, { actor, type: PRODUCTION_EVENTS.castRound, subject: { kind: "production", id: input.productionId }, data: { roundId, roleId: input.roleId, n, reused: input.reused.length, voiceJob: input.voiceJobId, ...(input.drawJobId === undefined ? {} : { drawJob: input.drawJobId }) } });
  return { roundId, n };
}

/** A retry's bookkeeping: the round names its new job and every failed or refused slot waits on it again. */
export function nextDrawAttemptIn(t: Tx, productionId: string, roundId: string, jobId: string): void {
  t.run("UPDATE cast_rounds SET draw_job_id = ?, draw_attempt = draw_attempt + 1 WHERE production_id = ? AND id = ?", jobId, productionId, roundId);
  t.run("UPDATE cast_candidates SET state = 'pending', error = NULL WHERE production_id = ? AND round_id = ? AND state IN ('failed', 'refused')", productionId, roundId);
}

/** A slot's new card, from the seat. */
export function landCardIn(t: Tx, productionId: string, roundId: string, slot: number, card: CharacterCard): void {
  t.run("UPDATE cast_candidates SET card = ? WHERE production_id = ? AND round_id = ? AND slot = ? AND origin = 'new'", JSON.stringify(must(parseAt("card", characterCardSchema, card))), productionId, roundId, slot);
}

export type CandidateLanding = { readonly state: "ready"; readonly images: readonly string[]; readonly blobs: readonly BlobRef[] } | { readonly state: "failed" | "refused"; readonly error: string };

/** A new design's outcome, written by its step. */
export function landCandidateIn(t: Tx, productionId: string, roundId: string, slot: number, landing: CandidateLanding): void {
  if (landing.state === "ready") {
    t.run("UPDATE cast_candidates SET state = 'ready', images = ?, blobs = ?, error = NULL WHERE production_id = ? AND round_id = ? AND slot = ? AND origin = 'new'", JSON.stringify(landing.images), JSON.stringify(landing.blobs), productionId, roundId, slot);
    return;
  }
  t.run("UPDATE cast_candidates SET state = ?, error = ? WHERE production_id = ? AND round_id = ? AND slot = ? AND origin = 'new'", landing.state, landing.error, productionId, roundId, slot);
}

export type StoredCandidate = {
  readonly slot: number;
  readonly origin: "reused" | "new";
  readonly state: CastCandidateState;
  readonly characterId?: CharacterId;
  readonly card?: CharacterCard;
  readonly images: readonly string[];
  readonly blobs: readonly BlobRef[];
  readonly match?: string;
  readonly error?: string;
};

export type StoredRound = {
  readonly id: string;
  readonly productionId: string;
  readonly roleId: string;
  readonly n: number;
  readonly at: string;
  readonly dry: boolean;
  readonly voiceJobId: string;
  readonly drawJobId?: string;
  readonly drawAttempt: number;
  readonly heard: Readonly<Record<string, string>>;
  readonly pickCharacter?: string;
  readonly pickVoice?: string;
  readonly saveToLibrary: boolean;
  readonly pickedAt?: string;
  readonly pickedBy?: string;
  readonly createJobId?: string;
  readonly candidates: readonly StoredCandidate[];
};

const heardSchema = z.record(z.string(), z.string());
const candidateRowSchema = z.object({ slot: z.number().int(), origin: z.enum(["reused", "new"]), state: z.enum(CAST_CANDIDATE_STATES), character_id: z.string().nullable(), card: z.string().nullable(), images: z.string(), blobs: z.string(), match: z.string().nullable(), error: z.string().nullable() });

function candidatesOf(r: Reader, productionId: string, roundId: string): StoredCandidate[] {
  return r.all("SELECT slot, origin, state, character_id, card, images, blobs, match, error FROM cast_candidates WHERE production_id = ? AND round_id = ? ORDER BY slot", productionId, roundId).map((row) => {
    const c = must(parseAt("cast candidate row", candidateRowSchema, row));
    return {
      slot: c.slot,
      origin: c.origin,
      state: c.state,
      ...(c.character_id === null ? {} : { characterId: c.character_id as CharacterId }),
      ...(c.card === null ? {} : { card: must(parseJsonAt("candidate card", characterCardSchema, c.card)) }),
      images: must(parseJsonAt("candidate images", z.array(z.string()), c.images)),
      blobs: must(parseJsonAt("candidate blobs", z.array(blobRefSchema), c.blobs)),
      ...(c.match === null ? {} : { match: c.match }),
      ...(c.error === null ? {} : { error: c.error }),
    };
  });
}

const roundRowSchema = z.object({ id: z.string(), role_id: z.string(), n: z.number().int(), at: z.string(), dry: z.number(), voice_job_id: z.string(), draw_job_id: z.string().nullable(), draw_attempt: z.number().int(), heard: z.string(), pick_character: z.string().nullable(), pick_voice: z.string().nullable(), save_to_library: z.number(), picked_at: z.string().nullable(), picked_by: z.string().nullable(), create_job_id: z.string().nullable() });

const ROUND_COLUMNS = "id, role_id, n, at, dry, voice_job_id, draw_job_id, draw_attempt, heard, pick_character, pick_voice, save_to_library, picked_at, picked_by, create_job_id";

function toRound(r: Reader, productionId: string, row: Readonly<Record<string, unknown>>): StoredRound {
  const h = must(parseAt("cast round row", roundRowSchema, row));
  return {
    id: h.id,
    productionId,
    roleId: h.role_id,
    n: h.n,
    at: h.at,
    dry: h.dry === 1,
    voiceJobId: h.voice_job_id,
    ...(h.draw_job_id === null ? {} : { drawJobId: h.draw_job_id }),
    drawAttempt: h.draw_attempt,
    heard: must(parseJsonAt(`round ${h.id} heard`, heardSchema, h.heard)) as Readonly<Record<string, string>>,
    ...(h.pick_character === null ? {} : { pickCharacter: h.pick_character }),
    ...(h.pick_voice === null ? {} : { pickVoice: h.pick_voice }),
    saveToLibrary: h.save_to_library === 1,
    ...(h.picked_at === null ? {} : { pickedAt: h.picked_at }),
    ...(h.picked_by === null ? {} : { pickedBy: h.picked_by }),
    ...(h.create_job_id === null ? {} : { createJobId: h.create_job_id }),
    candidates: candidatesOf(r, productionId, h.id),
  };
}

export function roundOf(r: Reader, productionId: string, roundId: string): StoredRound | undefined {
  const row = r.get(`SELECT ${ROUND_COLUMNS} FROM cast_rounds WHERE production_id = ? AND id = ?`, productionId, roundId);
  return row === undefined ? undefined : toRound(r, productionId, row);
}

/** A production's rounds, oldest first (per role, the last is the one the screen works). */
export function roundsOf(r: Reader, productionId: string): readonly StoredRound[] {
  return r.all(`SELECT ${ROUND_COLUMNS} FROM cast_rounds WHERE production_id = ? ORDER BY role_id, n`, productionId).map((row) => toRound(r, productionId, row));
}

/** The operator has played a preview to its end. */
export function markHeardIn(t: Tx, productionId: string, roundId: string, voiceId: string, at: string, actor: Actor): void {
  operatorOnly(actor, "marks a preview heard");
  if (roundOf(t, productionId, roundId) === undefined) throw new AppError("not-found", `cast: no round ${roundId} in ${productionId}`);
  t.run("UPDATE cast_rounds SET heard = json_set(heard, ?, ?) WHERE production_id = ? AND id = ?", `$."${voiceId}"`, at, productionId, roundId);
}

export type PickInput = { readonly productionId: string; readonly roundId: string; readonly character: string; readonly voice: string; readonly saveToLibrary: boolean; readonly createJobId: string };

/** The operator's pick, in the pick's own transaction beside the job that creates the voice. The role is cast only when that job lands. */
export function recordPickIn(t: Tx, input: PickInput, actor: Actor): void {
  operatorOnly(actor, "picks a cast");
  const p = production(t, input.productionId);
  casting(p);
  const round = roundOf(t, input.productionId, input.roundId);
  if (round === undefined) throw new AppError("not-found", `cast: no round ${input.roundId} in ${input.productionId}`);
  const role = p.roles.find((r) => r.id === round.roleId);
  if (role === undefined) throw new AppError("not-found", `cast: ${round.roleId} is no longer a role of ${input.productionId}`);
  if (role.cast !== undefined) throw new AppError("refused", `cast: ${role.name} is already cast; re-cast the role to pick again`);
  const c = round.candidates.find((x) => `c-${x.slot}` === input.character);
  if (c === undefined || c.state !== "ready") throw new AppError("refused", `cast: ${input.character} has nothing to pick in this round`);
  t.run("UPDATE cast_rounds SET pick_character = ?, pick_voice = ?, save_to_library = ?, picked_at = ?, picked_by = ?, create_job_id = ? WHERE production_id = ? AND id = ?", input.character, input.voice, input.saveToLibrary ? 1 : 0, t.at, actor.id, input.createJobId, input.productionId, input.roundId);
}

export type CompletedCast = { readonly role: ProductionRole; readonly character: CharacterRecord };

/**
 * The voice exists, so the role is cast: the character (made a record now if it was a new design), its use logged, an
 * optional save to the Library, and `cast.picked`. Idempotent on (round, voice): a re-driven job settles once. A pick
 * that has moved on (the operator picked another voice meanwhile) writes nothing.
 */
export function completeCastIn(t: Tx, input: { readonly productionId: string; readonly roundId: string; readonly voice: string; readonly voiceId: string; readonly dry: boolean }, actor: Actor): CompletedCast | undefined {
  const p = production(t, input.productionId);
  const round = roundOf(t, input.productionId, input.roundId);
  if (round === undefined || round.pickVoice !== input.voice || round.pickCharacter === undefined) return undefined;
  const role = p.roles.find((r) => r.id === round.roleId);
  if (role === undefined) return undefined;
  if (role.cast !== undefined) {
    if (role.cast.roundId !== round.id || role.cast.voiceId !== input.voiceId) return undefined;
    const held = readCharacter(t, role.cast.characterId);
    return held === undefined ? undefined : { role, character: held };
  }
  const c = round.candidates.find((x) => `c-${x.slot}` === round.pickCharacter);
  if (c === undefined || c.card === undefined) throw new AppError("refused", `cast: ${round.pickCharacter} has no card to cast`);
  const who: Actor = { kind: "operator", id: round.pickedBy ?? "operator" };
  let character: CharacterRecord;
  if (c.origin === "new") {
    if (c.card.age === undefined) throw new AppError("refused", `cast: ${c.card.name} has no stated age`);
    character = createCastCharacterIn(t, { card: { ...c.card, age: c.card.age }, images: c.blobs.map((blob) => ({ role: "portrait", blob })), voiceId: input.voiceId, ...(round.saveToLibrary ? { save: true } : {}) }, who);
  } else {
    if (c.characterId === undefined) throw new AppError("internal", "cast: a reused candidate with no character");
    const held = readCharacter(t, c.characterId);
    if (held === undefined) throw new AppError("not-found", `cast: no character ${c.characterId}`);
    character = round.saveToLibrary ? saveCharacterIn(t, c.characterId, who) : held;
  }
  recordCharacterUseIn(t, { id: character.id, productionId: input.productionId }, who);
  const cast: RoleCast = { characterId: character.id, voiceId: input.voiceId, roundId: round.id, pickedAt: t.at, pickedBy: who.id, ...(input.dry ? { dry: true as const } : {}) };
  writeRoles(t, input.productionId, p.roles.map((r) => (r.id === role.id ? { ...r, cast } : r)));
  append(t, { actor, type: PRODUCTION_EVENTS.castPicked, subject: { kind: "production", id: input.productionId }, data: { roundId: round.id, roleId: role.id, characterId: character.id, voiceId: input.voiceId, dry: input.dry } });
  return { role: { ...role, cast }, character };
}

/**
 * Clears a role's cast so it can be cast again: every take rendered at or after the old pick is marked stale, the
 * role's round picks are cleared, and a production past casting moves back. Emits `cast.recast` (and the stage move's).
 */
export function recastRoleIn(t: Tx, id: string, roleId: string, actor: Actor): Production {
  operatorOnly(actor, "re-casts a role");
  const p = production(t, id);
  const role = p.roles.find((r) => r.id === roleId);
  if (role === undefined) throw new AppError("not-found", `cast: ${id} has no role ${roleId}`);
  const { cast, ...open } = role;
  if (cast === undefined) throw new AppError("refused", `cast: ${role.name} has no cast to re-cast`);
  if (p.stage !== "casting" && p.stage !== "audio" && p.stage !== "cutting") throw new AppError("refused", `cast: a role cannot be re-cast at ${p.stage}`);
  const stale = t.all("SELECT id FROM production_takes WHERE production_id = ? AND at >= ? AND stale = 0", id, cast.pickedAt).map((row) => String(row["id"]));
  for (const takeId of stale) t.run("UPDATE production_takes SET stale = 1 WHERE production_id = ? AND id = ?", id, takeId);
  writeRoles(t, id, p.roles.map((r) => (r.id === roleId ? open : r)));
  t.run("UPDATE cast_rounds SET pick_character = NULL, pick_voice = NULL, save_to_library = 0, picked_at = NULL, picked_by = NULL, create_job_id = NULL WHERE production_id = ? AND role_id = ?", id, roleId);
  if (p.stage !== "casting") {
    t.run("UPDATE productions SET stage = 'casting' WHERE id = ?", id);
    append(t, { actor, type: PRODUCTION_EVENTS.staged, subject: { kind: "production", id }, data: { from: p.stage, to: "casting", recast: roleId } });
  }
  append(t, { actor, type: PRODUCTION_EVENTS.castRecast, subject: { kind: "production", id }, data: { roleId, roundId: cast.roundId, staleTakes: stale } });
  return production(t, id);
}
