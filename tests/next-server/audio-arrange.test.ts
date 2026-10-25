// THE AUDIO DESK'S ARRANGE DOOR (lib/sound/arrange.ts) through the REAL sound store in a temp
// dir and a kernel in memory: a move lands with one ledger event and a retry records nothing
// new; a stale gesture and a label-less finalize are refused with the store untouched; a group
// rename carries every take in one transaction; a Suno return becomes the stack's next version
// and a retried upload finds the take it filed.
//
// SOUND_LEDGER_PATH is a temp file: pipeline/sound/ledger.json is git-tracked and another
// session owns it, and every kept-take patch re-syncs its row.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-audio-arrange-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  process.env["SOUND_LEDGER_PATH"] = path.join(dir, "ledger.json");
  return dir;
});

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Event } from "@gt/domain/event";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { editGroups, fileReturn, moveTake } from "../../lib/sound/arrange.ts";
import type { SoundTake } from "../../lib/sound/types.ts";

const SOUND = path.join(ROOT, "sound");
const NOW = new Date("2026-10-17T12:00:00.000Z");
const OP = { kind: "operator", id: "op" } as const;

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

const take = (id: string, over: Partial<SoundTake> = {}): SoundTake => ({
  id,
  kind: "music",
  title: `Take ${id}`,
  provider: "suno",
  op: "manual",
  origin: "lab",
  technique: [],
  prompt: `prompt ${id}`,
  negative: null,
  terms: { genre: ["ambient"], mood: ["calm"], instrument: ["piano"], sfxCategory: null },
  tempoBpm: null,
  key: null,
  durationS: 30,
  loop: null,
  file: null,
  peaks: null,
  measured: null,
  ratings: {},
  verdict: "kept",
  reasons: [],
  note: null,
  stage: "pending",
  group: "ambient",
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
  createdAt: "2026-10-10T00:00:00.000Z",
  judgedAt: "2026-10-10T00:00:00.000Z",
  finalizedAt: null,
  ...over,
});

function seed(takes: SoundTake[], groups = { music: ["ambient", "drone"], sfx: [] as string[] }): void {
  rmSync(SOUND, { recursive: true, force: true });
  mkdirSync(SOUND, { recursive: true });
  writeFileSync(path.join(SOUND, "takes.json"), JSON.stringify({ version: 1, takes }));
  writeFileSync(path.join(SOUND, "groups.json"), JSON.stringify({ version: 1, groups }));
}
const onDisk = (): SoundTake[] => (JSON.parse(readFileSync(path.join(SOUND, "takes.json"), "utf8")) as { takes: SoundTake[] }).takes;
const byId = (id: string): SoundTake | undefined => onDisk().find((t) => t.id === id);
function kernel(): Store {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  return k.value.store;
}
function ledger(s: Store): readonly Event[] {
  const r = queryEvents(s, { order: "asc", limit: 100 });
  if (!r.ok) throw r.error;
  return r.value.events;
}
const wav = { bytes: new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]), mime: "audio/wav", name: "return.wav" };

describe("a move", () => {
  it("lands on the head with one event; the same op again writes nothing new", async () => {
    seed([take("a")]);
    const k = kernel();
    const req = { id: "a", from: { stage: "pending" as const, group: "ambient" }, to: { stage: "remaster" as const, group: "drone" }, opId: "op0001" };
    const r = await moveTake(k, req, OP, NOW);
    expect(r.ok && [r.value.take.stage, r.value.take.group, r.value.already, r.value.recorded]).toEqual(["remaster", "drone", false, true]);
    expect(byId("a")?.stage).toBe("remaster");
    const again = await moveTake(k, req, OP, NOW);
    expect(again.ok && [again.value.already, again.value.recorded]).toEqual([true, false]);
    const evs = ledger(k).filter((e) => e.subject.kind === "take");
    expect(evs.map((e) => [e.type, e.subject.id, e.lane])).toEqual([["take.moved", "a", "audio"]]);
    expect(evs[0]?.data).toMatchObject({ from: { stage: "pending", group: "ambient" }, to: { stage: "remaster", group: "drone" } });
  });

  it("a stale gesture is refused with where the card is, and nothing is written", async () => {
    seed([take("a", { stage: "edit" })]);
    const k = kernel();
    const r = await moveTake(k, { id: "a", from: { stage: "pending", group: "ambient" }, to: { stage: "remaster", group: "ambient" }, opId: "op0002" }, OP, NOW);
    expect(r.ok ? null : [r.error.code, r.error.message]).toEqual(["conflict", "Take a moved since it was picked up: it is in edit · ambient"]);
    expect(byId("a")?.stage).toBe("edit");
    expect(ledger(k).filter((e) => e.subject.kind === "take")).toEqual([]);
  });

  it("finalize is refused without a label and admitted with one, as take.finalized", async () => {
    seed([take("a", { stage: "edit" })]);
    const k = kernel();
    const base = { id: "a", from: { stage: "edit" as const, group: "ambient" }, to: { stage: "finalized" as const, group: "ambient" } };
    const no = await moveTake(k, { ...base, opId: "op0003" }, OP, NOW);
    expect(no.ok ? null : [no.error.code, no.error.message]).toEqual(["refused", "a finalized take needs a library label"]);
    expect(byId("a")?.stage).toBe("edit");
    const yes = await moveTake(k, { ...base, label: "Ambient · calm", opId: "op0004" }, OP, NOW);
    expect(yes.ok && [yes.value.take.stage, yes.value.take.label, yes.value.take.finalizedAt]).toEqual(["finalized", "Ambient · calm", NOW.toISOString()]);
    expect(ledger(k).filter((e) => e.subject.kind === "take").map((e) => e.type)).toEqual(["take.finalized"]);
  });
});

describe("the rows", () => {
  it("a rename carries every take under the old name in one transaction, and records once", async () => {
    seed([take("a"), take("b", { parentId: "a" }), take("r", { verdict: "rejected", stage: null }), take("x", { group: "drone" })]);
    const k = kernel();
    const r = await editGroups(k, { kind: "music", op: { op: "rename", from: "ambient", to: "calm" }, opId: "op0005" }, OP, NOW);
    expect(r.ok && [r.value.groups.music, r.value.carried]).toEqual([["calm", "drone"], 3]);
    expect(onDisk().map((t) => [t.id, t.group])).toEqual([
      ["a", "calm"],
      ["b", "calm"],
      ["r", "calm"],
      ["x", "drone"],
    ]);
    const again = await editGroups(k, { kind: "music", op: { op: "rename", from: "ambient", to: "calm" }, opId: "op0005" }, OP, NOW);
    expect(again.ok && again.value.already).toBe(true);
    expect(ledger(k).filter((e) => e.type === "sound.groups.edited")).toHaveLength(1);
  });

  it("a held row is not deleted, and the refusal names what holds it", async () => {
    seed([take("a")]);
    const r = await editGroups(kernel(), { kind: "music", op: { op: "delete", name: "ambient" }, opId: "op0006" }, OP, NOW);
    expect(r.ok ? null : r.error.message).toBe("“ambient” holds 1 card");
  });
});

describe("the Suno round trip", () => {
  it("a returned file becomes the stack's next version, kept, in the stage it was dropped on", async () => {
    seed([take("a", { stage: "remaster", group: "drone" })]);
    const k = kernel();
    const r = await fileReturn(k, { headId: "a", stage: "edit", opId: "op0007", file: wav }, OP, NOW);
    expect(r.ok && [r.value.version, r.value.created, r.value.take.parentId, r.value.take.origin, r.value.take.verdict, r.value.take.stage, r.value.take.group]).toEqual([2, true, "a", "suno-return", "kept", "edit", "drone"]);
    const again = await fileReturn(k, { headId: "a", stage: "edit", opId: "op0007", file: wav }, OP, NOW);
    expect(again.ok && [again.value.version, again.value.created]).toEqual([2, false]);
    expect(onDisk()).toHaveLength(2);
    expect(ledger(k).filter((e) => e.type === "take.returned")).toHaveLength(1);
  });

  it("is refused two stages on, onto an old version, and into finalized without a label", async () => {
    seed([take("a", { stage: "remaster" }), take("b", { parentId: "a", stage: "remaster" })]);
    const k = kernel();
    const far = await fileReturn(k, { headId: "b", stage: "finalized", opId: "op0008", file: wav }, OP, NOW);
    expect(far.ok ? null : far.error.code).toBe("invalid");
    const old = await fileReturn(k, { headId: "a", stage: "remaster", opId: "op0009", file: wav }, OP, NOW);
    expect(old.ok ? null : old.error.code).toBe("conflict");
    seed([take("e", { stage: "edit" })]);
    const nolabel = await fileReturn(k, { headId: "e", stage: "finalized", opId: "op0010", file: wav }, OP, NOW);
    expect(nolabel.ok ? null : nolabel.error.message).toBe("a finalized take needs a library label");
    expect(onDisk()).toHaveLength(1);
  });

  it("two returns raced onto one head file one version; the other is refused as stale, nothing forked", async () => {
    seed([take("a", { stage: "remaster", group: "drone" })]);
    const k = kernel();
    // Two tabs (or two machines' drops) answer the same card at once, under different ops.
    const [x, y] = await Promise.all([
      fileReturn(k, { headId: "a", stage: "edit", opId: "op0011", file: wav }, OP, NOW),
      fileReturn(k, { headId: "a", stage: "edit", opId: "op0012", file: wav }, OP, NOW),
    ]);
    const outcomes = [x, y].map((r) => (r.ok ? `v${r.value.version}` : r.error.code)).sort();
    expect(outcomes).toEqual(["conflict", "v2"]);
    expect(onDisk().filter((t) => t.parentId === "a")).toHaveLength(1);
    expect(ledger(k).filter((e) => e.type === "take.returned")).toHaveLength(1);
  });
});
