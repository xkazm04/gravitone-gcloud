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

import { LeaseError, gpuBroker, type LeaseHandle } from "../../gpu/lease";
import { ImagingError } from "../errors";
import { keyFor } from "../env";
import { requestJson } from "../http";
import { parseAgainstSchema } from "../json";
import { priceCall } from "../pricing";
import type { ImagingProvider, RecognizeRequest, Recognition } from "../types";

/** The resident vision model. Overridable so a bigger card can point at a
 *  bigger eye without a code change; the default is the corpus annotator. */
const MODEL = process.env.OLLAMA_VISION_MODEL?.trim() || "qwen3.8:27b";

/** How long a recognition waits for the card before giving way to the cloud eye.
 *  Short on purpose: the point of the lease is that a busy card is a ROUTING
 *  fact, not a queue this request sits in (see takeTurn). */
function leaseWaitMs(): number {
  const n = Number(process.env.OLLAMA_LEASE_WAIT_MS);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
}

/**
 * Take the card's turn for one recognition (lib/gpu/lease.ts; the pipeline's
 * ComfyUI lanes hold the same lease from Python). When another tenant holds it
 * this raises `rate-limited` — the router's reroutable kind, never billed — so
 * the trail records `ollama (gpu-busy)` and the request falls to the cloud eye
 * instead of loading a 22 GB model on top of a running render.
 */
async function takeTurn(): Promise<LeaseHandle> {
  try {
    // ttl covers the retry-without-`think` path: two 180 s calls.
    return await gpuBroker().acquire({
      tenant: "next-ollama-eye", engine: "ollama", vramGb: 22, waitMs: leaseWaitMs(), ttlS: 400,
    });
  } catch (e) {
    if (!(e instanceof LeaseError)) throw e;
    throw new ImagingError(
      `ollama (gpu-busy): ${e.message}`,
      "rate-limited",
      "ollama",
      { gpuBusy: true },
    );
  }
}

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
      const turn = await takeTurn();
      try {
        return await recognizeOnCard(req, host, started);
      } finally {
        await turn.release();
      }
    },
  };
}

async function recognizeOnCard(req: RecognizeRequest, host: string, started: number): Promise<Recognition> {
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
    // "Rejects" is an ANSWER: `failed` with `dispatched` set (http.ts, a 4xx/5xx
    // the daemon sent). An unreachable host and a 180 s timeout are not that
    // answer, and retrying them only doubles the wait under the card's lease.
    if (!(e instanceof ImagingError) || e.kind !== "failed" || !e.dispatched) throw e;
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
}
