// The compose door's size bound (L74, owner ruling 11). v1's /api/script refused a run whose
// material passed a million serialised characters with a 413 before any engine (619f88ec); the
// route retired at the cutover and the bound went with it. It is held now at admitCompose - the
// door the script producer's receipt and its unit both pass - and refused in the work's words.
import { describe, expect, it } from "vitest";

import { NOTEBOOK } from "@/lib/notebook/notebook";
import { admitCompose, MAX_COMPOSE_CHARS } from "@/lib/script/compose";

const RUN = { template: "mid-educational-video", targetS: 300, scope: {} };

describe("the compose door's size bound", () => {
  it("a real notebook is admitted", () => {
    expect(admitCompose({ ...RUN, notebook: NOTEBOOK }).kind).toBe("run");
  });

  it("a run whose material passes the ceiling is refused before the notebook is read, naming the largest field", () => {
    const pad = "x".repeat(MAX_COMPOSE_CHARS);
    const a = admitCompose({ ...RUN, notebook: { ...NOTEBOOK, transcript: pad } });
    expect(a).toEqual({ kind: "bad", detail: expect.stringMatching(/^The run's material is 1\d{3}k characters \(largest: notebook\); the ceiling is 1000k\. Nothing was composed\.$/) });
  });

  it("the ceiling counts every field sent, not only the notebook", () => {
    const half = "y".repeat(MAX_COMPOSE_CHARS / 2);
    const a = admitCompose({ ...RUN, notebook: NOTEBOOK, scope: { note: half }, conclusions: [{ id: "c", claim: half, restsOn: [] }] });
    expect(a.kind === "bad" ? a.detail : "").toMatch(/^The run's material is \d+k characters \(largest: (scope|conclusions)\)/);
  });

  it("material JSON cannot hold is refused, never sent", () => {
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    const a = admitCompose({ ...RUN, notebook: NOTEBOOK, scope: loop });
    expect(a.kind === "bad" ? a.detail : "").toBe("The run's material is not serialisable (largest: scope); the ceiling is 1000k. Nothing was composed.");
  });
});
