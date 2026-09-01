// OLLAMA — the LOCAL eye.
//
// Recognition only, served by the vision model already resident on this
// machine's own GPU (the same qwen3.8:27b that annotates the vlm-probe corpus
// and grades every forge candidate — pipeline/vlm-probe/probe.py is the
// working reference for this exact call shape). The point is sovereignty and
// cost: an eye that runs where the pixels already are bills nobody and ships
// nothing off the box.
//
// CONFIGURED means OLLAMA_HOST is set. That is deliberate, not a proxy for
// "the daemon is up": the router's no-key skip is the one honest way a local
// provider can be absent on machines that do not run one, and a set host with
// a dead daemon fails as a real call error that re-routes — both land in
// `trail`, neither is silent, which is this chokepoint's one invariant.
//
// Two shapes carried over from probe.py, with their reasons:
//   1. `format: <json schema>` — Ollama enforces structured output natively,
//      so a schema request is vendor-enforced and re-checked here, same
//      discipline as the cloud eye.
//   2. `think: false`, retried without on rejection — reasoning models burn
//      minutes thinking about a frame description; models without a thinking
//      mode reject the key outright.

import { ImagingError } from "../errors";
import { keyFor } from "../env";
import { requestJson } from "../http";
import { parseAgainstSchema } from "../json";
import { priceCall } from "../pricing";
import type { ImagingProvider, RecognizeRequest, Recognition } from "../types";

/** The resident vision model. Overridable so a bigger card can point at a
 *  bigger eye without a code change; the default is the corpus annotator. */
const MODEL = process.env.OLLAMA_VISION_MODEL?.trim() || "qwen3.8:27b";

interface ChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

export function ollamaProvider(): ImagingProvider {
  return {
    id: "ollama",
    capabilities: ["recognize"],

    async recognize(req: RecognizeRequest): Promise<Recognition> {
      const started = Date.now();
      // KEY_VAR maps this provider to OLLAMA_HOST — the "key" is the address.
      const host = keyFor("ollama").replace(/\/$/, "");

      const body: Record<string, unknown> = {
        model: MODEL,
        messages: [{ role: "user", content: req.instruction, images: [req.image.base64] }],
        stream: false,
        options: { temperature: 0, num_ctx: 8192 },
      };
      if (req.schema) body.format = req.schema;

      let res: ChatResponse;
      try {
        res = await requestJson<ChatResponse>("ollama", `${host}/api/chat`, {
          method: "POST",
          body: { ...body, think: false },
          timeoutMs: 180_000,
        });
      } catch (e) {
        // A model without a thinking mode rejects `think` outright (probe.py's
        // measured behaviour); one retry without it, everything else re-throws.
        if (!(e instanceof ImagingError)) throw e;
        res = await requestJson<ChatResponse>("ollama", `${host}/api/chat`, {
          method: "POST",
          body,
          timeoutMs: 180_000,
        });
      }

      const text = res.message?.content?.trim() ?? "";
      const json = req.schema ? parseAgainstSchema("ollama", text, req.schema) : undefined;

      const price = priceCall({ provider: "ollama", model: MODEL });
      return {
        text,
        json,
        provenance: {
          provider: "ollama",
          model: MODEL,
          modelBasis: "requested" as const,
          costUsd: price.usd,
          costBasis: price.basis,
          durationMs: Date.now() - started,
          cleanup: "not-applicable",
        },
      };
    },
  };
}
