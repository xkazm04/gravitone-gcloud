// LEONARDO WEB STUDIO — the studio credit pool, reached by driving a signed-in
// Chrome profile over CDP (lib/imaging/studio/). Built by the music-video
// spark's WP1, 2026-10-12.
//
// WHY A PROVIDER AND NOT A SIDE DOOR. The music-video engine needs one still
// from the studio pool because the API key's pool is empty (402 in 2026-10).
// Calling the driver directly would have been shorter and would have skipped
// everything the chokepoint keeps: the budget hold, the call log line, the
// provenance an asset carries for life. So it is a vendor like the others, and
// the router keeps it PREFER-ONLY (router.ts PREFER_ONLY): it serves a request
// that names it and nothing else, never as anybody's fallback.
//
// WHAT IT COSTS, AND IN WHICH UNIT. The studio bills STUDIO CREDITS from a
// prepaid plan, and the honest USD figure for one of them is not a number this
// repo holds — the API adapter's USD_PER_CREDIT prices the API pool, a
// different meter at a different rate. So `costUsd` stays absent and
// `costBasis` reads "unpriced" (pricing.ts carries the row and its reason),
// exactly as agy's plan quota does; the credits themselves ride on the
// provenance as `studio.credits`, read with `studioCreditsOf`. The router's
// meter books its stand-in estimate against the USD window for an unpriced
// call, which over-reads a prepaid pool — erring high, the direction the meter
// is built to err.
//
// NOTHING IS DELETED. Unlike providers/leonardo.ts, which deletes every
// generation it makes, the studio's generations are left in the operator's
// library: the delete path exists in the design (a wire guard that only lets a
// destructive operation through for this run's ids), and WP1 builds none of it.

import { ImagingError, invalidRequest } from "../errors";
import { isConfigured } from "../env";
import { priceCall } from "../pricing";
import { fakeStudioGenerate, fakeStudioHealth } from "../studio/fake";
import { StudioError, type StudioHealth, type StudioRun } from "../studio/types";
import type { Aspect, GenerateRequest, GeneratedImages, ImagingProvider, Provenance } from "../types";

export { FAKE_LEONARDO_STUDIO, resetFakeLeonardoStudio } from "../studio/fake";

/** Same ceiling the API adapter enforces; the studio box is the same model's. */
const MAX_PROMPT_CHARS = 1500;

/** LEONARDO_STUDIO_DRIVER=fake selects the fake (no browser, no spend). */
export const studioDriverIsFake = (): boolean => process.env.LEONARDO_STUDIO_DRIVER?.trim() === "fake";

interface StudioDriver {
  generate(prompt: string, aspect: Aspect): Promise<StudioRun>;
  health(): Promise<StudioHealth>;
}

const FAKE: StudioDriver = { generate: fakeStudioGenerate, health: fakeStudioHealth };

/** The real driver is imported lazily: the router imports this file for every
 *  image call in the app, and only a call that names the studio should load
 *  Playwright to make it. */
const REAL: StudioDriver = {
  generate: async (prompt, aspect) => (await import("../studio/driver")).studioGenerate(prompt, aspect),
  health: async () => (await import("../studio/driver")).studioHealth(),
};

const driver = (): StudioDriver => (studioDriverIsFake() ? FAKE : REAL);

/**
 * Is a signed-in studio with credits reachable? For the music-video snapshot's
 * `driver` field. One sentence in `reason` when not: not configured, browser
 * not running, signed out, or out of credits.
 */
export async function leonardoStudioHealth(): Promise<StudioHealth> {
  if (!isConfigured("leonardo-studio"))
    return { ok: false, reason: "leonardo studio is not configured (LEONARDO_STUDIO_CDP is unset)" };
  try {
    return await driver().health();
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message.split("\n")[0] : String(e) };
  }
}

/** The studio's own receipt, carried on the provenance beside the contract's
 *  fields. Declared here, not in types.ts, until the contract grows a unit-aware
 *  cost field (WP1's report proposes one). */
export interface StudioProvenance extends Provenance {
  studio: { credits?: number; balance?: number };
}

/** Studio credits a served generation spent, or undefined (not a studio
 *  result, or the answer carried no cost). */
export function studioCreditsOf(p: Provenance): number | undefined {
  return (p as Partial<StudioProvenance>).studio?.credits;
}

/** A driver failure as the imaging contract's error. The message is the
 *  driver's sentence, verbatim. `dispatched` follows `spent`: once the page's
 *  Generate went out the studio may have billed, and the meter must book it. */
function toImagingError(e: unknown): ImagingError {
  if (e instanceof ImagingError) return e;
  const message = e instanceof Error ? e.message : String(e);
  if (!(e instanceof StudioError)) return new ImagingError(message, "failed", "leonardo-studio");
  const kind =
    e.kind === "refused" ? "refused" : e.kind === "timeout" ? "timeout" : e.kind === "unreachable" || e.kind === "signed-out" ? "no-key" : "failed";
  const err = new ImagingError(message, kind, "leonardo-studio");
  err.dispatched = e.spent;
  return err;
}

export function leonardoStudioProvider(): ImagingProvider {
  return {
    id: "leonardo-studio",
    capabilities: ["generate"],
    // The studio's image box takes no style reference this driver fills.
    supportsReferences: false,
    // The driver types one prompt box; a negative prompt is carried as a
    // sentence inside it rather than through a studio field nobody has read.
    negativePromptChannel: "prose",

    async generate(req: GenerateRequest): Promise<GeneratedImages> {
      const started = Date.now();
      // One image per call: one click, one receipt, one id to account for.
      if ((req.count ?? 1) !== 1)
        throw invalidRequest("leonardo-studio", "The Leonardo studio makes one image per request; ask for count 1.");
      const prompt = req.negativePrompt?.trim() ? `${req.prompt.trim()}\n\nAvoid: ${req.negativePrompt.trim()}` : req.prompt;
      if (prompt.length > MAX_PROMPT_CHARS)
        throw invalidRequest(
          "leonardo-studio",
          `The prompt is ${prompt.length} characters; Leonardo accepts ${MAX_PROMPT_CHARS}. Shorten it or the negative prompt.`,
        );

      let run: StudioRun;
      try {
        run = await driver().generate(prompt, req.aspect);
      } catch (e) {
        throw toImagingError(e);
      }

      const price = priceCall({ provider: "leonardo-studio", model: run.model, images: 1 });
      const provenance: StudioProvenance = {
        provider: "leonardo-studio",
        model: run.model,
        // The model the driver's URL named and its model control confirmed
        // (studio/selectors.ts STUDIO.model). Our intent, not the vendor's echo.
        modelBasis: "requested",
        remoteIds: [run.generationId],
        costUsd: price.usd,
        costBasis: price.basis,
        durationMs: Date.now() - started,
        // No `cleanup`: the generation is left in the operator's studio on
        // purpose (header), and none of the field's three values says that.
        studio: {
          ...(run.credits !== undefined ? { credits: run.credits } : {}),
          ...(run.balance !== undefined ? { balance: run.balance } : {}),
        },
      };
      return { images: [run.image], provenance };
    },
  };
}
