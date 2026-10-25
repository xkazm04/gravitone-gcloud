// LANE - THE SOUND GENERATE DOOR (lib/sound/generate.ts, cli.ts, takes.ts, editPlan.ts), offline
// and against a temp store.
//
// What is pinned is what a request is held to BEFORE the vendor is asked, and what the store
// does when a write it began cannot finish:
//
//   · the agents' CLI `generate` bills ElevenLabs with no receipt, so GRAVITONE_DRY_ONLY=1
//     refuses it outright - nothing sent, nothing filed;
//
// `globalThis.fetch` is REPLACED for every case: the vendor is a canned response, and any
// other URL fails the test. SOUND_STORE_DIR / SOUND_LEDGER_PATH point at a fresh temp dir per
// test and the env is restored afterwards (keepEnv).

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { __resetMusicBudget, currentMusicSeconds } from "@/lib/music/budget";
import { runSoundCli } from "@/lib/sound/cli";
import { buildEditPlan, editSeconds } from "@/lib/sound/editPlan";
import { generateTake, parseGenerateRequest } from "@/lib/sound/generate";
import { readTakes, SoundError } from "@/lib/sound/store";
import { createTake } from "@/lib/sound/takes";

import { keepEnv } from "./_helpers";

keepEnv(["SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "ELEVENLABS_API_KEY", "MUSIC_BUDGET_SECONDS_PER_WINDOW", "GRAVITONE_DRY_ONLY"]);

let root = "";
const realFetch = globalThis.fetch;
let calls: { url: string; body: unknown }[] = [];

const PLAN = {
  chunks: [
    { text: "[Intro]", duration_ms: 5000, positive_styles: ["lo-fi"], negative_styles: [] },
    { text: "[Drop]", duration_ms: 5000, positive_styles: ["lo-fi"], negative_styles: [] },
  ],
};

/** The vendor, canned: a compose answers audio + plan + song id, an effect answers bytes. */
function elevenlabs(url: string): Response | null {
  if (!url.startsWith("https://api.elevenlabs.io/")) return null;
  if (url.endsWith("/v1/sound-generation")) return new Response(new Uint8Array(2000).fill(3), { headers: { "content-type": "audio/mpeg" } });
  return Response.json({ audio_base_64: Buffer.from(new Uint8Array(3000).fill(5)).toString("base64"), composition_plan: PLAN, song_id: "song-door-1" });
}

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "sound-door-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.SOUND_LEDGER_PATH = path.join(root, "ledger.json");
  process.env.ELEVENLABS_API_KEY = "door-probe-key";
  delete process.env.MUSIC_BUDGET_SECONDS_PER_WINDOW;
  delete process.env.GRAVITONE_DRY_ONLY;
  __resetMusicBudget();
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: unknown = null;
    try {
      body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    } catch {
      body = init?.body ?? null;
    }
    calls.push({ url, body });
    const r = elevenlabs(url);
    if (!r) throw new Error(`probe: unexpected network call to ${url}`);
    return r;
  }) as typeof fetch;
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(root, { recursive: true, force: true });
});

async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runSoundCli(argv, { root, out: (l) => out.push(l), err: (l) => err.push(l) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/* ── the CLI's generate under GRAVITONE_DRY_ONLY ─────────────────────────── */

test("cli generate: GRAVITONE_DRY_ONLY=1 refuses the live render - nothing sent, nothing filed", async () => {
  const argv = ["generate", "--kind", "music", "--prompt", "Warm lo-fi bed, rhodes", "--duration", "10", "--json"];
  // The instrument sees a send: unset, the same argv reaches the vendor once and files a take.
  const live = await cli(...argv);
  expect(live.code, live.out).toBe(0);
  expect(calls.length).toBe(1);
  expect((await readTakes()).takes.length).toBe(1);

  process.env.GRAVITONE_DRY_ONLY = "1";
  const dry = await cli(...argv);
  console.log(`[sound-door] dry-only generate -> ${dry.code} ${dry.out.slice(0, 120)}`);
  expect(dry.code).toBe(1);
  expect((JSON.parse(dry.out) as { error: string }).error).toContain("GRAVITONE_DRY_ONLY");
  expect(calls.length, "a dry-only generate reached the vendor").toBe(1);
  expect((await readTakes()).takes.length, "a dry-only generate filed a take").toBe(1);
});

/* ── a section edit's modes ──────────────────────────────────────────────── */

const genReq = (over: Record<string, unknown> = {}) => ({
  kind: "music",
  provider: "elevenlabs",
  op: "compose",
  prompt: "Warm lo-fi instrumental, 80 BPM, rhodes and vinyl",
  negative: null,
  durationS: 10,
  loop: null,
  technique: [],
  terms: { genre: ["lo-fi"], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
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

/** The store's refusal, or null when the call went through. */
async function refusal(run: () => Promise<unknown>): Promise<{ status: number; message: string } | null> {
  try {
    await run();
    return null;
  } catch (e) {
    if (e instanceof SoundError) return { status: e.status, message: e.message };
    throw e;
  }
}

test("section edit: a mode that is not one is refused before the vendor, and the meter's guard reads it as the plan does", async () => {
  const source = await generateTake(parseGenerateRequest(genReq()));
  expect(calls.length).toBe(1);
  // "kep" is no mode: buildEditPlan keeps that section, so this edit asks for nothing new -
  // a render of the source, billed. It is refused naming the word, nothing sent.
  const bad = await refusal(async () => generateTake(parseGenerateRequest(genReq({ op: "section-edit", prompt: "", sourceTakeId: source.id, editModes: ["kep", "keep"] }))));
  console.log(`[sound-door] edit modes ["kep","keep"] -> ${JSON.stringify(bad)}`);
  expect(bad?.status).toBe(400);
  expect(bad?.message).toContain('"kep"');
  expect(calls.length, "an edit of no section reached the vendor").toBe(1);
  // The guard and the plan agree on what an unknown word is: kept, so no new seconds.
  expect(editSeconds(PLAN, ["kep", "keep"])).toBe(0);
  expect(buildEditPlan(PLAN, "s", ["kep", "keep"]).chunks.every((c) => "song_id" in c)).toBe(true);
  // A real edit still goes through.
  const ok = await generateTake(parseGenerateRequest(genReq({ op: "section-edit", prompt: "", sourceTakeId: source.id, editModes: ["keep", "high"] })));
  expect(ok.parentId).toBe(source.id);
  expect(calls.length).toBe(2);
});

/* ── a take the store refuses leaves nothing behind ──────────────────────── */

const AUDIO = { bytes: new Uint8Array(4096).map((_, i) => (i * 7) % 251), mime: "audio/mpeg", name: "take.mp3" };
const filesOnDisk = (): string[] => {
  const dir = path.join(process.env.SOUND_STORE_DIR!, "files");
  return existsSync(dir) ? readdirSync(dir) : [];
};

test("create: a take the contract refuses writes no audio file - a rating, a stage, an unreadable ledger", async () => {
  const cases: [string, () => Promise<unknown>][] = [
    ["a rating past 10", () => createTake({ origin: "import", title: "loud", ratings: { melody: 11 } }, AUDIO)],
    ["a stage on a rejected take", () => createTake({ origin: "import", title: "cut", verdict: "rejected", stage: "edit" }, AUDIO)],
    [
      "a kept take over a ledger that will not parse",
      async () => {
        writeFileSync(process.env.SOUND_LEDGER_PATH!, "<<<<<<< HEAD\n{", "utf8");
        return createTake({ origin: "import", title: "kept", verdict: "kept" }, AUDIO);
      },
    ],
  ];
  for (const [what, run] of cases) {
    const r = await refusal(run);
    console.log(`[sound-door] ${what} -> ${r?.status} ${r?.message.slice(0, 70)}; files ${filesOnDisk().length}`);
    expect(r, `${what} was not refused`).not.toBeNull();
    expect(filesOnDisk(), `${what} left its audio in the store`).toEqual([]);
  }
  expect((await readTakes()).takes).toEqual([]);
  // The same bytes on a take the contract accepts are filed where the take says.
  rmSync(process.env.SOUND_LEDGER_PATH!, { force: true });
  const { take } = await createTake({ origin: "import", title: "fine", ratings: { melody: 7 } }, AUDIO);
  expect(filesOnDisk()).toEqual([path.basename(take.file!.path)]);
  expect(take.file!.path).toBe(`files/${take.id}.mp3`);
});

test("create: an unjudged render is filed while the ledger will not parse - the ledger is left as it was", async () => {
  const conflicted = "<<<<<<< HEAD\n{";
  writeFileSync(process.env.SOUND_LEDGER_PATH!, conflicted, "utf8");
  // The vendor has already rendered (and billed) when the take is filed; an unjudged take has no
  // ledger row to write, so the ledger's state is not the take's to refuse on.
  const r = await refusal(() => generateTake(parseGenerateRequest(genReq())));
  console.log(`[sound-door] unjudged render over an unreadable ledger -> ${JSON.stringify(r)}; vendor calls ${calls.length}`);
  expect(r).toBeNull();
  expect(calls.length).toBe(1);
  expect((await readTakes()).takes.map((t) => t.verdict)).toEqual(["unjudged"]);
  expect(readFileSync(process.env.SOUND_LEDGER_PATH!, "utf8")).toBe(conflicted);
  // A judgement still needs the ledger, and still refuses over it.
  expect((await refusal(() => createTake({ origin: "import", title: "kept", verdict: "kept" }, AUDIO)))?.status).toBe(500);
});

/* ── the CLI's judge holds a score to the take's rubric ──────────────────── */

test("cli judge: a --score dimension off the take's rubric is usage, and nothing is written", async () => {
  const { take } = await createTake({ origin: "agent", title: "rain bed", kind: "music" }, AUDIO);
  // "qualty" is a typo and "event_match" an effect's dimension; on a music take neither is read
  // by the mean the ledger keeps - alone, it would BE the mean (rubricMean falls back to any number).
  for (const score of ["qualty=2", "event_match=3", "Melody=8"]) {
    const r = await cli("judge", take.id, "--verdict", "kept", "--score", score, "--json");
    console.log(`[sound-door] judge --score ${score} -> ${r.code} ${r.out.slice(0, 110)}`);
    expect(r.code, `--score ${score}`).toBe(2);
    expect((JSON.parse(r.out) as { error: string }).error).toContain("melody, instrument_choice, instrument_quality");
  }
  expect((await readTakes()).takes[0]).toMatchObject({ verdict: "unjudged", ratings: {} });
  const fine = await cli("judge", take.id, "--verdict", "kept", "--score", "melody=8,instrument_quality=6", "--json");
  expect(fine.code).toBe(0);
  expect((await readTakes()).takes[0].ratings).toEqual({ melody: 8, instrument_quality: 6 });
});

/* ── what is sent is held to the bounds, and the take files what was sent ── */

test("generate: the text sent with its negative tail is held to 4100, and a negative to what the take files", async () => {
  // 4000 characters of prompt pass the prompt's own bound; the "No …" tail takes it past 4100.
  const long = genReq({ prompt: `${"warm rhodes bed ".repeat(250)}`.trim(), negative: Array.from({ length: 30 }, (_, i) => `voice${i}`).join(", ") });
  const over = await refusal(() => generateTake(parseGenerateRequest(long)));
  console.log(`[sound-door] prompt+tail -> ${JSON.stringify(over)}; vendor calls ${calls.length}`);
  expect(over?.status).toBe(400);
  expect(calls.length, "a prompt past the vendor's bound was sent").toBe(0);
  // A negative longer than the take files (2000) would be sent whole and kept cut.
  const neg = await refusal(() => generateTake(parseGenerateRequest(genReq({ negative: Array.from({ length: 300 }, (_, i) => `noise${i}`).join(", ") }))));
  expect(neg?.status).toBe(400);
  expect(calls.length).toBe(0);
  // In bounds, the take keeps the negative it sent.
  const take = await generateTake(parseGenerateRequest(genReq({ negative: "vocals, choir" })));
  expect(take.negative).toBe("vocals, choir");
  expect((calls[0].body as { prompt: string }).prompt.endsWith("No vocals, no choir.")).toBe(true);
});

/* ── a drafted plan is held to the length bound its render buys ─────────── */

test("generate plan: a drafted plan's own length is held to the music bound, and every section has one", async () => {
  const chunk = (ms: number) => ({ text: "[Section]", duration_ms: ms, positive_styles: ["lo-fi"], negative_styles: [] });
  // The operator's window is wide here, so the bound under test is the vendor's, not the budget's.
  process.env.MUSIC_BUDGET_SECONDS_PER_WINDOW = "100000";
  __resetMusicBudget();
  // durationS is in bounds; the plan - what is actually rendered and metered - is not.
  const cases: [string, unknown][] = [
    ["700 s of plan", { chunks: [chunk(400_000), chunk(300_000)] }],
    ["a section of no length", { chunks: [chunk(5000), chunk(0)] }],
    ["a negative section", { chunks: [chunk(605_000), chunk(-600_000)] }],
  ];
  for (const [what, plan] of cases) {
    const r = await refusal(() => generateTake(parseGenerateRequest(genReq({ op: "plan", prompt: "", durationS: 10, plan }))));
    console.log(`[sound-door] plan: ${what} -> ${JSON.stringify(r)}`);
    expect(r?.status, what).toBe(400);
  }
  expect(calls.length, "an out-of-bounds plan was sent").toBe(0);
  const take = await generateTake(parseGenerateRequest(genReq({ op: "plan", prompt: "", durationS: 10, plan: PLAN })));
  expect(take.durationS).toBe(10);
  expect(calls.length).toBe(1);
});

/* ── what a section edit is metered at ───────────────────────────────────── */

test("section edit: the meter books the whole edit plan, kept ranges included - editSeconds is the guard, not the charge", async () => {
  const source = await generateTake(parseGenerateRequest(genReq()));
  const before = await currentMusicSeconds();
  await generateTake(parseGenerateRequest(genReq({ op: "section-edit", prompt: "", sourceTakeId: source.id, editModes: ["keep", "high"] })));
  const booked = (await currentMusicSeconds()) - before;
  console.log(`[sound-door] edit ["keep","high"] over a 10 s plan -> booked ${booked}s; editSeconds ${editSeconds(PLAN, ["keep", "high"])}s`);
  expect(editSeconds(PLAN, ["keep", "high"])).toBe(5);
  expect(booked).toBe(10);
});
