// The error taxonomy for every text provider — one class, one status map.
//
// WHAT THIS REPLACES. Before this file, /api/recalibrate and /api/frames each
// carried their own copy of this:
//
//     const status = e.kind === "not-installed" || e.kind === "not-logged-in" ? 503 : 504;
//
// Two copies of a status decision, in two handlers, with no third place that
// owned it — so a new kind added to `CliError` would have been mapped by
// whichever handler its author happened to open. lib/imaging/errors.ts already
// solved this for images ("One place, so two routes cannot disagree about what a
// refusal is"); this is the same fix for the same reason on the other engine.
//
// SHAPED LIKE ImagingError ON PURPOSE, down to `dispatched` and `reroutable`.
// The kinds that mean the same thing carry the same names and the same statuses,
// because a client that has learned what a 503 from /api/imaging/generate means
// should not have to learn a second dialect for /api/frames.
//
// THE KINDS THAT ARE NEW HERE all describe one thing images cannot have: a
// transport that is a process on a machine rather than an endpoint on a network.
// `not-installed`, `not-logged-in`, `policy-forbidden` and `managed-platform`
// are four genuinely different reasons a local engine is unavailable, and the
// registry's fallback-ladder technique is explicit that collapsing them is how
// an offline policy flag gets deleted by someone repairing the wrong cause:
// "policy-forbidden must read as forbidden by policy in the descent record, not
// as binary missing".

import type { TextCapability, TextProviderId } from "./types";

export type TextErrorKind =
  /** No API key configured for this provider. Setup, not runtime. */
  | "no-key"
  /** The binary is not on PATH. Remedy: install it. */
  | "not-installed"
  /** The binary is there and has no usable credential. Remedy: log in. */
  | "not-logged-in"
  /** An operator forbade the local transport on a machine that could run it.
   *  Remedy: LOCAL_BINARIES. Never reported as "not-installed". */
  | "policy-forbidden"
  /** A managed serverless platform: no binary, no login, and no configuration
   *  that changes either. Remedy: a cloud provider, or a different host. */
  | "managed-platform"
  /** The adapter does not implement the capability. A bug in the plan table. */
  | "unsupported"
  /** A ceiling this adapter checks BEFORE dispatch — a prompt past the vendor's
   *  documented input limit. Nothing was sent and nothing was billed, so it is
   *  the caller's 400 rather than a 502 inviting a retry that fails forever. */
  | "invalid-request"
  /** The vendor's safety layer declined. Re-route, never retry. */
  | "refused"
  /** The caller ruled out the only provider planned for this turn. */
  | "no-alternative"
  /** 429 / quota. */
  | "rate-limited"
  /** The call did not finish inside the application's ceiling. */
  | "timeout"
  /** It answered, and we could not use what came back — prose where JSON was
   *  required, a missing required field, an envelope that did not parse. */
  | "bad-response"
  /** Anything else. */
  | "failed";

export class TextError extends Error {
  constructor(
    message: string,
    readonly kind: TextErrorKind,
    readonly provider?: TextProviderId,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "TextError";
  }

  /** Did this call actually reach an engine before it failed? Evidence, not
   *  inference — set only where a response was received or a process was
   *  started, exactly as ImagingError.dispatched is. A spend meter reads this
   *  flag rather than the kind, because `failed` covers both a vendor 400 that
   *  was billed and a DNS lookup that never left the machine. */
  dispatched = false;

  /** Is a plain retry against the SAME provider worth attempting? */
  get retryable(): boolean {
    return this.kind === "rate-limited" || this.kind === "timeout";
  }

  /**
   * Would ANOTHER provider plausibly succeed where this one did not?
   *
   * The five availability kinds are all reroutable, and that is the whole point
   * of this engine: "the local `claude` binary is missing" is the normal state
   * of a Cloud Run container, and the correct response is to walk to the cloud
   * adapter, not to fail. `refused` and `rate-limited` join them for the same
   * reasons lib/imaging/errors.ts gives.
   *
   * `failed`, `bad-response` and `timeout` are deliberately absent, and the
   * argument is lib/imaging/errors.ts's, sharpened by cost. A reasoning turn
   * here is MINUTES and real money. Re-routing an unexplained failure buys a
   * second minutes-long bill for a request the first engine never declined, and
   * `bad-response` in particular usually means our own prompt or parser is
   * wrong — which a second vendor will reproduce, more expensively.
   */
  get reroutable(): boolean {
    return (
      this.kind === "no-key" ||
      this.kind === "not-installed" ||
      this.kind === "not-logged-in" ||
      this.kind === "policy-forbidden" ||
      this.kind === "managed-platform" ||
      this.kind === "refused" ||
      this.kind === "rate-limited"
    );
  }
}

export const noKey = (provider: TextProviderId, envVar: string) =>
  new TextError(
    `No API key for ${provider}. Set ${envVar} in .env.local — see .env.example.`,
    "no-key",
    provider,
  );

export const unsupported = (provider: TextProviderId, cap: TextCapability) =>
  new TextError(`The ${provider} adapter does not implement ${cap}.`, "unsupported", provider);

/** A limit this adapter checked itself, before dispatch. The message is the
 *  adapter's own sentence and names the remedy. */
export const invalidRequest = (provider: TextProviderId, message: string) =>
  new TextError(message, "invalid-request", provider);

/**
 * The caller avoided the only provider planned for this turn.
 *
 * The common case rather than the exotic one, exactly as in imaging: a chain
 * with one entry is emptied by any `avoid` at all. Serving the avoided provider
 * anyway would be the one unacceptable answer.
 */
export const noAlternative = (avoided: TextProviderId, turn: string) =>
  new TextError(
    `This request asked to avoid ${avoided}, and ${avoided} is the only provider planned for ` +
      `a ${turn} turn in this environment. There is no second engine to hand it to.`,
    "no-alternative",
    avoided,
  );

/**
 * THE BOTTOM OF THE LADDER: no engine could be reached, and there is no
 * deterministic stand-in for this turn.
 *
 * Rung 4 of the registry's fallback ladder — honest refusal — and it carries the
 * whole descent record in its message, because the single most useless thing
 * this engine could say is "the model could not be reached" when what actually
 * happened was "there is no binary here and no key either". The message names
 * every candidate and why each one dropped out; the remedy is in it.
 *
 * `kind` DEFAULTS TO `not-installed` AND THE CALLER SHOULD ALMOST ALWAYS PASS
 * ONE. This was a hardcoded `not-installed` until the 2026-08-27 verification
 * pass ran the bottom of the ladder for real and printed
 *
 *     kind=not-installed  tried=claude-cli:policy-forbidden,google:no-key
 *
 * — an error whose `kind` contradicted its own trail. Nothing was "not
 * installed": a policy flag forbade one engine and the other had no key. That is
 * the exact conflation fallback-ladder warns about ("repairing the wrong cause
 * is how offline flags get deleted by well-meaning fixes"), reproduced by the
 * very function written to prevent it. The router now passes the kind of the
 * FIRST candidate that dropped out — the engine it meant to use — which is the
 * one this error's message is already built around.
 */
export const noEngine = (message: string, kind: TextErrorKind = "not-installed") =>
  new TextError(message, kind);

/** HTTP status for a route handler to return. One place. */
export function statusFor(kind: TextErrorKind): number {
  switch (kind) {
    // The server is not configured or not capable; the request was fine. All
    // five availability kinds share 503 — they differ in REMEDY, which is in the
    // message and the `code`, not in the status a client branches on.
    case "no-key":
    case "not-installed":
    case "not-logged-in":
    case "policy-forbidden":
    case "managed-platform":
      return 503;
    case "unsupported":
      return 501;
    case "invalid-request":
      return 400;
    case "refused":
      return 422; // understood, and declined — not a client format error
    case "no-alternative":
      return 409; // well-formed; it conflicts with the roster
    case "rate-limited":
      return 429;
    case "timeout":
      return 504;
    case "bad-response":
    case "failed":
      return 502;
  }
}
