// LANE — THE SOUND STORE (lib/sound, app/api/sound/*, pipeline/sound.mts),
// offline and against a temp store.
//
// What is pinned is the round-4 contract (lib/sound/types.ts and the brief's
// HTTP section), driven through the REAL route handlers and the REAL engine:
//
//   · the take rules — kept enters pending, finalized needs a label (409) and
//     stamps finalizedAt, a verdict change stamps judgedAt, leaving kept takes
//     the card off the board, an id is filed once (the Library migration's
//     idempotence), and only a fixture may have no bytes;
//   · the ledger — every judgement of a NON-fixture take upserts one row, a
//     fixture never reaches it, un-judging removes the row;
//   · the strengths map and the knowledge doc — the counts, the rubric means,
//     the top defect, and NOTHING below n=3 claimed;
//   · the file route's content-type and byte ranges;
//   · generate through lib/music, and the hunt map / lesson draft through
//     lib/text's real router, with `globalThis.fetch` REPLACED: the vendor and
//     the model are canned responses, and any other URL fails the test. No
//     ElevenLabs call and no model turn is ever made;
//   · the CLI's verbs in-process (lib/sound/cli.ts), as an agent reads them.
//
// SOUND_STORE_DIR / SOUND_LEDGER_PATH / SOUND_KNOWLEDGE_DIR point at a fresh
// temp dir per test (read lazily per call, lib/sound/store.ts), and the env is
// restored afterwards — this lane is serial and shares one process.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { __resetMusicBudget } from "@/lib/music/budget";
import { runSoundCli } from "@/lib/sound/cli";
import { computeInsights } from "@/lib/sound/insights";
import { renderParams, renderPatterns, MIN_N } from "@/lib/sound/knowledge";
import { rubricMean, type LedgerVerdict } from "@/lib/sound/ledger";
import { huntPrompt, parseHuntMap, sectionsOf } from "@/lib/sound/hunt";
import { readHunts, readLedger, readTakes } from "@/lib/sound/store";
import { createTake } from "@/lib/sound/takes";
import type { Hunt, SoundTake } from "@/lib/sound/types";
import { GET as takesGET, POST as takesPOST, DELETE as takesDELETE } from "@/app/api/sound/takes/route";
import { PATCH as takePATCH } from "@/app/api/sound/takes/[id]/route";
import { GET as fileGET } from "@/app/api/sound/takes/[id]/file/route";
import { POST as generatePOST } from "@/app/api/sound/generate/route";
import { GET as insightsGET } from "@/app/api/sound/insights/route";
import { GET as lessonsGET, POST as lessonsPOST } from "@/app/api/sound/lessons/route";
import { GET as groupsGET, PUT as groupsPUT } from "@/app/api/sound/groups/route";
import { GET as huntsGET, POST as huntsPOST } from "@/app/api/sound/hunts/route";
import { PATCH as huntPATCH } from "@/app/api/sound/hunts/[id]/route";
import { POST as huntLessonPOST } from "@/app/api/sound/hunts/[id]/lesson/route";

import { keepEnv } from "./_helpers";

const SECRET = "sound-probe-secret";
const ENV = [
  "SOUND_STORE_DIR",
  "SOUND_LEDGER_PATH",
  "SOUND_KNOWLEDGE_DIR",
  "ELEVENLABS_API_KEY",
  "GOOGLE_AI_API_KEY",
  "TEXT_ENV",
  "LOCAL_BINARIES",
  "LIGHTTRACK_URL",
  "LIGHTTRACK_DISABLE",
  "MUSIC_BUDGET_SECONDS_PER_WINDOW",
  "NEXT_PUBLIC_DEV_AUTH",
  ACCESS_SECRET_VAR,
];
keepEnv(ENV);

let root = "";
const realFetch = globalThis.fetch;
let calls: { url: string; body: unknown }[] = [];
/** What the replaced fetch answers. Anything it does not recognise throws, so
 *  a path that reached a real network would fail here first. */
let respond: (url: string, body: unknown) => Response | null = () => null;

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sound-probe-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.SOUND_LEDGER_PATH = path.join(root, "ledger.json");
  process.env.SOUND_KNOWLEDGE_DIR = path.join(root, "knowledge");
  delete process.env.ELEVENLABS_API_KEY;
  delete process.env.GOOGLE_AI_API_KEY;
  delete process.env.LIGHTTRACK_URL;
  process.env.LIGHTTRACK_DISABLE = "1";
  process.env.TEXT_ENV = "cloud";
  process.env.LOCAL_BINARIES = "off";
  delete process.env.MUSIC_BUDGET_SECONDS_PER_WINDOW;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  __resetMusicBudget();
  __resetRateLimit();
  calls = [];
  respond = () => null;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: unknown = null;
    try {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    } catch {
      body = init?.body ?? null;
    }
    calls.push({ url, body });
    const r = respond(url, body);
    if (!r) throw new Error(`probe: unexpected network call to ${url}`);
    return r;
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(root, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let ipN = 0;
function rq(pathname: string, init: { method?: string; json?: unknown; form?: FormData; headers?: Record<string, string> } = {}): Request {
  const headers: Record<string, string> = { authorization: `Bearer ${SECRET}`, "x-forwarded-for": `10.9.${++ipN % 250}.1`, ...(init.headers ?? {}) };
  if (init.json !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${pathname}`, {
    method: init.method ?? "GET",
    headers,
    body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
  });
}
async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
/** An mp3-shaped byte run: the store only checks the declared type and size. */
const AUDIO = new Uint8Array(4096).map((_, i) => (i * 7) % 251);

function uploadForm(meta: Partial<SoundTake>, bytes: Uint8Array | null = AUDIO, name = "take.mp3"): FormData {
  const f = new FormData();
  f.set("file", new Blob([bytes ? new Uint8Array(bytes) : new Uint8Array(0)], { type: bytes ? "audio/mpeg" : "" }), name);
  f.set("meta", JSON.stringify(meta));
  return f;
}

async function upload(meta: Partial<SoundTake>, bytes: Uint8Array | null = AUDIO): Promise<{ status: number; take: SoundTake; error?: string }> {
  const res = await takesPOST(rq("/api/sound/takes", { method: "POST", form: uploadForm(meta, bytes) }));
  const b = await body<{ take: SoundTake; error?: string }>(res);
  return { status: res.status, take: b.take, error: b.error };
}

async function patch(id: string, p: Record<string, unknown>) {
  const res = await takePATCH(rq(`/api/sound/takes/${id}`, { method: "PATCH", json: p }), ctx(id));
  return { status: res.status, ...(await body<{ take?: SoundTake; error?: string }>(res)) };
}

/* ── takes: create and the contract's rules ──────────────────────────────── */

test("create: bytes are required except for a fixture; an id is filed once (the migration's idempotence)", async () => {
  const none = await upload({ origin: "import", title: "no bytes" }, null);
  expect(none.status).toBe(400);
  expect(none.error).toMatch(/audio file/);

  const fx = await upload({ id: "seed-au-trk-0000", origin: "fixture", title: "Future Bass sketch 1", verdict: "kept" }, null);
  expect(fx.status).toBe(201);
  expect(fx.take.file).toBeNull();
  expect(fx.take.stage, "a kept take enters pending — fixtures included").toBe("pending");

  const again = await upload({ id: "seed-au-trk-0000", origin: "fixture", title: "a second push" }, null);
  expect(again.status, "a known id answers with the take already filed").toBe(200);
  expect(again.take.title).toBe("Future Bass sketch 1");

  const real = await upload({ origin: "import", terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null } });
  expect(real.status).toBe(201);
  expect(real.take.file?.mime).toBe("audio/mpeg");
  expect(real.take.file?.bytes).toBe(AUDIO.byteLength);
  expect(existsSync(path.join(process.env.SOUND_STORE_DIR!, real.take.file!.path))).toBe(true);
  expect(real.take.verdict).toBe("unjudged");
  expect(real.take.judgedAt).toBeNull();

  const { takes } = await readTakes();
  console.log(`[sound] filed ${takes.length} takes (one fixture pushed twice)`);
  expect(takes.length).toBe(2);

  // GET hides fixtures unless asked, newest first.
  const list = await body<{ takes: SoundTake[] }>(await takesGET(rq("/api/sound/takes")));
  expect(list.takes.map((t) => t.origin)).toEqual(["import"]);
  const withFx = await body<{ takes: SoundTake[] }>(await takesGET(rq("/api/sound/takes?fixtures=1")));
  expect(withFx.takes.length).toBe(2);
  expect((await takesGET(rq("/api/sound/takes?verdict=kpt"))).status, "a typo'd filter is a 400, not everything").toBe(400);
});

test("rules: kept -> pending + judgedAt; finalized needs a label (409) and stamps finalizedAt; leaving kept clears the stage", async () => {
  const { take } = await upload({ origin: "agent", title: "bed" });
  const kept = await patch(take.id, { verdict: "kept", ratings: { melody: 8 } });
  expect(kept.status).toBe(200);
  expect(kept.take!.stage).toBe("pending");
  expect(kept.take!.judgedAt).not.toBeNull();

  // Ratings MERGE, one dimension per keypress.
  const more = await patch(take.id, { ratings: { instrument_choice: 6 } });
  expect(more.take!.ratings).toEqual({ melody: 8, instrument_choice: 6 });
  expect(more.take!.judgedAt, "a rating is not a verdict change").toBe(kept.take!.judgedAt);

  const noLabel = await patch(take.id, { stage: "finalized" });
  expect(noLabel.status).toBe(409);
  expect(noLabel.error).toMatch(/label/);

  const fin = await patch(take.id, { stage: "finalized", label: "warm lo-fi bed" });
  expect(fin.status).toBe(200);
  expect(fin.take!.finalizedAt).not.toBeNull();
  expect((await patch(take.id, { label: null })).status, "a finalized take cannot lose its label").toBe(409);

  const rej = await patch(take.id, { verdict: "rejected", reasons: ["off-brief"] });
  expect(rej.take!.stage).toBeNull();
  expect(rej.take!.finalizedAt).toBeNull();
  expect((await patch(take.id, { stage: "edit" })).status, "a rejected take has no stage").toBe(409);
  expect((await patch(take.id, { reasons: ["not-a-code"] })).status).toBe(400);
  expect((await patch(take.id, { origin: "fixture" })).status, "origin is not patchable").toBe(400);
  expect((await patch("st-nothing", { verdict: "kept" })).status).toBe(404);
});

/* ── the ledger ───────────────────────────────────────────────────────────── */

test("ledger: a fixture's judgement never enters; a real take upserts ONE row; un-judging removes it", async () => {
  const fx = await upload({ origin: "fixture", title: "sample" }, null);
  await patch(fx.take.id, { verdict: "rejected", reasons: ["vocal-garble"] });
  expect((await readLedger()).verdicts.length, "a fixture reached the ledger").toBe(0);

  const real = await upload({ origin: "agent", provider: "elevenlabs", technique: ["tag-list"], prompt: "warm lo-fi, rhodes" });
  await patch(real.take.id, { verdict: "kept", ratings: { melody: 8, instrument_choice: 6 } });
  await patch(real.take.id, { verdict: "rejected", reasons: ["smeared-transients"] });
  let ledger = await readLedger();
  expect(ledger.verdicts.length).toBe(1);
  expect(ledger.verdicts[0]).toMatchObject({ takeId: real.take.id, verdict: "rejected", reasons: ["smeared-transients"], prompt: "warm lo-fi, rhodes", score: 7 });

  await patch(real.take.id, { verdict: "unjudged" });
  ledger = await readLedger();
  expect(ledger.verdicts.length).toBe(0);
  console.log(`[sound] ledger file: ${process.env.SOUND_LEDGER_PATH}`);
});

/* ── insights + knowledge ────────────────────────────────────────────────── */

function row(over: Partial<LedgerVerdict>): LedgerVerdict {
  return {
    takeId: `st-${Math.random().toString(16).slice(2, 8)}`,
    kind: "music",
    provider: "elevenlabs",
    op: "compose",
    origin: "agent",
    technique: [],
    terms: { genre: [], mood: [], instrument: [], sfxCategory: null },
    prompt: "p",
    negative: null,
    durationS: 30,
    verdict: "kept",
    ratings: {},
    score: null,
    reasons: [],
    huntId: null,
    judgedAt: "2026-10-05T10:00:00.000Z",
    ...over,
  };
}

test("insights: per provider × facet; keep counts, rubric means, top defect; a small cell keeps its n", () => {
  const lofi = { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null };
  const rows = [
    row({ terms: lofi, technique: ["tag-list"], score: 8 }),
    row({ terms: { ...lofi, genre: ["Lo-Fi "] }, technique: ["tag-list"], score: 6 }),
    row({ terms: lofi, verdict: "rejected", reasons: ["smeared-transients"], score: 4 }),
    row({ terms: lofi, verdict: "rejected", reasons: ["smeared-transients", "off-brief"], score: null }),
    row({ provider: "suno", terms: lofi }),
    row({ kind: "sfx", terms: { genre: [], mood: [], instrument: [], sfxCategory: "impacts" } }),
    row({ origin: "fixture", terms: lofi }),
  ];
  expect(rubricMean("music", { melody: 8, instrument_choice: 6, instrument_quality: null })).toBe(7);
  expect(rubricMean("sfx", { event_match: 9 })).toBe(9);
  expect(rubricMean("music", {})).toBeNull();

  const { cells, judged } = computeInsights(rows, "music");
  expect(judged, "the fixture row is not counted, the sfx row is another kind").toBe(5);
  const el = cells.find((c) => c.provider === "elevenlabs" && c.facet === "genre")!;
  console.log(`[sound] elevenlabs lo-fi: n=${el.n} kept=${el.kept} mean=${el.meanScore} top=${el.topDefect}`);
  expect(el).toMatchObject({ value: "lo-fi", n: 4, kept: 2, rejected: 2, meanScore: 6, topDefect: "smeared-transients" });
  const tech = cells.find((c) => c.facet === "technique")!;
  expect(tech).toMatchObject({ value: "tag-list", n: 2, kept: 2, meanScore: 7 });
  const suno = cells.find((c) => c.provider === "suno")!;
  expect(suno.n, "a one-take cell is returned with n=1 — drawing it is the reader's call").toBe(1);
  expect(suno.meanScore).toBeNull();
});

test("knowledge: empty is an honest absence; nothing below n=3 is claimed; lessons quoted with evidence", () => {
  const empty = renderPatterns({ verdicts: [], lessons: [] });
  expect(empty).toContain("No evidence yet: nothing of this kind has been judged.");
  expect(empty).toContain("No lesson confirmed yet.");
  expect(empty).toContain("npx tsx pipeline/sound.mts knowledge");
  expect(renderParams({ verdicts: [], lessons: [] }).asOf).toBeNull();

  const lofi = { genre: ["lo-fi"], mood: ["warm"], instrument: [], sfxCategory: null };
  const ledger = {
    verdicts: [
      row({ terms: lofi, score: 8, judgedAt: "2026-10-05T10:00:00.000Z" }),
      row({ terms: lofi, score: 7, judgedAt: "2026-10-05T10:01:00.000Z" }),
      row({ terms: { ...lofi, mood: [] }, verdict: "rejected", reasons: ["section-bleed"], judgedAt: "2026-10-05T10:02:00.000Z" }),
      row({ provider: "suno", terms: { genre: ["drill"], mood: [], instrument: [], sfxCategory: null } }),
    ],
    lessons: [
      {
        id: "ls-1",
        kind: "music" as const,
        source: "hunt" as const,
        provider: "elevenlabs" as const,
        huntId: "hn-1",
        claim: "When a bed must sit under voice, brief a tag list with an explicit instrumental fence, because prose drifted to vocals.",
        technique: ["tag-list", "negative-styles"],
        evidence: { n: 4, keepRate: 0.5, meanScore: 6.5, takeIds: ["st-a", "st-b"] },
        confirmedAt: "2026-10-05T11:00:00.000Z",
      },
    ],
  };
  const params = renderParams(ledger);
  const md = renderPatterns(ledger);
  const s = params.kinds.music.strengths;
  console.log(`[sound] strengths: ${s.map((x) => `${x.provider}/${x.facet}/${x.value} n=${x.n}`).join(", ")} · below floor ${params.kinds.music.belowFloor}`);
  expect(s.every((x) => x.n >= MIN_N && x.evidence === "MEASURED")).toBe(true);
  expect(s.map((x) => `${x.facet}:${x.value}`)).toEqual(["genre:lo-fi"]);
  expect(s[0]).toMatchObject({ n: 3, kept: 2, keepRate: 0.67, meanScore: 7.5, topDefect: "section-bleed" });
  expect(params.kinds.music.belowFloor, "warm (n=2) and drill (n=1) are counted, not claimed").toBe(2);
  expect(md).not.toMatch(/\| drill \|/);
  expect(md).not.toMatch(/\| warm \|/);
  expect(md).toContain("| elevenlabs | genre | lo-fi | 3 | 2 | 67% | 7.5 | section-bleed |");
  expect(md).toContain('**INFERRED** — "When a bed must sit under voice');
  expect(md).toContain("evidence n=4 · keep 50% · mean 6.5 · takes st-a, st-b");
  expect(params.asOf, "the as-of is the newest evidence, never the wall clock").toBe("2026-10-05T11:00:00.000Z");
  expect(renderPatterns(ledger), "deterministic").toBe(md);
});

test("insights route: fixtures and other kinds excluded; lessons filtered by kind", async () => {
  const fx = await upload({ origin: "fixture", title: "sample" }, null);
  await patch(fx.take.id, { verdict: "kept" });
  const a = await upload({ origin: "agent", provider: "elevenlabs", terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null } });
  await patch(a.take.id, { verdict: "kept", ratings: { melody: 9 } });
  const b = await body<{ cells: unknown[]; judged: number; lessons: unknown[] }>(await insightsGET(rq("/api/sound/insights?kind=music")));
  expect(b.judged).toBe(1);
  expect(b.cells).toEqual([expect.objectContaining({ provider: "elevenlabs", facet: "genre", value: "ambient", n: 1, kept: 1, meanScore: 9 })]);
  expect((await insightsGET(rq("/api/sound/insights?kind=jazz"))).status).toBe(400);
});

/* ── file, groups, lessons, clear ────────────────────────────────────────── */

test("file: served with its content-type, and byte ranges answer 206; k= is accepted for an <audio src>", async () => {
  const { take } = await upload({ origin: "import" });
  const full = await fileGET(rq(`/api/sound/takes/${take.id}/file`), ctx(take.id));
  expect(full.status).toBe(200);
  expect(full.headers.get("content-type")).toBe("audio/mpeg");
  expect(full.headers.get("accept-ranges")).toBe("bytes");
  expect(new Uint8Array(await full.arrayBuffer())).toEqual(AUDIO);

  const part = await fileGET(rq(`/api/sound/takes/${take.id}/file`, { headers: { range: "bytes=100-199" } }), ctx(take.id));
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe(`bytes 100-199/${AUDIO.byteLength}`);
  expect(new Uint8Array(await part.arrayBuffer())).toEqual(AUDIO.slice(100, 200));
  const bad = await fileGET(rq(`/api/sound/takes/${take.id}/file`, { headers: { range: "bytes=99999-" } }), ctx(take.id));
  expect(bad.status).toBe(416);

  const viaK = await fileGET(
    new Request(`http://localhost/api/sound/takes/${take.id}/file?k=${SECRET}`, { headers: { "x-forwarded-for": "10.1.1.1" } }),
    ctx(take.id),
  );
  expect(viaK.status).toBe(200);
  const denied = await fileGET(new Request(`http://localhost/api/sound/takes/${take.id}/file`), ctx(take.id));
  expect(denied.status).toBe(401);
  expect(await body(denied), "a denial speaks the contract's { error }").toEqual(expect.objectContaining({ error: expect.any(String) }));

  const fx = await upload({ origin: "fixture" }, null);
  expect((await fileGET(rq(`/api/sound/takes/${fx.take.id}/file`), ctx(fx.take.id))).status).toBe(404);
});

test("groups: defaults, PUT replaces in order, duplicates refused", async () => {
  const g = await body<{ groups: { music: string[]; sfx: string[] } }>(await groupsGET(rq("/api/sound/groups")));
  expect(g.groups.music.length).toBeGreaterThan(0);
  const put = await groupsPUT(rq("/api/sound/groups", { method: "PUT", json: { groups: { music: ["lo-fi", "drill"], sfx: ["impacts"] } } }));
  expect(put.status).toBe(200);
  expect((await body<{ groups: unknown }>(await groupsGET(rq("/api/sound/groups")))).groups).toEqual({ music: ["lo-fi", "drill"], sfx: ["impacts"] });
  expect((await groupsPUT(rq("/api/sound/groups", { method: "PUT", json: { groups: { music: ["a", "A"], sfx: [] } } }))).status).toBe(400);
});

test("lessons: a claim is required; a confirmed lesson is appended to the ledger and listed by kind", async () => {
  expect((await lessonsPOST(rq("/api/sound/lessons", { method: "POST", json: { kind: "music", claim: "  " } }))).status).toBe(400);
  const res = await lessonsPOST(
    rq("/api/sound/lessons", {
      method: "POST",
      json: { kind: "sfx", source: "triage", provider: "elevenlabs", huntId: null, claim: "When an ambience loops, brief a featureless body, because seams clicked.", technique: ["loop-seam-acceptance"], evidence: { n: 3, keepRate: 0.67, meanScore: null, takeIds: ["a"] } },
    }),
  );
  expect(res.status).toBe(201);
  const { lesson } = await body<{ lesson: { id: string; confirmedAt: string } }>(res);
  expect(lesson.id).toMatch(/^ls-/);
  expect((await readLedger()).lessons.length).toBe(1);
  expect((await body<{ lessons: unknown[] }>(await lessonsGET(rq("/api/sound/lessons?kind=music")))).lessons).toEqual([]);
  expect((await body<{ lessons: unknown[] }>(await lessonsGET(rq("/api/sound/lessons?kind=sfx")))).lessons.length).toBe(1);
});

test("clear the examples: fixtures only; any other origin is refused", async () => {
  await upload({ origin: "fixture" }, null);
  await upload({ origin: "fixture" }, null);
  await upload({ origin: "import" });
  expect((await takesDELETE(rq("/api/sound/takes?origin=import", { method: "DELETE" }))).status).toBe(400);
  const res = await takesDELETE(rq("/api/sound/takes?origin=fixture", { method: "DELETE" }));
  expect(await body(res)).toEqual({ removed: 2 });
  expect((await readTakes()).takes.map((t) => t.origin)).toEqual(["import"]);
});

/* ── generate: lib/music with the vendor replaced ────────────────────────── */

const PLAN = {
  chunks: [
    { text: "[Intro]", duration_ms: 5000, positive_styles: ["lo-fi"], negative_styles: [] },
    { text: "[Drop]", duration_ms: 5000, positive_styles: ["lo-fi"], negative_styles: [] },
  ],
};

function elevenlabs(url: string): Response | null {
  if (!url.startsWith("https://api.elevenlabs.io/")) return null;
  if (url.endsWith("/v1/sound-generation")) return new Response(new Uint8Array(2000).fill(3), { headers: { "content-type": "audio/mpeg" } });
  return Response.json({ audio_base_64: Buffer.from(new Uint8Array(3000).fill(5)).toString("base64"), composition_plan: PLAN, song_id: "song-probe-1" });
}

const genReq = (over: Record<string, unknown> = {}) => ({
  kind: "music",
  provider: "elevenlabs",
  op: "compose",
  prompt: "Warm lo-fi instrumental, 80 BPM, rhodes and vinyl",
  negative: "vocals, choir",
  durationS: 10,
  loop: null,
  technique: ["single-sentence", "negative-styles"],
  terms: { genre: ["lo-fi"], mood: ["warm"], instrument: ["rhodes"], sfxCategory: null },
  tempoBpm: 80,
  key: null,
  origin: "lab",
  sourceTakeId: null,
  editModes: null,
  plan: null,
  huntId: null,
  nodeId: null,
  title: null,
  ...over,
});

test("generate: a compose and a section edit through lib/music, filed with bytes, plan and song id — vendor replaced", async () => {
  process.env.ELEVENLABS_API_KEY = "probe-key";
  respond = elevenlabs;
  const res = await generatePOST(rq("/api/sound/generate", { method: "POST", json: genReq() }));
  expect(res.status).toBe(201);
  const { take } = await body<{ take: SoundTake }>(res);
  expect(calls.length).toBe(1);
  expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/music/detailed");
  expect((calls[0].body as { prompt: string }).prompt, "the negative rides as the vendor's 'No …' tail").toBe(
    "Warm lo-fi instrumental, 80 BPM, rhodes and vinyl. No vocals, no choir.",
  );
  expect(take).toMatchObject({ origin: "lab", op: "compose", verdict: "unjudged", songId: "song-probe-1", prompt: "Warm lo-fi instrumental, 80 BPM, rhodes and vinyl" });
  expect(take.file?.bytes).toBe(3000);

  const edit = await generatePOST(
    rq("/api/sound/generate", { method: "POST", json: genReq({ op: "section-edit", prompt: "", sourceTakeId: take.id, editModes: ["keep", "high"] }) }),
  );
  expect(edit.status).toBe(201);
  const e = (await body<{ take: SoundTake }>(edit)).take;
  const sent = calls[1].body as { composition_plan: { chunks: Record<string, unknown>[] } };
  console.log(`[sound] edit plan sent: ${JSON.stringify(sent.composition_plan.chunks.map((c) => Object.keys(c)))}`);
  expect(sent.composition_plan.chunks[0]).toEqual({ song_id: "song-probe-1", range: { start_ms: 0, end_ms: 5000 } });
  expect(sent.composition_plan.chunks[1]).toMatchObject({ text: "[Drop]", condition_strength: "high", conditioning_ref: { song_id: "song-probe-1", range: { start_ms: 5000, end_ms: 10000 } } });
  expect(e.parentId).toBe(take.id);
  expect(e.op).toBe("section-edit");

  const sfx = await generatePOST(
    rq("/api/sound/generate", { method: "POST", json: genReq({ kind: "sfx", op: "sfx", prompt: "iron door slams, sharp attack, dry room", negative: null, durationS: 1.5, loop: false }) }),
  );
  expect(sfx.status).toBe(201);
  expect(calls[2].body).toMatchObject({ text: "iron door slams, sharp attack, dry room", duration_seconds: 1.5, loop: false });

  // Refusals before any spend.
  expect((await generatePOST(rq("/api/sound/generate", { method: "POST", json: genReq({ durationS: 0.5 }) }))).status).toBe(400);
  expect((await generatePOST(rq("/api/sound/generate", { method: "POST", json: genReq({ kind: "sfx" }) }))).status).toBe(400);
  expect((await generatePOST(rq("/api/sound/generate", { method: "POST", json: genReq({ provider: "suno" }) }))).status).toBe(400);
  expect(calls.length, "a refused request reached the vendor").toBe(3);
});

test("generate: with no key the engine says so — 503 no-key, nothing filed, nothing sent", async () => {
  respond = elevenlabs;
  const res = await generatePOST(rq("/api/sound/generate", { method: "POST", json: genReq() }));
  const b = await body<{ error: string; code: string }>(res);
  console.log(`[sound] no key -> ${res.status} ${b.code}: ${b.error.slice(0, 80)}`);
  expect(res.status).toBe(503);
  expect(b.code).toBe("no-key");
  expect(calls.length).toBe(0);
  expect((await readTakes()).takes.length).toBe(0);
});

/* ── hunt: the real router, with the model replaced ──────────────────────── */

function gemini(answer: string) {
  return (url: string): Response | null => {
    if (!url.startsWith("https://generativelanguage.googleapis.com/")) return null;
    return Response.json({
      candidates: [{ content: { parts: [{ text: answer }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 400 },
    });
  };
}

const MAP = {
  branches: [
    {
      axis: "technique",
      label: "How it is briefed",
      rationale: "Prose versus a section plan.",
      leaves: [
        { label: "one sentence", rationale: "baseline", provider: "elevenlabs", technique: ["single-sentence", "made-up-technique"], prompt: "Warm lo-fi instrumental bed, rhodes, vinyl, 80 BPM.", negative: "vocals", durationS: 30 },
        { label: "section plan", rationale: "addressable parts", provider: "elevenlabs", technique: ["section-plan-as-the-brief"], prompt: "Intro 8s: … / Body 22s: …", negative: null, durationS: 9999 },
        { label: "a vendor that is not here", rationale: "x", provider: "udio", technique: [], prompt: "anything", durationS: 30 },
      ],
    },
    {
      axis: "provider",
      label: "Who renders it",
      rationale: "Suno's dialect.",
      leaves: [{ label: "suno style line", rationale: "tags", provider: "suno", technique: ["tag-list"], prompt: "Style: lo-fi, rhodes", negative: "vocals", durationS: 60 }],
    },
    { axis: "empty", label: "nothing renderable", rationale: "", leaves: [{ label: "no prompt", provider: "elevenlabs", technique: [], prompt: "", durationS: 10 }] },
  ],
};

test("hunt: a canned model map is validated — unusable leaves dropped, techniques filtered, durations clamped", async () => {
  process.env.GOOGLE_AI_API_KEY = "probe-key";
  respond = gemini(JSON.stringify(MAP));
  const res = await huntsPOST(rq("/api/sound/hunts", { method: "POST", json: { kind: "music", idea: "a bed under a calm voiceover" } }));
  expect(res.status).toBe(201);
  const { hunt } = await body<{ hunt: Hunt }>(res);
  const leaves = hunt.nodes.filter((n) => n.prompt);
  const branches = hunt.nodes.filter((n) => n.parentId === hunt.nodes[0].id);
  console.log(`[sound] hunt ${hunt.id}: ${branches.length} branches, ${leaves.length} leaves, drafted by ${hunt.draftedBy}`);
  expect(hunt.nodes[0]).toMatchObject({ parentId: null, axis: "idea", label: "a bed under a calm voiceover" });
  expect(branches.map((b) => b.axis)).toEqual(["technique", "provider"]);
  expect(leaves.map((l) => l.label)).toEqual(["one sentence", "section plan", "suno style line"]);
  expect(leaves[0].technique, "an unknown technique slug is dropped").toEqual(["single-sentence"]);
  expect(leaves[1].durationS, "clamped to the vendor window").toBe(600);
  expect(leaves[2]).toMatchObject({ provider: "suno", state: "awaiting-return" });
  expect(hunt.draftedBy).toMatch(/^google · /);
  expect((await readHunts()).hunts.length).toBe(1);

  // The prompt that was sent: the music rules, the registry's vocabulary, and
  // the honest "nothing measured yet".
  const sent = JSON.stringify(calls[0].body);
  expect(sent).toContain("a bed under a calm voiceover");
  expect(sent).toContain("forgetting 'instrumental'");
  expect(sent).not.toContain("ENVELOPE");
  expect(sent).toContain("none yet");

  const listed = await body<{ hunts: Hunt[] }>(await huntsGET(rq("/api/sound/hunts?kind=music")));
  expect(listed.hunts.length).toBe(1);
  expect((await body<{ hunts: Hunt[] }>(await huntsGET(rq("/api/sound/hunts?kind=sfx")))).hunts).toEqual([]);
});

test("hunt: the sfx prompt is envelope-first; a prose answer is a 502 and nothing is stored", async () => {
  const md = readFileSync(path.join(process.cwd(), "pipeline", "SOUND-HUNT-PROMPT.md"), "utf8");
  const sfxPrompt = huntPrompt(sectionsOf(md), "sfx", "a door in a cathedral", null, []);
  expect(sfxPrompt).toContain("ENVELOPE");
  expect(sfxPrompt).toContain("envelope-first-briefing");
  expect(sfxPrompt).not.toContain("forgetting 'instrumental'");
  expect(sfxPrompt).not.toContain("SOUND-HUNT-PROMPT — the text engine's instructions");
  expect(sfxPrompt, "every slot is filled").not.toMatch(/\{\{[A-Z_]+\}\}/);

  // parseHuntMap clamps an effect to 0.5..30 s.
  const nodes = parseHuntMap({ branches: [{ axis: "space", leaves: [{ label: "x", provider: "elevenlabs", technique: ["envelope-first-briefing"], prompt: "door", durationS: 90 }] }] }, "sfx", "door");
  expect(nodes.find((n) => n.prompt)?.durationS).toBe(30);

  process.env.GOOGLE_AI_API_KEY = "probe-key";
  respond = gemini("Here are some ideas you might like: try a door.");
  const res = await huntsPOST(rq("/api/sound/hunts", { method: "POST", json: { kind: "sfx", idea: "a door" } }));
  const b = await body<{ error: string; code: string }>(res);
  console.log(`[sound] prose answer -> ${res.status} ${b.code}`);
  expect(res.status).toBe(502);
  expect(b.code).toBe("bad-response");
  expect((await readHunts()).hunts.length).toBe(0);
});

test("hunt: a new winner keeps its unjudged takes; the lesson draft's evidence is counted, not written by the model", async () => {
  process.env.GOOGLE_AI_API_KEY = "probe-key";
  respond = gemini(JSON.stringify(MAP));
  const { hunt } = await body<{ hunt: Hunt }>(await huntsPOST(rq("/api/sound/hunts", { method: "POST", json: { kind: "music", idea: "bed" } })));
  const [a, b] = hunt.nodes.filter((n) => n.provider === "elevenlabs" && n.prompt);
  const ta = (await upload({ origin: "hunt", huntId: hunt.id, nodeId: a.id, technique: a.technique, prompt: a.prompt })).take;
  const tb = (await upload({ origin: "hunt", huntId: hunt.id, nodeId: b.id, technique: b.technique, prompt: b.prompt })).take;
  await patch(tb.id, { verdict: "rejected", reasons: ["section-bleed"], ratings: { melody: 3 } });

  // No winner yet: nothing to learn.
  expect((await huntLessonPOST(rq(`/api/sound/hunts/${hunt.id}/lesson`, { method: "POST" }), ctx(hunt.id))).status).toBe(409);

  const nodes = hunt.nodes.map((n) => (n.id === a.id ? { ...n, takeIds: [ta.id], state: "rendered", winner: true } : n.id === b.id ? { ...n, takeIds: [tb.id], state: "rendered" } : n));
  const pr = await huntPATCH(rq(`/api/sound/hunts/${hunt.id}`, { method: "PATCH", json: { nodes } }), ctx(hunt.id));
  expect(pr.status).toBe(200);
  const won = (await readTakes()).takes.find((t) => t.id === ta.id)!;
  expect(won.verdict, "winner -> kept").toBe("kept");
  expect(won.stage, "-> pending, so it appears in Arrangement").toBe("pending");
  expect((await readTakes()).takes.find((t) => t.id === tb.id)!.verdict, "a rejected take stays rejected").toBe("rejected");

  respond = gemini(JSON.stringify({ claim: "When a bed must sit under voice, brief one sentence with an instrumental fence, because the plan bled sections.", technique: ["single-sentence", "invented"], provider: "elevenlabs" }));
  const lr = await huntLessonPOST(rq(`/api/sound/hunts/${hunt.id}/lesson`, { method: "POST" }), ctx(hunt.id));
  expect(lr.status).toBe(200);
  const { draft } = await body<{ draft: { evidence: { n: number; keepRate: number; takeIds: string[] }; technique: string[]; source: string; huntId: string } }>(lr);
  console.log(`[sound] lesson draft evidence: ${JSON.stringify(draft.evidence)}`);
  expect(draft).toMatchObject({ source: "hunt", huntId: hunt.id, technique: ["single-sentence"] });
  expect(draft.evidence).toMatchObject({ n: 2, keepRate: 0.5 });
  expect(draft.evidence.takeIds.sort()).toEqual([ta.id, tb.id].sort());
  const lessonPrompt = JSON.stringify(calls[calls.length - 1].body);
  expect(lessonPrompt).toContain("WINNER");
  expect(lessonPrompt).toContain("section-bleed");
  expect((await readLedger()).lessons.length, "a draft is never stored").toBe(0);
});

/* ── the CLI, in-process ─────────────────────────────────────────────────── */

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runSoundCli(argv, { root, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("cli: list hides fixtures; judge -> finalized --json is how an agent picks a track; knowledge --check", async () => {
  await upload({ origin: "fixture", title: "a sample" }, null);
  const { take } = await upload({ origin: "agent", title: "rain bed", terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null } });

  const list = await cli("list", "--json");
  expect(list.code).toBe(0);
  expect((JSON.parse(list.out) as { takes: SoundTake[] }).takes.map((t) => t.title)).toEqual(["rain bed"]);
  expect((JSON.parse((await cli("list", "--fixtures", "--json")).out) as { takes: unknown[] }).takes.length).toBe(2);

  expect((await cli("judge", take.id, "--verdict", "kept", "--stage", "finalized", "--json")).code, "finalized without a label fails").toBe(1);
  const judged = await cli("judge", take.id, "--verdict", "kept", "--score", "melody=8", "--stage", "finalized", "--label", "rain bed — calm", "--group", "ambient", "--json");
  expect(judged.code).toBe(0);
  const fin = await cli("finalized", "--kind", "music", "--json");
  const picked = (JSON.parse(fin.out) as { takes: SoundTake[] }).takes;
  console.log(`[sound] cli finalized -> ${picked.map((t) => `${t.id} [${t.label}]`).join(", ")}`);
  expect(picked).toEqual([expect.objectContaining({ id: take.id, label: "rain bed — calm", group: "ambient", stage: "finalized" })]);
  expect((JSON.parse((await cli("finalized", "--label", "nothing like it", "--json")).out) as { takes: unknown[] }).takes).toEqual([]);

  const human = await cli("finalized");
  expect(human.out).toContain("rain bed — calm");
  expect((await cli("bogus")).code).toBe(2);
  expect((await cli("list", "--verdict", "kpt", "--json")).code, "an unknown filter value is usage").toBe(2);

  expect((await cli("knowledge", "--check", "--json")).code, "nothing written yet is stale").toBe(1);
  const k = await cli("knowledge", "--json");
  expect(JSON.parse(k.out)).toMatchObject({ written: ["PATTERNS.md", "params.json"], kinds: { music: { judged: 1, strengths: 0, belowFloor: 1 } } });
  expect((await cli("knowledge", "--check")).code).toBe(0);
  expect((JSON.parse((await cli("lessons", "--json")).out) as { lessons: unknown[] }).lessons).toEqual([]);
});

test("the committed knowledge/audio is what the committed ledger renders", async () => {
  // The repo's own files, not the temp store: a ledger change committed without
  // regenerating the doc is caught here, by the same render the CLI runs.
  const ledger = JSON.parse(readFileSync(path.join(process.cwd(), "pipeline", "sound", "ledger.json"), "utf8"));
  const dir = path.join(process.cwd(), "knowledge", "audio");
  expect(readFileSync(path.join(dir, "PATTERNS.md"), "utf8").replace(/\r\n/g, "\n")).toBe(renderPatterns(ledger));
  expect(readFileSync(path.join(dir, "params.json"), "utf8").replace(/\r\n/g, "\n")).toBe(`${JSON.stringify(renderParams(ledger), null, 2)}\n`);
});

/* ── the migrated row: createTake straight, as the Library's push lands ───── */

test("migration shape: a Library row keeps its id, time and verdict; a rejection's words survive as the note", async () => {
  const { take, created } = await createTake(
    {
      id: "seed-au-trk-0007",
      title: "Melodic House sketch 8",
      origin: "fixture",
      verdict: "rejected",
      reasons: [],
      note: "mix is harsh above 4kHz",
      ratings: { melody: 9, instrument_choice: 9, instrument_quality: 1 },
      createdAt: "2026-09-20T10:00:00.000Z",
    },
    null,
  );
  expect(created).toBe(true);
  expect(take).toMatchObject({ id: "seed-au-trk-0007", createdAt: "2026-09-20T10:00:00.000Z", verdict: "rejected", note: "mix is harsh above 4kHz", stage: null, file: null });
  expect((await readLedger()).verdicts.length, "a fixture's stored verdict is not a judgement").toBe(0);
});

/* ── round-4 closeout: the contract gaps the builders reported ───────────── */

test("closeout · take facts: the Library's links are fields — accepted on upload and PATCH, cleared by null, read back on an old file as null", async () => {
  const up = await upload({
    origin: "import",
    referenceTrackId: "ref-ratatat-breaking-away",
    promptRound: "round-3",
    draftId: "dr-1",
    variation: { axis: "tempo", diff: ["92 -> 104"] },
    editModes: ["keep", "high"],
  });
  expect(up.status).toBe(201);
  expect(up.take).toMatchObject({
    referenceTrackId: "ref-ratatat-breaking-away",
    promptRound: "round-3",
    draftId: "dr-1",
    variation: { axis: "tempo", diff: ["92 -> 104"] },
    editModes: ["keep", "high"],
    // the name the file arrived under, when the meta names none
    fileName: "take.mp3",
  });
  const p = await patch(up.take.id, { draftId: null, promptRound: "round-4", variation: { axis: "" }, fileName: "renamed.mp3" });
  expect(p.status).toBe(200);
  expect(p.take).toMatchObject({ draftId: null, promptRound: "round-4", variation: null, fileName: "renamed.mp3", referenceTrackId: "ref-ratatat-breaking-away" });
  expect((await patch(up.take.id, { origin: "agent" })).status, "origin is still not patchable").toBe(400);

  // A takes.json written before the fields: every one reads as null.
  const file = path.join(process.env.SOUND_STORE_DIR!, "takes.json");
  const raw = JSON.parse(readFileSync(file, "utf8")) as { takes: Record<string, unknown>[] };
  for (const t of raw.takes) for (const k of ["referenceTrackId", "promptRound", "draftId", "variation", "editModes", "fileName"]) delete t[k];
  raw.takes[0].measured = { tempoBpm: 90, key: "A minor", energy: null, lufs: null, truePeakDb: null };
  writeFileSync(file, JSON.stringify(raw));
  const old = (await readTakes()).takes[0];
  expect(old).toMatchObject({ referenceTrackId: null, promptRound: null, draftId: null, variation: null, editModes: null, fileName: null });
  expect(old.measured).toEqual({ tempoBpm: 90, key: "A minor", energy: null, durationS: null, lufs: null, truePeakDb: null });
});

test("closeout · measured: energy is an RMS 0..1 and durationS the decoded length; anything else is refused, not clamped", async () => {
  const t = (await upload({ origin: "lab", kind: "sfx", durationS: 1.5 })).take;
  const ok = await patch(t.id, { measured: { tempoBpm: null, key: null, energy: 0.13456, durationS: 1.4837, lufs: null, truePeakDb: null } });
  expect(ok.status).toBe(200);
  expect(ok.take!.measured).toEqual({ tempoBpm: null, key: null, energy: 0.1346, durationS: 1.48, lufs: null, truePeakDb: null });
  expect((await patch(t.id, { measured: { energy: 3.2 } })).status, "an energy outside 0..1 is another unit").toBe(400);
  expect((await patch(t.id, { measured: { durationS: 0 } })).status, "a zero length is not a measurement").toBe(400);
});

test("closeout · generate: promptInfluence reaches the sfx vendor call; null leaves the vendor default; music refuses it", async () => {
  process.env.ELEVENLABS_API_KEY = "probe-key";
  respond = elevenlabs;
  const sfx = (over: Record<string, unknown>) =>
    genReq({
      kind: "sfx",
      op: "sfx",
      prompt: "event: door slam; space: hall; duration: 1.5s; loop: no",
      durationS: 1.5,
      loop: false,
      technique: [],
      terms: { genre: [], mood: [], instrument: [], sfxCategory: "impacts" },
      tempoBpm: null,
      ...over,
    });
  expect((await generatePOST(rq("/api/sound/generate", { method: "POST", json: sfx({ promptInfluence: 0.8 }) }))).status).toBe(201);
  expect(calls[0].url).toBe("https://api.elevenlabs.io/v1/sound-generation");
  expect(calls[0].body).toMatchObject({ prompt_influence: 0.8, duration_seconds: 1.5, loop: false });
  expect((await generatePOST(rq("/api/sound/generate", { method: "POST", json: sfx({ promptInfluence: null }) }))).status).toBe(201);
  expect(calls[1].body as Record<string, unknown>, "null is the vendor's default: the field is not sent").not.toHaveProperty("prompt_influence");
  const bad = await generatePOST(rq("/api/sound/generate", { method: "POST", json: sfx({ promptInfluence: 1.5 }) }));
  expect(bad.status).toBe(400);
  const music = await generatePOST(rq("/api/sound/generate", { method: "POST", json: genReq({ promptInfluence: 0.5 }) }));
  expect(music.status).toBe(400);
  expect((await body<{ error: string }>(music)).error).toMatch(/sfx only/);
  expect(calls.length, "a refused request sends nothing").toBe(2);
});

test("closeout · versions: a Suno return filed against a judged take is not a second keep — until somebody judges it", async () => {
  const lofi = { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null };
  const parent = (await upload({ origin: "agent", provider: "elevenlabs", technique: ["tag-list"], terms: lofi })).take;
  await patch(parent.id, { verdict: "kept", ratings: { melody: 8 } });
  // Arrangement's round trip: the return lands kept, at the column it was dropped on.
  const ver = await upload({ origin: "suno-return", provider: "suno", parentId: parent.id, verdict: "kept", stage: "remaster", technique: ["tag-list"], terms: lofi });
  expect(ver.take).toMatchObject({ verdict: "kept", stage: "remaster", parentId: parent.id });
  let ledger = await readLedger();
  expect(ledger.verdicts.map((v) => v.takeId), "the version is not a verdict").toEqual([parent.id]);
  const ins = await body<{ judged: number; cells: { provider: string; kept: number }[] }>(await insightsGET(rq("/api/sound/insights?kind=music")));
  expect(ins.judged).toBe(1);
  expect(ins.cells.filter((c) => c.provider === "suno"), "Suno is not credited with a keep it did not earn").toEqual([]);

  // Moving the version on the board is still not a judgement.
  await patch(ver.take.id, { stage: "edit" });
  expect((await readLedger()).verdicts.length).toBe(1);

  // Scored in its own right, it counts, as Suno's.
  await patch(ver.take.id, { ratings: { melody: 9 } });
  ledger = await readLedger();
  expect(ledger.verdicts.map((v) => v.takeId).sort()).toEqual([parent.id, ver.take.id].sort());
  expect(ledger.verdicts.find((v) => v.takeId === ver.take.id)).toMatchObject({ provider: "suno", parentId: parent.id, verdict: "kept" });
  // A cleared score makes it a bare version again.
  await patch(ver.take.id, { ratings: { melody: null } });
  expect((await readLedger()).verdicts.map((v) => v.takeId)).toEqual([parent.id]);

  // A return with NO parent answers a brief of its own (a Hunt's Suno leaf): it counts.
  const leaf = await upload({ origin: "suno-return", provider: "suno", verdict: "kept" });
  expect((await readLedger()).verdicts.map((v) => v.takeId)).toContain(leaf.take.id);

  // An older ledger row for a bare version (written before the rule) is not counted either.
  const stale = row({ origin: "suno-return", provider: "suno", parentId: "st-parent", terms: lofi });
  const scored = row({ origin: "suno-return", provider: "suno", parentId: "st-parent", ratings: { melody: 7 }, score: 7, terms: lofi });
  const counted = computeInsights([stale, scored], "music");
  expect(counted.judged).toBe(1);
  expect(counted.cells.find((c) => c.facet === "genre")).toMatchObject({ provider: "suno", n: 1, kept: 1 });
});

test("closeout · hunt leaves: terms, tempo, key and loop are drafted as fields, held to their kind; an old hunt loads with them absent", async () => {
  const music = parseHuntMap(
    {
      branches: [
        {
          axis: "tempo",
          leaves: [
            {
              label: "slow",
              provider: "elevenlabs",
              technique: ["duration-and-tempo-locking"],
              prompt: "Instrumental lo-fi at 78 BPM in D minor",
              durationS: 30,
              terms: { genre: ["lo-fi", "lo-fi", " "], mood: ["calm"], instrument: ["rhodes"], sfxCategory: "impacts" },
              tempoBpm: 78,
              key: "D minor",
              loop: true,
            },
            { label: "free", provider: "elevenlabs", technique: [], prompt: "Instrumental lo-fi", durationS: 30, tempoBpm: 0, key: "" },
          ],
        },
      ],
    },
    "music",
    "a bed",
  );
  const [slow, free] = music.filter((n) => n.prompt);
  expect(slow).toMatchObject({ tempoBpm: 78, key: "D minor", loop: null, terms: { genre: ["lo-fi"], mood: ["calm"], instrument: ["rhodes"], sfxCategory: null } });
  expect(free, "0 and an empty key are the drafter saying none").toMatchObject({ tempoBpm: null, key: null });
  expect(music[0], "the root asks for nothing").toMatchObject({ loop: null, tempoBpm: null, key: null, terms: { genre: [], mood: [], instrument: [], sfxCategory: null } });

  const sfx = parseHuntMap(
    {
      branches: [
        {
          axis: "space",
          leaves: [
            {
              label: "tin roof",
              provider: "elevenlabs",
              technique: ["envelope-first-briefing", "loop-seam-acceptance"],
              prompt: "event: rain on a tin roof; space: close; duration: 12s; loop: yes",
              durationS: 12,
              terms: { genre: ["ambient"], mood: ["cosy"], instrument: ["tin"], sfxCategory: "ambiences" },
              tempoBpm: 90,
              key: "C major",
              loop: true,
            },
          ],
        },
      ],
    },
    "sfx",
    "rain",
  );
  expect(sfx.find((n) => n.prompt), "an effect never carries a tempo or a key").toMatchObject({
    loop: true,
    tempoBpm: null,
    key: null,
    terms: { genre: [], mood: ["cosy"], instrument: [], sfxCategory: "ambiences" },
  });

  // The prompt asks for the fields, kind by kind.
  const md = readFileSync(path.join(process.cwd(), "pipeline", "SOUND-HUNT-PROMPT.md"), "utf8");
  expect(huntPrompt(sectionsOf(md), "sfx", "rain", null, [])).toContain("event: …; material: …; attack: …; body: …; tail: …; space: …; duration: …s; loop: yes|no");
  expect(huntPrompt(sectionsOf(md), "music", "bed", null, [])).toMatch(/`tempoBpm` is the BPM the prompt states/);

  // A hunts.json written before the fields: listed with them absent, and a
  // PATCH of those nodes round-trips.
  mkdirSync(process.env.SOUND_STORE_DIR!, { recursive: true });
  const legacyNode = (id: string, parentId: string | null, prompt: string) => ({
    id,
    parentId,
    axis: "tempo",
    label: id,
    rationale: "",
    provider: "elevenlabs",
    technique: [],
    prompt,
    negative: null,
    durationS: prompt ? 30 : 0,
    state: "idea",
    takeIds: [],
    winner: false,
    error: null,
  });
  writeFileSync(
    path.join(process.env.SOUND_STORE_DIR!, "hunts.json"),
    JSON.stringify({
      version: 1,
      hunts: [
        { id: "hn-old", kind: "music", idea: "old", createdAt: "2026-10-01T00:00:00.000Z", draftedBy: null, lessonId: null, nodes: [legacyNode("r", null, ""), legacyNode("l", "r", "lofi at 90 BPM")] },
      ],
    }),
  );
  const listed = await body<{ hunts: Hunt[] }>(await huntsGET(rq("/api/sound/hunts")));
  expect(listed.hunts[0].nodes[1]).toMatchObject({ loop: null, tempoBpm: null, key: null, terms: { genre: [], mood: [], instrument: [], sfxCategory: null } });
  const res = await huntPATCH(
    rq("/api/sound/hunts/hn-old", {
      method: "PATCH",
      json: { nodes: [legacyNode("r", null, ""), { ...legacyNode("l", "r", "lofi at 90 BPM"), tempoBpm: 90, terms: { genre: ["lofi"] } }] },
    }),
    ctx("hn-old"),
  );
  expect(res.status).toBe(200);
  expect((await body<{ hunt: Hunt }>(res)).hunt.nodes[1]).toMatchObject({ tempoBpm: 90, key: null, terms: { genre: ["lofi"], mood: [], instrument: [], sfxCategory: null } });
});
