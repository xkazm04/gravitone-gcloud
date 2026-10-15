// THE AUDIO DECISION ADAPTER (lib/decision/v1/sources/audio.ts): the pure
// halves over literal takes, then the apply through the REAL kernel over a temp
// sound store - the verdicts reach takes.json and the ledger rows syncVerdict
// writes, in ONE store transaction; a second delivery writes nothing; a take
// the Sound lab judged differently since is refused, never overwritten.
//
// The ledger is pipeline/sound/ledger.json by default - a git-tracked file
// another session owns. Every write here goes to SOUND_LEDGER_PATH in a temp
// dir, set before anything imports the store, and the last case proves the
// tracked file's bytes did not move.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-audio-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  return dir;
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { audioAdapter, parsePile, type AudioV1 } from "../../lib/decision/v1/sources/audio.ts";
import type { SoundTake } from "../../lib/sound/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const SOUND = path.join(ROOT, "sound");
const LEDGER = path.join(ROOT, "ledger.json");
const blobDir = path.join(ROOT, "blobs");
const TRACKED = path.resolve("pipeline/sound/ledger.json");
const trackedBefore = existsSync(TRACKED) ? createHash("sha256").update(readFileSync(TRACKED)).digest("hex") : null;

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const T0 = "2026-10-15T09:00:00.000Z";
const take = (id: string, over: Partial<SoundTake> = {}): SoundTake => ({
  id,
  kind: "music",
  title: `Take ${id}`,
  provider: "elevenlabs",
  op: "compose",
  origin: "lab",
  technique: ["single-sentence"],
  prompt: `a prompt for ${id}`,
  negative: null,
  terms: { genre: ["ambient"], mood: [], instrument: [], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 30,
  loop: null,
  file: { path: `files/${id}.wav`, mime: "audio/wav", bytes: 4 },
  peaks: [0.2, 0.8],
  measured: null,
  ratings: {},
  verdict: "unjudged",
  reasons: [],
  note: null,
  stage: null,
  group: null,
  label: null,
  parentId: null,
  huntId: null,
  nodeId: null,
  songId: null,
  plan: null,
  referenceTrackId: null,
  promptRound: null,
  draftId: null,
  variation: null,
  editModes: null,
  fileName: null,
  projectId: null,
  cueId: null,
  createdAt: T0,
  judgedAt: null,
  finalizedAt: null,
  ...over,
});

const TAKES: SoundTake[] = [
  take("st-a"),
  take("st-b", { kind: "sfx", createdAt: "2026-10-15T09:01:00.000Z" }),
  // A version only: syncVerdict writes it no ledger row (lib/sound/ledger.ts isVersionOnly).
  take("st-c", { origin: "suno-return", provider: "suno", parentId: "st-old", createdAt: "2026-10-15T09:02:00.000Z" }),
  take("st-fix", { origin: "fixture" }),
  take("st-nofile", { file: null }),
  take("st-done", { verdict: "kept", stage: "pending", judgedAt: T0 }),
  take("st-late", { createdAt: "2026-10-15T11:00:00.000Z" }),
];
const CUTOFF = Date.parse("2026-10-15T09:02:00.000Z");
const RUN = `audio/triage/${CUTOFF}`;

function seed(takes: readonly SoundTake[] = TAKES): void {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(path.join(SOUND, "files"), { recursive: true });
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes }));
  for (const t of takes) if (t.file !== null && t.id !== "st-gone") writeFileSync(path.join(SOUND, t.file.path), `RIFF${t.id}`);
  writeFileSync(LEDGER, JSON.stringify({ verdicts: [], lessons: [] }));
}
const takesOnDisk = (): SoundTake[] => (JSON.parse(readFileSync(path.join(SOUND, "takes.json"), "utf8")) as { takes: SoundTake[] }).takes;
const ledgerOnDisk = (): { verdicts: { takeId: string; verdict: string; reasons: string[] }[] } => JSON.parse(readFileSync(LEDGER, "utf8")) as { verdicts: { takeId: string; verdict: string; reasons: string[] }[] };

describe("the pile and its generation", () => {
  it("a pile is its base or base/<cutoff ms>, nothing else", () => {
    expect(must(parsePile("audio/triage", "audio/triage"))).toEqual({ base: "audio/triage", cutoff: undefined });
    expect(must(parsePile("audio/triage", RUN))).toEqual({ base: "audio/triage", cutoff: CUTOFF });
    expect(parsePile("audio/triage", "audio/triage/latest").ok).toBe(false);
    expect(parsePile("audio/triage", "suno/triage/1").ok).toBe(false);
  });

  it("the bare pile reads at the newest pending take; a named cutoff leaves later takes for the next generation", async () => {
    seed();
    const now = must(await audioAdapter.read({ runId: "audio/triage" }));
    expect(now.runId).toBe(`audio/triage/${Date.parse("2026-10-15T11:00:00.000Z")}`);
    const at = must(await audioAdapter.read({ runId: RUN }));
    const plan = must(audioAdapter.packet(at));
    expect(plan.packet.id).toBe(`pkt:audio:${RUN}`);
    expect(plan.packet.items.map((c) => c.id)).toEqual(["st-a", "st-b", "st-c"]);
  });
});

describe("packet (pure)", () => {
  it("judges v1's queue - unjudged, never a fixture - by kind, and names every take it could not carry", async () => {
    seed();
    const plan = must(audioAdapter.packet(must(await audioAdapter.read({ runId: RUN }))));
    expect(plan.packet).toMatchObject({ source: "audio", lane: "audio", mode: "matrix-cull", state: "open", runId: RUN });
    expect(plan.packet.items.map((c) => [c.id, c.row])).toEqual([["st-a", "music"], ["st-b", "sfx"], ["st-c", "music"]]);
    expect(plan.packet.items[0]?.media.sha256).toBe(createHash("sha256").update("RIFFst-a").digest("hex"));
    expect(plan.initial).toEqual([]);
    expect(plan.losses).toEqual([{ candidate: "st-nofile", grade: "dropped", reason: "the take has no file to listen to; it stays unjudged in the Sound lab" }]);
    expect(plan.present.rows.map((r) => r.id)).toEqual(["music", "sfx"]);
    expect(plan.present.items["st-a"]).toMatchObject({ label: "Take st-a", prompt: "a prompt for st-a", peaks: [0.2, 0.8], music: true });
    expect(plan.urls["st-b"]).toBe("/api/sound/takes/st-b/file");
  });

  it("an empty pile is not a packet", () => {
    const v1: AudioV1 = { runId: RUN, cutoff: CUTOFF, takes: [take("st-x", { verdict: "rejected" })], media: new Map(), ledger: "ledger.json" };
    const r = audioAdapter.packet(v1);
    expect(r.ok ? "ok" : r.error.code).toBe("not-found");
  });
});

describe("consequence", () => {
  it("names the takes.json rows, the ledger rows syncVerdict will write, and the takes Arrangement gains", async () => {
    seed();
    const flow = await openFlow(audioAdapter, RUN, blobDir);
    flow.patch([
      { candidate: "st-a", verdict: "keep" },
      { candidate: "st-b", verdict: "reject", reasons: ["loop-seam", "wrong-event"], note: "clicks at the seam" },
      { candidate: "st-c", verdict: "keep" },
    ]);
    const c = must(flow.preview()).consequence;
    expect(c.counts).toEqual({ kept: 2, rejected: 1, undecided: 0 });
    const ledger = `${flow.v1.ledger} verdicts`;
    expect(flow.v1.ledger).toBe(LEDGER);
    expect(c.writes.map((w) => w.target)).toEqual(["takes.json st-a", `${ledger} st-a`, "takes.json st-b", `${ledger} st-b`, "takes.json st-c"]);
    expect(c.writes[2]?.detail).toBe("rejected: loop-seam, wrong-event");
    expect(c.promotions.map((p) => p.candidate)).toEqual(["st-a", "st-c"]);
    expect(c.deletes).toEqual([]);
  });

  it("the token moves when v1 moves under unchanged decisions, and a take judged in the lab since is refused", async () => {
    seed();
    const flow = await openFlow(audioAdapter, RUN, blobDir);
    flow.patch([{ candidate: "st-a", verdict: "keep" }]);
    const before = must(flow.preview()).consequence.token;
    const moved = { ...flow.v1, takes: flow.v1.takes.map((t) => (t.id === "st-b" ? { ...t, note: "touched" } : t)) };
    // st-b is undecided here, so its note does not bear on the plan: same token.
    expect(must(flow.preview(moved)).consequence.token).toBe(before);
    const judged = { ...flow.v1, takes: flow.v1.takes.map((t) => (t.id === "st-a" ? { ...t, verdict: "rejected" as const, judgedAt: T0 } : t)) };
    const r = flow.preview(judged);
    expect(r.ok ? "ok" : r.error.code).toBe("conflict");
    const same = { ...flow.v1, takes: flow.v1.takes.map((t) => (t.id === "st-a" ? { ...t, verdict: "kept" as const, judgedAt: T0 } : t)) };
    expect(must(flow.preview(same)).consequence.token).not.toBe(before);
  });
});

describe("apply through the kernel", () => {
  async function committed() {
    seed();
    const flow = await openFlow(audioAdapter, RUN, blobDir);
    flow.patch([
      { candidate: "st-a", verdict: "keep" },
      { candidate: "st-b", verdict: "reject", reasons: ["loop-seam"], note: "clicks" },
      { candidate: "st-c", verdict: "keep" },
    ]);
    must(flow.commit());
    return flow;
  }

  it("writes Judge's two patches, the ledger rows in the same transaction, and nothing on a second delivery", async () => {
    const flow = await committed();
    const claim = flow.claim();
    must(await audioAdapter.apply(claim));
    const byId = new Map(takesOnDisk().map((t) => [t.id, t]));
    expect(byId.get("st-a")).toMatchObject({ verdict: "kept", stage: "pending", reasons: [], note: null, judgedAt: claim.outcome.act === "commit" ? claim.outcome.result.at : "" });
    expect(byId.get("st-b")).toMatchObject({ verdict: "rejected", stage: null, reasons: ["loop-seam"], note: "clicks" });
    expect(byId.get("st-late")?.verdict).toBe("unjudged");
    expect(ledgerOnDisk().verdicts.map((v) => [v.takeId, v.verdict, v.reasons])).toEqual([
      ["st-a", "kept", []],
      ["st-b", "rejected", ["loop-seam"]],
    ]);
    const takes = readFileSync(path.join(SOUND, "takes.json"), "utf8");
    const ledger = readFileSync(LEDGER, "utf8");
    must(await audioAdapter.apply(claim));
    expect(readFileSync(path.join(SOUND, "takes.json"), "utf8")).toBe(takes);
    expect(readFileSync(LEDGER, "utf8")).toBe(ledger);
  });

  it("the kernel's applier records it applied", async () => {
    const flow = await committed();
    expect((await flow.deliver())?.result).toBe("applied");
  });

  it("a take the lab judged differently since is refused, and nothing of the packet is written", async () => {
    const flow = await committed();
    const claim = flow.claim();
    const disk = takesOnDisk().map((t) => (t.id === "st-c" ? { ...t, verdict: "rejected" as const, judgedAt: T0 } : t));
    writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes: disk }));
    const r = await audioAdapter.apply(claim);
    expect(r.ok ? "ok" : r.error.code).toBe("refused");
    expect(r.ok ? "" : r.error.message).toMatch(/st-c is rejected in the Sound lab/);
    // One transaction: st-a and st-b, judged before st-c in the loop, did not land either.
    expect(takesOnDisk().find((t) => t.id === "st-a")?.verdict).toBe("unjudged");
    expect(ledgerOnDisk().verdicts).toEqual([]);
  });

  it("a take gone from the store fails the whole apply as not-found", async () => {
    const flow = await committed();
    const claim = flow.claim();
    writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes: takesOnDisk().filter((t) => t.id !== "st-b") }));
    const r = await audioAdapter.apply(claim);
    expect(r.ok ? "ok" : r.error.code).toBe("not-found");
    expect(takesOnDisk().find((t) => t.id === "st-a")?.verdict).toBe("unjudged");
  });

  it("never touched the tracked ledger", () => {
    const after = existsSync(TRACKED) ? createHash("sha256").update(readFileSync(TRACKED)).digest("hex") : null;
    expect(after).toBe(trackedBefore);
  });
});
