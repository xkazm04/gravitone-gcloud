// THE STUDIO'S LIVE RELAY, HOST SIDE (spark audio-agent-studio, stage S2 package R1): the dock's
// message filed as `audio.say` through the one studio event door (an agent turn and a bad session id
// refused, a retried send appended once, a different turn under a used id a conflict); the ledger
// port's fold of `audio.say` + `audio.turn` into conversations (a refused event SHOWN as a line,
// never skipped); presence from the agent token's lastUsedAt on a fake clock; the user turns the host
// composes (a pressed proposal, "keep this mix") pass the same door.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseStudioEvent, STUDIO_EVENTS, studioEventKey, studioSessionSchema } from "@gt/domain/audio.studio.events";
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import type { Actor } from "@gt/domain/event";
import { appendOnce } from "@gt/kernel/ingest";
import { openKernel } from "@gt/kernel/kernel";
import type { Store } from "@gt/kernel/store";
import type { TokenRecord } from "@gt/kernel/token";

import { foldStudioEvents, readLedger, titleOf, type StudioLedgerEvent } from "../../app/(studio)/audio/studio/_port/ledger.ts";
import { appendSay, mintSessionId } from "../../app/(studio)/audio/studio/_live/say.ts";
import { agentTokenName, PRESENCE_WINDOW_MS, presenceOf } from "../../app/(studio)/audio/studio/_live/presence.ts";
import { askOf, keptMix, mixChanges, mixText, newestStems, newTurnId, userTurn } from "../../app/(studio)/audio/studio/_host/turns.ts";
import { dockStateOf, refusedLines } from "../../app/(studio)/audio/studio/_host/live.ts";

const OPERATOR: Actor = { kind: "operator", id: "operator" };
const AGENT: Actor = { kind: "agent", id: "token:studio" };
const AT = "2026-10-29T10:00:00.000Z";

const say = (id: string, seq: number, text: string) => ({ v: 1, id, seq, at: AT, from: "user", text });
const stems = { id: "stems", kind: "stems", rows: [{ id: "drums", role: "drums", label: "soft drums", audio: { href: "/api/sound/takes/t1/file?stem=drums" } }, { id: "bass", role: "bass", label: "warm bass", levelDb: -2, audio: { href: "/api/sound/takes/t1/file?stem=bass" } }] };
const answer = (id: string, seq: number) => ({
  v: 1, id, seq, at: AT, from: "agent", text: "A calm bed at 90 bpm.",
  show: [{ id: "track", kind: "track", takeId: "t1", mix: { href: "/api/sound/takes/t1/file" } }, stems],
  actions: [{ id: "softer", kind: "say", label: "softer drums", text: "make the drums softer" }],
});

function store(): Store {
  const k = openKernel(":memory:");
  if (!k.ok) throw k.error;
  return k.value.store;
}

function turnEvent(s: Store, session: string, turn: unknown, id: string): void {
  const r = s.tx((t) => appendOnce(t, { actor: AGENT, type: STUDIO_EVENTS.turn, lane: "audio", key: studioEventKey(STUDIO_EVENTS.turn, id), subject: { kind: "studio-session", id: session }, data: { session, turn } }));
  if (!r.ok) throw r.error;
}

describe("say: the dock's message into the ledger", () => {
  it("files a user turn as audio.say keyed by its id; a retried send appends nothing twice", () => {
    const s = store();
    const first = appendSay(s, { session: "song-ab12-20261029", turn: say("u-1", 0, "something calm") }, OPERATOR);
    expect(first.ok && first.value).toMatchObject({ session: "song-ab12-20261029", turnId: "u-1", appended: true });
    const again = appendSay(s, { session: "song-ab12-20261029", turn: say("u-1", 0, "something calm") }, OPERATOR);
    expect(again.ok && again.value.appended).toBe(false);
    expect(again.ok && first.ok && again.value.seq).toBe(first.ok ? first.value.seq : -1);
  });

  it("refuses an agent turn, a bad session id, a turn the door would cut, and other words under a used id", () => {
    const s = store();
    const agent = appendSay(s, { session: "song-ab12-20261029", turn: answer("a-1", 1) }, OPERATOR);
    expect(agent.ok ? "" : agent.error.message).toBe("audio.say: carries a turn from the agent, expected one from the user");
    const bad = appendSay(s, { session: "Not A Session!", turn: say("u-2", 0, "hi") }, OPERATOR);
    expect(bad.ok ? "" : bad.error.code).toBe("invalid");
    expect(bad.ok ? "" : bad.error.message).toContain("session");
    const cut = appendSay(s, { session: "song-ab12-20261029", turn: { ...say("u-3", 0, "hi"), show: [stems] } }, OPERATOR);
    expect(cut.ok ? "" : cut.error.message).toContain("a message is sent whole or not at all");
    expect(appendSay(s, { session: "song-ab12-20261029", turn: say("u-4", 0, "first words") }, OPERATOR).ok).toBe(true);
    const clash = appendSay(s, { session: "song-ab12-20261029", turn: say("u-4", 0, "other words") }, OPERATOR);
    expect(clash.ok ? "" : clash.error.code).toBe("conflict");
    expect(readLedger(s).sessions.flatMap((x) => x.turns.map((t) => t.turn.text))).toEqual(["first words"]);
  });

  it("names a new conversation with a slug and the day, inside the door's session pattern", () => {
    const id = mintSessionId(new Date(AT), () => Uint8Array.from([0, 35, 36, 71]));
    expect(id).toBe("song-0z0z-20261029");
    expect(studioSessionSchema.safeParse(id).success).toBe(true);
  });
});

describe("the ledger port's fold", () => {
  const ev = (seq: number, type: string, data: unknown): StudioLedgerEvent => ({ seq, at: AT, type, data });

  it("folds says and turns into conversations, newest activity first, titled by the first message", () => {
    const { sessions, lost } = foldStudioEvents([
      ev(4, STUDIO_EVENTS.say, { session: "calm-bed", turn: say("u-c2", 2, "make the drums softer") }),
      ev(1, STUDIO_EVENTS.say, { session: "calm-bed", turn: say("u-c1", 0, "  something   calm to study to  ") }),
      ev(2, STUDIO_EVENTS.say, { session: "game-menu", turn: say("u-g1", 0, "a game menu loop") }),
      ev(3, STUDIO_EVENTS.turn, { session: "calm-bed", turn: answer("a-c1", 1) }),
      ev(5, STUDIO_EVENTS.turn, { session: "game-menu", turn: answer("a-g1", 1) }),
    ]);
    expect(lost).toEqual([]);
    expect(sessions.map((x) => [x.id, x.title, x.lastFrom])).toEqual([
      ["game-menu", "a game menu loop", "agent"],
      ["calm-bed", "something calm to study to", "user"],
    ]);
    expect(sessions[1]?.turns.map((t) => t.turn.id)).toEqual(["u-c1", "a-c1", "u-c2"]);
    expect(sessions[1]?.turns[1]?.turn.show.map((n) => n.kind)).toEqual(["track", "stems"]);
    expect(sessions[1]?.refused).toBeUndefined();
  });

  it("shows a refused event as a line of its conversation, and one with no readable session in `lost`", () => {
    const { sessions, lost } = foldStudioEvents([
      ev(1, STUDIO_EVENTS.say, { session: "calm-bed", turn: say("u-1", 0, "calm") }),
      ev(2, STUDIO_EVENTS.turn, { session: "calm-bed", turn: { ...answer("a-1", 1), v: 2 } }),
      ev(3, STUDIO_EVENTS.turn, { session: "calm-bed", turn: say("u-x", 2, "a user turn posing as an answer") }),
      ev(4, STUDIO_EVENTS.turn, { session: "NO SESSION", turn: answer("a-9", 1) }),
    ]);
    const calm = sessions[0];
    expect(calm?.turns.map((t) => t.turn.id)).toEqual(["u-1"]);
    expect(calm?.refused?.map((r) => [r.seq, r.from])).toEqual([[2, "agent"], [3, "agent"]]);
    expect(calm?.refused?.[1]?.reason).toBe("audio.turn: carries a turn from the user, expected one from the agent");
    expect(calm?.lastFrom).toBe("agent");
    expect(lost).toHaveLength(1);
    expect(lost[0]).toContain("event 4 (audio.turn)");
    expect(refusedLines(calm?.refused ?? [])).toMatch(/^2 messages in this conversation could not be read: an answer from the agent \(ledger event 2\)/);
    expect(refusedLines([])).toBeNull();
  });

  it("reads a real store: say through the action core's body, the agent's turn beside it, the head for the feed", () => {
    const s = store();
    expect(appendSay(s, { session: "calm-bed", turn: say("u-1", 0, "something calm") }, OPERATOR).ok).toBe(true);
    turnEvent(s, "calm-bed", answer("a-1", 1), "a-1");
    turnEvent(s, "calm-bed", { nonsense: true }, "a-2");
    const r = readLedger(s);
    expect(r.source).toBe("live");
    expect(r.note).toBeUndefined();
    expect(r.head).toBeGreaterThan(0);
    const calm = r.sessions[0];
    expect(calm?.turns.map((t) => `${t.turn.from}:${t.turn.id}`)).toEqual(["user:u-1", "agent:a-1"]);
    expect(calm?.refused).toHaveLength(1);
    expect(JSON.stringify(calm)).toContain("/api/sound/takes/t1/file?stem=bass");
  });

  it("trims a long first message to a short title at a word", () => {
    expect(titleOf("a slow warm piano piece for a rainy afternoon with soft drums and a little bass under it")).toBe("a slow warm piano piece for a rainy afternoon with soft...");
  });
});

describe("presence: the agent token's last use", () => {
  const NOW = Date.parse(AT);
  const tok = (over: Partial<TokenRecord>): TokenRecord => ({ id: "aaaaaaaaaaaa" as TokenRecord["id"], name: "studio-agent", scope: "act", createdAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-30T00:00:00.000Z", ...over });
  const used = (msAgo: number): string => new Date(NOW - msAgo).toISOString();

  it("listening when the named act token was used within 90 s; nobody past it, or never used", () => {
    expect(presenceOf([tok({ lastUsedAt: used(10_000) })], "studio-agent", NOW)).toBe("listening");
    expect(presenceOf([tok({ lastUsedAt: used(PRESENCE_WINDOW_MS - 1) })], "studio-agent", NOW)).toBe("listening");
    expect(presenceOf([tok({ lastUsedAt: used(PRESENCE_WINDOW_MS) })], "studio-agent", NOW)).toBe("nobody");
    expect(presenceOf([tok({})], "studio-agent", NOW)).toBe("nobody");
    expect(presenceOf([], "studio-agent", NOW)).toBe("nobody");
  });

  it("only that name, only act scope, never a revoked or expired token", () => {
    const fresh = { lastUsedAt: used(5_000) };
    expect(presenceOf([tok({ ...fresh, name: "athena" })], "studio-agent", NOW)).toBe("nobody");
    expect(presenceOf([tok({ ...fresh, scope: "read" })], "studio-agent", NOW)).toBe("nobody");
    expect(presenceOf([tok({ ...fresh, revokedAt: used(1_000) })], "studio-agent", NOW)).toBe("nobody");
    expect(presenceOf([tok({ ...fresh, expiresAt: used(1) })], "studio-agent", NOW)).toBe("nobody");
    expect(presenceOf([tok({ name: "studio-agent" }), tok({ ...fresh, id: "bbbbbbbbbbbb" as TokenRecord["id"] })], "studio-agent", NOW)).toBe("listening");
  });

  it("the token's name comes from GRAVITONE_STUDIO_AGENT_TOKEN_NAME, else studio-agent", () => {
    expect(agentTokenName({})).toBe("studio-agent");
    expect(agentTokenName({ GRAVITONE_STUDIO_AGENT_TOKEN_NAME: " my-agent " })).toBe("my-agent");
    expect(agentTokenName({ GRAVITONE_STUDIO_AGENT_TOKEN_NAME: "" })).toBe("studio-agent");
  });

  it("the dock: the offline preview, then a pending answer, then presence (nobody reads offline until the dock grows a waiting state)", () => {
    expect(dockStateOf(true, true, "listening")).toBe("offline");
    expect(dockStateOf(false, true, "nobody")).toBe("thinking");
    expect(dockStateOf(false, false, "listening")).toBe("listening");
    expect(dockStateOf(false, false, "nobody")).toBe("waiting");
  });
});

describe("the user turns the host composes", () => {
  const parsedAnswer = (() => {
    const r = parseStudioEvent(STUDIO_EVENTS.turn, { session: "calm-bed", turn: answer("a-1", 1) });
    if (!r.ok) throw r.error;
    return r.value.parsed;
  })();

  it("a pressed proposal: its id as `action`, its words as text; a say proposal sends its own words", () => {
    const softer = parsedAnswer.turn.actions[0];
    if (softer === undefined) throw new Error("fixture");
    expect(askOf(softer)).toEqual({ text: "make the drums softer", action: "softer" });
    expect(askOf({ id: "use-it", kind: "render", label: "render it again" })).toEqual({ text: "render it again", action: "use-it" });
    const id = newTurnId(Date.parse(AT), () => 0.5);
    expect(id).toMatch(/^u-[a-z0-9]+-[a-z0-9]{4}$/);
    const r = parseStudioEvent(STUDIO_EVENTS.say, { session: "calm-bed", turn: userTurn(askOf(softer), id, 2, AT) });
    expect(r.ok && r.value.parsed.turn).toMatchObject({ from: "user", action: "softer", text: "make the drums softer" });
  });

  it("keep this mix: every stem's live setting by id, the changes said in words, and the door takes it", () => {
    const found = newestStems([parsedAnswer]);
    expect(found?.turnId).toBe("a-1");
    const node = found?.node as StudioNodeOf<"stems">;
    const live: Record<string, { muted?: boolean; levelDb?: number; pan?: number }> = { drums: { muted: true }, bass: { levelDb: -6.2, pan: -0.5 } };
    const kept = keptMix(node, (id, base) => ({ ...base, ...live[id] }));
    expect(kept).toEqual({ drums: { muted: true }, bass: { levelDb: -6, pan: -0.5 } });
    const words = mixChanges(node, kept);
    expect(words).toEqual(["soft drums muted", "warm bass at -6 dB, panned left"]);
    expect(mixText(words)).toBe("Keep this mix: soft drums muted; warm bass at -6 dB, panned left.");
    expect(mixChanges(node, keptMix(node, (_id, base) => ({ ...base })))).toEqual([]);
    const r = parseStudioEvent(STUDIO_EVENTS.say, { session: "calm-bed", turn: userTurn({ text: mixText(words), mix: kept }, "u-mix", 2, AT) });
    expect(r.ok && r.value.parsed.turn.mix).toEqual(kept);
  });
});
