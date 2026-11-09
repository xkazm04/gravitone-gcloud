// The scout's replica switch: Codex by default since Flux 2's removal (operator, 2026-11-08), a leftover
// comfy-flux2 refused in one line rather than re-routed.
import { describe, expect, it } from "vitest";

import { replicaGenerator, replicaRequest } from "@/lib/foundry/scout/scene";

describe("replicaGenerator", () => {
  it("is Codex unless the env names a Leonardo route", () => {
    expect(replicaGenerator({})).toBe("codex");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "something-else" })).toBe("codex");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: " leonardo-studio " })).toBe("leonardo-studio");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "leonardo-flare" })).toBe("leonardo-flare");
    expect(replicaGenerator({ SCOUT_REPLICA_GENERATOR: "codex" })).toBe("codex");
  });

  it("refuses a leftover comfy-flux2 with one line naming the removal", () => {
    expect(() => replicaGenerator({ SCOUT_REPLICA_GENERATOR: "comfy-flux2" })).toThrow(/Flux 2 was removed on 2026-11-08/);
  });

  it("names the engine on the replica request", () => {
    const prev = process.env["SCOUT_REPLICA_GENERATOR"];
    process.env["SCOUT_REPLICA_GENERATOR"] = "leonardo-flare";
    try {
      expect(replicaRequest({ prompt: "p" } as Parameters<typeof replicaRequest>[0], 1).prefer).toBe("leonardo-flare");
    } finally {
      if (prev === undefined) delete process.env["SCOUT_REPLICA_GENERATOR"];
      else process.env["SCOUT_REPLICA_GENERATOR"] = prev;
    }
  });
});
