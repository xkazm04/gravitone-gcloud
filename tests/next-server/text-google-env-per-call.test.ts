// GOOGLE'S MODEL AND BASE URL ARE READ WHEN A TURN IS ASKED (lib/text/providers/google.ts): like every key
// (lib/text/env.ts), an override set after the module loaded steers the next turn.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { googleProvider } = await import("../../lib/text/providers/google.ts");

const VARS = ["GOOGLE_AI_API_KEY", "GOOGLE_TEXT_MODEL", "GOOGLE_TEXT_MODEL_PLAN", "GOOGLE_TEXT_BASE_URL"] as const;
const saved: Record<string, string | undefined> = {};
const urls: string[] = [];

beforeEach(() => {
  for (const v of VARS) saved[v] = process.env[v];
  for (const v of VARS) delete process.env[v];
  process.env.GOOGLE_AI_API_KEY = "test-key";
  urls.length = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }] }), { status: 200 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

const ask = (turn: "probe" | "edit-plan") =>
  googleProvider().reason({ turn, prompt: "p" } as never, 5000);

describe("google text overrides", () => {
  it("a flash model set after import names the next turn's URL", async () => {
    process.env.GOOGLE_TEXT_MODEL = "gemini-flash-later";
    await ask("probe");
    expect(urls[0]).toContain("/models/gemini-flash-later:generateContent");
  });

  it("a pro model set after import names the next plan turn's URL", async () => {
    process.env.GOOGLE_TEXT_MODEL_PLAN = "gemini-pro-later";
    await ask("edit-plan");
    expect(urls[0]).toContain("/models/gemini-pro-later:generateContent");
  });

  it("a base URL set after import is where the next turn goes", async () => {
    process.env.GOOGLE_TEXT_BASE_URL = "http://localhost:9/v1";
    await ask("probe");
    expect(urls[0]?.startsWith("http://localhost:9/v1/models/")).toBe(true);
  });

  it("with no override the defaults stand", async () => {
    await ask("probe");
    await ask("edit-plan");
    expect(urls[0]).toContain("generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:");
    expect(urls[1]).toContain("/models/gemini-3.1-pro-preview:");
  });
});
