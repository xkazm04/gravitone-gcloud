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
//     casual-abuse gate, not a cryptographic identity check.
//
// THE UPGRADE LANDED WITHOUT firebase-admin (card AUP-A stage 1, 2026-10-06).
// lib/principal.ts verifies Firebase ID tokens itself (RS256 over WebCrypto
// against Google's securetoken JWKS), and both guards below now resolve ONE
// principal per request through `resolvePrincipal`. `PRINCIPAL_MODE=legacy` —
// the default — is the shared-secret gate above, unchanged response for
// response; `PRINCIPAL_MODE=verified` closes the shared-secret door and admits
// only a verified token (or the dev fixture). The money bucket keys on the
// verified uid when there is one, else on the client IP as before.
//
// THE GUARDS ARE ASYNC. Verifying a token can fetch Google's keys, so both
// return a Promise and every route `await`s them. A route that forgets gets a
// Promise, which is truthy, and returns it: a refusal still refuses, an
// admitted request answers nothing. principal.probe.spec.ts walks every call.
//
// SERVER ONLY. Reads `IMAGING_ACCESS_SECRET`, which is never NEXT_PUBLIC_ and
// must never appear in a client bundle. Keys are read lazily per call (like
// lib/imaging/env.ts) so a handler that booted before .env.local was filled in
// does not hold a stale absence.

import { createHash, timingSafeEqual } from "node:crypto";

import {
  DEV_FIXTURE,
  LOCAL_OWNER,
  SHARED_SECRET,
  isRefusal,
  principalMode,
  principalRateKey,
  resolveVerified,
  type KeyUse,
  type Refusal,
  type Resolution,
} from "./principal";

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
  //
  // ORDER IS THE WHOLE POINT, and it used to be the other way round:
  // `ab.length === bb.length && timingSafeEqual(...)`. `&&` short-circuits, so a
  // presented secret of the wrong LENGTH returned before the constant-time
  // compare ever ran — which is exactly the timing oracle the padding above was
  // written to remove, restored by the operator that reads the two halves. The
  // compare runs FIRST, unconditionally, and the length check is ANDed onto its
  // result afterwards. Keep both operands eager: swapping in `&&` here, or
  // hoisting the length test back to the left, silently reverts this.
  const padded = Buffer.alloc(ab.length);
  bb.copy(padded);
  const equal = timingSafeEqual(ab, padded);
  return equal && ab.length === bb.length;
}

export type AccessVerdict = "ok" | "no-config" | "missing" | "wrong";

/** The LEGACY shared-secret verdict. Pure over its inputs (headers + env), so it
 *  is unit-testable without a server. It is what `resolvePrincipal` consults in
 *  PRINCIPAL_MODE=legacy and nothing consults in verified mode — a route that
 *  calls this directly instead of a guard would bypass the verified principal. */
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

// ── THE LIMITER WATCHES ITSELF, AND BOUNDS ITSELF (added 2026-08-24) ────────
//
// Two things used to be true here and are not any more. They are the same two
// faults the spend ceiling next door had, one file over.
//
//   · IT COUNTED NOTHING. `rateLimit` returned a verdict and kept no series, so
//     there was no way to answer "is the limiter doing anything", "is it
//     strangling a legitimate caller", or "did we come close". Zero observable
//     activity forever is indistinguishable from a limiter that is not on the
//     request path at all.
//   · THE MAP GREW FOREVER. One entry per client IP, no cap and no staleness
//     rule, in a module-scoped Map that lives as long as the process. A spray of
//     distinct forwarded-for values — trivially forged, and the header is
//     attacker-controlled — grew it without bound. A rate limiter whose own
//     memory is the unbounded resource is defending the wrong thing.
//
// ENFORCEMENT SEMANTICS ARE UNCHANGED for any key the reaper has not touched:
// the same calls are admitted and the same calls are refused, with the same
// retry-after arithmetic. The counters are read, never consulted.

export const RATE_CAPACITY_VAR = "IMAGING_RATE_CAPACITY";
export const RATE_WINDOW_SEC_VAR = "IMAGING_RATE_WINDOW_SEC";
/** Ceiling on how many distinct keys the limiter will hold. */
export const RATE_KEY_CAP_VAR = "IMAGING_RATE_KEY_CAP";

const DEFAULT_KEY_CAP = 10_000;
/** A bucket idle for this many windows, and full, carries no information. */
const IDLE_WINDOWS = 2;
/** Admitting a call that leaves a bucket below this share of capacity is worth
 *  one line — the operator hears about pressure BEFORE the refusals start. */
const NEAR_LIMIT_SHARE = 0.2;

interface Bucket {
  tokens: number;
  updated: number;
  /** Whether this bucket has already announced that it is running low. Reset
   *  when it refills past the threshold, so the warning is one per approach and
   *  not one per request. */
  warned: boolean;
}
const buckets = new Map<string, Bucket>();

/** Calls between idle sweeps. Small enough that a quiet process still returns
 *  memory, large enough that the O(keys) walk is amortised to nothing. */
const SWEEP_EVERY = 200;
let sinceSweep = 0;

// A KNOB BELOW ONE IS MISCONFIGURATION, AND IT IS FLOORED — the same rule
// lib/claudeCli.ts applies to its timeout. Each of these used to accept any
// positive number, and below 1 the two integer knobs invert the limiter:
//   · a capacity of 0.5 leaves every fresh bucket under one token, so EVERY
//     call is refused, forever, with a retry-after it can never satisfy;
//   · a key cap of 0.5 floors to 0, so the reaper runs on every call and evicts
//     every bucket before the current key is inserted — each call sees a fresh
//     full bucket and NOTHING is ever refused. The limiter reads healthy.
// Neither can be a considered setting, so both fall back to the default.
function rateCapacity(): number {
  const n = Number(process.env[RATE_CAPACITY_VAR]);
  return Number.isFinite(n) && n >= 1 ? n : 30;
}
function rateWindowSec(): number {
  const n = Number(process.env[RATE_WINDOW_SEC_VAR]);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
function rateKeyCap(): number {
  const n = Number(process.env[RATE_KEY_CAP_VAR]);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_KEY_CAP;
}

/**
 * What the limiter has done. Every field is a count of an event it would
 * otherwise have performed silently; none is read by `rateLimit`, so none can
 * change who is refused.
 */
export interface RateCounters {
  /** Calls let through. */
  admitted: number;
  /** Calls refused. The limiter's health metric — a spike is either the limiter
   *  doing its job or the limiter strangling real work, and without a count
   *  there is no way to tell which. */
  refused: number;
  /** Admissions that left a bucket below the near-limit share, counted once per
   *  approach. Pressure is legible before it becomes refusal. */
  nearLimit: number;
  /** Buckets the reaper dropped as full-and-idle. Losing these costs no
   *  enforcement: a full bucket is byte-identical to a fresh one. */
  evictedIdle: number;
  /** Buckets dropped because the key cap was reached. These MAY cost
   *  enforcement — see `reap` — so they are counted apart from the idle ones. */
  evictedPressure: number;
  lastEvictionAt: number | null;
  /** The most keys ever held at once. The number that says whether the cap is
   *  near being hit at all. */
  peakKeys: number;
}

const zeroRateCounters = (): RateCounters => ({
  admitted: 0,
  refused: 0,
  nearLimit: 0,
  evictedIdle: 0,
  evictedPressure: 0,
  lastEvictionAt: null,
  peakKeys: 0,
});

let rateCounters: RateCounters = zeroRateCounters();

/** One greppable line. Numbers, env-var NAMES, and a key FINGERPRINT — never the
 *  raw key, which is a client IP. Eight hex characters is enough to correlate two
 *  lines about the same caller and not enough to be an address in a log. */
function rateNote(line: string): void {
  console.log(`[api] rate ${line}`);
}
function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

/**
 * Bound the key population.
 *
 * Two passes, in order of what they cost:
 *
 *   IDLE — a bucket that is FULL and has not been touched for `IDLE_WINDOWS`
 *   windows is information-free: recreating it on the next request produces
 *   exactly the state that was dropped. Removing these is free, and on any
 *   normal workload it is the only pass that ever runs.
 *
 *   PRESSURE — if the map is still over the cap, the honest thing is to say so:
 *   this pass CAN cost enforcement, because it may drop a bucket that still had
 *   a hold on someone. It therefore evicts in the order that loses the least —
 *   most tokens remaining first, oldest first among equals — and it is counted
 *   separately from the idle pass so the two are never read as one number.
 *   Reaching it at all means either the cap is set too low or the keyspace is
 *   being sprayed, and a caller can force it by forging `x-forwarded-for`. That
 *   is a real weakness and it is the lesser one: an unbounded map is a way to
 *   take the process down, while this is a way to buy back some allowance.
 */
function reap(now: number, capacity: number, windowSec: number): void {
  const idleMs = windowSec * 1000 * IDLE_WINDOWS;
  const refillPerSec = capacity / windowSec;
  let idle = 0;
  for (const [k, b] of buckets) {
    const idleMsHere = now - b.updated;
    // Refill FIRST. `b.tokens` is the count as of `b.updated`, so reading it raw
    // asks "was this bucket full when we last touched it" — which is nearly
    // always no, and would have made the idle pass collect almost nothing while
    // looking like it worked.
    const refilled = Math.min(capacity, b.tokens + Math.max(0, idleMsHere / 1000) * refillPerSec);
    if (refilled >= capacity && idleMsHere >= idleMs) {
      buckets.delete(k);
      idle++;
    }
  }
  if (idle) {
    rateCounters.evictedIdle += idle;
    rateCounters.lastEvictionAt = now;
    rateNote(`reaped idle=${idle} keys=${buckets.size} windowSec=${windowSec}`);
  }

  const cap = rateKeyCap();
  // AT the cap, not past it. The reap runs before the current key is inserted,
  // so firing only above the cap would let the held population settle at cap+1 —
  // a bound that is off by one is a bound nobody can assert.
  if (buckets.size < cap) return;

  const target = Math.floor(cap * 0.9);
  const victims = [...buckets.entries()]
    .sort((a, b) => b[1].tokens - a[1].tokens || a[1].updated - b[1].updated)
    .slice(0, buckets.size - target);
  for (const [k] of victims) buckets.delete(k);
  rateCounters.evictedPressure += victims.length;
  rateCounters.lastEvictionAt = now;
  rateNote(
    `PRESSURE evicted=${victims.length} keys=${buckets.size} cap=${cap} (${RATE_KEY_CAP_VAR}) ` +
      `— some allowance was returned; raise the cap or find the sprayer`,
  );
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
  const windowSec = rateWindowSec();
  const refillPerSec = capacity / windowSec;

  // Reap BEFORE inserting, so the cap is a ceiling on what is HELD rather than
  // on what was held one request ago.
  //
  // The sweep is O(keys), so it is amortised rather than run per request: every
  // SWEEP_EVERY calls for the idle pass, and unconditionally at the cap, which is
  // the only case where skipping it would let the bound be exceeded. On the
  // common path this costs two integer comparisons.
  sinceSweep++;
  if (sinceSweep >= SWEEP_EVERY || buckets.size >= rateKeyCap()) {
    sinceSweep = 0;
    reap(now, capacity, windowSec);
  }

  const b = buckets.get(key) ?? { tokens: capacity, updated: now, warned: false };
  const elapsedSec = Math.max(0, (now - b.updated) / 1000);
  b.tokens = Math.min(capacity, b.tokens + elapsedSec * refillPerSec);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    rateCounters.refused++;
    rateCounters.peakKeys = Math.max(rateCounters.peakKeys, buckets.size);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((1 - b.tokens) / refillPerSec)) };
  }
  b.tokens -= 1;

  // Pressure before refusal. Once per approach: `warned` clears when the bucket
  // refills past the threshold, so a caller sitting at the limit produces one
  // line per descent rather than one per request.
  const share = b.tokens / capacity;
  if (share < NEAR_LIMIT_SHARE) {
    if (!b.warned) {
      b.warned = true;
      rateCounters.nearLimit++;
      rateNote(
        `near-limit key=${fingerprint(key)} left=${b.tokens.toFixed(1)}/${capacity} ` +
          `windowSec=${windowSec} (${RATE_CAPACITY_VAR}, ${RATE_WINDOW_SEC_VAR})`,
      );
    }
  } else {
    b.warned = false;
  }

  buckets.set(key, b);
  rateCounters.admitted++;
  rateCounters.peakKeys = Math.max(rateCounters.peakKeys, buckets.size);
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * The limiter's own numbers, for an operator or a diagnostics surface.
 *
 * The configured bounds travel WITH the counts, for the same reason
 * `budgetStats` hands out its window boundary: a reader that re-derives the
 * capacity from the environment can disagree with the limiter that enforced it.
 * `counters` is a copy — a caller cannot reset the meter by mutating a snapshot.
 */
export function rateStats(): {
  capacity: number;
  windowSec: number;
  keyCap: number;
  keys: number;
  counters: RateCounters;
} {
  return {
    capacity: rateCapacity(),
    windowSec: rateWindowSec(),
    keyCap: rateKeyCap(),
    keys: buckets.size,
    counters: { ...rateCounters },
  };
}

/** Best-effort client IP from the usual proxy headers. `unknown` collapses all
 *  header-less callers into one bucket, which for a rate limit errs safe. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Test hook — drop all rate-limit state AND the counters, so one probe's
 *  refusals never show up in the next one's reading. */
export function __resetRateLimit(): void {
  buckets.clear();
  rateCounters = zeroRateCounters();
  sinceSweep = 0;
}

/** Test hook — run the reaper now, instead of waiting for the amortised sweep.
 *  Exported so a probe drives the REAL reap rather than a copy of its rules. */
export function __reapNow(now: number = Date.now()): void {
  sinceSweep = 0;
  reap(now, rateCapacity(), rateWindowSec());
}

/* ── The one call each route makes ─────────────────────────────────────────── */

function deny(status: number, detail: string, code: string, retryAfterSec?: number): Response {
  const headers: Record<string, string> = {};
  if (retryAfterSec && retryAfterSec > 0) headers["retry-after"] = String(retryAfterSec);
  return Response.json({ detail, code }, { status, headers });
}


/** The legacy gate's three refusals, word for word as they were before the
 *  principal existed — `PRINCIPAL_MODE=legacy` promises the same responses. */
const LEGACY_DETAIL: Record<Exclude<AccessVerdict, "ok">, string> = {
  "no-config":
    `This route is access-gated and no ${ACCESS_SECRET_VAR} is configured, so it is closed. ` +
    "Set it on the server and present it as `Authorization: Bearer <secret>`.",
  missing: "This route requires access credentials. Send `Authorization: Bearer <secret>`.",
  wrong: "The access credentials were not accepted.",
};

/**
 * WHO IS CALLING — one principal per request, or a typed refusal.
 *
 *   · the dev fixture first, in either mode (`devOpen`, non-production only);
 *   · legacy: the shared-secret verdict, unchanged. Admitted callers are the
 *     local owner under NEXT_PUBLIC_LOCAL_MODE, else the shared secret. No
 *     token is read and nothing is fetched;
 *   · verified: lib/principal.ts — a Firebase ID token or a refusal. The secret
 *     is never consulted, so no refusal can fall through to it.
 *
 * `use` matters only to a JWKS outage: `money` fails closed, `read` may verify
 * against the last good key set. `now` is injectable for the probes.
 */
export async function resolvePrincipal(
  req: Request,
  opts: { use?: KeyUse; now?: number } = {},
): Promise<Resolution> {
  if (devOpen()) return DEV_FIXTURE;
  if (principalMode() === "legacy") {
    const verdict = checkAccess(req);
    if (verdict === "ok") return process.env.NEXT_PUBLIC_LOCAL_MODE === "1" ? LOCAL_OWNER : SHARED_SECRET;
    return { kind: "refused", code: verdict, status: 401, detail: LEGACY_DETAIL[verdict] };
  }
  return resolveVerified(req, {
    use: opts.use ?? "money",
    now: opts.now,
    secretPresented: presentedSecret(req) !== undefined,
  });
}

function refusalResponse(r: Refusal): Response {
  // The legacy verdicts keep their old body exactly: `{ detail, code }`.
  if (r.code === "no-config" || r.code === "missing" || r.code === "wrong") return deny(401, r.detail, "unauthorized");
  const headers: Record<string, string> = r.status === 503 ? { "retry-after": "30" } : {};
  const code = r.status === 503 ? "verifier-unavailable" : "unauthorized";
  return Response.json({ detail: r.detail, code, refusal: r.code }, { status: r.status, headers });
}

async function guard(req: Request, use: KeyUse): Promise<Response | null> {
  const who = await resolvePrincipal(req, { use });
  if (use === "money") {
    // One verified person is one bucket, whatever IP they arrive from. Anyone
    // else — refused, the fixture, the local owner, the shared secret — keys
    // on the client IP exactly as before, so a flood of unauthenticated calls
    // still meets 429 ahead of its 401.
    const rl = rateLimit(principalRateKey(who) ?? clientIp(req));
    if (!rl.allowed)
      return deny(429, "Too many requests. Slow down and retry.", "rate-limited", rl.retryAfterSec);
  }
  return isRefusal(who) ? refusalResponse(who) : null;
}

/**
 * Guard a money/compute request. Resolves to a `Response` to return
 * IMMEDIATELY (401, 429, or 503 when Google's keys cannot be confirmed), or
 * `null` when the caller may proceed. AWAIT IT.
 *
 * Order: the principal (pure in legacy mode), then the rate bucket — keyed on
 * the verified uid when there is one, else the client IP — then the refusal. A
 * single unauthenticated call is under the limit, so it gets the honest 401; a
 * flood gets 429 first.
 */
export function guardRequest(req: Request): Promise<Response | null> {
  return guard(req, "money");
}

/**
 * Access check WITHOUT the rate bucket — for gated routes that spend nothing.
 * AWAIT IT.
 *
 * The bucket exists to bound spend per origin on the money/compute routes. The
 * foundry routes only read and write local disk, and their page legitimately
 * bursts: a 4-second poll of a live run plus a debounced verdict autosave is
 * ~20 requests a minute before a single image loads, which drained the
 * 30/60s default and turned the Styles tab into a 429. Sharing one bucket
 * between a polling surface and the money routes also means an open /foundry
 * tab could starve a real generation call — the opposite of what the limiter
 * is for. Access is still required; only the counting is skipped.
 *
 * It is also the READ door for a JWKS outage: these routes keep verifying
 * against the last good key set (lib/principal.ts STALE_READ_MS) where a money
 * route refuses.
 *
 * THE QUERY CREDENTIAL LIVES ONLY BEHIND THIS DOOR. The GET byte-serves that
 * feed an <img>/<video>/<audio>/<iframe>/<a download> read `?k=` and present it
 * here as `Authorization: Bearer <k>` — a header the element cannot send. The
 * client builds that URL through one door, `withAccess` in lib/imagingClient.ts:
 * the bundle secret in legacy, the Firebase ID token in verified, which
 * lib/principal.ts reads off a JWT-shaped Bearer like any other. A token in a
 * URL can reach access logs, history and a Referer; that is accepted ONLY here,
 * because the token expires within the hour and these routes serve bytes and
 * spend nothing. `guardRequest` never reads the URL, and no route that reads
 * `k` calls it (credential-door.probe pins both, and the set of routes).
 */
export function guardAccessOnly(req: Request): Promise<Response | null> {
  return guard(req, "read");
}
