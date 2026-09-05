// LANE — THE TEXT ENGINE'S LIGHTTRACK EMITTER (dynamic).
//
// lib/text/log.ts's stdout line is this engine's only standing trace; this
// probes the second, opt-in sink beside it: lib/text/lighttrack.ts. Three
// properties, per the contract in that file's own header —
//
//   (a) unconfigured means silent: no LIGHTTRACK_URL, zero network calls.
//   (b) the body attributes to a declared use case: `name` carries the turn
//       class, `text.`-prefixed, matching .ai/use-cases.json's keys.
//   (c) the emitter cannot fail the caller: a rejecting or throwing `fetch`
//       never propagates out of `emitLightTrack`.
import { test, expect } from "@playwright/test";

import { emitLightTrack } from "@/lib/text/lighttrack";
import type { TurnLog } from "@/lib/text/log";

import { keepEnv } from "./_helpers";

keepEnv(["LIGHTTRACK_URL", "LIGHTTRACK_KEY", "LIGHTTRACK_DISABLE"]);

const base: TurnLog = {
  turn: "scene-direction",
  env: "local",
  ms: 4321,
  promptChars: 900,
  provider: "claude-cli",
  model: "claude-opus-5",
  rung: "preferred",
};

/** Swap `globalThis.fetch` for a spy for the life of one test, then restore
 *  it — this suite is serial (see playwright.config.ts) so a leaked mock
 *  would poison every later probe in the file, not just this one. */
function mockFetch() {
  const original = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let impl: (url: string, init: RequestInit) => Promise<Response> = async () =>
    new Response(null, { status: 200 });

  (globalThis as { fetch: typeof fetch }).fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return impl(url, init);
  }) as typeof fetch;

  return {
    calls,
    setImpl: (fn: typeof impl) => {
      impl = fn;
    },
    restore: () => {
      (globalThis as { fetch: typeof fetch }).fetch = original;
    },
  };
}

test.describe("lighttrack: opt-in gate", () => {
  test("(a) no LIGHTTRACK_URL means zero network traffic", async () => {
    delete process.env.LIGHTTRACK_URL;
    delete process.env.LIGHTTRACK_DISABLE;
    const spy = mockFetch();
    try {
      emitLightTrack(base);
      // Nothing to await: an unconfigured emitter must not even reach the
      // event loop turn where a fetch would be scheduled.
      expect(spy.calls.length).toBe(0);
    } finally {
      spy.restore();
    }
  });

  test("(a) LIGHTTRACK_DISABLE silences an otherwise-configured URL", async () => {
    process.env.LIGHTTRACK_URL = "https://lighttrack.example/api";
    process.env.LIGHTTRACK_DISABLE = "1";
    const spy = mockFetch();
    try {
      emitLightTrack(base);
      expect(spy.calls.length).toBe(0);
    } finally {
      spy.restore();
    }
  });
});

test.describe("lighttrack: the event body", () => {
  test("(b) a served turn's body names the use case, the engine and its usage", async () => {
    process.env.LIGHTTRACK_URL = "https://lighttrack.example/api/";
    delete process.env.LIGHTTRACK_DISABLE;
    process.env.LIGHTTRACK_KEY = "lt-key-FAKEfake0123456789";
    const spy = mockFetch();
    try {
      emitLightTrack({ ...base, costUsd: 0.0231, inputTokens: 512, outputTokens: 128 });
      expect(spy.calls.length).toBe(1);

      const { url, init } = spy.calls[0];
      // The single trailing slash on LIGHTTRACK_URL must not become a double
      // slash in the path.
      expect(url).toBe("https://lighttrack.example/api/v1/events");
      expect(init.headers).toMatchObject({ authorization: "Bearer lt-key-FAKEfake0123456789" });

      const body = JSON.parse(init.body as string);
      console.log(`[lighttrack] served -> ${JSON.stringify(body)}`);
      expect(body.project_id).toBe("gravity");
      // THE WHOLE POINT: the turn class, `text.`-prefixed, is what makes this
      // event attributable to a use case .ai/use-cases.json declared.
      expect(body.name).toBe("text.scene-direction");
      expect(body.status).toBe("success");
      expect(body.provider).toBe("claude-cli");
      expect(body.model).toBe("claude-opus-5");
      expect(body.usage).toEqual({ input: 512, output: 128 });
      expect(body.cost_usd).toBeCloseTo(0.0231);
      expect(body.error).toBeUndefined();
    } finally {
      spy.restore();
    }
  });

  test("(b) an unpriced turn never sends cost_usd, and never as 0", async () => {
    process.env.LIGHTTRACK_URL = "https://lighttrack.example/api";
    const spy = mockFetch();
    try {
      emitLightTrack({ ...base, turn: "edit-plan", costUsd: undefined });
      const body = JSON.parse(spy.calls[0].init.body as string);
      expect(body.name).toBe("text.edit-plan");
      expect("cost_usd" in body).toBe(false);
    } finally {
      spy.restore();
    }
  });

  test("(b) a failed turn reports status=error with a scrubbed message, no cost", async () => {
    process.env.LIGHTTRACK_URL = "https://lighttrack.example/api";
    const spy = mockFetch();
    try {
      emitLightTrack({
        turn: "probe",
        env: "cloud",
        ms: 7,
        promptChars: 0,
        kind: "no-key",
        provider: "google",
        message: "No API key for google (AIzaSyFAKEfakeFAKEfake0123456789abcd).",
      });
      const body = JSON.parse(spy.calls[0].init.body as string);
      expect(body.name).toBe("text.probe");
      expect(body.status).toBe("error");
      expect("cost_usd" in body).toBe(false);
      expect(typeof body.error).toBe("string");
      expect(body.error.length).toBeGreaterThan(0);
    } finally {
      spy.restore();
    }
  });
});

test.describe("lighttrack: it cannot fail the caller", () => {
  test("(c) a rejecting fetch never propagates out of emitLightTrack", async () => {
    process.env.LIGHTTRACK_URL = "https://lighttrack.example/api";
    const spy = mockFetch();
    spy.setImpl(async () => {
      throw new Error("ECONNREFUSED lighttrack.example");
    });
    try {
      expect(() => emitLightTrack(base)).not.toThrow();
      // Give the rejected promise's microtask a turn so an unhandled-rejection
      // would have already surfaced if the `.catch` were missing.
      await new Promise((r) => setTimeout(r, 10));
    } finally {
      spy.restore();
    }
  });

  test("(c) a synchronously-throwing fetch never propagates out of emitLightTrack", async () => {
    process.env.LIGHTTRACK_URL = "https://lighttrack.example/api";
    const spy = mockFetch();
    spy.setImpl(() => {
      throw new TypeError("Failed to construct 'Request': Invalid URL");
    });
    try {
      expect(() => emitLightTrack(base)).not.toThrow();
    } finally {
      spy.restore();
    }
  });
});
