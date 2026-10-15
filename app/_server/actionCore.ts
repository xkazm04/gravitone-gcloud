import type { z } from "zod";

import { parseAt, type Parsed } from "@gt/domain/door";
import type { ErrorEnvelope, Result } from "@gt/domain/errors";

import { isRefusal, type Principal, type Resolution } from "../../lib/principal.ts";
import { asAppError, publicError } from "./http.ts";

// THE SERVER ACTION CORE - pure over its principal resolver, so it runs under
// Vitest; action.ts binds it to the request's session cookie.
//
// A Server Action is a POST endpoint anyone can reach with the action's id
// (Next's own guide: "treat every action as an untrusted entry point"), and
// its return value crosses into the client as serialised data. So the order is
// fixed and the output is closed:
//   1. WHO, before anything else reads the input (authorization: dispatch-
//      chokepoint-gating). Resolved with `money` key use: an action mutates,
//      and a mutation on a key set nobody could confirm is the failure
//      lib/principal.ts exists to prevent (a JWKS outage refuses, not admits);
//   2. THE INPUT, through `parseAt`, the one door - never a field read off an
//      unvalidated FormData or object;
//   3. THE BODY, which returns a Result. A throw is classified, never relayed:
//      an AppError keeps its code, anything else is `internal`, logged under a
//      reference, and answered opaquely (http.ts publicError);
//   4. A SERIALISABLE ANSWER. AppError is a class and does not survive React's
//      serialisation as itself; the client gets `{ok, value}` or `{ok, error}`
//      with the one envelope, the same shape route() answers with. An action
//      never throws to the client: a thrown action surfaces as Next's generic
//      error boundary, which can say nothing about what failed.

export type ActionResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ErrorEnvelope };

export type ActionBody<I, T> = (input: I, who: Principal) => Promise<Result<T>> | Result<T>;

function refusalEnvelope(r: Exclude<Resolution, Principal>): ErrorEnvelope {
  const code = r.status === 503 ? "unavailable" : "unauthenticated";
  return { error: r.detail, code, detail: r.code };
}

export async function runAction<S extends z.ZodType, T>(
  name: string,
  resolve: () => Promise<Resolution>,
  schema: S,
  body: ActionBody<Parsed<z.output<S>>, T>,
  raw: unknown,
): Promise<ActionResult<T>> {
  const where = `action ${name}`;
  try {
    const who = await resolve();
    if (isRefusal(who)) return { ok: false, error: refusalEnvelope(who) };
    const input = parseAt(where, schema, raw);
    if (!input.ok) return { ok: false, error: publicError(input.error, where) };
    const out = await body(input.value, who);
    return out.ok ? { ok: true, value: out.value } : { ok: false, error: publicError(out.error, where) };
  } catch (e) {
    return { ok: false, error: publicError(asAppError(e), where) };
  }
}
