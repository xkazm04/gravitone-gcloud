// LANE — THE LIBRARY RENDERS IN PLACE (origin "library" through lib/sound/generate.ts),
// offline and against a temp store.
//
// A draft aimed at ElevenLabs becomes a take through generateTake, the same metered
// chokepoint every other render uses; the vendor is a canned response and any other
// URL fails the test. Phase 6 L70: v1's /api/sound/generate route retired, and with it
// the v1 Library composer's request builder (lib/sound/fromSeed.ts; the recipe's two
// vendor dialects live on in packages/ui/src/components/audio/recipe.ts, tested there).
// The request below is the one fromSeed built - kept here as data - so what is pinned
// is the chokepoint's half: the exclusions ride as the negative, the lineage is filed,
// a spend refusal files nothing, and origin "library" is a compose only.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { __resetMusicBudget } from "@/lib/music/budget";
import { readTakes } from "@/lib/sound/store";
import { generateTake, parseGenerateRequest } from "@/lib/sound/generate";
import { toErrorResponse } from "@/lib/sound/http";
import type { GenerateRequest, SoundTake } from "@/lib/sound/types";

import { keepEnv } from "./_helpers";

const SECRET = "library-render-secret";
keepEnv(["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "SOUND_KNOWLEDGE_DIR", "ELEVENLABS_API_KEY", "MUSIC_BUDGET_SECONDS_PER_WINDOW", "NEXT_PUBLIC_DEV_AUTH", ACCESS_SECRET_VAR]);

let root = "";
const realFetch = globalThis.fetch;
let calls: { url: string; body: unknown }[] = [];

/** What v1's fromSeed built for an ElevenLabs draft of lo-fi / warm / rhodes at 84 BPM in
 *  A minor, avoiding vocals: the exclusions as `negative`, never in the prompt. */
const libraryRequest = (over: Partial<GenerateRequest> = {}): GenerateRequest => ({
  kind: "music",
  provider: "elevenlabs",
  op: "compose",
  prompt: "Lo-fi, warm, with rhodes, at 84 BPM in A minor.",
  negative: "vocals",
  durationS: 30,
  loop: null,
  promptInfluence: null,
  technique: ["single-sentence", "negative-styles"],
  terms: { genre: ["lo-fi"], mood: ["warm"], instrument: ["rhodes"], sfxCategory: null },
  tempoBpm: 84,
  key: "A minor",
  origin: "library",
  parentId: null,
  draftId: null,
  variation: null,
  sourceTakeId: null,
  editModes: null,
  plan: null,
  huntId: null,
  nodeId: null,
  title: null,
  ...over,
});

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

/** generateTake through its own door (parseGenerateRequest), answered as the retired route
 *  answered it: 201 with the take, or the engine's own status and sentence (toErrorResponse). */
const post = async (json: unknown): Promise<Response> => {
  try {
    return Response.json({ take: await generateTake(parseGenerateRequest(JSON.parse(JSON.stringify(json)))) }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
};

test("a library request renders: the exclusions ride as the negative, once, at the vendor", async () => {
  const res = await post(libraryRequest());
  expect(res.status).toBe(201);
  expect((calls[0].body as { prompt: string }).prompt).toMatch(/\. No vocals\.$/);
  const { take } = (await res.json()) as { take: SoundTake };
  expect(take.origin).toBe("library");
  expect(take.verdict).toBe("unjudged");
});

test("render from a variation: the take carries its parent, draft and the one change", async () => {
  const first = (await (await post(libraryRequest())).json()) as { take: SoundTake };
  const variation = { axis: "tempo", diff: ["84 → 96 BPM"] };
  const res = await post(libraryRequest({ tempoBpm: 96, parentId: first.take.id, draftId: "dr-test1", variation }));
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
  const res = await post(libraryRequest({ durationS: 30 }));
  expect(res.status).toBe(402);
  const b = (await res.json()) as { error: string };
  expect(b.error.length).toBeGreaterThan(10);
  expect(calls.length).toBe(0);
  expect((await readTakes()).takes.length).toBe(0);
});

test("origin library is a compose only; a stray parent on another origin is dropped", async () => {
  expect((await post(libraryRequest({ op: "plan" }))).status).toBe(400);
  const res = await post(libraryRequest({ origin: "lab", parentId: "st-abcdef" }));
  const { take } = (await res.json()) as { take: SoundTake };
  expect(take.parentId).toBeNull();
});
