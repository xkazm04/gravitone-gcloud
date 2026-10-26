// FLUX 2 DEV ON THIS BOX'S COMFYUI as an imaging provider (operator, 2026-10-25): the Leonardo API pool
// is empty until its renewal (apiSubscriptionTokens 0) and every Flare call is refused "Insufficient
// tokens", while the Flux weights now sit in ComfyUI's models folder. The draw itself is
// ../local/flux2.ts `drawFlux` - the storyboards' client, never POSTing /free to the shared server.
//
// Prefer-only, like the two Leonardo routes (router.ts PREFER_ONLY): reached by name, never planned and
// never a fallback, so a request that names Flare is not silently served by a different model. A scout
// replica or concept names it when SCOUT_REPLICA_GENERATOR=comfy-flux2 (foundry/scout/scene.ts).
//
// Free: costUsd 0, costBasis "estimated" (no vendor bills a local model). One image per call, as Flare.

import { drawFlux, FLUX_MODEL, type FluxAspect } from "../local/flux2";
import { invalidRequest } from "../errors";
import type { GeneratedImages, GenerateRequest, ImagingProvider } from "../types";

/** Flux draws 16:9 or 9:16; a square or 4:5 request takes the nearer of the two by orientation. */
const fluxAspect = (a: GenerateRequest["aspect"]): FluxAspect => (a === "9:16" || a === "4:5" ? "9:16" : "16:9");

export function comfyFluxProvider(o: { readonly draw?: typeof drawFlux } = {}): ImagingProvider {
  const draw = o.draw ?? drawFlux;
  return {
    id: "comfy-flux2",
    capabilities: ["generate"],
    supportsReferences: false,
    // The graph takes one positive prompt: a negative rides inside it as a sentence.
    negativePromptChannel: "prose",

    async generate(req: GenerateRequest): Promise<GeneratedImages> {
      const started = Date.now();
      if ((req.count ?? 1) !== 1) throw invalidRequest("comfy-flux2", "Flux on ComfyUI makes one image per request here; ask for count 1.");
      const neg = req.negativePrompt?.trim();
      const prompt = neg === undefined || neg === "" ? req.prompt : `${req.prompt} Avoid: ${neg}.`;
      const still = await draw({ prompt, aspect: fluxAspect(req.aspect), ...(req.seed === undefined ? {} : { seed: req.seed }) });
      return {
        images: [{ base64: Buffer.from(still.png).toString("base64"), mime: "image/png", width: still.width, height: still.height }],
        provenance: {
          provider: "comfy-flux2",
          model: FLUX_MODEL,
          modelBasis: "requested",
          remoteIds: [still.promptId],
          costUsd: 0,
          costBasis: "estimated",
          durationMs: Date.now() - started,
          cleanup: "not-applicable",
          ...(neg === undefined || neg === "" ? {} : { negativePromptChannel: "prose" as const }),
        },
      };
    },
  };
}
