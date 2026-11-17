// THE STUDIO VIEW'S PURE MODEL (spark audio-agent-studio, stage S2: canvas's frame, desk's pieces) over
// the real scripted sessions: turns fold into one card per answer (a pending card while an ask waits),
// the host's carry-over rule holds per card (the arrangement and what was heard carry until replaced,
// marked carried; choices and readings belong only to their turn), eight parts draw compact, a
// proposal says what it does from its resolved target, the ask gate tells the offline preview from
// nobody-listening-yet, and the registry covers the closed vocabulary's every kind.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { STUDIO_NODE_KINDS } from "@gt/domain/audio.studio.kinds";
import { releaseProblems } from "@gt/domain/release.problems";
import { fixturePort } from "../../app/(studio)/audio/_release/_port/fixture.ts";
import { readFixture } from "../../app/(studio)/audio/studio/_port/fixture.ts";
import { askBlockedWords, CARRY, cardPieces, cardsOf, cardTitle, compactLanes, doesWords, hasTimeline, resolverOf, stemLabel } from "../../app/(studio)/audio/studio/_view/model.ts";
import type { CardCtx } from "../../app/(studio)/audio/studio/_view/ctx.ts";
import { ReleaseCard, releaseHref } from "../../app/(studio)/audio/studio/_view/Release.tsx";
import { SINGLE, VIEW_REGISTRY } from "../../app/(studio)/audio/studio/_view/registry.tsx";

const TAKES = { calm: "st-calm", "calm-vital-bass": "st-cvb", hiphop: "st-hh", "hiphop-felt-piano": "st-hfp", synth: "st-syn" };
const sessions = readFixture({ takes: TAKES }).sessions;
const session = (id: string) => {
  const s = sessions.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no session ${id}`);
  return s;
};
const ids = <T extends { readonly node: { readonly id: string }; readonly turnId: string; readonly carried: boolean }>(xs: readonly T[]) => xs.map((p) => [p.node.id, p.turnId, p.carried]);

describe("cards", () => {
  it("one card per answer, each with the ask that opened it", () => {
    const cards = cardsOf(session("study-bed").turns);
    expect(cards.map((c) => [c.n, c.ask?.text, c.answer?.turn.id])).toEqual([
      [1, "something calm to study to, a bit hopeful, about a minute", "s1-a1"],
      [2, "the bass is a bit too much, make it softer", "s1-a2"],
      [3, "keep the smooth bass", "s1-a3"],
    ]);
  });

  it("an ask with no answer yet is a pending card carrying the next number", () => {
    const last = cardsOf(session("study-bed").turns.slice(0, 3)).at(-1);
    expect(last?.answer).toBeNull();
    expect(last?.n).toBe(2);
    expect(last?.key).toBe("pending:s1-u2");
  });

  it("a card is named by its take, else by what its choice is about", () => {
    const [a1, a2] = session("study-bed").turns.filter((t) => t.turn.from === "agent");
    expect(a1 && cardTitle(a1.turn)).toBe("Quiet Horizon Bed");
    expect(a2 && cardTitle(a2.turn)).toBe("choices: a softer low end");
  });

  it("a stem's name is found in an earlier turn when this one has no stems", () => {
    const turns = session("study-bed").turns;
    expect(stemLabel(turns, "s1-a2", "bass")).toBe("warm finger bass");
    expect(stemLabel(turns, "s1-a3", "bass")).toBe("smooth synth bass");
    expect(stemLabel(turns, "s1-a1", "nope")).toBeNull();
  });
});

describe("carry-over (the host rule, per card)", () => {
  it("track, sections, stems, heard and the Suno prompt carry; candidates, pull, duel, measures and taste do not", () => {
    expect(Object.entries(CARRY).filter(([, c]) => c).map(([k]) => k).sort()).toEqual(["heard", "sections", "stems", "suno_prompt", "track"]);
  });

  it("a choices-only answer keeps the arrangement and the sentence from the answer before, marked carried", () => {
    const p = cardPieces(session("study-bed").turns, "s1-a2");
    expect(ids(p.track)).toEqual([["track", "s1-a1", true]]);
    expect(ids(p.sections)).toEqual([["sections", "s1-a1", true]]);
    expect(ids(p.stems)).toEqual([["stems", "s1-a1", true]]);
    expect(ids(p.heard)).toEqual([["heard", "s1-a1", true]]);
    expect(ids(p.candidates)).toEqual([["bass-options", "s1-a2", false]]);
    expect(ids(p.duel)).toEqual([["bass-duel", "s1-a2", false]]);
    expect(ids(p.measures)).toEqual([["measures", "s1-a2", false]]);
    // The pull belonged to the first answer only.
    expect(p.pull).toEqual([]);
  });

  it("a turn that draws the arrangement again replaces it; what it did not redraw still carries", () => {
    const p = cardPieces(session("study-bed").turns, "s1-a3");
    expect(ids(p.track)).toEqual([["track", "s1-a3", false]]);
    expect(ids(p.stems)).toEqual([["stems", "s1-a3", false]]);
    expect(ids(p.heard)).toEqual([["heard", "s1-a1", true]]);
    expect(p.candidates).toEqual([]);
    expect(p.duel).toEqual([]);
    expect(p.measures).toEqual([]);
  });

  it("an older card is drawn as of its own answer, never from a later one", () => {
    const p = cardPieces(session("study-bed").turns, "s1-a1");
    expect(ids(p.track)).toEqual([["track", "s1-a1", false]]);
    expect(ids(p.pull)).toEqual([["mood", "s1-a1", false]]);
    expect(p.candidates).toEqual([]);
  });

  it("the second vlog answer keeps the first answer's sentence but not its instrument shelf", () => {
    const p = cardPieces(session("vlog-beat").turns, "s2-a2");
    expect(ids(p.heard)).toEqual([["heard", "s2-a1", true]]);
    expect(ids(p.track)).toEqual([["track", "s2-a2", false]]);
    expect(p.candidates).toEqual([]);
    expect(hasTimeline(p)).toBe(true);
  });
});

describe("eight parts", () => {
  it("draw compact from six parts on, roomy below", () => {
    const p = cardPieces(session("game-menu").turns, "s3-a1");
    expect(p.stems[0]?.node.rows.length).toBe(8);
    expect(compactLanes(8)).toBe(true);
    expect(compactLanes(6)).toBe(true);
    expect(compactLanes(5)).toBe(false);
    expect(compactLanes(4)).toBe(false);
  });
});

describe("words", () => {
  it("a proposal says what it does from its resolved target, not from its label", () => {
    const turns = session("study-bed").turns;
    const a2 = turns.find((t) => t.turn.id === "s1-a2")?.turn;
    if (a2 === undefined) throw new Error("no s1-a2");
    const r = resolverOf(a2, (id) => stemLabel(turns, a2.id, id));
    const cand = (node: string, id: string) => {
      const n = a2.show.find((x) => x.id === node);
      return n?.kind === "candidates" ? (n.rows.find((c) => c.id === id)?.name ?? null) : null;
    };
    expect(a2.actions.map((a) => doesWords(a, r, cand))).toEqual([
      'plays "Smooth Synth Bass" on its own here',
      'plays "Smooth Synth Bass" inside the song here',
      'asks the agent to use "Smooth Synth Bass"',
      'tells the agent you prefer "smooth synth bass"',
    ]);
    const g = session("game-menu").turns.find((t) => t.turn.id === "s3-a1")?.turn;
    if (g === undefined) throw new Error("no s3-a1");
    const rg = resolverOf(g, (id) => stemLabel(session("game-menu").turns, g.id, id));
    expect(g.actions.map((a) => doesWords(a, rg, () => null))).toEqual([
      'plays "Neon Grid Runner" here',
      'plays only "pulsing synth bass" when the parts play',
      'moves "answering echo tune" right here',
      'says to the agent: "loop B is a bit much, take something out"',
    ]);
  });

  it("an ask is held while the agent answers and in the offline preview, but waits (not held) when nobody listens yet", () => {
    expect(askBlockedWords("listening", "listening")).toBeNull();
    expect(askBlockedWords("thinking", "listening")).toMatch(/finish the last ask/);
    expect(askBlockedWords("offline", "listening")).toMatch(/cannot be sent/);
    expect(askBlockedWords("offline", "nobody")).toBeNull();
  });
});

describe("the registry", () => {
  it("realizes every kind of the closed vocabulary, each in a place", () => {
    expect(Object.keys(VIEW_REGISTRY).sort()).toEqual([...STUDIO_NODE_KINDS].sort());
    for (const k of STUDIO_NODE_KINDS) expect(typeof VIEW_REGISTRY[k].View).toBe("function");
  });
});

describe("the release piece (spark studio-to-release)", () => {
  const turns = session("night-drive").turns;
  const card = (id: string) => cardPieces(turns, id).release;

  it("is drawn once per card, belongs to its own answer, and never carries into a later one", () => {
    expect(SINGLE.has("release")).toBe(true);
    expect(CARRY.release).toBe(false);
    expect(ids(card("nd-a4"))).toEqual([["release", "nd-a4", false]]);
    expect(card("nd-a3")).toEqual([]);
  });

  it("opens the same conversation's package stage on its release", () => {
    expect(releaseHref({ releaseId: "rel-0000000000a1" }, { id: "night-drive", source: "fixture" })).toBe("/audio?s=studio&session=night-drive&source=fixture&stage=package&r=rel-0000000000a1");
    expect(releaseHref({ releaseId: "rel-0000000000a1" }, { id: "night-drive", source: "live" })).toBe("/audio?s=studio&session=night-drive&stage=package&r=rel-0000000000a1");
  });

  it("draws the title, kind, status and the three counts with spoken names, and the door to the package stage", () => {
    const placed = card("nd-a4")[0];
    if (placed === undefined) throw new Error("no release piece");
    const ctx = { v: { session: { id: "night-drive", source: "fixture" } } } as unknown as CardCtx;
    const html = renderToStaticMarkup(h(ReleaseCard, { placed, ctx }));
    expect(html).toContain('aria-label="release Dancing in the Static, pre-flight review"');
    for (const said of ["single", "Dancing in the Static", "draft", 'aria-label="2 blocks"', 'aria-label="2 warnings"', 'aria-label="4 pending proposals"']) expect(html).toContain(said);
    expect(html).toContain('href="/audio?s=studio&amp;session=night-drive&amp;source=fixture&amp;stage=package&amp;r=rel-0000000000a1"');
  });

  it("the scripted pre-flight card says what the release fixture holds: title, status, live problems and pending", async () => {
    const node = card("nd-a4")[0]?.node;
    const rec = (await fixturePort.read()).records.find((r) => r.release.id === node?.releaseId);
    if (node === undefined || rec === undefined) throw new Error("fixture changed");
    const problems = releaseProblems(rec.release);
    expect(rec.sessionId).toBe("night-drive");
    expect({ title: node.title, status: node.status, blocks: node.blocks, warns: node.warns, pending: node.pending }).toEqual({
      title: rec.release.title,
      status: rec.release.status,
      blocks: problems.filter((x) => x.severity === "block").length,
      warns: problems.filter((x) => x.severity === "warn").length,
      pending: rec.pending.length,
    });
  });
});
