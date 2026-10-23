import { randomBytes as cryptoRandomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { idSchema } from "@gt/domain/ids";
import { sha256Hex } from "./canonical.ts";
import { append } from "./events.ts";
import type { ModuleMigrations } from "./migrate.ts";
import type { Reader, Store, Tx } from "./store.ts";

// CLI TOKENS - one credential per caller, minted by the operator, in place of
// the one shared string every caller used to present (plan §3.2, §5.6).
//
// What it replaces: lib/apiAuth.ts's IMAGING_ACCESS_SECRET, a single value the
// browser ships in its bundle (public by construction) and every script, skill
// and curl line copied. One string cannot say WHICH caller spent, cannot be
// withdrawn from one caller without breaking all of them, and has no end of
// life. v1's gate kept two things worth keeping, and both are kept here: it
// fails closed (no store, no token: nothing opens), and its compare is
// constant-time with the length mismatch folded in AFTER the compare
// (lib/apiAuth.ts secretsMatch). Upgraded:
//   - A TOKEN NAMES ITS CALLER. `gt_<id>_<secret>`: the id is the accessor
//     (authorization: machine-credential-consumption) - listed, revoked and
//     logged by it, never sufficient to authenticate - and the secret is 32
//     random bytes the server never stores, only its SHA-256.
//   - EXPIRY AND REVOCATION ARE DATA, enforced by the schema as well as by
//     `judge`: a token's identity, scope, hash and life are fixed at mint; a
//     revocation is final; nothing is deleted. A token with no end does not
//     exist (issuance-policy-ladder: bounds-as-modes - an over-long ask is
//     refused, never silently clamped, so the operator learns the bound).
//   - MINT AND REVOKE ARE LEDGER EVENTS in the transaction that makes them
//     (audit-logging: write-path-sanitization - the data carries the name,
//     scope and expiry; never the secret, never the hash). The plaintext exists
//     only in the caller's hands after the row committed
//     (dynamic-secret-lifecycle: persist-before-provision): `mintToken` runs
//     inside the transaction and its token is printed only if the commit holds.
//
// A plain SHA-256, not a keyed hash. machine-credential-consumption asks for an
// HMAC so a stolen table cannot be attacked offline against the secret space;
// that attack is a search, and here the space is 2^256 random bits, not a
// password - the dump buys nothing a guess would not. A key would need a home
// outside the store, which this single-file deployment does not have yet.
// Revisit if a secret ever becomes human-chosen.
//
// Pure core first (parse, plan, judge: time and randomness are parameters),
// then the driver (one table, each act with its Event).

export const TOKEN_SCOPES = ["money", "read", "act"] as const;
export type TokenScope = (typeof TOKEN_SCOPES)[number];

/** What a door needs from a token: a money door spends, an act door writes without spending
 *  (the agent surface: dry runs, free live runs, spend requests), a read door reads. */
export type TokenUse = "money" | "read" | "act";

/** Which uses each scope admits. `act` is the agent's (spark athena-control-mcp): it reads and makes
 *  non-spending writes, and every money door refuses it by scope. */
const ADMITS: { readonly [S in TokenScope]: readonly TokenUse[] } = {
  money: ["money", "act", "read"],
  act: ["act", "read"],
  read: ["read"],
};

export const TOKEN_PREFIX = "gt_";
export const SECRET_BYTES = 32;
const ID_BYTES = 6;
const TOKEN_RE = /^gt_([0-9a-f]{12})_([A-Za-z0-9_-]{43})$/;
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A month: a token lives in a caller's shell profile or .env, a file that is
 *  copied, backed up and screen-shared. Thirty days bounds what a leaked file is
 *  worth without making the operator re-mint every week. */
export const DEFAULT_TTL_MS = 30 * DAY_MS;
/** The longest life a mint may ask for. A quarter: past it, nobody remembers
 *  which caller holds the token, and the list stops being an inventory. */
export const MAX_TTL_MS = 90 * DAY_MS;
export const MIN_TTL_MS = HOUR_MS;
/** lastUsedAt moves at most this often: an inventory needs "used this week",
 *  not a write lock per request. */
export const TOUCH_EVERY_MS = 60_000;

export const tokenIdSchema = idSchema("TokenId");
export type TokenId = z.output<typeof tokenIdSchema>;

/** A token as the operator sees it: no secret, no hash. */
export type TokenRecord = {
  readonly id: TokenId;
  readonly name: string;
  readonly scope: TokenScope;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly revokedAt?: string;
  readonly lastUsedAt?: string;
};

type Stored = TokenRecord & { readonly hash: string };

/** Why a presented token was not accepted. `unknown` covers a malformed token,
 *  an id the store has never seen and a wrong secret alike: telling them apart
 *  would tell a guesser which half was right. */
export type TokenRefusal = "unknown" | "expired" | "revoked";

export type Verdict = { readonly ok: true; readonly token: TokenRecord } | { readonly ok: false; readonly why: TokenRefusal };

/* ── The pure core ─────────────────────────────────────────────────────────── */

/** The two halves of a presented string, or undefined when it is not a token. */
export function parseToken(presented: string): { id: string; secret: string } | undefined {
  const m = TOKEN_RE.exec(presented);
  return m?.[1] === undefined || m[2] === undefined ? undefined : { id: m[1], secret: m[2] };
}

/** Whether a presented credential is SHAPED like a token (the doors route it here, never to the shared secret). */
export const isTokenShaped = (presented: string): boolean => TOKEN_RE.test(presented);

export const hashSecret = (secret: string): string => sha256Hex(secret);

/** `30d`, `12h` -> milliseconds. Days and hours only: a token's life is not a stopwatch. */
export function parseTtl(text: string): Result<number> {
  const m = /^(\d{1,4})([dh])$/.exec(text.trim());
  if (m?.[1] === undefined) return err("invalid", `ttl "${text}" is not <n>d or <n>h (e.g. 30d)`);
  return ok(Number(m[1]) * (m[2] === "d" ? DAY_MS : HOUR_MS));
}

export const scopeAdmits = (scope: TokenScope, use: TokenUse): boolean => ADMITS[scope].includes(use);

export type MintInput = { readonly name: string; readonly scope: TokenScope; readonly ttlMs?: number };

/** The row and the plaintext a mint would produce at `now`, or why it may not. */
export function mintPlan(input: MintInput, now: string, random: (n: number) => Uint8Array): Result<{ record: Stored; token: string }> {
  if (!NAME_RE.test(input.name)) return err("invalid", `token name "${input.name}" must be 1-64 of a-z 0-9 . _ - (it names the caller, e.g. dojo-skill)`);
  if (!(TOKEN_SCOPES as readonly string[]).includes(input.scope)) return err("invalid", `token scope "${String(input.scope)}" is not ${TOKEN_SCOPES.join("|")}`);
  const ttl = input.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isInteger(ttl) || ttl < MIN_TTL_MS || ttl > MAX_TTL_MS) {
    return err("invalid", `a token lives between ${MIN_TTL_MS / HOUR_MS}h and ${MAX_TTL_MS / DAY_MS}d; ${Number.isFinite(ttl) ? `${Math.round(ttl / HOUR_MS)}h` : String(ttl)} was asked. Mint again before it ends instead.`);
  }
  const start = Date.parse(now);
  if (!Number.isFinite(start)) return err("invalid", `mint: "${now}" is not an instant`);
  const id = Buffer.from(random(ID_BYTES)).toString("hex");
  const secret = Buffer.from(random(SECRET_BYTES)).toString("base64url");
  const minted = parseAt("token id", tokenIdSchema, id);
  if (!minted.ok) return minted;
  const token = `${TOKEN_PREFIX}${id}_${secret}`;
  // A random source that returned short or repeated bytes must not mint a weak token quietly.
  if (parseToken(token) === undefined) return err("internal", "mint: the random source did not yield a well-formed token");
  const record: Stored = { id: minted.value, name: input.name, scope: input.scope, createdAt: new Date(start).toISOString(), expiresAt: new Date(start + ttl).toISOString(), hash: hashSecret(secret) };
  return ok({ record, token });
}

function publicOf(s: Stored): TokenRecord {
  const base = { id: s.id, name: s.name, scope: s.scope, createdAt: s.createdAt, expiresAt: s.expiresAt };
  return {
    ...base,
    ...(s.revokedAt === undefined ? {} : { revokedAt: s.revokedAt }),
    ...(s.lastUsedAt === undefined ? {} : { lastUsedAt: s.lastUsedAt }),
  };
}

/** Compared even when there is no record, so an unknown id costs what a wrong secret costs. */
const DUMMY_HASH = "0".repeat(64);

/** Judge a presented secret against what the store holds for its id. */
export function judge(stored: Stored | undefined, secret: string, nowMs: number): Verdict {
  const want = Buffer.from(stored?.hash ?? DUMMY_HASH, "hex");
  const got = Buffer.from(hashSecret(secret), "hex");
  // Both are 32-byte digests, so the lengths agree by construction; the
  // compare runs unconditionally and the existence check is ANDed after it,
  // v1's order (lib/apiAuth.ts secretsMatch) for v1's reason.
  const equal = timingSafeEqual(want, got);
  if (!(equal && stored !== undefined)) return { ok: false, why: "unknown" };
  if (stored.revokedAt !== undefined) return { ok: false, why: "revoked" };
  if (nowMs >= Date.parse(stored.expiresAt)) return { ok: false, why: "expired" };
  return { ok: true, token: publicOf(stored) };
}

export const needsTouch = (t: TokenRecord, nowMs: number): boolean => t.lastUsedAt === undefined || nowMs - Date.parse(t.lastUsedAt) >= TOUCH_EVERY_MS;

/* ── The driver ───────────────────────────────────────────────────────────── */

export const tokenMigrations: ModuleMigrations = {
  module: "token",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE tokens (
  id TEXT PRIMARY KEY CHECK (length(id) = 12),
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('money', 'read')),
  hash TEXT NOT NULL UNIQUE CHECK (length(hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (expires_at > created_at),
  revoked_at TEXT,
  last_used_at TEXT
) WITHOUT ROWID;
CREATE TRIGGER tokens_fixed_at_mint BEFORE UPDATE OF id, name, scope, hash, created_at, expires_at ON tokens
BEGIN SELECT RAISE(ABORT, 'a token''s id, name, scope, hash and life are fixed at mint'); END;
CREATE TRIGGER tokens_revocation_final BEFORE UPDATE OF revoked_at ON tokens WHEN OLD.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a revocation is final'); END;
CREATE TRIGGER tokens_never_deleted BEFORE DELETE ON tokens
BEGIN SELECT RAISE(ABORT, 'tokens are revoked, never deleted'); END;`,
    },
    {
      // The `act` scope (spark athena-control-mcp): an agent's token reads and writes without spending.
      // SQLite cannot alter a CHECK, so the table is rebuilt and renamed. Nothing holds a foreign key to
      // it; DROP TABLE drops its triggers and fires no DELETE trigger, so `tokens_never_deleted` does not
      // refuse the drop, and all three triggers are recreated on the new table. The only index v1 made
      // is the UNIQUE on hash, which the new table's own constraint recreates.
      version: 2,
      sql: `
CREATE TABLE tokens_v2 (
  id TEXT PRIMARY KEY CHECK (length(id) = 12),
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('money', 'read', 'act')),
  hash TEXT NOT NULL UNIQUE CHECK (length(hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL CHECK (expires_at > created_at),
  revoked_at TEXT,
  last_used_at TEXT
) WITHOUT ROWID;
INSERT INTO tokens_v2 (id, name, scope, hash, created_at, expires_at, revoked_at, last_used_at)
  SELECT id, name, scope, hash, created_at, expires_at, revoked_at, last_used_at FROM tokens;
DROP TABLE tokens;
ALTER TABLE tokens_v2 RENAME TO tokens;
CREATE TRIGGER tokens_fixed_at_mint BEFORE UPDATE OF id, name, scope, hash, created_at, expires_at ON tokens
BEGIN SELECT RAISE(ABORT, 'a token''s id, name, scope, hash and life are fixed at mint'); END;
CREATE TRIGGER tokens_revocation_final BEFORE UPDATE OF revoked_at ON tokens WHEN OLD.revoked_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'a revocation is final'); END;
CREATE TRIGGER tokens_never_deleted BEFORE DELETE ON tokens
BEGIN SELECT RAISE(ABORT, 'tokens are revoked, never deleted'); END;`,
    },
  ],
};

const rowSchema = z.object({
  id: tokenIdSchema,
  name: z.string(),
  scope: z.enum(TOKEN_SCOPES),
  hash: z.string().regex(HASH_RE),
  created_at: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
});
const COLUMNS = "id, name, scope, hash, created_at, expires_at, revoked_at, last_used_at";

function toStored(row: unknown): Stored {
  const p = parseAt("token row", rowSchema, row);
  // A row that will not parse is corruption, and corruption refuses (authorization: failure-direction).
  if (!p.ok) throw p.error;
  const r = p.value;
  const base = { id: r.id, name: r.name, scope: r.scope, createdAt: r.created_at, expiresAt: r.expires_at, hash: r.hash };
  return {
    ...base,
    ...(r.revoked_at === null ? {} : { revokedAt: r.revoked_at }),
    ...(r.last_used_at === null ? {} : { lastUsedAt: r.last_used_at }),
  };
}

const subjectOf = (id: string) => ({ kind: "token", id });

function readStored(r: Reader, id: string): Stored | undefined {
  const row = r.get(`SELECT ${COLUMNS} FROM tokens WHERE id = ?`, id);
  return row === undefined ? undefined : toStored(row);
}

/** Mint inside the caller's transaction. The plaintext is the caller's to
 *  hand over only after the transaction commits. */
export function mintToken(t: Tx, input: MintInput, actor: Actor, random: (n: number) => Uint8Array = cryptoRandomBytes): { record: TokenRecord; token: string } {
  const plan = mintPlan(input, t.at, random);
  if (!plan.ok) throw plan.error;
  const r = plan.value.record;
  t.run(`INSERT INTO tokens (id, name, scope, hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`, r.id, r.name, r.scope, r.hash, r.createdAt, r.expiresAt);
  append(t, { actor, type: "token.mint", subject: subjectOf(r.id), data: { name: r.name, scope: r.scope, expiresAt: r.expiresAt } });
  return { record: publicOf(r), token: plan.value.token };
}

/** Every token ever minted, oldest first: an inventory, so revoked and expired stay listed. */
export function listTokens(r: Reader): TokenRecord[] {
  return r.all(`SELECT ${COLUMNS} FROM tokens ORDER BY created_at, id`).map((row) => publicOf(toStored(row)));
}

export function readToken(r: Reader, id: string): TokenRecord | undefined {
  const s = readStored(r, id);
  return s === undefined ? undefined : publicOf(s);
}

/** Revoke by accessor. Revoking a revoked token succeeds and records nothing new
 *  (dynamic-secret-lifecycle: idempotent-revoke); an id the store never minted
 *  is `not-found`, because a typo that "succeeded" would leave the real token alive. */
export function revokeToken(t: Tx, id: string, actor: Actor, reason?: string): { state: "revoked" | "already-revoked"; token: TokenRecord } {
  const s = readStored(t, id);
  if (s === undefined) throw new AppError("not-found", `no token ${id}; \`list\` shows the ids this store minted`);
  if (s.revokedAt !== undefined) return { state: "already-revoked", token: publicOf(s) };
  t.run("UPDATE tokens SET revoked_at = ? WHERE id = ?", t.at, id);
  append(t, { actor, type: "token.revoke", subject: subjectOf(id), data: reason === undefined ? { name: s.name } : { name: s.name, reason } });
  return { state: "revoked", token: { ...publicOf(s), revokedAt: t.at } };
}

/** A presented string against the store. A store failure is an `err` (the door
 *  answers unavailable and admits nothing); a refusal is an `ok` verdict. */
export function verifyToken(store: Store, presented: string, nowMs: number): Result<Verdict> {
  const parts = parseToken(presented);
  return store.read((r) => judge(parts === undefined ? undefined : readStored(r, parts.id), parts?.secret ?? "", nowMs));
}

/** Record a use. Advisory: the door has already decided, and a failed touch is
 *  the caller's to report, never a reason to refuse. */
export function touchToken(store: Store, id: string, nowMs: number): Result<boolean> {
  const at = new Date(nowMs).toISOString();
  return store.tx((t) => t.run("UPDATE tokens SET last_used_at = ? WHERE id = ? AND (last_used_at IS NULL OR last_used_at < ?)", at, id, at).changes === 1);
}
