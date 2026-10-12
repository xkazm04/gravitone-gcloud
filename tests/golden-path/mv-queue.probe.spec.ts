// LANE — THE MUSIC-VIDEO QUEUE (lib/sound/mv, app/api/sound/mv/*), offline,
// on FAKE engines and a temp store.
//
// Every engine the worker reaches is swapped through `__setMvEngines`: the
// analysis, the render, the still, the clip download and the
// text turns (an injected reason function, as the Suno propose lane does). No
// browser, no ffmpeg, no model, no vendor, no credits. One case drives the
// still through the REAL router with LEONARDO_STUDIO_DRIVER=fake, the studio
// package's own stand-in. SOUND_STORE_DIR, SOUND_LEDGER_PATH and the publish
// roots point at a fresh temp dir per test, and the worker singleton is reset
// as a fresh process would find it. What is pinned, through the real route
// handlers wherever a route exists:
//
//   · the switch: an enqueue never starts the queue; Start drains it FIFO,
//     one job at a time, through every phase, persisting the phase while each
//     engine runs; files land under mv/<jobId>/;
//   · regenerate: each part re-runs ONLY its steps (engine calls counted) and
//     every file it does not name is byte-identical (sha256); an image
//     regenerate with the operator's own prompt runs no treatment turn;
//   · no thumbnail step (2026-10-12) and no pulsing element: a `focal` in the
//     model's answer is dropped;
//   · Stop between steps returns the job to the queue holding its files, and
//     Start resumes at the missing step; a crash stops the queue naming the
//     job and its phase, and Start resumes at the missing step;
//   · the treatment: out-of-range numbers clamped, the no-text clause welded
//     on; the turn sees the clean title and the analysis, never a lyric;
//   · the metadata: held to snippetProblem (trimmed by code, or the job fails
//     with the validator's sentence); chapters only from >= 3 sections;
//   · import: N added, a re-import adds 0, a missing dir is a 400; Drop
//     deletes the files and keeps the record; Calendar creates a slot with the
//     metadata; the file route answers a range with 206.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { __resetBudget } from "@/lib/imaging/budget";
import { FAKE_LEONARDO_STUDIO, resetFakeLeonardoStudio } from "@/lib/imaging/providers/leonardoStudio";
import { readSchedule } from "@/lib/publish/store";
import { snippetProblem } from "@/lib/publish/youtube";
import { chaptersOf, fitMetadata } from "@/lib/sound/mv/metadata";
import { __resetMvWorker, __setMvEngines, kickMvWorker, type MvEngines } from "@/lib/sound/mv/queue";
import { cleanTitle, readMv, trackTitle, type MvFile } from "@/lib/sound/mv/store";
import { NO_TEXT_CLAUSE, parseTreatment, treatmentInput } from "@/lib/sound/mv/treatment";
import type { MvAnalysis, MvImportResult, MvJob, MvSnapshot } from "@/lib/sound/mv/types";
import type { TextRequest, TextResult } from "@/lib/text/types";
import { GET as mvGET, POST as mvPOST } from "@/app/api/sound/mv/route";
import { POST as runPOST } from "@/app/api/sound/mv/run/route";
import { POST as importPOST } from "@/app/api/sound/mv/import/route";
import { DELETE as jobDELETE, PATCH as jobPATCH, POST as jobPOST } from "@/app/api/sound/mv/jobs/[id]/route";
import { GET as fileGET } from "@/app/api/sound/mv/jobs/[id]/file/route";
import { POST as calendarPOST } from "@/app/api/sound/mv/jobs/[id]/calendar/route";

import { keepEnv } from "./_helpers";

const SECRET = "mv-probe-secret";
keepEnv([
  "SOUND_STORE_DIR",
  "SOUND_LEDGER_PATH",
  "PUBLISH_STORE_DIR",
  "PUBLISH_EXPORTS_DIR",
  "AD_EXPORT_DIR",
  "PUBLISH_MODE",
  "NEXT_PUBLIC_DEV_AUTH",
  "LOCAL_BINARIES",
  "LEONARDO_STUDIO_DRIVER",
  "LEONARDO_STUDIO_CDP",
  "IMAGING_ENV",
  ACCESS_SECRET_VAR,
]);

let root = "";

/* ── the fakes ────────────────────────────────────────────────────────────── */

const ANALYSIS: MvAnalysis = {
  durationS: 95,
  tempoBpm: [120, 60],
  energyShape: [0.2, 0.3, 0.5, 0.6, 0.8, 0.9, 0.7, 0.5, 0.3, 0.1],
  sections: [
    { startS: 0.4, label: "Intro" },
    { startS: 20, label: "Verse" },
    { startS: 50, label: "Chorus" },
    { startS: 80, label: "Outro" },
  ],
};

interface Calls {
  analyse: number;
  render: number;
  still: string[];
  fetchClip: number;
  treat: TextRequest[];
  motion: TextRequest[];
  metadata: TextRequest[];
  /** The phase persisted on the job while each engine ran. */
  phases: string[];
}
let calls: Calls;
/** Per-test knobs on the fakes. */
let knobs: {
  analysis: MvAnalysis;
  stillHold: Promise<void> | null;
  stillEntered: (() => void) | null;
  metadataAnswer: (n: number) => unknown;
  metadataFail: string | null;
};

const phaseNow = async (): Promise<string> => (await readMv()).jobs.find((j) => j.state === "active")?.phase ?? "-";

function fakeEngines(): Partial<MvEngines> {
  return {
    analyse: async ({ envelopePath }) => {
      calls.analyse++;
      calls.phases.push(`analyse@${await phaseNow()}`);
      writeFileSync(envelopePath, JSON.stringify({ fps: 30, frames: calls.analyse }));
      return structuredClone(knobs.analysis);
    },
    render: async ({ outPath, motion }) => {
      calls.render++;
      calls.phases.push(`render@${await phaseNow()}`);
      writeFileSync(outPath, `video #${calls.render} ${JSON.stringify(motion)}`);
      return { durationS: 95 };
    },
    still: async ({ prompt }) => {
      calls.still.push(prompt);
      calls.phases.push(`still@${await phaseNow()}`);
      knobs.stillEntered?.();
      if (knobs.stillHold) await knobs.stillHold;
      return { bytes: new Uint8Array(Buffer.from(`jpeg #${calls.still.length}`)), mime: "image/jpeg" };
    },
    fetchClip: async () => {
      calls.fetchClip++;
      return new Uint8Array(Buffer.from("clip-bytes"));
    },
    health: async () => ({ ok: true }),
    reason: async (req: TextRequest): Promise<TextResult> => {
      const required = (req.schema as { required?: string[] } | undefined)?.required ?? [];
      calls.phases.push(`${req.turn}@${await phaseNow()}`);
      let json: unknown;
      if (req.turn === "mv-metadata") {
        calls.metadata.push(req);
        if (knobs.metadataFail) throw new Error(knobs.metadataFail);
        json = knobs.metadataAnswer(calls.metadata.length);
      } else if (required.length === 1 && required[0] === "motion") {
        calls.motion.push(req);
        json = { motion: { focal: { kind: "ring", x: 0.9, y: 0.1, r: 0.2, hue: 30 + calls.motion.length }, particleDensity: 0.3, particleHue: 40, pulseStrength: 0.4 } };
      } else {
        calls.treat.push(req);
        json = {
          prompt: `matte painted dusk valley, version ${calls.treat.length}`,
          negativePrompt: "people, busy foreground",
          motion: { focal: { kind: "halo", x: 0.7, y: 0.3, r: 0.12, hue: 200 }, particleDensity: 0.5, particleHue: 210, pulseStrength: 0.6 },
          rationale: `a quiet valley for a slow track (${calls.treat.length})`,
        };
      }
      return { text: JSON.stringify(json), json, provenance: { provider: "claude-cli" } as TextResult["provenance"] };
    },
  };
}

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "mv-probe-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.SOUND_LEDGER_PATH = path.join(root, "ledger.json");
  process.env.PUBLISH_STORE_DIR = path.join(root, "publish");
  process.env.PUBLISH_EXPORTS_DIR = path.join(root, "exports");
  delete process.env.AD_EXPORT_DIR;
  delete process.env.PUBLISH_MODE;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  delete process.env.LOCAL_BINARIES;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  __resetRateLimit();
  __resetMvWorker();
  calls = { analyse: 0, render: 0, still: [], fetchClip: 0, treat: [], motion: [], metadata: [], phases: [] };
  knobs = {
    analysis: ANALYSIS,
    stillHold: null,
    stillEntered: null,
    metadataAnswer: (n) => ({ title: `ambient visualizer, take ${n}`, description: "A slow track that builds and falls away.", tags: ["ambient", "visualizer", "slow", "calm", "dusk", "valley", "music visualizer", "instrumental mood"] }),
    metadataFail: null,
  };
  __setMvEngines(fakeEngines());
});

test.afterEach(async () => {
  knobs.stillHold = null;
  // The drain kick runs against THIS test's store, pinned here: keepEnv's own
  // afterEach (registered first) may already have restored SOUND_STORE_DIR to
  // nothing, and a kick then lands on the real foundry-out/sound - where a
  // fresh worker's crash recovery requeues whatever is active and switches
  // the operator's queue off. Measured 2026-10-12: two probe runs stopped a
  // live music-video render mid-job.
  const restored = process.env.SOUND_STORE_DIR;
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  try {
    await kickMvWorker(); // never leave a loop writing into a removed dir
  } finally {
    __resetMvWorker();
    if (restored === undefined) delete process.env.SOUND_STORE_DIR;
    else process.env.SOUND_STORE_DIR = restored;
  }
  rmSync(root, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let ipN = 0;
function rq(pathname: string, method = "GET", json?: unknown, extra: Record<string, string> = {}): Request {
  const headers: Record<string, string> = { authorization: `Bearer ${SECRET}`, "x-forwarded-for": `10.9.${++ipN % 250}.1`, ...extra };
  if (json !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${pathname}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
}
const read = async <T>(res: Response): Promise<T> => (await res.json()) as T;
const sha = (abs: string) => createHash("sha256").update(readFileSync(abs)).digest("hex");
const abs = (rel: string) => path.join(process.env.SOUND_STORE_DIR!, rel);

/** A folder of tiny "mp3"s - createTake reads the type off the extension and
 *  nothing here decodes audio. */
function audioDir(names: string[]): string {
  const dir = path.join(root, "music");
  mkdirSync(dir, { recursive: true });
  names.forEach((n, i) => writeFileSync(path.join(dir, n), `ID3 fake audio ${i} ${n}`));
  return dir;
}

async function importDir(dir: string): Promise<MvImportResult> {
  const res = await importPOST(rq("/api/sound/mv/import", "POST", { dir }));
  expect(res.status).toBe(200);
  return read<MvImportResult>(res);
}

async function enqueueTakes(ids: string[], titles: string[]): Promise<MvJob[]> {
  const res = await mvPOST(rq("/api/sound/mv", "POST", { sources: ids.map((id, i) => ({ kind: "take", id, title: titles[i] })) }));
  expect(res.status).toBe(201);
  return (await read<{ jobs: MvJob[] }>(res)).jobs;
}

async function start(): Promise<void> {
  expect((await runPOST(rq("/api/sound/mv/run", "POST", { running: true }))).status).toBe(200);
  await kickMvWorker();
}

/** One finished job from one imported track. */
async function oneDone(title = "07_Porch Light Burning Low (instrumental)"): Promise<MvJob> {
  const { takeIds } = await importDir(audioDir([`${title}.mp3`]));
  const [job] = await enqueueTakes(takeIds, [title]);
  await start();
  const done = (await readMv()).jobs.find((j) => j.id === job.id)!;
  expect(done.state).toBe("done");
  return done;
}

function hashes(j: MvJob): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, rel] of Object.entries(j.files)) out[k] = sha(abs(rel!));
  return out;
}

const regenerate = async (id: string, part: string, note?: string, prompt?: string) => {
  const res = await jobPOST(rq(`/api/sound/mv/jobs/${id}`, "POST", { part, ...(note ? { note } : {}), ...(prompt ? { prompt } : {}) }), ctx(id));
  expect(res.status).toBe(200);
  await kickMvWorker();
  return (await readMv()).jobs.find((j) => j.id === id)!;
};

/* ── 1. the switch, FIFO, every phase ─────────────────────────────────────── */

test("enqueue never starts; Start drains FIFO through every phase, persisting each; files land", async () => {
  const { takeIds } = await importDir(audioDir(["01_Walls Unwind (main).mp3", "02_The Kettle Ticks.mp3"]));
  const jobs = await enqueueTakes(takeIds, ["01_Walls Unwind (main)", "02_The Kettle Ticks"]);
  // the same track again while it is queued: its live job, not a second one
  const again = await enqueueTakes([takeIds[0]], ["01_Walls Unwind (main)"]);
  expect(again[0].id).toBe(jobs[0].id);
  await kickMvWorker();
  expect(calls.phases).toEqual([]);
  expect((await readMv()).jobs.map((j) => j.state)).toEqual(["queued", "queued"]);

  await start();
  console.log(`\nMV steps\n${calls.phases.join("\n")}`);
  const perJob = ["analyse@analysing", "mv-treatment@treating", "still@imaging", "mv-metadata@writing", "render@rendering"];
  expect(calls.phases).toEqual([...perJob, ...perJob]);

  const f = await readMv();
  expect(f.jobs.map((j) => j.state)).toEqual(["done", "done"]);
  expect(f.jobs[1].startedAt!).toBeGreaterThanOrEqual(f.jobs[0].endedAt!);
  for (const j of f.jobs) {
    expect(j.id).toMatch(/^mj-[0-9a-f]{10}$/);
    expect(j.phase).toBeUndefined();
    expect(j.redo).toBeUndefined();
    expect(Object.keys(j.files).sort()).toEqual(["audio", "envelope", "still", "video"]);
    expect(j.files).toMatchObject({ audio: `mv/${j.id}/audio.mp3`, still: `mv/${j.id}/still.jpg`, video: `mv/${j.id}/video.mp4`, envelope: `mv/${j.id}/envelope.json` });
    for (const rel of Object.values(j.files)) expect(existsSync(abs(rel!))).toBe(true);
    expect(j.metadata!.title.startsWith(cleanTitle(j.source.title))).toBe(true);
    // the model's answer named a focal; the element is descoped, so it is dropped
    expect(j.treatment!.motion.focal).toBeUndefined();
    expect(j.verdict).toBeNull();
  }
  // the audio is a copy of the take's bytes
  expect(readFileSync(abs(f.jobs[0].files.audio!), "utf8")).toContain("01_Walls Unwind (main).mp3");
  // on disk, in the declared shape; nothing staged left behind
  const disk = JSON.parse(readFileSync(abs("mv.json"), "utf8")) as MvFile;
  expect(disk.version).toBe(1);
  expect(disk.queue).toEqual({ running: true });

  const snap = await read<MvSnapshot>(await mvGET(rq("/api/sound/mv")));
  expect(snap.driver).toEqual({ ok: true });
  expect(snap.jobs).toHaveLength(2);
  expect(snap.queue).toEqual({ running: true });
});

/* ── 2. regenerate, part by part ──────────────────────────────────────────── */

test("regenerate re-runs only its part's steps and keeps every other file byte-identical", async () => {
  const done = await oneDone();
  const base = { analyse: calls.analyse, render: calls.render, still: calls.still.length, treat: calls.treat.length, motion: calls.motion.length, metadata: calls.metadata.length };
  const h0 = hashes(done);

  // image: a new treatment (the note reaches it) + still + render
  const img = await regenerate(done.id, "image", "colder, a lake at night");
  expect(img.state).toBe("done");
  expect([calls.analyse - base.analyse, calls.treat.length - base.treat, calls.still.length - base.still, calls.render - base.render, calls.metadata.length - base.metadata, calls.motion.length - base.motion]).toEqual([0, 1, 1, 1, 0, 0]);
  expect(calls.treat.at(-1)!.prompt).toContain("colder, a lake at night");
  const h1 = hashes(img);
  expect([h1.audio, h1.envelope]).toEqual([h0.audio, h0.envelope]);
  expect(h1.still).not.toBe(h0.still);
  expect(h1.video).not.toBe(h0.video);
  expect(img.metadata).toEqual(done.metadata);
  expect(img.treatment!.prompt).toContain("version 2");
  expect(img.note).toBe("colder, a lake at night");
  expect(img.redo).toBeUndefined();

  // motion: same prompt, same still; only the render is new
  const b2 = { render: calls.render, still: calls.still.length, treat: calls.treat.length };
  const mot = await regenerate(done.id, "motion", "slower pulse");
  expect([calls.motion.length - base.motion, calls.render - b2.render, calls.still.length - b2.still, calls.treat.length - b2.treat]).toEqual([1, 1, 0, 0]);
  expect(calls.motion[0].prompt).toContain("slower pulse");
  expect(mot.treatment!.prompt).toBe(img.treatment!.prompt);
  expect(mot.treatment!.negativePrompt).toBe(img.treatment!.negativePrompt);
  expect(mot.treatment!.motion).toEqual({ particleDensity: 0.3, particleHue: 40, pulseStrength: 0.4 });
  const h2 = hashes(mot);
  expect([h2.audio, h2.envelope, h2.still]).toEqual([h1.audio, h1.envelope, h1.still]);
  expect(h2.video).not.toBe(h1.video);

  // metadata: the text turn only; no render
  const b3 = { render: calls.render, still: calls.still.length, metadata: calls.metadata.length };
  const meta = await regenerate(done.id, "metadata");
  expect([calls.metadata.length - b3.metadata, calls.render - b3.render, calls.still.length - b3.still]).toEqual([1, 0, 0]);
  expect(meta.note).toBeUndefined();
  expect(meta.metadata!.title).not.toBe(mot.metadata!.title);
  const h3 = hashes(meta);
  expect([h3.audio, h3.envelope, h3.still, h3.video]).toEqual([h2.audio, h2.envelope, h2.still, h2.video]);
  expect(calls.analyse).toBe(base.analyse);

  // image with the operator's own prompt: no treatment turn; the still is made
  // from their words with the no-text clause welded on; the motion is kept
  const own = "Cinematic film still, a young street guitarist in a narrow rain-wet alley at blue hour";
  const b4 = { treat: calls.treat.length, still: calls.still.length, render: calls.render, metadata: calls.metadata.length };
  const op = await regenerate(done.id, "image", undefined, own);
  expect([calls.treat.length - b4.treat, calls.still.length - b4.still, calls.render - b4.render, calls.metadata.length - b4.metadata]).toEqual([0, 1, 1, 0]);
  expect(calls.still.at(-1)).toBe(`${own} ${NO_TEXT_CLAUSE}`);
  expect(op.prompt).toBe(own);
  expect(op.treatment).toMatchObject({ prompt: `${own} ${NO_TEXT_CLAUSE}`, motion: meta.treatment!.motion, rationale: "the operator's own prompt" });
  expect(op.treatment!.negativePrompt).toBeUndefined();
  expect(hashes(op).still).not.toBe(h3.still);
  // a later regenerate without a prompt forgets it
  const after = await regenerate(done.id, "motion");
  expect(after.prompt).toBeUndefined();
  // a prompt goes with the image part only
  expect((await jobPOST(rq(`/api/sound/mv/jobs/${done.id}`, "POST", { part: "motion", prompt: "x" }), ctx(done.id))).status).toBe(400);

  // regenerate is for finished jobs only, and names a known part
  expect((await jobPOST(rq(`/api/sound/mv/jobs/${done.id}`, "POST", { part: "everything" }), ctx(done.id))).status).toBe(400);
});

/* ── 3. stop, crash, resume ───────────────────────────────────────────────── */

test("Stop between steps returns the job to the queue with its files; Start resumes at the missing step", async () => {
  const { takeIds } = await importDir(audioDir(["03_Door on the Chain.mp3"]));
  const [job] = await enqueueTakes(takeIds, ["03_Door on the Chain"]);
  let release!: () => void;
  knobs.stillHold = new Promise<void>((r) => (release = r));
  const entered = new Promise<void>((r) => (knobs.stillEntered = r));
  expect((await runPOST(rq("/api/sound/mv/run", "POST", { running: true }))).status).toBe(200);
  const running = kickMvWorker();
  await entered;
  expect((await readMv()).jobs[0]).toMatchObject({ state: "active", phase: "imaging" });
  // the job being made is not deleted from under the worker
  expect((await jobDELETE(rq(`/api/sound/mv/jobs/${job.id}`, "DELETE"), ctx(job.id))).status).toBe(409);
  const stop = await runPOST(rq("/api/sound/mv/run", "POST", { running: false }));
  expect(await read<unknown>(stop)).toEqual({ queue: { running: false } });
  knobs.stillHold = null;
  knobs.stillEntered = null;
  release();
  await running;
  const stopped = (await readMv()).jobs[0];
  // the still in flight landed; then the queue stopped before the next step
  expect(stopped.state).toBe("queued");
  expect(stopped.phase).toBeUndefined();
  expect(Object.keys(stopped.files).sort()).toEqual(["audio", "envelope", "still"]);
  expect(calls.metadata).toHaveLength(0);
  await start();
  const f = (await readMv()).jobs[0];
  expect(f.state).toBe("done");
  expect([calls.analyse, calls.treat.length, calls.still.length, calls.metadata.length, calls.render]).toEqual([1, 1, 1, 1, 1]);
});

test("crash-resume: an active job goes back to queued, the queue stops naming the job and phase, and Start resumes at the missing step", async () => {
  const { takeIds } = await importDir(audioDir(["08_Stay (instrumental).mp3"]));
  const id = "mj-00000000aa";
  const dir = abs(`mv/${id}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "audio.mp3"), "audio");
  writeFileSync(path.join(dir, "envelope.json"), "{}");
  const treatment = parseTreatment({ prompt: "fog over a harbour", motion: {}, rationale: "r" });
  const file: MvFile = {
    version: 1,
    queue: { running: true },
    jobs: [{ id, source: { kind: "take", id: takeIds[0], title: "08_Stay (instrumental)" }, state: "active", phase: "imaging", analysis: ANALYSIS, treatment, files: { audio: `mv/${id}/audio.mp3`, envelope: `mv/${id}/envelope.json` }, verdict: null, enqueuedAt: Date.now() - 5000, startedAt: Date.now() - 4000 }],
    imports: (await readMv()).imports,
    progress: {},
  };
  writeFileSync(abs("mv.json"), JSON.stringify(file));
  await kickMvWorker();
  const stopped = await readMv();
  expect(calls.phases).toEqual([]);
  expect(stopped.jobs[0].state).toBe("queued");
  expect(stopped.queue.running).toBe(false);
  expect(stopped.queue.interrupted).toContain('"Stay"');
  expect(stopped.queue.interrupted).toContain("imaging");
  await start();
  expect((await readMv()).queue).toEqual({ running: true });
  // analysis and treatment were there: the still is the first step taken
  expect(calls.phases[0]).toBe("still@imaging");
  expect([calls.analyse, calls.treat.length, calls.still.length]).toEqual([0, 0, 1]);
  expect((await readMv()).jobs[0].state).toBe("done");
});

/* ── 4. the treatment turn ────────────────────────────────────────────────── */

test("treatment: clamped numbers, a focal dropped, the no-text clause welded; the turn sees the clean title and no lyrics", async () => {
  const t = parseTreatment({
    prompt: "  long-exposure night photograph,\n a lake  ",
    motion: { focal: { kind: "starburst", x: -3, y: 9, r: 5, hue: 900 }, particleDensity: 7, particleHue: -40, pulseStrength: "loud" },
    rationale: "x",
  });
  expect(t.motion).toEqual({ particleDensity: 1, particleHue: 0, pulseStrength: 0.6 });
  expect(t.prompt).toBe(`long-exposure night photograph, a lake ${NO_TEXT_CLAUSE}`);
  expect(t.negativePrompt!.split(", ").slice(0, 3)).toEqual(["text", "letters", "numbers"]);
  expect(parseTreatment({ prompt: "x".repeat(4000), motion: {} }).prompt.length).toBeLessThanOrEqual(1500);
  expect(() => parseTreatment({ prompt: "", motion: {} })).toThrow("no image prompt");

  for (const [raw, clean] of [
    ["01_Walls Unwind (main)", "Walls Unwind"],
    ["10_Let the Small Hours Pass Us Instrumental", "Let the Small Hours Pass Us"],
    ["10_Decaying Guitar (instrumental)", "Decaying Guitar"],
    ["13_Wasted day", "Wasted day"],
    ["Instrumental", "Instrumental"],
  ])
    expect(cleanTitle(raw)).toBe(clean);
  // the TRACK keeps its version, so a main and an instrumental are two names on
  // the board (the 2026-10-12 live import labelled both "Walls Unwind"); the
  // turn still sees the bare title
  for (const [raw, track] of [
    ["01_Walls Unwind (main)", "Walls Unwind"],
    ["01_Walls Unwind (instrumental)", "Walls Unwind (instrumental)"],
    ["10_Let the Small Hours Pass Us Instrumental", "Let the Small Hours Pass Us (instrumental)"],
    ["13_Wasted day", "Wasted day"],
  ]) {
    expect(trackTitle(raw)).toBe(track);
    expect(cleanTitle(trackTitle(raw))).toBe(cleanTitle(raw));
  }
  // the turn's input is exactly two keys, whatever the analysis carries
  expect(Object.keys(treatmentInput("A", { ...ANALYSIS, lyrics: "la la" } as MvAnalysis)).sort()).toEqual(["analysis", "title"]);
  expect(Object.keys(treatmentInput("A", { ...ANALYSIS, lyrics: "la la" } as MvAnalysis).analysis).sort()).toEqual(["durationS", "energyShape", "sections", "tempoBpm"]);

  await oneDone("07_Porch Light Burning Low (instrumental)");
  for (const req of [calls.treat[0], calls.metadata[0]]) {
    expect(req.prompt).toContain("Porch Light Burning Low");
    expect(req.prompt).not.toContain("07_");
    expect(req.prompt).not.toMatch(/\(instrumental\)/i);
    expect(req.prompt).not.toMatch(/lyric(s)?:/i);
  }
  expect(calls.treat[0].turn).toBe("mv-treatment");
  expect(calls.metadata[0].turn).toBe("mv-metadata");
});

/* ── 5. metadata ──────────────────────────────────────────────────────────── */

test("metadata: trimmed to snippetProblem by code, chapters only from >= 3 sections, a failure verbatim", async () => {
  const long = fitMetadata(
    { title: `Porch Light ${"very ".repeat(40)}long`, description: `${"word ".repeat(1400)}<b>`, tags: Array.from({ length: 30 }, (_, i) => `a fairly long tag number ${i}`) },
    "Porch Light",
    ANALYSIS,
  );
  expect(snippetProblem(long)).toBeNull();
  expect([...long.title].length).toBeLessThanOrEqual(100);
  expect(long.title.startsWith("Porch Light")).toBe(true);
  expect(long.description).not.toContain("<");
  expect(long.description.endsWith("0:00 Intro\n0:20 Verse\n0:50 Chorus\n1:20 Outro")).toBe(true);
  expect(long.tags.length).toBeLessThanOrEqual(15);
  // the track title goes first when the model forgot it
  expect(fitMetadata({ title: "a calm visualizer", description: "d", tags: [] }, "Stay", ANALYSIS).title).toBe("Stay · a calm visualizer");

  // two sections give no chapters; a short one is folded into its neighbour
  expect(chaptersOf({ durationS: 95, sections: [{ startS: 0, label: "A" }, { startS: 50, label: "B" }] })).toEqual([]);
  expect(chaptersOf({ durationS: 95, sections: [{ startS: 0, label: "A" }, { startS: 5, label: "x" }, { startS: 30, label: "B" }, { startS: 60, label: "C" }] }).map((c) => c.label)).toEqual(["A", "B", "C"]);
  expect(fitMetadata({ title: "t", description: "d", tags: [] }, "Stay", { durationS: 95, sections: [{ startS: 0, label: "A" }, { startS: 50, label: "B" }] }).description).toBe("d");
  // what trimming cannot fix fails with the validator's own sentence
  expect(() => fitMetadata({ title: "", description: "d", tags: [] }, "", ANALYSIS)).toThrow("title is empty");

  // in the worker: an engine failure fails the job with its sentence, verbatim
  knobs.metadataFail = "gemini answered 429: quota exhausted for mv-metadata";
  const { takeIds } = await importDir(audioDir(["09_The Blue Cup.mp3"]));
  await enqueueTakes(takeIds, ["09_The Blue Cup"]);
  await start();
  const j = (await readMv()).jobs[0];
  expect(j).toMatchObject({ state: "failed", error: "gemini answered 429: quota exhausted for mv-metadata" });
  expect(calls.render).toBe(0); // writing runs before the render: a failure costs no render

  // an operator's edit is validated, not trimmed
  knobs.metadataFail = null;
  const fixed = await regenerate(j.id, "metadata");
  expect(fixed.state).toBe("done");
  const bad = await jobPATCH(rq(`/api/sound/mv/jobs/${j.id}`, "PATCH", { metadata: { title: "x".repeat(101) } }), ctx(j.id));
  expect(bad.status).toBe(400);
  expect((await read<{ error: string }>(bad)).error).toBe("title exceeds 100 characters");
  const ok = await jobPATCH(rq(`/api/sound/mv/jobs/${j.id}`, "PATCH", { metadata: { title: "The Blue Cup · edited", tags: ["blue"] } }), ctx(j.id));
  expect((await read<{ job: MvJob }>(ok)).job.metadata).toMatchObject({ title: "The Blue Cup · edited", tags: ["blue"] });
});

/* ── 6. import, verdict, calendar, file route, delete ─────────────────────── */

test("import adds N, a re-import adds 0, a missing dir is a 400; drop deletes files and keeps the record; calendar makes a slot; the file route serves a range", async () => {
  const dir = audioDir(["01_Walls Unwind (main).mp3", "01_Walls Unwind (instrumental).mp3", "notes.txt", "06_One Long Note.wav"]);
  const first = await importDir(dir);
  expect([first.added, first.skipped, first.takeIds.length]).toEqual([3, 0, 3]);
  expect(await importDir(dir)).toEqual({ added: 0, skipped: 3, takeIds: [] });
  // a re-exported file (same name, new size) is new
  writeFileSync(path.join(dir, "06_One Long Note.wav"), "a longer re-export of the track");
  expect((await importDir(dir)).added).toBe(1);
  const missing = await importPOST(rq("/api/sound/mv/import", "POST", { dir: path.join(root, "nope") }));
  expect(missing.status).toBe(400);
  expect((await read<{ error: string }>(missing)).error).toContain("there is no folder at");
  expect((await importPOST(rq("/api/sound/mv/import", "POST", {}))).status).toBe(400);
  const takes = JSON.parse(readFileSync(abs("takes.json"), "utf8")) as { takes: { id: string; label: string; verdict: string; stage: string; origin: string }[] };
  expect(takes.takes.find((t) => t.id === first.takeIds[0])).toMatchObject({ label: "Walls Unwind (instrumental)", title: "Walls Unwind (instrumental)", verdict: "kept", stage: "finalized", origin: "import" });
  // the main and the instrumental are two names, not one twice
  expect(takes.takes.filter((t) => first.takeIds.includes(t.id)).map((t) => t.label).sort()).toEqual(["One Long Note", "Walls Unwind", "Walls Unwind (instrumental)"]);
  // a managed platform refuses after the body is read
  process.env.LOCAL_BINARIES = "off";
  const forbidden = await importPOST(rq("/api/sound/mv/import", "POST", { dir }));
  expect([forbidden.status, (await read<{ code: string }>(forbidden)).code]).toEqual([503, "local-binaries-forbidden"]);
  delete process.env.LOCAL_BINARIES;

  const [job] = await enqueueTakes([first.takeIds[0]], ["01_Walls Unwind (main)"]);
  await start();
  const done = (await readMv()).jobs.find((j) => j.id === job.id)!;

  // the file route: whole, a range, a bad kind
  const whole = await fileGET(rq(`/api/sound/mv/jobs/${job.id}/file?kind=video`), ctx(job.id));
  expect(whole.status).toBe(200);
  expect(whole.headers.get("content-type")).toBe("video/mp4");
  const size = Number(whole.headers.get("content-length"));
  const part = await fileGET(rq(`/api/sound/mv/jobs/${job.id}/file?kind=video`, "GET", undefined, { range: "bytes=0-4" }), ctx(job.id));
  expect(part.status).toBe(206);
  expect(part.headers.get("content-range")).toBe(`bytes 0-4/${size}`);
  expect(await part.text()).toBe("video");
  // the access key as k= (a <video src> cannot send a header)
  const byKey = await fileGET(new Request(`http://localhost/api/sound/mv/jobs/${job.id}/file?kind=still&k=${SECRET}`), ctx(job.id));
  expect([byKey.status, byKey.headers.get("content-type")]).toEqual([200, "image/jpeg"]);
  expect((await fileGET(rq(`/api/sound/mv/jobs/${job.id}/file?kind=lyrics`), ctx(job.id))).status).toBe(400);

  // calendar: a slot carrying the metadata, the export copied with its sidecar
  const publishAt = new Date(Date.now() + 86_400_000).toISOString();
  const cal = await calendarPOST(rq(`/api/sound/mv/jobs/${job.id}/calendar`, "POST", { publishAt }), ctx(job.id));
  expect(cal.status).toBe(200);
  const { slotId, job: sent } = await read<{ slotId: string; job: MvJob }>(cal);
  expect(sent.slotId).toBe(slotId);
  const slot = (await readSchedule()).slots.find((s) => s.id === slotId)!;
  expect(slot).toMatchObject({ projectId: "audio-mv", exportId: `mv-${job.id}`, channelId: "youtube", status: "scheduled", title: done.metadata!.title, description: done.metadata!.description, tags: done.metadata!.tags });
  expect(sha(path.join(process.env.PUBLISH_EXPORTS_DIR!, `mv-${job.id}.mp4`))).toBe(sha(abs(done.files.video!)));
  expect(JSON.parse(readFileSync(path.join(process.env.PUBLISH_EXPORTS_DIR!, `mv-${job.id}.json`), "utf8"))).toEqual({ projectId: "audio-mv" });
  // twice is a 409 before anything is copied
  expect((await calendarPOST(rq(`/api/sound/mv/jobs/${job.id}/calendar`, "POST", { publishAt }), ctx(job.id))).status).toBe(409);

  // drop: the render files go, the record stays
  const dropped = await jobPATCH(rq(`/api/sound/mv/jobs/${job.id}`, "PATCH", { verdict: "drop" }), ctx(job.id));
  const dj = (await read<{ job: MvJob }>(dropped)).job;
  expect(dj.verdict).toBe("drop");
  expect(Object.keys(dj.files)).toEqual(["envelope"]);
  for (const k of ["audio", "still", "video"] as const) expect(existsSync(abs(done.files[k]!))).toBe(false);
  const rec = (await readMv()).jobs.find((j) => j.id === job.id)!;
  expect([rec.state, !!rec.treatment, !!rec.metadata, !!rec.analysis]).toEqual(["done", true, true, true]);
  expect((await fileGET(rq(`/api/sound/mv/jobs/${job.id}/file?kind=video`), ctx(job.id))).status).toBe(404);
  // a verdict that is not one is a 400
  expect((await jobPATCH(rq(`/api/sound/mv/jobs/${job.id}`, "PATCH", { verdict: "maybe" }), ctx(job.id))).status).toBe(400);

  // delete: a queued job is cancelled; a finished one is removed with its folder
  await runPOST(rq("/api/sound/mv/run", "POST", { running: false }));
  const [q] = await enqueueTakes([first.takeIds[1]], ["01_Walls Unwind (instrumental)"]);
  expect((await jobDELETE(rq(`/api/sound/mv/jobs/${q.id}`, "DELETE"), ctx(q.id))).status).toBe(200);
  expect((await readMv()).jobs.find((j) => j.id === q.id)!.state).toBe("cancelled");
  expect((await jobDELETE(rq(`/api/sound/mv/jobs/${job.id}`, "DELETE"), ctx(job.id))).status).toBe(200);
  expect((await readMv()).jobs.some((j) => j.id === job.id)).toBe(false);
  expect(existsSync(abs(`mv/${job.id}`))).toBe(false);
  expect((await jobDELETE(rq("/api/sound/mv/jobs/mj-ffffffffff", "DELETE"), ctx("mj-ffffffffff"))).status).toBe(404);
});

/* ── a Suno clip, and the real router on the studio's own fake ────────────── */

test("a kept Suno clip is downloaded once; the still goes through the real router to the fake studio", async () => {
  process.env.LEONARDO_STUDIO_DRIVER = "fake";
  process.env.LEONARDO_STUDIO_CDP = "http://127.0.0.1:9399";
  process.env.IMAGING_ENV = "dev";
  process.env.LOCAL_BINARIES = "off"; // nothing may launch a browser
  resetFakeLeonardoStudio();
  __resetBudget();
  const engines = fakeEngines();
  delete engines.still;
  delete engines.health;
  // the still and the health check are the real ones: the router, the studio
  __setMvEngines(null);
  __setMvEngines(engines);

  mkdirSync(process.env.SOUND_STORE_DIR!, { recursive: true });
  writeFileSync(
    abs("suno.json"),
    JSON.stringify({ version: 1, queue: { running: false }, proposals: [], jobs: [], clips: [{ id: "sc-00000000c1", origin: "library", jobId: null, model: "v6", songId: "s1", url: "https://suno.com/song/s1", audioUrl: "https://cdn1.suno.ai/s1.mp3", imageUrl: null, title: "Come home", durationS: 95, createdAt: 1, verdict: "keep" }] }),
  );
  const res = await mvPOST(rq("/api/sound/mv", "POST", { sources: [{ kind: "clip", id: "sc-00000000c1", title: "12_Come home" }] }));
  expect(res.status).toBe(201);
  const snap = await read<MvSnapshot>(await mvGET(rq("/api/sound/mv")));
  expect(snap.driver.ok).toBe(true);
  await start();
  const j = (await readMv()).jobs[0];
  expect(j.state).toBe("done");
  expect(calls.fetchClip).toBe(1);
  expect(j.files.audio).toBe(`mv/${j.id}/audio.mp3`);
  expect(FAKE_LEONARDO_STUDIO.calls).toHaveLength(1);
  expect(FAKE_LEONARDO_STUDIO.calls[0]).toMatchObject({ aspect: "16:9" });
  expect(FAKE_LEONARDO_STUDIO.calls[0].prompt).toContain(NO_TEXT_CLAUSE);
  expect(j.files.still).toBe(`mv/${j.id}/still.png`);
  expect(readFileSync(abs(j.files.still!)).subarray(1, 4).toString()).toBe("PNG");
  // a regenerate never re-downloads the clip
  await regenerate(j.id, "motion");
  expect(calls.fetchClip).toBe(1);
});

