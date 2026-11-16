// A CASTING ROUND (spark concept-casting-stages S4) on a temp kernel: roles, a round per role, new designs and voices, the
// operator's pick, the move to audio and a re-cast. EVERY vendor here is a stand-in: a dry job calls nobody, and the live
// path runs a fake text seat, a fake Codex, a fake eye and fake ElevenLabs doors. No Codex, seat, GPU or vendor was called.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const DIRS = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  return fs.mkdtempSync(p.join(os.tmpdir(), "gt-casting-"));
});

import { parseAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import { jobIdSchema } from "@gt/domain/ids";
import { CREDIT_READS, type CharacterId, type ProductionId } from "@gt/domain/production";
import { blobStore } from "@gt/kernel/blob";
import { allCharacterUses, createCastCharacterIn, readCharacter } from "@gt/kernel/characters/store";
import { get } from "@gt/kernel/job";
import { runJob } from "@gt/kernel/job-run";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { roundsOf, saveRolesIn } from "@gt/kernel/productions/cast";
import { appendTake, markTakeProven, moveProductionIn, readProduction, settleTake, startProductionIn } from "@gt/kernel/productions/store";
import type { Store } from "@gt/kernel/store";

import type { Spawn } from "../../lib/foundry/scout/ingest.ts";
import type { RecognizeRequest } from "../../lib/imaging/types.ts";
import { blobRootOf } from "../../lib/kernelProcess.ts";
import { effectsFor } from "../../lib/producers/extract.ts";
import { castRoundView, driveCast, markHeard, pickCast, recastRole, requestRoles, requestRound, retryDesigns, saveRoles, type CastLaunchInput } from "../../lib/producers/productionCast.ts";
import type { CastEngines } from "../../lib/producers/productionCastActs.ts";
import { productionVoicesProducer, type VoicesEngines } from "../../lib/producers/productionVoices.ts";
import { standIdea } from "../../lib/producers/scoutIdeaActs.ts";
import { producers } from "../../lib/producers/registry.ts";
import { silentWav } from "../../lib/producers/voice.ts";

process.env["ELEVENLABS_API_KEY"] = "test-key-not-a-real-one";
afterAll(() => {
  delete process.env["ELEVENLABS_API_KEY"];
  rmSync(DIRS, { recursive: true, force: true });
});

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

const LOGLINE = "A harbourmaster who has never once been paid in coin decides to collect.";

/** A production at `casting` with one real (non-dry) proven take: the only way into casting. */
async function proven(store: Store): Promise<ProductionId> {
  const blob = must(await blobStore(blobRootOf(store)).put(new Uint8Array(standIdea(1)), "image/png"));
  const board = { logline: LOGLINE, aspect: "16:9" as const, panels: [{ id: "panel-1", beat: "the toll", prompt: "a toll gate at dusk", still: blob }] };
  const p = must(store.tx((t) => startProductionIn(t, { source: { kind: "outline", ref: "o-1" }, title: "The Toll", board }, OP)));
  must(
    store.tx((t) => {
      const take = appendTake(t, p.id, { kind: "hero", beats: ["the toll"], frames: ["panel-1"], prompt: "motion", seed: 1, engine: "fake", jobId: "job:fake:1", dry: false }, OP).take;
      settleTake(t, p.id, take.id, { state: "ready", video: "/v.mp4", durationS: 3, gpuSeconds: 1 }, OP);
      markTakeProven(t, p.id, take.id, OP);
      moveProductionIn(t, p.id, "casting", OP);
    }),
  );
  return p.id as ProductionId;
}

const launchInput = (mode: "dry" | "live"): CastLaunchInput => ({ mode, by: "op", actor: OP, dryOnly: false });

/** A launch's receipt then its confirm. */
function confirmed(run: (i: CastLaunchInput) => Result<{ kind: string } & Record<string, unknown>>, mode: "dry" | "live"): string {
  const first = must(run(launchInput(mode)));
  const receipt = (first as unknown as { receipt: { token: string } }).receipt;
  const done = must(run({ ...launchInput(mode), token: receipt.token }));
  if (done.kind !== "launched") throw new Error(`expected a launch, got ${done.kind}`);
  return (done as unknown as { jobId: string }).jobId;
}

/* ── The fakes ────────────────────────────────────────────────────────────── */

const instantFfmpeg: Spawn = async (_bin, args) => {
  const filter = args[args.indexOf("-af") + 1] ?? "";
  if (filter.includes("measured_I")) {
    writeFileSync(args[args.length - 1] ?? "", Buffer.alloc(600, 3));
    return { ok: true, stdout: Buffer.alloc(0), stderr: `[Parsed_loudnorm_0]\n{\n"input_i": "-24.0",\n"output_i": "-18.2"\n}\n` };
  }
  return { ok: true, stdout: Buffer.alloc(0), stderr: `[Parsed_loudnorm_0]\n{\n"input_i": "-24.0",\n"input_tp": "-6.0",\n"input_lra": "5.0",\n"input_thresh": "-34.0",\n"target_offset": "0.2"\n}\n` };
};

function voiceEngines(log: { created: number } = { created: 0 }): VoicesEngines {
  return {
    spawn: instantFfmpeg,
    ffmpeg: "ffmpeg",
    deps: { sleep: async () => undefined },
    design: async (r) => ok({ previews: Array.from({ length: r.count }, (_, i) => ({ generatedVoiceId: `gen-${i}`, bytes: new Uint8Array(silentWav(1)), durationMs: 1000 })), calls: [{ used: 88, read: "character-cost-header" as const }] }),
    create: async () => {
      log.created += 1;
      return ok({ voiceId: `vendor-voice-${log.created}` });
    },
  };
}

type Fakes = { drawn: string[]; draw: CastEngines["draw"]; seat: CastEngines["seat"]; recognize: CastEngines["recognize"] };

/** A seat that answers by what the turn asks, a Codex that draws by name, an eye that clears everything but `refuse`. */
function fakes(o: { readonly failDraw?: string; readonly refuse?: string } = {}): Fakes {
  const drawn: string[] = [];
  let k = 0;
  return {
    drawn,
    draw: async (req) => {
      drawn.push(req.prompt);
      if (o.failDraw !== undefined && req.prompt.includes(o.failDraw)) throw new Error(`codex exited 1 on ${o.failDraw}`);
      return { png: new Uint8Array(standIdea(req.prompt.length)) };
    },
    seat: async (input) => {
      k += 1;
      const answer = input.prompt.includes("speaking roles")
        ? { roles: [{ name: "Harbourmaster", brief: "an old harbourmaster, weathered, salt-worn coat, gravelly low voice" }, { name: "Clerk", brief: "a nervous young clerk with precise diction" }] }
        : input.prompt.includes("One casting line")
          ? { line: "The tide does not wait for me and it will not wait for you, so hear what I am owed before the light goes and the boats come home." }
          : { cards: Array.from({ length: Number(/Write (\d+) different/.exec(input.prompt)?.[1] ?? 1) }, (_, i) => ({ name: `Design ${k}-${i + 1}`, age: 40, look: `face ${i + 1}, salt-worn coat`, personality: "patient" })) };
      await writeFile(path.join(input.cwd, "out", "answer.json"), JSON.stringify(answer));
      return { outcome: "completed", final: "", turns: 1, durationMs: 1, exitCode: 0, errors: [] };
    },
    recognize: async (req: RecognizeRequest) => {
      const body = req.image.base64 ?? "";
      const seq = o.refuse !== undefined && body.length % 7 === Number(o.refuse) ? 15 : 34;
      return { json: { adult: seq === 15 ? "no" : "yes", apparentAge: seq, clothing: "covered", realPerson: "no", hands: "ok", notes: "fake eye" }, provenance: { provider: "fake", model: "eye", costUsd: 0 } } as never;
    },
  };
}

function driveVoices(store: Store, location: string, jobId: string, e: VoicesEngines = voiceEngines()) {
  return runJob(effectsFor(store, location), productionVoicesProducer({ store: () => ok(store), engines: e }), jobId, { dryOnly: false });
}

const jobState = (s: Store, id: string) => must(get(s, must(parseAt("job id", jobIdSchema, id)))).job.state;

/* ── The walk ─────────────────────────────────────────────────────────────── */

describe("a casting round", () => {
  it("walks a whole dry round: roles, five designs, five stand-in voices, a pick, and refuses to carry the dry cast to audio", async () => {
    const { store, location } = world();
    const id = await proven(store);
    const rolesJob = confirmed((i) => requestRoles(store, id, i) as never, "dry");
    must(await driveCast(store, location, rolesJob));
    const p = must(store.read((r) => readProduction(r, id)));
    expect(p?.roles.map((r) => r.name)).toEqual(["The Lead", "The Foil"]);
    expect(p?.roles[0]?.auditionScript?.length ?? 0).toBeGreaterThanOrEqual(100);

    const lead = p?.roles[0]?.id ?? "";
    const drawJob = confirmed((i) => requestRound(store, id, lead, i) as never, "dry");
    const rounds = must(store.read((r) => roundsOf(r, id)));
    const stored = rounds[0];
    if (stored === undefined) throw new Error("no round");
    expect(stored.voiceJobId).toContain("production-voices");
    must(await driveCast(store, location, drawJob));
    must(await driveVoices(store, location, stored.voiceJobId));
    const after = must(store.read((r) => roundsOf(r, id)))[0];
    if (after === undefined) throw new Error("no round");
    const view = must(castRoundView(store, must(store.read((r) => readProduction(r, id))) as never, after));
    expect(view.characters).toHaveLength(5);
    expect(view.voices).toHaveLength(5);
    expect(view.characters.every((c) => c.images.length === 1)).toBe(true);
    expect(view.voices.every((v) => v.preview !== undefined)).toBe(true);
    expect(view.dry).toBe(true);
    expect(view.creditsRead).toBe("unread");
    expect(CREDIT_READS).toContain("unread");

    // the lock: no pick before the preview played through; an agent never picks.
    const pick = { id, roundId: stored.id, character: "c-1", voice: "voice-2", saveToLibrary: false, by: "op", actor: OP, dryOnly: false };
    const early = pickCast(store, pick);
    expect(!early.ok && early.error.message).toMatch(/play this voice's preview/);
    must(markHeard(store, id, stored.id, "voice-2", "2026-11-09T10:00:00.000Z", OP));
    expect(pickCast(store, { ...pick, actor: AGENT, by: "a" }).ok).toBe(false);
    const made = must(pickCast(store, pick));
    must(await driveVoices(store, location, made.createJobId));
    const cast = must(store.read((r) => readProduction(r, id)))?.roles[0]?.cast;
    expect(cast?.dry).toBe(true);
    expect(cast?.voiceId).toMatch(/^dry-voice/);
    const refused = store.tx((t) => moveProductionIn(t, id, "audio", OP));
    expect(!refused.ok && refused.error.message).toMatch(/every role needs a character and a voice/);
    must(store.tx((t) => saveRolesIn(t, id, [{ id: lead, name: "The Lead", brief: p?.roles[0]?.brief ?? "" }], OP)));
    const dryRefused = store.tx((t) => moveProductionIn(t, id, "audio", OP));
    expect(!dryRefused.ok && dryRefused.error.message).toMatch(/dry stand-in cannot go to audio/);
  });

  it("runs two roles through fake vendors as two rounds, draws only what is missing on a retry, reuses a saved character, and only then allows audio", async () => {
    const { store, location } = world();
    const id = await proven(store);
    const saved = must(store.tx((t) => createCastCharacterIn(t, { card: { name: "Maren Holt", age: 52, look: "old weathered harbourmaster salt-worn coat gravelly", personality: "patient, gravelly low voice" }, images: [], save: true }, OP)));
    // a used-before line for the reused candidate reads the record: this character has none yet.
    expect(must(store.read((r) => readCharacter(r, saved.id)))).toBeDefined();
    const fake = fakes({ failDraw: "face 2" });
    const engines: CastEngines = { seat: fake.seat, draw: fake.draw, recognize: fake.recognize };
    must(await driveCast(store, location, confirmed((i) => requestRoles(store, id, i) as never, "live"), { engines }));
    const roles = must(store.read((r) => readProduction(r, id)))?.roles ?? [];
    expect(roles.map((r) => r.name)).toEqual(["Harbourmaster", "Clerk"]);

    const firstJob = confirmed((i) => requestRound(store, id, roles[0]?.id ?? "", i) as never, "live");
    must(await driveCast(store, location, firstJob, { engines }));
    const r1 = must(store.read((r) => roundsOf(r, id))).find((r) => r.roleId === roles[0]?.id);
    if (r1 === undefined) throw new Error("no round");
    must(await driveVoices(store, location, r1.voiceJobId));
    const view = must(castRoundView(store, must(store.read((r) => readProduction(r, id))) as never, r1));
    // one reused match, its use-before line, then new designs filling the five; the failed draw is that design's alone.
    expect(view.characters[0]).toMatchObject({ origin: "reused", characterId: saved.id });
    expect(view.characters[0]?.origin === "reused" && view.characters[0].match).toBeTruthy();
    expect(view.characters[0]?.origin === "reused" && view.characters[0].usedBefore[0]?.label).toMatch(/not cast/);
    const failed = view.characters.filter((c) => c.origin === "new" && c.state === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.origin === "new" && failed[0].error).toMatch(/codex exited 1/);
    expect(jobState(store, firstJob)).toBe("done");
    expect(view.creditsUsed).toBe(176);
    expect(view.creditsRead).toBe("character-cost-header");

    // the retry draws only the failed slot.
    const before = fake.drawn.length;
    const retryFake = fakes();
    const retryJob = confirmed((i) => retryDesigns(store, id, r1.id, i) as never, "live");
    must(await driveCast(store, location, retryJob, { engines: { ...engines, draw: retryFake.draw } }));
    expect(fake.drawn).toHaveLength(before);
    expect(retryFake.drawn).toHaveLength(1);
    const refreshed = must(store.read((r) => roundsOf(r, id)))[0];
    expect(refreshed?.candidates.every((c) => c.state === "ready")).toBe(true);

    // pick role one (a new design), saved to the library.
    const heard = "2026-11-09T10:00:00.000Z";
    must(markHeard(store, id, r1.id, "voice-1", heard, OP));
    const newCandidate = view.characters.find((c) => c.origin === "new" && c.state === "ready");
    must(await driveVoices(store, location, must(pickCast(store, { id, roundId: r1.id, character: newCandidate?.id ?? "", voice: "voice-1", saveToLibrary: true, by: "op", actor: OP, dryOnly: false })).createJobId, voiceEngines()));

    // role two's round picks a reused candidate, by slot, once any match exists: here a new design.
    const secondJob = confirmed((i) => requestRound(store, id, roles[1]?.id ?? "", i) as never, "live");
    must(await driveCast(store, location, secondJob, { engines }));
    const r2 = must(store.read((r) => roundsOf(r, id))).find((r) => r.roleId === roles[1]?.id);
    if (r2 === undefined) throw new Error("no round");
    must(await driveVoices(store, location, r2.voiceJobId));
    must(markHeard(store, id, r2.id, "voice-3", heard, OP));
    const created = { created: 0 };
    must(await driveVoices(store, location, must(pickCast(store, { id, roundId: r2.id, character: "c-1", voice: "voice-3", saveToLibrary: false, by: "op", actor: OP, dryOnly: false })).createJobId, voiceEngines(created)));
    expect(created.created).toBe(1);

    const cast = must(store.read((r) => readProduction(r, id)))?.roles ?? [];
    expect(cast.every((r) => r.cast !== undefined && r.cast.dry === undefined)).toBe(true);
    const uses = must(store.read((r) => allCharacterUses(r)));
    expect(cast.every((r) => (r.cast === undefined ? false : (uses.get(r.cast.characterId as CharacterId) ?? []).length === 1))).toBe(true);
    const chosen = must(store.read((r) => readCharacter(r, cast[0]?.cast?.characterId ?? "")));
    expect(chosen?.savedToLibrary).toBe(true);
    expect(chosen?.origin).toBe("casting-new");
    expect(chosen?.voiceId).toBe("vendor-voice-1");

    expect(must(store.tx((t) => moveProductionIn(t, id, "audio", OP))).stage).toBe("audio");
    // no way back but a named re-cast, which marks later takes stale and goes back to casting.
    const back = store.tx((t) => moveProductionIn(t, id, "casting", OP));
    expect(!back.ok && back.error.message).toMatch(/names the role/);
    must(store.tx((t) => t.run("INSERT INTO production_takes (production_id, id, n, kind, state, beats, frames, prompt, seed, engine, job_id, dry, at, video) VALUES (?, 'take-9', 9, 'hero', 'ready', '[\"b\"]', '[\"panel-1\"]', 'p', 1, 'fake', 'j', 0, ?, '/v')", id, "2099-01-01T00:00:00.000Z")));
    must(recastRole(store, id, cast[0]?.id ?? "", OP));
    const redone = must(store.read((r) => readProduction(r, id)));
    expect(redone?.stage).toBe("casting");
    expect(redone?.roles[0]?.cast).toBeUndefined();
    expect(redone?.takes.find((x) => x.id === "take-9")?.stale).toBe(true);
    expect(redone?.takes.find((x) => x.id === "take-1")?.stale).toBeUndefined();
    expect(must(store.read((r) => roundsOf(r, id))).find((r) => r.roleId === cast[0]?.id)?.pickVoice).toBeUndefined();
  });

  it("refuses a design the safety judge will not clear, keeps no pixels of it, and keeps it the slot's failure only", async () => {
    const { store, location } = world();
    const id = await proven(store);
    must(store.tx((t) => saveRolesIn(t, id, [{ name: "Lead", brief: "a person of the harbour with a low voice", auditionScript: "x".repeat(120) }], OP)));
    const eye = fakes();
    let reads = 0;
    const engines: CastEngines = {
      seat: fakes().seat,
      draw: async () => ({ png: new Uint8Array(standIdea(3)) }),
      recognize: async (req) => {
        reads += 1;
        const out = (await eye.recognize?.(req)) as { json: { apparentAge: number } };
        return { ...out, json: { ...out.json, apparentAge: reads === 2 ? 15 : 34, adult: reads === 2 ? "no" : "yes" } } as never;
      },
    };
    const job = confirmed((i) => requestRound(store, id, "lead", i) as never, "live");
    must(await driveCast(store, location, job, { engines }));
    const round = must(store.read((r) => roundsOf(r, id)))[0];
    const slot = round?.candidates.find((c) => c.state === "refused");
    expect(slot?.error).toMatch(/^judge: /);
    expect(slot?.images).toHaveLength(0);
    expect(round?.candidates.filter((c) => c.state === "ready")).toHaveLength(4);
    expect(jobState(store, job)).toBe("done");
  });

  it("refuses a too-short audition line and a round for a role with no line", async () => {
    const { store } = world();
    const id = await proven(store);
    expect(saveRoles(store, id, [{ name: "Lead", brief: "someone", auditionScript: "too short" }], OP).ok).toBe(false);
    must(saveRoles(store, id, [{ name: "Lead", brief: "someone with a voice" }], OP));
    const noLine = requestRound(store, id, "lead", launchInput("dry"));
    expect(!noLine.ok && noLine.error.message).toMatch(/audition line/);
    expect([...must(producers()).keys()].some((k) => String(k).includes("production-cast"))).toBe(true);
  });
});

