import { afterAll, describe, expect, it } from "vitest";

import type { Actor } from "@gt/domain/event";
import { CHARACTER_ID_RE, type ProductionBoard, type ProductionId } from "@gt/domain/production";

import { matchCards } from "../src/characters/match.ts";
import { characterMigrations } from "../src/characters/schema.ts";
import { allCharacterUses, characterOfSource, characterUses, createCastCharacterIn, importCharacterIn, mintCharacterId, readCharacter, recordCharacterUseIn, saveCharacterIn, savedCharacters, sourceDigest, sourcesOfPool, type CharacterImportRow } from "../src/characters/store.ts";
import { eventsMigrations } from "../src/events.ts";
import { productionMigrations } from "../src/productions/schema.ts";
import { startProductionIn } from "../src/productions/store.ts";
import type { Store } from "../src/store.ts";
import { must, steppingClock, templateStores } from "./helpers.ts";

// THE CHARACTER RECORD (spark concept-casting-stages S2): a stable id that is not the name, an import that writes
// nothing when nothing changed, a person seen through two pools is one record whichever pool ran first, a use survives
// as a keyed event, and matching says why it matched.

const tpl = templateStores([eventsMigrations, productionMigrations, characterMigrations], { clock: steppingClock("2026-11-09T01:00:00.000Z") });
afterAll(() => tpl.dispose());

const OP: Actor = { kind: "operator", id: "owner" };
const AGENT: Actor = { kind: "agent", id: "athena" };
const BLOB = (c: string) => ({ sha256: c.repeat(64), bytes: 4, mime: "image/png" });
const img = (role: string, c: string) => ({ role, blob: BLOB(c) });

const row = (over: Partial<CharacterImportRow> = {}): CharacterImportRow => ({
  pool: "muse-army",
  sourceKey: "muse-army:r/a-1",
  digest: "d1",
  card: { name: "Bora", look: "glossy black hair, a slim build", personality: "An archer for an action game.", age: 32 },
  images: [img("portrait", "a")],
  slots: { role: "archer", use: "action game", rating: "yes" },
  ...over,
});

const imported = (s: Store, r: CharacterImportRow) => must(s.tx((t) => importCharacterIn(t, r, OP)));
const count = (s: Store, table: string) => Number(must(s.read((r) => r.get(`SELECT count(*) AS n FROM ${table}`)))?.["n"]);
const events = (s: Store) => must(s.read((r) => r.all("SELECT type, subject_id FROM events ORDER BY seq"))).map((e) => String(e["type"]));
const refused = (r: { ok: boolean; error?: { code: string; message: string } }) => (r.ok ? "ok" : `${r.error?.code}: ${r.error?.message}`);

const BOARD: ProductionBoard = { logline: "A bell rings.", aspect: "16:9", panels: [{ id: "panel-1", beat: "strike", prompt: "bell", still: BLOB("b") }] };
const production = (s: Store, ref: string, title: string): ProductionId => must(s.tx((t) => startProductionIn(t, { source: { kind: "episode", ref }, title, board: BOARD }, OP))).id;

describe("a character id", () => {
  it("is a stable ulid the contract accepts, and is not the name", () => {
    expect(mintCharacterId("2026-11-09T01:00:00.000Z")).toMatch(CHARACTER_ID_RE);
    const s = tpl.fresh();
    const one = imported(s, row());
    const two = imported(s, row({ sourceKey: "muse-army:r/a-2" }));
    expect(one.id).not.toBe(two.id);
    expect(must(s.read((r) => savedCharacters(r))).map((c) => c.card.name)).toEqual(["Bora", "Bora"]);
  });
});

describe("the import", () => {
  it("twice changes nothing: no row, no event", () => {
    const s = tpl.fresh();
    const first = imported(s, row());
    expect(first.did).toBe("added");
    const before = must(s.read((r) => readCharacter(r, first.id)));
    expect(events(s)).toEqual(["character.added"]);
    expect(imported(s, row())).toEqual({ did: "unchanged", id: first.id });
    expect(count(s, "characters")).toBe(1);
    expect(events(s)).toEqual(["character.added"]);
    expect(must(s.read((r) => readCharacter(r, first.id)))).toEqual(before);
    expect(must(s.read((r) => sourceDigest(r, "muse-army:r/a-1")))).toBe("d1");
  });

  it("an edited source updates its record by its key, keeping the id and writing one event", () => {
    const s = tpl.fresh();
    const first = imported(s, row());
    const second = imported(s, row({ digest: "d2", card: { ...row().card, look: "cropped silver hair" } }));
    expect(second).toEqual({ did: "updated", id: first.id });
    expect(must(s.read((r) => readCharacter(r, first.id)))?.card.look).toBe("cropped silver hair");
    expect(count(s, "characters")).toBe(1);
    expect(events(s)).toEqual(["character.added", "character.updated"]);
  });

  it("a touched file with the same words and pictures only moves the digest", () => {
    const s = tpl.fresh();
    const first = imported(s, row());
    expect(imported(s, row({ digest: "d2" }))).toEqual({ did: "unchanged", id: first.id });
    expect(events(s)).toEqual(["character.added"]);
    expect(must(s.read((r) => sourceDigest(r, "muse-army:r/a-1")))).toBe("d2");
  });

  const codex = (over: Partial<CharacterImportRow> = {}): CharacterImportRow =>
    row({ pool: "codex-kept", sourceKey: "codex-kept:d/char-a-1", samePerson: "muse-army:r/a-1", digest: "c1", images: [img("portrait", "a"), img("sheet", "c")], ...over });

  it("one person through two pools is one record, codex-kept first", () => {
    const s = tpl.fresh();
    const c = imported(s, codex());
    expect(c.did).toBe("added");
    expect(imported(s, row())).toEqual({ did: "covered", id: c.id });
    expect(imported(s, row())).toEqual({ did: "unchanged", id: c.id });
    expect(count(s, "characters")).toBe(1);
    const held = must(s.read((r) => readCharacter(r, c.id)));
    expect(held).toMatchObject({ origin: "codex-kept", sheet: `/api/blob/${"c".repeat(64)}?type=image%2Fpng` });
    expect(held?.images).toHaveLength(2);
  });

  it("the same record when the muse-army card came first: the kept set wins and keeps the id", () => {
    const s = tpl.fresh();
    const m = imported(s, row());
    expect(imported(s, codex())).toEqual({ did: "updated", id: m.id });
    expect(imported(s, row())).toEqual({ did: "unchanged", id: m.id });
    expect(count(s, "characters")).toBe(1);
    expect(must(s.read((r) => readCharacter(r, m.id)))?.origin).toBe("codex-kept");
    expect(must(s.read((r) => characterOfSource(r, "codex-kept:d/char-a-1")))?.id).toBe(m.id);
    expect([...must(s.read((r) => sourcesOfPool(r, "codex-kept"))).keys()]).toEqual(["codex-kept:d/char-a-1"]);
  });

  it("an edited muse-army card does not move a record its kept set holds", () => {
    const s = tpl.fresh();
    const c = imported(s, codex());
    imported(s, row());
    expect(imported(s, row({ digest: "d2", card: { ...row().card, look: "changed" } })).did).toBe("covered");
    expect(must(s.read((r) => readCharacter(r, c.id)))?.card.look).not.toBe("changed");
  });
});

describe("the library", () => {
  it("a cast character exists but is not saved until the operator saves it", () => {
    const s = tpl.fresh();
    const c = must(s.tx((t) => createCastCharacterIn(t, { card: { name: "Mira", look: "red coat", personality: "a smuggler", age: 41 }, images: [img("portrait", "d")] }, OP)));
    expect(c.savedToLibrary).toBeUndefined();
    expect(must(s.read((r) => savedCharacters(r)))).toEqual([]);
    expect(refused(s.tx((t) => saveCharacterIn(t, c.id, AGENT)))).toMatch(/refused: character: only the operator saves/);
    expect(must(s.tx((t) => saveCharacterIn(t, c.id, OP))).savedToLibrary).toBe(true);
    expect(must(s.read((r) => savedCharacters(r))).map((x) => x.id)).toEqual([c.id]);
    must(s.tx((t) => saveCharacterIn(t, c.id, OP)));
    expect(events(s).filter((e) => e === "character.saved")).toHaveLength(1);
  });

  it("an agent cannot design and save in one step", () => {
    const s = tpl.fresh();
    expect(refused(s.tx((t) => createCastCharacterIn(t, { card: { name: "Mira", look: "red coat", personality: "a smuggler", age: 41 }, images: [], save: true }, AGENT)))).toMatch(/refused: character: only the operator saves/);
    expect(count(s, "characters")).toBe(0);
  });
});

describe("a use", () => {
  it("is one event per character and production, listed by production title", () => {
    const s = tpl.fresh();
    const c = imported(s, row());
    const p = production(s, "F1-11", "The Pour");
    const other = production(s, "F1-12", "The Mould");
    must(s.tx((t) => recordCharacterUseIn(t, { id: c.id, productionId: p }, OP)));
    must(s.tx((t) => recordCharacterUseIn(t, { id: c.id, productionId: p }, OP)));
    must(s.tx((t) => recordCharacterUseIn(t, { id: c.id, productionId: other }, OP)));
    expect(events(s).filter((e) => e === "character.used")).toHaveLength(2);
    expect(must(s.read((r) => characterUses(r, c.id))).map((u) => [u.productionId, u.label])).toEqual([
      [p, "The Pour"],
      [other, "The Mould"],
    ]);
    expect(must(s.read((r) => allCharacterUses(r))).get(c.id)).toHaveLength(2);
  });

  it("is refused for a production or a character that does not exist", () => {
    const s = tpl.fresh();
    const c = imported(s, row());
    expect(refused(s.tx((t) => recordCharacterUseIn(t, { id: c.id, productionId: "prdn:nope" }, OP)))).toBe("not-found: character: no production prdn:nope");
    const other = production(s, "F1-13", "Other");
    expect(refused(s.tx((t) => recordCharacterUseIn(t, { id: "chr:00000000000000000000000000", productionId: other }, OP)))).toMatch(/not-found: character: no chr:0/);
  });

  it("a character is never deleted", () => {
    const s = tpl.fresh();
    imported(s, row());
    expect(refused(s.tx((t) => t.run("DELETE FROM characters")))).toMatch(/never deleted/);
  });
});

describe("matching", () => {
  const list = (s: Store) => must(s.read((r) => savedCharacters(r)));
  const setUp = () => {
    const s = tpl.fresh();
    imported(s, row());
    imported(s, row({ sourceKey: "muse-army:r/a-2", card: { name: "Mare", look: "red hair, freckled cheeks", personality: "A mage for a fantasy game.", age: 29 }, slots: { role: "mage", use: "fantasy game", wardrobe: "flowing robes", rating: "yes" } }));
    imported(s, row({ sourceKey: "muse-army:r/a-3", card: { name: "Greta", look: "pale, angular", personality: "A mage for a fantasy game.", age: 40 }, slots: { role: "mage", use: "fantasy game", rating: "no" } }));
    return s;
  };

  it("ranks by the role's words and says which field each hit", () => {
    const s = setUp();
    const m = matchCards(list(s), "a freckled mage with red hair in flowing robes", 5);
    expect(m[0]?.character.card.name).toBe("Mare");
    expect(m[0]?.why).toEqual(expect.arrayContaining(["role: mage", "look: freckled, red, hair", "wardrobe: flowing, robes"]));
    expect(m.every((x) => x.score > 0)).toBe(true);
  });

  it("a character the operator rated no sinks below every other match", () => {
    const s = setUp();
    const m = matchCards(list(s), "a pale mage", 5);
    expect(m.map((x) => x.character.card.name)).toEqual(["Mare", "Greta"]);
  });

  it("a word nobody has, and an empty brief, return nothing", () => {
    const s = setUp();
    expect(matchCards(list(s), "zzz qqq", 5)).toEqual([]);
    expect(matchCards(list(s), "the and of", 5)).toEqual([]);
  });

  it("stops at the limit and folds plurals", () => {
    const s = setUp();
    expect(matchCards(list(s), "mages", 1).map((x) => x.character.card.name)).toEqual(["Mare"]);
  });
});
