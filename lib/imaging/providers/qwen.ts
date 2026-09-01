// QWEN — the dev-environment eye.
//
// Recognition only. This is what lets the app (and an agent working on it)
// actually SEE what we generated, rather than trusting a prompt was honoured:
// the /library proof sheet is judged, not just displayed.
//
// Endpoint is Qwen's OpenAI-compatible surface, so the request is a normal
// chat completion with a multimodal content array. Verified against both the
// live docs and a working client in the reference repo.
//
// Two improvements over that reference client, deliberately:
//   1. NATIVE structured output. It asks for JSON in the prompt and returns
//      whatever arrives, leaving parsing to the caller — which in practice
//      means nobody validates. Qwen3.8-Max supports `json_schema` with
//      `strict`, so a schema is enforced at the vendor and re-checked here.
//   2. Model rotation on quota, kept from the reference because the reason is
//      sound: the SKUs bill against separate quotas, so a 429 on one is not a
//      429 on the next.

import { ImagingError, invalidRequest } from "../errors";
import { keyFor } from "../env";
import { requestJson } from "../http";
import { parseAgainstSchema, schemaInstruction } from "../json";
import { priceCall } from "../pricing";
import { dataUrl, type ImagingProvider, type RecognizeRequest, type Recognition } from "../types";

const BASE =
  process.env.QWEN_BASE_URL?.trim() || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

/** Primary first. The fallbacks exist for quota, not for quality — they bill
 *  against separate allowances, so a 429 on one says nothing about the next. */
const MODELS = ["qwen3.8-max", "qwen3.7-plus", "qwen3.6-flash"] as const;

/** Qwen's documented ceiling for an inline base64 image is 10 MB. Checked here
 *  so the failure is a clear message rather than a vendor 400 after upload. */
const MAX_INLINE_BYTES = 10 * 1024 * 1024;

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function qwenProvider(): ImagingProvider {
  return {
    id: "qwen",
    capabilities: ["recognize"],

    async recognize(req: RecognizeRequest): Promise<Recognition> {
      const started = Date.now();
      const key = keyFor("qwen");

      const bytes = Math.ceil((req.image.base64.length * 3) / 4);
      // Checked here, before dispatch — so `invalid-request`, not
      // `bad-response`. The router books a `bad-response` as billed on the
      // grounds that the vendor answered; this image never left the process.
      if (bytes > MAX_INLINE_BYTES)
        throw invalidRequest(
          "qwen",
          `The image is ${(bytes / 1024 / 1024).toFixed(1)} MB; Qwen accepts at most 10 MB inline.`,
        );

      // Image part first, then the instruction — the order the vendor's own
      // examples and the reference client both use.
      const content = [
        { type: "image_url", image_url: { url: dataUrl(req.image) } },
        { type: "text", text: req.instruction + (req.schema ? schemaInstruction(req.schema) : "") },
      ];

      let lastQuotaError: ImagingError | null = null;

      for (const model of MODELS) {
        try {
          const res = await requestJson<ChatResponse>("qwen", `${BASE}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${key}` },
            body: {
              model,
              messages: [{ role: "user", content }],
              temperature: 0.2,
              max_tokens: 4096,
              // Enforced at the vendor where available. The prompt-side
              // instruction above stays regardless: it costs nothing and it is
              // what carries the schema on the fallback SKUs.
              ...(req.schema
                ? {
                    response_format: {
                      type: "json_schema",
                      json_schema: { name: "recognition", schema: req.schema, strict: true },
                    },
                  }
                : {}),
            },
            timeoutMs: 120_000,
            attempts: 1, // rotation is the retry strategy here
          });

          const text = res.choices?.[0]?.message?.content?.trim();
          if (!text) {
            // Empty content is a soft failure in the reference client too —
            // try the next SKU rather than failing the call.
            lastQuotaError ??= new ImagingError(
              `Qwen ${model} returned empty content.`,
              "bad-response",
              "qwen",
            );
            continue;
          }

          const qwenPrice = priceCall({ provider: "qwen", model });
          return {
            text,
            json: req.schema ? parseAgainstSchema("qwen", text, req.schema) : undefined,
            provenance: {
              provider: "qwen",
              model,
              modelBasis: "requested" as const,
              // Same route through pricing.ts as every other adapter, and the
              // same honest `undefined` at the end of it: DashScope bills per
              // token, the three SKUs above bill at different rates against
              // separate allowances, and nobody has checked the rate card. The
              // reason is recorded in the table rather than implied by silence
              // here, and the moment a rate lands there this line prices itself.
              costUsd: qwenPrice.usd,
              costBasis: qwenPrice.basis,
              durationMs: Date.now() - started,
              cleanup: "not-applicable",
            },
          };
        } catch (e) {
          const err =
            e instanceof ImagingError ? e : new ImagingError(String(e), "failed", "qwen");
          // Quota and TIMEOUT both justify moving to another SKU: the first is
          // per-SKU by definition, and the second is usually load on that
          // model rather than on the account — measured, a batch at
          // concurrency 3 timed out four times on the primary and the
          // fallbacks answered fine. A malformed request or a bad key, by
          // contrast, will fail identically on every one of them.
          if (err.kind !== "rate-limited" && err.kind !== "timeout") throw err;
          lastQuotaError = err;
        }
      }

      throw (
        lastQuotaError ??
        new ImagingError("Every Qwen model was exhausted.", "rate-limited", "qwen")
      );
    },
  };
}
