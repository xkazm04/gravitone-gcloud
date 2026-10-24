// Request validation and error shaping for the /api/imaging/* handlers.
//
// Lives here rather than in each route so three handlers cannot drift into
// three different opinions about what a refusal is, or three different words
// for the same bad input. The routes stay thin enough to read in one screen.

import { createHash } from "node:crypto";

import { clientIp, resolvePrincipal } from "@/lib/apiAuth";
import { principalRateKey } from "@/lib/principal";

import { earliestExpiry } from "./budgetForecast";
import { ImagingError, statusFor } from "./errors";
import { logUnexpected, scrub } from "./log";
import { IdempotencyConflict, withReceipt } from "./receipts";
import {
  ASPECT_PX,
  PROVIDER_IDS,
  type Aspect,
  type ImageRef,
  type ProviderId,
  type ProviderSteer,
} from "./types";

export class BadRequest extends Error {}

const MIMES = ["image/png", "image/jpeg", "image/webp"] as const;

export function asString(v: unknown, field: string, max = 8000): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequest(`\`${field}\` is required.`);
  if (v.length > max) throw new BadRequest(`\`${field}\` is longer than ${max} characters.`);
  return v;
}

export function asAspect(v: unknown): Aspect {
  // No default. The whole point of aspect being required is that a batch
  // silently coming back in the wrong ratio is a class of bug we have decided
  // not to have.
  if (typeof v !== "string" || !(v in ASPECT_PX))
    throw new BadRequest(`\`aspect\` must be one of ${Object.keys(ASPECT_PX).join(", ")}.`);
  return v as Aspect;
}

export function asImage(v: unknown, field: string): ImageRef {
  if (typeof v !== "object" || v === null) throw new BadRequest(`\`${field}\` is required.`);
  const o = v as Record<string, unknown>;
  const base64 = typeof o.base64 === "string" ? o.base64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!base64) throw new BadRequest(`\`${field}.base64\` is required.`);
  const mime = typeof o.mime === "string" ? o.mime : "image/png";
  if (!(MIMES as readonly string[]).includes(mime))
    throw new BadRequest(`\`${field}.mime\` must be one of ${MIMES.join(", ")}.`);
  return { base64, mime: mime as ImageRef["mime"] };
}

export function asImages(v: unknown, field: string, cap: number): ImageRef[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new BadRequest(`\`${field}\` must be an array.`);
  if (v.length > cap) throw new BadRequest(`\`${field}\` accepts at most ${cap} images.`);
  return v.map((x, i) => asImage(x, `${field}[${i}]`));
}

export function asCount(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 8) throw new BadRequest("`count` must be 1–8.");
  return n;
}

export function asProviderId(v: unknown, field: string): ProviderId | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !(PROVIDER_IDS as readonly string[]).includes(v))
    throw new BadRequest(`\`${field}\` must be one of ${PROVIDER_IDS.join(", ")}.`);
  return v as ProviderId;
}

/**
 * The caller's vendor steer, validated like every other field.
 *
 * An unknown vendor id is a 400 rather than a shrug, and `avoid` is why: a
 * typo'd avoidance that fell back to default routing would send the request to
 * the very vendor the caller ruled out, and answer 200. That is the one
 * outcome this field may never have.
 */
export function asSteer(body: Record<string, unknown>): ProviderSteer {
  const prefer = asProviderId(body.prefer, "prefer");
  const avoid = asProviderId(body.avoid, "avoid");
  if (prefer && avoid && prefer === avoid)
    throw new BadRequest("`prefer` and `avoid` name the same provider.");
  return { prefer, avoid };
}

/* ── Keyed requests (./receipts.ts) ──────────────────────────────────────── */

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const RECEIPT_HEADER = "x-imaging-receipt";

/** The caller's idempotency key: 1-128 printable ASCII characters, `undefined`
 *  when the header is absent, a 400 when it is present and malformed. */
export function asIdempotencyKey(req: Request): string | undefined {
  const v = req.headers.get(IDEMPOTENCY_HEADER);
  if (v === null) return undefined;
  if (!/^[\x21-\x7e]{1,128}$/.test(v))
    throw new BadRequest(`\`${IDEMPOTENCY_HEADER}\` must be 1-128 printable characters.`);
  return v;
}

/** Keys sorted at every level, `undefined` dropped: two requests that mean the
 *  same thing hash the same whatever order their fields arrived in. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (typeof v !== "object" || v === null) return v;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v).sort()) {
    const x = (v as Record<string, unknown>)[k];
    if (x !== undefined) out[k] = canonical(x);
  }
  return out;
}

/** sha256 over the VALIDATED request — reference bytes included — prefixed
 *  with the route, so one key cannot be spent on two different routes. */
export function bodyHash(route: string, validated: unknown): string {
  return createHash("sha256").update(route).update("\u0000").update(JSON.stringify(canonical(validated))).digest("hex");
}

/**
 * Run a paid imaging call and answer it — through a receipt when the caller
 * sent an idempotency key, exactly as before when it did not.
 *
 * The scope is the verified person where there is one, else the client IP —
 * the same key the rate limiter buckets on — so one person's key can never
 * replay another person's pixels.
 */
export async function respondKeyed<T>(
  req: Request,
  route: string,
  validated: unknown,
  run: () => Promise<T>,
): Promise<Response> {
  const key = asIdempotencyKey(req);
  if (key === undefined) return Response.json(await run());
  const who = await resolvePrincipal(req);
  const scope = principalRateKey(who) ?? `ip:${clientIp(req)}`;
  const { value, receipt } = await withReceipt({ scope, key, bodyHash: bodyHash(route, validated) }, run);
  return Response.json(value, { headers: { [RECEIPT_HEADER]: receipt } });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new BadRequest("The request body was not a JSON object.");
  }
}

/** One error vocabulary for every imaging route. `code` is the machine-readable
 *  half; `detail` is already written for a person to read.
 *
 *  Only the LAST branch logs. An ImagingError has already been logged by the
 *  router, which knows the whole attempt — capability, chain, timings — where
 *  this function sees one exception; logging it again would double every
 *  failure line. A BadRequest never reached a vendor at all. */
export function errorResponse(e: unknown, now: number = Date.now()): Response {
  // A BadRequest is ours end to end — this layer built the sentence from the
  // caller's own field names, and no vendor text can reach it.
  if (e instanceof BadRequest) return Response.json({ detail: e.message, code: "bad-request" }, { status: 400 });
  // Ours too, and nothing was reserved or dispatched: the key names a
  // different request, so this one is refused before the router is reached.
  if (e instanceof IdempotencyConflict)
    return Response.json({ detail: e.message, code: "idempotency-conflict" }, { status: 409 });

  // SCRUBBED, for the reason log.ts already gives about the same string: an
  // ImagingError's `message` READS as ours, but providers/google.ts#assertUsable splices
  // the vendor's own `error.message` into it verbatim, so it is not provably
  // free of vendor-supplied text — and a vendor that echoes our key back puts
  // that key in this response body.
  //
  // Measured 2026-08-14, before this line existed: the log said
  //   msg="… upstream rejected credential [redacted] at line 3"
  // and the HTTP body said
  //   "detail":"… upstream rejected credential offline-probe-google-key-0000 …"
  // Same string, one defended and one not. The log was scrubbed because it was
  // the audited surface; this one was simply never looked at.
  //
  // `e.detail` — up to 600 chars of raw vendor body, which can echo the user's
  // own prompt — has never been in this response and must not be added.
  if (e instanceof ImagingError) {
    // statusFor owns the mapping, over-budget -> 402 included: `kind` is a
    // closed union, so no second spelling of a refusal can reach this branch.
    const status = statusFor(e.kind);
    const body: Record<string, unknown> = {
      detail: scrub(e.message),
      code: e.kind,
      provider: e.provider,
    };
    const headers: Record<string, string> = {};
    if (status === 402) {
      const retryAt = earliestExpiry(now);
      body.retryAt = retryAt;
      headers["Retry-After"] = String(Math.max(1, Math.ceil((retryAt - now) / 1000)));
    }
    return Response.json(body, { status, headers });
  }

  // Not one of ours: a bug, not a vendor. `console.error(e)` printed the whole
  // object, `detail` and all — see log.ts on why that is not a log line.
  logUnexpected(e);
  return Response.json({ detail: "The imaging call failed.", code: "failed" }, { status: 502 });
}
