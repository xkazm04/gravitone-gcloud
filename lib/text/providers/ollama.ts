// OLLAMA — the LOCAL writer (spark scout-vision S6).
//
// The same daemon and the same resident qwen3.8:27b the imaging side already
// reads frames with (lib/imaging/providers/ollama.ts), asked for words instead.
// The point is the operator's 2026-10-26 sentence, "we have local llms ready to
// create various content": a night's drafts are worth writing only because they
// bill nobody and ship nothing off the box, so this rung leads exactly one turn
// (`draft`, router.ts PLAN) and replaces the CLI on none.
//
// CONFIGURED means OLLAMA_HOST is set — the address is the "key", as the eye has
// it (lib/text/env.ts KEY_VAR). That is deliberate, not a proxy for "the daemon
// is up": the router's no-key step is the honest way a local provider is absent
// on a box that runs none, and the router skips the probe for a provider with a
// key var. So a set host with a DEAD daemon has to fail here, as a reroutable
// kind, or the draft would refuse instead of walking to the CLI:
//   · nothing answered the socket  -> `not-installed` (an availability kind;
//     nothing was dispatched, nothing billed), with the script that starts it;
//   · the daemon answered 404 "model not found" -> `not-installed` too, with the
//     pull that fixes it. The engine is absent; the box is not broken.
// A timeout stays `timeout` and is NOT walked past (errors.ts's reason, which a
// free engine weakens but does not remove: a hung 27b under a render is a fact
// the trail should show, not paper over with a seat turn).
//
// Two shapes carried over from the eye, with their reasons:
//   1. `format: <json schema>` — Ollama constrains decoding to a schema, so a
//      schema request is vendor-enforced, and the router re-checks it anyway.
//      Dated: the eye has sent `format` to this model since 2026-09-01
//      (pipeline/vlm-probe/probe.py is its reference), re-read 2026-10-26.
//   2. `think: false`, retried once without it when the daemon rejects the key
//      — a model with no thinking mode refuses it outright. Only THAT answer is
//      retried: an unreachable host or a timeout is not a rejection.
//
// NO GPU LEASE here, unlike the eye: a draft is launched by the night-fill only
// when a lane is idle (lib/foundry/scout/plan.ts), and whether a text turn should
// also take `gpu.local#1` is an open question for that launcher, not this door.

import { invalidRequest, TextError } from "../errors";
import { keyFor } from "../env";
import { postJson } from "../http";
import { priceTurn } from "../pricing";
import type { ProbeResult, TextProvider, TextRequest, TextResult } from "../types";

/** The model a turn names, read per call like every key (lib/text/env.ts). */
export const ollamaTextModel = (env: Readonly<Record<string, string | undefined>> = process.env): string =>
  env["OLLAMA_TEXT_MODEL"]?.trim() || "qwen3.8:27b";

/** What starts the daemon on this box: the remedy every absence names. */
export const OLLAMA_UP = "powershell -File pipeline/ollama-up.ps1";

/** The context window asked for. Ollama's own default is a few thousand tokens
 *  and it truncates a longer prompt SILENTLY, so the window is stated. */
const NUM_CTX = 16_384;
/** ~3 characters a token leaves room in NUM_CTX for the answer. Past it the
 *  prompt is refused before dispatch rather than cut by the daemon unseen. */
const MAX_PROMPT_CHARS = 36_000;

export type OllamaFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The models the daemon at `host` holds (GET /api/tags) — free, local, and the
 *  one read both this probe and the scout doctor make. Throws the transport's
 *  own sentence when nothing answers. */
export async function ollamaTags(host: string, f: OllamaFetch = fetch, ms = 3_000): Promise<string[]> {
  const res = await f(`${host.replace(/\/$/, "")}/api/tags`, { method: "GET", signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`/api/tags answered ${res.status}`);
  const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
  return (body.models ?? []).flatMap((m) => [m.name ?? m.model ?? ""]).filter((n) => n !== "");
}

/** Does `tags` hold `model`? Ollama lists `name:tag`; a bare name means `:latest`. */
export const hasModel = (tags: readonly string[], model: string): boolean =>
  tags.includes(model) || tags.includes(model.includes(":") ? model : `${model}:latest`);

interface ChatResponse {
  model?: string;
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function ollamaProvider(): TextProvider {
  return {
    id: "ollama",
    capabilities: ["reason"],
    transport: "local-daemon",
    enforcesSchema: true, // /api/chat `format` - see header, 2026-10-26

    async probe(): Promise<ProbeResult> {
      const host = process.env["OLLAMA_HOST"]?.trim();
      if (!host) return { ok: false, detail: `OLLAMA_HOST is not set: the local text engine is off. ${OLLAMA_UP} starts the daemon; set OLLAMA_HOST=http://127.0.0.1:11434.`, why: "no-key", freeToRun: true };
      const model = ollamaTextModel();
      try {
        const tags = await ollamaTags(host);
        if (hasModel(tags, model)) return { ok: true, detail: `Ollama at ${host} holds ${model}.`, freeToRun: true };
        return { ok: false, detail: `Ollama at ${host} answers but does not hold ${model}: ollama pull ${model}.`, why: "not-installed", freeToRun: true };
      } catch (e) {
        return { ok: false, detail: `Ollama at ${host} did not answer (${(e as Error).message}): ${OLLAMA_UP}.`, why: "not-installed", freeToRun: true };
      }
    },

    async reason(req: TextRequest, timeoutMs: number): Promise<TextResult> {
      const started = Date.now();
      const host = keyFor("ollama").replace(/\/$/, "");
      const model = ollamaTextModel();
      if (req.prompt.length > MAX_PROMPT_CHARS)
        throw invalidRequest(
          "ollama",
          `This prompt is ${req.prompt.length} characters, past the ${MAX_PROMPT_CHARS} that fit the ${NUM_CTX}-token ` +
            `window this adapter asks Ollama for. Nothing was dispatched.`,
        );

      const body: Record<string, unknown> = {
        model,
        messages: [{ role: "user", content: req.prompt }],
        stream: false,
        options: { num_ctx: NUM_CTX },
        ...(req.schema ? { format: req.schema } : {}),
      };
      const call = (b: Record<string, unknown>) =>
        postJson<ChatResponse>("ollama", `${host}/api/chat`, { body: b, timeoutMs, signal: req.signal });

      let res: ChatResponse;
      try {
        try {
          res = await call({ ...body, think: false });
        } catch (e) {
          if (!(e instanceof TextError) || !e.dispatched || e.kind !== "failed" || !/think/i.test(String(e.detail ?? ""))) throw e;
          res = await call(body);
        }
      } catch (e) {
        throw absent(e, host, model);
      }

      const text = res.message?.content?.trim() ?? "";
      if (!text) {
        // `bad-response`, not reroutable: an empty free answer does not become a
        // seat turn on a hunch (the eye's rule, imaging/providers/ollama.ts).
        const err = new TextError(`Ollama answered with no text (done_reason=${res.done_reason ?? "none"}).`, "bad-response", "ollama", JSON.stringify(res).slice(0, 600));
        err.dispatched = true;
        throw err;
      }

      const price = priceTurn({ provider: "ollama", model, inputTokens: res.prompt_eval_count, outputTokens: res.eval_count });
      return {
        text,
        provenance: {
          provider: "ollama",
          model,
          transport: "local-daemon",
          rung: "preferred", // overwritten by the router, which knows the rung
          turn: req.turn,
          schemaEnforcement: req.schema ? "native" : "none",
          durationMs: Date.now() - started,
          ...(price.usd === undefined ? {} : { costUsd: price.usd }),
          costBasis: price.basis,
          promptChars: req.prompt.length,
          ...(res.prompt_eval_count === undefined ? {} : { inputTokens: res.prompt_eval_count }),
          ...(res.eval_count === undefined ? {} : { outputTokens: res.eval_count }),
        },
      };
    },
  };
}

/** A failure that means the engine is ABSENT, re-kinded so the router walks on
 *  (see the header); everything else unchanged. */
function absent(e: unknown, host: string, model: string): unknown {
  if (!(e instanceof TextError)) return e;
  if (e.kind === "failed" && !e.dispatched)
    return new TextError(`Ollama at ${host} did not answer: start it with ${OLLAMA_UP}, or unset OLLAMA_HOST.`, "not-installed", "ollama", e.detail);
  const detail = String(e.detail ?? "");
  if (e.kind === "failed" && e.dispatched && /not found/i.test(detail)) {
    const err = new TextError(`Ollama at ${host} does not hold ${model}: ollama pull ${model}, or set OLLAMA_TEXT_MODEL.`, "not-installed", "ollama", detail);
    err.dispatched = true;
    return err;
  }
  return e;
}
