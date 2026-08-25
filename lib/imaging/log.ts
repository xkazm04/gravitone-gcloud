// ONE LINE PER IMAGING CALL — the engine's entire server-side trace.
//
// Before this file the engine had two console.* calls between three vendors,
// and ImagingErrors were logged by NEITHER: api.ts's catch-all fires only for
// exceptions that are neither BadRequest nor ImagingError, so every refusal,
// rate-limit, timeout and vendor failure in the product left nothing to read.
// "It stopped working" was unanswerable.
//
// This is deliberately not a telemetry service and not a dependency. One
// greppable line on settle, written from the router — the chokepoint every
// image call already passes through, so there is nowhere to forget it:
//
//   [imaging] generate ok  provider=google model=gemini-3.1-flash-image ms=4210 cost=$0.0450
//   [imaging] generate ok  provider=leonardo model=lucid-origin ms=9120 cost=unpriced rerouted=google:refused
//   [imaging] generate err kind=no-key provider=google ms=2 tried=google:no-key,leonardo:no-key msg="…"
//
// ── WHAT A LOG LINE MAY CARRY (audited before the first line was written) ───
//
// SAFE by construction: capability, env, provider ids, error kinds, the reroute
// trail, durations, cost. All of these are closed unions or numbers this repo
// owns. Model ids come from adapters and may be operator-set via env
// (GOOGLE_IMAGE_MODEL) — a model name, not a credential, and scrubbed anyway.
//
// NOT SAFE, therefore scrubbed: the error MESSAGE. It reads as ours, but
// providers/google.ts:130 splices the vendor's own `error.message` into it
// verbatim, so a message is not provably free of vendor-supplied text. Every
// message goes through `scrub` and is collapsed to a single truncated line.
//
// NEVER LOGGED AT ALL: `ImagingError.detail`. It holds up to 600 characters of
// raw vendor response body (http.ts) or `String(e)` of an arbitrary exception.
// That can echo the user's prompt back — this is a creative tool, prompts are
// the user's content — and no amount of scrubbing makes a body a line.
//
// The keys themselves: all three vendors authenticate by HEADER (google
// `x-goog-api-key`, leonardo/qwen `authorization: Bearer`), never by query
// param, so no URL this engine builds carries a key — http.ts's `redact()`,
// which strips a `key=` param, is defence for a shape we no longer use. The one
// operator-supplied URL is QWEN_BASE_URL, which could carry `user:pass@`, so
// `scrub` strips URL userinfo too. And as a backstop `scrub` blanks any live
// key VALUE wherever it appears in a string, whatever route put it there.

import { KEY_VAR } from "./env";
import type { ImagingErrorKind } from "./errors";
import type { Capability, ProviderId, ProviderSteer, RerouteStep } from "./types";

const MASK = "[redacted]";

/** Credentials this process actually holds, so a leak of one is caught by
 *  VALUE rather than by guessing which field it travelled in. */
function liveSecrets(): string[] {
  const out: string[] = [];
  for (const v of Object.values(KEY_VAR)) {
    const s = process.env[v]?.trim();
    // Short values are almost certainly placeholders, and blanking a 3-char
    // string would redact half the line.
    if (s && s.length >= 8) out.push(s);
  }
  return out;
}

/** Remove anything credential-shaped from a string bound for a log. Order
 *  matters: `Bearer …` first, or the key/value rule masks the word "Bearer"
 *  and leaves the token standing after it. */
export function scrub(text: string): string {
  let s = text;
  for (const secret of liveSecrets()) s = s.split(secret).join(MASK);
  return s
    .replace(/\bBearer\s+[\w.\-+/=]+/gi, `Bearer ${MASK}`)
    .replace(/\/\/[^\s/@]+:[^\s/@]+@/g, `//${MASK}@`)
    .replace(
      /\b(api[-_]?key|key|token|secret|password|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi,
      (_m, name: string, sep: string) => `${name}${sep}${MASK}`,
    );
}

/** One line means one line: no newline survives, and nothing runs away. */
function oneLine(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface CallLog {
  cap: Capability;
  env: string;
  /** Elapsed inside the router, INCLUDING any re-route — which is what the
   *  user waited. The serving vendor's own time is in provenance.durationMs. */
  ms: number;
  /** The caller's steer, when it made one. */
  steer?: ProviderSteer;
  /** Vendors eliminated before the outcome, in order. */
  tried?: readonly RerouteStep[];
  /* — set when the call succeeded — */
  provider?: ProviderId;
  model?: string;
  costUsd?: number;
  /* — set when it did not — */
  kind?: ImagingErrorKind;
  message?: string;
}

/** The line, as a string. Separate from writing it so it can be asserted on. */
export function formatCall(l: CallLog): string {
  const f: string[] = [`[imaging]`, l.cap, l.kind ? "err" : "ok"];

  if (l.kind) {
    f.push(`kind=${l.kind}`);
    if (l.provider) f.push(`provider=${l.provider}`);
  } else {
    f.push(`provider=${l.provider ?? "-"}`);
    if (l.model) f.push(`model=${l.model}`);
  }

  f.push(`ms=${l.ms}`);
  // An unpriced call is UNPRICED, not free. A missing number is never a zero.
  if (!l.kind) f.push(`cost=${l.costUsd === undefined ? "unpriced" : `$${l.costUsd.toFixed(4)}`}`);

  if (l.tried?.length) {
    const trail = l.tried.map((t) => `${t.provider}:${t.why}`).join(",");
    // On a success the trail IS the re-route: someone was tried and lost.
    f.push(`${l.kind ? "tried" : "rerouted"}=${trail}`);
  }
  if (l.steer?.prefer) f.push(`prefer=${l.steer.prefer}`);
  if (l.steer?.avoid) f.push(`avoid=${l.steer.avoid}`);
  if (l.message) f.push(`msg="${oneLine(scrub(l.message))}"`);

  return f.join(" ");
}

export function logCall(l: CallLog): void {
  const line = formatCall(l);
  if (l.kind) console.error(line);
  else console.log(line);
}

/**
 * A remote artifact we could not tidy up. One scrubbed line, and never the
 * exception object.
 *
 * It exists because the Leonardo adapter's cleanup path was the one place in
 * this engine that logged straight to the console: `console.warn(msg, e)`
 * hands Node the whole ImagingError, and Node prints its own fields — including
 * `detail`, which http.ts fills with up to 600 characters of raw vendor
 * response body. That is exactly the object this module's header says may never
 * reach a log, and api.ts:129 already records the same mistake being removed
 * from the catch-all. This is the second door.
 *
 * The remote id is the point of the line — it is what lets a failed deletion be
 * chased by hand — so it is kept, beside the message and nothing else.
 */
export function logCleanupFailure(provider: ProviderId, remoteId: string, e: unknown): void {
  const raw = e instanceof Error ? e.message : String(e);
  console.warn(
    `[imaging] cleanup-failed provider=${provider} id=${remoteId} msg="${oneLine(scrub(raw))}"`,
  );
}

/** The catch-all: something that was not an ImagingError at all. Its stack is
 *  the point, so it gets more room — scrubbed, and still one line. */
export function logUnexpected(e: unknown): void {
  const raw = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error(`[imaging] err kind=unexpected msg="${oneLine(scrub(raw), 500)}"`);
}
