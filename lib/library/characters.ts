// THE CHARACTER RECORD STORE (spark concept-casting-stages S0): the final signatures S2 fills. A stub so casting and
// the Library feed compile against one shape; every body refuses until S2 lands the kernel store and the importers.

import type { Result } from "@gt/domain/errors";
import type { CharacterId, CharacterOrigin, CharacterRecord, CharacterUse, ProductionId } from "@gt/domain/production";

const notBuilt = (fn: string): never => {
  throw new Error(`lib/library/characters.ts: ${fn} is not built yet (S2)`);
};

/** A pool an importer reads. Parody-cast is never one: its references are fan-site images. */
export type ImportPool = Exclude<CharacterOrigin, "casting-new">;

/** Idempotent: importing a pool twice changes nothing. */
export async function importCharacters(pool: ImportPool): Promise<Result<{ readonly added: number; readonly unchanged: number }>> {
  return notBuilt(`importCharacters(${pool})`);
}

export async function characterById(id: CharacterId): Promise<Result<CharacterRecord>> {
  return notBuilt(`characterById(${id})`);
}

/** Text matching over cards, best first: the candidates a round reuses. */
export async function matchCharacters(brief: string, limit: number): Promise<Result<readonly CharacterRecord[]>> {
  return notBuilt(`matchCharacters(${brief.length} chars, ${limit})`);
}

/** Save a character designed in a round; only on the operator's optional save. */
export async function saveCastCharacter(input: Pick<CharacterRecord, "card" | "images" | "voiceId"> & { readonly by: string }): Promise<Result<CharacterRecord>> {
  return notBuilt(`saveCastCharacter(${input.card.name})`);
}

/** Log a use (`character.used`), so the used-by list can answer. */
export async function recordCharacterUse(input: { readonly id: CharacterId; readonly productionId: ProductionId; readonly by: string }): Promise<Result<void>> {
  return notBuilt(`recordCharacterUse(${input.id})`);
}

export async function usedBy(id: CharacterId): Promise<Result<readonly CharacterUse[]>> {
  return notBuilt(`usedBy(${id})`);
}
