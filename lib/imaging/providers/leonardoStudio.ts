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
// EVERY GENERATION IS DELETED ONCE ITS STILL IS HELD. The operator's rule
// (2026-10-23): "after downloading image from Leonardo always delete afterwards
// to keep it clean". The browser is not needed for it: MEASURED the same day,
// the API's REST `DELETE /api/rest/v1/generations/{id}` with the
// LEONARDO_API_KEY bearer deletes a generation the STUDIO made (GET 200 present
// -> DELETE 200 `{"delete_generations_by_pk":{"id":...}}` -> GET 200
// `{"generations_by_pk":null}`). So the delete is providers/leonardo.ts's, the
// same shape - two attempts, 20 s, in a `finally` that never throws, the key
// never logged - and only ever for the id this call's own run returned. A
// delete that fails (no key on this box, the vendor's error) leaves the image
// returned, `cleanup: "failed"` on the provenance and one scrubbed log line
// naming the id, so the generation can be chased by hand. The fake driver
// records its deletes on FAKE_LEONARDO_STUDIO and never reaches the network.
//
// A REFUSED OR FAILED GENERATION IS DELETED TOO (spark scout-muse). Once the
// page's `Generate` named the generation, a failure after it (the studio's
// safety refusal, a failed render, a timeout, a lost download) carries that id
// on the StudioError, and the same never-throwing delete runs before the error
// is mapped: a still the studio refused to show is not left in the operator's
// library either. A failure before the id was named has nothing to delete.

import { errorMessage } from "@gt/domain/errors";
import { ImagingError, invalidRequest } from "../errors";
import { isConfigured } from "../env";
import { requestJson } from "../http";
import { logCleanupFailure } from "../log";
import { priceCall } from "../pricing";
import { fakeStudioDelete, fakeStudioGenerate, fakeStudioHealth } from "../studio/fake";
import { withStudioLock } from "../studio/lock";
import { STUDIO_MAX_PROMPT_CHARS } from "../studio/still";
import { StudioError, type StudioHealth, type StudioRun } from "../studio/types";
import type { Aspect, GenerateRequest, GeneratedImages, ImagingProvider, Provenance } from "../types";

export { FAKE_LEONARDO_STUDIO, resetFakeLeonardoStudio } from "../studio/fake";

/** Same ceiling the API adapter enforces; the studio box is the same model's (studio/still.ts fits a
 *  scout still to it before the call, so this refusal is the last word, not the usual one). */
const MAX_PROMPT_CHARS = STUDIO_MAX_PROMPT_CHARS;

/** LEONARDO_STUDIO_DRIVER=fake selects the fake (no browser, no spend). */
export const studioDriverIsFake = (): boolean => process.env.LEONARDO_STUDIO_DRIVER?.trim() === "fake";

export interface StudioDriver {
  /** `quality` absent: the studio's default (selectors.ts imageUrl). */
  generate(prompt: string, aspect: Aspect, quality?: "low" | "medium"): Promise<StudioRun>;
  health(): Promise<StudioHealth>;
  /** Delete one generation from the operator's library; throws on any failure. */
  remove(generationId: string): Promise<void>;
}

const FAKE: StudioDriver = { generate: fakeStudioGenerate, health: fakeStudioHealth, remove: fakeStudioDelete };

const API = "https://cloud.leonardo.ai/api/rest/v1";

/** The real delete: the API's REST door with the API key, no browser
 *  (header). Throws the reason when it cannot run or the vendor refuses. */
export async function deleteStudioGeneration(generationId: string): Promise<void> {
  const key = process.env.LEONARDO_API_KEY?.trim();
  if (!key) throw new Error("LEONARDO_API_KEY is unset; the generation stays in the studio library");
  await requestJson("leonardo-studio", `${API}/generations/${encodeURIComponent(generationId)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${key}` },
    attempts: 2,
    timeoutMs: 20_000,
  });
}

/** The real driver is imported lazily: the router imports this file for every
 *  image call in the app, and only a call that names the studio should load
 *  Playwright to make it. A generate holds the studio lock (studio/lock.ts):
 *  one tab at a time across every process on this box. */
const REAL: StudioDriver = {
  generate: (prompt, aspect, quality) => withStudioLock(async () => (await import("../studio/driver")).studioGenerate(prompt, aspect, quality)),
  health: async () => (await import("../studio/driver")).studioHealth(),
  remove: deleteStudioGeneration,
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

/** Remove a generation whose still is held, or that failed after it was named.
 *  Never throws: a tidy-up failure is a log line, not an outcome. */
export async function cleanupStudioGeneration(generationId: string, d: StudioDriver = driver()): Promise<"deleted" | "failed"> {
  try {
    await d.remove(generationId);
    return "deleted";
  } catch (e) {
    logCleanupFailure("leonardo-studio", generationId, e);
    return "failed";
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
  const message = errorMessage(e);
  if (!(e instanceof StudioError)) return new ImagingError(message, "failed", "leonardo-studio");
  const kind =
    e.kind === "refused" ? "refused" : e.kind === "timeout" ? "timeout" : e.kind === "unreachable" || e.kind === "signed-out" ? "no-key" : "failed";
  const err = new ImagingError(message, kind, "leonardo-studio");
  err.dispatched = e.spent;
  return err;
}

/** `o.driver` is the test seam: a driver whose failures a probe scripts (absent: the fake or the real one, per call). */
export function leonardoStudioProvider(o: { readonly driver?: StudioDriver } = {}): ImagingProvider {
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

      const d = o.driver ?? driver();
      let run: StudioRun;
      try {
        run = await d.generate(prompt, req.aspect, req.quality);
      } catch (e) {
        if (e instanceof StudioError && e.generationId !== undefined) await cleanupStudioGeneration(e.generationId, d);
        throw toImagingError(e);
      }

      // From here the still is held, so every exit goes through the delete.
      let price: ReturnType<typeof priceCall>;
      let cleanup: "deleted" | "failed" = "failed";
      try {
        price = priceCall({ provider: "leonardo-studio", model: run.model, images: 1 });
      } finally {
        cleanup = await cleanupStudioGeneration(run.generationId, d);
      }
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
        cleanup,
        studio: {
          ...(run.credits !== undefined ? { credits: run.credits } : {}),
          ...(run.balance !== undefined ? { balance: run.balance } : {}),
        },
      };
      return { images: [run.image], provenance };
    },
  };
}
