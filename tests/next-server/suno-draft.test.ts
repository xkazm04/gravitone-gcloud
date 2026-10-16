// THE SUNO DRAFT DOOR (lib/producers/suno.ts `launchSunoDraft`, lib/sound/suno/draft.ts; L52)
// over a real kernel in a temp file and a temp sound store. What the door adds to `launchJobs`:
//   · a receipt writes nothing - no proposal, no record, no job;
//   · the record is written under the receipt's job id, the proposal under the id derived from it,
//     and a second confirm of the same draft never drafts again;
//   · THE RACE: a queue that moves AFTER the pre-check and BEFORE the kernel transaction (while
//     the record is being written) answers stale and takes the record back out, so a v1 Start -
//     which launches every queued record with no job - cannot pick up a draft nobody confirmed.
//     The window is made deterministic: the confirm is started, and before its first await
//     resolves another launch lands synchronously on box.chrome.
// Nothing spends: every job is dry, no worker runs, the sentence stands in for the text turn.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ROOT = vi.hoisted(() => {
  const fs = process.getBuiltinModule("node:fs");
  const os = process.getBuiltinModule("node:os");
  const path = process.getBuiltinModule("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gt-l52-suno-"));
  process.env["SOUND_STORE_DIR"] = path.join(dir, "sound");
  return dir;
});

import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

import type { Actor } from "@gt/domain/event";
import { list } from "@gt/kernel/job";
import { openKernel } from "@gt/kernel/kernel";

import { launchNow } from "../../lib/producers/sound.ts";
import { launchSunoDraft, sunoLine } from "../../lib/producers/suno.ts";
import type { SunoJob } from "../../lib/suno/types.ts";
import { draftJobId, proposalIdOf, sentenceStand } from "../../lib/sound/suno/draft.ts";

const k = openKernel(path.join(ROOT, "store.sqlite"));
if (!k.ok) throw k.error;
const store = k.value.store;
afterAll(() => {
  k.value.close();
  rmSync(ROOT, { recursive: true, force: true });
});

const actor: Actor = { kind: "operator", id: "op-test" };
const o = { mode: "dry" as const, actor, dryOnly: true, store };
const suno = (): { proposals: { id: string }[]; jobs: { id: string; job?: string }[] } => {
  try {
    return JSON.parse(readFileSync(path.join(ROOT, "sound", "suno.json"), "utf8"));
  } catch {
    return { proposals: [], jobs: [] };
  }
};
const jobs = (): string[] => {
  const r = list(store);
  if (!r.ok) throw r.error;
  return r.value.map((j) => j.id);
};

describe("a Suno take from a draft", () => {
  it("a receipt writes nothing; the confirm drafts under the receipt's id, once", async () => {
    const id = draftJobId("t-one");
    const src = { kind: "fields" as const, fields: { title: "Whisper network", style: "chamber, plucked strings, 108 bpm", lyrics: "[Instrumental]" } };
    const r = await launchSunoDraft(id, src, o);
    if (r.kind !== "receipt") throw new Error(r.kind);
    expect(r.receipt.lines.map((l) => l.label)).toEqual(["Whisper network"]);
    expect(suno().jobs).toEqual([]);
    expect(jobs()).toEqual([]);
    const c = await launchSunoDraft(id, src, { ...o, token: r.receipt.token });
    expect(c.kind).toBe("launched");
    expect(suno().proposals.map((p) => p.id)).toEqual([proposalIdOf(id)]);
    expect(suno().jobs).toMatchObject([{ id, job: `job:run:suno.${id}` }]);
    // Again: the record and the proposal are found, not drafted a second time.
    await launchSunoDraft(id, src, { ...o, token: r.receipt.token });
    expect(suno().proposals).toHaveLength(1);
    expect(suno().jobs).toHaveLength(1);
  });

  it("a queue that moves while the record is written answers stale and takes the record back out", async () => {
    const id = draftJobId("t-race");
    const src = { kind: "sentence" as const, text: "A bed that holds a full minute." };
    const r = await launchSunoDraft(id, src, o);
    if (r.kind !== "receipt") throw new Error(r.kind);
    // The confirm passes its pre-check synchronously, then awaits the record write...
    const confirming = launchSunoDraft(id, src, { ...o, token: r.receipt.token });
    // ...and in that window another launch lands on box.chrome.
    const other: SunoJob = { id: "sj-t-other", proposalId: "sp-t-other", fields: { style: "another" }, lane: { axis: "group", value: "x" }, state: "queued", models: ["v6"], enqueuedAt: 0, clipIds: [] };
    launchNow({ producer: "suno", media: "audio", lines: [sunoLine(other)] }, o);
    const c = await confirming;
    expect(c.kind).toBe("stale");
    expect(suno().jobs.some((j) => j.id === id)).toBe(false);
    expect(jobs()).not.toContain(`job:run:suno.${id}`);
  });

  it("the dry stand-in is the sentence as written, instrumental, held to Suno's limits", () => {
    expect(sentenceStand("  A bed that holds a full minute under the narrator…  ")).toEqual({ title: "A bed that holds a full", style: "A bed that holds a full minute under the narrator", lyrics: "[Instrumental]" });
    expect(() => sentenceStand("   ")).toThrow(/first sentence/);
    expect(() => draftJobId("")).toThrow();
    expect(() => proposalIdOf("sp-1")).toThrow();
  });
});
