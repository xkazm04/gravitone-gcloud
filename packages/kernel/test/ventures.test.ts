import { afterAll, describe, expect, it } from "vitest";
import type { Actor } from "@gt/domain/event";
import { eventsMigrations } from "../src/events.ts";
import type { Store } from "../src/store.ts";
import { ventureMigrations } from "../src/ventures/schema.ts";
import {
  bornGenre,
  bornVenture,
  listGenres,
  listVentures,
  readGenre,
  readVenture,
  retireGenre,
  retireVenture,
  type GenreBirth,
  type VentureBirth,
} from "../src/ventures/store.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

const tpl = templateStores([eventsMigrations, ventureMigrations], { clock: steppingClock("2026-10-25T01:00:00.000Z") });
afterAll(() => tpl.dispose());

const OPERATOR: Actor = { kind: "operator", id: "owner" };
const AGENT: Actor = { kind: "agent", id: "athena" };

const GENRE: GenreBirth = {
  name: "Deadpan office satire, painted 3D",
  bornFrom: "2026-10-20/c-07",
  proposal: "2026-10-21/c-31",
  use: "a 30 s Short: one office ritual, taken literally",
  look: "painted 3D",
  grammar: ["the ritual", "the literal reading", "the shrug"],
};
const genre = (over: Partial<GenreBirth> = {}): GenreBirth => ({ ...GENRE, ...over });
const channel = (genres: readonly string[], proposal = "2026-10-24/c-40"): VentureBirth => ({
  name: "Office Hours",
  kind: "channel",
  proposal,
  frame: { tone: "deadpan, dark", audience: "office workers", format: "a 30 s vertical Short", look: "painted 3D", genres },
});

const events = (s: Store) => must(s.read((r) => r.all("SELECT actor_kind, actor_id, type, subject_kind, subject_id, data FROM events ORDER BY seq")));
const ops = (s: Store) => must(s.read((r) => r.all("SELECT subject_kind, subject_id, op, actor_kind, data FROM venture_ops ORDER BY seq")));
const codeOf = (r: { ok: boolean; error?: { code: string; message: string } }) => (r.ok ? "ok" : `${r.error?.code}: ${r.error?.message}`);
const birthG = (s: Store, b: GenreBirth = GENRE) => must(s.tx((t) => bornGenre(t, b, OPERATOR)));

describe("genres", () => {
  it("a birth reads back whole, with no venture and no retirement, and writes one op and one event", () => {
    const s = tpl.fresh();
    const g = birthG(s);
    expect(g.id).toBe("gn-deadpan-office-satire-painted-3d");
    expect(g).not.toHaveProperty("ventureId");
    expect(g).not.toHaveProperty("retiredAt");
    expect(g).toMatchObject({ name: GENRE.name, bornFrom: GENRE.bornFrom, proposal: GENRE.proposal, use: GENRE.use, look: GENRE.look, grammar: GENRE.grammar, by: "owner" });
    expect(must(s.read((r) => readGenre(r, g.id)))).toEqual(g);
    expect(must(s.read((r) => listGenres(r)))).toEqual([g]);
    expect(events(s)).toEqual([
      { actor_kind: "operator", actor_id: "owner", type: "genre.born", subject_kind: "genre", subject_id: g.id, data: JSON.stringify({ bornFrom: GENRE.bornFrom, name: GENRE.name, proposal: GENRE.proposal }) },
    ]);
    expect(ops(s).map((o) => o["op"])).toEqual(["born"]);
    expect(must(s.read((r) => readGenre(r, "gn-nothing")))).toBeUndefined();
  });

  it("a redelivered proposal returns the genre it birthed and writes nothing", () => {
    const s = tpl.fresh();
    const first = birthG(s);
    const again = must(s.tx((t) => bornGenre(t, genre({ name: "something else entirely" }), AGENT)));
    expect(again).toEqual(first);
    expect(must(s.read((r) => listGenres(r)))).toHaveLength(1);
    expect(events(s)).toHaveLength(1);
    expect(ops(s)).toHaveLength(1);
  });

  it("a name already taken mints -2, then -3; oldest birth lists first", () => {
    const s = tpl.fresh();
    const a = birthG(s);
    const b = birthG(s, genre({ proposal: "2026-10-22/c-02" }));
    const c = birthG(s, genre({ proposal: "2026-10-23/c-03" }));
    expect([a.id, b.id, c.id]).toEqual(["gn-deadpan-office-satire-painted-3d", "gn-deadpan-office-satire-painted-3d-2", "gn-deadpan-office-satire-painted-3d-3"]);
    expect(must(s.read((r) => listGenres(r))).map((g) => g.id)).toEqual([a.id, b.id, c.id]);
  });

  it("refuses a birth with an empty name or a reference that is not <night>/<c-id>", () => {
    const s = tpl.fresh();
    expect(codeOf(s.tx((t) => bornGenre(t, genre({ name: "  " }), OPERATOR)))).toMatch(/^invalid/);
    expect(codeOf(s.tx((t) => bornGenre(t, genre({ proposal: "c-31" }), OPERATOR)))).toMatch(/^invalid/);
    expect(events(s)).toEqual([]);
  });

  it("retiring is the operator's, terminal, and once", () => {
    const s = tpl.fresh();
    const g = birthG(s);
    expect(codeOf(s.tx((t) => retireGenre(t, g.id, AGENT)))).toMatch(/^refused: retiring genre .* operator's act/);
    const r = must(s.tx((t) => retireGenre(t, g.id, OPERATOR)));
    expect(r.retiredAt).toBeDefined();
    expect(codeOf(s.tx((t) => retireGenre(t, g.id, OPERATOR)))).toMatch(/^refused: genre .* was retired/);
    expect(codeOf(s.tx((t) => retireGenre(t, "gn-ghost", OPERATOR)))).toMatch(/^not-found/);
    expect(events(s).map((e) => e["type"])).toEqual(["genre.born", "genre.retired"]);
    expect(must(s.read((rd) => listGenres(rd)))).toEqual([r]);
  });
});

describe("ventures", () => {
  it("a channel ties each named genre to itself in the birth's transaction", () => {
    const s = tpl.fresh();
    const g1 = birthG(s);
    const g2 = birthG(s, genre({ name: "Quiet horror", proposal: "2026-10-22/c-09" }));
    const v = must(s.tx((t) => bornVenture(t, channel([g1.id, g2.id]), OPERATOR)));
    expect(v.id).toBe("vn-office-hours");
    expect(v).not.toHaveProperty("retiredAt");
    expect(v.frame).not.toHaveProperty("characters");
    expect(v.frame.genres).toEqual([g1.id, g2.id]);
    expect(must(s.read((r) => readVenture(r, v.id)))).toEqual(v);
    expect(must(s.read((r) => listGenres(r))).map((g) => g.ventureId)).toEqual([v.id, v.id]);
    expect(ops(s).map((o) => `${String(o["subject_id"])} ${String(o["op"])}`)).toEqual([`${g1.id} born`, `${g2.id} born`, `${v.id} born`, `${g1.id} tied`, `${g2.id} tied`]);
    expect(events(s).map((e) => e["type"])).toEqual(["genre.born", "genre.born", "venture.born"]);
  });

  it("a redelivered venture proposal returns the venture and writes nothing", () => {
    const s = tpl.fresh();
    const g = birthG(s);
    const v = must(s.tx((t) => bornVenture(t, channel([g.id]), OPERATOR)));
    const before = events(s).length;
    expect(must(s.tx((t) => bornVenture(t, channel([g.id]), OPERATOR)))).toEqual(v);
    expect(events(s)).toHaveLength(before);
    expect(must(s.read((r) => listVentures(r)))).toEqual([v]);
  });

  it("a channel refuses no genre, an unknown genre, a retired genre and a genre already tied - and writes nothing", () => {
    const s = tpl.fresh();
    const live = birthG(s);
    const gone = birthG(s, genre({ name: "Gone", proposal: "2026-10-22/c-05" }));
    must(s.tx((t) => retireGenre(t, gone.id, OPERATOR)));
    const before = events(s).length;
    expect(codeOf(s.tx((t) => bornVenture(t, channel([]), OPERATOR)))).toMatch(/^invalid: a channel is born from at least one genre/);
    expect(codeOf(s.tx((t) => bornVenture(t, channel([live.id, "gn-ghost"]), OPERATOR)))).toMatch(/^not-found: .*gn-ghost/);
    expect(codeOf(s.tx((t) => bornVenture(t, channel([live.id, gone.id]), OPERATOR)))).toMatch(/^refused: .*retired/);
    expect(events(s)).toHaveLength(before);
    expect(must(s.read((r) => readGenre(r, live.id)))).not.toHaveProperty("ventureId");
    must(s.tx((t) => bornVenture(t, channel([live.id]), OPERATOR)));
    expect(codeOf(s.tx((t) => bornVenture(t, channel([live.id], "2026-10-25/c-01"), OPERATOR)))).toMatch(/^conflict: genre .* already produces for vn-office-hours/);
  });

  it("an album may name no genre and ties none; a game is refused until S4", () => {
    const s = tpl.fresh();
    const album: VentureBirth = { name: "Night Drive", kind: "album", proposal: "2026-10-24/c-50", frame: { tone: "warm", audience: "late listeners", format: "a 10-track album", look: "synthwave", genres: [], characters: ["Mara"] } };
    const a = must(s.tx((t) => bornVenture(t, album, OPERATOR)));
    expect(a).toMatchObject({ id: "vn-night-drive", kind: "album", frame: { genres: [], characters: ["Mara"] } });
    const game: VentureBirth = { ...album, name: "Dungeon", kind: "game", proposal: "2026-10-24/c-51" };
    expect(codeOf(s.tx((t) => bornVenture(t, game, OPERATOR)))).toMatch(/^refused: .*S4/);
    expect(must(s.read((r) => listVentures(r))).map((v) => v.id)).toEqual(["vn-night-drive"]);
  });

  it("retiring a venture is the operator's, terminal, and once", () => {
    const s = tpl.fresh();
    const g = birthG(s);
    const v = must(s.tx((t) => bornVenture(t, channel([g.id]), OPERATOR)));
    expect(codeOf(s.tx((t) => retireVenture(t, v.id, { kind: "machine", id: "worker" })))).toMatch(/^refused: .*operator's act/);
    expect(must(s.tx((t) => retireVenture(t, v.id, OPERATOR))).retiredAt).toBeDefined();
    expect(codeOf(s.tx((t) => retireVenture(t, v.id, OPERATOR)))).toMatch(/^refused: venture .* was retired/);
    expect(events(s).map((e) => e["type"]).slice(-1)).toEqual(["venture.retired"]);
  });
});

describe("the schema holds the store's rules against a hand edit", () => {
  const raw = (s: Store, sql: string) => codeOf(s.tx((t) => t.run(sql)));

  it("venture_ops refuses UPDATE and DELETE", () => {
    const s = tpl.fresh();
    birthG(s);
    expect(raw(s, "UPDATE venture_ops SET op = 'retired'")).toMatch(/append-only/);
    expect(raw(s, "DELETE FROM venture_ops")).toMatch(/append-only/);
  });

  it("a retired head is never un-retired or retired again; a head is never deleted nor rewritten", () => {
    const s = tpl.fresh();
    const g = birthG(s);
    const v = must(s.tx((t) => bornVenture(t, channel([g.id]), OPERATOR)));
    must(s.tx((t) => retireGenre(t, g.id, OPERATOR)));
    must(s.tx((t) => retireVenture(t, v.id, OPERATOR)));
    expect(raw(s, "UPDATE genres SET retired_at = NULL")).toMatch(/terminal/);
    expect(raw(s, "UPDATE genres SET retired_at = '2099-01-01T00:00:00.000Z'")).toMatch(/terminal/);
    expect(raw(s, "UPDATE ventures SET retired_at = NULL")).toMatch(/terminal/);
    expect(raw(s, "DELETE FROM genres")).toMatch(/never deleted/);
    expect(raw(s, "DELETE FROM ventures")).toMatch(/never deleted/);
    expect(raw(s, "UPDATE genres SET name = 'renamed'")).toMatch(/fixed when it is born/);
    expect(raw(s, "UPDATE ventures SET frame = '{\"genres\":[]}'")).toMatch(/fixed when it is born/);
    expect(raw(s, "UPDATE genres SET venture_id = NULL")).toMatch(/tied to one venture, once/);
  });

  it("a row that does not parse refuses the read rather than reads short", () => {
    const s = tpl.fresh();
    must(s.tx((t) => t.run("INSERT INTO genres (id, name, born_from, proposal, use, look, grammar, born_at, born_by_kind, born_by) VALUES ('gn-x', 'x', 'n/c', 'n/c', 'u', 'l', '[1]', 'now', 'operator', 'o')")));
    expect(codeOf(s.read((r) => listGenres(r)))).toMatch(/^invalid: genre gn-x grammar/);
  });
});
