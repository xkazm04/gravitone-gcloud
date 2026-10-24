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
  // The adapter reads the ingest measures from the process kernel (brief vs measured): a temp one.
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  return dir;
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TRIAGE_VERSION, type Triage } from "@gt/domain/audio.triage";
import { putAudioMeasures } from "@gt/kernel/library/measures";
import { putTriage, triageDigest } from "@gt/kernel/library/triage";

import { audioAdapter, parsePile, type AudioV1 } from "../../lib/decision/v1/sources/audio.ts";
import { closeKernel, kernel } from "../../lib/kernelStore.ts";
import { triageContextOf } from "../../lib/sound/triageContext.ts";
import type { SoundTake } from "../../lib/sound/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const SOUND = path.join(ROOT, "sound");
const LEDGER = path.join(ROOT, "ledger.json");
const blobDir = path.join(ROOT, "blobs");
const TRACKED = path.resolve("pipeline/sound/ledger.json");
const trackedBefore = existsSync(TRACKED) ? createHash("sha256").update(readFileSync(TRACKED)).digest("hex") : null;

afterAll(() => {
  closeKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

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

  it("an agent's batch is heard first, then the lab, then returns and imports - oldest first within each", async () => {
    seed([
      take("lab-old", { createdAt: "2026-10-15T08:00:00.000Z" }),
      take("import", { origin: "import", createdAt: "2026-10-14T00:00:00.000Z" }),
      take("agent-new", { origin: "agent", createdAt: "2026-10-15T08:30:00.000Z" }),
      take("return", { origin: "suno-return", provider: "suno", createdAt: "2026-10-14T00:00:00.000Z" }),
      take("agent-old", { origin: "agent", createdAt: "2026-10-15T08:10:00.000Z" }),
    ]);
    const plan = must(audioAdapter.packet(must(await audioAdapter.read({ runId: "audio/triage" }))));
    expect(plan.packet.items.map((c) => c.id)).toEqual(["agent-old", "agent-new", "lab-old", "return", "import"]);
  });

  it("an empty pile is not a packet", () => {
    const v1: AudioV1 = { runId: RUN, cutoff: CUTOFF, takes: [take("st-x", { verdict: "rejected" })], media: new Map(), ledger: "ledger.json", measures: new Map() };
    const r = audioAdapter.packet(v1);
    expect(r.ok ? "ok" : r.error.code).toBe("not-found");
  });
});

describe("brief vs measured on the tile", () => {
  const measured = { tempoBpm: null, key: null, durationS: null, lufs: null, truePeakDb: null, energy: null };

  it("names what a take missed of its brief, from the take's own measure, and nothing when it held", async () => {
    seed([
      take("st-off", { tempoBpm: 120, key: "A minor", durationS: 30, measured: { ...measured, tempoBpm: 96, key: "a minor", durationS: 30.4 } }),
      take("st-half", { tempoBpm: 120, measured: { ...measured, tempoBpm: 60 }, createdAt: "2026-10-15T09:01:00.000Z" }),
      take("st-fx", { kind: "sfx", op: "sfx", durationS: 2, measured: { ...measured, durationS: 4.5 }, createdAt: "2026-10-15T09:02:00.000Z" }),
    ]);
    const plan = must(audioAdapter.packet(must(await audioAdapter.read({ runId: RUN }))));
    expect(plan.present.items["st-off"]?.meta).toBe("elevenlabs · compose · 30 s · tempo 120 bpm → 96 bpm −24 bpm");
    // A clean half is the tracker's octave, said, never a miss.
    expect(plan.present.items["st-half"]?.meta).toBe("elevenlabs · compose · 30 s · tempo 120 bpm → 60 bpm octave");
    expect(plan.present.items["st-fx"]?.meta).toBe("elevenlabs · sfx · 5 s · length 2s → 4.5s +2.5s");
    expect(plan.losses).toEqual([]);
  });

  it("the ingest measure of the tile's own bytes wins over what v1 measured on the take", async () => {
    seed([take("st-a", { tempoBpm: 120, measured: { ...measured, tempoBpm: 120 } })]);
    const sha = createHash("sha256").update("RIFFst-a").digest("hex");
    const k = kernel();
    if (!k.ok) throw k.error;
    must(putAudioMeasures(k.value.store, [{ sha, peaks: [0.1], energy: 0.1, durationS: 31, tempoBpm: 90, key: null, measuredAt: T0, error: null }]));
    const plan = must(audioAdapter.packet(must(await audioAdapter.read({ runId: RUN }))));
    expect(plan.present.items["st-a"]?.meta).toBe("elevenlabs · compose · 31 s · tempo 120 bpm → 90 bpm −30 bpm");
  });

  // The sidecar's triage of the same bytes (spark audio-triage WP3), keyed by the take's current brief.
  const flagged: Triage = {
    version: TRIAGE_VERSION,
    findings: [
      { check: "clipping", verdict: "flag", value: 12, threshold: 3, unit: "samples" },
      { check: "true-peak-over", verdict: "flag", value: 0.8, threshold: 0, unit: "dBTP" },
      { check: "dead-air", verdict: "pass", value: 0.4, threshold: 2, unit: "s" },
      { check: "loop-seam", defect: "loop-seam", verdict: "skip", value: null, threshold: null, unit: "dB" },
    ],
    flagged: 2,
  };
  const clean: Triage = { version: TRIAGE_VERSION, findings: [{ check: "clipping", verdict: "pass", value: 0, threshold: 3, unit: "samples" }], flagged: 0 };
  function triaged(t: SoundTake, triage: Triage): void {
    const k = kernel();
    if (!k.ok) throw k.error;
    const sha = createHash("sha256").update(`RIFF${t.id}`).digest("hex");
    must(putTriage(k.value.store, [{ sha, contextDigest: triageDigest(triageContextOf(t)), triage, at: T0 }]));
  }

  it("names what the triage flagged after the brief line; a take with nothing flagged reads as it did", async () => {
    const off = take("st-tri", { tempoBpm: 120, measured: { ...measured, tempoBpm: 96 } });
    const held = take("st-clean", { createdAt: "2026-10-15T09:01:00.000Z" });
    seed([off, held]);
    triaged(off, flagged);
    triaged(held, clean);
    const plan = must(audioAdapter.packet(must(await audioAdapter.read({ runId: RUN }))));
    expect(plan.present.items["st-tri"]?.meta).toBe("elevenlabs · compose · 30 s · tempo 120 bpm → 96 bpm −24 bpm · clipped run 12 · true peak +0.8 dBTP");
    expect(plan.present.items["st-clean"]?.meta).toBe("elevenlabs · compose · 30 s");
    // The pile's order is the judging queue's, triage or not.
    expect(plan.packet.items.map((c) => c.id)).toEqual(["st-tri", "st-clean"]);
  });

  it("a triage against a brief the take no longer carries is not shown", async () => {
    const before = take("st-rebrief", { durationS: 30 });
    triaged(before, flagged);
    seed([take("st-rebrief", { durationS: 45 })]);
    const plan = must(audioAdapter.packet(must(await audioAdapter.read({ runId: RUN }))));
    expect(plan.present.items["st-rebrief"]?.meta).toBe("elevenlabs · compose · 45 s");
  });

  it("a measure store that will not open is a disclosed loss, never a packet that will not open", async () => {
    seed([take("st-a")]);
    const v1 = must(await audioAdapter.read({ runId: RUN }));
    const plan = must(audioAdapter.packet({ ...v1, measureError: "database is locked" }));
    expect(plan.packet.items.map((c) => c.id)).toEqual(["st-a"]);
    expect(plan.losses).toEqual([{ grade: "approximate", reason: "brief vs measured reads the takes' own measures only: database is locked" }]);
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
