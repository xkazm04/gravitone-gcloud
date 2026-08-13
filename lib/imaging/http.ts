// One HTTP helper for every vendor: timeout, bounded retry, and a single place
// where a vendor's status code becomes our ImagingError kind.
//
// Written once rather than per adapter because the three vendors fail in the
// same four ways and disagree only about the JSON around it. Adapters pass a
// `classify` hook for the vendor-specific part (a refusal usually arrives as a
// 200 with a reason field, not as a status code).

import { ImagingError, type ImagingErrorKind } from "./errors";
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
        throw new ImagingError(`${provider} returned a body that was not JSON.`, "bad-response", provider, text.slice(0, 600));
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
        if (attempt >= attempts) throw last;
      } else {
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
): Promise<{ base64: string; mime: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
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
