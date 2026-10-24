import { readFile } from "node:fs/promises";
import path from "node:path";

import { fxChainSchema, fxStageSchema, FX_CHAIN_VERSION, FX_STAGES_MAX, type FxChain } from "@gt/domain/audio.fx";
import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";

import { reason as routerReason } from "@/lib/text/router";
import type { TextProvenance, TextRequest, TextResult, TurnClass } from "@/lib/text/types";

// VOICE FX PROPOSE - the operator's words for a character voice in, ONE effect chain out
// (spark audio-postproduction-research WP3). Server-only: one lib/text turn per call, built the
// way lib/sound/suno/propose.ts builds its own - the prompt read per call from a file in
// pipeline/ (VOICE-FX-PROMPT.md, a prompt is code), the turn labelled with its own class
// (`voice-fx`, lib/text/types.ts), a JSON schema handed to the router so a vendor that can
// enforce it does.
//
// WHAT THE MODEL MAY DECIDE: the stages and their numbers. What it may not: a kind the schema
// does not list, a key a stage does not take, a number past its bound, more than eight stages.
// The answer passes ONE door - @gt/domain/audio.fx `fxChainSchema` through `parseAt` - and a
// refusal there is the turn's answer: the door's sentence with the path of the first bad field
// ("voice-fx: stages.1.semitones: Too big: expected number to be <=12"). It is never repaired
// and never clamped: a clamped chain renders something nobody asked for, and a refused one
// tells the operator (and the prompt's regression) exactly what the model got wrong.
//
// PRICE AND PROVENANCE are the router's: the result carries its `TextProvenance` (provider, model,
// rung, cost or the reason there is none), and the binding books it through the step's meter
// (lib/producers/research.ts `meteredText`). A DRY job never calls this.

export type ReasonFn = (req: TextRequest) => Promise<TextResult>;

export const VOICE_FX_TURN: TurnClass = "voice-fx";
export const PROMPT_FILE = path.join("pipeline", "VOICE-FX-PROMPT.md");
/** The door's name, which every refusal's sentence starts with. */
export const FX_DOOR = "voice-fx";
export const DESCRIBE_MAX = 400;

/** The stage kinds, read off the schema - the one list the prompt and its regression are held to. */
export const FX_KINDS: readonly string[] = fxStageSchema.options.map((o) => o.shape.kind.value);
/** Every parameter any stage takes, read off the schema. */
const PARAMS: readonly string[] = [...new Set(fxStageSchema.options.flatMap((o) => Object.keys(o.shape).filter((k) => k !== "kind")))];

/**
 * The schema the router is handed. It names every key a stage may carry so a vendor that
 * enforces it natively keeps the numbers (a property it was not shown would be dropped), and it
 * is deliberately loose about WHICH keys go with which kind - that rule, and every bound, is the
 * door's: the router's own check is shallow (lib/text/json.ts), the door is not.
 */
export const FX_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["v", "stages"],
  properties: {
    v: { type: "integer", enum: [FX_CHAIN_VERSION] },
    stages: {
      type: "array",
      minItems: 1,
      maxItems: FX_STAGES_MAX,
      items: { type: "object", required: ["kind"], properties: { kind: { type: "string", enum: [...FX_KINDS] }, ...Object.fromEntries(PARAMS.map((p) => [p, { type: "number" }])) } },
    },
  },
};

/** The prompt file as it is sent: its comments stripped. */
export const stripComments = (md: string): string => md.replace(/<!--[\s\S]*?-->/g, "").trim();

export async function promptText(at: string = path.join(process.cwd(), PROMPT_FILE)): Promise<Result<string>> {
  try {
    return ok(stripComments(await readFile(at, "utf8")));
  } catch {
    return err("unavailable", `the prompt file ${path.relative(process.cwd(), at)} is missing - it is part of the code`);
  }
}

/** The whole prompt for one description. Pure, so a probe reads what would be sent. */
export function fxPrompt(template: string, describe: string): string {
  return template.replace("{{DESCRIBE}}", describe.trim());
}

/** A model's answer through the door: the chain, or the door's sentence with its path. */
export function chainOf(answer: unknown): Result<FxChain> {
  const r = parseAt(FX_DOOR, fxChainSchema, answer);
  return r.ok ? ok(r.value as FxChain) : r;
}

export type Proposed = { readonly chain: FxChain; readonly provenance: TextProvenance };

/**
 * One chain for one description: a `voice-fx` turn, its answer held to the schema. A failure is a
 * Result in the work's words - the description refused, the prompt file missing, the door's
 * sentence - and a router that could not answer at all throws its own `TextError` (the binding's
 * `textFailure` classes it for the breaker: a vendor that may answer next time retries).
 */
export async function proposeChain(describe: string, reason: ReasonFn = routerReason): Promise<Result<Proposed>> {
  const words = describe.trim();
  if (words === "") return err("invalid", "a voice fx needs a description");
  if (words.length > DESCRIBE_MAX) return err("invalid", `a voice fx description is at most ${DESCRIBE_MAX} characters (this one is ${words.length})`);
  const template = await promptText();
  if (!template.ok) return template;
  const out = await reason({ turn: VOICE_FX_TURN, prompt: fxPrompt(template.value, words), schema: FX_SCHEMA });
  const chain = chainOf(out.json);
  return chain.ok ? ok({ chain: chain.value, provenance: out.provenance }) : chain;
}
