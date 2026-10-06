// THE VERIFIED PRINCIPAL — who is calling, as the server itself can prove it.
//
// WHY THIS EXISTS (card AUP-A, stage 1). The money/compute routes were gated by
// one shared secret that the browser can only present because it shipped in
// the bundle (lib/apiAuth.ts, "PUBLIC by construction"), and the rate limiter
// keyed on `x-forwarded-for`, which the caller writes. So the server could not
// say who was spending, and nothing per-account was expressible. The UI already
// signs people in with Firebase; this module verifies that sign-in's ID token
// on the server, so a request resolves to ONE principal the rest of the server
// can key on.
//
// NO NEW DEPENDENCY. Not firebase-admin, not a JOSE library: an ID token is an
// RS256 JWT, and RS256 is RSASSA-PKCS1-v1_5 over SHA-256, which WebCrypto
// verifies natively. The keys are Google's `securetoken` JWKS, cached for as
// long as the response's Cache-Control says. The checks are the ones Firebase
// documents for verifying an ID token with a third-party library: alg RS256, a
// kid in the key set, the signature, aud = project id, iss =
// https://securetoken.google.com/<project id>, exp in the future, iat and
// auth_time in the past, sub a non-empty string (it is the uid).
//
// EVERY MISMATCH IS A TYPED REFUSAL, and none of them falls through to the
// shared secret. In `verified` mode the secret is not consulted at all; a
// request carrying a bad token AND the right secret is refused for the token.
//
// TWO MODES (PRINCIPAL_MODE). `legacy`, the default, is the gate exactly as it
// was: the shared secret decides, nothing here is fetched or verified, and the
// responses are byte-identical. `verified` closes the shared-secret door. A
// value that is neither is treated as `verified` — a typo must not leave an
// operator believing the public-secret door is shut while it is open.
//
// JWKS OUTAGE: CLOSED FOR MONEY, NOT A LOCKOUT FOR READS. A key set past its
// Cache-Control lifetime is refetched; if that fails, a money route (every
// `guardRequest` caller) is refused with 503, because spending on a key set
// nobody could confirm is the failure this module exists to prevent. A read
// (every `guardAccessOnly` caller — polls, file serves, verdict saves: the
// routes that spend nothing) keeps verifying against the last good key set for
// up to STALE_READ_MS past its expiry. A process that never fetched a key set
// has nothing to verify against and refuses both, with 503, not 401.
//
// SERVER ONLY. Reads PRINCIPAL_MODE and the project id per call (like
// lib/apiAuth.ts), and must never be imported by a client module.

import { DEV_UID } from "./devAuth";
import { LOCAL_UID } from "./localMode";

/** Where a legacy bundle sends the ID token (Authorization holds its secret).
 *  The client spells it in lib/sessionToken.ts; principal.probe pins the two. */
export const ID_TOKEN_HEADER = "x-gravitone-id-token";

export const PRINCIPAL_MODE_VAR = "PRINCIPAL_MODE";
/** The Firebase project the tokens must be minted for. The same public value
 *  the client config reads (lib/firebase.ts). */
export const PROJECT_ID_VAR = "NEXT_PUBLIC_FIREBASE_PROJECT_ID";
/** Google's public signing keys for Firebase ID tokens, as a JWK set. */
export const SECURETOKEN_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export type PrincipalMode = "legacy" | "verified";

let warnedMode: string | null = null;

export function principalMode(): PrincipalMode {
  const raw = (process.env[PRINCIPAL_MODE_VAR] ?? "").trim().toLowerCase();
  if (raw === "" || raw === "legacy") return "legacy";
  if (raw !== "verified" && warnedMode !== raw) {
    warnedMode = raw;
    console.log(`[api] principal mode "${raw}" (${PRINCIPAL_MODE_VAR}) is not legacy|verified — running verified (closed)`);
  }
  return "verified";
}

export function firebaseProjectId(): string | undefined {
  const v = process.env[PROJECT_ID_VAR];
  return v && v.trim() ? v.trim() : undefined;
}

/* ── The principal ─────────────────────────────────────────────────────────── */

/** Who is calling. Only `firebase` is a per-person identity the server proved;
 *  the other three are postures, named so nothing has to infer them. */
export type Principal =
  | { kind: "firebase"; uid: string; authTime: number; exp: number }
  /** lib/localMode.ts — the single local owner. Legacy mode only. */
  | { kind: "local-owner"; uid: typeof LOCAL_UID }
  /** lib/devAuth.ts — the automation fixture, non-production builds only. */
  | { kind: "dev-fixture"; uid: typeof DEV_UID }
  /** The bundle's shared secret. Legacy mode only; says nothing about who. */
  | { kind: "shared-secret"; legacy: true };

export type RefusalCode =
  // legacy gate verdicts, with their pre-principal responses
  | "no-config"
  | "missing"
  | "wrong"
  // verified mode
  | "verifier-no-config"
  | "missing-token"
  | "shared-secret-closed"
  | "local-owner-unverifiable"
  | "malformed"
  | "bad-alg"
  | "unknown-key"
  | "bad-signature"
  | "wrong-aud"
  | "wrong-iss"
  | "expired"
  | "iat-future"
  | "bad-auth-time"
  | "no-sub"
  | "jwks-unavailable";

export interface Refusal {
  kind: "refused";
  code: RefusalCode;
  status: 401 | 503;
  detail: string;
}

export type Resolution = Principal | Refusal;

/** Which door is asking. `money` refuses on a key set it cannot confirm;
 *  `read` may verify against the last good one. */
export type KeyUse = "money" | "read";

const DETAIL: Record<Exclude<RefusalCode, "no-config" | "missing" | "wrong">, string> = {
  "verifier-no-config": `This route verifies Firebase ID tokens and no ${PROJECT_ID_VAR} is configured, so it is closed.`,
  "missing-token": "This route requires a Firebase ID token. Send `Authorization: Bearer <idToken>`.",
  "shared-secret-closed": "The shared access secret is not accepted here. Sign in and send a Firebase ID token.",
  "local-owner-unverifiable": "Local mode has no Firebase session, and this server accepts only verified ID tokens.",
  malformed: "The ID token is not a well-formed JWT.",
  "bad-alg": "The ID token is not signed with RS256.",
  "unknown-key": "The ID token is signed with a key Google does not publish.",
  "bad-signature": "The ID token's signature does not verify.",
  "wrong-aud": "The ID token was issued for a different Firebase project.",
  "wrong-iss": "The ID token was not issued by this project's securetoken issuer.",
  expired: "The ID token has expired.",
  "iat-future": "The ID token claims to be issued in the future.",
  "bad-auth-time": "The ID token's auth_time is missing or in the future.",
  "no-sub": "The ID token names no user.",
  "jwks-unavailable": "Google's signing keys could not be fetched, so the ID token cannot be verified. Retry shortly.",
};

export function isRefusal(v: unknown): v is Refusal {
  return typeof v === "object" && v !== null && (v as { kind?: unknown }).kind === "refused";
}

export function refuse(code:Exclude<RefusalCode, "no-config" | "missing" | "wrong">): Refusal {
  return { kind: "refused", code, status: code === "jwks-unavailable" ? 503 : 401, detail: DETAIL[code] };
}

/** The rate-bucket key a resolution earns, or null for "use today's key". Only
 *  a verified per-person identity gets one: the fixture, the local owner and
 *  the shared secret say nothing about which person is calling. */
export function principalRateKey(r: Resolution): string | null {
  return r.kind === "firebase" ? `uid:${r.uid}` : null;
}

/* ── Where the token is presented ─────────────────────────────────────────── */

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

/** The ID token on a request: the dedicated header first (a legacy bundle keeps
 *  Authorization for the secret), else a JWT-shaped Bearer value. A Bearer that
 *  is not JWT-shaped is a shared secret, and is not returned. */
export function presentedIdToken(req: Request): string | undefined {
  const h = req.headers.get(ID_TOKEN_HEADER)?.trim();
  if (h) return h;
  const auth = req.headers.get("authorization");
  const m = auth ? /^Bearer\s+(.+)$/i.exec(auth.trim()) : null;
  const v = m?.[1].trim();
  return v && JWT_SHAPE.test(v) ? v : undefined;
}

/* ── Google's key set, cached by Cache-Control ────────────────────────────── */

type FetchLike = (url: string) => Promise<Response>;

/** Injected in probes; the real `fetch` otherwise, read at call time. */
let jwksFetch: FetchLike | null = null;

interface KeySet {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
}

let cache: KeySet | null = null;
let inflight: Promise<KeySet> | null = null;
let lastAttemptAt = 0;
let lastFailureAt = 0;

/** Cache-Control's max-age is honoured inside these bounds. Google serves
 *  hours; the floor stops a max-age=0 from turning every request into a fetch. */
const MIN_TTL_MS = 60_000;
const MAX_TTL_MS = 24 * 3600_000;
const DEFAULT_TTL_MS = 5 * 60_000;
/** How long past expiry a READ may still verify against the last good set. */
export const STALE_READ_MS = 24 * 3600_000;
/** An unknown kid against a fresh set forces at most one refetch per this. */
const UNKNOWN_KID_REFETCH_MS = 60_000;
/** After a failed fetch, do not retry for this long. */
const FAILURE_BACKOFF_MS = 5_000;

function ttlFrom(cacheControl: string | null): number {
  const m = /max-age\s*=\s*(\d+)/i.exec(cacheControl ?? "");
  if (!m) return DEFAULT_TTL_MS;
  return Math.min(MAX_TTL_MS, Math.max(MIN_TTL_MS, Number(m[1]) * 1000));
}

async function fetchKeySet(now: number): Promise<KeySet> {
  const f: FetchLike = jwksFetch ?? ((url) => fetch(url));
  const res = await f(SECURETOKEN_JWKS_URL);
  if (!res.ok) throw new Error(`JWKS answered ${res.status}`);
  const body = (await res.json()) as { keys?: unknown };
  if (!Array.isArray(body.keys)) throw new Error("JWKS has no keys array");
  const keys = new Map<string, CryptoKey>();
  for (const k of body.keys as Record<string, unknown>[]) {
    if (k?.kty !== "RSA" || typeof k.kid !== "string" || typeof k.n !== "string" || typeof k.e !== "string") continue;
    if (k.alg !== undefined && k.alg !== "RS256") continue;
    if (k.use !== undefined && k.use !== "sig") continue;
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: k.n, e: k.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    keys.set(k.kid, key);
  }
  if (keys.size === 0) throw new Error("JWKS held no usable RS256 key");
  return { keys, expiresAt: now + ttlFrom(res.headers.get("cache-control")) };
}

/** One fetch at a time; concurrent misses share it. */
function refresh(now: number): Promise<KeySet> {
  if (!inflight) {
    lastAttemptAt = now;
    inflight = fetchKeySet(now)
      .then((ks) => {
        cache = ks;
        return ks;
      })
      .catch((e: unknown) => {
        lastFailureAt = now;
        console.log(`[api] principal JWKS fetch failed: ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

async function keyFor(kid: string, use: KeyUse, now: number): Promise<CryptoKey | Refusal> {
  const fresh = cache !== null && now < cache.expiresAt;
  if (fresh && cache!.keys.has(kid)) return cache!.keys.get(kid)!;
  // Fresh set, unknown kid: a rotation, or a forged kid. Refetch, but not on
  // every request a forger sends.
  if (fresh && now - lastAttemptAt < UNKNOWN_KID_REFETCH_MS) return refuse("unknown-key");

  let failed = lastFailureAt > 0 && now - lastFailureAt < FAILURE_BACKOFF_MS && now >= lastFailureAt;
  if (!failed) {
    try {
      const ks = await refresh(now);
      return ks.keys.get(kid) ?? refuse("unknown-key");
    } catch {
      failed = true;
    }
  }
  // The key set could not be confirmed. A read may lean on the last good one.
  if (use === "read" && cache && cache.keys.has(kid) && now < cache.expiresAt + STALE_READ_MS) {
    return cache.keys.get(kid)!;
  }
  return refuse("jwks-unavailable");
}

/* ── Verification ─────────────────────────────────────────────────────────── */

/** Clock skew tolerated on "in the past" claims. */
const SKEW_SEC = 60;
const B64U = /^[A-Za-z0-9_-]*$/;

function decodeJson(part: string): Record<string, unknown> | null {
  if (!B64U.test(part)) return null;
  try {
    const v = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Verify a Firebase ID token. Pure over the token, the key set and the clock;
 * `use` decides only what a JWKS outage means.
 */
export async function verifyIdToken(
  token: string,
  opts: { use?: KeyUse; now?: number } = {},
): Promise<Extract<Principal, { kind: "firebase" }> | Refusal> {
  const use = opts.use ?? "money";
  const now = opts.now ?? Date.now();
  const project = firebaseProjectId();
  if (!project) return refuse("verifier-no-config");

  const parts = token.split(".");
  if (parts.length !== 3) return refuse("malformed");
  const [h, p, s] = parts;
  const header = decodeJson(h);
  const payload = decodeJson(p);
  if (!header || !payload || !B64U.test(s)) return refuse("malformed");
  if (header.alg !== "RS256") return refuse("bad-alg");
  if (typeof header.kid !== "string" || !header.kid) return refuse("malformed");

  // Claims before the key: a junk token must not cost a JWKS fetch.
  const nowSec = Math.floor(now / 1000);
  if (payload.aud !== project) return refuse("wrong-aud");
  if (payload.iss !== `https://securetoken.google.com/${project}`) return refuse("wrong-iss");
  if (typeof payload.sub !== "string" || payload.sub.length === 0 || payload.sub.length > 128) return refuse("no-sub");
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) return refuse("expired");
  if (typeof payload.iat !== "number" || payload.iat > nowSec + SKEW_SEC) return refuse("iat-future");
  if (typeof payload.auth_time !== "number" || payload.auth_time > nowSec + SKEW_SEC) return refuse("bad-auth-time");

  const key = await keyFor(header.kid, use, now);
  if (isRefusal(key)) return key;
  const sig = Buffer.from(s, "base64url");
  if (sig.length === 0) return refuse("bad-signature");
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return refuse("bad-signature");

  return { kind: "firebase", uid: payload.sub, authTime: payload.auth_time, exp: payload.exp };
}

/**
 * The verified-mode resolution of a request. lib/apiAuth.ts's
 * `resolvePrincipal` calls this only when PRINCIPAL_MODE is not legacy, after
 * the dev-fixture door.
 */
export async function resolveVerified(
  req: Request,
  opts: { use: KeyUse; now?: number; secretPresented: boolean },
): Promise<Resolution> {
  if (!firebaseProjectId()) return refuse("verifier-no-config");
  const token = presentedIdToken(req);
  if (!token) {
    if (process.env.NEXT_PUBLIC_LOCAL_MODE === "1") return refuse("local-owner-unverifiable");
    return refuse(opts.secretPresented ? "shared-secret-closed" : "missing-token");
  }
  return verifyIdToken(token, { use: opts.use, now: opts.now });
}

/** The fixed principals, built once. */
export const DEV_FIXTURE: Principal = { kind: "dev-fixture", uid: DEV_UID };
export const LOCAL_OWNER: Principal = { kind: "local-owner", uid: LOCAL_UID };
export const SHARED_SECRET: Principal = { kind: "shared-secret", legacy: true };

/** Test hook — inject the JWKS fetcher (null restores the real `fetch`). */
export function __setJwksFetch(f: FetchLike | null): void {
  jwksFetch = f;
}

/** Test hook — forget the key set and every fetch timestamp. */
export function __resetJwksCache(): void {
  cache = null;
  inflight = null;
  lastAttemptAt = 0;
  lastFailureAt = 0;
}
