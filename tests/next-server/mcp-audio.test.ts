// THE AUDIO STUDIO ON THE AGENT DOOR (app/_server/mcp/tools/{audio,audioStudio,audioGuide,audioTake}.ts;
// spark audio-agent-studio S2 package R2). Every op is called through the JSON-RPC layer (answerRpc)
// over an in-memory kernel, as an act-scope agent: the inbox long-poll sees a message filed DURING its
// wait and answers waitS 0 at once; audio_turn refuses a user turn, appends an agent turn once under its
// id and names the pieces the door dropped; the local band's verbs answer stems ready for a stems row
// (href, levelDb, pan) with the engine faked at its module seam; audio_guide is the registry, not a copy.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const engine = vi.hoisted(() => ({ renderLocalScore: vi.fn(), auditionLocalInstrument: vi.fn(), mixLocalTake: vi.fn(), rewriteLocalStem: vi.fn(), getTake: vi.fn() }));
vi.mock("../../lib/sound/localScore.ts", () => ({ renderLocalScore: engine.renderLocalScore, auditionLocalInstrument: engine.auditionLocalInstrument }));
vi.mock("../../lib/sound/localScoreVerbs.ts", () => ({ mixLocalTake: engine.mixLocalTake, rewriteLocalStem: engine.rewriteLocalStem }));
vi.mock("../../lib/sound/takes.ts", () => ({ getTake: engine.getTake }));

import { trackIdOf, type ScoreSpec } from "@gt/domain/audio.score";
import { FULL_BAND_SPEC } from "@gt/domain/audio.score.templates";
import { STUDIO_ACTION_KINDS, STUDIO_NODE_KINDS, STUDIO_ROLES } from "@gt/domain/audio.studio";
import { STUDIO_EVENTS } from "@gt/domain/audio.studio.events";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { queryEvents } from "@gt/kernel/events-query";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";

import { appendSay } from "../../app/(studio)/audio/studio/_live/say.ts";
import type { McpDeps } from "../../app/_server/mcp/op.ts";
import type { Agent } from "../../app/_server/mcp/principal.ts";
import { answerRpc } from "../../app/_server/mcp/rpc.ts";
import type { LocalScorePlan } from "../../lib/sound/localScorePlan.ts";
import type { SoundTake } from "../../lib/sound/types.ts";

const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Agent = { name: "studio-agent", scope: "act", who: { who: "studio-agent", kind: "agent" }, actor: { kind: "agent", id: "studio-agent" } };
const SESSION = "song-ab12-20261029";
const AT = "2026-10-29T10:00:00.000Z";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

let store: Store;
beforeEach(() => {
  store = must(openKernel(":memory:")).store;
  for (const f of Object.values(engine)) f.mockReset();
  engine.getTake.mockRejectedValue(new Error("no take in this test"));
});

const deps = (): McpDeps => {
  const none = (): Promise<never> => Promise.reject(new Error("not reached in this test"));
  return { produce: () => { throw new Error("not reached"); }, part: none, board: none, library: none, store: () => ok(store) };
};

type ToolOut = { isError?: boolean; structuredContent: Record<string, unknown> };
let n = 0;
async function tool(name: string, args: Record<string, unknown>, agent: Agent = AGENT): Promise<ToolOut> {
  const r = await answerRpc({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }, { agent, deps: deps(), mode: "family", version: "0.1.0" });
  const body = (await r.json()) as { result?: ToolOut; error?: unknown };
  expect(body.error).toBeUndefined();
  return body.result as ToolOut;
}
const detail = (o: ToolOut): string => String(o.structuredContent["detail"]);

const say = (id: string, text: string, extra: Record<string, unknown> = {}) => must(appendSay(store, { session: SESSION, turn: { v: 1, id, seq: 0, at: AT, from: "user", text, ...extra } }, OPERATOR));

/** A local take with one stem per track, as the engine would file it. */
function fakeTake(id: string, spec: ScoreSpec = FULL_BAND_SPEC, parentId: string | null = null): { take: SoundTake; plan: LocalScorePlan } {
  const stems = spec.tracks.map((t) => ({
    id: trackIdOf(t), role: t.role, instrument: t.instrument, instrumentName: `${t.instrument} name`, source: "sample-pack", fallback: false,
    wavPath: "x.wav", midiPath: "x.mid", sha256: "s", trackHash: "h", reused: false, muted: t.muted ?? false, solo: t.solo ?? false,
    gainDb: t.gainDb ?? 0, pan: t.pan ?? 0, noteCount: 8, renderMs: 10, durationS: 20, integratedLufs: -18,
    fileRel: "f", midiRel: "m", audioUrl: `/api/sound/takes/${id}/file?stem=${trackIdOf(t)}`, midiUrl: "/m",
  }));
  const plan = { kind: "local-score", chunks: [], spec, stems, triage: { version: 1, findings: [], flagged: 0 }, determinism: null, mixSha256: "m", rppRel: "r", rppUrl: "/r", reusedIds: [], renderedIds: stems.map((s) => s.id), reusedRoles: [], renderedRoles: [], totalRenderMs: 10, costUsd: 0 } as unknown as LocalScorePlan;
  const take = { id, title: spec.title, durationS: 22.9, measured: { lufs: -14.1 }, parentId, variation: parentId === null ? null : { axis: "mix", diff: ["lead-bell: gainDb -3.5 -> -6"] }, plan } as unknown as SoundTake;
  return { take, plan };
}

const agentTurn = (id: string, takeId = "st-1") => ({
  id,
  text: "A calm study groove.",
  show: [
    { id: "track", kind: "track", takeId, mix: { href: `/api/sound/takes/${takeId}/file` } },
    { id: "stems", kind: "stems", takeId, rows: [{ id: "bass", role: "bass", label: "deep round bass", levelDb: 0, pan: 0, audio: { href: `/api/sound/takes/${takeId}/file?stem=bass` } }] },
  ],
  actions: [{ id: "softer", kind: "say", label: "Softer drums", text: "make the drums softer", why: "the beat leads a lot" }],
});

describe("audio_inbox: the long-poll", () => {
  it("answers at once with waitS 0, nothing new, and a next cursor at the head", async () => {
    const first = say("u-1", "something calm to study to");
    const out = await tool("gt_read", { op: "audio_inbox", after: first.seq, waitS: 0 });
    expect(out.isError).toBeUndefined();
    expect(out.structuredContent["messages"]).toEqual([]);
    expect(out.structuredContent["next"]).toBe(first.seq);
    expect(out.structuredContent["waitedMs"] as number).toBeLessThan(400);
  });

  it("returns a message filed during the wait, well before waitS runs out", async () => {
    const first = say("u-1", "something calm to study to");
    setTimeout(() => say("u-2", "a little faster please"), 300);
    const out = await tool("gt_read", { op: "audio_inbox", after: first.seq, waitS: 10 });
    const messages = out.structuredContent["messages"] as { session: string; seq: number; turn: { id: string; text: string } }[];
    expect(messages.map((m) => m.turn.id)).toEqual(["u-2"]);
    expect(messages[0]?.session).toBe(SESSION);
    expect(out.structuredContent["next"]).toBe(messages[0]?.seq);
    expect(out.structuredContent["waitedMs"] as number).toBeGreaterThanOrEqual(250);
    expect(out.structuredContent["waitedMs"] as number).toBeLessThan(3000);
  });

  it("with no after, answers the unanswered messages; an answer clears them", async () => {
    say("u-1", "something calm to study to");
    const waiting = await tool("gt_read", { op: "audio_inbox" });
    expect((waiting.structuredContent["messages"] as unknown[]).length).toBe(1);
    expect(waiting.structuredContent["sessions"]).toEqual([{ id: SESSION, title: "something calm to study to", lastSeq: expect.any(Number), waiting: true }]);
    expect((await tool("gt_launch", { op: "audio_turn", session: SESSION, turn: agentTurn("a-1") })).isError).toBeUndefined();
    const after = await tool("gt_read", { op: "audio_inbox" });
    expect(after.structuredContent["messages"]).toEqual([]);
    expect((after.structuredContent["sessions"] as { waiting: boolean }[])[0]?.waiting).toBe(false);
  });

  it("answers the conversation's state: newest answer, its take's score and pre-fader stems, the pressed proposal", async () => {
    engine.getTake.mockResolvedValue(fakeTake("st-1").take);
    say("u-1", "something calm to study to");
    await tool("gt_launch", { op: "audio_turn", session: SESSION, turn: agentTurn("a-1") });
    say("u-2", "Softer drums", { action: "softer" });
    const out = await tool("gt_read", { op: "audio_inbox" });
    const [m] = out.structuredContent["messages"] as { turn: { action: string }; pressed?: { kind: string; text: string } }[];
    expect(m?.pressed).toMatchObject({ kind: "say", text: "make the drums softer" });
    const state = out.structuredContent["state"] as { session: string; takeId: string; nextSeq: number; waiting: boolean; score: ScoreSpec; stems: { id: string; levelDb: number; pan: number; href: string }[]; latestAgentTurn: { id: string } };
    expect(state).toMatchObject({ session: SESSION, takeId: "st-1", nextSeq: 3, waiting: true, latestAgentTurn: { id: "a-1" } });
    expect(state.score.tracks).toHaveLength(8);
    expect(state.stems.find((s) => s.id === "lead-bell")).toMatchObject({ levelDb: -3.5, pan: 0.15, href: "/api/sound/takes/st-1/file?stem=lead-bell" });
    expect(engine.getTake).toHaveBeenCalledWith("st-1");
  });
});

describe("audio_turn: the agent's answer into the ledger", () => {
  it("refuses a user turn, and a session nobody has written in", async () => {
    say("u-1", "something calm");
    const user = await tool("gt_launch", { op: "audio_turn", session: SESSION, turn: { from: "user", text: "pretending to be the person" } });
    expect(user.isError).toBe(true);
    expect(detail(user)).toContain("expected one from the agent");
    const ghost = await tool("gt_launch", { op: "audio_turn", session: "song-zzzz-20261029", turn: agentTurn("a-1") });
    expect(ghost.structuredContent["code"]).toBe("not-found");
    expect(queryEvents(store, { type: [STUDIO_EVENTS.turn], limit: 10 }).ok && must(queryEvents(store, { type: [STUDIO_EVENTS.turn], limit: 10 })).events).toEqual([]);
  });

  it("appends once under its id as the agent, fills the bookkeeping, and reports the pieces the door dropped", async () => {
    say("u-1", "something calm");
    const turn = { ...agentTurn("a-1"), show: [...agentTurn("a-1").show, { id: "x", kind: "hologram" }, { id: "y", kind: "track", mix: { href: "https://evil.example/a.wav" } }] };
    const out = await tool("gt_launch", { op: "audio_turn", session: SESSION, turn });
    expect(out.isError).toBeUndefined();
    const dropped = out.structuredContent["dropped"] as { at: string; reason: string }[];
    expect(dropped.map((d) => d.at)).toEqual(["show[2]", "show[3]"]);
    expect(dropped[0]?.reason).toContain('unknown kind "hologram"');
    expect(out.structuredContent).toMatchObject({ turnId: "a-1", shown: 2, proposed: 1, appended: true });
    const evs = must(queryEvents(store, { type: [STUDIO_EVENTS.turn], limit: 10 })).events;
    expect(evs).toHaveLength(1);
    expect(evs[0]?.actor).toEqual({ kind: "agent", id: "studio-agent" });
    expect(evs[0]?.subject).toEqual({ kind: "studio-session", id: SESSION });
    expect((evs[0]?.data as { turn: { v: number; from: string; seq: number } }).turn).toMatchObject({ v: 1, from: "agent", seq: 1 });
    // A retry that left the bookkeeping out again is the same answer: filled from the held one, appended nothing.
    const again = await tool("gt_launch", { op: "audio_turn", session: SESSION, turn });
    expect(again.structuredContent).toMatchObject({ appended: false, seq: evs[0]?.seq });
    const other = await tool("gt_launch", { op: "audio_turn", session: SESSION, turn: { ...turn, text: "other words" } });
    expect(other.structuredContent["code"]).toBe("conflict");
  });

  it("check:true holds the turn to the door and appends nothing; a read token may not answer", async () => {
    say("u-1", "something calm");
    const checked = await tool("gt_launch", { op: "audio_turn", session: SESSION, turn: agentTurn("a-1"), check: true });
    expect(checked.structuredContent).toMatchObject({ checked: true, appended: false, dropped: [] });
    expect(must(queryEvents(store, { type: [STUDIO_EVENTS.turn], limit: 10 })).events).toEqual([]);
    const reader = await tool("gt_launch", { op: "audio_turn", session: SESSION, turn: agentTurn("a-1") }, { ...AGENT, scope: "read" });
    expect(reader.structuredContent).toMatchObject({ code: "refused", reason: "token-scope" });
  });
});

describe("the local band's verbs, engine faked", () => {
  const STEM_KEYS = ["id", "role", "href", "instrument", "source", "fallback", "levelDb", "pan", "reused"];

  it("audio_render answers the take, its mix, and one stem per track ready for a stems row", async () => {
    engine.renderLocalScore.mockResolvedValue(ok(fakeTake("st-9")));
    const out = await tool("gt_launch", { op: "audio_render", spec: FULL_BAND_SPEC });
    expect(out.isError).toBeUndefined();
    expect(engine.renderLocalScore).toHaveBeenCalledWith(FULL_BAND_SPEC, { op: "compose" });
    const v = out.structuredContent as { takeId: string; mixHref: string; stems: Record<string, unknown>[]; lufs: number; durationS: number; triageFlagged: number; sections: unknown[] };
    expect(v).toMatchObject({ takeId: "st-9", mixHref: "/api/sound/takes/st-9/file", lufs: -14.1, durationS: 22.9, triageFlagged: 0 });
    expect(v.sections).toHaveLength(3);
    expect(v.stems).toHaveLength(8);
    for (const s of v.stems) for (const k of STEM_KEYS) expect(s, k).toHaveProperty(k);
    expect(v.stems.find((s) => s["id"] === "drums")).toMatchObject({ enters: [false, true, true], levelDb: 0 });
  });

  it("audio_render passes allowFallback through, and the engine's refusal reaches the agent in words", async () => {
    engine.renderLocalScore.mockResolvedValue(err("invalid", "vital-warm-pad: no plugin at C:/VST3/Vital.vst3 (a stand-in is refused)"));
    const out = await tool("gt_launch", { op: "audio_render", spec: FULL_BAND_SPEC, allowFallback: true });
    expect(engine.renderLocalScore).toHaveBeenCalledWith(FULL_BAND_SPEC, { op: "compose", allowFallback: true });
    expect(out.isError).toBe(true);
    expect(detail(out)).toContain("a stand-in is refused");
  });

  it("audio_mix bakes in-range changes and refuses an out-of-range level in words, calling nothing", async () => {
    engine.mixLocalTake.mockResolvedValue(ok(fakeTake("st-10", FULL_BAND_SPEC, "st-9")));
    const out = await tool("gt_launch", { op: "audio_mix", takeId: "st-9", tracks: { "lead-bell": { gainDb: -6, pan: 0.3 }, drums: { muted: true } } });
    expect(engine.mixLocalTake).toHaveBeenCalledWith({ takeId: "st-9", tracks: { "lead-bell": { gainDb: -6, pan: 0.3 }, drums: { muted: true } } });
    expect(out.structuredContent).toMatchObject({ takeId: "st-10", parentId: "st-9", changed: ["lead-bell: gainDb -3.5 -> -6"] });
    engine.mixLocalTake.mockClear();
    const low = await tool("gt_launch", { op: "audio_mix", takeId: "st-9", tracks: { pad: { gainDb: -40 } } });
    expect(low.isError).toBe(true);
    expect(detail(low)).toContain("pad: a level of -40 dB is outside what a score holds (-24 to +12 dB) - to silence it, mute it instead");
    expect(engine.mixLocalTake).not.toHaveBeenCalled();
  });

  it("audio_rewrite takes notes or a pattern, exactly one", async () => {
    engine.rewriteLocalStem.mockResolvedValue(ok(fakeTake("st-11", FULL_BAND_SPEC, "st-9")));
    const notes = [{ bar: 1, beat: 0, durationBeats: 1, midi: 69, velocity: 90 }];
    expect((await tool("gt_launch", { op: "audio_rewrite", takeId: "st-9", track: "lead-bell", notes })).structuredContent["takeId"]).toBe("st-11");
    expect(engine.rewriteLocalStem).toHaveBeenCalledWith({ takeId: "st-9", track: "lead-bell", notes });
    await tool("gt_launch", { op: "audio_rewrite", takeId: "st-9", track: "pad", pattern: "slow-swell" });
    expect(engine.rewriteLocalStem).toHaveBeenLastCalledWith({ takeId: "st-9", track: "pad", pattern: "slow-swell" });
    const both = await tool("gt_launch", { op: "audio_rewrite", takeId: "st-9", track: "pad", pattern: "drone", notes });
    expect(detail(both)).toContain("exactly one of the two");
    expect(engine.rewriteLocalStem).toHaveBeenCalledTimes(2);
  });

  it("audio_audition answers the href to hear and the source that played it", async () => {
    engine.auditionLocalInstrument.mockResolvedValue(ok({ instrumentId: "sample-felt-piano", name: "Upright Felt Piano", role: "chords", audioUrl: "/api/sound/takes/audition/file?instrument=sample-felt-piano", audition: {}, source: "sample-pack", fallback: false }));
    const out = await tool("gt_launch", { op: "audio_audition", instrumentId: "sample-felt-piano" });
    expect(out.structuredContent).toEqual({ instrumentId: "sample-felt-piano", name: "Upright Felt Piano", role: "chords", href: "/api/sound/takes/audition/file?instrument=sample-felt-piano", source: "sample-pack", fallback: false });
  });
});

describe("audio_guide: the vocabulary is the registry's", () => {
  it("lists every node kind, action kind and role from the registry, each kind with its JSON schema", async () => {
    const g = (await tool("gt_read", { op: "audio_guide" })).structuredContent as { nodes: { kinds: string[]; schemas: Record<string, { type: string }> }; actions: { kinds: string[]; goes: Record<string, string>; schemas: Record<string, unknown> }; roles: string[] };
    expect(g.nodes.kinds).toEqual([...STUDIO_NODE_KINDS]);
    expect(Object.keys(g.nodes.schemas)).toEqual([...STUDIO_NODE_KINDS]);
    for (const k of STUDIO_NODE_KINDS) expect(g.nodes.schemas[k]?.type, k).toBe("object");
    expect(g.actions.kinds).toEqual([...STUDIO_ACTION_KINDS]);
    expect(Object.keys(g.actions.schemas)).toEqual([...STUDIO_ACTION_KINDS]);
    expect(g.actions.goes["render"]).toBe("agent");
    expect(g.roles).toEqual([...STUDIO_ROLES]);
  });

  it("carries the ScoreSpec schema, its worked example, and the catalog with the roles each instrument fits", async () => {
    const g = (await tool("gt_read", { op: "audio_guide" })).structuredContent as { score: { schema: { properties: Record<string, unknown> }; example: ScoreSpec; maxTracks: number; patterns: Record<string, string[]> }; catalog: { id: string; ready: boolean; fits: string[]; refused?: string }[] };
    expect(Object.keys(g.score.schema.properties)).toContain("tracks");
    expect(g.score.example.tracks).toHaveLength(g.score.maxTracks);
    expect(g.score.patterns["drums"]).toContain("boom-bap");
    expect(g.catalog.find((i) => i.id === "vital-warm-pad")?.fits).toEqual(["chords", "pad", "texture"]);
    expect(g.catalog.find((i) => i.id === "kit-909-pulse")?.fits).toEqual(["drums", "percussion"]);
    expect(g.catalog.find((i) => i.id === "minigrand-vst3")).toMatchObject({ ready: false, refused: expect.stringContaining("silent") });
  });
});

describe("the intent ops ported from e4", () => {
  const INTENT = { use: "puzzle game menu", mood: ["calm", "curious"], lengthS: 60, loop: true };

  it("audio_palette returns three palettes in plain words", async () => {
    const out = await tool("gt_read", { op: "audio_palette", mood: ["calm", "hopeful"], use: "puzzle game menu" });
    const palettes = out.structuredContent["palettes"] as { instruments: { plain: string }[] }[];
    expect(palettes).toHaveLength(3);
    for (const p of palettes) for (const i of p.instruments) expect(i.plain.length).toBeGreaterThan(3);
  });

  it("audio_compile is deterministic", async () => {
    const a = await tool("gt_read", { op: "audio_compile", intent: INTENT });
    const b = await tool("gt_read", { op: "audio_compile", intent: INTENT });
    expect(JSON.stringify(a.structuredContent)).toBe(JSON.stringify(b.structuredContent));
    expect(a.structuredContent["hash"]).toMatch(/^ai-v1-[0-9a-f]{16}$/);
  });

  it("intent_steer moves one axis per plain complaint and names the rest", async () => {
    const out = await tool("gt_read", { op: "intent_steer", intent: INTENT, complaints: ["too slow", "too dark", "make it purple"] });
    const variants = out.structuredContent["variants"] as { axis: string; seed: { bpm: number } }[];
    expect(variants.map((v) => v.axis)).toEqual(["tempo", "brightness"]);
    expect(out.structuredContent["unrecognised"]).toEqual(["make it purple"]);
  });
});
