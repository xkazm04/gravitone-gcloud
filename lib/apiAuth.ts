// SERVER-SIDE ACCESS GATE for the money/compute routes.
//
// WHY THIS FILE EXISTS. app/api/imaging/{generate,edit,recognize} spend a real
// vendor balance and app/api/frames spends local Claude-CLI compute — and until
// this gate none of them checked WHO was calling. A `curl` at the origin billed
// the operator's keys. The UI authenticates with Firebase (Google popup, see
// lib/firebase.ts), but that identity lived only in the browser: the server
// never saw it, so "signed in" gated the React surface and nothing behind it.
//
// WHAT THIS GATE IS, AND IS NOT. `firebase-admin` is not a dependency of this
// app (absent from node_modules AND package-lock), so there is no server-side
// verifier for a Firebase ID token here without adding a heavy dep to a static
// export. The lightest correct option that actually BLOCKS an unauthenticated
// caller is therefore a shared secret in `IMAGING_ACCESS_SECRET`, presented on
// the request. It is honest about its own ceiling:
//
//   · It FAILS CLOSED. With no `IMAGING_ACCESS_SECRET` set, every gated route
//     answers 401 — an unconfigured money route must not spend. This is the
//     "budget-defaults-unlimited" lesson applied to auth: the safe default is
//     "no".
//   · A browser can only present a secret that shipped in its bundle
//     (`NEXT_PUBLIC_IMAGING_ACCESS_SECRET`), which is therefore PUBLIC. So
//     against a determined attacker who reads the bundle this is a rate-limit +
//     casual-abuse gate, not a cryptographic identity check. The real upgrade
//     is Firebase ID-token verification once `firebase-admin` is wired — the
//     Bearer branch below is deliberately shaped so that a token which is not
//     the shared secret is the natural place to add it.
//
// SERVER ONLY. Reads `IMAGING_ACCESS_SECRET`, which is never NEXT_PUBLIC_ and
// must never appear in a client bundle. Keys are read lazily per call (like
// lib/imaging/env.ts) so a handler that booted before .env.local was filled in
// does not hold a stale absence.

import { timingSafeEqual } from "node:crypto";

export const ACCESS_SECRET_VAR = "IMAGING_ACCESS_SECRET";

/** The configured secret, trimmed, or `undefined` when unset/blank. */
export function accessSecret(): string | undefined {
  const v = process.env[ACCESS_SECRET_VAR];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * A non-production build with the SAME explicit opt-in the client dev-auth
 * bypass uses (lib/devAuth.ts). Lets test automation drive the gated surface
 * without a secret, and — like devAuth — folds to `false` in any production
 * build because `NODE_ENV` is `production` there, so it can never ship open.
 */
function devOpen(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEV_AUTH === "1";
}

/** The secret the caller presented, from `Authorization: Bearer <secret>` or
 *  the `x-imaging-access-secret` header, or `undefined` if neither is present. */
export function presentedSecret(req: Request): string | undefined {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  const x = req.headers.get("x-imaging-access-secret");
  return x && x.trim() ? x.trim() : undefined;
}

/** Constant-time string compare that also survives length mismatch. */
function secretsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  // timingSafeEqual throws on unequal lengths; compare against a same-length
  // copy so the length difference itself is not a timing oracle, then AND the
  // real length check in.
  const padded = Buffer.alloc(ab.length);
  bb.copy(padded);
  return ab.length === bb.length && timingSafeEqual(ab, padded);
}

export type AccessVerdict = "ok" | "no-config" | "missing" | "wrong";

/** Decide whether this request may reach a money/compute route. Pure over its
 *  inputs (headers + env), so it is unit-testable without a server. */
export function checkAccess(req: Request): AccessVerdict {
  if (devOpen()) return "ok";
  const secret = accessSecret();
  if (!secret) return "no-config"; // fail closed
  const presented = presentedSecret(req);
  if (!presented) return "missing";
  return secretsMatch(presented, secret) ? "ok" : "wrong";
}

/* ── Rate limit — an in-memory token bucket keyed by client IP ─────────────── */
//
// Bounds call rate per origin so a leaked secret (or an authenticated caller in
// a loop) cannot drain the balance at machine speed. In-memory and per-process:
// good enough for a single-instance prototype, and it degrades to "per instance"
// rather than failing if this is ever scaled out — a real deployment would move
// this to a shared store.

export const RATE_CAPACITY_VAR = "IMAGING_RATE_CAPACITY";
export const RATE_WINDOW_SEC_VAR = "IMAGING_RATE_WINDOW_SEC";

interface Bucket {
  tokens: number;
  updated: number;
}
const buckets = new Map<string, Bucket>();

function rateCapacity(): number {
  const n = Number(process.env[RATE_CAPACITY_VAR]);
  return Number.isFinite(n) && n > 0 ? n : 30;
}
function rateWindowSec(): number {
  const n = Number(process.env[RATE_WINDOW_SEC_VAR]);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

export interface RateResult {
  allowed: boolean;
  /** Whole seconds until at least one token is available (for `Retry-After`). */
  retryAfterSec: number;
}

/**
 * Consume one token for `key`. Refills continuously at capacity/window per
 * second. `now` is injectable so the window-reset behaviour is testable.
 */
export function rateLimit(key: string, now: number = Date.now()): RateResult {
  const capacity = rateCapacity();
  const refillPerSec = capacity / rateWindowSec();
  const b = buckets.get(key) ?? { tokens: capacity, updated: now };
  const elapsedSec = Math.max(0, (now - b.updated) / 1000);
  b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / refillPerSec)) };
  }
  b.tokens -= 1;
  buckets.set(key, b);
  return { allowed: true, retryAfterSec: 0 };
}

/** Best-effort client IP from the usual proxy headers. `unknown` collapses all
 *  header-less callers into one bucket, which for a rate limit errs safe. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Test hook — drop all rate-limit state. */
export function __resetRateLimit(): void {
  buckets.clear();
}

/* ── The one call each route makes ─────────────────────────────────────────── */

function deny(status: number, detail: string, code: string, retryAfterSec?: number): Response {
  const headers: Record<string, string> = {};
  if (retryAfterSec && retryAfterSec > 0) headers["retry-after"] = String(retryAfterSec);
  return Response.json({ detail, code }, { status, headers });
}

/**
 * Guard a money/compute request. Returns a `Response` to return IMMEDIATELY
 * (401 or 429), or `null` when the caller may proceed.
 *
 * Order: rate limit first (cheap, and it should bound an unauthenticated
 * flooder too), then access. A single unauthenticated call is under the limit,
 * so it gets the honest 401; a flood gets 429 first.
 */
export function guardRequest(req: Request): Response | null {
  const rl = rateLimit(clientIp(req));
  if (!rl.allowed)
    return deny(429, "Too many requests. Slow down and retry.", "rate-limited", rl.retryAfterSec);

  switch (checkAccess(req)) {
    case "ok":
      return null;
    case "no-config":
      return deny(
        401,
        `This route is access-gated and no ${ACCESS_SECRET_VAR} is configured, so it is closed. ` +
          "Set it on the server and present it as `Authorization: Bearer <secret>`.",
        "unauthorized",
      );
    case "missing":
      return deny(
        401,
        "This route requires access credentials. Send `Authorization: Bearer <secret>`.",
        "unauthorized",
      );
    case "wrong":
      return deny(401, "The access credentials were not accepted.", "unauthorized");
  }
}
