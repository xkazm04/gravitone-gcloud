import { createHash } from "node:crypto";

import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { LANE_CAPACITY, type ResourceLane } from "@gt/domain/lane";
import type { ModelOption, Receipt, ReceiptMode } from "@gt/domain/produce";
import { ROUND_CHARACTERS, voicePickRefusal, type CastJob, type CastRound, type CharacterCandidate, type CharacterId, type Production, type ProductionId, type VoiceCandidate } from "@gt/domain/production";
import { armLive, DRY } from "@gt/kernel/dryrun";
import { append } from "@gt/kernel/events";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get, loadJob, loadOutputs, retry } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import { matchCards } from "@gt/kernel/characters/match";
import { characterUses, readCharacter, savedCharacters } from "@gt/kernel/characters/store";
import { castJobsOf, completeCastIn, markHeardIn, nextDrawAttemptIn, nextRoundN, openRoundIn, recastRoleIn, recordPickIn, roundIdOf, roundOf, roundsOf, saveRolesIn, setAuditionIn, setCastJobIn, type RoleEdit, type StoredCandidate, type StoredRound } from "@gt/kernel/productions/cast";
import { readProduction } from "@gt/kernel/productions/store";
import { readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store, Tx } from "@gt/kernel/store";
import { CAST_REQUEST, defineProductionCast, parseCastRequest, PRODUCTION_CAST, type CastRequest } from "@gt/producers/production-cast/define";
import { CREATE_STEP } from "@gt/producers/production-voices/define";
import { TEXT_SEAT } from "@gt/producers/research/facts";

import { CODEX_MODEL } from "../imaging/local/codex.ts";
import { kernel } from "../kernelProcess.ts";
import { AUDITION_MAX, auditionRefusal } from "../music/voiceDesign.ts";
import { MODEL } from "../model.ts";
import { effectsFor } from "./extract.ts";
import { castActs, type CastEngines } from "./productionCastActs.ts";
import { enqueueVoiceRoundIn, pickVoice, voiceRoundLine, voiceRoundJobId, voiceRoundOf, type VoicePickAsk, type VoiceRoundAsk } from "./productionVoices.ts";
import { CODEX_SEAT } from "./scoutStillOption.ts";

// THE CASTING ROUND, BOUND (spark concept-casting-stages S4): the launches over the record (@gt/kernel/productions/cast),
// the words and new faces job (packages/producers/src/production-cast/define.ts, its acts ./productionCastActs.ts), and the
// voices job (./productionVoices.ts). A round's two jobs are enqueued in one transaction on one confirmed receipt.
//
// THE PICK: operator only. It is a press, not a launch: the vendor voice (the slot spent only here) is the one spend, and it
// runs on the create job S3 built. The role is cast when that job lands (`completeCastIn`, called from the voices producer's
// settle), so a failed voice creation leaves the role open and the operator retries it.

export const PRODUCTION_CAST_LANE: ResourceLane = "seat.text";
const TURN_SECONDS = 60;
const DRAW_SECONDS = 120;

/** Text scores below this are a passing word or two, not a fit (a word's weight times its rarity: a rare hit in `look` scores about 10). */
export const USABLE_MATCH_SCORE = 8;

const processStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

function seatOption(): ModelOption {
  return { key: `production-cast/claude-seat/${MODEL}`, lane: PRODUCTION_CAST_LANE, provider: "claude-seat", model: MODEL, label: "text turn · seat", secondsPerUnit: TURN_SECONDS, usdPerUnit: null, unpricedReason: TEXT_SEAT, src: "illustrative", basis: { seconds: { src: "illustrative", note: "a short text turn, not yet measured" }, usd: { src: "real", note: TEXT_SEAT } } };
}

function drawOption(): ModelOption {
  return { key: `production-cast/codex/${CODEX_MODEL}`, lane: PRODUCTION_CAST_LANE, provider: "codex", model: CODEX_MODEL, label: "casting portrait · 1:1 · codex", secondsPerUnit: DRAW_SECONDS, usdPerUnit: 0, src: "illustrative", basis: { seconds: { src: "illustrative", note: "one Codex image turn, not yet measured" }, usd: { src: "real", note: CODEX_SEAT } } };
}

const ESTIMATES = {
  turn: { seconds: TURN_SECONDS, usd: null, unpricedReason: TEXT_SEAT },
  draw: { seconds: DRAW_SECONDS, usd: 0 },
} as const;

const digest = (s: string): string => createHash("sha256").update(s).digest("hex").slice(0, 12);

export type CastLaunchInput = { readonly mode: ReceiptMode; readonly by: string; readonly actor: Actor; readonly dryOnly: boolean; readonly token?: string; readonly now?: number };
export type CastLaunch = { readonly kind: "receipt"; readonly receipt: Receipt } | { readonly kind: "stale"; readonly fresh: Receipt } | { readonly kind: "launched"; readonly jobId: string; readonly receipt: Receipt };

type Plan = { readonly lines: readonly PlanLine[]; readonly lane: "article" | "image" | "audio"; readonly apply: (t: Tx, mode: Job["mode"]) => string };
type RequestBody = CastRequest extends infer R ? (R extends unknown ? Omit<R, "by"> : never) : never;

function launch(store: Store, input: CastLaunchInput, plan: (r: Reader) => Result<Plan>): Result<CastLaunch> {
  const now = input.now ?? Date.now();
  const receiptOf = (r: Reader, p: Plan): Receipt => receiptFor({ subject: { kind: "run", lane: p.lane }, lines: [...p.lines], plan: [...p.lines], queue: readQueue(r), capacity: LANE_CAPACITY, now, mode: input.mode });
  const first = store.read((r) => {
    const p = plan(r);
    return p.ok ? ok(receiptOf(r, p.value)) : p;
  });
  if (!first.ok) return first;
  if (!first.value.ok) return first.value;
  if (input.token === undefined) return ok({ kind: "receipt", receipt: first.value.value });
  const token = input.token;
  const out = store.tx((t): Result<CastLaunch> => {
    const p = plan(t);
    if (!p.ok) return p;
    const receipt = receiptOf(t, p.value);
    if (receipt.token !== token) return ok({ kind: "stale", fresh: receipt });
    const mode = input.mode === "dry" ? ok(DRY) : armLive(input.actor, t.at, `cast receipt ${token.slice(0, 12)} confirmed`, { dryOnly: input.dryOnly });
    if (!mode.ok) return mode;
    return ok({ kind: "launched", jobId: p.value.apply(t, mode.value), receipt });
  });
  if (!out.ok) return out;
  return out.value;
}

const operatorOnly = (actor: Actor, what: string): Result<void> => (actor.kind === "operator" ? ok(undefined) : err("refused", `cast: only the operator ${what} (${actor.kind} ${actor.id} tried)`));

function latestJobState(r: Reader, id: string | undefined): Job["state"] | undefined {
  if (id === undefined) return undefined;
  try {
    return loadJob(r, id).job.state;
  } catch {
    return undefined;
  }
}

const inFlight = (s: Job["state"] | undefined): boolean => s === "queued" || s === "running";

const jobId = (prefix: string, productionId: string, key: string): string => `job:${prefix}:${productionId}:${key}`;

function enqueueCast(t: Tx, input: CastLaunchInput, productionId: string, id: string, mode: Job["mode"], request: RequestBody): void {
  enqueueIn(t, { id, of: { kind: "run", id: `production:${productionId}/cast` }, producer: PRODUCTION_CAST, lane: PRODUCTION_CAST_LANE, mode }, input.actor);
  append(t, { actor: input.actor, type: CAST_REQUEST, subject: { kind: "job", id }, data: { ...request, by: input.by } });
}

/** The concept's words for a seat turn: the outline's beats when the board has them. */
const beatsOf = (p: Production): readonly string[] => p.board.panels.map((x) => x.beat);

/** The seat proposes a concept's roles. Refused once it has roles, or outside casting. */
export function requestRoles(store: Store, id: ProductionId, input: CastLaunchInput): Result<CastLaunch> {
  return launch(store, input, (r) => {
    const p = readProduction(r, id);
    if (p === undefined) return err("not-found", `production: no ${id}`);
    if (p.stage !== "casting") return err("refused", `cast: ${id} is at ${p.stage}; roles are proposed at casting`);
    if (p.roles.length > 0) return err("refused", `cast: ${id} already has roles; edit them instead`);
    const n = Object.keys(castJobsOf(r, id)).filter((k) => k.startsWith("roles")).length + 1;
    const key = `roles:${id}@${digest(p.board.logline)}`;
    const line: PlanLine = { key, label: "roles · the concept's cast", lane: PRODUCTION_CAST_LANE, units: 1, option: seatOption(), after: [], order: 0, status: "pending" };
    return ok({
      lines: [line],
      lane: "article",
      apply: (t, mode) => {
        const job = jobId(PRODUCTION_CAST, id, `roles-${n}`);
        enqueueCast(t, input, id, job, mode, { act: "roles", productionId: id, logline: p.board.logline, beats: [...beatsOf(p)], estimates: ESTIMATES });
        setCastJobIn(t, id, "roles", job);
        return job;
      },
    });
  });
}

/** The seat writes one role's audition line. Refused for a cast role. */
export function requestAudition(store: Store, id: ProductionId, roleId: string, input: CastLaunchInput): Result<CastLaunch> {
  return launch(store, input, (r) => {
    const p = readProduction(r, id);
    if (p === undefined) return err("not-found", `production: no ${id}`);
    const role = p.roles.find((x) => x.id === roleId);
    if (role === undefined) return err("not-found", `cast: ${id} has no role ${roleId}`);
    if (role.cast !== undefined) return err("refused", `cast: ${role.name} is cast; re-cast the role to change its line`);
    const n = Object.keys(castJobsOf(r, id)).filter((k) => k.startsWith(`audition:${roleId}`)).length + 1;
    const line: PlanLine = { key: `audition:${id}/${roleId}@${digest(role.brief)}`, label: `audition line · ${role.name}`, lane: PRODUCTION_CAST_LANE, units: 1, option: seatOption(), after: [], order: 0, status: "pending" };
    return ok({
      lines: [line],
      lane: "article",
      apply: (t, mode) => {
        const job = jobId(PRODUCTION_CAST, id, `audition-${roleId}-${n}`);
        enqueueCast(t, input, id, job, mode, { act: "audition", productionId: id, roleId, role: role.name, brief: role.brief, logline: p.board.logline, estimates: ESTIMATES });
        setCastJobIn(t, id, `audition:${roleId}`, job);
        return job;
      },
    });
  });
}

/** Who a character may be cast for here: a kids' or family character is never cast into this adult work. */
const reusable = (r: Reader) => savedCharacters(r).filter((c) => c.audience === undefined || c.audience === "adult");

/** The usable matches for a role, as a round's reused candidates. */
function reusedFor(r: Reader, roleName: string, brief: string) {
  const matches = matchCards(reusable(r), `${roleName} ${brief}`, ROUND_CHARACTERS).filter((m) => m.score >= USABLE_MATCH_SCORE);
  return matches.map((m, i) => ({ slot: i + 1, characterId: m.character.id, card: m.character.card, images: m.character.images, match: m.why.join("; ") }));
}

/** A round for one role: 5 candidates (usable matches, then new designs) and 5 voices, on one receipt, in one transaction. */
export function requestRound(store: Store, id: ProductionId, roleId: string, input: CastLaunchInput): Result<CastLaunch> {
  return launch(store, input, (r) => {
    const p = readProduction(r, id);
    if (p === undefined) return err("not-found", `production: no ${id}`);
    if (p.stage !== "casting") return err("refused", `cast: ${id} is at ${p.stage}; a round opens at casting`);
    const role = p.roles.find((x) => x.id === roleId);
    if (role === undefined) return err("not-found", `cast: ${id} has no role ${roleId}`);
    if (role.cast !== undefined) return err("refused", `cast: ${role.name} is cast; re-cast the role for another round`);
    if (role.auditionScript === undefined) return err("refused", `cast: ${role.name} has no audition line yet; write one first`);
    const prior = roundsOf(r, id).filter((x) => x.roleId === roleId).at(-1);
    if (prior !== undefined && (inFlight(latestJobState(r, prior.voiceJobId)) || inFlight(latestJobState(r, prior.drawJobId)))) return err("refused", `cast: ${role.name}'s round is still running`);
    const refused = auditionRefusal(role.auditionScript);
    if (refused !== undefined) return err("refused", refused);
    const reused = reusedFor(r, role.name, role.brief);
    const newSlots = Array.from({ length: ROUND_CHARACTERS }, (_, i) => i + 1).filter((s) => !reused.some((c) => c.slot === s));
    const n = nextRoundN(r, id, roleId);
    const roundId = roundIdOf(roleId, n);
    const voiceJob = voiceRoundJobId(id, roleId, roundId);
    const drawJob = newSlots.length === 0 ? undefined : jobId(PRODUCTION_CAST, id, `${roundId}-draw-1`);
    const ask: VoiceRoundAsk = { productionId: id, roleId, roundId, brief: role.brief, script: role.auditionScript, mode: input.mode, by: input.by, actor: input.actor, dryOnly: input.dryOnly };
    const voiceLine = voiceRoundLine(ask);
    const key = digest(`${role.brief}\n${role.auditionScript}\n${reused.map((c) => c.characterId).join(",")}`);
    const lines: PlanLine[] = [];
    if (newSlots.length > 0) lines.push({ key: `cast:${id}/${roundId}@${key}/draw`, label: `new designs · ${newSlots.length}`, lane: PRODUCTION_CAST_LANE, units: newSlots.length, option: drawOption(), after: [], order: 0, status: "pending" });
    lines.push(voiceLine);
    return ok({
      lines,
      lane: "audio",
      apply: (t, mode) => {
        openRoundIn(t, { productionId: id, roleId, dry: input.mode === "dry", voiceJobId: voiceJob, ...(drawJob === undefined ? {} : { drawJobId: drawJob }), reused }, input.actor);
        enqueueVoiceRoundIn(t, ask, mode);
        if (drawJob !== undefined) enqueueCast(t, input, id, drawJob, mode, { act: "round", productionId: id, roundId, roleId, role: role.name, brief: role.brief, logline: p.board.logline, cardSlots: newSlots, drawSlots: newSlots, refs: p.board.panels.slice(0, 2).map((x) => x.still), estimates: ESTIMATES });
        return drawJob ?? voiceJob;
      },
    });
  });
}

/** A retry of a round's failed and refused designs: a new job, and only those slots. Landed work is never drawn again. */
export function retryDesigns(store: Store, id: ProductionId, roundId: string, input: CastLaunchInput): Result<CastLaunch> {
  return launch(store, input, (r) => {
    const p = readProduction(r, id);
    if (p === undefined) return err("not-found", `production: no ${id}`);
    const round = roundOf(r, id, roundId);
    if (round === undefined) return err("not-found", `cast: no round ${roundId} in ${id}`);
    const role = p.roles.find((x) => x.id === round.roleId);
    if (role === undefined) return err("not-found", `cast: ${round.roleId} is no longer a role of ${id}`);
    if (role.cast !== undefined) return err("refused", `cast: ${role.name} is cast; re-cast the role before drawing again`);
    if (inFlight(latestJobState(r, round.drawJobId))) return err("refused", `cast: ${role.name}'s new designs are still running`);
    const missing = round.candidates.filter((c) => c.state === "failed" || c.state === "refused");
    if (missing.length === 0) return err("refused", `cast: ${roundId} has nothing to draw again`);
    const attempt = round.drawAttempt + 1;
    const job = jobId(PRODUCTION_CAST, id, `${roundId}-draw-${attempt}`);
    const drawSlots = missing.map((c) => c.slot);
    const cardSlots = missing.filter((c) => c.card === undefined).map((c) => c.slot);
    const key = `cast:${id}/${roundId}@attempt-${attempt}-${drawSlots.join(".")}`;
    const lines: PlanLine[] = [{ key: `${key}/draw`, label: `retry · ${missing.length} design${missing.length === 1 ? "" : "s"}`, lane: PRODUCTION_CAST_LANE, units: drawSlots.length, option: drawOption(), after: [], order: 0, status: "pending" }];
    return ok({
      lines,
      lane: "image",
      apply: (t, mode) => {
        nextDrawAttemptIn(t, id, roundId, job);
        enqueueCast(t, input, id, job, mode, { act: "round", productionId: id, roundId, roleId: role.id, role: role.name, brief: role.brief, logline: p.board.logline, cardSlots, drawSlots, refs: p.board.panels.slice(0, 2).map((x) => x.still), estimates: ESTIMATES });
        return job;
      },
    });
  });
}

/* ── The operator's acts that are not launches ────────────────────────────── */

export function saveRoles(store: Store, id: ProductionId, roles: readonly RoleEdit[], who: Actor): Result<Production> {
  for (const r of roles) {
    if (r.auditionScript === undefined) continue;
    const refused = auditionRefusal(r.auditionScript);
    if (refused !== undefined) return err("refused", `${r.name}: ${refused}`);
    if (r.auditionScript.length > AUDITION_MAX) return err("refused", `${r.name}: an audition line is at most ${AUDITION_MAX} characters`);
  }
  return store.tx((t) => saveRolesIn(t, id, roles, who));
}

export function typedAudition(store: Store, id: ProductionId, roleId: string, script: string, who: Actor): Result<void> {
  const can = operatorOnly(who, "writes an audition line");
  if (!can.ok) return can;
  const refused = auditionRefusal(script.trim());
  if (refused !== undefined) return err("refused", refused);
  return store.tx((t) => {
    setAuditionIn(t, id, roleId, script.trim());
  });
}

export function markHeard(store: Store, id: ProductionId, roundId: string, voiceId: string, at: string, who: Actor): Result<void> {
  return store.tx((t) => markHeardIn(t, id, roundId, voiceId, at, who));
}

export type PickCastInput = { readonly id: ProductionId; readonly roundId: string; readonly character: string; readonly voice: string; readonly saveToLibrary: boolean; readonly by: string; readonly actor: Actor; readonly dryOnly: boolean };

/** The operator's pick: the character and voice of one round. Only the operator; only a preview that played through. */
export function pickCast(store: Store, input: PickCastInput): Result<{ readonly createJobId: string }> {
  const can = operatorOnly(input.actor, "picks a cast");
  if (!can.ok) return can;
  const read = store.read((r) => {
    const p = readProduction(r, input.id);
    const round = roundOf(r, input.id, input.roundId);
    const role = p?.roles.find((x) => x.id === round?.roleId);
    return { p, round, role };
  });
  if (!read.ok) return read;
  const { p, round, role } = read.value;
  if (p === undefined) return err("not-found", `production: no ${input.id}`);
  if (round === undefined || role === undefined) return err("not-found", `cast: no round ${input.roundId} in ${input.id}`);
  if (p.stage !== "casting") return err("refused", `cast: ${input.id} is at ${p.stage}; casts are picked at casting`);
  if (role.cast !== undefined) return err("refused", `cast: ${role.name} is already cast; re-cast the role to pick again`);
  const c = round.candidates.find((x) => `c-${x.slot}` === input.character);
  if (c === undefined || c.state !== "ready" || c.images.length === 0) return err("refused", `cast: ${input.character} has nothing to pick in this round`);
  const heardAt = round.heard[input.voice];
  const unheard = voicePickRefusal(heardAt === undefined ? {} : { heardAt });
  if (unheard !== undefined) return err("refused", unheard);
  const createJobId = `${round.voiceJobId}:create-${input.voice}`;
  const held = jobHeld(store, createJobId);
  if (held?.state === "queued" || held?.state === "running") return err("refused", `cast: ${input.voice} is still being created`);
  const ask: VoicePickAsk = { roundJobId: round.voiceJobId, candidateId: input.voice, name: `${role.name} (cast)`, ...(heardAt === undefined ? {} : { heardAt }), by: input.by, actor: input.actor, mode: round.dry ? "dry" : "live", dryOnly: input.dryOnly };
  const record = (t: Tx): void => recordPickIn(t, { productionId: input.id, roundId: input.roundId, character: input.character, voice: input.voice, saveToLibrary: input.saveToLibrary, createJobId }, input.actor);
  if (held?.state === "done") {
    // The voice already exists (a pick made again after a re-cast): the slot is not spent twice.
    const r = store.tx((t) => {
      record(t);
      finishFromCreate(t, input.id, input.roundId, input.voice, createJobId);
    });
    return r.ok ? ok({ createJobId }) : r;
  }
  if (held?.state === "failed" || held?.state === "interrupted") {
    const r = store.tx(record);
    if (!r.ok) return r;
    const parsed = parseAt("job id", jobIdSchema, createJobId);
    if (!parsed.ok) return parsed;
    const again = retry(store, parsed.value, input.actor);
    return again.ok ? ok({ createJobId }) : again;
  }
  const picked = pickVoice(store, ask, record);
  return picked.ok ? ok({ createJobId: picked.value.jobId }) : picked;
}

function jobHeld(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) return undefined;
  const r = get(store, parsed.value);
  return r.ok ? r.value.job : undefined;
}

/** A pick whose voice already exists (made again after a re-cast): the role is cast now, on the voice already paid for. */
function finishFromCreate(t: Tx, id: ProductionId, roundId: string, voice: string, createJob: string): void {
  const out = loadOutputs(t, createJob).get(CREATE_STEP)?.value;
  if (out === undefined || typeof out["voiceId"] !== "string") return;
  completeCastIn(t, { productionId: id, roundId, voice, voiceId: out["voiceId"], dry: out["dry"] === true }, { kind: "operator", id: "recast" });
}

export function recastRole(store: Store, id: ProductionId, roleId: string, who: Actor): Result<Production> {
  return store.tx((t) => recastRoleIn(t, id, roleId, who));
}

const retryJob = (store: Store, jobIdValue: string, who: Actor): Result<void> => {
  const parsed = parseAt("job id", jobIdSchema, jobIdValue);
  if (!parsed.ok) return parsed;
  const r = retry(store, parsed.value, who);
  return r.ok ? ok(undefined) : r;
};

export function retryVoices(store: Store, id: ProductionId, roundId: string, who: Actor): Result<void> {
  const round = store.read((r) => roundOf(r, id, roundId));
  if (!round.ok) return round;
  if (round.value === undefined) return err("not-found", `cast: no round ${roundId} in ${id}`);
  return retryJob(store, round.value.voiceJobId, who);
}

export function retryVoiceCreate(store: Store, id: ProductionId, roundId: string, who: Actor): Result<void> {
  const round = store.read((r) => roundOf(r, id, roundId));
  if (!round.ok) return round;
  if (round.value?.createJobId === undefined) return err("not-found", `cast: ${roundId} has no pick waiting on a voice`);
  return retryJob(store, round.value.createJobId, who);
}

/* ── Reading a round for the screen ───────────────────────────────────────── */

function jobView(store: Store, id: string | undefined): CastJob | undefined {
  if (id === undefined) return undefined;
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) return undefined;
  const r = get(store, parsed.value);
  if (!r.ok) return undefined;
  const j = r.value.job;
  return { id, state: j.state, done: j.progress.done, total: j.progress.total, ...(j.progress.stage === undefined ? {} : { step: j.progress.stage }), ...(j.error === undefined ? {} : { error: j.error.message }) };
}

function usedBeforeOf(r: Reader, characterId: CharacterId): Extract<CharacterCandidate, { readonly origin: "reused" }>["usedBefore"] {
  const uses = characterUses(r, characterId);
  if (uses.length > 0) return [...uses];
  const c = readCharacter(r, characterId);
  // The contract asks for a line; the absence of a use is written as what it is.
  return [{ label: "in the library, not cast in a production yet", at: c?.createdAt ?? "unknown" }];
}

function candidateView(r: Reader, c: StoredCandidate): CharacterCandidate {
  const id = `c-${c.slot}`;
  if (c.origin === "reused" && c.characterId !== undefined && c.card !== undefined) {
    return { id, origin: "reused", characterId: c.characterId, card: c.card, images: [...c.images], usedBefore: usedBeforeOf(r, c.characterId), ...(c.match === undefined ? {} : { match: c.match }) };
  }
  const card = c.card ?? { name: "new design", look: "not designed yet", personality: "waiting on its card" };
  return { id, origin: "new", card, images: [...c.images], state: c.state, ...(c.error === undefined ? {} : { error: c.error }) };
}

function voicesView(store: Store, round: StoredRound, brief: string): { readonly voices: VoiceCandidate[]; readonly creditsUsed: number; readonly creditsRead: CastRound["creditsRead"]; readonly unreadCalls?: number } {
  const blank = (i: number): VoiceCandidate => ({ id: `voice-${i}`, label: `Voice ${i}`, design: brief });
  const voices: VoiceCandidate[] = Array.from({ length: 5 }, (_, i) => blank(i + 1));
  const live = voiceRoundOf(store, round.voiceJobId);
  let creditsUsed = 0;
  let creditsRead: CastRound["creditsRead"] = "unread";
  let unreadCalls: number | undefined;
  if (live.ok) {
    creditsUsed = live.value.creditsUsed;
    creditsRead = live.value.creditsRead;
    unreadCalls = live.value.unreadCalls;
    for (const v of live.value.voices) {
      const i = Number(v.id.split("-")[1]) - 1;
      if (i >= 0 && i < voices.length) voices[i] = v;
    }
  }
  const out = voices.map((v) => {
    const heardAt = round.heard[v.id];
    return heardAt === undefined ? v : { ...v, heardAt };
  });
  return { voices: out, creditsUsed, creditsRead, ...(unreadCalls === undefined ? {} : { unreadCalls }) };
}

/** One stored round as the screen reads it: 5 characters, 5 voices, credits as the API read them, the jobs behind it. */
export function castRoundView(store: Store, p: Production, round: StoredRound): Result<CastRound> {
  const brief = p.roles.find((r) => r.id === round.roleId)?.brief ?? round.roleId;
  const characters = store.read((r) => round.candidates.map((c) => candidateView(r, c)));
  if (!characters.ok) return characters;
  const voice = voicesView(store, round, brief);
  const role = p.roles.find((r) => r.id === round.roleId);
  const created = role?.cast?.roundId === round.id && round.pickVoice !== undefined ? voice.voices.map((v) => (v.id === round.pickVoice ? { ...v, createdVoiceId: role.cast?.voiceId ?? "" } : v)) : voice.voices;
  const drawJob = jobView(store, round.drawJobId);
  const voiceJob = jobView(store, round.voiceJobId);
  const createJob = role?.cast === undefined ? jobView(store, round.createJobId) : undefined;
  return ok({
    id: round.id,
    productionId: p.id,
    roleId: round.roleId,
    at: round.at,
    characters: characters.value,
    voices: created,
    picks: { ...(round.pickCharacter === undefined ? {} : { character: round.pickCharacter }), ...(round.pickVoice === undefined ? {} : { voice: round.pickVoice }) },
    creditsUsed: voice.creditsUsed,
    creditsRead: voice.creditsRead,
    ...(round.saveToLibrary ? { saveToLibrary: true as const } : {}),
    ...(round.dry ? { dry: true as const } : {}),
    ...(voice.unreadCalls === undefined ? {} : { unreadCalls: voice.unreadCalls }),
    ...(drawJob === undefined ? {} : { drawJob }),
    ...(voiceJob === undefined ? {} : { voiceJob }),
    ...(createJob === undefined ? {} : { createJob }),
  });
}

export function castJobsView(store: Store, id: ProductionId): Readonly<Record<string, CastJob>> {
  const jobs = store.read((r) => castJobsOf(r, id));
  if (!jobs.ok) return {};
  const out: Record<string, CastJob> = {};
  for (const [k, v] of Object.entries(jobs.value)) {
    const j = jobView(store, v);
    if (j !== undefined) out[k] = j;
  }
  return out;
}

/* ── The binding ──────────────────────────────────────────────────────────── */

export function castRequestOf(store: Store, id: string): Result<CastRequest> {
  const page = queryEvents(store, { type: [CAST_REQUEST], subject: { kind: "job", id }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${id} carries no cast request`) : parseCastRequest(e.data);
}

export function productionCastProducer(o: { readonly store?: () => Result<Store>; readonly engines?: CastEngines } = {}): Producer {
  const store = o.store ?? processStore;
  return defineProductionCast(PRODUCTION_CAST_LANE, {
    request: (job) => {
      const s = store();
      return s.ok ? castRequestOf(s.value, job.id) : s;
    },
    ...castActs(store, o.engines ?? {}),
  });
}

/** Drive one casting job on this process (a test, the dry walk): the worker's rules. */
export function driveCast(store: Store, location: string, jobIdValue: string, o: { readonly dryOnly?: boolean; readonly engines?: CastEngines } = {}): Promise<Result<RunReport>> {
  const producer = productionCastProducer({ store: () => ok(store), ...(o.engines === undefined ? {} : { engines: o.engines }) });
  return runJob(effectsFor(store, location), producer, jobIdValue, { dryOnly: o.dryOnly ?? false });
}

