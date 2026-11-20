import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addNote, notesBrief, notesFile, readNotes, removeNote, setRoundGoal } from "../../lib/foundry/scout/notes.ts";
import { step, type ReelInfo } from "../../app/(studio)/scout/canvas/_port/reelRoad.ts";

// The operator's notes for the next scouting (docs/scout-canvas-port.md, case b): stored beside the nights, carried
// into the next night's taste.md, and never read as "no notes" when the file is damaged. And the fixture side's reel
// road (Phase 4 is the real one): brief -> decide -> run -> slot, as a state machine.

let dir = "";
let was: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "scout-notes-"));
  was = process.env["SCOUT_STORE_DIR"];
  process.env["SCOUT_STORE_DIR"] = dir;
});

afterEach(() => {
  if (was === undefined) delete process.env["SCOUT_STORE_DIR"];
  else process.env["SCOUT_STORE_DIR"] = was;
  rmSync(dir, { recursive: true, force: true });
});

describe("scout notes", () => {
  it("reads an absent file as no notes and no goal", async () => {
    expect(await readNotes()).toEqual({ notes: [], goal: { text: "", targets: [] } });
    expect(notesBrief(await readNotes())).toBe("");
  });

  it("pins, lists and removes a note; the brief carries it under Operator notes", async () => {
    const a = await addNote({ kind: "genre", key: "video:kids/comedy", name: "kids / comedy", text: "  try animals  ", stance: "turn" }, "operator", new Date("2026-11-20T01:00:00Z"));
    if (!a.ok) throw new Error(a.error.message);
    expect(a.value.notes).toHaveLength(1);
    expect(a.value.notes[0]).toMatchObject({ text: "try animals", stance: "turn", by: "operator", at: "2026-11-20T01:00:00.000Z" });
    const g = await setRoundGoal({ text: "Two K1 storyboards ready to cut.", targets: [{ channel: "K1", n: 2 }, { channel: "D2", n: 0 }] });
    expect(g.ok).toBe(true);
    const brief = notesBrief(await readNotes());
    expect(brief).toContain("## Operator notes");
    expect(brief).toContain("- K1: 2 episodes");
    expect(brief).not.toContain("D2");
    expect(brief).toContain("- genre **kids / comedy** — a new angle: try animals");
    const id = a.value.notes[0]?.id ?? "";
    const r = await removeNote(id);
    expect(r.ok && r.value.notes).toEqual([]);
  });

  it("refuses an empty note and a note it cannot find", async () => {
    const empty = await addNote({ kind: "basin", key: "song", name: "Songs", text: "  ", stance: "" }, "operator");
    expect(empty.ok).toBe(false);
    const gone = await removeNote("n-nope");
    expect(!gone.ok && gone.error.code).toBe("not-found");
  });

  it("throws on a damaged file instead of reading it as no notes", async () => {
    writeFileSync(notesFile(), "{ not json", "utf8");
    await expect(readNotes()).rejects.toThrow(/scout notes/);
  });
});

describe("the reel road (fixture side)", () => {
  const reel: ReelInfo = { node: "out:n/c-01", kind: "reel-cut", label: "Rice", channel: "D1", ep: { id: "D1-01", channel: "D1", title: "The Rice Race", logline: "l", beats: ["Hook: two bowls", "b", "c", "d", "End: level"], spec: "s", state: "kept", at: "t" } };
  const reels = new Map([[reel.node, reel]]);

  it("drafts a brief from the episode, runs the cut, and slots it on the channel at the cadence", () => {
    const b = step({ audio: {}, slots: [] }, { verb: "brief", nodes: [reel.node] }, reels);
    if (!b.ok) throw new Error(b.error.message);
    expect(b.value.audio[reel.node]).toMatchObject({ step: 1, brief: { vo: ["two bowls", "level"], dur: 45 } });
    const r = step(b.value, { verb: "run", nodes: [reel.node], toCalendar: true, cadence: 2 }, reels);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.audio[reel.node]?.step).toBe(5);
    expect(r.value.slots).toEqual([{ id: `slot:${reel.node}`, node: reel.node, channel: "D1", day: 1, time: "17:00", state: "scheduled", title: "The Rice Race" }]);
    const c = step(r.value, { verb: "cancel", slot: `slot:${reel.node}` }, reels);
    expect(c.ok && c.value.audio[reel.node]?.step).toBe(4);
    expect(c.ok && c.value.slots).toEqual([]);
  });

  it("fixes the choice once audio is generated, and refuses a reel it does not know", () => {
    const fixed = step({ audio: { [reel.node]: { step: 4 } }, slots: [] }, { verb: "decide", node: reel.node, decision: { voice: "none", music: "score", sound: "none" } }, reels);
    expect(!fixed.ok && fixed.error.code).toBe("conflict");
    const unknown = step({ audio: {}, slots: [] }, { verb: "brief", nodes: ["out:n/c-99"] }, reels);
    expect(!unknown.ok && unknown.error.code).toBe("not-found");
  });
});
