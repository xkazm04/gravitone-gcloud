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
  /** The vendor's safety layer declined. Re-route, never retry. */
  | "refused"
  /** 429 / quota. Retry with backoff, or re-route. */
  | "rate-limited"
  /** The call did not finish in time. */
  | "timeout"
  /** The vendor answered, but with something we cannot use. */
  | "bad-response"
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
   *  1. Everything transient has already been retried. http.ts makes three
   *     attempts with backoff on 429 and every 5xx; what survives that and
   *     arrives as `failed` is a 4xx, an unreachable host, or a bug in our own
   *     adapter. A second vendor fixes none of the three.
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

export const noKey = (provider: ProviderId, envVar: string) =>
  new ImagingError(
    `No API key for ${provider}. Set ${envVar} in .env.local — see .env.example.`,
    "no-key",
    provider,
  );

export const unsupported = (provider: ProviderId, cap: Capability) =>
  new ImagingError(`The ${provider} adapter does not implement ${cap}.`, "unsupported", provider);

/** HTTP status for a route handler to return. One place, so two routes cannot
 *  disagree about what a refusal is. */
export function statusFor(kind: ImagingErrorKind): number {
  switch (kind) {
    case "no-key":
      return 503; // the server is not configured; the request was fine
    case "unsupported":
      return 501;
    case "refused":
      return 422; // understood, and declined — not a client format error
    case "rate-limited":
      return 429;
    case "timeout":
      return 504;
    case "bad-response":
    case "failed":
      return 502;
  }
}
