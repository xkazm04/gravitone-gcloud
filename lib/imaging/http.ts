// One HTTP helper for every vendor: timeout, bounded retry, and a single place
// where a vendor's status code becomes our ImagingError kind.
//
// Written once rather than per adapter because the three vendors fail in the
// same four ways and disagree only about the JSON around it. What this helper
// classifies is the TRANSPORT (`kindForStatus` below): a status code means the
// same thing everywhere.
//
// Refusals are deliberately NOT classified here. A safety block arrives as a
// 200 with a vendor-specific reason field — Google's is an undocumented message
// string matched by regex (providers/google.ts), Leonardo's is a terminal job
// status (providers/leonardo.ts) — so there is no shared shape to hook. Each
// adapter raises its own `refused` after this function has returned a body.

import { ImagingError, type ImagingErrorKind } from "./errors";
import { BlockedUrlError, safeFetch, type Resolver } from "./safeUrl";
import type { ProviderId } from "./types";

export interface RequestOptions {
  method?: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Attempts for retryable failures (429/5xx/timeout). 1 = no retry. */
  attempts?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function kindForStatus(status: number): ImagingErrorKind {
  if (status === 429) return "rate-limited";
  if (status === 401 || status === 403) return "no-key";
  return "failed";
}

/** JSON in, JSON out, with the vendor's own error text preserved in `detail`. */
export async function requestJson<T>(
  provider: ProviderId,
  url: string,
  opts: RequestOptions = {},
): Promise<T> {
  const { method = "GET", headers = {}, body, timeoutMs = 120_000, attempts = 3 } = opts;

  let last: ImagingError | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });

      const text = await res.text();
      if (!res.ok) {
        const err = new ImagingError(
          `${provider} returned ${res.status} for ${method} ${redact(url)}.`,
          kindForStatus(res.status),
          provider,
          text.slice(0, 600),
        );
        // The vendor answered, so the request unambiguously reached it. Whether
        // it BILLED for it is a separate question the router decides by kind;
        // this flag only records that the bytes arrived.
        err.dispatched = true;
        // 5xx and 429 are worth another go; a 400 will fail identically forever.
        if (err.retryable || res.status >= 500) {
          last = err;
          if (attempt < attempts) {
            await sleep(400 * 2 ** (attempt - 1));
            continue;
          }
        }
        throw err;
      }

      if (!text) return undefined as T; // DELETE commonly answers 200 with no body
      try {
        return JSON.parse(text) as T;
      } catch {
        const err = new ImagingError(`${provider} returned a body that was not JSON.`, "bad-response", provider, text.slice(0, 600));
        err.dispatched = true; // it answered — we just could not read it
        throw err;
      }
    } catch (e) {
      if (e instanceof ImagingError) {
        if (attempt >= attempts || !e.retryable) throw e;
        last = e;
      } else if ((e as Error)?.name === "AbortError") {
        last = new ImagingError(
          `${provider} did not answer within ${Math.round(timeoutMs / 1000)}s.`,
          "timeout",
          provider,
        );
        // The request was in flight when we hung up. The vendor may well have
        // finished the work and will bill for it; our clock ran out, not theirs.
        last.dispatched = true;
        if (attempt >= attempts) throw last;
      } else {
        // NOT dispatched, on purpose: this is the transport refusing to connect
        // — DNS, TLS, an unreachable host — so nothing ever reached a vendor and
        // nothing can have been billed. It shares `kind: "failed"` with errors
        // that DID arrive, which is exactly why the meter reads the flag rather
        // than the kind.
        throw new ImagingError(`${provider} could not be reached.`, "failed", provider, String(e));
      }
      await sleep(400 * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw last ?? new ImagingError(`${provider} failed.`, "failed", provider);
}

/**
 * Ceiling on a single downloaded image. A plate at 4K is a few MB, so this is
 * far above anything legitimate — it exists because the alternative is
 * unbounded: `arrayBuffer()` buffers whatever the far end sends, and the far
 * end is a URL a model handed us. A runaway or hostile response should fail
 * the call, not the process.
 */
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;

/** Download an image the vendor parked on a CDN, as base64. */
export async function fetchImageBase64(
  provider: ProviderId,
  url: string,
  timeoutMs = 60_000,
  /** Injectable for the probe only - see safeUrl.Resolver. */
  resolve?: Resolver,
): Promise<{ base64: string; mime: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    // safeFetch, not fetch: this URL came out of a VENDOR RESPONSE, and until
    // now the only things checked about it were how big and how slow the answer
    // was allowed to be. Where it pointed was not checked at all, so a plate URL
    // naming the cloud metadata endpoint or a loopback service was downloaded by
    // the server and handed back as base64. safeFetch refuses private
    // destinations and re-checks EVERY redirect hop, which is where the
    // equivalent fix in a sibling app found the real hole. See ./safeUrl.
    const res = await safeFetch(url, { signal: ctl.signal }, resolve);
    if (!res.ok)
      throw new ImagingError(
        `${provider} image download failed with ${res.status}.`,
        res.status === 404 ? "bad-response" : "failed",
        provider,
      );

    // Cheap check first: refuse before reading a body that declares itself
    // oversized. A missing or lying header is caught by the check after.
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
      ctl.abort();
      throw new ImagingError(
        `${provider} offered a ${Math.round(declared / 1024 / 1024)}MB image; the ceiling is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
        "bad-response",
        provider,
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_IMAGE_BYTES)
      throw new ImagingError(
        `${provider} returned a ${Math.round(buf.length / 1024 / 1024)}MB image; the ceiling is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
        "bad-response",
        provider,
      );
    if (buf.length === 0)
      throw new ImagingError(`${provider} returned an empty image.`, "bad-response", provider);
    return {
      base64: buf.toString("base64"),
      mime: res.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  } catch (e) {
    if (e instanceof ImagingError) throw e;
    if (e instanceof BlockedUrlError)
      throw new ImagingError(
        `${provider} pointed the image download at an address this server will not fetch.`,
        "bad-response",
        provider,
        e.why,
      );
    if ((e as Error)?.name === "AbortError")
      throw new ImagingError(`${provider} image download timed out.`, "timeout", provider);
    throw new ImagingError(`${provider} image download failed.`, "failed", provider, String(e));
  } finally {
    clearTimeout(timer);
  }
}

/** Keep query-string keys out of error messages and logs. */
function redact(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.has("key")) u.searchParams.set("key", "…");
    return `${u.origin}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
