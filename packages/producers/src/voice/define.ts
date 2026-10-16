import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE VOICE PRODUCER (Phase 4 wave C, L37) - an explainer's lines as takes, one unit per line.
// v1 HAD NO VOICE ENGINE: lib/cut/deriveTimeline.ts says "NOTHING RECORDS A VOICE", and the
// router lists ElevenLabs voice with no capability (kernel router/tables.ts). So this producer is
// the act's shape - lines planned from the script, a take per line, booked as a blob - with a
// DRY stand-in (a silent take), and a LIVE job is refused at its plan step with that sentence,
// before anything is claimed as bought. When an engine exists, its call goes in the binding's
// `perform` and nothing here changes.

export const VOICE_ACTS = ["record-line"] as const;

export type VoiceLine = { readonly id: string; readonly text: string };
export type VoiceView = { readonly lines: readonly VoiceLine[]; readonly engine: string | null; readonly dry: boolean };

export const NO_VOICE_ENGINE = "no speech engine exists in this studio yet: ElevenLabs voice is declared with no capability and no local TTS is installed; a voice part runs dry only";

export function voicePlan(v: VoiceView, act: string | null, price: UnitPrice, target?: string): Result<ActPlan> {
  const a = act ?? "record-line";
  if (a !== "record-line") return refuse(`${a} is not an act of a voice part`);
  if (v.engine === null && !v.dry) return refuse(NO_VOICE_ENGINE);
  const lines = target === undefined ? v.lines : v.lines.filter((l) => l.id === target);
  if (lines.length === 0) return refuse(target === undefined ? "record lines needs an adopted script with spoken beats" : `no line ${target}`);
  return ok({ act: a, units: lines.map((l) => unitOf(`line:${l.id}`, price, { id: l.id, text: l.text })) });
}

export const defineVoice = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
