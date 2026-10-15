// THE SUNO DECISION ADAPTER (lib/decision/v1/sources/suno.ts): the clips with
// no verdict as a keep | drop cull, read through readSuno (never the snapshot
// that kicks the worker), and the outcome written through v1's patchClip over a
// temp sound store - a redelivery skips the clips already marked, a clip marked
// otherwise since is refused.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-dv1-suno-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  return dir;
});

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { sunoAdapter } from "../../lib/decision/v1/sources/suno.ts";
import type { SunoClip } from "../../lib/suno/types.ts";
import { must, openFlow } from "./decision-v1-harness.ts";

const SOUND = path.join(ROOT, "sound");
const blobDir = path.join(ROOT, "blobs");
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const T = Date.parse("2026-10-15T09:00:00.000Z");
const clip = (id: string, over: Partial<SunoClip> = {}): SunoClip => ({
  id,
  songId: `song-${id}`,
  url: `https://suno.com/song/song-${id}`,
  audioUrl: `https://cdn1.suno.ai/song-${id}.mp3`,
  imageUrl: null,
  title: `Clip ${id}`,
  durationS: 120,
  origin: "queue",
  jobId: "sj-1",
  model: "v5",
  createdAt: T,
  verdict: null,
  prompt: { title: "t", style: "warm tape hiss" },
  ...over,
});

const CLIPS: SunoClip[] = [
  clip("sc-a"),
  clip("sc-b", { model: "v4.5", createdAt: T + 1000, audioUrl: null }),
  clip("sc-kept", { verdict: "keep" }),
  clip("sc-late", { createdAt: T + 60_000 }),
];
const RUN = `suno/triage/${T + 1000}`;

function seed(clips: readonly SunoClip[] = CLIPS): void {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(SOUND, { recursive: true });
  writeFileSync(path.join(SOUND, "suno.json"), JSON.stringify({ version: 1, queue: { running: true }, proposals: [], jobs: [], clips }));
}
const onDisk = (): SunoClip[] => (JSON.parse(readFileSync(path.join(SOUND, "suno.json"), "utf8")) as { clips: SunoClip[] }).clips;
const verdicts = (): Record<string, string | null> => Object.fromEntries(onDisk().map((c) => [c.id, c.verdict]));

describe("packet (pure)", () => {
  it("the unjudged clips up to the cutoff, a row per model, each addressed by the URL v1 plays it from", async () => {
    seed();
    const v1 = must(await sunoAdapter.read({ runId: "suno/triage" }));
    expect(v1.runId).toBe(`suno/triage/${T + 60_000}`);
    const plan = must(sunoAdapter.packet(must(await sunoAdapter.read({ runId: RUN }))));
    expect(plan.packet).toMatchObject({ id: `pkt:suno:${RUN}`, source: "suno", lane: "audio", mode: "matrix-cull", runId: RUN });
    expect(plan.packet.items.map((c) => [c.id, c.row])).toEqual([["sc-a", "v5"], ["sc-b", "v4.5"]]);
    const uri = "https://cdn1.suno.ai/song-sc-a.mp3";
    expect(plan.packet.items[0]?.media).toEqual({ sha256: createHash("sha256").update(uri).digest("hex"), bytes: uri.length, mime: "text/uri-list" });
    // No audio file: the song page stands in, as v1's card linked it.
    expect(plan.urls["sc-b"]).toBe("https://suno.com/song/song-sc-b");
    expect(plan.initial).toEqual([]);
    expect(plan.losses.map((l) => l.grade)).toEqual(["approximate"]);
    expect(plan.losses[0]?.reason).toMatch(/reference to suno\.com/);
    expect(plan.present.items["sc-a"]).toMatchObject({ label: "Clip sc-a", prompt: "warm tape hiss", music: true });
  });

  it("nothing pending is not a packet", async () => {
    seed([clip("sc-x", { verdict: "drop" })]);
    const r = await sunoAdapter.read({ runId: "suno/triage" });
    expect(r.ok ? "ok" : r.error.code).toBe("not-found");
  });
});

describe("consequence and apply", () => {
  async function decided() {
    seed();
    const flow = await openFlow(sunoAdapter, RUN, blobDir);
    flow.patch([
      { candidate: "sc-a", verdict: "keep" },
      { candidate: "sc-b", verdict: "reject" },
    ]);
    return flow;
  }

  it("keep and drop are v1's two words; a keep is a track Settled can use", async () => {
    const flow = await decided();
    const c = must(flow.preview()).consequence;
    expect(c.counts).toEqual({ kept: 1, rejected: 1, undecided: 0 });
    expect(c.writes.map((w) => [w.target, w.detail])).toEqual([
      ["suno.json clips sc-a", "keep"],
      ["suno.json clips sc-b", "drop"],
    ]);
    expect(c.promotions.map((p) => p.candidate)).toEqual(["sc-a"]);
    expect(c.deletes).toEqual([]);
    const moved = { ...flow.v1, clips: flow.v1.clips.map((x) => (x.id === "sc-a" ? { ...x, verdict: "drop" as const } : x)) };
    const r = flow.preview(moved);
    expect(r.ok ? "ok" : r.error.code).toBe("conflict");
  });

  it("writes through patchClip, leaves the rest of suno.json alone, and a redelivery is a no-op", async () => {
    const flow = await decided();
    must(flow.commit());
    const claim = flow.claim();
    must(await sunoAdapter.apply(claim));
    expect(verdicts()).toEqual({ "sc-a": "keep", "sc-b": "drop", "sc-kept": "keep", "sc-late": null });
    const bytes = readFileSync(path.join(SOUND, "suno.json"), "utf8");
    must(await sunoAdapter.apply(claim));
    expect(readFileSync(path.join(SOUND, "suno.json"), "utf8")).toBe(bytes);
  });

  it("a crash after the first clip converges: the second delivery marks only the rest", async () => {
    const flow = await decided();
    must(flow.commit());
    const claim = flow.claim();
    // The first patchClip landed, the process died before the second.
    writeFileSync(path.join(SOUND, "suno.json"), JSON.stringify({ version: 1, queue: { running: true }, proposals: [], jobs: [], clips: CLIPS.map((c) => (c.id === "sc-a" ? { ...c, verdict: "keep" } : c)) }));
    must(await sunoAdapter.apply(claim));
    expect(verdicts()).toEqual({ "sc-a": "keep", "sc-b": "drop", "sc-kept": "keep", "sc-late": null });
  });

  it("a clip marked otherwise since is refused, and the kernel's applier parks it stuck", async () => {
    const flow = await decided();
    must(flow.commit());
    writeFileSync(path.join(SOUND, "suno.json"), JSON.stringify({ version: 1, queue: { running: true }, proposals: [], jobs: [], clips: CLIPS.map((c) => (c.id === "sc-b" ? { ...c, verdict: "keep" } : c)) }));
    expect((await flow.deliver())?.result).toBe("stuck");
    expect(verdicts()["sc-b"]).toBe("keep");
  });
});
