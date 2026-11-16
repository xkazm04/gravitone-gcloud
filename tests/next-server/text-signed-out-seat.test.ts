// A SIGNED-OUT SEAT STOPS WITH ITS SENTENCE (lib/text/router.ts::descendsTo, errors.ts::reroutableTo).
// `not-logged-in` is reroutable in the taxonomy, and every local reasoning turn plans [claude-cli, google]:
// before this, a logged-out `claude` quietly bought the same turn from the metered key. Both providers are
// stubs here, so nothing is spawned and nothing is billed; google counts the calls it was asked for.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TextError } from "../../lib/text/errors.ts";

const seat = vi.hoisted(() => ({ fail: null as null | { kind: string; why?: string }, googleCalls: 0 }));

vi.mock("../../lib/text/providers/claudeCli.ts", async () => {
  const { TextError: E } = await import("../../lib/text/errors.ts");
  return {
    cliTextError: (e: Error) => e,
    claudeCliProvider: () => ({
      id: "claude-cli",
      capabilities: ["reason"],
      transport: "local-subprocess",
      enforcesSchema: false,
      probe: async () =>
        seat.fail?.kind === "not-installed"
          ? { ok: false, detail: "The `claude` CLI is not installed or not on PATH.", why: "not-installed" }
          : { ok: true, detail: "stub" },
      reason: async () => {
        throw new E("The local Claude CLI is not logged in. Run `claude` once and sign in.", "not-logged-in", "claude-cli");
      },
    }),
  };
});
vi.mock("../../lib/text/providers/google.ts", () => ({
  googleProvider: () => ({
    id: "google",
    capabilities: ["reason"],
    transport: "cloud-api",
    enforcesSchema: true,
    probe: async () => ({ ok: true, detail: "stub" }),
    reason: async (req: { turn: string }) => {
      seat.googleCalls++;
      return { text: "paid", provenance: { provider: "google", model: "stub", transport: "cloud-api", rung: "alternate", turn: req.turn, schemaEnforcement: "native", durationMs: 1, promptChars: 1 } };
    },
  }),
}));

const { reason } = await import("../../lib/text/router.ts");

const VARS = ["TEXT_ENV", "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "SPEND_STORE", "LIGHTTRACK_URL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) saved[v] = process.env[v];
  process.env.TEXT_ENV = "local";
  process.env.LOCAL_BINARIES = "on";
  process.env.GOOGLE_AI_API_KEY = "stub-key";
  process.env.SPEND_STORE = "memory";
  delete process.env.LIGHTTRACK_URL;
  seat.fail = null;
  seat.googleCalls = 0;
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

const caught = (p: Promise<unknown>): Promise<TextError> => p.then(() => { throw new Error("served"); }, (e: unknown) => e as TextError);

describe("a signed-out seat on the local ladder", () => {
  it("does not reach the google rung, and says why it stopped", async () => {
    const err = await caught(reason({ turn: "edit-plan", prompt: "p" }));
    expect(err.kind).toBe("not-logged-in");
    expect(err.message).toMatch(/not logged in/);
    expect(seat.googleCalls).toBe(0);
  });

  it("stops on every turn whose plan puts google after the seat", async () => {
    for (const turn of ["compose", "research", "repair", "ad-ideas", "sound-hunt"] as const) {
      const err = await caught(reason({ turn, prompt: "p" }));
      expect(err.kind, turn).toBe("not-logged-in");
    }
    expect(seat.googleCalls).toBe(0);
  });

  it("is still reroutable in the taxonomy, and may reach a free rung but never a metered one", () => {
    const e = new TextError("x", "not-logged-in", "claude-cli");
    expect(e.reroutable).toBe(true);
    expect(e.reroutableTo("cloud-api")).toBe(false);
    expect(e.reroutableTo("local-daemon")).toBe(true);
    expect(e.reroutableTo("local-subprocess")).toBe(true);
  });

  it("leaves an absent engine as it was: not-installed still walks to google", async () => {
    seat.fail = { kind: "not-installed" };
    const out = await reason({ turn: "edit-plan", prompt: "p" });
    expect(out.text).toBe("paid");
    expect(out.provenance.reroutedFrom).toEqual([{ provider: "claude-cli", why: "not-installed" }]);
    expect(seat.googleCalls).toBe(1);
  });
});
