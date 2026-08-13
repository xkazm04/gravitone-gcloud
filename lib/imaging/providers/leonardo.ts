// LEONARDO — the dev-environment generator.
//
// Chosen for development because the credits are already bought and the model
// range is wide enough to pick a fit. Lucid Origin is the standing choice on
// quality-per-credit.
//
// Every constant below is taken from a WORKING client in the reference repo
// (personas' .claude/skills/leonardo/tools/leonardo-image.mjs and
// src-tauri/src/commands/core/persona_icon_gen.rs), not from documentation —
// including the Lucid Origin model UUID, which is the one value that fails
// silently and expensively if guessed.
//
// THE CLEANUP CONTRACT: Leonardo is a studio, not just an API. Anything we
// generate shows up in the user's gallery forever. So this adapter deletes
// every generation it makes, and it does so in a `finally` — a download that
// throws must not be the reason clutter survives. Deletion failure is
// reported in provenance, never raised: by then we already hold the pixels,
// and failing the call would trade the user's image for their tidiness.

import { ImagingError } from "../errors";
import { keyFor } from "../env";
import { fetchImageBase64, requestJson } from "../http";
import {
  ASPECT_PX,
  type GenerateRequest,
  type GeneratedImages,
  type ImageRef,
  type ImagingProvider,
} from "../types";

const BASE = "https://cloud.leonardo.ai/api/rest/v1";

/** Lucid Origin. Verified against the reference client's LUCID_ORIGIN_MODEL. */
const LUCID_ORIGIN = "7b592283-e8a7-4c5a-9ba6-d18c31f258b9";

const POLL_INTERVAL_MS = 3_000;
const MAX_POLLS = 60; // 3 minutes, matching the reference client's ceiling

/** Leonardo bills in credits; this is the reference implementation's USD
 *  conversion, kept so the studio's cost line means the same thing here. */
const USD_PER_CREDIT = 0.00257;

/** v1 Create Generation rejects prompts past 1500 characters. Checked locally
 *  so a long style block fails with a message that says what to shorten,
 *  rather than as a bare vendor 400. Note the v2 endpoint allows 2000 — budget
 *  to the lower one, because prompt-building is shared. */
const MAX_PROMPT_CHARS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StartResponse {
  sdGenerationJob?: {
    generationId?: string;
    /** Legacy field, still present during the transition. */
    apiCreditCost?: number | string;
    /** Its replacement. Both are read — whichever arrives. */
    cost?: { amount?: number | string; unit?: string };
  };
}

/**
 * Leonardo's money fields are a moving target: `apiCreditCost` is being
 * superseded by `cost: {amount, unit}`, the webhook spells it `apiDollarCost`,
 * and the amounts arrive as STRINGS in at least two of the three. So coerce
 * everything, and read the unit rather than assuming credits — treating
 * dollars as credits would under-report the bill by ~400x.
 */
function costUsdFrom(job: StartResponse["sdGenerationJob"]): number | undefined {
  const amount = Number(job?.cost?.amount ?? job?.apiCreditCost);
  if (!Number.isFinite(amount)) return undefined;
  const unit = String(job?.cost?.unit ?? "CREDITS").toUpperCase();
  return unit === "DOLLARS" ? amount : amount * USD_PER_CREDIT;
}

interface PollResponse {
  generations_by_pk?: {
    status?: string;
    generated_images?: { id?: string; url?: string }[];
  };
}

export function leonardoProvider(): ImagingProvider {
  return {
    id: "leonardo",
    // Generation only. Leonardo's editing surface is background removal
    // (/variations/nobg), which is not the general instruction-driven edit the
    // `edit` capability promises — claiming it would make the router hand
    // Leonardo work it cannot do.
    capabilities: ["generate"],
    // v1 takes no style-reference image. Declared false so the router sends
    // style-locked work elsewhere instead of this adapter dropping the field.
    supportsReferences: false,

    async generate(req: GenerateRequest): Promise<GeneratedImages> {
      const started = Date.now();
      const key = keyFor("leonardo");
      const headers = { authorization: `Bearer ${key}` };
      const { w, h } = ASPECT_PX[req.aspect];
      const count = Math.min(Math.max(req.count ?? 1, 1), 8);

      if (req.prompt.length > MAX_PROMPT_CHARS)
        throw new ImagingError(
          `The prompt is ${req.prompt.length} characters; Leonardo accepts ${MAX_PROMPT_CHARS}. Shorten the style block or move detail into the negative prompt.`,
          "bad-response",
          "leonardo",
        );

      const start = await requestJson<StartResponse>("leonardo", `${BASE}/generations`, {
        method: "POST",
        headers,
        body: {
          prompt: req.prompt,
          ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
          modelId: LUCID_ORIGIN,
          width: w,
          height: h,
          num_images: count,
          ...(req.seed !== undefined ? { seed: req.seed } : {}),
        },
      });

      const generationId = start.sdGenerationJob?.generationId;
      if (!generationId)
        throw new ImagingError(
          "Leonardo accepted the request but returned no generation id.",
          "bad-response",
          "leonardo",
          start,
        );

      const costUsd = costUsdFrom(start.sdGenerationJob);

      // From here on the generation EXISTS remotely, so every exit path must
      // go through cleanup — hence the try/finally rather than a tidy
      // sequential flow.
      let images: ImageRef[] = [];
      let cleanup: "deleted" | "failed" = "failed";
      try {
        const urls = await poll(generationId, headers);
        images = await Promise.all(
          urls.slice(0, count).map(async (url) => {
            const { base64, mime } = await fetchImageBase64("leonardo", url);
            return { base64, mime: mime as ImageRef["mime"], width: w, height: h };
          }),
        );
      } finally {
        cleanup = await deleteGeneration(generationId, headers);
      }

      return {
        images,
        provenance: {
          provider: "leonardo",
          model: "lucid-origin",
          remoteIds: [generationId],
          costUsd,
          durationMs: Date.now() - started,
          cleanup,
        },
      };
    },
  };
}

async function poll(id: string, headers: Record<string, string>): Promise<string[]> {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    // A single bad poll is not a failed generation — the reference client
    // skips transient errors rather than aborting, and so do we.
    let res: PollResponse;
    try {
      res = await requestJson<PollResponse>("leonardo", `${BASE}/generations/${id}`, {
        headers,
        attempts: 1,
      });
    } catch {
      continue;
    }

    const job = res.generations_by_pk;
    const status = job?.status?.toUpperCase();
    if (status === "FAILED")
      throw new ImagingError("Leonardo reported the generation failed.", "failed", "leonardo", res);
    // Leonardo surfaces a safety block as its own terminal status rather than
    // an error — same meaning as a Google refusal, so same kind.
    if (status === "NSFW")
      throw new ImagingError(
        "Leonardo declined this prompt on safety grounds.",
        "refused",
        "leonardo",
        res,
      );

    if (status === "COMPLETE") {
      const urls = (job?.generated_images ?? []).map((g) => g.url).filter((u): u is string => Boolean(u));
      if (!urls.length)
        throw new ImagingError(
          "Leonardo reported COMPLETE but returned no images.",
          "bad-response",
          "leonardo",
          res,
        );
      return urls;
    }
  }
  throw new ImagingError(
    `Leonardo did not finish within ${(MAX_POLLS * POLL_INTERVAL_MS) / 1000}s.`,
    "timeout",
    "leonardo",
  );
}

/** Remove the generation from the user's Leonardo gallery. Never throws —
 *  the caller already has the bytes, and a tidy-up failure is a note, not an
 *  outcome. */
async function deleteGeneration(
  id: string,
  headers: Record<string, string>,
): Promise<"deleted" | "failed"> {
  try {
    await requestJson("leonardo", `${BASE}/generations/${id}`, {
      method: "DELETE",
      headers,
      attempts: 2,
      timeoutMs: 20_000,
    });
    return "deleted";
  } catch (e) {
    console.warn(`[imaging] Leonardo cleanup failed for generation ${id}:`, e);
    return "failed";
  }
}
