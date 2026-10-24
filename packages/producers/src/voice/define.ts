import { ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { Producer } from "@gt/kernel/job-core";
import { definePartAct, refuse, unitOf, type ActPlan, type PartActPorts, type UnitPrice } from "../research/partAct.ts";

// THE VOICE PRODUCER (Phase 4 wave C, L37; spoken since 2026-10-24) - an explainer's lines as
// takes, one unit per line. A line is a strip card's caption, or the operator's rewrite of it
// (lib/cut/explainer.ts `linesOf`: `line-<cardId>`, the id the cut and the cut gate key on).
//
// The ENGINE is the part's chosen option: ElevenLabs voice speaks (text-to-speech, one catalog
// voice, priced per character of the line - so each unit carries ITS OWN price, the line's
// characters x the rate, never one figure for every line); local TTS is declared with no engine,
// so a LIVE job on it is refused at its plan step with that sentence, before anything is bought.
// A DRY job runs on either: its stand-in is a silent take of the line's spoken length.

export const VOICE_ACTS = ["record-line"] as const;

export type VoiceLine = { readonly id: string; readonly text: string };
/** `engine`: the wire model that speaks, or null when the chosen option has none. */
export type VoiceView = { readonly lines: readonly VoiceLine[]; readonly engine: string | null; readonly dry: boolean };

export const NO_VOICE_ENGINE = "no speech engine is bound for this option: only ElevenLabs voice speaks in this studio (local TTS is declared with no engine), so this voice part runs dry only";
export const NO_LINES = "record lines needs strip cards with captions to speak";

/** What one line costs: its own characters, priced by the binding (lib/producers/voice.ts). */
export type LinePrice = (line: VoiceLine) => UnitPrice;

export function voicePlan(v: VoiceView, act: string | null, price: LinePrice, target?: string, input: (l: VoiceLine) => Readonly<Record<string, string | number>> = () => ({})): Result<ActPlan> {
  const a = act ?? "record-line";
  if (a !== "record-line") return refuse(`${a} is not an act of a voice part`);
  if (v.engine === null && !v.dry) return refuse(NO_VOICE_ENGINE);
  const lines = target === undefined ? v.lines : v.lines.filter((l) => l.id === target);
  if (lines.length === 0) return refuse(target === undefined ? NO_LINES : `no line ${target}`);
  return ok({ act: a, units: lines.map((l) => unitOf(`line:${l.id}`, price(l), { id: l.id, text: l.text, ...input(l) })) });
}

export const defineVoice = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
