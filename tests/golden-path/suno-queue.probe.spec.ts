// LANE — THE SUNO QUEUE (lib/sound/suno, app/api/sound/suno/*), offline,
// against the FAKE driver and a temp store.
//
// SUNO_DRIVER=fake selects lib/sound/suno/fakeDriver.ts: no browser, no
// network, no vendor, no credits. SOUND_STORE_DIR and GRAVITONE_STORE_PATH
// point at a fresh temp dir per test. Since Phase 4 (L31) a queued prompt is
// a KERNEL JOB on box.chrome (lib/producers/suno.ts), launched by Start and
// driven here by `drain` - the same driveSuno pipeline/suno.mts runs; v1's
// in-process worker and its kick are gone. What is pinned, through the REAL
// route handlers where a route exists:
//
//   · the switch: an enqueue never launches; Start launches and the drive runs
//     it, Stop lets the create in flight finish and returns its job holding
//     the clips it has;
//   · FIFO: jobs run in the order they were queued, one at a time;
//   · every job renders on BOTH models, 2 clips each = 4 clips, verdict null;
//   · crash-resume: an `active` record a v1 worker left behind reads queued,
//     naming the job and model, and after Start a model that already landed
//     clips is not created again (a crash under the kernel is
//     tests/next-server/producer-suno-crash.test.ts);
//   · clear: prompts and clip records removed, queued jobs cancelled, a running
//     job and a queued prompt skipped, all in one write;
//   · a failure fails ITS job with the driver's sentence verbatim, the
//     proposal wears it and is a candidate again, and the queue goes on;
//   · cancel: a queued job only - an active one is a 409;
//   · a driver that is not ok stops the drive without failing a job (kernel
//     `unhealthy`), a snapshot read starts nothing, and the next drive after it
//     recovers drains it;
//   · a hunt leaf becomes ONE proposal however often it is queued;
//   · the propose turn's answer is held to Suno's form limits (no model call:
//     the reason function is injected);
//   · the library import: every listed song becomes a clip (origin "library",
//     no job, no verdict, no lane) carrying its Suno URL, title, model and
//     prompt; a second run adds 0, and a song our queue already rendered is
//     skipped; through the AUDIO ADAPTER over the real routes, a library clip
//     lands ungrouped in triage under every axis, a lane move persists, and
//     keep / drop work as they do on a queue clip.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { FAKE_SUNO, resetFakeSuno } from "@/lib/sound/suno/fakeDriver";
import { proposeSuno } from "@/lib/sound/suno/propose";
import { closeProcessKernel } from "@gt/kernel/process";
import { driveSuno } from "@/lib/producers/suno";
import type { Drive } from "@/lib/producers/sound";
import { queuedSunoJobs, sunoDriver } from "@/lib/sound/suno/queue";
import { readSuno, STYLE_MAX, type SunoFile } from "@/lib/sound/suno/store";
import type { Hunt, HuntNode } from "@/lib/sound/types";
import type { SunoClip, SunoImportResult, SunoJob, SunoProposal, SunoSnapshot } from "@/lib/suno/types";
import type { TextRequest, TextResult } from "@/lib/text/types";
import { GET as sunoGET } from "@/app/api/sound/suno/route";
import { POST as proposalsPOST } from "@/app/api/sound/suno/proposals/route";
import { DELETE as proposalDELETE } from "@/app/api/sound/suno/proposals/[id]/route";
import { POST as queuePOST } from "@/app/api/sound/suno/queue/route";
import { DELETE as queueDELETE } from "@/app/api/sound/suno/queue/[id]/route";
import { PATCH as clipPATCH } from "@/app/api/sound/suno/clips/[id]/route";
import { POST as libraryPOST } from "@/app/api/sound/suno/library/route";
import { POST as runPOST } from "@/app/api/sound/suno/run/route";
import { POST as clearPOST } from "@/app/api/sound/suno/clear/route";
import { UNGROUPED_LANE } from "@/lib/board/pipeline";
import { makeAudioSource } from "@/lib/board/sources/audio";

import { keepEnv } from "./_helpers";

const SECRET = "suno-probe-secret";
keepEnv(["SOUND_STORE_DIR", "SUNO_DRIVER", "NEXT_PUBLIC_DEV_AUTH", "GRAVITONE_STORE_PATH", "GRAVITONE_DRY_ONLY", ACCESS_SECRET_VAR]);

let root = "";

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "suno-probe-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.GRAVITONE_STORE_PATH = path.join(root, "kernel.sqlite");
  process.env.SUNO_DRIVER = "fake";
  delete process.env.GRAVITONE_DRY_ONLY;
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  __resetRateLimit();
  resetFakeSuno();
});

test.afterEach(() => {
  FAKE_SUNO.health = { ok: true };
  // Nothing runs in the background any more (v1's worker loop did, and once
  // stopped a live render from a probe): the kernel handle is closed so
  // Windows lets the temp dir go.
  closeProcessKernel();
  rmSync(root, { recursive: true, force: true });
});

/* ── helpers ──────────────────────────────────────────────────────────────── */

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
let ipN = 0;
function rq(pathname: string, method = "GET", json?: unknown): Request {
  const headers: Record<string, string> = { authorization: `Bearer ${SECRET}`, "x-forwarded-for": `10.8.${++ipN % 250}.1` };
  if (json !== undefined) headers["content-type"] = "application/json";
  return new Request(`http://localhost${pathname}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : undefined });
}
const read = async <T>(res: Response): Promise<T> => (await res.json()) as T;

async function propose(style: string, title?: string): Promise<SunoProposal> {
  const res = await proposalsPOST(rq("/api/sound/suno/proposals", "POST", { fields: { style, ...(title ? { title } : {}), lyrics: "[Instrumental]" }, lane: { axis: "group", value: "electronic" } }));
  expect(res.status).toBe(201);
  return (await read<{ proposal: SunoProposal }>(res)).proposal;
}

async function enqueue(ids: string[]): Promise<SunoJob[]> {
  const res = await queuePOST(rq("/api/sound/suno/queue", "POST", { proposalIds: ids }));
  expect(res.status).toBe(201);
  return (await read<{ jobs: SunoJob[] }>(res)).jobs;
}

/** Drive every queued Suno job on this process, in queue order, until none
 *  is left or the drive stops short (pipeline/suno.mts start's loop). */
async function drain(): Promise<Drive> {
  let last: Drive = { reports: [] };
  for (let ids = queuedSunoJobs("live"); ids.length; ids = queuedSunoJobs("live")) {
    last = await driveSuno(ids, { driver: sunoDriver(), dryOnly: false });
    if (last.stopped !== undefined) break;
  }
  return last;
}

/** The Queue column's Start, through the real route, then the drive. */
async function start(): Promise<Drive> {
  const res = await runPOST(rq("/api/sound/suno/run", "POST", { running: true }));
  expect(res.status).toBe(200);
  return drain();
}

/** The first job, once the worker has persisted `phase` on it. Polled at 25ms,
 *  not faster: Windows refuses a rename onto a file a reader holds open, and a
 *  5ms poll kept suno.json open often enough that the worker's write retries
 *  all lost (measured 2026-10-12, 6 in 120 runs) - the phase write was dropped,
 *  the held driver never released, and the test timed out. */
async function untilPhase(phase: SunoJob["phase"]): Promise<SunoJob | undefined> {
  let seen: SunoJob | undefined;
  for (let i = 0; i < 800 && seen?.phase !== phase; i++) {
    await new Promise((r) => setTimeout(r, 25));
    seen = (await readSuno()).jobs[0];
  }
  return seen;
}

const storeFile = () => path.join(process.env.SOUND_STORE_DIR!, "suno.json");
function writeStore(f: SunoFile) {
  mkdirSync(path.dirname(storeFile()), { recursive: true });
  writeFileSync(storeFile(), JSON.stringify(f, null, 2));
}

/* ── the queue ────────────────────────────────────────────────────────────── */

test("FIFO, both models, 4 clips per job, persisted to suno.json", async () => {
  const a = await propose("lo-fi house, rhodes", "A");
  const b = await propose("dub techno, foggy chords", "B");
  const c = await propose("ambient, granular piano", "C");
  FAKE_SUNO.delayMs = 2;
  await enqueue([a.id]);
  await enqueue([b.id, c.id]);
  await drain();
  // queued is not launched: nothing spends until the operator presses Start
  expect(FAKE_SUNO.calls).toEqual([]);
  expect((await readSuno()).jobs.map((j) => j.state)).toEqual(["queued", "queued", "queued"]);
  await start();

  console.log(`\nSUNO calls\n${FAKE_SUNO.calls.map((x) => `${x.style} @ ${x.model}`).join("\n")}`);
  expect(FAKE_SUNO.calls).toEqual([
    { style: a.fields.style, model: "v6" },
    { style: a.fields.style, model: "v6-wild" },
    { style: b.fields.style, model: "v6" },
    { style: b.fields.style, model: "v6-wild" },
    { style: c.fields.style, model: "v6" },
    { style: c.fields.style, model: "v6-wild" },
  ]);

  const f = await readSuno();
  expect(f.jobs.map((j) => j.state)).toEqual(["done", "done", "done"]);
  for (const j of f.jobs) {
    expect(j.clipIds).toHaveLength(4);
    const clips = f.clips.filter((x) => x.jobId === j.id);
    expect(clips.map((x) => x.model).sort()).toEqual(["v6", "v6", "v6-wild", "v6-wild"]);
    expect(clips.every((x) => x.verdict === null && x.url.startsWith("https://suno.com/song/"))).toBe(true);
    expect(j.startedAt).toBeGreaterThanOrEqual(j.enqueuedAt);
    expect(j.endedAt).toBeGreaterThanOrEqual(j.startedAt!);
    expect(j.phase).toBeUndefined();
  }
  // serial: each job started after the one before it ended
  expect(f.jobs[1].startedAt!).toBeGreaterThanOrEqual(f.jobs[0].endedAt!);
  expect(f.jobs[2].startedAt!).toBeGreaterThanOrEqual(f.jobs[1].endedAt!);

  // on disk, in the declared shape, atomically (no tmp file left beside it)
  const disk = JSON.parse(readFileSync(storeFile(), "utf8")) as SunoFile;
  expect(Object.keys(disk).sort()).toEqual(["clips", "jobs", "proposals", "queue", "version"]);
  expect(disk.queue).toEqual({ running: true });
  expect(disk.clips).toHaveLength(12);
  expect(readdirSync(path.dirname(storeFile())).filter((n) => n.endsWith(".tmp") || n === ".lock")).toEqual([]);

  // the snapshot route answers with the driver's health
  const snap = await read<SunoSnapshot>(await sunoGET(rq("/api/sound/suno")));
  expect(snap.driver).toEqual({ ok: true });
  expect(snap.clips).toHaveLength(12);

  // a done proposal is not queued twice
  const again = await queuePOST(rq("/api/sound/suno/queue", "POST", { proposalIds: [a.id] }));
  expect(again.status).toBe(409);

  // the gate's verdict
  const clipId = f.clips[0].id;
  const kept = await clipPATCH(rq(`/api/sound/suno/clips/${clipId}`, "PATCH", { verdict: "keep" }), ctx(clipId));
  expect((await read<{ clip: { verdict: string } }>(kept)).clip.verdict).toBe("keep");
  expect((await clipPATCH(rq(`/api/sound/suno/clips/${clipId}`, "PATCH", { verdict: "maybe" }), ctx(clipId))).status).toBe(400);
});

test("the active phase and model are persisted while the driver works", async () => {
  const a = await propose("lo-fi house, rhodes");
  let release!: () => void;
  FAKE_SUNO.hold = new Promise<void>((r) => (release = r));
  await enqueue([a.id]);
  expect((await runPOST(rq("/api/sound/suno/run", "POST", { running: true }))).status).toBe(200);
  const running = drain();
  const seen = await untilPhase("creating");
  expect(seen).toMatchObject({ state: "active", phase: "creating", model: "v6" });
  // a running job is not cancelled
  const refused = await queueDELETE(rq(`/api/sound/suno/queue/${seen!.id}`, "DELETE"), ctx(seen!.id));
  expect(refused.status).toBe(409);
  expect((await read<{ error: string }>(refused)).error).toBe("rendering now - it lands in triage when Suno finishes");
  // nor is its proposal discarded from under it
  expect((await proposalDELETE(rq(`/api/sound/suno/proposals/${a.id}`, "DELETE"), ctx(a.id))).status).toBe(409);
  FAKE_SUNO.hold = null;
  release();
  await running;
  expect((await readSuno()).jobs[0].state).toBe("done");
});

test("crash-resume: a v1 worker's active record reads queued, naming it, and after Start only the missing model is created", async () => {
  const now = Date.now();
  const proposal: SunoProposal = { id: "sp-0000000001", fields: { style: "drill, 808 slides" }, lane: { axis: "group", value: "hip hop" }, origin: "custom", createdAt: now - 10_000 };
  writeStore({
    version: 1,
    queue: { running: true },
    proposals: [proposal],
    jobs: [
      { id: "sj-0000000001", proposalId: proposal.id, fields: proposal.fields, lane: proposal.lane, state: "active", phase: "rendering", model: "v6-wild", models: ["v6", "v6-wild"], enqueuedAt: now - 9000, startedAt: now - 8000, clipIds: ["sc-0000000001", "sc-0000000002"] },
    ],
    // Written before library import existed: no `origin`, no `prompt`. Read
    // back as queue clips carrying their job's fields.
    clips: ["sc-0000000001", "sc-0000000002"].map((id, i) => ({ id, jobId: "sj-0000000001", model: "v6" as const, songId: `old-${i}`, url: `https://suno.com/song/old-${i}`, audioUrl: null, imageUrl: null, title: "old", durationS: null, createdAt: now - 7000, verdict: null }) as unknown as SunoClip),
  });
  await drain();
  // the model that was mid-create may already be spent on Suno: nothing runs
  // until the operator has looked
  expect(FAKE_SUNO.calls).toEqual([]);
  const stopped = await read<SunoSnapshot>(await sunoGET(rq("/api/sound/suno")));
  expect(stopped.jobs[0].state).toBe("queued");
  expect(stopped.queue.interrupted).toContain('"drill, 808 slides" on v6-wild');
  await start();
  expect((await readSuno()).queue).toEqual({ running: true });
  expect(FAKE_SUNO.calls).toEqual([{ style: "drill, 808 slides", model: "v6-wild" }]);
  const f = await readSuno();
  expect(f.jobs[0].state).toBe("done");
  expect(f.jobs[0].clipIds).toHaveLength(4);
  expect(f.clips.map((c) => c.model).sort()).toEqual(["v6", "v6", "v6-wild", "v6-wild"]);
  // the legacy clips are backfilled, the new ones written whole
  expect(f.clips.every((c) => c.origin === "queue" && c.jobId === "sj-0000000001")).toBe(true);
  expect(f.clips.every((c) => c.prompt?.style === "drill, 808 slides")).toBe(true);
});

test("a failure fails its job verbatim, the proposal wears it and is a candidate again, and the queue goes on", async () => {
  const a = await propose("trap, dark", "A");
  const b = await propose("bossa nova, nylon guitar", "B");
  FAKE_SUNO.failWith = (fields, model) => (fields.style.startsWith("trap") && model === "v6-wild" ? "Suno refused the style: 'trap, dark' (moderation)" : null);
  await enqueue([a.id, b.id]);
  await start();
  const f = await readSuno();
  const [ja, jb] = f.jobs;
  expect(ja).toMatchObject({ state: "failed", error: "Suno refused the style: 'trap, dark' (moderation)" });
  expect(ja.clipIds).toHaveLength(2); // the model that landed keeps its clips
  expect(jb.state).toBe("done");
  expect(f.proposals.find((p) => p.id === a.id)!.error).toBe("Suno refused the style: 'trap, dark' (moderation)");
  // a failed proposal can be queued again; the next success clears its error
  FAKE_SUNO.failWith = () => null;
  await enqueue([a.id]); // the switch is on: launched at once
  await drain();
  const g = await readSuno();
  expect(g.jobs.at(-1)!.state).toBe("done");
  expect(g.proposals.find((p) => p.id === a.id)!.error).toBeUndefined();
  // a retry is a new job: both models again
  expect(g.jobs.at(-1)!.clipIds).toHaveLength(4);
});

test("cancel: a queued job only; enqueue is idempotent while a job is live", async () => {
  FAKE_SUNO.health = { ok: false, reason: "no Suno browser on :9334" };
  const a = await propose("city pop, slap bass");
  const [j1] = await enqueue([a.id]);
  const [j1again] = await enqueue([a.id]);
  expect(j1again.id).toBe(j1.id);
  await drain();
  const ok = await queueDELETE(rq(`/api/sound/suno/queue/${j1.id}`, "DELETE"), ctx(j1.id));
  expect(ok.status).toBe(200);
  expect((await read<{ job: SunoJob }>(ok)).job.state).toBe("cancelled");
  // twice is a 409 (already cancelled), an unknown id a 404 that creates nothing
  expect((await queueDELETE(rq(`/api/sound/suno/queue/${j1.id}`, "DELETE"), ctx(j1.id))).status).toBe(409);
  expect((await queueDELETE(rq("/api/sound/suno/queue/sj-ffffffffff", "DELETE"), ctx("sj-ffffffffff"))).status).toBe(404);
  // a cancelled proposal is a candidate: it can be queued again, and discarded
  const [j2] = await enqueue([a.id]);
  expect(j2.id).not.toBe(j1.id);
  await queueDELETE(rq(`/api/sound/suno/queue/${j2.id}`, "DELETE"), ctx(j2.id));
  expect((await proposalDELETE(rq(`/api/sound/suno/proposals/${a.id}`, "DELETE"), ctx(a.id))).status).toBe(200);
  expect(FAKE_SUNO.calls).toHaveLength(0);
});

test("a driver that is not ok stops the drive without failing a job; a read starts nothing; the next drive after it recovers drains it", async () => {
  FAKE_SUNO.health = { ok: false, reason: "Suno is signed out in the dedicated profile" };
  const a = await propose("synthwave, gated drums");
  await enqueue([a.id]);
  const paused = await start();
  expect((await readSuno()).jobs[0].state).toBe("queued");
  expect(paused.stopped).toBe("Suno is signed out in the dedicated profile");
  const snap = await read<SunoSnapshot>(await sunoGET(rq("/api/sound/suno")));
  expect(snap.driver).toEqual({ ok: false, reason: "Suno is signed out in the dedicated profile" });
  expect(FAKE_SUNO.calls).toHaveLength(0);

  FAKE_SUNO.health = { ok: true };
  // a snapshot read is a READ now: it starts nothing
  await sunoGET(rq("/api/sound/suno"));
  expect((await readSuno()).jobs[0].state).toBe("queued");
  const drained = await drain();
  expect((await readSuno()).jobs[0].state).toBe("done");
  expect(drained.stopped).toBeUndefined();
});

test("stop: the create in flight finishes, its job goes back to the queue holding its clips, and Start creates only what is missing", async () => {
  const a = await propose("uk garage, shuffled hats", "A");
  const b = await propose("cumbia, accordion", "B");
  await enqueue([a.id, b.id]);
  let release!: () => void;
  FAKE_SUNO.hold = new Promise<void>((r) => (release = r));
  expect((await runPOST(rq("/api/sound/suno/run", "POST", { running: true }))).status).toBe(200);
  const running = drain();
  expect((await untilPhase("creating"))?.phase).toBe("creating");
  const stop = await runPOST(rq("/api/sound/suno/run", "POST", { running: false }));
  expect(await read<{ queue: unknown }>(stop)).toEqual({ queue: { running: false } });
  FAKE_SUNO.hold = null;
  release();
  await running;
  const f = await readSuno();
  expect(FAKE_SUNO.calls).toEqual([{ style: "uk garage, shuffled hats", model: "v6" }]);
  expect(f.jobs.map((j) => j.state)).toEqual(["queued", "queued"]);
  expect(f.jobs[0].clipIds).toHaveLength(2);
  await start();
  expect(FAKE_SUNO.calls.slice(1)).toEqual([
    { style: "uk garage, shuffled hats", model: "v6-wild" },
    { style: "cumbia, accordion", model: "v6" },
    { style: "cumbia, accordion", model: "v6-wild" },
  ]);
  // a switch without a boolean is refused before the store is read
  expect((await runPOST(rq("/api/sound/suno/run", "POST", { running: "yes" }))).status).toBe(400);
});

test("clear: prompts and clip records removed, queued jobs cancelled; a running job and a queued prompt are skipped", async () => {
  const a = await propose("afrobeat, horns", "A");
  const b = await propose("shoegaze, wall of fuzz", "B");
  const c = await propose("baile funk", "C");
  await enqueue([a.id]);
  await start(); // a: done, 4 clips
  const [jb] = await enqueue([b.id]); // launched (the switch is on), then paused by Stop below
  await runPOST(rq("/api/sound/suno/run", "POST", { running: false }));
  const [jc] = await enqueue([c.id]);
  const before = await readSuno();
  const clipIds = before.clips.slice(0, 3).map((x) => x.id);
  const res = await clearPOST(rq("/api/sound/suno/clear", "POST", { clipIds: [...clipIds, "sc-ffffffffff"], jobIds: [jb.id], proposalIds: [c.id] }));
  expect(res.status).toBe(200);
  // 3 clips removed; b's job cancelled; c's prompt skipped (its job is queued); the unknown clip skipped
  expect(await read<unknown>(res)).toEqual({ removed: 3, cancelled: 1, skipped: 2 });
  const f = await readSuno();
  expect(f.clips).toHaveLength(1);
  expect(f.jobs.find((j) => j.id === jb.id)!.state).toBe("cancelled");
  expect(f.jobs.find((j) => j.id === jc.id)!.state).toBe("queued");
  expect(f.proposals.map((p) => p.id).sort()).toEqual([a.id, b.id, c.id].sort());
  expect(FAKE_SUNO.calls).toHaveLength(2); // clearing never reaches Suno
  expect((await clearPOST(rq("/api/sound/suno/clear", "POST", {}))).status).toBe(400);
});

/* ── hunt leaves ──────────────────────────────────────────────────────────── */

function leaf(id: string, extra: Partial<HuntNode> = {}): HuntNode {
  return {
    id,
    parentId: "nd-root",
    axis: "tempo",
    label: "slower pad",
    rationale: "calmer",
    provider: "elevenlabs",
    technique: [],
    prompt: "a slow warm pad",
    negative: "drums",
    durationS: 20,
    loop: null,
    terms: { genre: ["ambient"], mood: ["calm"], instrument: ["pad", "felt piano"], sfxCategory: null },
    tempoBpm: 70,
    key: "D minor",
    state: "idea",
    takeIds: [],
    winner: false,
    error: null,
    ...extra,
  };
}

test("a hunt leaf becomes ONE Suno proposal, a style line from its terms, instrumental unless vocal", async () => {
  const hunt: Hunt = { id: "hn-0000000001", kind: "music", idea: "calmer", createdAt: new Date().toISOString(), nodes: [leaf("nd-0000000001"), leaf("nd-0000000002", { prompt: "soulful female vocals over a pad", terms: { genre: ["neo soul"], mood: [], instrument: [], sfxCategory: null }, tempoBpm: null, key: null })], draftedBy: null, lessonId: null };
  mkdirSync(process.env.SOUND_STORE_DIR!, { recursive: true });
  writeFileSync(path.join(process.env.SOUND_STORE_DIR!, "hunts.json"), JSON.stringify({ version: 1, hunts: [hunt] }));
  FAKE_SUNO.health = { ok: false, reason: "paused for the probe" };

  const lane = { axis: "group", value: "ambient" };
  const r1 = await queuePOST(rq("/api/sound/suno/queue", "POST", { huntNodeIds: ["hn-0000000001:nd-0000000001", "nd-0000000002"], lane }));
  expect(r1.status).toBe(201);
  const r2 = await queuePOST(rq("/api/sound/suno/queue", "POST", { huntNodeIds: ["hn-0000000001:nd-0000000001"], lane }));
  expect(r2.status).toBe(201);
  const f = await readSuno();
  expect(f.proposals).toHaveLength(2);
  expect(f.jobs).toHaveLength(2);
  const [p1, p2] = f.proposals;
  console.log(`\nSUNO from hunt leaves\n${JSON.stringify(f.proposals.map((p) => p.fields), null, 2)}`);
  expect(p1).toMatchObject({ origin: "hunt", sourceId: "nd-0000000001", lane, fields: { title: "slower pad", style: "ambient, calm, pad, felt piano, 70 bpm, D minor", lyrics: "[Instrumental]", exclude: "drums" } });
  expect(p2.fields.lyrics).toBeUndefined(); // vocal: Suno writes to the style, no "[Instrumental]"
  expect(p2.fields.style).toBe("soulful female vocals over a pad");
  // an empty body names nothing: 400 before the store
  expect((await queuePOST(rq("/api/sound/suno/queue", "POST", {}))).status).toBe(400);
});

/* ── the propose turn ─────────────────────────────────────────────────────── */

test("propose: the model's answer is held to Suno's limits, persisted as llm, and a riff names its source", async () => {
  const sent: TextRequest[] = [];
  const reason = async (req: TextRequest): Promise<TextResult> => {
    sent.push(req);
    return {
      text: "",
      json: {
        proposals: [
          { title: "Night Bus", style: `${"deep house, ".repeat(30)}rhodes`, lyrics: "[Instrumental]", note: "the central reading" },
          { title: "No style", style: "  ", note: "dropped" },
          { title: "Fog", style: "dub techno, foggy chords, 122 bpm", exclude: "vocals", note: "bolder" },
        ],
      },
      provenance: {} as TextResult["provenance"],
    };
  };
  const lane = { axis: "genre", value: "house" };
  const made = await proposeSuno({ lane, count: 4 }, reason);
  expect(made).toHaveLength(2);
  expect(made.every((p) => p.origin === "llm" && p.lane.axis === "genre" && p.lane.value === "house")).toBe(true);
  expect(made[0].fields.style.length).toBeLessThanOrEqual(STYLE_MAX);
  expect(made[0].fields.style.endsWith(",")).toBe(false);
  expect(made[0].note).toBe("the central reading");
  expect(sent[0].schema).toBeTruthy();
  expect(sent[0].prompt).toContain('grouped by genre = "house"');
  expect(sent[0].prompt).toContain("Write 4 new prompts");

  const riffs = await proposeSuno({ lane, count: 3, riffOf: made[1].id }, reason);
  expect(riffs.every((p) => p.origin === "riff" && p.sourceId === made[1].id)).toBe(true);
  expect(sent[1].prompt).toContain("style: dub techno, foggy chords, 122 bpm");
  expect(sent[1].prompt).toContain("Write 3 variations");
  // examples: the lane's own prompts go back in, so the model varies from them
  expect(sent[1].prompt).toContain("- dub techno, foggy chords, 122 bpm");
  expect((await readSuno()).proposals).toHaveLength(4);
});

/* ── the library import ───────────────────────────────────────────────────── */

const importLibrary = async (): Promise<SunoImportResult> => {
  const res = await libraryPOST(rq("/api/sound/suno/library", "POST", { all: true }));
  expect(res.status).toBe(200);
  return read<SunoImportResult>(res);
};

test("library import: every song becomes an ungrouped, unjudged library clip; a re-run adds 0; a song the queue rendered is skipped", async () => {
  // the queue renders first: its first clip is song fake-0001, which the fake library lists too
  const a = await propose("lo-fi house, rhodes", "A");
  await enqueue([a.id]);
  await start();
  expect((await readSuno()).clips.map((c) => c.songId)).toContain("fake-0001");

  // an empty body names nothing: 400 before the driver is asked
  expect((await libraryPOST(rq("/api/sound/suno/library", "POST", {}))).status).toBe(400);
  expect(FAKE_SUNO.libraryReads).toBe(0);

  const first = await importLibrary();
  console.log(`\nSUNO library import #1 ${JSON.stringify(first)}`);
  expect(first).toEqual({ added: 2, skipped: 1, total: 3 });
  const f = await readSuno();
  const lib = f.clips.filter((c) => c.origin === "library");
  expect(lib.map((c) => c.songId).sort()).toEqual(["lib-0001", "lib-0002"]);
  const shape = lib.find((c) => c.songId === "lib-0001")!;
  expect(shape).toMatchObject({
    origin: "library",
    jobId: null,
    verdict: null,
    url: "https://suno.com/song/lib-0001",
    title: "The Shape of Leaving",
    model: "v6",
    prompt: { title: "The Shape of Leaving", style: "trip-hop, grunge, cello, male vocal", lyrics: "[Verse 1]\nYou left the kettle cold again" },
  });
  expect(shape.lane).toBeUndefined();
  expect(lib.find((c) => c.songId === "lib-0002")!.prompt).toEqual({ style: "roots dub, melodica, tape echo", lyrics: "[Instrumental]", exclude: "vocals" });
  // the queue-made clip with the shared song id is untouched, and not doubled
  expect(f.clips.filter((c) => c.songId === "fake-0001")).toHaveLength(1);
  expect(f.clips.find((c) => c.songId === "fake-0001")!.origin).toBe("queue");

  const second = await importLibrary();
  expect(second).toEqual({ added: 0, skipped: 3, total: 3 });
  expect((await readSuno()).clips).toHaveLength(f.clips.length);
  expect(FAKE_SUNO.libraryReads).toBe(2);
});

/** fetch, routed to the REAL handlers: the audio adapter reads and writes the
 *  temp store through the routes it uses in the browser. The Sound lab's three
 *  reads answer empty - this probe is about the Suno half. */
function routeFetchToHandlers() {
  const real = globalThis.fetch;
  const writes: { method: string; path: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
    if (method !== "GET") writes.push({ method, path: url.pathname, body });
    if (url.pathname === "/api/sound/takes") return Response.json({ takes: [] });
    if (url.pathname === "/api/sound/hunts") return Response.json({ hunts: [] });
    if (url.pathname === "/api/sound/groups") return Response.json({ groups: { music: ["ambient", "electronic"], sfx: [] } });
    if (url.pathname === "/api/sound/suno" && method === "GET") return sunoGET(rq(url.pathname));
    if (url.pathname === "/api/sound/suno/library" && method === "POST") return libraryPOST(rq(url.pathname, "POST", body));
    if (url.pathname === "/api/sound/suno/clear" && method === "POST") return clearPOST(rq(url.pathname, "POST", body));
    const clip = /^\/api\/sound\/suno\/clips\/([^/]+)$/.exec(url.pathname);
    if (clip && method === "PATCH") return clipPATCH(rq(url.pathname, "PATCH", body), ctx(decodeURIComponent(clip[1])));
    return Response.json({ error: `unrouted in the probe: ${method} ${url.pathname}` }, { status: 404 });
  }) as typeof fetch;
  return { writes, restore: () => void (globalThis.fetch = real) };
}

test("library clips through the audio adapter: ungrouped in triage under every axis, a lane move persists, keep and drop", async () => {
  const net = routeFetchToHandlers();
  try {
    const src = makeAudioSource();
    await src.loadPipeline();

    // the import is a triage cell verb, free (no `spends`), and announces its counts
    const cell = { axis: "group", lane: UNGROUPED_LANE, stage: "gate" as const, band: "triage" };
    // and no "Delete all" while the tile holds no clip
    expect(src.cellVerbs!(cell)).toEqual([{ id: "suno.import-library", label: "Import Suno library" }]);
    expect(src.cellVerbs!({ ...cell, band: "pending" })).toEqual([]);
    expect(await src.runVerb!("suno.import-library", cell)).toEqual({ ok: true, announce: "Suno library: added 3, skipped 0" });
    expect(await src.runVerb!("suno.import-library", cell)).toEqual({ ok: true, announce: "Suno library: added 0, skipped 3" });

    const entries = await src.loadPipeline();
    const lib = entries.filter((e) => e.item.id.startsWith("audio:suno:clip:"));
    expect(lib).toHaveLength(3);
    for (const e of lib) {
      expect(e.placement).toEqual({ stage: "gate", band: "triage", lane: UNGROUPED_LANE });
      for (const axis of src.groupAxes) expect(axis.of(e.item), `${e.item.title} under ${axis.id}`).toBe(UNGROUPED_LANE);
      expect(e.href).toMatch(/^https:\/\/suno\.com\/song\//);
    }
    const shape = lib.find((e) => e.item.title === "The Shape of Leaving")!;
    expect(shape.facts[0]).toEqual({ name: "model", value: "v6" });
    expect(shape.facts).toEqual(
      expect.arrayContaining([
        { name: "origin", value: "suno library" },
        { name: "style", value: "trip-hop, grunge, cello, male vocal" },
        { name: "lyrics", value: "written" },
      ]),
    );
    // the lyrics whole, line breaks kept, for the detail pane (the style is a fact)
    expect(shape.item.media.flatMap((m) => (m.kind === "text" ? [m.text] : []))).toEqual(["[Verse 1]\nYou left the kettle cold again"]);

    // a lane move under the row axis persists, and survives a fresh read
    const moved = await src.move({ itemId: shape.item.id, to: "gate", band: "triage", lane: "ambient", axis: "group" });
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.item.placement).toEqual({ stage: "gate", band: "triage", lane: "ambient" });
    expect(net.writes.at(-1)).toMatchObject({ method: "PATCH", body: { lane: { axis: "group", value: "ambient" } } });
    const clipId = shape.item.id.replace("audio:suno:clip:", "");
    expect((await readSuno()).clips.find((c) => c.id === clipId)!.lane).toEqual({ axis: "group", value: "ambient" });
    const fresh = makeAudioSource();
    const again = (await fresh.loadPipeline()).find((e) => e.item.id === shape.item.id)!;
    expect(again.placement.lane).toBe("ambient");
    // under another axis it is still ungrouped: the lane was written under the row axis
    expect(fresh.groupAxes.find((a) => a.id === "genre")!.of(again.item)).toBe(UNGROUPED_LANE);

    // a lane move under genre together with a keep: one PATCH, both written
    const kept = await fresh.move({ itemId: again.item.id, to: "gate", band: "pending", lane: "trip-hop", axis: "genre" });
    expect(kept.ok).toBe(true);
    expect(net.writes.at(-1)!.body).toEqual({ verdict: "keep", lane: { axis: "genre", value: "trip-hop" } });
    expect((await readSuno()).clips.find((c) => c.id === clipId)!).toMatchObject({ verdict: "keep", lane: { axis: "genre", value: "trip-hop" } });

    // keep / drop verbs on another library clip, the same as on a queue clip
    const other = lib.find((e) => e.item.id !== shape.item.id)!;
    const otherId = other.item.id.replace("audio:suno:clip:", "");
    expect(fresh.cardVerbs!(other.item.id).map((v) => v.id)).toEqual(["suno.keep", "suno.drop", "suno.delete"]);
    expect((await fresh.runVerb!("suno.keep", { axis: "group", itemId: other.item.id })).ok).toBe(true);
    expect((await readSuno()).clips.find((c) => c.id === otherId)!.verdict).toBe("keep");
    expect((await fresh.runVerb!("suno.drop", { axis: "group", itemId: other.item.id })).ok).toBe(true);
    const last = await fresh.loadPipeline();
    expect(last.map((e) => e.item.id)).not.toContain(other.item.id);
    expect(fresh.lastLoad().hidden).toEqual([{ stage: "gate", count: 1, why: "Suno clips dropped" }]);
    // kept, and under the row axis back in ungrouped: its lane now belongs to genre
    expect(last.find((e) => e.item.id === shape.item.id)!.placement).toEqual({ stage: "gate", band: "pending", lane: UNGROUPED_LANE });

    // delete removes the record, never the song: the next import brings it back
    expect(await fresh.runVerb!("suno.delete", { axis: "group", itemId: shape.item.id })).toMatchObject({ ok: true });
    expect((await readSuno()).clips.map((c) => c.id)).not.toContain(shape.item.id.replace("audio:suno:clip:", ""));
    expect(await fresh.runVerb!("suno.import-library", cell)).toEqual({ ok: true, announce: "Suno library: added 1, skipped 2" });
  } finally {
    net.restore();
  }
});
