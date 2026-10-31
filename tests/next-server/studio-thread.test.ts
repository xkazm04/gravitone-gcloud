// THE THREAD COMPOSITION'S PLACES (spark suno-advisor, S1 composition "thread") over the scripted
// night-drive session: a card keeps the agent's order (its prompt above its audio when shown first,
// below when shown after), a verdict reads as chips naming the version, the take, the call, what is off
// and the uploaded file, a track is a take with facts only when it answers a prompt `as: "suno"` and was
// measured, a proposal already kept is drawn once as kept, a card is named by its prompt version, and
// a carried prompt knows the answer it came from.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { FIXTURE_TAKES, NIGHT_DRIVE_TAKE } from "../../app/(studio)/audio/studio/_port/fixtureSessions.ts";
import { readFixture } from "../../app/(studio)/audio/studio/_port/fixture.ts";
import { cardPieces, cardTitle } from "../../app/(studio)/audio/studio/_view/model.ts";
import { answerNumber, keptOfProposals, promptLeads, takeFactsOf, verdictChips, versionName } from "../../app/(studio)/audio/studio/_view/thread.ts";

const TAKES = { calm: "st-calm", "calm-vital-bass": "st-cvb", hiphop: "st-hh", "hiphop-felt-piano": "st-hfp", synth: "st-syn" };
const night = readFixture({ takes: TAKES }).sessions.find((s) => s.id === "night-drive");
if (night === undefined) throw new Error("no night-drive session");
const turns = night.turns;
const turn = (id: string) => {
  const t = turns.find((x) => x.turn.id === id)?.turn;
  if (t === undefined) throw new Error(`no turn ${id}`);
  return t;
};
const track = (turnId: string, id: string): StudioNodeOf<"track"> => {
  const n = turn(turnId).show.find((x) => x.id === id);
  if (n?.kind !== "track") throw new Error(`no track ${id}`);
  return n;
};

describe("the agent's order", () => {
  it("a prompt shown before its sketch stands above the timeline; one shown after the take, below it", () => {
    expect(promptLeads(turn("nd-a1"))).toBe(true);
    expect(promptLeads(turn("nd-a2"))).toBe(false);
  });

  it("a turn with no prompt never leads with one", () => {
    expect(promptLeads(turn("nd-a3"))).toBe(false);
  });

  it("a prompt with no audio beside it leads", () => {
    expect(promptLeads({ show: turn("nd-a1").show.filter((n) => n.kind !== "track") })).toBe(true);
  });
});

describe("cards", () => {
  it("a card is named by the prompt version it shows, else by its taste proposals", () => {
    expect(cardTitle(turn("nd-a1"))).toBe("Neon Overpass · p1");
    expect(cardTitle(turn("nd-a2"))).toBe("Neon Overpass · p2");
    expect(cardTitle(turn("nd-a3"))).toBe("taste: 3 lines to keep");
  });

  it("a version with no name is its id", () => {
    expect(versionName({ promptId: "p9" })).toBe("p9");
  });

  it("the living prompt carries into the taste card, marked, and knows the answer it came from", () => {
    const desk = cardPieces(turns, "nd-a3");
    expect(desk.suno_prompt.map((p) => [p.node.promptId, p.turnId, p.carried])).toEqual([["p2", "nd-a2", true]]);
    expect(answerNumber(turns, "nd-a2")).toBe(2);
    expect(answerNumber(turns, "nd-u2")).toBeNull();
  });
});

describe("verdict chips", () => {
  it("name the version, the take, the call, what is off and the uploaded file", () => {
    expect(verdictChips(turn("nd-u2"), turns, FIXTURE_TAKES)).toEqual({ version: "Neon Overpass · p1", clip: "a", call: "drop", off: ["tempo", "vocals"], take: "Neon Overpass (a).mp3" });
  });

  it("a keep on both takes with no file and nothing off", () => {
    expect(verdictChips(turn("nd-u3"), turns, FIXTURE_TAKES)).toEqual({ version: "Neon Overpass · p2", clip: "both", call: "keep", off: [], take: null });
  });

  it("an uploaded take with no facts yet is named by its id; an ask with no verdict has no chips", () => {
    expect(verdictChips(turn("nd-u2"), turns, {})?.take).toBe(NIGHT_DRIVE_TAKE);
    expect(verdictChips(turn("nd-u1"), turns, FIXTURE_TAKES)).toBeNull();
  });
});

describe("take facts", () => {
  it("only a track answering a prompt as the person's Suno take carries facts", () => {
    expect(takeFactsOf(track("nd-a2", "take-a"), FIXTURE_TAKES)?.takeId).toBe(NIGHT_DRIVE_TAKE);
    expect(takeFactsOf(track("nd-a1", "sketch"), FIXTURE_TAKES)).toBeNull();
    // Even when the sketch's own take id has facts: a sketch is never a Suno take.
    const sketch = track("nd-a1", "sketch");
    const facts = FIXTURE_TAKES[NIGHT_DRIVE_TAKE];
    if (sketch.takeId === undefined || facts === undefined) throw new Error("fixture changed");
    expect(takeFactsOf(sketch, { [sketch.takeId]: facts })).toBeNull();
  });

  it("a take not measured yet has none", () => {
    expect(takeFactsOf(track("nd-a2", "take-a"), {})).toBeNull();
  });
});

describe("taste", () => {
  it("a proposal already kept (any case) is drawn once, as kept; other kept lines stay in the profile", () => {
    const rows = [{ line: "Clear upfront female vocal" }, { line: "half-time synthwave drums" }];
    const kept = [
      { line: "clear upfront female vocal ", lean: "like" as const, since: "2026-10-28T18:07:00Z" },
      { line: "heavy autotune", lean: "dislike" as const, since: "2026-10-21T20:14:00Z" },
    ];
    expect(keptOfProposals(rows, kept).map((k) => k.line)).toEqual(["clear upfront female vocal "]);
  });
});
