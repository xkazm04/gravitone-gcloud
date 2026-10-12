// LANE — THE LIBRARY RENDERS IN PLACE (lib/sound/fromSeed.ts, origin "library"),
// offline and against a temp store.
//
// A draft aimed at ElevenLabs becomes a take through /api/sound/generate, the
// same metered chokepoint every other render uses; the vendor is a canned
// response and any other URL fails the test.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { __resetMusicBudget } from "@/lib/music/budget";
import { fromSeed } from "@/lib/sound/fromSeed";
import { readTakes } from "@/lib/sound/store";
import type { SoundTake } from "@/lib/sound/types";
import { blankSeed, type Seed } from "@/app/library/audio/prompts";
import { POST as generatePOST } from "@/app/api/sound/generate/route";

import { keepEnv } from "./_helpers";

const SECRET = "library-render-secret";
keepEnv(["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "SOUND_KNOWLEDGE_DIR", "ELEVENLABS_API_KEY", "MUSIC_BUDGET_SECONDS_PER_WINDOW", "NEXT_PUBLIC_DEV_AUTH", ACCESS_SECRET_VAR]);

let root = "";
const realFetch = globalThis.fetch;
let calls: { url: string; body: unknown }[] = [];

const SEED: Seed = { genres: ["lo-fi"], moods: ["warm"], instruments: ["rhodes"], bpm: 84, key: "A minor", avoid: ["vocals"] };

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "library-render-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.SOUND_LEDGER_PATH = path.join(root, "ledger.json");
  process.env.SOUND_KNOWLEDGE_DIR = path.join(root, "knowledge");
  process.env.ELEVENLABS_API_KEY = "probe-key";
  delete process.env.MUSIC_BUDGET_SECONDS_PER_WINDOW;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  __resetMusicBudget();
  __resetRateLimit();
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    if (!url.startsWith("https://api.elevenlabs.io/")) throw new Error(`probe: unexpected network call to ${url}`);
    return Response.json({ audio_base_64: Buffer.from(new Uint8Array(3000).fill(5)).toString("base64"), composition_plan: { chunks: [] }, song_id: "song-lib-1" });
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(root, { recursive: true, force: true });
});

let ipN = 0;
const post = (json: unknown) =>
  generatePOST(
    new Request("http://localhost/api/sound/generate", {
      method: "POST",
      headers: { authorization: `Bearer ${SECRET}`, "x-forwarded-for": `10.8.${++ipN % 250}.1`, "content-type": "application/json" },
      body: JSON.stringify(json),
    }),
  );

test("fromSeed: an ElevenLabs seed is a valid library request; the exclusions ride as the negative, once", async () => {
  const req = fromSeed(SEED, "elevenlabs");
  expect(req.origin).toBe("library");
  expect(req.negative).toContain("vocals");
  expect(req.prompt).not.toMatch(/vocals/i);
  expect(req.terms).toEqual({ genre: ["lo-fi"], mood: ["warm"], instrument: ["rhodes"], sfxCategory: null });
  expect(req.tempoBpm).toBe(84);
  expect(req.key).toBe("A minor");
  expect(fromSeed(blankSeed(), "elevenlabs").negative).toBeNull();
  expect(() => fromSeed(SEED, "suno")).toThrow(/Suno/);

  const res = await post(req);
  expect(res.status).toBe(201);
  expect((calls[0].body as { prompt: string }).prompt).toMatch(/\. No vocals\.$/);
  const { take } = (await res.json()) as { take: SoundTake };
  expect(take.origin).toBe("library");
  expect(take.verdict).toBe("unjudged");
});

test("render from a variation: the take carries its parent, draft and the one change", async () => {
  const first = (await (await post(fromSeed(SEED, "elevenlabs"))).json()) as { take: SoundTake };
  const variation = { axis: "tempo", diff: ["84 → 96 BPM"] };
  const res = await post(fromSeed({ ...SEED, bpm: 96 }, "elevenlabs", {}, { parentId: first.take.id, draftId: "dr-test1", variation }));
  expect(res.status).toBe(201);
  const { take } = (await res.json()) as { take: SoundTake };
  expect(take.parentId).toBe(first.take.id);
  expect(take.draftId).toBe("dr-test1");
  expect(take.variation).toEqual(variation);
  expect(take.verdict).toBe("unjudged");
  expect((await readTakes()).takes.length).toBe(2);
});

test("a spend-ceiling refusal shows the vendor's sentence and files no take", async () => {
  process.env.MUSIC_BUDGET_SECONDS_PER_WINDOW = "10";
  const res = await post(fromSeed(SEED, "elevenlabs", {}, { durationS: 30 }));
  expect(res.status).toBe(402);
  const b = (await res.json()) as { error: string };
  expect(b.error.length).toBeGreaterThan(10);
  expect(calls.length).toBe(0);
  expect((await readTakes()).takes.length).toBe(0);
});

test("origin library is a compose only; a stray parent on another origin is dropped", async () => {
  expect((await post({ ...fromSeed(SEED, "elevenlabs"), op: "plan" })).status).toBe(400);
  const res = await post({ ...fromSeed(SEED, "elevenlabs"), origin: "lab", parentId: "st-abcdef" });
  const { take } = (await res.json()) as { take: SoundTake };
  expect(take.parentId).toBeNull();
});
