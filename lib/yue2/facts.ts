import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Yue2TakeFacts } from "@gt/domain/audio.yue2";
import { parseYue2TakeFacts } from "@gt/domain/audio.yue2.schema";
import { err, ok, type Result } from "@gt/domain/errors";
import { canonical } from "@gt/kernel/canonical";

import { ID_RE, readTakes, SoundError, soundFailure, storeRoot, withStore, writeJsonAtomic, type StoreTx } from "../sound/store.ts";
import { createTakeTx, type IncomingFile } from "../sound/takes.ts";
import type { SoundTake } from "../sound/types.ts";

// A YuE2 TAKE'S FACTS (spark yue2-song-lab WP2): what the lab knows about one of its takes beyond the
// SoundTake row - the render's condition, the style and lyrics, the lineage of a post variant, the
// rights record. ONE json beside the takes, keyed by take id:
//
//   <root>/yue2-facts.json   { version: 1, facts: { [takeId]: Yue2TakeFacts } }
//
// written under the sound store's own lock (withStore) with its tmp+rename, as lib/sound/suno/facts.ts
// does suno-facts.json and for its reason (one lock, not two). A take without facts is not a YuE2
// take; every reader treats it so.
//
// A CORRUPT FILE is refused, never emptied (it throws, and the caller reports it). A RECORD its door
// refuses is skipped and named in `skipped` (readYue2FactsFile), never crashing the read and never
// overwritten by a put: a put onto a take whose record does not read is a conflict a person settles.
// A take id is in an answer only when BOTH the take and its record are held.

export const YUE2_FACTS_FILE = "yue2-facts.json" as const;
export const yue2FactsPath = (): string => path.join(storeRoot(), YUE2_FACTS_FILE);

type FactsFile = { version: 1; facts: Record<string, unknown> };

/** A record the door refused, by take id, with the door's sentence. */
export type Yue2FactsSkip = { readonly takeId: string; readonly reason: string };
export type Yue2FactsRead = { readonly facts: Readonly<Record<string, Yue2TakeFacts>>; readonly skipped: readonly Yue2FactsSkip[] };

/** The file as written, or why it cannot be read. A missing file is an empty one. */
async function readFactsFile(): Promise<FactsFile> {
  let raw: string;
  try {
    raw = await readFile(yue2FactsPath(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, facts: {} };
    throw e;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new SoundError(`${yue2FactsPath()} is not valid JSON (${(e as Error).message}); refusing to overwrite it`, 500);
  }
  const o = typeof parsed === "object" && parsed !== null ? (parsed as { version?: unknown; facts?: unknown }) : {};
  if (o.version !== 1) throw new SoundError(`${yue2FactsPath()} is not version 1 (version ${JSON.stringify(o.version)}); refusing to read or overwrite it`, 500);
  const facts = o.facts;
  if (typeof facts !== "object" || facts === null || Array.isArray(facts)) throw new SoundError(`${yue2FactsPath()} holds no facts object; refusing to overwrite it`, 500);
  return { version: 1, facts: facts as Record<string, unknown> };
}

/** Every record the door reads, with every one it refused named; `held` limits the answer to those take ids. */
function readRecords(file: FactsFile, held: ReadonlySet<string> | null): Yue2FactsRead {
  const facts: Record<string, Yue2TakeFacts> = {};
  const skipped: Yue2FactsSkip[] = [];
  for (const [takeId, rec] of Object.entries(file.facts)) {
    if (held !== null && !held.has(takeId)) continue;
    const p = parseYue2TakeFacts(rec);
    if (p.ok) facts[takeId] = p.value;
    else skipped.push({ takeId, reason: p.error.message });
  }
  return { facts, skipped };
}

/** Every record of a take the store holds, and every record the door refused (by take id, with why). */
export async function readYue2FactsFile(): Promise<Result<Yue2FactsRead>> {
  try {
    const [takes, file] = await Promise.all([readTakes(), readFactsFile()]);
    return ok(readRecords(file, new Set(takes.takes.map((t) => t.id))));
  } catch (e) {
    return soundFailure(e);
  }
}

/** The facts of the given takes; a take with none is simply absent from the record. */
export async function readYue2Facts(takeIds: readonly string[]): Promise<Result<Readonly<Record<string, Yue2TakeFacts>>>> {
  const want = new Set(takeIds.filter((id) => ID_RE.test(id)));
  if (want.size === 0) return ok({});
  const all = await readYue2FactsFile();
  if (!all.ok) return all;
  const out: Record<string, Yue2TakeFacts> = {};
  for (const id of want) {
    const f = all.value.facts[id];
    if (f !== undefined) out[id] = f;
  }
  return ok(out);
}

/** Every YuE2 take id with its facts (the lab's listing). */
export async function allYue2Facts(): Promise<Result<Readonly<Record<string, Yue2TakeFacts>>>> {
  const all = await readYue2FactsFile();
  return all.ok ? ok(all.value.facts) : all;
}

const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

/** The facts without the cached sha (S2): what a record SAYS about the render, apart from its bytes' key. */
function withoutSha(f: Yue2TakeFacts): Omit<Yue2TakeFacts, "sha"> {
  const { sha: _sha, ...rest } = f;
  return rest;
}

/** Held and offered facts are the same filing: equal words, and no two different shas. A record filed
 *  before S2 holds no sha; the same facts offered again with one is that record, not a conflict. */
const sameFiling = (held: Yue2TakeFacts, offered: Yue2TakeFacts): boolean =>
  same(withoutSha(held), withoutSha(offered)) && (held.sha === undefined || offered.sha === undefined || held.sha === offered.sha);

/** Put the facts of a take the transaction holds; the caller holds the lock. Same facts: no write. */
async function putHeld(tx: StoreTx, takeId: string, facts: Yue2TakeFacts): Promise<Result<Yue2TakeFacts>> {
  const take = (await tx.get("takes")).takes.find((t) => t.id === takeId);
  if (take === undefined) return err("not-found", `take ${takeId} is not in the sound store; file the take before its facts`);
  const file = await readFactsFile();
  const have = file.facts[takeId];
  if (have !== undefined) {
    const p = parseYue2TakeFacts(have);
    if (!p.ok) return err("conflict", `take ${takeId} holds a facts record that does not read (${p.error.message}); settle it in ${YUE2_FACTS_FILE} before filing new facts`);
    if (sameFiling(p.value, facts)) return ok(p.value);
    return err("conflict", `take ${takeId} already holds other YuE2 facts; facts are filed once and never rewritten`);
  }
  file.facts[takeId] = facts;
  await writeJsonAtomic(yue2FactsPath(), file);
  return ok(facts);
}

/** File the facts of one take (idempotent: the same facts again is a no-op; other facts is a conflict). */
export async function putYue2Facts(takeId: string, facts: Yue2TakeFacts): Promise<Result<Yue2TakeFacts>> {
  if (!ID_RE.test(takeId)) return err("invalid", `not a take id: ${JSON.stringify(takeId).slice(0, 90)}`);
  const p = parseYue2TakeFacts(facts);
  if (!p.ok) return p;
  try {
    return await withStore((tx) => putHeld(tx, takeId, p.value));
  } catch (e) {
    return soundFailure(e);
  }
}

/**
 * File a YuE2 take AND its facts under ONE store lock (the precedent lib/sound/suno/facts.ts
 * fileSunoTake): a crash can lose the whole filing but never leave a take the lab cannot describe.
 * The facts are held to their door before anything is written.
 *
 * THE SHA (S2): the sha256 of the bytes filed is computed here, once, and stored as `facts.sha`, so
 * lib/yue2/sha.ts takeSha answers from the facts and pairing never re-reads audio. A sha the caller
 * passed is replaced by the bytes' own.
 */
export async function fileYue2Take(meta: Partial<SoundTake>, file: IncomingFile, facts: Yue2TakeFacts, now = new Date()): Promise<Result<{ take: SoundTake; created: boolean; facts: Yue2TakeFacts }>> {
  const p = parseYue2TakeFacts({ ...facts, sha: createHash("sha256").update(file.bytes).digest("hex") });
  if (!p.ok) return p;
  try {
    return await withStore(async (tx) => {
      const { take, created } = await createTakeTx(tx, meta, file, now);
      const put = await putHeld(tx, take.id, p.value);
      // A refused put throws so the transaction does not commit the take it was filed with.
      if (!put.ok) throw new SoundError(put.error.message, put.error.code === "conflict" ? 409 : 400);
      return ok({ take, created, facts: put.value });
    });
  } catch (e) {
    return soundFailure(e);
  }
}
