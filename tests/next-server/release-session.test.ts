// THE RELEASE SESSION (app/(studio)/audio/_release/sessionModel.ts, applyLocal.ts): what the page shows while the store
// has not answered, and how it re-bases when it does.
//
// 1. The page's zod-free accept (`applyLocal`) sets every proposal path exactly as the store's door (`applyProposal`)
//    does - a drift would show the operator one value and store another.
// 2. The queue: one release's acts leave in order, each with the version the answer before it returned; an answer
//    re-bases the acts still queued; a stale answer shows the stored record and its notice; a refusal rolls back.
//    Driven through `pump` - the same function Session.tsx's effect calls - against fake acts.
import { describe, expect, it } from "vitest";

import type { Release, ShelfTake } from "@gt/domain/release";
import { RELEASE_PROPOSAL_FIELDS, TRACK_PROPOSAL_FIELDS, type ProposalPath, type ReleaseProposal, type ReleaseRecord } from "@gt/domain/release.record";
import { applyProposal } from "@gt/domain/release.record.schema";

import type { ReleaseAct, ReleaseActs, ReleaseAnswer } from "../../app/(studio)/audio/_release/act.ts";
import { applyLocal } from "../../app/(studio)/audio/_release/applyLocal.ts";
import { applyEdit, releaseOf, type ReleaseEdit } from "../../app/(studio)/audio/_release/draft.ts";
import { initialSession, pump, reduceSession, staleNotice, viewOf, type SessionEvent, type SessionModel } from "../../app/(studio)/audio/_release/sessionModel.ts";

const take = (n: number): ShelfTake => ({ takeId: `take-${n}`, title: `Take ${n}`, durationS: 200, audioHref: null, provider: "suno", label: null, lufs: null, truePeakDb: null });
const ID = "rel-00000000aa01";
const base: Release = releaseOf(ID, "MiSu", [take(1), take(2)]);

const RELEASE_VALUES: Readonly<Record<(typeof RELEASE_PROPOSAL_FIELDS)[number], unknown>> = {
  title: "Static Sea",
  version: "Night Mix",
  artist: "MiSu & Co",
  label: "Gravitone",
  releaseDate: "2026-12-24",
  language: "fr",
  "genre.primary": "Pop",
  "genre.secondary": "Ambient",
  upc: "196872534410",
  sleevePrompt: "Static on a night sea, no text",
};
const TRACK_VALUES: Readonly<Record<(typeof TRACK_PROPOSAL_FIELDS)[number], unknown>> = {
  title: "Dancing in the Static",
  version: "Radio Edit",
  isrc: "US-S1Z-26-00001",
  explicit: true,
  lyrics: "first verse\nsecond verse",
  songwriters: ["Jane Doe", "John Roe"],
  credits: [{ name: "MiSu", role: "performer" }],
  ai: { lyrics: true, music: true, audio: "all", persona: "ai" },
  rights: { vendor: "suno", model: "v5", planTier: "Pro", generatedAt: "2026-11-03", briefDigest: "sha256:9f2c41d07ab3e5c8", reference: null, licence: "commercial" },
};

const EVERY_PATH: readonly (readonly [ProposalPath, unknown])[] = [
  ...RELEASE_PROPOSAL_FIELDS.map((f) => [f, RELEASE_VALUES[f]] as const),
  ...[1, 2].flatMap((n) => TRACK_PROPOSAL_FIELDS.map((f) => [`track:${n}.${f}` as ProposalPath, TRACK_VALUES[f]] as const)),
];

describe("applyLocal agrees with the release door", () => {
  it.each(EVERY_PATH)("%s is set exactly as applyProposal sets it", (path, value) => {
    const door = applyProposal(base, path, value);
    expect(door.ok).toBe(true);
    expect(applyLocal(base, path, value)).toEqual(door.ok ? door.value : null);
  });

  it("covers every field a proposal may set", () => {
    expect(EVERY_PATH.length).toBe(RELEASE_PROPOSAL_FIELDS.length + 2 * TRACK_PROPOSAL_FIELDS.length);
  });

  it("refuses a track past the last one, as the door does", () => {
    expect(applyLocal(base, "track:3.title", "x")).toBeNull();
    expect(applyProposal(base, "track:3.title", "x").ok).toBe(false);
  });

  it("leaves every other field as it was", () => {
    const next = applyLocal(base, "genre.secondary", "Ambient");
    expect(next?.genre).toEqual({ primary: null, secondary: "Ambient" });
    expect({ ...next, genre: base.genre }).toEqual(base);
  });
});

// ---- the queue, against fake acts

const AT = "2026-11-17T09:00:00.000Z";
const P_PERSONA: ReleaseProposal = { id: "p-persona", path: "track:1.ai", value: TRACK_VALUES.ai, source: "the session", turnId: "t-0007", at: AT };
const P_GENRE: ReleaseProposal = { id: "p-genre2", path: "genre.secondary", value: "Ambient", source: "the Suno style", turnId: "t-0007", at: AT };
const record = (release: Release, version: number, pending: readonly ReleaseProposal[] = []): ReleaseRecord => ({ release, version, sessionId: null, createdAt: AT, updatedAt: AT, pending });

/** A store stand-in: holds the calls, answers each when the test says so. */
function fakeStore() {
  const calls: { input: { id: string; version: number; act: ReleaseAct }; answer: (a: ReleaseAnswer) => void }[] = [];
  const doors: Pick<ReleaseActs, "apply"> = {
    apply: (input) => new Promise<ReleaseAnswer>((answer) => calls.push({ input, answer })),
  };
  return { doors, calls };
}

/** Session.tsx in miniature: the reducer, and `pump` after every event, as its effect does after every render. */
function harness(records: readonly ReleaseRecord[]) {
  const store = fakeStore();
  const leaving = new Set<string>();
  let m: SessionModel = initialSession(records, records[0]?.release.id ?? null);
  const send = (e: SessionEvent) => {
    m = reduceSession(m, e);
    pump(m, store.doors, send, leaving);
  };
  return { store, send, model: () => m, view: () => viewOf(m)[0] };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const edit = (e: ReleaseEdit): SessionEvent => ({ type: "enqueue", id: ID, act: { kind: "edit", edit: e } });

describe("the release session's queue", () => {
  it("sends one act at a time, the next with the version the previous answer returned, and re-bases what is queued", async () => {
    const h = harness([record(base, 3)]);
    h.send(edit({ type: "patch", id: ID, fields: { title: "A" } }));
    h.send(edit({ type: "moveTrack", id: ID, from: 0, to: 1 }));
    expect(h.store.calls).toHaveLength(1);
    expect(h.store.calls[0]?.input.version).toBe(3);
    // both shown at once, before any answer
    expect(h.view()?.release.title).toBe("A");
    expect(h.view()?.release.tracks.map((t) => t.takeId)).toEqual(["take-2", "take-1"]);

    // the store's answer carries a field the agent's accepted proposal wrote in between
    const stored = record({ ...applyEdit(base, { type: "patch", id: ID, fields: { title: "A" } }), label: "Gravitone" }, 4);
    h.store.calls[0]?.answer({ ok: true, value: { record: stored, stale: false } });
    await settle();
    expect(h.store.calls).toHaveLength(2);
    expect(h.store.calls[1]?.input.version).toBe(4);
    expect(h.store.calls[1]?.input.act).toEqual({ kind: "edit", edit: { type: "moveTrack", id: ID, from: 0, to: 1 } });
    // re-based: the store's label AND the queued move
    expect(h.view()?.release.label).toBe("Gravitone");
    expect(h.view()?.release.tracks.map((t) => t.takeId)).toEqual(["take-2", "take-1"]);
    expect(h.view()?.version).toBe(4);
  });

  it("a stale answer shows the record as stored, drops the acts made on top, and says which version won", async () => {
    const h = harness([record(base, 3)]);
    h.send(edit({ type: "patch", id: ID, fields: { title: "mine" } }));
    h.send(edit({ type: "removeTrack", id: ID, index: 1 }));
    const theirs = record({ ...base, title: "the agent's" }, 7);
    h.store.calls[0]?.answer({ ok: true, value: { record: theirs, stale: true } });
    await settle();
    expect(h.view()).toEqual(theirs);
    expect(h.model().queues[ID]).toBeUndefined();
    expect(h.model().notice).toBe(staleNotice(7));
    expect(h.store.calls).toHaveLength(1);
    // the next act leaves against the version the store holds
    h.send(edit({ type: "patch", id: ID, fields: { title: "again" } }));
    expect(h.store.calls[1]?.input.version).toBe(7);
  });

  it("a refusal rolls back to the last stored record with the store's own sentence", async () => {
    const h = harness([record(base, 3)]);
    h.send(edit({ type: "patch", id: ID, fields: { releaseDate: "soon" } }));
    expect(h.view()?.release.releaseDate).toBe("soon");
    h.store.calls[0]?.answer({ ok: false, error: { error: "release: releaseDate: too long", code: "invalid" } });
    await settle();
    expect(h.view()).toEqual(record(base, 3));
    expect(h.model().notice).toBe("release: releaseDate: too long");
  });

  it("a door that throws is a refusal, not a stalled queue", async () => {
    const leaving = new Set<string>();
    let m = initialSession([record(base, 3)], ID);
    const send = (e: SessionEvent) => {
      m = reduceSession(m, e);
      pump(m, { apply: () => Promise.reject(new Error("network down")) }, send, leaving);
    };
    send(edit({ type: "patch", id: ID, fields: { title: "x" } }));
    await settle();
    expect(m.queues[ID]).toBeUndefined();
    expect(m.notice).toBe("network down");
  });

  it("folds a field typed letter by letter into one write while it waits, never into the one in flight", () => {
    const h = harness([record(base, 3)]);
    h.send(edit({ type: "patch", id: ID, fields: { title: "a" } }));
    h.send(edit({ type: "patch", id: ID, fields: { title: "ab" } }));
    h.send(edit({ type: "patch", id: ID, fields: { title: "abc" } }));
    expect(h.store.calls).toHaveLength(1);
    expect(h.model().queues[ID]?.map((q) => q.act)).toEqual([
      { kind: "edit", edit: { type: "patch", id: ID, fields: { title: "a" } } },
      { kind: "edit", edit: { type: "patch", id: ID, fields: { title: "abc" } } },
    ]);
    expect(h.view()?.release.title).toBe("abc");
  });

  it("accept shows the value and drops the proposal at once; the store's answer re-bases it", async () => {
    const h = harness([record(base, 3, [P_PERSONA, P_GENRE])]);
    h.send({ type: "enqueue", id: ID, act: { kind: "accept", proposalIds: ["p-persona"] } });
    expect(h.view()?.release.tracks[0]?.ai).toEqual(TRACK_VALUES.ai);
    expect(h.view()?.pending.map((p) => p.id)).toEqual(["p-genre2"]);
    expect(h.store.calls[0]?.input).toEqual({ id: ID, version: 3, act: { kind: "accept", proposalIds: ["p-persona"] } });
    h.send({ type: "enqueue", id: ID, act: { kind: "dismiss", proposalIds: ["p-genre2"] } });
    expect(h.view()?.pending).toEqual([]);
    expect(h.view()?.release.genre.secondary).toBeNull();
    const accepted = applyProposal(base, "track:1.ai", TRACK_VALUES.ai);
    if (!accepted.ok) throw new Error("fixture value refused");
    h.store.calls[0]?.answer({ ok: true, value: { record: record(accepted.value, 4, [P_GENRE]), stale: false } });
    await settle();
    expect(h.store.calls[1]?.input).toEqual({ id: ID, version: 4, act: { kind: "dismiss", proposalIds: ["p-genre2"] } });
    expect(h.view()?.pending).toEqual([]);
  });

  it("on the fixture an act lands on the record at once and nothing is queued", () => {
    let m = initialSession([record(base, 3, [P_GENRE])], ID);
    m = reduceSession(m, { type: "local", id: ID, act: { kind: "accept", proposalIds: ["p-genre2"] } });
    expect(m.records[0]?.release.genre.secondary).toBe("Ambient");
    expect(m.records[0]?.pending).toEqual([]);
    expect(m.queues).toEqual({});
  });

  it("a release made on the page takes the store's id when its create is answered, with the acts made meanwhile", async () => {
    const local = "rel-00000000bb02";
    const h = harness([record(base, 3)]);
    h.send({ type: "create", id: local, artist: "MiSu", takes: [take(5)], at: AT, stored: false });
    h.send({ type: "enqueue", id: local, act: { kind: "edit", edit: { type: "patch", id: local, fields: { title: "New" } } } });
    expect(h.store.calls).toHaveLength(0);
    const storedId = "rel-00000000cc03";
    h.send({ type: "created", localId: local, answer: { ok: true, value: { record: record(releaseOf(storedId, "MiSu", [take(5)]), 1), stale: false } } });
    expect(h.model().openId).toBe(storedId);
    expect(h.store.calls[0]?.input).toEqual({ id: storedId, version: 1, act: { kind: "edit", edit: { type: "patch", id: storedId, fields: { title: "New" } } } });
  });
});
