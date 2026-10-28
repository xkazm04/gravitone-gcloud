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
//
// `fx-line` (spark audio-postproduction-research WP3) re-voices one take of one line as a
// character - an echo, a ghost, a broken radio. The operator's words travel first, as the part op
// `voice-fx-ask` (the VOICE record's `fxAsk`), so the act has something to render and the words
// survive a failed render; the act's ONE unit reads that ask, the text router writes the chain,
// the audio sidecar renders it over the source take's bytes, and the result lands as a NEW take
// on the same line (`fxOf` names the source, which is never touched). It is an act of THIS
// producer, not a producer of its own, because a part act's job is the part kind's producer on
// the chosen option's lane and the VOICE record is written through the parts driver for this
// part (packages/producers/src/research/facts.ts `launchPartAct`, kernel parts/driver.ts).

export const VOICE_ACTS = ["record-line", "fx-line"] as const;

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

/* ── fx-line: one ask, one chain, one new take ─────────────────────────────── */

/** What the operator asked for on a line (VOICE `fxAsk[lineId]`). */
export type FxAsk = { readonly from: string; readonly describe: string };
/** A take as the record holds it, with the line whose list names it. */
export type FxSource = { readonly id: string; readonly lineId: string | null; readonly blob?: Readonly<Record<string, unknown>>; readonly engine?: Readonly<Record<string, unknown>> };
export type FxView = { readonly lines: readonly VoiceLine[]; readonly asks: Readonly<Record<string, FxAsk>>; readonly take: (id: string) => FxSource | undefined };

export const FX_NAMES_A_LINE = "voice fx names a line";
/** The render is local and free; the chain's text turn, when a live job asks one, is booked by the
 *  meter with what the router reports (lib/producers/voiceFx.ts). */
export const FX_PRICE: UnitPrice = { seconds: 20, usd: 0 };

/** The act's one unit, `fx:<lineId>:<from>`, or the sentence saying what the line still lacks. */
export function fxPlan(v: FxView, target: string | undefined): Result<ActPlan> {
  if (target === undefined) return refuse(FX_NAMES_A_LINE);
  const line = v.lines.find((l) => l.id === target);
  if (line === undefined) return refuse(`no line ${target}`);
  const ask = v.asks[target];
  if (ask === undefined) return refuse(`no voice fx is asked for ${target}`);
  const src = v.take(ask.from);
  if (src === undefined || src.lineId !== target) return refuse(`take ${ask.from} is not a take of ${target}`);
  if (src.blob === undefined) return refuse(`take ${ask.from} holds no audio to put through a chain`);
  const input = { id: target, from: ask.from, describe: ask.describe, text: line.text, blob: src.blob, ...(src.engine === undefined ? {} : { engine: src.engine }) };
  return ok({ act: "fx-line", units: [unitOf(`fx:${target}:${ask.from}`, FX_PRICE, input)] });
}

export const defineVoice = (lane: ResourceLane, ports: PartActPorts): Producer => definePartAct(lane, ports);
