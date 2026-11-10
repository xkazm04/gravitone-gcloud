// THE CHARACTER RECORD, THE STORE'S HALF (spark concept-casting-stages S2). The tables and the row door are ./schema.ts.
//
// Every write is one transaction: the row and ONE ledger event per thing that happened (`character.added`,
// `character.updated`, `character.saved`, `character.used`). An unchanged import writes nothing at all.
//
// ONE PERSON, TWO POOLS. A kept Codex set is drawn from a muse-army card: the same woman, so one record. An import row
// may name that card's source key as `samePerson`; the record is found by either key, the higher pool's words and
// pictures win whichever order the pools ran in, and the lower pool then adds nothing (`covered`).

import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { BlobRef } from "@gt/domain/blob";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import {
  CHARACTER_ID_RE,
  PRODUCTION_EVENTS,
  characterCardSchema,
  characterRecordSchema,
  type CharacterAudience,
  type CharacterCard,
  type CharacterOrigin,
  type CharacterRecord,
  type CharacterUse,
} from "@gt/domain/production";

import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { Reader, Row, Tx } from "../store.ts";
import { CHARACTER_COLUMNS, characterImagesSchema, characterRowSchema, slotsSchema, type CharacterImage } from "./schema.ts";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/** Slots through the door; the door types a record's values as maybe-absent, and it dropped none. */
const parsedSlots = (v: unknown): Readonly<Record<string, string>> => must(parseAt("character slots", slotsSchema, v)) as Readonly<Record<string, string>>;

/** A blob's served address (app/api/blob/[sha]). */
const served = (b: BlobRef): string => `/api/blob/${b.sha256}?type=${encodeURIComponent(b.mime)}`;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** `chr:<ulid>`: the transaction's instant in ten letters, then sixteen random ones. */
export function mintCharacterId(atIso: string, random: Uint8Array = randomBytes(16)): string {
  let n = Date.parse(atIso);
  if (!Number.isFinite(n)) throw new AppError("internal", `character: cannot mint an id at ${atIso}`);
  let time = "";
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD.charAt(n % 32) + time;
    n = Math.floor(n / 32);
  }
  let rest = "";
  for (let i = 0; i < 16; i++) rest += CROCKFORD.charAt((random[i] ?? 0) % 32);
  const id = `chr:${time}${rest}`;
  if (!CHARACTER_ID_RE.test(id)) throw new AppError("internal", `character: minted an id the contract refuses: ${id}`);
  return id;
}

type Stored = { readonly record: CharacterRecord; readonly images: readonly CharacterImage[] };

function toStored(row: Row): Stored {
  const r = must(parseAt("character row", characterRowSchema, row));
  const images = must(parseJsonAt(`character ${r.id} images`, characterImagesSchema, r.images));
  const sheet = images.find((i) => i.role === "sheet");
  return {
    images,
    record: must(
      parseAt("character", characterRecordSchema, {
        id: r.id,
        origin: r.origin,
        card: must(parseJsonAt(`character ${r.id} card`, characterCardSchema, r.card)),
        images: images.map((i) => served(i.blob)),
        ...(r.voice_id === null ? {} : { voiceId: r.voice_id }),
        ...(sheet === undefined ? {} : { sheet: served(sheet.blob) }),
        ...(r.audience === null ? {} : { audience: r.audience }),
        ...(r.slots === null ? {} : { slots: must(parseJsonAt(`character ${r.id} slots`, slotsSchema, r.slots)) as Readonly<Record<string, string>> }),
        ...(r.saved === 1 ? { savedToLibrary: true as const } : {}),
        createdAt: r.created_at,
      }),
    ) as CharacterRecord,
  };
}

const rowOf = (r: Reader, id: string): Row | undefined => r.get(`SELECT ${CHARACTER_COLUMNS} FROM characters WHERE id = ?`, id);

export function readCharacter(r: Reader, id: string): CharacterRecord | undefined {
  const row = rowOf(r, id);
  return row === undefined ? undefined : toStored(row).record;
}

/** Its pictures with their blobs, portrait first: what a round hands an engine as references. */
export function characterImages(r: Reader, id: string): readonly CharacterImage[] {
  const row = rowOf(r, id);
  return row === undefined ? [] : toStored(row).images;
}

/** The characters the Library shows, oldest first. */
export function savedCharacters(r: Reader): readonly CharacterRecord[] {
  return r.all(`SELECT ${CHARACTER_COLUMNS} FROM characters WHERE saved = 1 ORDER BY created_at, id`).map((row) => toStored(row).record);
}

const mustHave = (r: Reader, id: string): CharacterRecord => {
  const c = readCharacter(r, id);
  if (c === undefined) throw new AppError("not-found", `character: no ${id}`);
  return c;
};

const useDataSchema = z.object({ productionId: z.string().min(1) });

const POOL_RANK: Readonly<Record<CharacterOrigin, number>> = { "casting-new": 0, "muse-army": 1, "scout-character": 1, "codex-kept": 2 };

export type ImportPool = Exclude<CharacterOrigin, "casting-new">;

export type CharacterImportRow = {
  readonly pool: ImportPool;
  /** Stable across runs and machines: `muse-army:<run>/<id>`, `codex-kept:<date>/<set>`, `scout-character:<folded name>`. */
  readonly sourceKey: string;
  /** The key of the same person in a lower pool, when the source says so. */
  readonly samePerson?: string;
  /** What the source said, so an unchanged source writes nothing. */
  readonly digest: string;
  readonly card: CharacterCard;
  readonly images: readonly CharacterImage[];
  readonly audience?: CharacterAudience;
  readonly slots?: Readonly<Record<string, string>>;
};

export type ImportOutcome = { readonly did: "added" | "updated" | "unchanged" | "covered"; readonly id: string };

const sourceRow = (r: Reader, key: string): { readonly character_id: string; readonly digest: string } | undefined => {
  const row = r.get("SELECT character_id, digest FROM character_sources WHERE source_key = ?", key);
  return row === undefined ? undefined : { character_id: String(row["character_id"]), digest: String(row["digest"]) };
};

/** The digest a source key last imported, or undefined when it never has: the check that skips reading its bytes. */
export function sourceDigest(r: Reader, key: string): string | undefined {
  return sourceRow(r, key)?.digest;
}

/** One pool's source keys and the character each holds. */
export function sourcesOfPool(r: Reader, pool: ImportPool): ReadonlyMap<string, string> {
  return new Map(r.all("SELECT source_key, character_id FROM character_sources WHERE pool = ?", pool).map((row) => [String(row["source_key"]), String(row["character_id"])] as const));
}

/** The character a source key holds, if any. */
export function characterOfSource(r: Reader, key: string): CharacterRecord | undefined {
  const s = sourceRow(r, key);
  return s === undefined ? undefined : readCharacter(r, s.character_id);
}

const writeSource = (t: Tx, key: string, id: string, pool: ImportPool, digest: string): void => {
  t.run("INSERT INTO character_sources (source_key, character_id, pool, digest, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (source_key) DO UPDATE SET character_id = excluded.character_id, digest = excluded.digest, at = excluded.at", key, id, pool, digest, t.at);
};

const content = (x: { readonly card: CharacterCard; readonly images: readonly CharacterImage[]; readonly audience?: CharacterAudience | undefined; readonly slots?: Readonly<Record<string, string>> | undefined; readonly origin: CharacterOrigin }): string => canonical({ card: x.card, images: x.images, audience: x.audience ?? null, slots: x.slots ?? null, origin: x.origin });

/**
 * One source row, idempotently. Unchanged writes nothing. A changed source updates its record in place, keeping the
 * id. A new source mints a record, saved to the library: an import is the operator's pool. Emits `character.added` or
 * `character.updated` only when the record itself changed.
 */
export function importCharacterIn(t: Tx, row: CharacterImportRow, actor: Actor): ImportOutcome {
  const known = sourceRow(t, row.sourceKey);
  if (known !== undefined && known.digest === row.digest) return { did: "unchanged", id: known.character_id };
  const person = known ?? (row.samePerson === undefined ? undefined : sourceRow(t, row.samePerson));
  const card = must(parseAt("character card", characterCardSchema, row.card));
  const slots = row.slots === undefined ? undefined : parsedSlots(row.slots);
  const body = { card, images: must(parseAt("character images", characterImagesSchema, row.images)), audience: row.audience, slots, origin: row.pool };
  if (person !== undefined) {
    const id = person.character_id;
    const held = rowOf(t, id);
    if (held === undefined) throw new AppError("internal", `character: source ${row.sourceKey} points at a missing ${id}`);
    const was = toStored(held);
    writeSource(t, row.sourceKey, id, row.pool, row.digest);
    if (POOL_RANK[was.record.origin] > POOL_RANK[row.pool]) return { did: "covered", id };
    if (content({ card: was.record.card, images: was.images, audience: was.record.audience, slots: was.record.slots, origin: was.record.origin }) === content(body)) return { did: "unchanged", id };
    t.run("UPDATE characters SET origin = ?, name = ?, card = ?, images = ?, audience = ?, slots = ?, updated_at = ? WHERE id = ?", row.pool, card.name, canonical(card), canonical(body.images), row.audience ?? null, slots === undefined ? null : canonical(slots), t.at, id);
    append(t, { actor, type: PRODUCTION_EVENTS.characterUpdated, subject: { kind: "character", id }, data: { pool: row.pool, sourceKey: row.sourceKey } });
    return { did: "updated", id };
  }
  const id = mintCharacterId(t.at);
  t.run("INSERT INTO characters (id, origin, name, card, images, audience, slots, saved, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)", id, row.pool, card.name, canonical(card), canonical(body.images), row.audience ?? null, slots === undefined ? null : canonical(slots), t.at, t.at);
  writeSource(t, row.sourceKey, id, row.pool, row.digest);
  if (row.samePerson !== undefined) writeSource(t, row.samePerson, id, row.samePerson.startsWith("muse-army:") ? "muse-army" : row.pool, "");
  append(t, { actor, type: PRODUCTION_EVENTS.characterAdded, subject: { kind: "character", id }, data: { pool: row.pool, sourceKey: row.sourceKey } });
  return { did: "added", id };
}

export type NewCastCharacter = {
  readonly card: CharacterCard & { readonly age: number };
  readonly images: readonly CharacterImage[];
  readonly voiceId?: string;
  readonly audience?: CharacterAudience;
  readonly slots?: Readonly<Record<string, string>>;
};

/** Saving is the operator's: a character designed for a production stays there unless the operator keeps it. */
const refusalOfSave = (actor: Actor): string | undefined => (actor.kind === "operator" ? undefined : `character: only the operator saves a character to the library (${actor.kind} ${actor.id} tried)`);

/**
 * A character designed for one production: a record with an id, so a cast can point at it, and not in the Library or
 * any later match unless `save` is passed. `save` is the operator's. Emits `character.added`, and `character.saved` when saved.
 */
export function createCastCharacterIn(t: Tx, input: NewCastCharacter & { readonly save?: boolean }, actor: Actor): CharacterRecord {
  if (input.save === true) {
    const why = refusalOfSave(actor);
    if (why !== undefined) throw new AppError("refused", why);
  }
  const card = must(parseAt("character card", characterCardSchema, input.card));
  const images = must(parseAt("character images", characterImagesSchema, input.images));
  const slots = input.slots === undefined ? undefined : parsedSlots(input.slots);
  const id = mintCharacterId(t.at);
  t.run("INSERT INTO characters (id, origin, name, card, images, voice_id, audience, slots, saved, created_at, updated_at) VALUES (?, 'casting-new', ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, card.name, canonical(card), canonical(images), input.voiceId ?? null, input.audience ?? null, slots === undefined ? null : canonical(slots), input.save === true ? 1 : 0, t.at, t.at);
  append(t, { actor, type: PRODUCTION_EVENTS.characterAdded, subject: { kind: "character", id }, data: { pool: "casting-new" } });
  if (input.save === true) append(t, { actor, type: PRODUCTION_EVENTS.characterSaved, subject: { kind: "character", id }, data: {} });
  return mustHave(t, id);
}

/** The operator keeps a character in the library. Saving one already saved writes nothing. Emits `character.saved`. */
export function saveCharacterIn(t: Tx, id: string, actor: Actor): CharacterRecord {
  const why = refusalOfSave(actor);
  if (why !== undefined) throw new AppError("refused", why);
  const c = mustHave(t, id);
  if (c.savedToLibrary === true) return c;
  t.run("UPDATE characters SET saved = 1, updated_at = ? WHERE id = ?", t.at, id);
  append(t, { actor, type: PRODUCTION_EVENTS.characterSaved, subject: { kind: "character", id }, data: {} });
  return mustHave(t, id);
}

const USE_KEY = (id: string, productionId: string): string => `character:${id}:used:${productionId}`;

/**
 * A character used in a production: one `character.used` event per (character, production), append-only, so a use
 * outlives whatever the Library prunes. A use already logged writes nothing. Refused for a character or production
 * that does not exist.
 */
export function recordCharacterUseIn(t: Tx, input: { readonly id: string; readonly productionId: string }, actor: Actor): void {
  mustHave(t, input.id);
  if (t.get("SELECT 1 AS x FROM productions WHERE id = ?", input.productionId) === undefined) throw new AppError("not-found", `character: no production ${input.productionId}`);
  const key = USE_KEY(input.id, input.productionId);
  if (t.get("SELECT 1 AS x FROM events WHERE key = ?", key) !== undefined) return;
  append(t, { actor, type: PRODUCTION_EVENTS.characterUsed, subject: { kind: "character", id: input.id }, data: { productionId: input.productionId }, key });
}

function usesFrom(r: Reader, where: string, ...args: readonly string[]): ReadonlyMap<string, readonly CharacterUse[]> {
  const rows = r.all(`SELECT e.subject_id AS id, e.at AS at, e.data AS data FROM events e WHERE e.type = ?${where} ORDER BY e.seq`, PRODUCTION_EVENTS.characterUsed, ...args);
  const titles = new Map(r.all("SELECT id, title FROM productions").map((row) => [String(row["id"]), String(row["title"])] as const));
  const out = new Map<string, CharacterUse[]>();
  for (const row of rows) {
    const data = must(parseJsonAt("character use", useDataSchema, String(row["data"])));
    const id = String(row["id"]);
    const use = { productionId: data.productionId, label: titles.get(data.productionId) ?? data.productionId, at: String(row["at"]) } as CharacterUse;
    out.set(id, [...(out.get(id) ?? []), use]);
  }
  return out;
}

/** Where a character was used, oldest first. */
export function characterUses(r: Reader, id: string): readonly CharacterUse[] {
  return usesFrom(r, " AND e.subject_id = ?", id).get(id) ?? [];
}

/** Every character's uses, for the Library's one read. */
export function allCharacterUses(r: Reader): ReadonlyMap<string, readonly CharacterUse[]> {
  return usesFrom(r, "");
}
