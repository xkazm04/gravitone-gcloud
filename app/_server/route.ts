import { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";

import { clientIp, presentedSecret, rateLimit, resolvePrincipal } from "../../lib/apiAuth.ts";
import { isRefusal, presentedIdToken, principalRateKey, type KeyUse, type Principal, type Refusal, type Resolution } from "../../lib/principal.ts";
import { asAppError, clientGone, envelope, queryOf, readJson, resultResponse, sameOrigin } from "./http.ts";
import { cookieValue, SESSION_COOKIE, verifySession } from "./session.ts";

// route() - THE ONE WRAPPER every handler under app/api goes through, and the
// only HTTP surface the rebuild keeps: CLIs, agents and file bytes (plan §3.4).
// Pages read the kernel directly and mutate through Server Actions; nothing in
// the studio fetches JSON from here.
//
// THE ORDER IS THE SECURITY PROPERTY (authorization: dispatch-chokepoint-
// gating): guard, then body, then handler. A caller the guard refuses never
// reaches the JSON parser, so not even a parse error confirms a route's input
// schema to someone who may not call it.
//
// THE GUARDS ARE v1's, REUSED (lib/apiAuth.ts resolvePrincipal, rateLimit,
// clientIp; lib/principal.ts for the token): fail closed, async, one principal
// per request, the dev fixture compiled out of production. What is absorbed
// rather than called is the RESPONSE: v1's guards answer `{detail, code}` with
// 401/429; here every refusal is the one envelope. Two upgrades:
//   - THE SESSION COOKIE IS A CREDENTIAL TOO, consulted only when the request
//     presented none of its own (no secret, no ID token). An EventSource and an
//     <img> cannot set headers, and v1 answered that with `?k=` - the bearer in
//     a URL, in history and access logs. A cookie rides along by itself. A
//     credential that WAS presented is judged alone and never falls through to
//     the cookie, as v1's verified mode never falls through to the secret.
//   - A COOKIE-AUTHENTICATED WRITE MUST BE SAME-ORIGIN. A header credential
//     cannot be forged cross-site; an ambient cookie can be ridden, and Lax
//     only covers the POST a form makes, not a script's fetch from a page the
//     cookie's site also serves. Reads stay open to the cookie.
//
// THE STATUS FOLLOWS THE CODE. No principal at all - no credential, an expired
// one - is `unauthenticated` (401) with v1's refusal code in `detail`
// ("missing-token", "expired"): the client signs in again. A principal that
// may not do this (a cookie riding a cross-origin write) is `refused` (403):
// signing in again would change nothing. A JWKS outage and the rate limit are
// `unavailable` (503) with Retry-After - the code a retry loop already
// branches on. The taxonomy still has no 429; the limit is a retry, not a
// distinct client branch.

export type Guard = "money" | "access" | "public";

export type RouteOptions<S extends z.ZodType | undefined> = {
  readonly guard: Guard;
  /** The most body bytes read. 0 for a route that takes no body. */
  readonly bodyCap: number;
  /** Seconds. Must equal the route file's own `export const maxDuration`: Next
   *  reads that static export for the platform cap, and the handler's signal
   *  aborts 5 s before it, so the handler answers instead of being killed
   *  mid-write (stream-proxy-hop: lifetime-cap-rotation). */
  readonly maxDuration?: number;
  /** The JSON body (POST/PUT/PATCH) or, for other methods, the query string. */
  readonly input?: S;
};

export type RouteContext<I> = {
  readonly req: Request;
  /** null only under `guard: "public"`. */
  readonly who: Principal | null;
  readonly input: I;
  /** Aborts when the client leaves or the deadline passes. */
  readonly signal: AbortSignal;
  readonly params: Promise<Record<string, string | string[] | undefined>>;
};

type InputOf<S> = S extends z.ZodType ? Parsed<z.output<S>> : undefined;
type Handler<S, T> = (ctx: RouteContext<InputOf<S>>) => Promise<Result<T> | Response>;
type NextContext = { params: Promise<Record<string, string | string[] | undefined>> };

const DEADLINE_MARGIN_MS = 5_000;
const HAS_BODY = new Set(["POST", "PUT", "PATCH"]);
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

function refusalError(r: Refusal): { error: AppError; headers: HeadersInit } {
  if (r.status === 503) return { error: new AppError("unavailable", r.detail, { detail: r.code }), headers: { "retry-after": "30" } };
  return { error: new AppError("unauthenticated", r.detail, { detail: r.code }), headers: {} };
}

/** Who may call: the request's own credential, else the session cookie. */
export async function guardOf(req: Request, guard: Exclude<Guard, "public">): Promise<{ who: Principal } | { refusal: Response }> {
  const use: KeyUse = guard === "money" ? "money" : "read";
  let who: Resolution = await resolvePrincipal(req, { use });
  let viaCookie = false;
  if (isRefusal(who) && presentedSecret(req) === undefined && presentedIdToken(req) === undefined) {
    const token = cookieValue(req.headers.get("cookie"), SESSION_COOKIE);
    if (token !== undefined) {
      who = await verifySession(token, use);
      viaCookie = true;
    }
  }
  if (guard === "money") {
    // v1's order: the bucket before the refusal, so a flood meets the limit
    // ahead of its 401s; one verified person is one bucket from any address.
    const rl = rateLimit(principalRateKey(who) ?? clientIp(req));
    if (!rl.allowed) {
      const e = new AppError("unavailable", "Too many requests. Slow down and retry.", { detail: "rate-limited" });
      return { refusal: envelope(e, "route guard", { "retry-after": String(rl.retryAfterSec) }) };
    }
  }
  if (isRefusal(who)) {
    const r = refusalError(who);
    return { refusal: envelope(r.error, "route guard", r.headers) };
  }
  if (viaCookie && !SAFE.has(req.method) && !sameOrigin(req)) {
    return { refusal: envelope(new AppError("refused", "A session cookie is accepted on a write only from this origin.", { detail: "cross-origin" }), "route guard") };
  }
  return { who };
}

function deadline(req: Request, maxDuration: number | undefined): AbortSignal {
  if (maxDuration === undefined) return req.signal;
  return AbortSignal.any([req.signal, AbortSignal.timeout(Math.max(1_000, maxDuration * 1000 - DEADLINE_MARGIN_MS))]);
}

/** Wrap a handler: guard, cap and parse the input, run, answer one envelope. */
export function route<S extends z.ZodType | undefined = undefined, T = unknown>(
  opts: RouteOptions<S>,
  handler: Handler<S, T>,
): (req: Request, ctx?: NextContext) => Promise<Response> {
  return async (req, ctx) => {
    const where = `${req.method} ${new URL(req.url).pathname}`;
    const signal = deadline(req, opts.maxDuration);
    try {
      let who: Principal | null = null;
      if (opts.guard !== "public") {
        const g = await guardOf(req, opts.guard);
        if ("refusal" in g) return g.refusal;
        who = g.who;
      }
      let input: unknown = undefined;
      if (opts.input !== undefined) {
        const parsed = HAS_BODY.has(req.method) ? await readJson(req, opts.bodyCap, opts.input, where) : parseAt(where, opts.input, queryOf(req));
        if (!parsed.ok) return envelope(parsed.error, where);
        input = parsed.value;
      } else if (HAS_BODY.has(req.method) && opts.bodyCap === 0 && req.body !== null) {
        // A route that declared no input takes no body; one byte is refused, not ignored.
        const none = await readJson(req, 0, z.null(), where);
        if (!none.ok) return envelope(none.error, where);
      }
      // `input` is the schema door's output when `opts.input` is a schema and
      // undefined when it is not - which is InputOf<S> by construction; the
      // conditional type cannot be narrowed through the runtime branch above.
      const out = await handler({ req, who, input: input as InputOf<S>, signal, params: ctx?.params ?? Promise.resolve({}) });
      return out instanceof Response ? out : resultResponse(out, where);
    } catch (e) {
      if (req.signal.aborted) return clientGone();
      if (signal.aborted) return envelope(new AppError("unavailable", `${where} ran past its ${opts.maxDuration ?? 0} s budget`, { detail: "deadline" }), where);
      return envelope(asAppError(e), where);
    }
  };
}
