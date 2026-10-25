// A CLIP THE VENDOR SERVED SURVIVES THE STORE'S REFUSAL (lib/sound/generate.ts generateTake).
//
// The bytes exist only in memory until createTake lands them; a store that cannot file the take
// (an unreadable takes.json, a lock held past its wait) used to drop the billed clip, and the
// retry bought it again. The clip is now parked under the store and the next identical request
// files it without calling the vendor. globalThis.fetch is a canned ElevenLabs that counts.

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateTake, parseGenerateRequest } from "../../lib/sound/generate.ts";
import { readTakes, SoundError } from "../../lib/sound/store.ts";

const ENV = ["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "ELEVENLABS_API_KEY", "GRAVITONE_DRY_ONLY", "MUSIC_BUDGET_SECONDS_PER_WINDOW"] as const;
let saved: Record<string, string | undefined> = {};
let root = "";
let vendorCalls = 0;
const realFetch = globalThis.fetch;

const sfxReq = () =>
  parseGenerateRequest({
    kind: "sfx",
    provider: "elevenlabs",
    op: "sfx",
    prompt: "door slam, oak",
    negative: null,
    durationS: 1.5,
    loop: false,
    technique: [],
    terms: { genre: [], mood: [], instrument: [], sfxCategory: "impact" },
    tempoBpm: null,
    key: null,
    origin: "lab",
    sourceTakeId: null,
    editModes: null,
    plan: null,
    huntId: null,
    nodeId: null,
    title: "impact · 1/1",
  });

beforeEach(() => {
  saved = Object.fromEntries(ENV.map((e) => [e, process.env[e]]));
  root = mkdtempSync(path.join(tmpdir(), "gt-sound-kept-"));
  process.env["SOUND_STORE_DIR"] = path.join(root, "store");
  process.env["SOUND_LEDGER_PATH"] = path.join(root, "ledger.json");
  process.env["ELEVENLABS_API_KEY"] = "kept-test-key";
  delete process.env["GRAVITONE_DRY_ONLY"];
  delete process.env["MUSIC_BUDGET_SECONDS_PER_WINDOW"];
  mkdirSync(process.env["SOUND_STORE_DIR"], { recursive: true });
  vendorCalls = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.endsWith("/v1/sound-generation")) throw new Error(`unexpected network call to ${url}`);
    vendorCalls++;
    return new Response(new Uint8Array(2000).fill(3), { headers: { "content-type": "audio/mpeg" } });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const e of ENV) {
    if (saved[e] === undefined) delete process.env[e];
    else process.env[e] = saved[e];
  }
  rmSync(root, { recursive: true, force: true });
});

describe("a clip the vendor served while the store would not file it", () => {
  it("is kept: the refusal is a 503, the retry files the same clip with ONE vendor call in all", async () => {
    const takesJson = path.join(process.env["SOUND_STORE_DIR"] ?? "", "takes.json");
    writeFileSync(takesJson, "{ not json");
    let refused: unknown;
    try {
      await generateTake(sfxReq());
    } catch (e) {
      refused = e;
    }
    expect(refused).toBeInstanceOf(SoundError);
    expect((refused as SoundError).status).toBe(503);
    expect(vendorCalls).toBe(1);
    const parked = path.join(process.env["SOUND_STORE_DIR"] ?? "", "unfiled");
    expect(readdirSync(parked)).toHaveLength(1);

    rmSync(takesJson); // the store heals
    const take = await generateTake(sfxReq());
    expect(vendorCalls, "the retry bought the clip again").toBe(1);
    expect(take.file?.bytes).toBe(2000);
    expect((await readTakes()).takes.map((t) => t.id)).toEqual([take.id]);
    expect(readdirSync(parked)).toEqual([]);
  });

  it("a request nothing parked still calls the vendor, and a clean filing parks nothing", async () => {
    await generateTake(sfxReq());
    expect(vendorCalls).toBe(1);
    const parked = path.join(process.env["SOUND_STORE_DIR"] ?? "", "unfiled");
    expect(() => readdirSync(parked)).toThrow();
  });
});
