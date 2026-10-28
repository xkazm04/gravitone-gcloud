import { z } from "zod";

// A VOICE-FX CHAIN - what a narration take is put through to become a character (an echo, a
// ghost, a broken radio, a giant). The LLM writes one from a description; the audio sidecar
// (pipeline/audio/sidecar.py) renders it with pedalboard. This schema is the whole contract
// between the two, so every stage is closed (no unknown keys) and every parameter is bounded:
// a number the model invents past a bound is refused at the door with its path, never clamped,
// because a silently clamped chain renders something nobody asked for.
//
// The stage set is what pedalboard ships plus one the sidecar writes in numpy (ringmod, the
// robot voice): nothing here names a plugin binary, so a chain renders on any box that has the
// sidecar's requirements. Order is signal order.

export const FX_CHAIN_VERSION = 1;
export const FX_STAGES_MAX = 8;

const num = (min: number, max: number) => z.number().min(min).max(max);

export const fxStageSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("gain"), db: num(-24, 12) }),
  z.strictObject({ kind: z.literal("highpass"), hz: num(20, 2000) }),
  z.strictObject({ kind: z.literal("lowpass"), hz: num(500, 20000) }),
  z.strictObject({ kind: z.literal("pitch"), semitones: num(-12, 12) }),
  z.strictObject({ kind: z.literal("delay"), delayS: num(0.02, 2), feedback: num(0, 0.9), mix: num(0, 1) }),
  z.strictObject({ kind: z.literal("reverb"), roomSize: num(0, 1), damping: num(0, 1), wet: num(0, 1), dry: num(0, 1), width: num(0, 1) }),
  z.strictObject({ kind: z.literal("chorus"), rateHz: num(0.05, 10), depth: num(0, 1), mix: num(0, 1) }),
  z.strictObject({ kind: z.literal("phaser"), rateHz: num(0.05, 10), depth: num(0, 1), mix: num(0, 1) }),
  z.strictObject({ kind: z.literal("distortion"), driveDb: num(0, 40) }),
  z.strictObject({ kind: z.literal("bitcrush"), bitDepth: num(2, 16) }),
  z.strictObject({ kind: z.literal("compressor"), thresholdDb: num(-60, 0), ratio: num(1, 20) }),
  z.strictObject({ kind: z.literal("gsm") }),
  z.strictObject({ kind: z.literal("ringmod"), hz: num(10, 2000), mix: num(0, 1) }),
]);

export const fxChainSchema = z.strictObject({
  v: z.literal(FX_CHAIN_VERSION),
  stages: z.array(fxStageSchema).min(1).max(FX_STAGES_MAX),
});

export type FxStage = z.output<typeof fxStageSchema>;
export type FxStageKind = FxStage["kind"];
export type FxChain = z.output<typeof fxChainSchema>;
