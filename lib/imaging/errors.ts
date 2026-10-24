// The error taxonomy for every imaging vendor.
//
// Shaped like lib/claudeCli.ts's CliError on purpose: one class, a `kind` the
// caller switches on, and a message already written for a human. The route
// handlers map `kind` → HTTP status; nothing re-derives a status from a string.
//
// `refused` earns its place in the union rather than collapsing into `failed`,
// and the reason is a measured one: Google's image models refuse recognisable
// public figures outright, and the fix that worked in the field was a
// CROSS-VENDOR RE-ROUTE, not a retry. A caller that cannot tell refusal from
// failure will sit in a retry loop against a wall.

import type { Capability, ProviderId } from "./types";

export type ImagingErrorKind =
  /** No API key configured for this provider. Setup, not runtime. */
  | "no-key"
  /** This provider does not implement this capability. A routing bug. */
  | "unsupported"
  /** The request cannot be sent to this vendor as written — a ceiling the
   *  adapter checks BEFORE dispatch, such as Leonardo's 1500-character prompt
   *  limit or Qwen's 10 MB inline-image limit.
   *
   *  It earns its place next to `bad-response`, which is what these two checks
   *  used to raise, and the difference is money: `bad-response` means the vendor
   *  answered, so the router books it as billed (see billedOnFailure). Nothing
   *  is dispatched here, nothing is billed, and the caller is told a 400 — their
   *  own input, fixable by them — rather than a 502 that says the vendor
   *  misbehaved and invites a retry that will fail identically forever. */
  | "invalid-request"
  /** The vendor's safety layer declined. Re-route, never retry. */
  | "refused"
  /** The caller ruled out the only vendor that could have served this. Not a
   *  refusal and not a missing key — the request and the config are both fine,
   *  they just cannot be satisfied together. Nowhere to route. */
  | "no-alternative"
  /** 429 / quota. Retry with backoff, or re-route. */
  | "rate-limited"
  /** The call did not finish in time. */
  | "timeout"
  /** The vendor answered, but with something we cannot use. */
  | "bad-response"
  /** The call would push spend in the current window past the configured
   *  ceiling. Refused BEFORE any vendor is touched — the request and the config
   *  are both fine, there is simply no budget left to spend. Not reroutable
   *  (another vendor spends the same budget) and not retryable (the ceiling
   *  does not move on retry). See lib/imaging/budget.ts. */
  | "over-budget"
  /** Anything else the vendor did. */
  | "failed";

export class ImagingError extends Error {
  constructor(
    message: string,
    readonly kind: ImagingErrorKind,
    readonly provider?: ProviderId,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ImagingError";
  }

  /**
   * Did this request actually reach the vendor before it failed?
   *
   * EVIDENCE, NOT INFERENCE. Set to true only by the one place that can know —
   * http.ts, on the paths where a response was received or a request was aborted
   * mid-flight — and left false everywhere else, including a connection that was
   * never established. It is deliberately NOT derived from `kind`: a `failed` can
   * be a 400 the vendor answered or a DNS lookup that never left the machine, and
   * the two owe different money.
   *
   * The consumer is the spend meter (lib/imaging/budget.ts, via the router's
   * inner catch): a call the vendor ran and billed must be booked even though it
   * produced nothing, and a call that never left must not be.
   */
  dispatched = false;

  /** Is a plain retry against the SAME vendor worth attempting? A refusal is
   *  deterministic — the same prompt refuses again — so it is not. */
  get retryable(): boolean {
    return this.kind === "rate-limited" || this.kind === "timeout";
  }

  /**
   * Would another vendor plausibly succeed where this one did not?
   *
   * `failed` and `bad-response` are deliberately NOT in this list, and the next
   * reader who wants to add them should read this first — it has been weighed:
   *
   *  1. What arrives as `failed` is a 4xx, a 5xx, an unreachable host, or a
   *     bug in our own adapter. A second vendor fixes none of the first, third
   *     or fourth. A 5xx on a vendor WORK request is presumed billed (see
   *     presumedBilled below), so http.ts does not even retry it against the
   *     same vendor; handing it to a different one would bill twice for a
   *     request nobody declined. (A 503 was weighed as `rate-limited` and kept
   *     here on purpose: that kind is reroutable, and in dev it would walk a
   *     style-locked request to Leonardo - point 3.)
   *  2. Re-routing bills a vendor for a request the first one never declined.
   *     The chain exists to cross a POLICY edge (a refusal is deterministic and
   *     only another vendor's policy can clear it), not to paper over an
   *     outage — see the header of router.ts.
   *  3. In dev the only generate fallback is Leonardo, which reads no style
   *     references. Re-routing an unexplained failure there returns a perfectly
   *     good image in the wrong style — the silent near-miss types.ts calls the
   *     worst failure this layer could have.
   *
   * `bad-response` is the same argument with the adapter-bug case louder: the
   * vendor answered, and we could not read it. That is ours to fix.
   */
  get reroutable(): boolean {
    return this.kind === "refused" || this.kind === "rate-limited" || this.kind === "no-key";
  }
}

/**
 * Did this failure cost money? THE ONE AUTHORITY.
 *
 * Two readers, one rule. The router's meter books a failed row when this says
 * true (router.ts re-exports it as `billedOnFailure`), and http.ts refuses to
 * re-send a `billable` request when this says true. They used to answer apart:
 * the meter called a 5xx-after-dispatch and a timeout billed, and the transport
 * re-sent both up to three times under one hold, booking one row - a meter that
 * under-read by up to 3x exactly during an incident.
 *
 * The rule is: the vendor is presumed to have billed only where it is presumed
 * to have DONE WORK. Erring in either direction has a cost, and they are not
 * symmetric - an over-count refuses calls the operator could afford, an
 * under-count is a ceiling that lets an incident run. The kinds are enumerated
 * rather than defaulted so that a new kind added to the taxonomy fails to
 * compile here instead of silently landing on whichever side is written last.
 *
 *   timeout        BILLED. The request was in flight when our clock ran out. The
 *                  vendor very likely finished and will invoice it; the one thing
 *                  we know for certain is that we cannot know, and a spend guard
 *                  that guesses should guess high.
 *   bad-response   BILLED. The vendor answered. It ran.
 *   refused        BILLED. A safety block is a decision the model makes AFTER
 *                  reading the prompt, and the adapters raise it from a 200 body
 *                  (see http.ts's header) - inference happened.
 *   failed         BILLED ONLY IF DISPATCHED. This kind covers both a 4xx/5xx the
 *                  vendor answered and a host that could not be reached at all.
 *                  Only http.ts knows which, and it says so on the error.
 *
 *   rate-limited    NOT billed. A 429 is the door refusing before anything ran.
 *   invalid-request NOT billed. An adapter checked one of the vendor's own
 *                   limits and refused to dispatch. Nothing left the process.
 *   no-key         NOT billed. Rejected at authentication, or never attempted.
 *   unsupported    NOT billed. A routing-table fact; no call is made.
 *   no-alternative NOT billed. The chain emptied before a vendor was chosen.
 *   over-budget    NOT billed. Refused by our own ceiling, before any vendor.
 *
 * The last three never reach the router's catch - each is a `continue` or a
 * throw upstream of it - and they are listed so the reasoning is complete
 * rather than because the branch is live.
 */
export function presumedBilled(err: ImagingError): boolean {
  switch (err.kind) {
    case "timeout":
    case "bad-response":
    case "refused":
      return true;
    case "failed":
      return err.dispatched;
    case "rate-limited":
    case "invalid-request":
    case "no-key":
    case "unsupported":
    case "no-alternative":
    case "over-budget":
      return false;
  }
}

/** `envVar` is a variable name for a keyed vendor, or - for one with no key to
 *  hold, like agy's presence-probed CLI - what it needs instead, which is not
 *  something to set in .env.local. */
export const noKey = (provider: ProviderId, envVar: string) =>
  new ImagingError(
    /^[A-Z][A-Z0-9_]*$/.test(envVar)
      ? `No API key for ${provider}. Set ${envVar} in .env.local — see .env.example.`
      : `${provider} is not configured: ${envVar}.`,
    "no-key",
    provider,
  );

export const unsupported = (provider: ProviderId, cap: Capability) =>
  new ImagingError(`The ${provider} adapter does not implement ${cap}.`, "unsupported", provider);

/**
 * A vendor-side limit this adapter checked itself, before dispatch.
 *
 * The message is the adapter's own sentence — it names the limit and what to do
 * about it — and it is the caller's to act on, so it travels at 400 and never
 * reaches the spend meter.
 */
export const invalidRequest = (provider: ProviderId, message: string) =>
  new ImagingError(message, "invalid-request", provider);

/**
 * A request asked to avoid the only vendor planned for the capability.
 *
 * This is the honest end of `avoid`, and it is the common case rather than the
 * exotic one: every PRODUCTION chain is single-entry by design, so in prod
 * avoiding a vendor always lands here. Serving the avoided vendor's work
 * anyway would be the one unacceptable answer — a surface that offers "try a
 * different model" after a refusal would show the same refusing model's output
 * and call it a re-route.
 */
export const noAlternative = (avoided: ProviderId, cap: Capability) =>
  new ImagingError(
    `This request asked to avoid ${avoided}, and ${avoided} is the only provider planned for ` +
      `${cap} in this environment. There is no second vendor to hand it to.`,
    "no-alternative",
    avoided,
  );

/**
 * The spend ceiling for the current window has been reached. Thrown at the
 * chokepoint before a vendor is called, with the numbers in the message so the
 * reason is legible in the log and the response alike.
 */
export const overBudget = (message: string) =>
  new ImagingError(message, "over-budget");

/** HTTP status for a route handler to return. One place, so two routes cannot
 *  disagree about what a refusal is. */
export function statusFor(kind: ImagingErrorKind): number {
  switch (kind) {
    case "no-key":
      return 503; // the server is not configured; the request was fine
    case "unsupported":
      return 501;
    case "invalid-request":
      return 400; // the caller's input exceeds a limit this adapter enforces
    case "refused":
      return 422; // understood, and declined — not a client format error
    case "no-alternative":
      return 409; // the request is well-formed; it conflicts with the roster
    case "over-budget":
      return 402; // Payment Required — understood, and refused on cost
    case "rate-limited":
      return 429;
    case "timeout":
      return 504;
    case "bad-response":
    case "failed":
      return 502;
  }
}
