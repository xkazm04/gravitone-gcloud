// LANE — THE SUNO QUEUE (lib/sound/suno, app/api/sound/suno/*), offline,
// against the FAKE driver and a temp store.
//
// SUNO_DRIVER=fake selects lib/sound/suno/fakeDriver.ts: no browser, no
// network, no vendor, no credits. SOUND_STORE_DIR points at a fresh temp dir
// per test, and the worker singleton is reset as a fresh process would find
// it. What is pinned, through the REAL route handlers where a route exists:
//
//   · FIFO: jobs run in the order they were queued, one at a time;
//   · every job renders on BOTH models, 2 clips each = 4 clips, verdict null;
//   · crash-resume: an `active` job found on start goes back to `queued`, and
//     a model that already landed clips is not created again;
//   · a failure fails ITS job with the driver's sentence verbatim, the
//     proposal wears it and is a candidate again, and the queue goes on;
//   · cancel: a queued job only - an active one is a 409;
//   · a driver that is not ok PAUSES the queue without failing a job, and the
//     next kick after it recovers drains it;
//   · a hunt leaf becomes ONE proposal however often it is queued;
//   · the propose turn's answer is held to Suno's form limits (no model call:
//     the reason function is injected).

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";
import { FAKE_SUNO, resetFakeSuno } from "@/lib/sound/suno/fakeDriver";
import { proposeSuno } from "@/lib/sound/suno/propose";
import { __resetSunoWorker, kickSunoWorker, sunoWorkerPaused } from "@/lib/sound/suno/queue";
import { readSuno, STYLE_MAX, type SunoFile } from "@/lib/sound/suno/store";
import type { Hunt, HuntNode } from "@/lib/sound/types";
import type { SunoJob, SunoProposal, SunoSnapshot } from "@/lib/suno/types";
import type { TextRequest, TextResult } from "@/lib/text/types";
import { GET as sunoGET } from "@/app/api/sound/suno/route";
import { POST as proposalsPOST } from "@/app/api/sound/suno/proposals/route";
import { DELETE as proposalDELETE } from "@/app/api/sound/suno/proposals/[id]/route";
import { POST as queuePOST } from "@/app/api/sound/suno/queue/route";
import { DELETE as queueDELETE } from "@/app/api/sound/suno/queue/[id]/route";
import { PATCH as clipPATCH } from "@/app/api/sound/suno/clips/[id]/route";

import { keepEnv } from "./_helpers";

const SECRET = "suno-probe-secret";
keepEnv(["SOUND_STORE_DIR", "SUNO_DRIVER", "NEXT_PUBLIC_DEV_AUTH", ACCESS_SECRET_VAR]);

let root = "";

test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "suno-probe-"));
  process.env.SOUND_STORE_DIR = path.join(root, "store");
  process.env.SUNO_DRIVER = "fake";
  delete process.env.NEXT_PUBLIC_DEV_AUTH;
  process.env[ACCESS_SECRET_VAR] = SECRET;
  __resetRateLimit();
  __resetSunoWorker();
  resetFakeSuno();
});

test.afterEach(async () => {
  FAKE_SUNO.health = { ok: true };
  await kickSunoWorker(); // never leave a loop writing into a removed dir
  __resetSunoWorker();
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
  await kickSunoWorker();

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
  expect(Object.keys(disk).sort()).toEqual(["clips", "jobs", "proposals", "version"]);
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
  const running = kickSunoWorker();
  let seen: SunoJob | undefined;
  for (let i = 0; i < 200 && seen?.phase !== "creating"; i++) {
    await new Promise((r) => setTimeout(r, 5));
    seen = (await readSuno()).jobs[0];
  }
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

test("crash-resume: an active job goes back to queued on start, and only the missing model is created", async () => {
  const now = Date.now();
  const proposal: SunoProposal = { id: "sp-0000000001", fields: { style: "drill, 808 slides" }, lane: { axis: "group", value: "hip hop" }, origin: "custom", createdAt: now - 10_000 };
  writeStore({
    version: 1,
    proposals: [proposal],
    jobs: [
      { id: "sj-0000000001", proposalId: proposal.id, fields: proposal.fields, lane: proposal.lane, state: "active", phase: "rendering", model: "v6-wild", models: ["v6", "v6-wild"], enqueuedAt: now - 9000, startedAt: now - 8000, clipIds: ["sc-0000000001", "sc-0000000002"] },
    ],
    clips: ["sc-0000000001", "sc-0000000002"].map((id, i) => ({ id, jobId: "sj-0000000001", model: "v6" as const, songId: `old-${i}`, url: `https://suno.com/song/old-${i}`, audioUrl: null, imageUrl: null, title: "old", durationS: null, createdAt: now - 7000, verdict: null })),
  });
  await kickSunoWorker();
  expect(FAKE_SUNO.calls).toEqual([{ style: "drill, 808 slides", model: "v6-wild" }]);
  const f = await readSuno();
  expect(f.jobs[0].state).toBe("done");
  expect(f.jobs[0].clipIds).toHaveLength(4);
  expect(f.clips.map((c) => c.model).sort()).toEqual(["v6", "v6", "v6-wild", "v6-wild"]);
});

test("a failure fails its job verbatim, the proposal wears it and is a candidate again, and the queue goes on", async () => {
  const a = await propose("trap, dark", "A");
  const b = await propose("bossa nova, nylon guitar", "B");
  FAKE_SUNO.failWith = (fields, model) => (fields.style.startsWith("trap") && model === "v6-wild" ? "Suno refused the style: 'trap, dark' (moderation)" : null);
  await enqueue([a.id, b.id]);
  await kickSunoWorker();
  const f = await readSuno();
  const [ja, jb] = f.jobs;
  expect(ja).toMatchObject({ state: "failed", error: "Suno refused the style: 'trap, dark' (moderation)" });
  expect(ja.clipIds).toHaveLength(2); // the model that landed keeps its clips
  expect(jb.state).toBe("done");
  expect(f.proposals.find((p) => p.id === a.id)!.error).toBe("Suno refused the style: 'trap, dark' (moderation)");
  // a failed proposal can be queued again; the next success clears its error
  FAKE_SUNO.failWith = () => null;
  await enqueue([a.id]);
  await kickSunoWorker();
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
  await kickSunoWorker();
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

test("a driver that is not ok pauses the queue without failing a job; the next kick after it recovers drains it", async () => {
  FAKE_SUNO.health = { ok: false, reason: "Suno is signed out in the dedicated profile" };
  const a = await propose("synthwave, gated drums");
  await enqueue([a.id]);
  await kickSunoWorker();
  expect((await readSuno()).jobs[0].state).toBe("queued");
  expect(sunoWorkerPaused()).toBe("Suno is signed out in the dedicated profile");
  const snap = await read<SunoSnapshot>(await sunoGET(rq("/api/sound/suno")));
  expect(snap.driver).toEqual({ ok: false, reason: "Suno is signed out in the dedicated profile" });
  await kickSunoWorker();
  expect(FAKE_SUNO.calls).toHaveLength(0);

  FAKE_SUNO.health = { ok: true };
  // a snapshot read is a kick
  await sunoGET(rq("/api/sound/suno"));
  await kickSunoWorker();
  expect((await readSuno()).jobs[0].state).toBe("done");
  expect(sunoWorkerPaused()).toBeNull();
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
