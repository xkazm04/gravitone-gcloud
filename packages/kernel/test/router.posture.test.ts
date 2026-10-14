import { describe, expect, it } from "vitest";
import { derivePosture } from "../src/router/posture.ts";
import { must } from "./helpers.ts";

describe("posture (lib/deployment.ts, lib/imaging/env.ts, lib/text/env.ts)", () => {
  it("a plain machine is local everywhere, dev for images, retrieval off", () => {
    expect(must(derivePosture({}))).toEqual({ plan: { image: "dev", text: "local", audio: "local", video: "local" }, local: "available", retrieval: false });
  });

  it("a managed platform's own marker makes it hosted, and a production build routes images on prod", () => {
    expect(must(derivePosture({ K_SERVICE: "gravitone", NODE_ENV: "production" }))).toEqual({
      plan: { image: "prod", text: "cloud", audio: "hosted", video: "hosted" },
      local: "managed-platform",
      retrieval: false,
    });
  });

  it("LOCAL_BINARIES is honoured in both directions, and the explicit envs win", () => {
    expect(must(derivePosture({ LOCAL_BINARIES: "off" })).local).toBe("policy-forbidden");
    expect(must(derivePosture({ LOCAL_BINARIES: "ON", K_SERVICE: "x" })).local).toBe("available");
    expect(must(derivePosture({ TEXT_ENV: "cloud", IMAGING_ENV: "prod", TEXT_RETRIEVE: "1" }))).toMatchObject({ plan: { image: "prod", text: "cloud" }, retrieval: true });
  });

  it("absent degrades; a malformed value fails instead of reaching a fallback", () => {
    for (const env of [{ TEXT_ENV: "clod" }, { IMAGING_ENV: "production" }, { LOCAL_BINARIES: "no" }, { TEXT_RETRIEVE: "yes" }]) {
      const r = derivePosture(env);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatchObject({ code: "invalid", detail: Object.keys(env)[0] });
    }
    expect(must(derivePosture({ TEXT_ENV: "  ", TEXT_RETRIEVE: "" })).plan.text).toBe("local");
  });
});
