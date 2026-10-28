// THE STUDIO HOST'S SERVER SIDE AND DRIVER (spark audio-agent-studio WP1): the fixture port resolves
// {{key}} tokens and passes every turn through the agent's door, and says so when renders are
// missing (hrefs still holding a token are removed, the door drops what cannot stand); the scripted
// conversation answers only what the script answers; a press plays the layers it names.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readFixture, stripUnresolved } from "../../app/(studio)/audio/studio/_port/fixture.ts";
import { answers, openingCursor, replyCursor, visibleTurn } from "../../app/(studio)/audio/studio/_host/conversation.ts";
import { localMix, localPlay, nodeSound, soundKey, soundOf, spansOf } from "../../app/(studio)/audio/studio/_host/press.ts";
import { parseStudioUrl, studioHref } from "../../app/(studio)/audio/studio/url.ts";

const TAKES = { calm: "st-calm", "calm-vital-bass": "st-cvb", hiphop: "st-hh", "hiphop-felt-piano": "st-hfp", synth: "st-syn" };

describe("the fixture port", () => {
  it("with every render indexed: ready, no token left, the door drops only the two pieces broken on purpose", () => {
    const r = readFixture({ takes: TAKES });
    expect(r.renders).toBe("ready");
    expect(r.note).toBeUndefined();
    expect(r.sessions.map((s) => s.id)).toEqual(["study-bed", "vlog-beat", "game-menu"]);
    expect(JSON.stringify(r.sessions)).not.toContain("{{");
    expect(JSON.stringify(r.sessions)).toContain("/api/sound/takes/st-calm/file?stem=bass");
    expect(r.sessions.flatMap((s) => s.turns.flatMap((t) => t.dropped.map((d) => `${s.id} ${d.at}`)))).toEqual(["vlog-beat show[4]", "vlog-beat actions[4]"]);
  });

  it("with no index: missing, a note naming the command, and the pieces that need audio dropped and said", () => {
    const r = readFixture({ missing: "no fixture renders yet" });
    expect(r.renders).toBe("missing");
    expect(r.note).toContain("npm run studio:fixtures");
    expect(JSON.stringify(r.sessions)).not.toContain("{{");
    const first = r.sessions[0]?.turns[1];
    expect(first?.turn.show.map((n) => n.kind)).toEqual(["heard", "sections"]);
    expect(first?.dropped.map((d) => d.kind)).toEqual(["track", "stems", "pull", "play", "settle_pull"]);
  });

  it("an index missing one key: missing, naming the key; the others resolve", () => {
    const { synth: _gone, ...rest } = TAKES;
    const r = readFixture({ takes: rest });
    expect(r.renders).toBe("missing");
    expect(r.note).toContain("synth");
    expect(JSON.stringify(r.sessions[0])).toContain("st-calm");
  });

  it("strips a tokened href and takeId, keeps everything else", () => {
    expect(stripUnresolved({ a: [{ href: "/x/{{k}}", durationS: 2 }], takeId: "{{k}}", label: "{{k}}" })).toEqual({ a: [{ durationS: 2 }], label: "{{k}}" });
  });
});

describe("the scripted conversation", () => {
  const study = readFixture({ takes: TAKES }).sessions[0]?.turns ?? [];
  it("opens through the first agent reply", () => {
    expect(openingCursor(study)).toBe(2);
    expect(visibleTurn(study, 2)?.turn.id).toBe("s1-a1");
  });
  it("answers the action the next user turn names, and its words in any case", () => {
    expect(answers(study, 2, { action: "s1-p3" })).toBe(true);
    expect(answers(study, 2, { action: "s1-p2" })).toBe(false);
    expect(answers(study, 2, { text: "  The bass is a BIT too much,   make it softer " })).toBe(true);
    expect(answers(study, 2, { text: "louder please" })).toBe(false);
    expect(answers(study, 2, { text: "" })).toBe(false);
  });
  it("the reply joins after the user turn; the script's end answers nothing", () => {
    expect(replyCursor(study, 3)).toBe(4);
    expect(visibleTurn(study, 3)?.turn.id).toBe("s1-a1");
    expect(answers(study, study.length, { action: "s1-p10" })).toBe(false);
    expect(replyCursor(study, study.length)).toBe(study.length);
  });
});

describe("what a press plays", () => {
  const sessions = readFixture({ takes: TAKES }).sessions;
  const a1 = sessions[0]?.turns[1]?.turn;
  const menu = sessions[2]?.turns[1]?.turn;
  it("a stems piece plays every stem with audio, as one sound", () => {
    if (a1 === undefined) throw new Error("fixture");
    const stems = a1.show.find((n) => n.kind === "stems");
    if (stems === undefined) throw new Error("fixture");
    const s = nodeSound(a1, stems);
    expect(s?.key).toBe(soundKey("s1-a1", "stems"));
    expect(s?.layers.map((l) => l.href)).toEqual(["drums", "bass", "chords", "lead"].map((r) => `/api/sound/takes/st-calm/file?stem=${r}`));
    expect(nodeSound(a1, stems, "bass")?.layers.map((l) => l.id)).toEqual(["bass"]);
    expect(soundOf(a1, localPlay("track"))?.layers).toEqual([{ id: "mix", href: "/api/sound/takes/st-calm/file" }]);
  });
  it("the illustrative eight-stem arrangement plays its four real stems, entering by section at 112 bpm", () => {
    if (menu === undefined) throw new Error("fixture");
    const stems = menu.show.find((n) => n.kind === "stems");
    if (stems === undefined) throw new Error("fixture");
    const s = nodeSound(menu, stems);
    expect(s?.layers.map((l) => l.id)).toEqual(["drums", "bass", "chords", "lead"]);
    expect(s?.layers[3]).toMatchObject({ mix: { levelDb: -2 }, enters: [false, true, true, false] });
    expect(spansOf(menu)?.[1]?.startS).toBeCloseTo((2 * 4 * 60) / 112, 6);
  });
  it("hear names the candidate's own audio; one that offers none plays nothing", () => {
    const vlog = sessions[1]?.turns[1]?.turn;
    if (vlog === undefined) throw new Error("fixture");
    expect(soundOf(vlog, { id: "x", kind: "hear", label: "x", node: "keys-options", candidate: "sample-felt-piano", mode: "in_mix" })?.layers[0]?.href).toBe("/api/sound/takes/st-hfp/file");
    expect(soundOf(vlog, { id: "x", kind: "hear", label: "x", node: "keys-options", candidate: "sample-grand-piano", mode: "in_mix" })).toBeNull();
  });
  it("a variant's own mixer press is a local action", () => {
    expect(localMix("bass", { muted: true })).toMatchObject({ kind: "mute", stem: "bass", on: true });
    expect(localMix("bass", { db: -3 })).toMatchObject({ kind: "level", db: -3 });
  });
});

describe("the studio's address", () => {
  it("defaults to desk and the first session; an unknown variant reads as desk", () => {
    expect(parseStudioUrl({ s: "studio" })).toEqual({ variant: "desk", session: null, offline: false });
    expect(parseStudioUrl({ v: "nope", session: "vlog-beat", agent: "offline" })).toEqual({ variant: "desk", session: "vlog-beat", offline: true });
    expect(studioHref({ variant: "stage", session: "game-menu", offline: true })).toBe("/audio?s=studio&v=stage&session=game-menu&agent=offline");
  });
});
