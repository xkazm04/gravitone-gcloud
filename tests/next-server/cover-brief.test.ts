// A COVER'S BRIEF, END TO END (cover brief WP-A) over a temp sound store and a temp kernel: the launch's receipt and
// confirm, and the job driven through a FAKE interpreter (spawn stubbed: it writes a measurement), a FAKE text router
// (one canned read per call, counted) and a FAKE seat (it writes out/brief.json, counted) - five steps booked, the
// brief applied and the cover launched with its own job; a drive stopped after listen-2 resumed at listen-3; a writer's
// answer the door refuses failing the job with the door's sentence; a cover that left draft keeping its fields; a dry
// job calling neither the router nor the seat. No librosa, no Gemini, no seat: the global fetch throws.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-cover-brief-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["EXTRACT_STORE_DIR"] = path.join(dir, "extract");
  delete process.env["GRAVITONE_DRY_ONLY"];
  return dir;
});

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { queryEvents } from "@gt/kernel/events-query";
import { get } from "@gt/kernel/job";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import type { Store } from "@gt/kernel/store";
import { COVER_BRIEF_REQUEST } from "@gt/producers/cover-brief/define";

import type { AgentResult, RunAgentInput } from "../../lib/agent/cliSeam.ts";
import { driveCoverBrief, launchCoverBrief } from "../../lib/producers/coverBrief.ts";
import type { CoverBriefEngines } from "../../lib/producers/coverBriefActs.ts";
import { producers } from "../../lib/producers/registry.ts";
import type { Spawn } from "../../lib/sound/cover/brief/measure.ts";
import { coverFileAbs, createCover, mutateCover, readCover } from "../../lib/sound/cover/store.ts";
import type { TextRequest, TextResult } from "../../lib/text/types.ts";

const LOC = path.join(ROOT, "kernel.sqlite");
const OP = { kind: "operator" as const, id: "op" };
const MEASURE = { file: "source.mp3", duration_s: 200, tempo: { bpm: 100.2 }, key: { key: "B minor", strength: 0.4 }, sections: [{ start: 0, end: 60 }, { start: 60, end: 200 }], rolloff_hz: 4400 };
const READ = { genres: ["lo-fi hip hop", "chillhop"], mood: ["melancholic"], instruments: [{ name: "acoustic guitar", role: "carries the melody" }], drums: "sampled boom-bap kit", bass: "808 sub bass", voice: { present: false, words: "none" }, production: ["vinyl crackle"], energyArc: "flat, a lift at 60 s" };
const BRIEF = { style: "Lofi Hip Hop, instrumental, melancholic, acoustic guitar, vinyl crackle, boom-bap drums, 808 sub bass, dark top end, 100 BPM, B minor", sourceStyle: "A melancholic lo-fi hip hop instrumental: acoustic guitar over a boom-bap kit and an 808 sub bass.", section: { startS: 0, endS: 200 }, lyrics: "", why: "Three reads of three named lo-fi hip hop; the song fits whole.", agreed: 3 };

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    throw new Error(`unexpected fetch ${String(input)}`);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  closeProcessKernel();
});
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

function store(): Store {
  const k = processKernel(LOC);
  if (!k.ok) throw k.error;
  return k.value.store;
}

/** An interpreter that measures from memory: it writes MEASURE where analyze.py would. */
function fakeSpawn() {
  const calls: (readonly string[])[] = [];
  const spawn: Spawn = async (_bin, args) => {
    calls.push(args);
    writeFileSync(args[3] ?? "", JSON.stringify(MEASURE));
    return { code: 0, stderr: "" };
  };
  return { spawn, calls };
}

/** A router that answers every listen with READ; `onCall` sees the call's 1-based count. */
function fakeRouter(o: { readonly onCall?: (n: number) => void } = {}) {
  const calls: TextRequest[] = [];
  const reason = async (req: TextRequest): Promise<TextResult> => {
    calls.push(req);
    o.onCall?.(calls.length);
    return { text: JSON.stringify(READ), json: READ, provenance: { provider: "google", model: "gemini-3.8-flash", transport: "http", rung: "cloud", turn: req.turn, schemaEnforcement: "native", durationMs: 5, inputTokens: 6800, outputTokens: 900 } } as unknown as TextResult;
  };
  return { reason, calls };
}

/** A seat that writes `answer` as out/brief.json; `during` runs while the turn is out. */
function fakeSeat(answer: unknown = BRIEF, during?: () => Promise<void>) {
  const calls: RunAgentInput[] = [];
  const seat = async (input: RunAgentInput): Promise<AgentResult> => {
    calls.push(input);
    writeFileSync(path.join(input.cwd, "out", "brief.json"), JSON.stringify(answer));
    await during?.();
    return { outcome: "completed", final: "done", turns: 3, durationMs: 5, exitCode: 0, errors: [], costUsd: 0.4 };
  };
  return { seat, calls };
}

async function newCover(durationS = 200) {
  return createCover({ title: "Tears", rights: "own", source: { bytes: new Uint8Array([0x49, 0x44, 0x33, 4]), mime: "audio/mpeg", name: "tears.mp3", durationS } });
}

async function launched(id: string, dryOnly = false): Promise<string> {
  const s = store();
  const r = await launchCoverBrief(s, id, { actor: OP, dryOnly });
  if (!r.ok || r.value.kind !== "receipt") throw new Error(`no receipt: ${JSON.stringify(r)}`);
  const c = await launchCoverBrief(s, id, { actor: OP, dryOnly, token: r.value.receipt.token });
  if (!c.ok || c.value.kind !== "launched") throw new Error(`not launched: ${JSON.stringify(c)}`);
  return c.value.jobId;
}

const fast = { backoffMs: () => 0 };
const engines = (o: Partial<CoverBriefEngines & { dryOnly: boolean }> = {}): CoverBriefEngines & { dryOnly: boolean } => ({ python: process.execPath, spawn: fakeSpawn().spawn, reason: fakeRouter().reason, seat: fakeSeat().seat, dryOnly: false, ...o });

describe("the brief launch", () => {
  it("a launch without a token answers a receipt - three priced listens, the write on the seat - and queues nothing", async () => {
    const c = await newCover();
    const s = store();
    const r = await launchCoverBrief(s, c.id, { actor: OP, dryOnly: false });
    expect(r.ok && r.value.kind).toBe("receipt");
    if (!r.ok || r.value.kind !== "receipt") return;
    const lines = r.value.receipt.lines;
    expect(lines.map((l) => [l.lane, l.provider])).toEqual([["seat.text", "local"], ["cloud.google", "google"], ["cloud.google", "google"], ["cloud.google", "google"], ["seat.text", "claude-seat"]]);
    expect(lines[0]?.usd).toBe(0);
    for (const l of lines.slice(1, 4)) expect(l.usd).toBeGreaterThan(0);
    expect(lines[4]?.usd).toBeNull();
    expect(get(s, `job:cover-brief:${c.id}` as never).ok).toBe(false);
    expect((await readCover(c.id))?.brief).toBeUndefined();
  });

  it("with the token: one seat.text job of the run cover:<id>, its request event, the brief queued; again answers existing", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    const s = store();
    expect(jobId).toBe(`job:cover-brief:${c.id}`);
    const j = get(s, jobId as never);
    expect(j.ok && [j.value.job.producer, j.value.job.lane, j.value.job.of, j.value.job.mode.kind]).toEqual(["cover-brief", "seat.text", { kind: "run", id: `cover:${c.id}` }, "live"]);
    const ev = queryEvents(s, { type: [COVER_BRIEF_REQUEST], subject: { kind: "job", id: jobId }, limit: 5 });
    expect(ev.ok && ev.value.events.length).toBe(1);
    expect(ev.ok && ev.value.events[0]?.data).toMatchObject({ coverId: c.id, durationS: 200, model: "gemini-3.8-flash", by: "op" });
    expect((await readCover(c.id))?.brief).toMatchObject({ state: "queued", jobId });
    const again = await launchCoverBrief(s, c.id, { actor: OP, dryOnly: false });
    expect(again.ok && again.value).toEqual({ kind: "existing", jobId });
  });

  it("refuses a cover that is not a draft or failed, and one that is not there", async () => {
    const c = await newCover();
    await mutateCover(c.id, (x) => ({ ...x, state: "judging" }));
    const r = await launchCoverBrief(store(), c.id, { actor: OP, dryOnly: false });
    expect(!r.ok && r.error.message).toBe(`cover ${c.id} is judging, not a draft or failed`);
    const none = await launchCoverBrief(store(), "cov-000000000000", { actor: OP, dryOnly: false });
    expect(!none.ok && none.error.message).toBe("no cover cov-000000000000");
  });
});

describe("the brief job", () => {
  it("a full drive books five steps, applies the brief, sets it done and leaves the cover queued with its own job", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    const sp = fakeSpawn();
    const router = fakeRouter();
    const seat = fakeSeat();
    const d = await driveCoverBrief(store(), LOC, jobId, { dryOnly: false, engines: engines({ spawn: sp.spawn, reason: router.reason, seat: seat.seat }), run: fast });
    expect(d.ok && d.value.outcome).toBe("done");
    expect(sp.calls).toHaveLength(1);
    expect(sp.calls[0]?.slice(0, 1)).toEqual(["-I"]);
    expect(sp.calls[0]?.[1]).toMatch(/analyze\.py$/);
    expect(sp.calls[0]?.[2]).toBe(coverFileAbs(c.id, "source.mp3"));
    expect(router.calls.map((r) => [r.turn, r.audio?.mimeType])).toEqual(Array.from({ length: 3 }, () => ["suno-listen", "audio/mp3"]));
    expect(router.calls[0]?.prompt).toContain("200 seconds");
    expect(seat.calls.map((x) => [x.turn, x.tools])).toEqual([["cover-brief", ["Read", "Write"]]]);
    for (const f of ["brief/measure.json", "brief/listen-1.json", "brief/listen-2.json", "brief/listen-3.json", "brief/brief.json"]) expect(existsSync(coverFileAbs(c.id, f))).toBe(true);
    expect(JSON.parse(readFileSync(coverFileAbs(c.id, "brief/listen-2.json"), "utf8"))).toMatchObject({ model: "gemini-3.8-flash", genres: READ.genres });
    const j = get(store(), jobId as never);
    expect(j.ok && j.value.job.progress.done).toBe(5);
    const rec = await readCover(c.id);
    expect([rec?.style, rec?.sourceStyle, rec?.section, rec?.lyrics]).toEqual([BRIEF.style, BRIEF.sourceStyle, BRIEF.section, ""]);
    expect(rec?.brief).toMatchObject({ state: "done", jobId, why: BRIEF.why, agreed: 3 });
    expect(rec?.brief?.error).toBeUndefined();
    expect([rec?.state, rec?.jobId]).toEqual(["queued", `job:cover:${c.id}`]);
    const cj = get(store(), `job:cover:${c.id}` as never);
    expect(cj.ok && [cj.value.job.producer, cj.value.job.mode.kind]).toEqual(["cover", "live"]);
  });

  it("a drive stopped after listen-2 resumes at listen-3 and buys only that read and the write", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    let stop = false;
    const first = fakeRouter({ onCall: (n) => (stop = n === 2) });
    const seat1 = fakeSeat();
    const d1 = await driveCoverBrief(store(), LOC, jobId, { dryOnly: false, engines: engines({ reason: first.reason, seat: seat1.seat }), run: { ...fast, deadlineMs: 1, now: () => (stop ? 2 : 0) } });
    expect(d1.ok && d1.value.outcome).toBe("yielded");
    expect(first.calls).toHaveLength(2);
    expect(seat1.calls).toHaveLength(0);
    expect((await readCover(c.id))?.brief?.state).toBe("running");
    const sp = fakeSpawn();
    const second = fakeRouter();
    const seat2 = fakeSeat();
    const d2 = await driveCoverBrief(store(), LOC, jobId, { dryOnly: false, engines: engines({ spawn: sp.spawn, reason: second.reason, seat: seat2.seat }), run: fast });
    expect(d2.ok && d2.value.outcome).toBe("done");
    expect([sp.calls.length, second.calls.length, seat2.calls.length]).toEqual([0, 1, 1]);
    expect((await readCover(c.id))?.brief?.state).toBe("done");
  });

  it("a writer's answer the door refuses fails the job with the door's sentence and changes no style", async () => {
    const c = await newCover(420);
    const jobId = await launched(c.id);
    const bad = { ...BRIEF, section: { startS: 0, endS: 400 } };
    const d = await driveCoverBrief(store(), LOC, jobId, { dryOnly: false, engines: engines({ seat: fakeSeat(bad).seat }), run: fast });
    expect(d.ok && d.value.outcome).toBe("failed");
    const why = "brief: section 0-400 s is longer than 360 s";
    const j = get(store(), jobId as never);
    expect(j.ok && j.value.job.error?.message).toContain(why);
    const rec = await readCover(c.id);
    expect(rec?.brief?.state).toBe("failed");
    expect(rec?.brief?.error).toContain(why);
    expect([rec?.state, rec?.style, rec?.sourceStyle, rec?.section]).toEqual(["draft", "", undefined, { startS: 0, endS: 360 }]);
  });

  it("a cover that left draft while the brief ran keeps its own fields, and the brief says why nothing launched", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    const meanwhile = () => mutateCover(c.id, (x) => ({ ...x, state: "queued", style: "the owner's own style", jobId: `job:cover:${c.id}` })).then(() => undefined);
    const d = await driveCoverBrief(store(), LOC, jobId, { dryOnly: false, engines: engines({ seat: fakeSeat(BRIEF, meanwhile).seat }), run: fast });
    expect(d.ok && d.value.outcome).toBe("done");
    const rec = await readCover(c.id);
    expect([rec?.state, rec?.style]).toEqual(["queued", "the owner's own style"]);
    expect(rec?.brief).toMatchObject({ state: "done", jobId, agreed: 3, error: `cover ${c.id} became queued while the brief ran: its own style and section were kept and nothing was launched` });
    expect(get(store(), `job:cover:${c.id}` as never).ok).toBe(false);
  });

  it("a dry brief calls neither the router nor the seat, applies nothing and launches nothing", async () => {
    const c = await newCover();
    const jobId = await launched(c.id, true);
    const router = fakeRouter();
    const seat = fakeSeat();
    const d = await driveCoverBrief(store(), LOC, jobId, { dryOnly: true, engines: engines({ reason: router.reason, seat: seat.seat, dryOnly: true }), run: fast });
    expect(d.ok && d.value.outcome).toBe("done");
    expect([router.calls.length, seat.calls.length]).toEqual([0, 0]);
    expect(JSON.parse(readFileSync(coverFileAbs(c.id, "brief/listen-1.json"), "utf8"))).toMatchObject({ model: "stand-in", standIn: true });
    const rec = await readCover(c.id);
    expect([rec?.state, rec?.style, rec?.brief?.state]).toEqual(["draft", "", "done"]);
    expect(rec?.brief?.error).toBe("a dry brief heard nothing: nothing was applied and the cover was not launched");
  });

  it("refuses a missing interpreter in words that name the env var", async () => {
    const c = await newCover();
    const jobId = await launched(c.id);
    const missing = path.join(ROOT, "no-venv", "python.exe");
    const d = await driveCoverBrief(store(), LOC, jobId, { dryOnly: false, engines: engines({ python: missing }), run: fast });
    expect(d.ok && d.value.outcome).toBe("failed");
    const rec = await readCover(c.id);
    expect(rec?.brief?.error).toBe(`the measuring interpreter ${missing} is not there: set TRACK_MIRROR_PYTHON to a Python that has librosa (pipeline/track-mirror/analyze.py)`);
  });

  it("the producer is registered on seat.text", () => {
    const set = producers();
    expect(set.ok && set.value.has("cover-brief@seat.text" as never)).toBe(true);
  });
});
