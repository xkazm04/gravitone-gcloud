// One HTTP helper for every cloud text provider: timeout, a status→kind map,
// and a retry posture that is deliberately NOT lib/imaging/http.ts's.
//
// ── WHY THIS IS NOT A CALL INTO lib/imaging/http.ts ─────────────────────────
//
// It would fit, structurally: same fetch, same AbortController, same
// classification of 429/401/5xx. What does not fit is the RETRY POSTURE, and the
// difference is measured in minutes and dollars rather than taste.
//
// `requestJson` in lib/imaging defaults to `attempts: 3` with exponential
// backoff, because an image call is seconds long and a transient 5xx is worth
// three goes. A reasoning turn on this engine is MINUTES: /api/recalibrate's own
// header calls a real run "minutes, not milliseconds", and /api/frames budgets
// `maxDuration = 800`. Three silent attempts at a minutes-long, metered turn is
// three bills and three times the wait for a creator watching a spinner, decided
// by a default they never saw.
//
// So this defaults to ONE attempt. A retry here is the ROUTER's decision, made
// once, with the trail recording it — not a default buried in a transport
// helper. That is a genuinely different contract, and expressing it by passing
// `attempts: 1` into a helper whose whole shape assumes 3 would leave the next
// reader one careless default away from tripling the bill.
//
// The other half of the answer: this file is deliberately small. It does the
// four things a cloud text call needs and nothing else — no DELETE, no cleanup
// path, no per-vendor body shapes. If a third cloud text vendor ever arrives and
// this grows a vendor-specific branch, that is the signal to extract a shared
// core from both files rather than to keep two.

import { TextError, type TextErrorKind } from "./errors";
import type { TextProviderId } from "./types";

export interface TextRequestOptions {
  headers?: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  /** Attempts for retryable failures. ONE by default — see the header. */
  attempts?: number;
}

function kindForStatus(status: number): TextErrorKind {
  if (status === 429) return "rate-limited";
  if (status === 401 || status === 403) return "no-key";
  return "failed";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST JSON, get JSON, with the vendor's own error text preserved in `detail`
 *  — which the log module then refuses to print. Both are true on purpose: it is
 *  there for a debugger attached to the process, not for a log file. */
export async function postJson<T>(
  provider: TextProviderId,
  url: string,
  opts: TextRequestOptions,
): Promise<T> {
  const { headers = {}, body, timeoutMs, attempts = 1 } = opts;

  let last: TextError | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        // The URL is never interpolated into this message. Every provider here
        // authenticates by HEADER, so no URL this module builds carries a
        // credential — but a message that named the URL would make that a
        // property of today's adapters rather than of this file.
        const err = new TextError(
          `${provider} returned ${res.status}.`,
          kindForStatus(res.status),
          provider,
          text.slice(0, 600),
        );
        // It answered, so the request unambiguously reached it. Whether it
        // BILLED is a separate question; this flag records only that bytes
        // arrived.
        err.dispatched = true;
        if (attempt < attempts && (err.retryable || res.status >= 500)) {
          last = err;
          await sleep(400 * 2 ** (attempt - 1));
          continue;
        }
        throw err;
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        const err = new TextError(
          `${provider} returned a body that was not JSON.`,
          "bad-response",
          provider,
          text.slice(0, 600),
        );
        err.dispatched = true; // it answered — we just could not read it
        throw err;
      }
    } catch (e) {
      if (e instanceof TextError) {
        if (attempt >= attempts || !e.retryable) throw e;
        last = e;
      } else if ((e as Error)?.name === "AbortError") {
        last = new TextError(
          `${provider} did not answer within ${Math.round(timeoutMs / 1000)}s.`,
          "timeout",
          provider,
        );
        // The request was in flight when we hung up. The vendor may well have
        // finished the work and will bill for it; our clock ran out, not theirs.
        last.dispatched = true;
        throw last;
      } else {
        // NOT dispatched: the transport refused to connect — DNS, TLS, an
        // unreachable host — so nothing reached a vendor and nothing can have
        // been billed. It shares `kind: "failed"` with errors that DID arrive,
        // which is exactly why a meter must read the flag and not the kind.
        throw new TextError(`${provider} could not be reached.`, "failed", provider, String(e));
      }
      await sleep(400 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last ?? new TextError(`${provider} failed.`, "failed", provider);
}
