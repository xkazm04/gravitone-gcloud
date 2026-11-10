// VENTURES AND LESSONS (spark concept-casting-stages S6) on a temp kernel: the channels imported as ventures while nights keep
// reading the channel files, the operator's start and join, and a done production's lessons. EVERY vendor here is a stand-in:
// the text seat is a fake, and no seat, Codex, GPU or vendor was called.

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.setConfig({ testTimeout: 60_000 });

const DIRS = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const p = process.getBuiltinModule("node:path");
  const root = fs.mkdtempSync(p.join(os.tmpdir(), "gt-ventures-"));
  process.env["GRAVITONE_STORE_PATH"] = p.join(root, "process.sqlite");
  process.env["SCOUT_STORE_DIR"] = p.join(root, "scout-nights");
  process.env["SCOUT_CHANNELS_DIR"] = p.join(root, "scout-channels");
  process.env["SCOUT_WING"] = "scout";
  return root;
});

import type { Result } from "@gt/domain/errors";
import { lessonIdOf, type ProductionId } from "@gt/domain/production";
import { DRY } from "@gt/kernel/dryrun";
import { queryEvents } from "@gt/kernel/events-query";
import { enqueueIn, get } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { migrate } from "@gt/kernel/migrate";
import { acceptLessonIn, editLessonIn, lessonsOf, proposeLessonsIn } from "@gt/kernel/productions/lessons";
import { joinVentureIn, operatorVentureIn, startVentureIn, ventureRefusalOf } from "@gt/kernel/productions/venture";
import { appendTake, markTakeProven, moveProductionIn, readProduction, settleTake, startProductionIn } from "@gt/kernel/productions/store";
import { blobStore } from "@gt/kernel/blob";
import { castJobsOf, saveRolesIn } from "@gt/kernel/productions/cast";
import { openStore, type Store } from "@gt/kernel/store";
import { ventureMigrations } from "@gt/kernel/ventures/schema";
import { bornVenture, listVentures, readVenture } from "@gt/kernel/ventures/store";
import { makeFinalAdapter } from "../../lib/decision/v1/sources/final.ts";
import { blobRootOf, closeKernel as closeKernelOfProcess, kernel as processKernel } from "../../lib/kernelProcess.ts";
import { channelFrame, dryImport, heldChannels, importChannels } from "../../lib/foundry/scout/ventureImport.ts";
import { genresCommand, headsOf, ventureRefusal } from "../../lib/foundry/scout/genres.ts";
import { episodesDue, type ChannelFile } from "../../lib/foundry/scout/channels.ts";
import { pendingOf, readQueue, queueEvents, leadKey } from "../../lib/foundry/scout/leads.ts";
import { LESSONS_HEADING, lessonsSection, tasteLessons } from "../../lib/foundry/scout/tasteLessons.ts";
import { tasteBrief } from "../../lib/foundry/scout/taste.ts";
import { acceptLesson, driveLessons, enqueueLessonsIn, leadRefOf, proposalsOf, requestLessons } from "../../lib/producers/productionLessons.ts";
import type { CastEngines } from "../../lib/producers/productionCastActs.ts";
import { producers } from "../../lib/producers/registry.ts";

const OP = { kind: "operator", id: "op" } as const;
const AGENT = { kind: "agent", id: "seat" } as const;

const must = <T>(r: Result<T>): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

afterAll(() => {
  closeKernelOfProcess();
  rmSync(DIRS, { recursive: true, force: true });
});

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

const ch = (id: string, name: string, extra: Record<string, unknown> = {}): ChannelFile => ({
  channel: { id, group: "Documentary", name, audience: "curious adults", promise: "the promise", gap: "the gap", edge: "the edge", medium: "storyboard", ...extra },
  episodes: [
    { id: `${id}-01`, channel: id, title: "first", logline: "l", beats: ["a", "b", "c", "d", "e"], spec: "s", state: "outline-kept", at: "2026-11-01T00:00:00.000Z" },
    { id: `${id}-02`, channel: id, title: "second", logline: "l", beats: ["a", "b", "c", "d", "e"], spec: "s", state: "kept", at: "2026-11-02T00:00:00.000Z" },
  ],
});

async function writeChannels(files: readonly ChannelFile[]): Promise<void> {
  const dir = process.env["SCOUT_CHANNELS_DIR"] ?? "";
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(path.join(dir, `${f.channel.id}.json`), JSON.stringify(f));
}

const SEVEN = [ch("D1", "Came From Nowhere"), ch("D2", "The What-If Machine"), ch("F1", "While It Works", { look: "macro cinematography" }), ch("F2", "Across the Centuries"), ch("K1", "Small Night Stories"), ch("P1", "What If They Clocked In"), ch("S1", "It Builds Itself")];

beforeAll(async () => {
  await writeChannels(SEVEN);
});

let n = 0;
const nextRef = (): string => `o-${++n}`;

/** A production walked the way S1-S5 do, stopped at `upTo`; the cast is written directly (S4's own test proves the real path). */
async function produced(store: Store, upTo: "accepted" | "proven" | "cutting" | "done", source?: { kind: "episode" | "outline"; ref: string }): Promise<ProductionId> {
  const still = must(await blobStore(blobRootOf(store)).put(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ++n % 256]), "image/png"));
  const board = { logline: "the toll collector collects", aspect: "16:9" as const, panels: [{ id: "panel-1", beat: "the toll", prompt: "a toll gate", still }] };
  const src = source ?? { kind: "outline" as const, ref: nextRef() };
  const p = must(store.tx((t) => startProductionIn(t, { source: src, title: `The Toll ${src.ref}`, board }, OP)));
  const id = p.id as ProductionId;
  if (upTo === "accepted") return id;
  must(
    store.tx((t) => {
      const take = appendTake(t, id, { kind: "hero", beats: ["the toll"], frames: ["panel-1"], prompt: "slow push in on the gate", seed: 1, engine: "fake", jobId: "job:fake:1", dry: false }, OP).take;
      settleTake(t, id, take.id, { state: "ready", video: "/api/blob/x", durationS: 5, gpuSeconds: 1 }, OP);
      markTakeProven(t, id, take.id, OP);
    }),
  );
  if (upTo === "proven") return id;
  const cutRef = must(await blobStore(blobRootOf(store)).put(new Uint8Array([0, 0, 0, 0x18, 0x66, ++n % 256]), "video/mp4"));
  const cutVideo = `/api/blob/${cutRef.sha256}?type=${encodeURIComponent(cutRef.mime)}`;
  must(
    store.tx((t) => {
      moveProductionIn(t, id, "casting", OP);
      saveRolesIn(t, id, [{ name: "H", brief: "weathered" }], OP);
      const role = readProduction(t, id)?.roles[0];
      if (role === undefined) throw new Error("no role");
      t.run("UPDATE productions SET roles = ?, stage = 'cutting' WHERE id = ?", JSON.stringify([{ ...role, cast: { characterId: "chr:01JC9Z0Q5V3T8K2M4N6P7R9S11", voiceId: "v", roundId: "r", pickedAt: t.at, pickedBy: "op" } }]), id);
      t.run("INSERT INTO production_cuts (production_id, id, n, format, state, takes, job_id, dry, packet_id, video, at) VALUES (?, 'cut-1', 1, 'trailer', 'on-board', '[\"take-1\"]', 'job:cut:1', 0, ?, ?, ?)", id, `pkt:final:${id}/cut-1`, cutVideo, t.at);
    }),
  );
  if (upTo === "cutting") return id;
  must(store.tx((t) => t.run("UPDATE production_cuts SET state = 'approved', note = ?, judged_at = ?, judged_by = 'op' WHERE production_id = ? AND id = 'cut-1'", "the hold on the gate is what works; the second take drifted", t.at, id)));
  must(store.tx((t) => t.run("UPDATE productions SET stage = 'done' WHERE id = ?", id)));
  return id;
}

const fakeSeat = (write: (concept: { evidence: { ref: string; words: string }[] }) => unknown): NonNullable<CastEngines["seat"]> => async (input) => {
  const fs = await import("node:fs/promises");
  const concept = JSON.parse(await fs.readFile(path.join(input.cwd, "inputs", "concept.json"), "utf8"));
  await fs.writeFile(path.join(input.cwd, "out", "answer.json"), JSON.stringify(write(concept)));
  return { outcome: "completed", errors: [] } as never;
};

/** A full fake answer: each lesson cites the first evidence item it was given. */
const answering = (c: { evidence: { ref: string }[] }) => ({
  lessons: [
    { dimension: "beats", text: "Hold on the gate until the pause does the work.", drawnFrom: [c.evidence[0]?.ref ?? ""] },
    { dimension: "art-style", nothing: "the record said nothing about the look" },
    { dimension: "technique", text: "A slow push-in held on this engine across the take.", drawnFrom: [c.evidence[0]?.ref ?? ""] },
  ],
});

async function enqueueLive(store: Store, id: ProductionId): Promise<string> {
  must(store.tx((t) => enqueueLessonsIn(t, id, OP, false)));
  return must(store.read((r) => castJobsOf(r, id)))["lessons"] ?? "";
}

describe("the channels as ventures", () => {
  it("imports all channels once; a repeat run changes nothing and the channel files are untouched", async () => {
    const { store } = world();
    const first = must(importChannels(store, SEVEN, OP));
    expect(first.map((x) => x.outcome)).toEqual(Array(7).fill("imported"));
    expect(must(store.read((r) => readVenture(r, "vn-while-it-works")))?.channelId).toBe("F1");
    const before = must(store.read((r) => r.all("SELECT count(*) AS n FROM events")));
    const again = must(importChannels(store, SEVEN, OP));
    expect(again.map((x) => x.outcome)).toEqual(Array(7).fill("already-there"));
    const ventures = must(store.read((r) => listVentures(r)));
    expect(ventures.map((v) => v.channelId)).toEqual(["D1", "D2", "F1", "F2", "K1", "P1", "S1"]);
    expect(must(store.read((r) => r.all("SELECT count(*) AS n FROM events")))[0]?.["n"]).toBe(before[0]?.["n"]);
    expect(dryImport(SEVEN, heldChannels(ventures), new Set(ventures.map((v) => v.id))).every((x) => x.outcome === "already-there")).toBe(true);
  });

  it("a frame says only what the channel file holds, with no invented look", () => {
    expect(channelFrame(SEVEN[2] as ChannelFile).look).toBe("macro cinematography");
    expect(channelFrame(SEVEN[0] as ChannelFile).look).toBe("no look set on the channel");
    expect(channelFrame(ch("D3", "x", { medium: "reel" })).format).toBe("a real-data reel");
  });

  it("nights do not see imported ventures: heads, the brief's door, the CLI's list, and channels still drive what is due", async () => {
    const { store } = world();
    const dueBefore = JSON.stringify(await episodesDue());
    const briefBefore = await tasteBrief();
    expect(must(headsOf(store)).ventures).toEqual([]);
    must(importChannels(store, SEVEN, OP));
    expect(must(headsOf(store)).ventures).toEqual([]);
    expect(ventureRefusal("vn-while-it-works", store)).toBe("no venture vn-while-it-works");
    expect(JSON.stringify(await episodesDue())).toBe(dueBefore);
    expect(await tasteBrief()).toBe(briefBefore);
    const listed = await genresCommand("venture", ["list"], { store, actor: { kind: "operator", id: "op" } });
    expect(listed.lines.join("\n")).toContain("[channel F1]");
  });

  it("the migration keeps a v1 store's ventures, its tied genre, and the import works on top of it", () => {
    const dir = mkdtempSync(path.join(DIRS, "mig-"));
    const location = path.join(dir, "old.sqlite");
    const v1: typeof ventureMigrations = { module: ventureMigrations.module, steps: ventureMigrations.steps.slice(0, 1) };
    const s = must(openStore(location));
    must(migrate(s, [v1], { snapshotDir: dir }));
    must(
      s.tx((t) => {
        t.run("INSERT INTO ventures (id, name, kind, frame, proposal, born_at, born_by_kind, born_by) VALUES ('vn-old', 'Old', 'channel', ?, '2026-10-01/c-1', '2026-10-01T00:00:00.000Z', 'operator', 'op')", JSON.stringify({ tone: "t", audience: "a", format: "f", look: "l", genres: ["gn-x"] }));
        t.run("INSERT INTO genres (id, name, born_from, proposal, use, look, grammar, born_at, born_by_kind, born_by, venture_id) VALUES ('gn-x', 'X', '2026-10-01/c-2', '2026-10-01/c-3', 'u', 'l', '[]', '2026-10-01T00:00:00.000Z', 'operator', 'op', 'vn-old')");
      }),
    );
    s.close();
    const k = must(openKernel(location, { snapshotDir: dir }));
    kernels.push(k);
    expect(must(k.store.read((r) => readVenture(r, "vn-old")))?.name).toBe("Old");
    expect(must(k.store.read((r) => r.get("SELECT venture_id FROM genres WHERE id = 'gn-x'")))?.["venture_id"]).toBe("vn-old");
    must(importChannels(k.store, SEVEN, OP));
    expect(must(k.store.read((r) => listVentures(r))).length).toBe(8);
    expect(must(headsOf(k.store)).ventures.map((v) => v.id)).toEqual(["vn-old"]);
    // The rebuilt table still refuses an edit of what is fixed.
    expect(k.store.tx((t) => t.run("UPDATE ventures SET name = 'New' WHERE id = 'vn-old'")).ok).toBe(false);
  });
});

describe("the birth rule", () => {
  const frame = { tone: "t", audience: "a", format: "f", look: "l", genres: [] as string[] };
  it("the genre route is unchanged: a channel with no genre and no ground is refused, and a night's proposal cannot claim a ground", () => {
    const { store } = world();
    const r = store.tx((t) => bornVenture(t, { name: "N", kind: "channel", frame, proposal: "2026-11-01/c-1" }, OP));
    expect(r.ok ? "" : r.error.message).toBe("a channel is born from at least one genre; 2026-11-01/c-1 names none");
    expect(store.tx((t) => bornVenture(t, { name: "N", kind: "channel", frame, proposal: "channel/F1", channelId: "F1" }, OP)).ok).toBe(false);
  });

  it("only the operator births on a proven, operator or channel ground", () => {
    const { store } = world();
    expect(store.tx((t) => bornVenture(t, { name: "N", kind: "channel", frame, proposal: "operator/n", ground: "operator" }, AGENT)).ok).toBe(false);
    expect(store.tx((t) => operatorVentureIn(t, { name: "N", tone: "t", audience: "a", format: "f", look: "l" }, AGENT)).ok).toBe(false);
    const v = must(store.tx((t) => operatorVentureIn(t, { name: "A Press", tone: "t", audience: "a", format: "f", look: "l" }, OP)));
    expect(v.id).toBe("vn-a-press");
    expect(v.channelId).toBeUndefined();
    const twin = store.tx((t) => operatorVentureIn(t, { name: "a  press", tone: "t", audience: "a", format: "f", look: "l" }, OP));
    expect(twin.ok ? "" : twin.error.message).toContain("is live venture vn-a-press's");
  });
});

describe("start and join", () => {
  const words = { name: "Toll Roads", tone: "dry", audience: "viewers", format: "a video", look: "cold light" };
  it("a proven production starts a venture and is in it; an unproven one is refused by name; an agent is refused", async () => {
    const { store } = world();
    const unproven = await produced(store, "accepted");
    const refused = store.tx((t) => startVentureIn(t, unproven, words, OP));
    expect(refused.ok ? "" : refused.error.message).toContain("no proven take");
    const id = await produced(store, "proven");
    expect(store.tx((t) => startVentureIn(t, id, words, AGENT)).ok).toBe(false);
    const { venture, production } = must(store.tx((t) => startVentureIn(t, id, words, OP)));
    expect(production.ventureId).toBe(venture.id);
    expect(venture.proposal).toBe(`production/${id}`);
  });

  it("join sets the venture once, for a live venture only; joining it again is a no-op; another is refused", async () => {
    const { store } = world();
    must(importChannels(store, SEVEN, OP));
    const id = await produced(store, "proven");
    expect(store.tx((t) => joinVentureIn(t, id, "vn-while-it-works", AGENT)).ok).toBe(false);
    must(store.tx((t) => joinVentureIn(t, id, "vn-while-it-works", OP)));
    expect(must(store.read((r) => readProduction(r, id)))?.ventureId).toBe("vn-while-it-works");
    must(store.tx((t) => joinVentureIn(t, id, "vn-while-it-works", OP)));
    const other = store.tx((t) => joinVentureIn(t, id, "vn-small-night-stories", OP));
    expect(other.ok ? "" : other.error.message).toContain("is already in vn-while-it-works");
    const p = must(store.read((r) => readProduction(r, id)));
    expect(p === undefined ? "" : ventureRefusalOf(p)).toContain("already in");
  });
});

describe("lessons", () => {
  it("one job is enqueued by the Board's approval, and a redelivery enqueues no second; the seat's fake writes the proposals, drawn from the record", async () => {
    const { store, location } = world();
    const id = await produced(store, "cutting");
    const adapter = makeFinalAdapter({ store: () => ({ ok: true, value: store }) });
    const v1 = must(await adapter.read({ runId: `${id}/cut-1` }));
    const plan = must(adapter.packet(v1));
    const committed = { packet: plan.packet, packetId: plan.packet.id, decisions: [{ key: `${plan.packet.id}::final`, verdict: "keep", reasons: ["the hold works"], at: "2026-11-09T00:00:00.000Z", by: "operator" as const }], outcome: { act: "commit" as const } };
    must(await adapter.apply(committed as never));
    must(await adapter.apply(committed as never));
    expect(must(queryEvents(store, { type: ["production.lessons-requested"], limit: 5 })).events.length).toBe(1);
    const jobId = must(store.read((r) => castJobsOf(r, id)))["lessons"] ?? "";
    must(await driveLessons(store, location, jobId, { engines: { seat: fakeSeat(answering) } }));
    const lessons = must(store.read((r) => lessonsOf(r, id)));
    expect(lessons.map((l) => [l.dimension, l.state])).toEqual([["beats", "proposed"], ["art-style", "nothing"], ["technique", "proposed"]]);
    expect(lessons[0]?.drawnFrom[0]?.ref).toBe("note:cut-1");
    expect(lessons[0]?.drawnFrom[0]?.words).toContain("the hold works");
  });

  it("a seat that cites evidence the production does not hold fails the turn, and the panel has no half-written lessons", async () => {
    const { store, location } = world();
    const id = await produced(store, "done");
    const jobId = await enqueueLive(store, id);
    const seat = fakeSeat(() => ({ lessons: [{ dimension: "beats", text: "An invented claim about pacing here.", drawnFrom: ["take:never"] }] }));
    await driveLessons(store, location, jobId, { engines: { seat } });
    expect(must(store.read((r) => lessonsOf(r, id)))).toEqual([]);
    expect(must(get(store, jobId as never)).job.state).toBe("failed");
    expect(proposalsOf({ lessons: [{ dimension: "beats", text: "x" }] }, []).ok).toBe(false);
  });

  it("the operator edits and accepts; an agent cannot; nothing cannot be accepted; a dry stand-in cannot be accepted", async () => {
    const { store, location } = world();
    const id = await produced(store, "done");
    must(await driveLessons(store, location, await enqueueLive(store, id), { engines: { seat: fakeSeat(answering) } }));
    const beats = lessonIdOf("beats");
    expect(store.tx((t) => acceptLessonIn(t, id, beats, undefined, AGENT)).ok).toBe(false);
    expect(store.tx((t) => editLessonIn(t, id, beats, "x", AGENT)).ok).toBe(false);
    const nothing = store.tx((t) => acceptLessonIn(t, id, lessonIdOf("art-style"), undefined, OP));
    expect(nothing.ok ? "" : nothing.error.message).toContain("held nothing");
    must(store.tx((t) => editLessonIn(t, id, beats, "Hold on the gate until the silence lands.", OP)));
    const accepted = must(await acceptLesson(store, id, beats, undefined, OP));
    expect(accepted.state).toBe("accepted");
    expect(accepted.text).toBe("Hold on the gate until the silence lands.");
    expect(accepted.proposedText).toBe("Hold on the gate until the pause does the work.");
    expect(accepted.drawnFrom.length).toBeGreaterThan(0);
    const edited = store.tx((t) => editLessonIn(t, id, beats, "later edit", OP));
    expect(edited.ok ? "" : edited.error.message).toContain("is accepted and fixed");

    const dryId = await produced(store, "done");
    const launch = must(requestLessons(store, dryId, { mode: "dry", by: "op", actor: OP, dryOnly: false }));
    if (launch.kind !== "receipt") throw new Error("no receipt");
    const launched = must(requestLessons(store, dryId, { mode: "dry", by: "op", actor: OP, dryOnly: false, token: launch.receipt.token }));
    if (launched.kind !== "launched") throw new Error("no launch");
    must(await driveLessons(store, location, launched.jobId));
    const dryLesson = must(store.read((r) => lessonsOf(r, dryId)))[0];
    expect(dryLesson?.dry).toBe(true);
    const refused = await acceptLesson(store, dryId, lessonIdOf("beats"), undefined, OP);
    expect(refused.ok ? "" : refused.error.message).toContain("dry stand-in");
  });

  it("nothing is proposed before done, and a production already holding lessons refuses another job", async () => {
    const { store } = world();
    const early = await produced(store, "cutting");
    const r = store.tx((t) => proposeLessonsIn(t, early, [{ dimension: "beats", text: "x", drawnFrom: [{ ref: "a", words: "b" }] }], false, OP));
    expect(r.ok ? "" : r.error.message).toContain("only once the Board");
    const id = await produced(store, "done");
    must(store.tx((t) => proposeLessonsIn(t, id, [{ dimension: "beats", text: "x", drawnFrom: [{ ref: "a", words: "b" }] }], false, OP)));
    const again = requestLessons(store, id, { mode: "dry", by: "op", actor: OP, dryOnly: false });
    expect(again.ok ? "" : again.error.message).toContain("already has its proposals");
  });

  it("an accepted lesson reaches the process's taste brief, per project, and queues one registry lead; accepting again queues no second", async () => {
    const pk = must(processKernel());
    const store = pk.store;
    must(importChannels(store, SEVEN, OP));
    const id = await produced(store, "done", { kind: "episode", ref: "F1-01" });
    // Episode-sourced with no venture: it files under its channel.
    must(store.tx((t) => proposeLessonsIn(t, id, [{ dimension: "technique", text: "A locked camera survives the handoff.", drawnFrom: [{ ref: "take:take-1", words: "take-1 proven" }] }], false, { kind: "machine", id: "j" })));
    const noneYet = await tasteBrief();
    expect(noneYet).not.toContain(LESSONS_HEADING);
    must(await acceptLesson(store, id, lessonIdOf("technique"), undefined, OP));
    const brief = await tasteBrief();
    expect(brief).toContain(LESSONS_HEADING);
    expect(brief).toContain("### F1 While It Works");
    expect(brief).toContain("A locked camera survives the handoff.");
    expect(pendingOf(await readQueue()).filter((e) => e.kind === "lesson-technique").map((e) => e.key)).toEqual([leadKey("lesson-technique", `${id}/technique`)]);
    must(await acceptLesson(store, id, lessonIdOf("technique"), undefined, OP));
    expect(pendingOf(await readQueue()).filter((e) => e.kind === "lesson-technique").length).toBe(1);
    const lesson = must(store.read((r) => lessonsOf(r, id)))[0];
    expect(lesson === undefined ? "" : leadRefOf(lesson)).toBe(`${id}/technique`);
  });

  it("the section groups by venture before channel, and a lesson with no project is left out", () => {
    const row = (title: string, ventureId?: string, source = { kind: "outline" as const, ref: "o" }) => ({
      lesson: { id: "lesson-beats", productionId: "prdn:a", dimension: "beats" as const, state: "accepted" as const, text: `lesson of ${title}`, drawnFrom: [{ ref: "a", words: "b" }], proposedAt: "2026-11-09T00:00:00.000Z" },
      production: { id: "prdn:a", title, source, stage: "done" as const, board: { logline: "l", aspect: "16:9" as const, panels: [] }, takes: [], roles: [], startedAt: "x", startedBy: "o", ...(ventureId === undefined ? {} : { ventureId }) } as never,
    });
    const ventures = [{ id: "vn-a", name: "Alpha", proposal: "channel/F1", channelId: "F1", kind: "channel", frame: { tone: "", audience: "", format: "", look: "", genres: [] }, bornAt: "x", by: "o" }] as never;
    const section = lessonsSection({ rows: [row("One", "vn-a"), row("Orphan")] as never, ventures }, new Map([["F1", "While It Works"]]));
    expect(section.join("\n")).toContain("### F1 While It Works");
    expect(section.join("\n")).toContain("lesson of One");
    expect(section.join("\n")).not.toContain("Orphan");
    expect(lessonsSection({ rows: [], ventures: [] }, new Map())).toEqual([]);
  });

  it("no accepted lesson is no section, and an unreadable store says so instead of reading as none", async () => {
    expect(await tasteLessons({ rows: [], ventures: [] })).toEqual([]);
    const bad = await tasteLessons({ get rows() { throw new Error("gone"); }, ventures: [] } as never);
    expect(bad.join("\n")).toContain("did not read");
  });

  it("the job is registered, and a lead queued by another route is not disturbed", async () => {
    expect([...must(producers()).keys()].some((k) => String(k).includes("production-lessons"))).toBe(true);
    const added = await queueEvents([{ key: leadKey("source-rich", "https://x.test/y"), kind: "source-rich", night: "2026-11-01", refs: ["r"], evidence: ["e"] }]);
    expect(added.length).toBe(1);
  });

  it("an enqueue on a kernel whose job table is live is not double-counted, and DRY modes never reach a live seat", async () => {
    const { store } = world();
    const id = await produced(store, "done");
    must(store.tx((t) => enqueueIn(t, { id: "job:unrelated:1", of: { kind: "run", id: "x" }, producer: "production-cast", lane: "seat.text", mode: DRY }, OP)));
    const jobId = await enqueueLive(store, id);
    expect(jobId).toContain(`:${id}:1`);
    expect(must(queryEvents(store, { type: ["production.lessons-requested"], limit: 5 })).events.length).toBe(1);
  });
});
