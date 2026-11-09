// THE CHARACTER RECORD STORE (spark concept-casting-stages S2): the app's door over packages/kernel/src/characters.
// Importers read their pool (./characterPools.ts) and write through here; a character's pictures are held by their
// bytes in the blob store, so a record does not depend on where a pool's files sit. Parody-cast is refused by name.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { Actor, ActorKind } from "@gt/domain/event";
import type { CharacterId, CharacterRecord, CharacterUse, ProductionId } from "@gt/domain/production";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import type { CharacterImage } from "@gt/kernel/characters/schema";
import { matchCards, type CharacterMatch } from "@gt/kernel/characters/match";
import { characterUses, createCastCharacterIn, importCharacterIn, readCharacter, recordCharacterUseIn, saveCharacterIn, savedCharacters, sourceDigest, type CharacterImportRow, type ImportOutcome, type ImportPool, type NewCastCharacter } from "@gt/kernel/characters/store";
import type { Store } from "@gt/kernel/store";

import { blobRootOf, kernel } from "../kernelStore.ts";
import { digestOfRow, readPool, type PoolRoots, type PoolRow } from "./characterPools.ts";
import { mimeOf } from "./feeds/types.ts";

export type { CharacterMatch };
export type { ImportPool };

export type ImportReport = { readonly added: number; readonly updated: number; readonly unchanged: number; readonly covered: number; readonly skipped: readonly { readonly id: string; readonly reason: string }[] };

type Ingest = (row: PoolRow) => Promise<Result<readonly CharacterImage[]>>;

/** A row's files into the blob store, in order: content-addressed, so a second run stores nothing new. */
export const blobIngest = (blobs: BlobStore): Ingest => async (row) => {
  const out: CharacterImage[] = [];
  for (const f of row.files) {
    const mime = mimeOf(f.abs);
    if (mime === undefined) return err("invalid", `${path.basename(f.abs)} is not a picture the record can hold`);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(f.abs));
    } catch (e) {
      return err("not-found", `${f.abs} did not read: ${errorMessage(e)}`);
    }
    const ref = await blobs.put(bytes, mime);
    if (!ref.ok) return ref;
    out.push({ role: f.role, blob: ref.value });
  }
  return ok(out);
};

const OPERATOR_IMPORT: Actor = { kind: "operator", id: "characters-import" };

/** Importing a pool's rows: an unchanged source is skipped before any of its bytes are read. */
export async function importRows(store: Store, rows: readonly PoolRow[], ingest: Ingest, actor: Actor = OPERATOR_IMPORT): Promise<Result<ImportReport & { readonly outcomes: readonly ImportOutcome[] }>> {
  const n = { added: 0, updated: 0, unchanged: 0, covered: 0 };
  const skipped: { id: string; reason: string }[] = [];
  const outcomes: ImportOutcome[] = [];
  for (const row of rows) {
    const digest = await digestOfRow(row);
    const held = store.read((r) => sourceDigest(r, row.sourceKey));
    if (!held.ok) return held;
    if (held.value === digest) {
      n.unchanged++;
      continue;
    }
    const images = await ingest(row);
    if (!images.ok) {
      skipped.push({ id: row.sourceKey, reason: images.error.message });
      continue;
    }
    const input: CharacterImportRow = {
      pool: row.pool,
      sourceKey: row.sourceKey,
      digest,
      card: row.card,
      images: images.value,
      ...(row.samePerson === undefined ? {} : { samePerson: row.samePerson }),
      ...(row.audience === undefined ? {} : { audience: row.audience }),
      ...(row.slots === undefined ? {} : { slots: row.slots }),
    };
    const done = store.tx((t) => importCharacterIn(t, input, actor));
    if (!done.ok) {
      skipped.push({ id: row.sourceKey, reason: done.error.message });
      continue;
    }
    n[done.value.did]++;
    outcomes.push(done.value);
  }
  return ok({ ...n, skipped, outcomes });
}

export type ImportTarget = { readonly store: Store; readonly ingest: Ingest };

const processTarget = (): Result<ImportTarget> => {
  const k = kernel();
  return k.ok ? ok({ store: k.value.store, ingest: blobIngest(blobStore(blobRootOf(k.value.store))) }) : k;
};

/** Idempotent: importing a pool twice changes nothing. Parody-cast is refused by name. */
export async function importCharacters(pool: string, o: { readonly target?: ImportTarget; readonly roots?: PoolRoots } = {}): Promise<Result<ImportReport>> {
  const read = await readPool(pool, o.roots);
  if (!read.ok) return read;
  const target = o.target === undefined ? processTarget() : ok(o.target);
  if (!target.ok) return target;
  const done = await importRows(target.value.store, read.value.rows, target.value.ingest);
  if (!done.ok) return done;
  return ok({ added: done.value.added, updated: done.value.updated, unchanged: done.value.unchanged, covered: done.value.covered, skipped: [...read.value.skipped, ...done.value.skipped] });
}

const withStore = <T>(f: (store: Store) => Result<T>): Result<T> => {
  const k = kernel();
  return k.ok ? f(k.value.store) : k;
};

export async function characterById(id: CharacterId): Promise<Result<CharacterRecord>> {
  return withStore((s) => {
    const r = s.read((x) => readCharacter(x, id));
    if (!r.ok) return r;
    return r.value === undefined ? err("not-found", `character: no ${id}`) : ok(r.value);
  });
}

/** Text matching over the Library's cards, best first, each with why it matched: the candidates a round reuses. */
export async function matchCharacters(brief: string, limit: number): Promise<Result<readonly CharacterMatch[]>> {
  return withStore((s) => s.read((r) => matchCards(savedCharacters(r), brief, limit)));
}

const asActor = (by: string, actor: ActorKind | undefined): Actor => ({ kind: actor ?? "operator", id: by });

/** A character designed for one production: castable there, invisible to the Library until the operator saves it. */
export async function createCastCharacter(input: NewCastCharacter & { readonly by: string; readonly actor?: ActorKind }): Promise<Result<CharacterRecord>> {
  const { by, actor, ...character } = input;
  return withStore((s) => s.tx((t) => createCastCharacterIn(t, character, asActor(by, actor))));
}

/** Design and save at once: the operator's optional save on a new pick. */
export async function saveCastCharacter(input: NewCastCharacter & { readonly by: string; readonly actor?: ActorKind }): Promise<Result<CharacterRecord>> {
  const { by, actor, ...character } = input;
  return withStore((s) => s.tx((t) => createCastCharacterIn(t, { ...character, save: true }, asActor(by, actor))));
}

/** The operator keeps an existing character in the Library. An agent is refused. */
export async function saveCharacterToLibrary(input: { readonly id: CharacterId; readonly by: string; readonly actor?: ActorKind }): Promise<Result<CharacterRecord>> {
  return withStore((s) => s.tx((t) => saveCharacterIn(t, input.id, asActor(input.by, input.actor))));
}

/** Log a use (`character.used`), once per character and production, so the used-by list can answer. */
export async function recordCharacterUse(input: { readonly id: CharacterId; readonly productionId: ProductionId; readonly by: string; readonly actor?: ActorKind }): Promise<Result<void>> {
  return withStore((s) => s.tx((t) => recordCharacterUseIn(t, { id: input.id, productionId: input.productionId }, asActor(input.by, input.actor))));
}

export async function usedBy(id: CharacterId): Promise<Result<readonly CharacterUse[]>> {
  return withStore((s) => s.read((r) => characterUses(r, id)));
}
