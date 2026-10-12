// LANE — IMAGING STUDIO (dynamic). The Leonardo web-studio provider through the
// REAL router, on the fake driver (LEONARDO_STUDIO_DRIVER=fake): no browser, no
// network to Leonardo, no credits.
//
// What it pins, in the order the music-video spark's WP1 brief lists them:
//   1. PREFER-ONLY. A request that names the studio is served by it, with
//      provenance; a request that does not is NEVER served by it — not when
//      every planned vendor fails with a reroutable error, not in prod, not for
//      another capability. This is the property that keeps the operator's
//      prepaid studio credits out of every Frames / poster / playground call.
//   2. Configured by LEONARDO_STUDIO_CDP or the fake; unconfigured is the
//      router's ordinary no-key skip, naming the variable.
//   5. Health passes through, with the fake's sentence or the real driver's
//      "not running" on a closed port (which never attaches to anything).
//   6. The fake's still is a real 1280x720 PNG, and a failWith sentence reaches
//      the caller verbatim.

import { test, expect } from "@playwright/test";
import { inflateSync } from "node:zlib";
import { keepEnv } from "./_helpers";
import { __resetBudget, BUDGET_VAR, WINDOW_VAR, FLOOR_VAR, spendRows } from "@/lib/imaging/budget";
import { ImagingError } from "@/lib/imaging/errors";
import { generate, isPreferOnly, orderFor, planFor } from "@/lib/imaging/router";
import {
  FAKE_LEONARDO_STUDIO,
  leonardoStudioHealth,
  resetFakeLeonardoStudio,
  studioCreditsOf,
} from "@/lib/imaging/providers/leonardoStudio";
import { dimensionsOf, studioHealthOn } from "@/lib/imaging/studio/driver";
import type { Capability } from "@/lib/imaging/types";

const realFetch = globalThis.fetch;

keepEnv([
  BUDGET_VAR,
  WINDOW_VAR,
  FLOOR_VAR,
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "LEONARDO_API_KEY",
  "OLLAMA_HOST",
  "IMAGING_ENV",
  "LEONARDO_STUDIO_CDP",
  "LEONARDO_STUDIO_DRIVER",
]);

test.beforeEach(() => {
  __resetBudget();
  resetFakeLeonardoStudio();
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  delete process.env[FLOOR_VAR];
  delete process.env.OLLAMA_HOST;
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.LEONARDO_API_KEY;
  delete process.env.LEONARDO_STUDIO_CDP;
  process.env.IMAGING_ENV = "dev";
  process.env.LOCAL_BINARIES = "off"; // agy unavailable, and nothing may launch Chrome
  process.env.LEONARDO_STUDIO_DRIVER = "fake";
  // Nothing in this lane may reach a vendor: a studio call that leaked onto
  // the network would show up here as a failure, not as a spend.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    throw new Error(`probe: unexpected fetch ${String(input)}`);
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

async function failure(p: Promise<unknown>): Promise<ImagingError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ImagingError);
    return e as ImagingError;
  }
  throw new Error("expected the request to fail");
}

test("1a. prefer leonardo-studio -> served by it, one call, provenance in studio credits", async () => {
  const out = await generate({
    prompt: "a lighthouse at dusk",
    negativePrompt: "text, logos",
    aspect: "16:9",
    count: 1,
    prefer: "leonardo-studio",
  });
  expect(out.provenance.provider).toBe("leonardo-studio");
  expect(out.provenance.model).toBe("openai/gpt-image-2.5-sunburst");
  expect(out.provenance.modelBasis).toBe("requested");
  expect(out.provenance.remoteIds).toEqual(["fake-gen-0001"]);
  expect(out.provenance.reroutedFrom).toBeUndefined();
  // Credits, not dollars: no USD figure is invented for a prepaid pool.
  expect(out.provenance.costUsd).toBeUndefined();
  expect(out.provenance.costBasis).toBe("unpriced");
  expect(studioCreditsOf(out.provenance)).toBe(8);
  // The negative prompt travelled as prose inside the one prompt box, and the
  // result says so.
  expect(out.provenance.negativePromptChannel).toBe("prose");
  expect(FAKE_LEONARDO_STUDIO.calls).toEqual([{ prompt: "a lighthouse at dusk\n\nAvoid: text, logos", aspect: "16:9" }]);
  // The meter still saw the call (an unpriced call books the stand-in estimate).
  const rows = await spendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].provider).toBe("leonardo-studio");
  expect(rows[0].outcome).toBe("served");
});

test("6a. the fake still is a decodable 1280x720 PNG", async () => {
  const out = await generate({ prompt: "p", aspect: "16:9", count: 1, prefer: "leonardo-studio" });
  const [img] = out.images;
  expect(img.mime).toBe("image/png");
  const bytes = Buffer.from(img.base64, "base64");
  expect(dimensionsOf(bytes)).toEqual({ width: 1280, height: 720 });
  expect({ width: img.width, height: img.height }).toEqual({ width: 1280, height: 720 });
  // Inflate the IDAT to prove the file is whole: 720 rows of 1 filter byte + 3x1280.
  const len = bytes.readUInt32BE(33);
  expect(bytes.toString("ascii", 37, 41)).toBe("IDAT");
  expect(inflateSync(bytes.subarray(41, 41 + len)).length).toBe(720 * (1 + 3 * 1280));
});

test("1b. NOT prefer -> never the studio, even when every planned vendor fails reroutably", async () => {
  // google and leonardo both configured and both rate-limited: the chain walks
  // google -> leonardo and ends. The studio is configured too, and must not be
  // the next hop.
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
  process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  process.env.LEONARDO_STUDIO_CDP = "http://127.0.0.1:9399";
  const hosts = new Set<string>();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    hosts.add(new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).hostname);
    return new Response("slow down", { status: 429 });
  }) as typeof fetch;
  const err = await failure(generate({ prompt: "a frame", aspect: "16:9", count: 1 }));
  // Both planned vendors were really tried and really failed; the headline is
  // the plan's first elimination (agy, off), as for any exhausted chain.
  expect([...hosts].sort()).toEqual(["cloud.leonardo.ai", "generativelanguage.googleapis.com"]);
  expect(err.provider).not.toBe("leonardo-studio");
  expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(0);
});

test("1c. NOT prefer, nothing else configured -> the plan's no-key, not the studio", async () => {
  const err = await failure(generate({ prompt: "a frame", aspect: "16:9", count: 1 }));
  expect(err.kind).toBe("no-key");
  expect(err.provider).not.toBe("leonardo-studio");
  expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(0);
  // A preference for a PLANNED vendor does not open the door either.
  await failure(generate({ prompt: "a frame", aspect: "16:9", count: 1, prefer: "leonardo" }));
  expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(0);
});

test("1d. no plan row in either env holds a prefer-only provider; only `prefer` puts it in a chain, alone", () => {
  const caps: Capability[] = ["generate", "edit", "recognize"];
  for (const env of ["dev", "prod"] as const)
    for (const cap of caps) {
      expect(planFor(cap, env).filter(isPreferOnly)).toEqual([]);
      expect(orderFor(cap, {}, env)).not.toContain("leonardo-studio");
      expect(orderFor(cap, { prefer: "google" }, env)).not.toContain("leonardo-studio");
      // Named: the whole chain, with no dollar-billed vendor behind it.
      expect(orderFor(cap, { prefer: "leonardo-studio" }, env)).toEqual(["leonardo-studio"]);
    }
  // `avoid` naming it cancels the preference.
  expect(orderFor("generate", { prefer: "leonardo-studio", avoid: "leonardo-studio" }, "dev")).not.toContain("leonardo-studio");
});

test("1e. prefer leonardo-studio in prod -> served by it; the prod plan is untouched otherwise", async () => {
  process.env.IMAGING_ENV = "prod";
  const out = await generate({ prompt: "p", aspect: "16:9", count: 1, prefer: "leonardo-studio" });
  expect(out.provenance.provider).toBe("leonardo-studio");
});

test("2a. unconfigured (no LEONARDO_STUDIO_CDP, no fake) -> no-key naming the variable; no fallback billed", async () => {
  delete process.env.LEONARDO_STUDIO_DRIVER;
  process.env.GOOGLE_AI_API_KEY = "probe-google-key"; // a dollar vendor that WOULD answer
  const err = await failure(generate({ prompt: "p", aspect: "16:9", count: 1, prefer: "leonardo-studio" }));
  expect(err.kind).toBe("no-key");
  expect(err.provider).toBe("leonardo-studio");
  expect(err.message).toContain("LEONARDO_STUDIO_CDP");
  expect(await spendRows()).toHaveLength(0);
  expect(await leonardoStudioHealth()).toEqual({
    ok: false,
    reason: "leonardo studio is not configured (LEONARDO_STUDIO_CDP is unset)",
  });
});

test("2b. LEONARDO_STUDIO_CDP alone configures it (real driver selected, health on a closed port says not running)", async () => {
  delete process.env.LEONARDO_STUDIO_DRIVER;
  process.env.LEONARDO_STUDIO_CDP = "http://127.0.0.1:9399";
  expect(orderFor("generate", { prefer: "leonardo-studio" }, "dev")).toEqual(["leonardo-studio"]);
  // 9399 answers nothing and LOCAL_BINARIES=off: no attach, no launch.
  globalThis.fetch = realFetch;
  expect(await leonardoStudioHealth()).toEqual({ ok: false, reason: "leonardo studio browser not running" });
  expect(await studioHealthOn("http://127.0.0.1:9399")).toEqual({ ok: false, reason: "leonardo studio browser not running" });
});

test("6b. failWith -> the driver's sentence verbatim in the error", async () => {
  FAKE_LEONARDO_STUDIO.failWith = () => "not signed in to leonardo";
  const err = await failure(generate({ prompt: "p", aspect: "16:9", count: 1, prefer: "leonardo-studio" }));
  expect(err.message).toBe("not signed in to leonardo");
  expect(err.provider).toBe("leonardo-studio");
  expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(1);
});

test("5. health passthrough from the fake", async () => {
  expect(await leonardoStudioHealth()).toEqual({ ok: true });
  FAKE_LEONARDO_STUDIO.health = { ok: false, reason: "leonardo studio is out of credits (0 left)" };
  expect(await leonardoStudioHealth()).toEqual({ ok: false, reason: "leonardo studio is out of credits (0 left)" });
});

test("count other than 1 is refused before the driver is called", async () => {
  const err = await failure(generate({ prompt: "p", aspect: "16:9", count: 2, prefer: "leonardo-studio" }));
  expect(err.kind).toBe("invalid-request");
  expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(0);
});
