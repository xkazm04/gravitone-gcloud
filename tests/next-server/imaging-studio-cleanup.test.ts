// THE STUDIO'S CLEANUP (spark scout-idea-artboards WP-I1) - every Leonardo studio generation is
// deleted once its still is held (operator, 2026-10-23: "after downloading image from Leonardo
// always delete afterwards to keep it clean"). Through the REAL router on the fake driver, which
// records its deletes and never reaches the network; then the real REST delete on a fake fetch -
// no browser, no key that works, nothing spent.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { __resetBudget } from "../../lib/imaging/budget.ts";
import { cleanupStudioGeneration, deleteStudioGeneration, FAKE_LEONARDO_STUDIO, resetFakeLeonardoStudio } from "../../lib/imaging/providers/leonardoStudio.ts";
import { generate } from "../../lib/imaging/router.ts";

const KEEP = ["SPEND_STORE", "IMAGING_ENV", "LOCAL_BINARIES", "LEONARDO_STUDIO_DRIVER", "LEONARDO_STUDIO_CDP", "LEONARDO_API_KEY", "GOOGLE_AI_API_KEY", "OLLAMA_HOST"] as const;
const saved = Object.fromEntries(KEEP.map((k) => [k, process.env[k]]));
let warned: string[] = [];
let fetched: { url: string; method: string; auth: string | null }[] = [];

beforeEach(() => {
  for (const k of KEEP) delete process.env[k];
  process.env["SPEND_STORE"] = "memory";
  process.env["IMAGING_ENV"] = "dev";
  process.env["LOCAL_BINARIES"] = "off";
  process.env["LEONARDO_STUDIO_DRIVER"] = "fake";
  __resetBudget();
  resetFakeLeonardoStudio();
  warned = [];
  fetched = [];
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void warned.push(a.map(String).join(" ")));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of KEEP) {
    const v = saved[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const still = () => generate({ prompt: "a lighthouse at dusk", aspect: "16:9", count: 1, prefer: "leonardo-studio" });

describe("the fake studio", () => {
  it("deletes exactly the generation each call made, once its still is held, and says so on the provenance", async () => {
    const a = await still();
    const b = await still();
    expect(a.provenance.remoteIds).toEqual(["fake-gen-0001"]);
    expect(b.provenance.remoteIds).toEqual(["fake-gen-0002"]);
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual(["fake-gen-0001", "fake-gen-0002"]);
    expect([a.provenance.cleanup, b.provenance.cleanup]).toEqual(["deleted", "deleted"]);
    expect(a.images).toHaveLength(1);
    expect(warned).toEqual([]);
  });

  it("a delete that fails leaves the image returned, cleanup failed, and one log line naming the id", async () => {
    FAKE_LEONARDO_STUDIO.failDelete = () => "leonardo answered 500";
    const out = await still();
    expect(out.images).toHaveLength(1);
    expect(out.provenance.cleanup).toBe("failed");
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual(["fake-gen-0001"]);
    expect(warned).toEqual(['[imaging] cleanup-failed provider=leonardo-studio id=fake-gen-0001 msg="leonardo answered 500"']);
  });

  it("a generation that failed made nothing to delete", async () => {
    FAKE_LEONARDO_STUDIO.failWith = () => "not signed in to leonardo";
    await expect(still()).rejects.toThrow("not signed in to leonardo");
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual([]);
  });
});

describe("the real delete, over REST", () => {
  it("no LEONARDO_API_KEY: cleanup failed, one log line naming why, nothing sent", async () => {
    delete process.env["LEONARDO_STUDIO_DRIVER"];
    expect(await cleanupStudioGeneration("gen-abc")).toBe("failed");
    expect(warned).toEqual(['[imaging] cleanup-failed provider=leonardo-studio id=gen-abc msg="LEONARDO_API_KEY is unset; the generation stays in the studio library"']);
    expect(FAKE_LEONARDO_STUDIO.deletes).toEqual([]);
  });

  it("with a key: one DELETE of that generation with the bearer; a refusal is retried once, then logged without the key", async () => {
    delete process.env["LEONARDO_STUDIO_DRIVER"];
    const key = "probe-key-not-real-0123";
    process.env["LEONARDO_API_KEY"] = key;
    let status = 200;
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      fetched.push({ url: String(input), method: init?.method ?? "GET", auth: headers.get("authorization") });
      return new Response(status === 200 ? JSON.stringify({ delete_generations_by_pk: { id: "gen-abc" } }) : "upstream down", { status });
    });
    await deleteStudioGeneration("gen-abc");
    expect(fetched).toEqual([{ url: "https://cloud.leonardo.ai/api/rest/v1/generations/gen-abc", method: "DELETE", auth: `Bearer ${key}` }]);
    expect(await cleanupStudioGeneration("gen-abc")).toBe("deleted");

    status = 502;
    fetched = [];
    expect(await cleanupStudioGeneration("gen-def")).toBe("failed");
    expect(fetched.map((f) => f.method)).toEqual(["DELETE", "DELETE"]);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toMatch(/^\[imaging\] cleanup-failed provider=leonardo-studio id=gen-def msg="leonardo-studio returned 502 for DELETE /);
    expect(warned.join("\n")).not.toContain(key);
  });
});
