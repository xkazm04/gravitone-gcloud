import "server-only";

import type { Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { err, type Result } from "@gt/domain/errors";

// A YuE2 TAKE'S FACTS (spark yue2-song-lab, WP0 stub -> WP2): `<soundStoreRoot>/yue2-facts.json`,
// `{version:1, facts:{[takeId]: Yue2TakeFacts}}`, written under the sound store's lock (precedent
// lib/sound/suno/facts.ts). A take without facts is not a YuE2 take; every reader treats it so.

export const YUE2_FACTS_FILE = "yue2-facts.json" as const;

/** The facts of the given takes; a take with none is simply absent from the record. */
export async function readYue2Facts(takeIds: readonly string[]): Promise<Result<Readonly<Record<string, Yue2TakeFacts>>>> {
  void takeIds;
  return err("unavailable", "yue2: facts are not built yet (WP2)");
}

/** Every YuE2 take id with its facts (the lab's listing). */
export async function allYue2Facts(): Promise<Result<Readonly<Record<string, Yue2TakeFacts>>>> {
  return err("unavailable", "yue2: facts are not built yet (WP2)");
}

/** File the facts of one take (idempotent: the same facts again is a no-op; other facts is a conflict). */
export async function putYue2Facts(takeId: string, facts: Yue2TakeFacts): Promise<Result<Yue2TakeFacts>> {
  void takeId;
  void facts;
  return err("unavailable", "yue2: facts are not built yet (WP2)");
}
