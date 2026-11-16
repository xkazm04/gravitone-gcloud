// CODEX IMAGE_GEN ON THE OPERATOR'S CHATGPT SEAT as an imaging provider (operator, 2026-11-08: Codex is the main image
// engine, Flux 2 is gone). The draw itself is ../local/codex.ts `drawCodex`.
//
// Prefer-only, like the two Leonardo routes (router.ts PREFER_ONLY): reached by name, never planned and never a
// fallback, so a request that names another vendor is not silently served by Codex. A scout replica or concept names
// it through SCOUT_REPLICA_GENERATOR, whose default it is (foundry/scout/stillEngine.ts).
//
// $0: the seat bills no image; its quota is the real limit. One image per call.

import { CODEX_MODEL, CODEX_REFS_MAX, drawCodex, type CodexAspect } from "../local/codex";
import { invalidRequest } from "../errors";
import { priceCall } from "../pricing";
import type { GeneratedImages, GenerateRequest, ImagingProvider } from "../types";

/** A 4:5 request takes the nearest of Codex's three shapes: portrait. */
const codexAspect = (a: GenerateRequest["aspect"]): CodexAspect => (a === "9:16" || a === "4:5" ? "9:16" : a === "1:1" ? "1:1" : "16:9");

export function codexProvider(o: { readonly draw?: typeof drawCodex } = {}): ImagingProvider {
  const draw = o.draw ?? drawCodex;
  return {
    id: "codex",
    capabilities: ["generate"],
    // drawCodex attaches up to CODEX_REFS_MAX stills to the turn (`-i`); past that window the rest are dropped, as
    // Google's adapter keeps its own 14.
    supportsReferences: true,
    // One prose instruction: a negative rides inside it as a sentence.
    negativePromptChannel: "prose",

    async generate(req: GenerateRequest): Promise<GeneratedImages> {
      const started = Date.now();
      if ((req.count ?? 1) !== 1) throw invalidRequest("codex", "Codex makes one image per request here; ask for count 1.");
      const neg = req.negativePrompt?.trim();
      const prompt = neg === undefined || neg === "" ? req.prompt : `${req.prompt} Avoid: ${neg}.`;
      const refs = (req.references ?? []).slice(0, CODEX_REFS_MAX).map((r) => new Uint8Array(Buffer.from(r.base64, "base64")));
      const still = await draw({ prompt, aspect: codexAspect(req.aspect), ...(req.seed === undefined ? {} : { seed: req.seed }), ...(refs.length === 0 ? {} : { refs }) });
      const price = priceCall({ provider: "codex", model: CODEX_MODEL, images: 1 });
      return {
        images: [{ base64: Buffer.from(still.png).toString("base64"), mime: "image/png", width: still.width, height: still.height }],
        provenance: {
          provider: "codex",
          model: CODEX_MODEL,
          modelBasis: "requested",
          remoteIds: [],
          costUsd: price.usd,
          costBasis: price.basis,
          durationMs: Date.now() - started,
          cleanup: "not-applicable",
          ...(neg === undefined || neg === "" ? {} : { negativePromptChannel: "prose" as const }),
          ...(still.cliVersion === undefined ? {} : { cliVersion: still.cliVersion }),
        },
      };
    },
  };
}
