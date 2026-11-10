// THE AUDIO DECISION, THE VOICE SWITCH AND THE FINAL CUT (spark concept-casting-stages S5) on a temp kernel. Nothing here
// is a live cut: the craft scripts and ffmpeg are fakes reading the argv and the folder they were handed, H3 is a graph
// asserted without a submission, and no ComfyUI, GPU or vendor was called.

import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const DIRS = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  return fs.mkdtempSync(p.join(os.tmpdir(), "gt-final-cut-test-"));
});

import type { Result } from "@gt/domain/errors";
import type { ProductionId } from "@gt/domain/production";
import { blobStore, type BlobRef } from "@gt/kernel/blob";
import { createCastCharacterIn } from "@gt/kernel/characters/store";
import { enqueueIn } from "@gt/kernel/job";
import { DRY } from "@gt/kernel/dryrun";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { decideAudioIn, judgeCutIn, recordVoiceProofIn } from "@gt/kernel/productions/audio";
import { appendTake, markTakeProven, moveProductionIn, readProduction, settleTake, startProductionIn } from "@gt/kernel/productions/store";
import { saveRolesIn } from "@gt/kernel/productions/cast";
import type { Store } from "@gt/kernel/store";

import type { Spawn } from "../../lib/foundry/scout/ingest.ts";
import { makeFinalAdapter, finalPiles } from "../../lib/decision/v1/sources/final.ts";
import { candidateOf } from "../../lib/decision/v1/types.ts";
import { blobRootOf } from "../../lib/kernelProcess.ts";
import { H3_REF2VA_UNET, H3_REF_LORA, setRef2VaGraph, speakingPrompt } from "../../lib/imaging/video/comfyH3Ref.ts";
import { loadH3Graph } from "../../lib/imaging/video/comfyH3.ts";
import { requestSpeakingTake, productionVoiceRoute } from "../../lib/producers/productionAudio.ts";
import { cutJobId, driveCut, jobOfCut, requestCutIn, type RequestCutInput } from "../../lib/producers/productionCut.ts";
import { cutSize, layArgs, lineStarts, MUSIC_CLIP_SCRIPT, musicClipPlan, scriptArgs, TRAILER_SCRIPT, trailerEdit } from "../../lib/producers/productionCutActs.ts";
import { producers } from "../../lib/producers/registry.ts";
import { silentWav } from "../../lib/producers/voice.ts";

afterAll(() => rmSync(DIRS, { recursive: true, force: true }));

const OP = { kind: "operator", id: "op" } as const;
const AGENT = { kind: "agent", id: "a" } as const;
const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

let kernels: Kernel[] = [];
afterEach(() => {
  for (const k of kernels) k.close();
  kernels = [];
});

function world(): { store: Store; location: string } {
  const dir = mkdtempSync(path.join(DIRS, "w-"));
  const location = path.join(dir, "k.sqlite");
  const k = must(openKernel(location, { snapshotDir: dir }));
  kernels.push(k);
  return { store: k.store, location };
}

const put = async (store: Store, bytes: Uint8Array, mime: string): Promise<BlobRef> => must(await blobStore(blobRootOf(store)).put(bytes, mime));
const served = (ref: BlobRef): string => `/api/blob/${ref.sha256}?type=${encodeURIComponent(ref.mime)}`;

/** A production walked to `audio` with one role cast on a real (non-dry) voice job's preview. */
async function atAudio(store: Store): Promise<{ id: ProductionId; roleId: string }> {
  const still = await put(store, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]), "image/png");
  const video = await put(store, new Uint8Array([0, 0, 0, 0x18, 0x66, 9]), "video/mp4");
  const voice = await put(store, new Uint8Array(silentWav(1)), "audio/wav");
  const board = { logline: "the toll collector collects", aspect: "16:9" as const, panels: [{ id: "panel-1", beat: "the toll", prompt: "a toll gate", still }] };
  const p = must(store.tx((t) => startProductionIn(t, { source: { kind: "outline", ref: "o-1" }, title: "The Toll", board }, OP)));
  const id = p.id as ProductionId;
  must(
    store.tx((t) => {
      const take = appendTake(t, id, { kind: "hero", beats: ["the toll"], frames: ["panel-1"], prompt: "motion", seed: 1, engine: "fake", jobId: "job:fake:1", dry: false }, OP).take;
      settleTake(t, id, take.id, { state: "ready", video: served(video), durationS: 5, gpuSeconds: 1 }, OP);
      markTakeProven(t, id, take.id, OP);
      moveProductionIn(t, id, "casting", OP);
      saveRolesIn(t, id, [{ name: "Harbourmaster", brief: "weathered", auditionScript: "The tide does not wait for me and it will not wait for you, so hear what I am owed before the light goes." }], OP);
      const role = readProduction(t, id)?.roles[0];
      if (role === undefined) throw new Error("no role");
      const character = createCastCharacterIn(t, { card: { name: "H", look: "weathered", personality: "patient", age: 40 }, images: [{ role: "portrait", blob: still }] }, OP);
      // Written the way S4's round landing writes a cast: the role's `cast`, a stored voice job's output to read the line from.
      t.run("UPDATE productions SET roles = ?, stage = 'audio' WHERE id = ?", JSON.stringify([{ ...role, cast: { characterId: character.id, voiceId: "vendor-1", roundId: "round-1", pickedAt: t.at, pickedBy: "op" } }]), id);
      t.run("INSERT INTO cast_rounds (production_id, id, role_id, n, at, voice_job_id, pick_voice) VALUES (?, 'round-1', ?, 1, ?, 'job:voices:1', 'voice-1')", id, role.id, t.at);
      enqueueIn(t, { id: "job:voices:1", of: { kind: "run", id: "x" }, producer: "production-voices", lane: "cloud.elevenlabs", mode: DRY }, OP);
      t.run("INSERT INTO job_outputs (job_id, step, output, fence, at) VALUES ('job:voices:1', 'level:1', ?, 1, ?)", JSON.stringify({ i: 1, blob: voice, lufs: -18 }), t.at);
    }),
  );
  return { id, roleId: readRoleId(store, id) };
}

const readRoleId = (store: Store, id: string): string => must(store.read((r) => readProduction(r, id)))?.roles[0]?.id ?? "";

async function atCutting(store: Store, music: "none" | "track" = "none", voice: "dub" | "none" = "dub"): Promise<{ id: ProductionId; musicRef?: string }> {
  const { id } = await atAudio(store);
  let musicRef: string | undefined;
  if (music === "track") musicRef = served(await put(store, new Uint8Array(silentWav(1)), "audio/wav"));
  must(store.tx((t) => decideAudioIn(t, id, { voice, music, ...(musicRef === undefined ? {} : { musicRef }) }, OP)));
  must(store.tx((t) => moveProductionIn(t, id, "cutting", OP)));
  return musicRef === undefined ? { id } : { id, musicRef };
}

const ask = (id: ProductionId, mode: "dry" | "live", token?: string): RequestCutInput => ({ id, takes: ["take-1"], mode, by: "op", actor: OP, dryOnly: false, ...(token === undefined ? {} : { token }) });

async function launchCut(store: Store, id: ProductionId, mode: "dry" | "live"): Promise<string> {
  const first = must(await requestCutIn(store, ask(id, mode)));
  if (first.kind !== "receipt") throw new Error("no receipt");
  const done = must(await requestCutIn(store, ask(id, mode, first.receipt.token)));
  if (done.kind !== "launched") throw new Error(`no launch: ${done.kind}`);
  return done.jobId;
}

/** A fake of the craft scripts and ffmpeg: records every argv, writes a stand-in output file, and answers. */
function fakeSpawn(log: { calls: { bin: string; args: readonly string[] }[] }): Spawn {
  return async (bin, args) => {
    log.calls.push({ bin, args });
    const out = args[args.length - 1];
    const mp4 = args.find((a) => a.endsWith("out.mp4")) ?? (out?.endsWith(".mp4") ? out : undefined);
    if (mp4 !== undefined && !bin.includes("ffprobe")) await writeFile(mp4, new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 7]));
    return { ok: true, stdout: Buffer.alloc(0), stderr: "" };
  };
}

describe("the voice switch and the audio decision", () => {
  it("the route is dub until a held proof is stored; ref-audio is refused and the speaking take is refused", async () => {
    const { store } = world();
    const { id, roleId } = await atAudio(store);
    expect(must(productionVoiceRoute(store)).route).toBe("dub");
    const refused = store.tx((t) => decideAudioIn(t, id, { voice: "ref-audio", music: "none" }, OP));
    expect(refused.ok).toBe(false);
    expect(refused.ok ? "" : refused.error.message).toContain("proof has not been run");
    const speak = await requestSpeakingTake(store, { id, roleId, mode: "dry", by: "op", actor: OP, dryOnly: false });
    expect(speak.ok ? "" : speak.error.message).toContain("proof");
  });

  it("a held proof opens ref-audio; a failed one keeps the route at dub with its reason; only the operator records one", async () => {
    const { store } = world();
    const { id, roleId } = await atAudio(store);
    expect(store.tx((t) => recordVoiceProofIn(t, { outcome: "held" }, AGENT)).ok).toBe(false);
    must(store.tx((t) => recordVoiceProofIn(t, { outcome: "failed", note: "no lip movement" }, OP)));
    expect(must(productionVoiceRoute(store)).route).toBe("dub");
    must(store.tx((t) => recordVoiceProofIn(t, { outcome: "held", note: "lips track" }, OP)));
    expect(must(productionVoiceRoute(store)).route).toBe("ref-audio");
    must(store.tx((t) => decideAudioIn(t, id, { voice: "ref-audio", music: "none" }, OP)));
    const first = must(await requestSpeakingTake(store, { id, roleId, mode: "dry", by: "op", actor: OP, dryOnly: false }));
    expect(first.kind).toBe("receipt");
    const launched = must(await requestSpeakingTake(store, { id, roleId, mode: "dry", by: "op", actor: OP, dryOnly: false, token: first.kind === "receipt" ? first.receipt.token : "" }));
    expect(launched.kind).toBe("launched");
    const p = must(store.tx((t) => readProduction(t, id)));
    expect(p?.stage).toBe("audio");
    const take = p?.takes.find((x) => x.speaking?.roleId === roleId);
    expect(take?.engine).toBe("minimax-h3-ref2va-voice");
  });

  it("a score or track needs its source reference; an agent cannot decide", async () => {
    const { store } = world();
    const { id } = await atAudio(store);
    expect(store.tx((t) => decideAudioIn(t, id, { voice: "dub", music: "score" }, OP)).ok).toBe(false);
    expect(store.tx((t) => decideAudioIn(t, id, { voice: "dub", music: "none" }, AGENT)).ok).toBe(false);
    const p = must(store.tx((t) => decideAudioIn(t, id, { voice: "dub", music: "none", note: "a quiet one" }, OP)));
    expect(p.audio?.decidedBy).toBe("op");
    expect(p.audio?.note).toBe("a quiet one");
  });
});

describe("the ref2va graph a speaking take would submit (no submission)", () => {
  it("wires the ref2va model, the character image and the voice as ref_audios", async () => {
    const g = setRef2VaGraph(await loadH3Graph(process.cwd()), { image: "c.png", audio: "v.wav", prompt: speakingPrompt("Hear me."), width: 1280, height: 704, seed: 7, prefix: "p" });
    const node = g["140:131"];
    expect(node?.class_type).toBe("MiniMaxH3ReferenceToVideo");
    expect(node?.inputs["ref_images.ref_image_0"]).toEqual(["s1", 0]);
    expect(node?.inputs["ref_audios.ref_audio_0"]).toEqual(["s2", 0]);
    expect(node?.inputs["audio_vae"]).toEqual(["140:120", 0]);
    expect(g["s1"]?.inputs["image"]).toBe("c.png");
    expect(g["s2"]).toEqual({ class_type: "LoadAudio", inputs: { audio: "v.wav" } });
    expect(g["140:127"]?.inputs["unet_name"]).toBe(H3_REF2VA_UNET);
    expect(g["140:134"]?.inputs["lora_name"]).toBe(H3_REF_LORA);
    expect(String(node?.inputs["prompt"])).toContain("<Picture 1>");
    expect(String(node?.inputs["prompt"])).toContain("<Audio 1>");
    expect(g["115"]).toBeUndefined();
  });
});

describe("the craft scripts' folder and argv", () => {
  const take = { durationS: 5 };
  it("a trailer maps to cut.mts's edit.json, silenced when asked", () => {
    expect(trailerEdit({ takes: [{ takeId: "take-1", video: {} as never, durationS: 5 }, { takeId: "take-2", video: {} as never, durationS: 4 }], silence: false }).scenes.map((s) => s.id)).toEqual(["S01", "S02"]);
    expect(trailerEdit({ takes: [{ takeId: "take-1", video: {} as never, durationS: 5 }], silence: true }).scenes[0]?.gainDb).toBe(-90);
    expect(scriptArgs({ format: "trailer", aspect: "9:16" }, "/repo", "/d", "/o.mp4")).toEqual([path.join("/repo", TRAILER_SCRIPT), "/d", "/o.mp4", "--edit", "edit.json", "--size", "704x1280", "--fps", "24"]);
    expect(cutSize("16:9")).toBe("1280x704");
  });

  it("a music clip maps to assemble.mts's timeline and keyframes, the track cut at the picture's end", () => {
    const plan = musicClipPlan({ takes: [{ takeId: "take-1", video: {} as never, durationS: 5 }, { takeId: "take-2", video: {} as never, durationS: 4 }] }, 60);
    expect(plan.keyframes.frames).toEqual([{ id: "S01", t: 0 }, { id: "S02", t: 5 }]);
    expect(plan.timeline.track.durationS).toBe(9);
    expect(plan.trimmed).toBe(true);
    expect(scriptArgs({ format: "music-clip", aspect: "16:9" }, "/repo", "/d", "/o.mp4")[0]).toBe(path.join("/repo", MUSIC_CLIP_SCRIPT));
  });

  it("lays lines at their scene openings, the bed under, without a shell", () => {
    expect(lineStarts([take, take], 2)).toEqual([0.2, 5.2]);
    const a = layArgs({ video: "/in.mp4", lines: [{ file: "/l.wav", startS: 0.2 }], bed: "/b.mp3", totalS: 9, out: "/o.mp4" });
    expect(a.join(" ")).toContain("adelay=delays=200:all=1");
    expect(a.join(" ")).toContain("amix=inputs=3");
    expect(a.slice(-1)).toEqual(["/o.mp4"]);
  });
});

describe("the final cut door", () => {
  it("a dry cut rehearses: no script runs, no packet, no video", async () => {
    const { store, location } = world();
    const { id } = await atCutting(store);
    const jobId = await launchCut(store, id, "dry");
    const log = { calls: [] as { bin: string; args: readonly string[] }[] };
    await driveCut(store, location, jobId, { dryOnly: false, engines: { spawn: fakeSpawn(log), probe: async () => 5 } });
    expect(log.calls).toEqual([]);
    const p = must(store.read((r) => readProduction(r, id)));
    expect(p?.cut?.state).toBe("rehearsed");
    expect(p?.cut?.dry).toBe(true);
    expect(p?.cut?.packetId).toBeUndefined();
    expect(jobOfCut(store, jobId)?.state).toBe("done");
  });

  it("a live trailer runs the script with no shell over the takes, lays the dub line and lands on the Board; approval finishes it", async () => {
    const { store, location } = world();
    const { id } = await atCutting(store);
    const jobId = await launchCut(store, id, "live");
    const log = { calls: [] as { bin: string; args: readonly string[] }[] };
    let captured: string | undefined;
    const spawn: Spawn = async (bin, args, opts) => {
      if (args[0]?.includes(TRAILER_SCRIPT)) captured = await readFile(path.join(args[1] ?? "", "music-clip", "edit.json"), "utf8");
      return fakeSpawn(log)(bin, args, opts);
    };
    await driveCut(store, location, jobId, { dryOnly: false, engines: { spawn, node: process.execPath, ffmpeg: "ffmpeg", probe: async () => 5 } });
    expect(JSON.parse(captured ?? "{}").scenes[0]?.id).toBe("S01");
    expect(log.calls[0]?.bin).toBe(process.execPath);
    expect(log.calls.some((c) => c.args.join(" ").includes("adelay"))).toBe(true);
    const p = must(store.read((r) => readProduction(r, id)));
    expect(p?.cut?.state).toBe("on-board");
    expect(p?.cut?.packetId).toBe(`pkt:final:${id}/cut-1`);
    expect(p?.cut?.video).toContain("/api/blob/");

    const piles = must(finalPiles(store));
    expect(piles.map((w) => w.packetId)).toEqual([`pkt:final:${id}/cut-1`]);
    const adapter = makeFinalAdapter({ store: () => ({ ok: true, value: store }) });
    const v1 = must(await adapter.read({ runId: `${id}/cut-1` }));
    const plan = must(adapter.packet(v1));
    expect(plan.packet.source).toBe("final");
    const committed = { packet: plan.packet, packetId: plan.packet.id, decisions: [{ key: `${plan.packet.id}::final`, verdict: "keep", reasons: [], at: "2026-11-09T00:00:00.000Z", by: "operator" as const }], outcome: { act: "commit" as const } };
    expect(candidateOf(committed.decisions[0] as never)).toBe("final");
    must(await adapter.apply(committed as never));
    const done = must(store.read((r) => readProduction(r, id)));
    expect(done?.stage).toBe("done");
    expect(done?.cut?.state).toBe("approved");
    must(await adapter.apply(committed as never));
  });

  it("a music clip maps track bytes into the folder and writes the note when the track outruns the picture", async () => {
    const { store, location } = world();
    const { id } = await atCutting(store, "track", "none");
    const jobId = await launchCut(store, id, "live");
    const log = { calls: [] as { bin: string; args: readonly string[] }[] };
    await driveCut(store, location, jobId, { dryOnly: false, engines: { spawn: fakeSpawn(log), probe: async (f) => (f.endsWith("out.mp4") ? 5 : 60) } });
    expect(log.calls[0]?.args[0]).toContain(MUSIC_CLIP_SCRIPT);
    const p = must(store.read((r) => readProduction(r, id)));
    expect(p?.cut?.format).toBe("music-clip");
    expect(p?.cut?.note).toContain("track runs longer");
    expect(p?.cut?.state).toBe("on-board");
  });

  it("a failed script settles the cut failed with its sentence", async () => {
    const { store, location } = world();
    const { id } = await atCutting(store);
    const jobId = await launchCut(store, id, "live");
    await driveCut(store, location, jobId, { dryOnly: false, engines: { spawn: async () => ({ ok: false, error: "nvenc refused" }), probe: async () => 5 } });
    const p = must(store.read((r) => readProduction(r, id)));
    expect(p?.cut?.state).toBe("failed");
    expect(p?.cut?.error).toContain("nvenc refused");
  });

  it("refuses an agent, a cut before the audio decision, and a cut while one waits on the Board", async () => {
    const { store } = world();
    const { id } = await atCutting(store);
    expect((await requestCutIn(store, { ...ask(id, "dry"), actor: AGENT })).ok).toBe(false);
    const jobId = await launchCut(store, id, "live");
    expect(jobId).toBe(cutJobId(id, "cut-1"));
    must(store.tx((t) => t.run("UPDATE production_cuts SET state = 'on-board', video = '/v', packet_id = 'p' WHERE production_id = ?", id)));
    const again = await requestCutIn(store, ask(id, "dry"));
    expect(again.ok ? "" : again.error.message).toContain("on the Board");
    expect(store.tx((t) => judgeCutIn(t, id, "cut-1", "approved", AGENT)).ok).toBe(false);
    must(store.tx((t) => moveProductionIn(t, id, "audio", OP)));
    const late = store.tx((t) => judgeCutIn(t, id, "cut-1", "approved", OP));
    expect(late.ok ? "" : late.error.message).toContain("moved to audio");
    const fresh = world();
    const made = await atAudio(fresh.store);
    expect((await requestCutIn(fresh.store, ask(made.id, "dry"))).ok).toBe(false);
  });

  it("the worker carries production-cut on box.render", () => {
    const set = must(producers());
    expect(set.has("production-cut@box.render")).toBe(true);
  });
});

