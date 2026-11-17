import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import type { Release } from "@gt/domain/release";

import { eventsMigrations } from "../src/events.ts";
import { releaseMigrations } from "../src/releases/schema.ts";
import { acceptIn, createReleaseIn, dismissIn, editIn, listReleaseRecords, proposeIn, readReleaseRecord } from "../src/releases/store.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

// THE RELEASE RECORD (spark studio-to-release WP1): a release is made once, written by compare-and-swap (a stale
// version writes nothing and answers the stored record), the agent only proposes, a proposal the release door would
// refuse is refused whole, accept applies the value and dismiss drops it, one `release.*` event per act, never deleted.

const tpl = templateStores([eventsMigrations, releaseMigrations], { clock: steppingClock("2026-11-17T09:00:00.000Z") });
afterAll(() => tpl.dispose());

const OPERATOR: Actor = { kind: "operator", id: "owner" };
const AGENT: Actor = { kind: "agent", id: "studio-agent" };
const ID = "rel-0123456789ab";

const RELEASE: Release = {
  id: ID,
  title: "Night Drive",
  version: null,
  artist: "MiSu",
  label: null,
  releaseDate: null,
  language: "en",
  genre: { primary: null, secondary: null },
  upc: null,
  tracks: [
    {
      takeId: "take-night-drive",
      title: "Night Drive",
      version: null,
      isrc: null,
      explicit: false,
      lyrics: null,
      durationS: 182,
      audioHref: null,
      songwriters: [],
      credits: [],
      ai: { lyrics: false, music: true, audio: "all", persona: null },
      rights: { vendor: "suno", model: null, planTier: null, generatedAt: null, briefDigest: null, reference: null, licence: "unknown" },
      master: { state: "none", recipe: null, takeId: null, audioHref: null, before: null, after: null, error: null },
    },
  ],
  sleeve: null,
  sleevePrompt: null,
  channels: [],
  splits: [],
  status: "draft",
};

const create = (s: Store) => must(s.tx((t) => createReleaseIn(t, { release: RELEASE, sessionId: "night-drive" }, OPERATOR, { takes: ["take-night-drive"] })));
const events = (s: Store) => must(s.read((r) => r.all("SELECT actor_kind, type, subject_id, data FROM events ORDER BY seq")));
const dataOf = (text: unknown): unknown => must(parseJsonAt("event data", z.unknown(), String(text)));
const types = (s: Store) => events(s).map((e) => e["type"]);
const refused = (r: { ok: boolean; error?: { code: string; message: string } }) => (r.ok ? "ok" : `${r.error?.code}: ${r.error?.message}`);
const propose = (s: Store, version: number, proposals: { path: string; value: unknown; source: string }[]) => s.tx((t) => proposeIn(t, { id: ID, version, proposals, turnId: "t-0007" }, AGENT));

describe("a release is made", () => {
  it("at version 1, reading back whole, with its session, and one release.created", () => {
    const s = tpl.fresh();
    const r = create(s);
    expect(r).toMatchObject({ version: 1, sessionId: "night-drive", pending: [], release: RELEASE });
    expect(r.createdAt).toBe(r.updatedAt);
    expect(must(s.read((x) => readReleaseRecord(x, ID)))).toEqual(r);
    expect(must(s.read((x) => listReleaseRecords(x))).map((x) => x.release.id)).toEqual([ID]);
    const ev = events(s);
    expect(ev.map((e) => [e["actor_kind"], e["type"], e["subject_id"]])).toEqual([["operator", "release.created", ID]]);
    expect(dataOf(ev[0]?.["data"])).toEqual({ sessionId: "night-drive", title: "Night Drive", takes: ["take-night-drive"] });
  });

  it("once per id, never by an agent, never with a release the door refuses", () => {
    const s = tpl.fresh();
    create(s);
    expect(refused(s.tx((t) => createReleaseIn(t, { release: RELEASE, sessionId: null }, OPERATOR)))).toBe(`conflict: release: ${ID} already exists`);
    expect(refused(s.tx((t) => createReleaseIn(t, { release: { ...RELEASE, id: "rel-ffffffffffff" }, sessionId: null }, AGENT)))).toMatch(/^refused: release: an agent proposes/);
    expect(refused(s.tx((t) => createReleaseIn(t, { release: { ...RELEASE, id: "rel-eeeeeeeeeeee", title: "x".repeat(201) }, sessionId: null }, OPERATOR)))).toMatch(/^invalid: release record/);
    expect(types(s)).toEqual(["release.created"]);
  });

  it("lists newest first", () => {
    const s = tpl.fresh();
    create(s);
    must(s.tx((t) => createReleaseIn(t, { release: { ...RELEASE, id: "rel-00000000000b" }, sessionId: null }, OPERATOR)));
    expect(must(s.read((x) => listReleaseRecords(x))).map((x) => [x.release.id, x.sessionId])).toEqual([["rel-00000000000b", null], [ID, "night-drive"]]);
  });
});

describe("compare-and-swap", () => {
  it("a write naming another version writes nothing and answers the stored record, stale", () => {
    const s = tpl.fresh();
    const r = create(s);
    const edited = must(s.tx((t) => editIn(t, { id: ID, version: 1, edit: (x) => ({ ...x, title: "Night Drive II" }), type: "release.edited", data: { edit: "patch" } }, OPERATOR)));
    expect(edited.stale).toBe(false);
    expect(edited.record.version).toBe(2);
    expect(edited.record.release.title).toBe("Night Drive II");
    const late = must(s.tx((t) => editIn(t, { id: ID, version: r.version, edit: (x) => ({ ...x, title: "overwritten" }), type: "release.edited", data: {} }, OPERATOR)));
    expect(late).toEqual({ record: edited.record, stale: true });
    const lateProposal = must(propose(s, 1, [{ path: "genre.primary", value: "Pop", source: "the Suno style" }]));
    expect(lateProposal).toEqual({ record: edited.record, stale: true });
    expect(must(s.read((x) => readReleaseRecord(x, ID)))).toEqual(edited.record);
    expect(types(s)).toEqual(["release.created", "release.edited"]);
  });

  it("the table refuses a write that does not move the version by one", () => {
    const s = tpl.fresh();
    create(s);
    expect(refused(s.tx((t) => t.run("UPDATE releases SET version = 5 WHERE id = ?", ID)))).toMatch(/moves its version by exactly one/);
    expect(refused(s.tx((t) => t.run("UPDATE releases SET version = version + 1, session_id = 'other' WHERE id = ?", ID)))).toMatch(/fixed at birth/);
  });

  it("an unknown release is not-found", () => {
    const s = tpl.fresh();
    expect(refused(s.tx((t) => editIn(t, { id: ID, version: 1, edit: (x) => x, type: "release.edited", data: {} }, OPERATOR)))).toBe(`not-found: release: no ${ID}`);
  });
});

describe("proposals", () => {
  it("are appended pending, the release untouched, one release.proposed", () => {
    const s = tpl.fresh();
    create(s);
    const w = must(propose(s, 1, [
      { path: "genre.primary", value: "Electronic", source: "the Suno style" },
      { path: "track:1.songwriters", value: ["Jane Doe"], source: "turn 7" },
    ]));
    expect(w.stale).toBe(false);
    expect(w.record.version).toBe(2);
    expect(w.record.release).toEqual(RELEASE);
    expect(w.record.pending.map((p) => [p.id, p.path, p.value, p.turnId])).toEqual([
      ["p-2-1", "genre.primary", "Electronic", "t-0007"],
      ["p-2-2", "track:1.songwriters", ["Jane Doe"], "t-0007"],
    ]);
    const ev = events(s).at(-1);
    expect([ev?.["actor_kind"], ev?.["type"]]).toEqual(["agent", "release.proposed"]);
  });

  it("one the release door refuses refuses the whole call with the door's sentence, nothing written", () => {
    const s = tpl.fresh();
    create(s);
    const bad = propose(s, 1, [
      { path: "genre.primary", value: "Electronic", source: "the Suno style" },
      { path: "genre.secondary", value: "Polka", source: "a guess" },
    ]);
    expect(refused(bad)).toMatch(/^invalid: proposal genre\.secondary/);
    expect(refused(propose(s, 1, [{ path: "track:2.title", value: "B-side", source: "turn 3" }]))).toBe("invalid: track:2.title names no field of this release (it has 1 track(s))");
    expect(refused(propose(s, 1, [{ path: "status", value: "published", source: "turn 3" }]))).toMatch(/^invalid: proposal 1/);
    expect(must(s.read((x) => readReleaseRecord(x, ID)))?.version).toBe(1);
    expect(types(s)).toEqual(["release.created"]);
  });

  it("accept applies the value through the door and drops the proposal; dismiss drops it alone", () => {
    const s = tpl.fresh();
    create(s);
    const p = must(propose(s, 1, [
      { path: "genre.primary", value: "Electronic", source: "the Suno style" },
      { path: "track:1.ai", value: { lyrics: true, music: true, audio: "all", persona: "ai" }, source: "the session" },
      { path: "sleevePrompt", value: "a night sea", source: "verse one" },
    ])).record;
    expect(refused(s.tx((t) => acceptIn(t, { id: ID, version: p.version, proposalIds: ["p-2-1"] }, AGENT)))).toMatch(/^refused: release: an agent proposes/);
    const a = must(s.tx((t) => acceptIn(t, { id: ID, version: p.version, proposalIds: ["p-2-2", "p-2-1"] }, OPERATOR))).record;
    expect(a.version).toBe(3);
    expect(a.release.genre.primary).toBe("Electronic");
    expect(a.release.tracks[0]?.ai.persona).toBe("ai");
    expect(a.pending.map((x) => x.id)).toEqual(["p-2-3"]);
    expect(refused(s.tx((t) => dismissIn(t, { id: ID, version: a.version, proposalIds: ["p-2-1"] }, OPERATOR)))).toBe(`not-found: release: ${ID} has no pending proposal p-2-1`);
    const d = must(s.tx((t) => dismissIn(t, { id: ID, version: a.version, proposalIds: ["p-2-3"] }, OPERATOR))).record;
    expect(d.version).toBe(4);
    expect(d.pending).toEqual([]);
    expect(d.release.sleevePrompt).toBeNull();
    expect(types(s)).toEqual(["release.created", "release.proposed", "release.accepted", "release.dismissed"]);
    expect(dataOf(events(s).at(-2)?.["data"])).toEqual({ version: 3, proposals: [{ id: "p-2-2", path: "track:1.ai" }, { id: "p-2-1", path: "genre.primary" }] });
  });

  it("an accept the release can no longer hold is refused whole", () => {
    const s = tpl.fresh();
    create(s);
    const p = must(propose(s, 1, [{ path: "track:1.title", value: "Night Drive (edit)", source: "turn 4" }])).record;
    const removed = must(s.tx((t) => editIn(t, { id: ID, version: p.version, edit: (x) => ({ ...x, tracks: [] }), type: "release.edited", data: { edit: "removeTrack" } }, OPERATOR))).record;
    expect(refused(s.tx((t) => acceptIn(t, { id: ID, version: removed.version, proposalIds: ["p-2-1"] }, OPERATOR)))).toBe("invalid: track:1.title names no field of this release (it has 0 track(s))");
    expect(must(s.read((x) => readReleaseRecord(x, ID)))?.pending.map((x) => x.id)).toEqual(["p-2-1"]);
  });
});

describe("edits", () => {
  it("are re-checked whole through the door; the Schedule press is release.scheduled", () => {
    const s = tpl.fresh();
    create(s);
    expect(refused(s.tx((t) => editIn(t, { id: ID, version: 1, edit: (x) => ({ ...x, language: "English" }), type: "release.edited", data: {} }, OPERATOR)))).toMatch(/^invalid: release rel-0123456789ab/);
    expect(refused(s.tx((t) => editIn(t, { id: ID, version: 1, edit: (x) => ({ ...x, id: "rel-ffffffffffff" }), type: "release.edited", data: {} }, OPERATOR)))).toMatch(/cannot make it rel-ffffffffffff/);
    const w = must(s.tx((t) => editIn(t, { id: ID, version: 1, edit: (x) => ({ ...x, status: "scheduled" }), type: "release.scheduled", data: { edit: "schedule" } }, OPERATOR)));
    expect(w.record.release.status).toBe("scheduled");
    expect(must(s.read((x) => x.get("SELECT status FROM releases WHERE id = ?", ID)))?.["status"]).toBe("scheduled");
    expect(types(s)).toEqual(["release.created", "release.scheduled"]);
  });
});

describe("the table", () => {
  it("never deletes a release, and holds the row to the release it carries", () => {
    const s = tpl.fresh();
    create(s);
    expect(refused(s.tx((t) => t.run("DELETE FROM releases WHERE id = ?", ID)))).toMatch(/a release is never deleted/);
    expect(refused(s.tx((t) => t.run("UPDATE releases SET version = version + 1, status = 'published' WHERE id = ?", ID)))).toMatch(/^conflict: store constraint/);
    expect(must(s.read((x) => readReleaseRecord(x, ID)))?.version).toBe(1);
  });
});
