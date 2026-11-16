// SUNO API CREDENTIALS ON DISK - the OAuth client this studio registered and the tokens it holds.
//
//   <storeRoot()>/suno-api/auth.json     { v:1, client?, tokens?, connectedAt? }
//   <storeRoot()>/suno-api/pending.json  { [state]: { verifier, redirectUri, clientId, createdAt } }
//   <storeRoot()>/suno-api/auth.lock     the exclusive-create lock every mutation runs under
//
// storeRoot() is the sound store's (lib/sound/store.ts): foundry-out/sound, moved by SOUND_STORE_DIR
// and read per call, so a test or the CLI points it at a temp directory after import.
//
// NOT ENCRYPTED, ON PURPOSE. The repo's precedent for a vendor refresh token is plain text on this
// machine (YOUTUBE_REFRESH_TOKEN sits in .env.local); the file lives in the gitignored foundry-out
// tree beside the store it serves. A keychain seam would be a change to that precedent, not to this
// file.
//
// TWO WRITERS. The Next server and a plain-node CLI both refresh, and Suno rotates refresh tokens:
// two processes spending one refresh token would leave one of them holding a dead grant. So every
// mutation runs inside `withAuthLock` (in-process queue + `auth.lock`, exclusive create, stale after
// 30 s - lib/diskTx.ts), and a refresh RE-READS auth.json after taking the lock (oauth.ts refresh):
// whoever waited finds the token the holder minted and spends nothing.
//
// No `server-only` and no Next import: pipeline CLIs load this through tsx.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";

import { exclusiveSection } from "../../diskTx.ts";
import { storeRoot, writeJsonAtomic } from "../../sound/store.ts";

/** A pending authorization older than this is dropped on every write. */
export const PENDING_TTL_MS = 10 * 60_000;
/** A lock older than this has no living holder. Every network call under the lock times out first. */
export const LOCK_STALE_MS = 30_000;

const AuthFileSchema = z.object({
  v: z.literal(1),
  client: z.object({ clientId: z.string().min(1), redirectUri: z.string().min(1), registeredAt: z.string() }).optional(),
  tokens: z
    .object({ accessToken: z.string().min(1), refreshToken: z.string().min(1).optional(), expiresAt: z.number(), scope: z.string() })
    .optional(),
  connectedAt: z.string().optional(),
});
export type AuthFile = z.output<typeof AuthFileSchema>;
export type StoredClient = NonNullable<AuthFile["client"]>;
export type StoredTokens = NonNullable<AuthFile["tokens"]>;

const PendingSchema = z.record(
  z.string(),
  z.object({ verifier: z.string().min(43), redirectUri: z.string().min(1), clientId: z.string().min(1), createdAt: z.number() }),
);
export type PendingEntry = z.output<typeof PendingSchema>[string];

export const authDir = (): string => path.join(storeRoot(), "suno-api");
export const authFile = (): string => path.join(authDir(), "auth.json");
export const pendingFile = (): string => path.join(authDir(), "pending.json");
export const lockFile = (): string => path.join(authDir(), "auth.lock");

const EMPTY: AuthFile = { v: 1 };

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** auth.json, or the empty file when there is none. A corrupt file throws: it is never silently replaced. */
export async function readAuth(): Promise<AuthFile> {
  const text = await readText(authFile());
  if (text === null) return EMPTY;
  const r = parseJsonAt(authFile(), AuthFileSchema, text);
  if (!r.ok) throw new AppError("internal", `${r.error.message} (delete the file and connect again)`, { detail: "suno-auth-corrupt" });
  return r.value as AuthFile;
}

/** Write auth.json atomically. Call only inside `withAuthLock`. */
export async function writeAuth(next: AuthFile): Promise<void> {
  await writeJsonAtomic(authFile(), next);
}

async function readPendingAll(): Promise<Record<string, PendingEntry>> {
  const text = await readText(pendingFile());
  if (text === null) return {};
  const r = parseJsonAt(pendingFile(), PendingSchema, text);
  // A corrupt pending file holds nothing worth keeping beyond ten minutes: it is reset, not fatal.
  return r.ok ? (r.value as Record<string, PendingEntry>) : {};
}

function fresh(all: Record<string, PendingEntry>, now: number): Record<string, PendingEntry> {
  return Object.fromEntries(Object.entries(all).filter(([, p]) => now - p.createdAt < PENDING_TTL_MS && p.createdAt <= now + 60_000));
}

/** Record a pending authorization. Call only inside `withAuthLock`. */
export async function addPending(state: string, entry: PendingEntry, now = Date.now()): Promise<void> {
  const all = fresh(await readPendingAll(), now);
  all[state] = entry;
  await writeJsonAtomic(pendingFile(), all);
}

/** Is `state` pending and fresh? A read only - the entry is taken by `takePending`. */
export async function hasPending(state: string, now = Date.now()): Promise<boolean> {
  return Object.hasOwn(fresh(await readPendingAll(), now), state);
}

/** Remove and return the pending entry for `state` (single use), or null. Call only inside `withAuthLock`. */
export async function takePending(state: string, now = Date.now()): Promise<PendingEntry | null> {
  const before = await readPendingAll();
  const all = fresh(before, now);
  const hit = Object.hasOwn(all, state) ? all[state]! : null;
  if (hit) delete all[state];
  await writeJsonAtomic(pendingFile(), all);
  return hit;
}

const section = exclusiveSection(lockFile, () => ({
  timing: { staleMs: LOCK_STALE_MS, waitMs: LOCK_STALE_MS + 15_000 },
  by: "suno-api",
  onTimeout: (f, ms) => new AppError("unavailable", `${f} is held and the holder did not release it in ${ms} ms`, { detail: "suno-auth-locked" }),
}));

/** Run `fn` holding the in-process queue and auth.lock. Not re-entrant: never nest. */
export function withAuthLock<T>(fn: () => Promise<T>): Promise<T> {
  return section(fn);
}
