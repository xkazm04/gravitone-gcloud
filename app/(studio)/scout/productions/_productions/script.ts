// What the operator did on the scripted page, held in memory: pure, client-safe (the stage table comes from
// @gt/domain/production.machine, never the zod door). Nothing here writes anywhere; a reload starts the story again.

import type { MusicRoute, ProductionStage, VoiceRoute } from "@gt/domain/production.machine";
import { productionMachine, refusalOfMove } from "@gt/domain/production.machine";

import type { ProductionEntry } from "../_port/contract.ts";

export type RoundPicks = { readonly character?: string; readonly voice?: string };
export type LessonEdit = { readonly text: string; readonly accepted: boolean };
export type AudioPick = { readonly voice: VoiceRoute; readonly music: MusicRoute };

export type ScriptState = {
  readonly started: Readonly<Record<string, true>>;
  readonly stage: Readonly<Record<string, ProductionStage>>;
  readonly proven: Readonly<Record<string, string>>;
  readonly heard: Readonly<Record<string, true>>;
  readonly picks: Readonly<Record<string, RoundPicks>>;
  readonly locked: Readonly<Record<string, true>>;
  readonly saved: Readonly<Record<string, boolean>>;
  readonly lessons: Readonly<Record<string, LessonEdit>>;
  readonly venture: Readonly<Record<string, string>>;
  readonly audio: Readonly<Record<string, AudioPick>>;
  /** The latest move a door refused, in its own sentence; absent when the last act went through. */
  readonly refusal?: string;
};

export const initialScript: ScriptState = { started: {}, stage: {}, proven: {}, heard: {}, picks: {}, locked: {}, saved: {}, lessons: {}, venture: {}, audio: {} };

export type ScriptAct =
  | { readonly type: "start"; readonly id: string }
  | { readonly type: "move"; readonly id: string; readonly from: ProductionStage; readonly to: ProductionStage }
  | { readonly type: "proven"; readonly id: string; readonly from: ProductionStage; readonly takeId: string }
  | { readonly type: "hear"; readonly voice: string }
  | { readonly type: "pick"; readonly round: string; readonly field: "character" | "voice"; readonly candidate: string }
  | { readonly type: "lock"; readonly round: string }
  | { readonly type: "save"; readonly round: string; readonly on: boolean }
  | { readonly type: "lesson"; readonly id: string; readonly edit: LessonEdit }
  | { readonly type: "venture"; readonly id: string; readonly name: string }
  | { readonly type: "audio"; readonly id: string; readonly audio: AudioPick }
  | { readonly type: "clear-refusal" };

const withoutRefusal = (s: ScriptState): ScriptState => {
  if (s.refusal === undefined) return s;
  const { refusal: _gone, ...rest } = s;
  return rest;
};

export function scriptReducer(s0: ScriptState, a: ScriptAct): ScriptState {
  const s = withoutRefusal(s0);
  switch (a.type) {
    case "start":
      return { ...s, started: { ...s.started, [a.id]: true } };
    case "move": {
      const refusal = refusalOfMove(a.from, a.to, "operator");
      return refusal !== undefined ? { ...s, refusal } : { ...s, stage: { ...s.stage, [a.id]: a.to } };
    }
    case "proven": {
      const refusal = refusalOfMove(a.from, "proven", "operator");
      return refusal !== undefined ? { ...s, refusal } : { ...s, stage: { ...s.stage, [a.id]: "proven" }, proven: { ...s.proven, [a.id]: a.takeId } };
    }
    case "hear":
      return { ...s, heard: { ...s.heard, [a.voice]: true } };
    case "pick":
      return { ...s, picks: { ...s.picks, [a.round]: { ...s.picks[a.round], [a.field]: a.candidate } } };
    case "lock":
      return { ...s, locked: { ...s.locked, [a.round]: true } };
    case "save":
      return { ...s, saved: { ...s.saved, [a.round]: a.on } };
    case "lesson":
      return { ...s, lessons: { ...s.lessons, [a.id]: a.edit } };
    case "venture":
      return { ...s, venture: { ...s.venture, [a.id]: a.name } };
    case "audio":
      return { ...s, audio: { ...s.audio, [a.id]: a.audio } };
    case "clear-refusal":
      return s;
  }
}

export const isKept = (e: ProductionEntry, s: ScriptState): boolean => e.keptOnly && s.started[e.production.id] !== true;
export const stageOf = (e: ProductionEntry, s: ScriptState): ProductionStage => s.stage[e.production.id] ?? e.production.stage;

export const STAGE_ORDER: readonly ProductionStage[] = productionMachine.states.filter((x) => x !== "dropped");
export const reached = (stage: ProductionStage, at: ProductionStage): boolean => stage !== "dropped" && STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(at);

export type Dispatch = (a: ScriptAct) => void;
