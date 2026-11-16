// A stand-in for Codex behind the ideas producer, so a live-mode idea test never reaches the operator's ChatGPT seat.
import { ImagingError } from "../../lib/imaging/errors.ts";
import type { GeneratedImages, GenerateRequest } from "../../lib/imaging/types.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** `refuse` answers a prompt's refusal sentence, or null to draw it. */
export function fakeCodexIdeas(refuse: (prompt: string) => string | null = () => null) {
  const calls: GenerateRequest[] = [];
  const generate = async (req: GenerateRequest): Promise<GeneratedImages> => {
    calls.push(req);
    const why = refuse(req.prompt);
    if (why !== null) throw new ImagingError(why, "refused", "codex");
    return {
      images: [{ base64: PNG, mime: "image/png" }],
      provenance: { provider: "codex", model: "codex-test", modelBasis: "requested", remoteIds: [], costUsd: 0, costBasis: "vendor-reported", durationMs: 1, cleanup: "not-applicable" },
    };
  };
  return { calls, generate };
}
