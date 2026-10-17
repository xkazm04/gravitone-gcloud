// THE MUSIC-VIDEO ACTS (lib/producers/mvActs.ts; owner ruling 2) - v1's Pipeline-canvas Regenerate
// and Send to Calendar as kernel acts. A temp sound store, a temp kernel and a temp exports root;
// nothing is driven, so no engine, no ffmpeg and no credits are reached.
//
// Pinned: a Regenerate read is a receipt and writes nothing, even while v1's column switch is on
// (v1's regenerateMv launched live there with no receipt); the confirm re-queues the record at the
// stamp the receipt priced and launches that one job, dry; a second confirm re-rolls nothing; a
// record re-queued since the read is a conflict. Send to Calendar copies the video into the exports
// and puts a kernel slot on `video:export:mv-<id>`; a video already held on the channel is refused
// BEFORE anything is copied; an unwired channel, an unfinished video and a title the platform
// would refuse are refused when the slot is made.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-mv-acts-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  process.env["GRAVITONE_STORE_PATH"] = path.join(dir, "kernel.sqlite");
  process.env["PUBLISH_EXPORTS_DIR"] = path.join(dir, "exports");
  process.env["PUBLISH_MODE"] = "dry";
  delete process.env["GRAVITONE_DRY_ONLY"];
  return dir;
});

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { closeProcessKernel } from "@gt/kernel/process";
import { listSlots } from "@gt/kernel/slots/read";

import { mvKernelId, mvKernelJobs } from "../../lib/producers/mv.ts";
import { mvExportId, regenerateMvAct, sendMvToCalendarAct } from "../../lib/producers/mvActs.ts";
import { OPERATOR, soundKernel } from "../../lib/producers/sound.ts";
import type { MvJob } from "../../lib/sound/mv/types.ts";

afterAll(() => {
  closeProcessKernel();
  rmSync(ROOT, { recursive: true, force: true });
});

const SOUND = path.join(ROOT, "sound");
const EXPORTS = path.join(ROOT, "exports");
const T = Date.parse("2026-10-15T09:00:00.000Z");
const files = (id: string): MvJob["files"] => ({ audio: `mv/${id}/audio.mp3`, still: `mv/${id}/still.png`, video: `mv/${id}/video.mp4`, envelope: `mv/${id}/envelope.json` });
const job = (id: string, over: Partial<MvJob> = {}): MvJob => ({
  id,
  source: { kind: "take", id: `st-${id}`, title: `03_${id} Instrumental` },
  state: "done",
  files: files(id),
  verdict: "keep",
  look: "siren-rain",
  metadata: { title: `Video ${id}`, description: "a night drive", tags: ["synthwave"], chapters: [] },
  treatment: { prompt: "p", motion: { particleDensity: 0.5, particleHue: 200, pulseStrength: 0.4 }, rationale: "why" },
  analysis: { durationS: 181.6, tempoBpm: [90], energyShape: [], sections: [] },
  enqueuedAt: T - 10_000,
  startedAt: T - 9_000,
  endedAt: T,
  ...over,
});

function seed(jobs: readonly MvJob[], running = false): void {
  rmSync(SOUND, { recursive: true, force: true });
  rmSync(EXPORTS, { recursive: true, force: true });
  for (const j of jobs) {
    mkdirSync(path.join(SOUND, "mv", j.id), { recursive: true });
    for (const rel of Object.values(j.files)) writeFileSync(path.join(SOUND, rel), `bytes of ${rel}`);
  }
  writeFileSync(path.join(SOUND, "mv.json"), JSON.stringify({ version: 1, queue: { running }, jobs, imports: [], progress: {} }));
}
const onDisk = (id: string): MvJob => (JSON.parse(readFileSync(path.join(SOUND, "mv.json"), "utf8")) as { jobs: MvJob[] }).jobs.find((j) => j.id === id)!;
const store = () => soundKernel().store;
const dry = { mode: "dry" as const, actor: OPERATOR, dryOnly: false };

beforeEach(() => {
  closeProcessKernel();
  rmSync(path.join(ROOT, "kernel.sqlite"), { force: true });
  rmSync(path.join(ROOT, "kernel.sqlite-wal"), { force: true });
  rmSync(path.join(ROOT, "kernel.sqlite-shm"), { force: true });
});

describe("Regenerate, a receipt first", () => {
  it("the read prices the attempt it would make and writes nothing - even with v1's column switch on", async () => {
    seed([job("mj-a")], true);
    const before = readFileSync(path.join(SOUND, "mv.json"), "utf8");
    const r = await regenerateMvAct("mj-a", { part: "image", prompt: "colder light" }, { ...dry, now: T + 5_000 });
    expect(r.kind).toBe("receipt");
    expect(r.at).toBe(T + 5_000);
    if (r.kind !== "receipt") return;
    expect(r.receipt.lines.map((l) => l.key)).toEqual([mvKernelId({ id: "mj-a", enqueuedAt: T + 5_000 })]);
    expect(r.receipt.lines[0]?.unpricedReason).toContain("Leonardo studio credits");
    expect(readFileSync(path.join(SOUND, "mv.json"), "utf8")).toBe(before);
    expect(mvKernelJobs(store()).size).toBe(0);
  });

  it("the confirm re-queues the record at that stamp and launches that one job, dry; a second confirm re-rolls nothing", async () => {
    seed([job("mj-b")]);
    const r = await regenerateMvAct("mj-b", { part: "image", note: "less red" }, { ...dry, now: T + 5_000 });
    if (r.kind !== "receipt") throw new Error(`expected a receipt, got ${r.kind}`);
    const c = await regenerateMvAct("mj-b", { part: "image", note: "less red" }, { ...dry, token: r.receipt.token, at: r.at });
    expect(c.kind).toBe("launched");
    const rec = onDisk("mj-b");
    expect(rec).toMatchObject({ state: "queued", redo: ["image"], note: "less red", verdict: null, enqueuedAt: T + 5_000 });
    expect(rec.endedAt).toBeUndefined();
    const kid = mvKernelId(rec);
    expect(c.kind === "launched" ? c.jobIds : []).toEqual([kid]);
    expect(mvKernelJobs(store()).get(kid)?.mode.kind).toBe("dry");
    const again = await regenerateMvAct("mj-b", { part: "image", note: "less red" }, { ...dry, token: r.receipt.token, at: r.at });
    expect(again.kind).toBe("launched");
    expect(onDisk("mj-b").enqueuedAt).toBe(T + 5_000);
    expect(mvKernelJobs(store()).size).toBe(1);
  });

  it("a record re-queued since the read is a conflict; an active video is refused at the read", async () => {
    seed([job("mj-c"), job("mj-run", { state: "active", endedAt: undefined })]);
    const first = await regenerateMvAct("mj-c", { part: "metadata" }, { ...dry, now: T + 5_000 });
    // Another tab read and confirmed a later re-roll in between.
    const other = await regenerateMvAct("mj-c", { part: "image" }, { ...dry, now: T + 9_000 });
    if (first.kind !== "receipt" || other.kind !== "receipt") throw new Error("expected receipts");
    expect((await regenerateMvAct("mj-c", { part: "image" }, { ...dry, token: other.receipt.token, at: other.at })).kind).toBe("launched");
    await expect(regenerateMvAct("mj-c", { part: "metadata" }, { ...dry, token: first.receipt.token, at: first.at })).rejects.toThrow("video mj-c was re-queued since this receipt was read; read it again");
    expect(onDisk("mj-c")).toMatchObject({ redo: ["image"], enqueuedAt: T + 9_000 });
    await expect(regenerateMvAct("mj-run", { part: "metadata" }, { ...dry, now: T + 5_000 })).rejects.toThrow("this job is active; only a finished or failed video can be regenerated");
    await expect(regenerateMvAct("mj-c", { part: "motion", prompt: "x" }, dry)).rejects.toThrow(/goes with part "image" only/);
  });
});

describe("Send to Calendar, a kernel slot", () => {
  it("copies the video into the exports and slots the export's Library item; a second send is refused before any copy", async () => {
    seed([job("mj-d")]);
    const at = "2026-10-20T18:00:00.000Z";
    const r = await sendMvToCalendarAct("mj-d", { channel: "youtube", publishAt: at }, OPERATOR, store());
    expect(r.ok, r.ok ? "" : r.error.message).toBe(true);
    if (!r.ok) return;
    expect(r.value.slot).toMatchObject({ libraryItemId: `video:export:${mvExportId("mj-d")}`, channel: "youtube", at, state: "scheduled", title: "Video mj-d", description: "a night drive", tags: ["synthwave"] });
    expect(readFileSync(path.join(EXPORTS, "mv-mj-d.mp4"), "utf8")).toBe("bytes of mv/mj-d/video.mp4");
    expect(JSON.parse(readFileSync(path.join(EXPORTS, "mv-mj-d.json"), "utf8"))).toEqual({ projectId: "audio-mv" });
    expect(existsSync(path.join(EXPORTS, "mv-mj-d.partial.mp4"))).toBe(false);
    rmSync(path.join(EXPORTS, "mv-mj-d.mp4"));
    const twice = await sendMvToCalendarAct("mj-d", { channel: "youtube", publishAt: at }, OPERATOR, store());
    expect(twice.ok ? "ok" : `${twice.error.code}: ${twice.error.message}`).toBe(`conflict: this video is already on the calendar (slot ${r.value.slot.id}, scheduled for ${at})`);
    expect(existsSync(path.join(EXPORTS, "mv-mj-d.mp4"))).toBe(false);
    expect(listSlots(store()).ok && listSlots(store())).toMatchObject({ value: [{ slot: { id: r.value.slot.id } }] });
  });

  it("refuses an unwired channel, a blog slot, an unfinished video and a title the platform would refuse", async () => {
    seed([job("mj-e"), job("mj-f", { state: "failed" }), job("mj-g", { metadata: { title: "a <b> title", description: "", tags: [], chapters: [] } })]);
    const ask = { publishAt: "2026-10-20T18:00:00.000Z" };
    const words = async (id: string, channel: "youtube" | "tiktok" | "blog"): Promise<string> => {
      const r = await sendMvToCalendarAct(id, { ...ask, channel }, OPERATOR, store());
      return r.ok ? "ok" : `${r.error.code}: ${r.error.message}`;
    };
    expect(await words("mj-e", "tiktok")).toBe("conflict: tiktok is not wired");
    expect(await words("mj-e", "blog")).toBe("invalid: a blog slot is made by an article's approve, not by a video");
    expect(await words("mj-f", "youtube")).toBe("conflict: only a finished video with its metadata can go to the calendar");
    expect(await words("mj-g", "youtube")).toBe("invalid: title/description may not contain '<' or '>'");
    expect(existsSync(EXPORTS)).toBe(false);
  });
});
