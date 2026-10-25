// THE HUNT'S DOORS OVER A REAL KERNEL AND SOUND STORE (Phase 6, L72 - L65's gaps). Pinned here:
//   · the render is a RUN: the receipt writes nothing; the confirm writes the Run row (producer
//     `hunt`, the leaves it confirmed) and its `job:run:` job in one transaction; the WORKER's
//     binding (lib/producers/registry.ts `producers()`) carries it - its first step books the
//     leaves, then a dry stand-in per leaf, no vendor asked, a re-drive files nothing twice;
//   · a render that fails is SETTLED: every leaf it left rendering carries the ending, none is
//     stranded `rendering` for the operator to re-buy;
//   · the lesson door refuses a draft the hunt moved past (both counts in the words) and writes
//     nothing; a re-confirm of the same op answers the lesson it wrote, once in the ledger, one
//     event; a hunt with no crown has no lesson to sign;
//   · a Suno leaf's file comes back onto its leaf (heard, error cleared, one event), a replay
//     files nothing twice, and an ElevenLabs leaf or a branch takes no file.
// Nothing here spends: every job is dry or a fake engine, and the tracked ledger is never read.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-audio-hunt-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { Receipt } from "@gt/domain/produce";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import type { Producer } from "@gt/kernel/job-core";
import { runJob } from "@gt/kernel/job-run";
import { openKernel } from "@gt/kernel/kernel";
import { loadRun } from "@gt/kernel/records/schema";
import { evidenceKey } from "@gt/ui/components/audio/lesson.ts";

import { fileLeafReturn } from "../../app/(studio)/audio/_hunt/leafReturn.ts";
import { producers } from "../../lib/producers/registry.ts";
import { crownLeaf } from "../../lib/sound/huntDesk.ts";
import { HUNT_LANE, huntJobId, huntProducer, huntRunId, launchHuntRender, type RenderLaunch } from "../../lib/sound/huntRender.ts";
import { stubReason } from "../../lib/sound/huntEngine.ts";
import { confirmLesson, draftLesson, handDraft } from "../../lib/sound/lessons.ts";
import type { GenerateRequest, Hunt, HuntNode, SoundTake } from "../../lib/sound/types.ts";

const SOUND = path.join(ROOT, "sound");
const LEDGER = path.join(ROOT, "ledger.json");
const NOW = new Date("2026-10-17T12:00:00.000Z");
const OP: Actor = { kind: "operator", id: "op-test" };

const k = openKernel(path.join(ROOT, "kernel.sqlite"));
if (!k.ok) throw k.error;
const store = k.value.store;
const fx = liveEffects(store, blobStore(path.join(ROOT, "blobs")));
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const node = (id: string, over: Partial<HuntNode> = {}): HuntNode => ({
  id,
  parentId: "br",
  axis: "tempo",
  label: `Leaf ${id}`,
  rationale: "",
  provider: "elevenlabs",
  technique: ["duration-and-tempo-locking"],
  prompt: `calm bed, ${id}`,
  negative: null,
  durationS: 30,
  loop: null,
  terms: { genre: ["ambient"], mood: ["calm"], instrument: [], sfxCategory: null },
  tempoBpm: 90,
  key: "D minor",
  state: "idea",
  takeIds: [],
  winner: false,
  error: null,
  ...over,
});

const hunt = (id: string, nodes: readonly HuntNode[]): Hunt => ({
  id,
  kind: "music",
  idea: `a calm bed for ${id}`,
  createdAt: "2026-10-17T09:00:00.000Z",
  nodes: [node("root", { parentId: null, axis: "idea", prompt: "" }), node("br", { parentId: "root", prompt: "" }), ...nodes],
  draftedBy: null,
  lessonId: null,
});

const take = (id: string, over: Partial<SoundTake> = {}): Partial<SoundTake> & { id: string } => ({ id, kind: "music", title: id, provider: "elevenlabs", op: "compose", origin: "hunt", prompt: id, verdict: "unjudged", ...over });

function seed(hunts: readonly Hunt[], takes: readonly object[] = []): void {
  mkdirSync(SOUND, { recursive: true });
  writeFileSync(path.join(SOUND, "hunts.json"), JSON.stringify({ version: 1, hunts }));
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes }));
  writeFileSync(LEDGER, JSON.stringify({ verdicts: [], lessons: [] }));
}
const disk = <T>(f: string): T => JSON.parse(readFileSync(f, "utf8")) as T;
const huntOnDisk = (id: string): Hunt | undefined => disk<{ hunts: Hunt[] }>(path.join(SOUND, "hunts.json")).hunts.find((h) => h.id === id);
const takesOnDisk = (): SoundTake[] => disk<{ takes: SoundTake[] }>(path.join(SOUND, "takes.json")).takes;
const lessonsOnDisk = (): { id: string }[] => disk<{ lessons: { id: string }[] }>(LEDGER).lessons;
const count = (sql: string, ...args: string[]): number => Number(must(store.read((r) => r.get(sql, ...args)))?.["c"] ?? 0);
const events = (type: string, subject: string): number => count("SELECT count(*) AS c FROM events WHERE type = ? AND subject_id = ?", type, subject);

async function confirmed(huntId: string, leafIds: readonly string[], opId: string): Promise<Extract<RenderLaunch, { kind: "launched" }>> {
  const ask = { huntId, leafIds, mode: "dry" as const, opId };
  const r = must(await launchHuntRender(store, ask, OP, NOW));
  if (r.kind !== "receipt") throw new Error(r.kind);
  const c = must(await launchHuntRender(store, { ...ask, token: r.receipt.token }, OP, NOW));
  if (c.kind !== "launched") throw new Error(c.kind);
  return c;
}

/** The producer the worker binds for a hunt job: the registry's own, by its `<name>@<lane>` key. */
function bound(): Producer {
  const p = must(producers()).get(`hunt@${HUNT_LANE}`);
  if (p === undefined) throw new Error("the worker binds no hunt producer");
  return p;
}

describe("a hunt's render is a Run the worker carries", () => {
  it("the receipt writes nothing; the confirm writes the Run row and its job in one transaction", async () => {
    seed([hunt("hn-run01", [node("a"), node("b", { durationS: 20 }), node("s", { provider: "suno" })])]);
    const before = count("SELECT count(*) AS c FROM runs");
    const r = must(await launchHuntRender(store, { huntId: "hn-run01", leafIds: ["a", "b"], mode: "dry", opId: "opr00001" }, OP, NOW));
    if (r.kind !== "receipt") throw new Error(r.kind);
    const receipt: Receipt = r.receipt;
    expect(receipt.lines.map((l) => l.label)).toEqual(["Leaf a · 30s", "Leaf b · 20s"]);
    expect(count("SELECT count(*) AS c FROM runs")).toBe(before);
    expect(count("SELECT count(*) AS c FROM jobs WHERE id = ?", huntJobId("hn-run01", "opr00001"))).toBe(0);
    const c = must(await launchHuntRender(store, { huntId: "hn-run01", leafIds: ["a", "b"], mode: "dry", opId: "opr00001", token: receipt.token }, OP, NOW));
    expect(c).toEqual({ kind: "launched", runId: "hunt.hn-run01.opr00001", jobId: "job:run:hunt.hn-run01.opr00001", leaves: ["a", "b"] });
    const { run, jobId } = must(store.read((t) => loadRun(t, huntRunId("hn-run01", "opr00001"))));
    expect(jobId).toBe("job:run:hunt.hn-run01.opr00001");
    expect(run).toMatchObject({ producer: "hunt", lane: "audio", recipe: "track/music", units: 2, input: { producer: "hunt", hunt: "hn-run01", kind: "music", leaves: ["a", "b"] } });
    // The Run is priced at the receipt's whole: every leaf's seconds on the per-second option.
    expect(run.estimate.seconds).toBeCloseTo(receipt.lines.reduce((a, l) => a + l.seconds, 0), 6);
    expect(huntOnDisk("hn-run01")?.nodes.filter((n) => n.state === "rendering").map((n) => n.id)).toEqual(["a", "b"]);
    // A replayed confirm adopts the job it wrote; a second render of the hunt waits for the first.
    expect(must(await launchHuntRender(store, { huntId: "hn-run01", leafIds: ["a", "b"], mode: "dry", opId: "opr00001", token: receipt.token }, OP, NOW)).kind).toBe("launched");
    expect(count("SELECT count(*) AS c FROM runs WHERE id = ?", "hunt.hn-run01.opr00001")).toBe(1);
  });

  it("the worker's binding renders it dry: the leaves booked first, a stand-in per leaf, no vendor, nothing twice", async () => {
    const jobId = huntJobId("hn-run01", "opr00001");
    const p = bound();
    const report = must(await runJob(fx, p, jobId, { dryOnly: true }));
    expect(report.outcome).toBe("done");
    expect(report.wouldCalls?.length).toBe(2);
    const filed = takesOnDisk().filter((t) => t.huntId === "hn-run01");
    expect(filed.map((t) => [t.nodeId, t.origin, t.verdict]).sort()).toEqual([
      ["a", "hunt", "unjudged"],
      ["b", "hunt", "unjudged"],
    ]);
    expect(huntOnDisk("hn-run01")?.nodes.filter((n) => n.state === "rendered").map((n) => n.id)).toEqual(["a", "b"]);
    const steps = must(store.read((r) => r.all("SELECT data FROM events WHERE type = 'job.step-started' AND subject_id = ? ORDER BY seq", jobId))).map((row) => (JSON.parse(String(row["data"])) as { step: string }).step);
    expect(steps).toEqual(["leaves", "leaf:a", "leaf:b"]);
    must(await runJob(fx, p, jobId, { dryOnly: true }));
    expect(takesOnDisk().filter((t) => t.huntId === "hn-run01")).toHaveLength(2);
  });

  it("a render that fails is settled: the leaves it left rendering carry its ending, none stranded", async () => {
    seed([hunt("hn-fail1", [node("a"), node("b")])]);
    const c = await confirmed("hn-fail1", ["a", "b"], "opf00001");
    // b leaves the map between the confirm and the drive: the job's first step cannot book it.
    const h = huntOnDisk("hn-fail1");
    if (h === undefined) throw new Error("no hunt");
    writeFileSync(path.join(SOUND, "hunts.json"), JSON.stringify({ version: 1, hunts: [{ ...h, nodes: h.nodes.filter((n) => n.id !== "b") }] }));
    const report = must(await runJob(fx, bound(), c.jobId, { dryOnly: true }));
    expect(report.outcome).toBe("failed");
    expect(report.job?.error?.message).toBe("leaf b is no longer on hunt hn-fail1");
    expect(huntOnDisk("hn-fail1")?.nodes.find((n) => n.id === "a")).toMatchObject({ state: "failed", error: `the render failed: ${c.jobId}` });
  });

  it("a live leaf the vendor refuses for money stops the render with what it bought, and settles the rest", async () => {
    seed([hunt("hn-live1", [node("a"), node("b")])]);
    const ask = { huntId: "hn-live1", leafIds: ["a", "b"], mode: "live" as const, opId: "opl00001" };
    const r = must(await launchHuntRender(store, ask, OP, NOW, {}));
    if (r.kind !== "receipt") throw new Error(r.kind);
    const c = must(await launchHuntRender(store, { ...ask, token: r.receipt.token }, OP, NOW, {}));
    if (c.kind !== "launched") throw new Error(c.kind);
    const asked: GenerateRequest[] = [];
    const { MusicError } = await import("../../lib/music/errors.ts");
    const generateTake = async (req: GenerateRequest): Promise<SoundTake> => {
      asked.push(req);
      throw new MusicError("over-budget", "the music budget for today is spent (40/40 audio-seconds)");
    };
    const report = must(await runJob(fx, huntProducer(HUNT_LANE, { generateTake }), c.jobId, { dryOnly: false }));
    expect(report.outcome).toBe("failed");
    expect(asked.map((q) => [q.nodeId, q.huntId, q.origin, q.durationS, q.tempoBpm, q.key])).toEqual([["a", "hn-live1", "hunt", 30, 90, "D minor"]]);
    const after = huntOnDisk("hn-live1")?.nodes.filter((n) => n.id === "a" || n.id === "b") ?? [];
    expect(after.map((n) => n.state)).toEqual(["failed", "failed"]);
    expect(after.every((n) => n.error !== null && n.error.includes(c.jobId))).toBe(true);
  });
});

/* ── the lesson door ────────────────────────────────────────────────────── */

const CLAIM = "When a bed sits under a narrator, lock the tempo at 90, because the free leaf drifted.";

function heardHunt(id: string, winners: readonly string[]): Hunt {
  return hunt(id, [node("a", { state: "rendered", takeIds: [`${id}-ta`], winner: winners.includes("a") }), node("b", { state: "rendered", takeIds: [`${id}-tb`], winner: winners.includes("b") })]);
}
const heardTakes = (id: string, winners: readonly string[]) => [
  take(`${id}-ta`, { huntId: id, nodeId: "a", verdict: winners.includes("a") ? "kept" : "unjudged" }),
  take(`${id}-tb`, { huntId: id, nodeId: "b", verdict: winners.includes("b") ? "kept" : "unjudged" }),
];

describe("the lesson door", () => {
  it("refuses a hunt with no crown: a lesson is what the winners did", async () => {
    seed([heardHunt("hn-les00", [])], heardTakes("hn-les00", []));
    const r = await handDraft("hn-les00");
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["refused", "no crown yet: a lesson is what the winners did"]);
  });

  it("a re-confirm of the same op answers the lesson it wrote: one ledger row, one event", async () => {
    seed([heardHunt("hn-les01", ["a"])], heardTakes("hn-les01", ["a"]));
    const d = must(await handDraft("hn-les01"));
    const ask = { ...d.proposal, claim: CLAIM, opId: "lsop0001", key: d.key };
    const first = must(await confirmLesson(store, ask, OP, NOW));
    expect(first).toMatchObject({ already: false, recorded: true, lesson: { id: "ls-lsop0001", huntId: "hn-les01", claim: CLAIM } });
    const again = must(await confirmLesson(store, ask, OP, new Date(NOW.getTime() + 60_000)));
    expect(again).toMatchObject({ already: true, recorded: false, lesson: { id: "ls-lsop0001", confirmedAt: NOW.toISOString() } });
    expect(lessonsOnDisk().map((l) => l.id)).toEqual(["ls-lsop0001"]);
    expect(events("lesson.confirmed", "ls-lsop0001")).toBe(1);
    expect(huntOnDisk("hn-les01")?.lessonId).toBe("ls-lsop0001");
  });

  it("refuses a draft the hunt moved past, with both counts, and writes nothing", async () => {
    seed([heardHunt("hn-les02", ["a"])], heardTakes("hn-les02", ["a"]));
    const d = must(await handDraft("hn-les02"));
    // A second crown lands (another tab) after the draft was counted.
    seed([heardHunt("hn-les02", ["a", "b"])], heardTakes("hn-les02", ["a", "b"]));
    const now = must(await handDraft("hn-les02"));
    expect(evidenceKey(now.proposal.evidence)).not.toBe(d.key);
    const r = await confirmLesson(store, { ...d.proposal, claim: CLAIM, opId: "lsop0002", key: d.key }, OP, NOW);
    expect(r.ok ? null : r.error.code).toBe("conflict");
    expect(r.ok ? "" : r.error.message).toBe(`the hunt moved since this draft: it was signed over n=2, ${d.proposal.evidence.takeIds.length} cited; it now stands on n=2, ${now.proposal.evidence.takeIds.length} cited - draft it again`);
    expect(lessonsOnDisk()).toEqual([]);
    expect(huntOnDisk("hn-les02")?.lessonId).toBeNull();
    expect(events("lesson.confirmed", "ls-lsop0002")).toBe(0);
  });
});

describe("the engine's lesson draft", () => {
  it("the engine writes the claim; its techniques are held to the kind's list and the evidence is the map's, not the model's", async () => {
    seed([heardHunt("hn-les03", ["a"])], [take("hn-les03-ta", { ...WHOLE, huntId: "hn-les03", nodeId: "a", verdict: "kept" }), take("hn-les03-tb", { ...WHOLE, huntId: "hn-les03", nodeId: "b", verdict: "rejected", reasons: ["section-bleed"] })]);
    const sent: string[] = [];
    const reason = async (req: Parameters<typeof stubReason>[0]) => {
      sent.push(req.prompt);
      const r = await stubReason(req);
      return { ...r, json: { claim: CLAIM, technique: ["duration-and-tempo-locking", "invented"], provider: "elevenlabs" } };
    };
    const d = must(await draftLesson("hn-les03", reason));
    expect(d).toMatchObject({ engineError: null, proposal: { claim: CLAIM, technique: ["duration-and-tempo-locking"], provider: "elevenlabs", source: "hunt", huntId: "hn-les03" } });
    expect(d.proposal.evidence).toEqual(must(await handDraft("hn-les03")).proposal.evidence);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("WINNER");
    expect(sent[0]).toContain("section-bleed");
    expect(lessonsOnDisk(), "a draft is never stored").toEqual([]);
  });
});

/* ── the crown ──────────────────────────────────────────────────────────── */

/** The fields a take carries for its ledger row (a judged take is written there). */
const WHOLE: Partial<SoundTake> = { technique: [], negative: null, terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null }, tempoBpm: null, key: null, durationS: 30, loop: null, file: null, peaks: null, measured: null, ratings: {}, reasons: [], note: null, stage: null, group: null, label: null, parentId: null, songId: null, plan: null, createdAt: "2026-10-17T09:00:00.000Z", judgedAt: null, finalizedAt: null };

describe("the crown door", () => {
  it("a crown keeps an unjudged take in the same write, once per op; a rejected take is never overruled", async () => {
    seed([heardHunt("hn-crn01", [])], [take("hn-crn01-ta", { ...WHOLE, huntId: "hn-crn01", nodeId: "a" }), take("hn-crn01-tb", { ...WHOLE, huntId: "hn-crn01", nodeId: "b", verdict: "rejected", reasons: ["section-bleed"] })]);
    const on = must(await crownLeaf(store, { huntId: "hn-crn01", nodeId: "a", takeId: "hn-crn01-ta", on: true, opId: "opcrn001" }, OP, NOW));
    expect(on).toMatchObject({ winner: true, kept: true, unkept: false, recorded: true });
    expect(takesOnDisk().find((t) => t.id === "hn-crn01-ta")).toMatchObject({ verdict: "kept", stage: "pending" });
    expect(huntOnDisk("hn-crn01")?.nodes.find((n) => n.id === "a")?.winner).toBe(true);
    const again = must(await crownLeaf(store, { huntId: "hn-crn01", nodeId: "a", takeId: "hn-crn01-ta", on: true, opId: "opcrn001" }, OP, NOW));
    expect(again).toMatchObject({ winner: true, kept: false, recorded: false });
    expect(events("hunt.crowned", "hn-crn01")).toBe(1);
    const no = await crownLeaf(store, { huntId: "hn-crn01", nodeId: "b", takeId: "hn-crn01-tb", on: true, opId: "opcrn002" }, OP, NOW);
    expect(no.ok ? null : no.error.code).toBe("refused");
    expect(takesOnDisk().find((t) => t.id === "hn-crn01-tb")?.verdict).toBe("rejected");
    expect(huntOnDisk("hn-crn01")?.nodes.find((n) => n.id === "b")?.winner).toBe(false);
  });

  it("an uncrown reaches back into the take only while it sits pending", async () => {
    const off = must(await crownLeaf(store, { huntId: "hn-crn01", nodeId: "a", takeId: "hn-crn01-ta", on: false, opId: "opcrn003" }, OP, NOW));
    expect(off).toMatchObject({ winner: false, kept: false, unkept: true, recorded: true });
    expect(takesOnDisk().find((t) => t.id === "hn-crn01-ta")).toMatchObject({ verdict: "unjudged", stage: null });
    expect(huntOnDisk("hn-crn01")?.nodes.find((n) => n.id === "a")?.winner).toBe(false);
    expect(events("hunt.uncrowned", "hn-crn01")).toBe(1);
  });
});

/* ── a Suno leaf's file, back ───────────────────────────────────────────── */

const WAV = { bytes: new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]), mime: "audio/wav", name: "suno-return.wav" };

describe("a Suno leaf takes its file back", () => {
  it("files the take on its leaf - heard, error cleared - with one event; a replay files nothing twice", async () => {
    seed([hunt("hn-ret01", [node("e"), node("s", { provider: "suno", state: "failed", error: "an old failure" })])]);
    const r = must(await fileLeafReturn(store, { huntId: "hn-ret01", nodeId: "s", opId: "opret001", file: WAV }, OP, NOW));
    expect(r).toMatchObject({ created: true, recorded: true, take: { id: "hr-opret001", provider: "suno", origin: "suno-return", huntId: "hn-ret01", nodeId: "s", tempoBpm: 90, key: "D minor" } });
    expect(huntOnDisk("hn-ret01")?.nodes.find((n) => n.id === "s")).toMatchObject({ state: "rendered", error: null, takeIds: ["hr-opret001"] });
    const again = must(await fileLeafReturn(store, { huntId: "hn-ret01", nodeId: "s", opId: "opret001", file: WAV }, OP, NOW));
    expect(again).toMatchObject({ created: false, recorded: false });
    expect(takesOnDisk().filter((t) => t.nodeId === "s")).toHaveLength(1);
    expect(huntOnDisk("hn-ret01")?.nodes.find((n) => n.id === "s")?.takeIds).toEqual(["hr-opret001"]);
    expect(events("hunt.returned", "hn-ret01")).toBe(1);
  });

  it("an ElevenLabs leaf, a branch and a replayed op on another leaf take no file", async () => {
    const el = await fileLeafReturn(store, { huntId: "hn-ret01", nodeId: "e", opId: "opret002", file: WAV }, OP, NOW);
    expect(el.ok ? null : [el.error.code, el.error.message]).toEqual(["refused", "Leaf e renders through the receipt; a file comes back only for a leaf sent to Suno by hand"]);
    const br = await fileLeafReturn(store, { huntId: "hn-ret01", nodeId: "br", opId: "opret003", file: WAV }, OP, NOW);
    expect(br.ok ? null : br.error.code).toBe("refused");
    expect(takesOnDisk().map((t) => t.id)).toEqual(["hr-opret001"]);
  });
});
