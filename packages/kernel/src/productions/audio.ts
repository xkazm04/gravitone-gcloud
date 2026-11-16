// A PRODUCTION'S AUDIO DECISION, ITS VOICE PROOF AND ITS CUTS (spark concept-casting-stages S5). The tables are
// ./schema.ts (migration 3); `Production.audio` and `Production.cut` are read back by ./store.ts.
//
// Every write is one transaction with one ledger event carrying its actor (`production.audio`, `production.cut`,
// `production.voice-proof`). The ref-audio route is shut until `recordVoiceProofIn` stores a held proof: the route the
// screen offers and the route the door accepts are the same reading, `refusalOfVoiceRoute`.

import { z } from "zod";

import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { MUSIC_ROUTES, PRODUCTION_EVENTS, SOUND_ROUTES, VOICE_PROOF_OUTCOMES, VOICE_ROUTES, voiceProofSchema, type CutFormat, type Production, type ProductionAudio, type ProductionCut, type VoiceProof, type VoiceProofOutcome, type VoiceRoute } from "@gt/domain/production";

import { append } from "../events.ts";
import type { Reader, Tx } from "../store.ts";
import { latestCut, readCut, readProduction, stageMove } from "./store.ts";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const mustHave = (r: Reader, id: string): Production => {
  const p = readProduction(r, id);
  if (p === undefined) throw new AppError("not-found", `production: no ${id}`);
  return p;
};

const operatorOnly = (actor: Actor, what: string): void => {
  if (actor.kind !== "operator") throw new AppError("refused", `production: only the operator ${what} (${actor.kind} ${actor.id} tried)`);
};

/* ── The voice proof ──────────────────────────────────────────────────────── */

export function voiceProofOf(r: Reader): VoiceProof | undefined {
  const row = r.get("SELECT outcome, note, evidence, at, by_id FROM production_voice_proof WHERE id = 1");
  if (row === undefined) return undefined;
  return must(parseAt("voice proof", voiceProofSchema, { outcome: row["outcome"], ...(row["note"] === null ? {} : { note: row["note"] }), ...(row["evidence"] === null ? {} : { evidence: row["evidence"] }), at: row["at"], by: row["by_id"] }));
}

const proofInput = z.object({ outcome: z.enum(VOICE_PROOF_OUTCOMES), note: z.string().trim().min(1).optional(), evidence: z.string().trim().min(1).optional() }).strict();

/**
 * The result of the banked ref-audios proof, stored once a person has judged it. `held` opens the ref-audio route; `failed`
 * keeps the route at dub and says why. Operator only; a later judgement replaces this one, and both stay on the ledger.
 */
export function recordVoiceProofIn(t: Tx, input: { readonly outcome: VoiceProofOutcome; readonly note?: string; readonly evidence?: string }, actor: Actor): VoiceProof {
  operatorOnly(actor, "records the voice proof");
  const v = must(parseAt("voice proof", proofInput, input));
  t.run("INSERT INTO production_voice_proof (id, outcome, note, evidence, at, by_id) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET outcome = excluded.outcome, note = excluded.note, evidence = excluded.evidence, at = excluded.at, by_id = excluded.by_id", v.outcome, v.note ?? null, v.evidence ?? null, t.at, actor.id);
  append(t, { actor, type: PRODUCTION_EVENTS.voiceProof, subject: { kind: "production", id: "voice-proof" }, data: { outcome: v.outcome, ...(v.note === undefined ? {} : { note: v.note }) } });
  const stored = voiceProofOf(t);
  if (stored === undefined) throw new AppError("internal", "production: the voice proof did not land");
  return stored;
}

/** Why this dialogue route is shut. Only ref-audio can be, and only until a held proof is stored. */
export function refusalOfVoiceRoute(route: VoiceRoute, proof: VoiceProof | undefined): string | undefined {
  if (route !== "ref-audio" || proof?.outcome === "held") return undefined;
  return proof === undefined ? "production: ref-audio is off: its GPU proof has not been run, so the dialogue route is dub" : `production: ref-audio is off: the proof did not hold (${proof.note ?? proof.outcome}), so the dialogue route is dub`;
}

/** The route a production's dialogue runs on now: `ref-audio` once a proof held, else `dub`. */
export const productionVoiceRouteOf = (r: Reader): "ref-audio" | "dub" => (voiceProofOf(r)?.outcome === "held" ? "ref-audio" : "dub");

/* ── The decision ─────────────────────────────────────────────────────────── */

const audioInput = z.object({ voice: z.enum(VOICE_ROUTES), music: z.enum(MUSIC_ROUTES), sound: z.enum(SOUND_ROUTES).optional(), musicRef: z.string().trim().min(1).optional(), note: z.string().trim().min(1).optional() }).strict();

export type AudioInput = { readonly voice: VoiceRoute; readonly music: ProductionAudio["music"]; readonly sound?: NonNullable<ProductionAudio["sound"]>; readonly musicRef?: string; readonly note?: string };

/**
 * The operator's audio decision: dialogue route, music and its source, the picture's own sound. Only at `audio`, only the
 * operator, and ref-audio is refused until the proof holds. A decision made twice replaces the first. Emits `production.audio`.
 */
export function decideAudioIn(t: Tx, id: string, input: AudioInput, actor: Actor): Production {
  operatorOnly(actor, "decides the audio");
  const v = must(parseAt("audio decision", audioInput, input));
  const p = mustHave(t, id);
  if (p.stage !== "audio") throw new AppError("refused", `production: ${id} is at ${p.stage}; the audio decision is made at audio`);
  const shut = refusalOfVoiceRoute(v.voice, voiceProofOf(t));
  if (shut !== undefined) throw new AppError("refused", shut);
  if (v.music !== "none" && v.musicRef === undefined) throw new AppError("refused", `production: a ${v.music} needs its source reference`);
  const audio: ProductionAudio = { voice: v.voice, music: v.music, ...(v.sound === undefined ? {} : { sound: v.sound }), ...(v.music === "none" || v.musicRef === undefined ? {} : { musicRef: v.musicRef }), ...(v.note === undefined ? {} : { note: v.note }), decidedAt: t.at, decidedBy: actor.id };
  t.run("UPDATE productions SET audio = ? WHERE id = ?", JSON.stringify(audio), id);
  append(t, { actor, type: PRODUCTION_EVENTS.audio, subject: { kind: "production", id }, data: { voice: audio.voice, music: audio.music, ...(audio.musicRef === undefined ? {} : { musicRef: audio.musicRef }) } });
  return mustHave(t, id);
}

/* ── The cut ──────────────────────────────────────────────────────────────── */

export type NewCut = { readonly format: CutFormat; readonly takes: readonly string[]; readonly receipt: string; readonly jobId: string; readonly dry: boolean };

const OPEN_CUT_STATES: ReadonlySet<ProductionCut["state"]> = new Set(["assembling", "on-board"]);

/** Why a new cut may not be launched; undefined when it may. */
export function refusalOfCut(p: Production): string | undefined {
  if (p.stage !== "cutting") return `production: a final cut is launched at cutting, not ${p.stage}`;
  if (p.audio === undefined) return "production: the audio decision comes before the final cut";
  if (p.cut !== undefined && OPEN_CUT_STATES.has(p.cut.state)) return `production: ${p.cut.id} is ${p.cut.state === "assembling" ? "still assembling" : "on the Board"}; it is judged before the next`;
  return undefined;
}

/** The next cut's id. */
export const nextCutId = (r: Reader, id: string): string => `cut-${1 + Number((r.get("SELECT COALESCE(MAX(n), 0) AS n FROM production_cuts WHERE production_id = ?", id) ?? { n: 0 })["n"])}`;

/** Opens a cut, assembling, beside its job. Emits `production.cut`. */
export function openCutIn(t: Tx, id: string, cut: NewCut, actor: Actor): ProductionCut {
  const p = mustHave(t, id);
  const why = refusalOfCut(p);
  if (why !== undefined) throw new AppError("refused", why);
  const cutId = nextCutId(t, id);
  const n = Number(cutId.slice("cut-".length));
  t.run("INSERT INTO production_cuts (production_id, id, n, format, state, takes, receipt, job_id, dry, at) VALUES (?, ?, ?, ?, 'assembling', ?, ?, ?, ?, ?)", id, cutId, n, cut.format, JSON.stringify(cut.takes), cut.receipt, cut.jobId, cut.dry ? 1 : 0, t.at);
  append(t, { actor, type: PRODUCTION_EVENTS.cut, subject: { kind: "production", id }, data: { cut: cutId, state: "assembling", format: cut.format, jobId: cut.jobId, dry: cut.dry } });
  const out = readCut(t, id, cutId);
  if (out === undefined) throw new AppError("internal", `production: ${cutId} did not land on ${id}`);
  return out;
}

export type CutOutcome =
  | { readonly state: "on-board"; readonly video: string; readonly packetId: string; readonly durationS: number; readonly note?: string }
  | { readonly state: "rehearsed"; readonly durationS: number; readonly note?: string }
  | { readonly state: "failed"; readonly error: string };

/** A cut's outcome, once; settling one that has moved on is a no-op (a re-driven job settles again). Emits `production.cut`. */
export function landCutIn(t: Tx, id: string, cutId: string, o: CutOutcome, actor: Actor): ProductionCut {
  const cut = readCut(t, id, cutId);
  if (cut === undefined) throw new AppError("not-found", `production: ${id} has no ${cutId}`);
  if (cut.state !== "assembling") return cut;
  if (o.state === "on-board") t.run("UPDATE production_cuts SET state = 'on-board', video = ?, packet_id = ?, duration_s = ?, note = ? WHERE production_id = ? AND id = ?", o.video, o.packetId, o.durationS, o.note ?? null, id, cutId);
  else if (o.state === "rehearsed") t.run("UPDATE production_cuts SET state = 'rehearsed', duration_s = ?, note = ? WHERE production_id = ? AND id = ?", o.durationS, o.note ?? null, id, cutId);
  else t.run("UPDATE production_cuts SET state = 'failed', error = ? WHERE production_id = ? AND id = ?", o.error, id, cutId);
  append(t, { actor, type: PRODUCTION_EVENTS.cut, subject: { kind: "production", id }, data: { cut: cutId, state: o.state, ...(o.state === "on-board" ? { packetId: o.packetId } : {}), ...(o.state === "failed" ? { error: o.error } : {}) } });
  const done = readCut(t, id, cutId);
  if (done === undefined) throw new AppError("internal", `production: ${cutId} vanished from ${id}`);
  return done;
}

/**
 * The Board's verdict on a cut (only an operator's, only on an on-board cut at `cutting`). Approved walks the production to
 * `done`; returned leaves it at `cutting` so the operator can launch another or go back to audio. A second delivery of the
 * same verdict is a no-op; the other verdict is refused. Emits `production.cut` and, on approval, `production.staged`.
 */
export function judgeCutIn(t: Tx, id: string, cutId: string, verdict: "approved" | "returned", actor: Actor, note?: string): Production {
  operatorOnly(actor, "judges a final cut");
  const p = mustHave(t, id);
  const cut = readCut(t, id, cutId);
  if (cut === undefined) throw new AppError("not-found", `production: ${id} has no ${cutId}`);
  if (cut.state === verdict) return p;
  if (cut.state !== "on-board") throw new AppError("refused", `production: ${cutId} is ${cut.state}; it is not waiting on the Board`);
  if (p.stage !== "cutting") throw new AppError("refused", `production: ${id} moved to ${p.stage} while ${cutId} waited on the Board; this verdict would land on another cut`);
  t.run("UPDATE production_cuts SET state = ?, judged_at = ?, judged_by = ?, note = COALESCE(?, note) WHERE production_id = ? AND id = ?", verdict, t.at, actor.id, note ?? null, id, cutId);
  append(t, { actor, type: PRODUCTION_EVENTS.cut, subject: { kind: "production", id }, data: { cut: cutId, state: verdict, ...(note === undefined ? {} : { note }) } });
  if (verdict === "approved") stageMove(t, id, p.stage, "done", actor);
  return mustHave(t, id);
}

export { latestCut };
