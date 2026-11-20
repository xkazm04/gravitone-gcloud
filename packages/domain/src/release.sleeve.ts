import { z } from "zod";

import { parseAt, type Parsed } from "./door.ts";
import { err, ok, type Result } from "./errors.ts";
import { estimateSchema } from "./estimate.ts";
import type { JobState } from "./job.machine.ts";
import { RELEASE_ID_RE } from "./release.record.ts";

// A RELEASE'S SLEEVE TAKES (spark studio-to-release WP3): N square pictures of the release's sleeve prompt, drawn by
// the `release-sleeve` producer (packages/producers/src/release-sleeve/define.ts) through the imaging router at 1:1,
// each take a blob offered back to the sleeve step as a candidate with its MEASURED pixel size and colour. The pick
// is the operator's (the wizard's `sleeve` edit); the producer never writes the release.
//
// Two providers, by the operator's choice on the step: Codex on the operator's ChatGPT seat ($0, the default) and
// Leonardo Flare (GPT Image 2.5, billed per image through the API key). A priced provider is a receipt first and the
// operator's confirm; under GRAVITONE_DRY_ONLY=1 it is refused outright (`sleeveCheck`), since the run it prices can
// never be armed live there. Codex under dry-only runs dry: the kernel answers each take with a stand-in.
//
// The ask is the Server Action's door (app/(studio)/audio/_release/sleeveActs.ts); the request is the event the launch
// writes beside the enqueue (`release-sleeve.requested`, subject the job), so the drive reads exactly what the receipt
// priced. The view types are zod-free in effect: a client imports them as types only.

export const SLEEVE_PROVIDERS = ["codex", "leonardo"] as const;
export type SleeveProvider = (typeof SLEEVE_PROVIDERS)[number];
/** The providers a run of takes is billed for in dollars: a receipt and a confirm first. */
export const PRICED_SLEEVE_PROVIDERS: readonly SleeveProvider[] = ["leonardo"];

export const SLEEVE_TAKES_DEFAULT = 4;
export const SLEEVE_TAKES_MAX = 8;
export const SLEEVE_PROMPT_MAX = 2000;

const releaseId = z.string().regex(RELEASE_ID_RE);

/** What the sleeve step sends: the prompt as the operator sees it, the provider, how many takes. */
export const sleeveAskSchema = z.strictObject({
  releaseId,
  prompt: z.string().max(SLEEVE_PROMPT_MAX),
  provider: z.enum(SLEEVE_PROVIDERS),
  takes: z.number().int(),
});
export type SleeveAsk = Parsed<z.output<typeof sleeveAskSchema>>;

/** The ask a run may be launched from, or the refusal in words. Pure. */
export function sleeveCheck(ask: SleeveAsk, o: { readonly dryOnly: boolean }): Result<SleeveAsk> {
  const prompt = ask.prompt.trim();
  if (prompt === "") return err("invalid", "sleeve takes need a prompt");
  if (ask.takes < 1 || ask.takes > SLEEVE_TAKES_MAX) return err("invalid", `sleeve takes are 1 to ${SLEEVE_TAKES_MAX}, not ${ask.takes}`);
  if (o.dryOnly && PRICED_SLEEVE_PROVIDERS.includes(ask.provider)) return err("refused", `${ask.provider} is billed per image: GRAVITONE_DRY_ONLY=1 refuses a priced run`, { detail: "dry-only" });
  return ok({ ...ask, prompt });
}

/** The launch's record of the run: the ask as checked, one take's estimate, and who confirmed it. */
export const sleeveRequestSchema = z.strictObject({
  releaseId,
  prompt: z.string().trim().min(1).max(SLEEVE_PROMPT_MAX),
  provider: z.enum(SLEEVE_PROVIDERS),
  takes: z.number().int().min(1).max(SLEEVE_TAKES_MAX),
  estimates: z.strictObject({ take: estimateSchema }),
  by: z.string().min(1).max(200),
});
export type SleeveRequest = Parsed<z.output<typeof sleeveRequestSchema>>;

export const parseSleeveRequest = (raw: unknown): Result<SleeveRequest> => parseAt("sleeve request", sleeveRequestSchema, raw);

/* ── What the step reads back ─────────────────────────────────────────────── */

/** One drawn take: its served address and what was measured on its bytes. */
export interface SleeveCandidate {
  readonly n: number;
  readonly href: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rgb: boolean;
  readonly provider: string;
  readonly model: string;
  /** True for a dry job's stand-in pixel. */
  readonly dry: boolean;
}

/** A take the provider refused or that could not be measured, in its own words. */
export interface SleeveMiss {
  readonly n: number;
  readonly reason: string;
}

export interface SleeveTakesView {
  /** null on the fixture side, where nothing is launched. */
  readonly jobId: string | null;
  readonly state: JobState;
  readonly takes: number;
  readonly candidates: readonly SleeveCandidate[];
  readonly misses: readonly SleeveMiss[];
  /** The job's own sentence when it failed, else null. */
  readonly error: string | null;
}

/** What one press answers: a priced run's receipt to confirm, a receipt gone stale, or the run. */
export type SleeveLaunchAnswer =
  | { readonly kind: "receipt"; readonly token: string; readonly usd: number | null; readonly seconds: number; readonly takes: number }
  | { readonly kind: "stale"; readonly token: string; readonly usd: number | null; readonly seconds: number; readonly takes: number }
  | { readonly kind: "launched"; readonly view: SleeveTakesView };
