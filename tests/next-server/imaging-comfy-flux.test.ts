// Flux 2 on ComfyUI as a prefer-only imaging provider, and the scout's replica switch (2026-10-25).
import { describe, expect, it } from "vitest";

import { replicaGenerator, replicaRequest } from "@/lib/foundry/scout/scene";
import { comfyFluxProvider } from "@/lib/imaging/providers/comfyFlux";

const still = { png: new Uint8Array([137, 80, 78, 71]), seed: 7, model: "flux2-dev-fp8" as const, promptId: "p-1", width: 1280, height: 720, wallMs: 5 };

describe("comfy-flux2 provider", () => {
  it("draws one image at $0, the negative carried in the prompt, a square asked as 16:9", async () => {
    const seen: unknown[] = [];
    const p = comfyFluxProvider({ draw: async (req) => (seen.push(req), still) });
    const out = await p.generate!({ prompt: "a robot", negativePrompt: "text", aspect: "1:1", count: 1, seed: 7 });
    expect(seen).toEqual([{ prompt: "a robot Avoid: text.", aspect: "16:9", seed: 7 }]);
    expect(out.images).toHaveLength(1);
    expect(out.images[0]?.mime).toBe("image/png");
    expect(out.provenance).toMatchObject({ provider: "comfy-flux2", costUsd: 0, costBasis: "estimated", negativePromptChannel: "prose" });
  });

  it("refuses more than one image a call", async () => {
    const p = comfyFluxProvider({ draw: async () => still });
    await expect(p.generate!({ prompt: "x", aspect: "16:9", count: 2 })).rejects.toThrow(/one image per request/);
  });
});

describe("replicaGenerator", () => {
  it("is the studio unless the env names Flare or comfy-flux2", () => {
    expect(replicaGenerator({})).toBe("leonardo-studio");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "something-else" })).toBe("leonardo-studio");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: " leonardo-studio " })).toBe("leonardo-studio");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "leonardo-flare" })).toBe("leonardo-flare");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "comfy-flux2" })).toBe("comfy-flux2");
  });

  it("names it on the replica request", () => {
    const prev = process.env["SCOUT_REPLICA_GENERATOR"];
    process.env["SCOUT_REPLICA_GENERATOR"] = "comfy-flux2";
    try {
      expect(replicaRequest({ prompt: "p" } as Parameters<typeof replicaRequest>[0], 1).prefer).toBe("comfy-flux2");
    } finally {
      if (prev === undefined) delete process.env["SCOUT_REPLICA_GENERATOR"];
      else process.env["SCOUT_REPLICA_GENERATOR"] = prev;
    }
  });
});
