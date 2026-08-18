"use client";

// The browser's half of lib/imaging — typed fetches to /api/imaging/*.
//
// A separate module from lib/imaging/* on purpose: those files read API keys
// and must never be reachable from a component. This one holds no secret and
// knows no vendor; it posts JSON to our own origin and unwraps the answer.

export interface ClientImage {
  base64: string;
  mime: string;
  width?: number;
  height?: number;
}

/**
 * A vendor steer, carried by all three calls.
 *
 * `avoid` is the one the craft library asks for: a safety refusal is cleared by
 * a different model for one hop, so a surface that has just been refused can
 * re-send with `avoid: provenance.provider` (or with the `provider` the error
 * response carried) instead of offering a retry that cannot succeed.
 *
 * Typed as `string`, not as a union of vendor names, ON PURPOSE — this module
 * knows no vendor, and the roster is the server's to hold. The ids come back
 * from the server in `provenance.provider`; an id the server does not know is
 * a 400, never a silent fall back to default routing. A `no-alternative` code
 * (409) means the avoidance left nowhere to go — in production that is the
 * normal answer, because each capability runs on one vendor.
 */
export interface ClientSteer {
  prefer?: string;
  avoid?: string;
}

/** Who made this image, on what, at what cost. Worth STORING alongside the
 *  pixels rather than reading once: after the fact none of it is re-derivable
 *  from the image. `reroutedFrom` is present only when the first vendor did not
 *  serve — its presence is the re-route, and the reason it lost is in `why`. */
export interface ClientProvenance {
  provider: string;
  model: string;
  costUsd?: number;
  /** How to read `costUsd`: a vendor receipt, our own arithmetic, or nothing.
   *  A client that prints a dollar sign without checking this is guessing. */
  costBasis?: "vendor-reported" | "estimated" | "unpriced";
  durationMs: number;
  cleanup?: "deleted" | "failed" | "not-applicable";
  reroutedFrom?: { provider: string; why: string }[];
}

export interface GenerateResult {
  images: ClientImage[];
  provenance: ClientProvenance;
}

/** A failed imaging call, with the server's own words kept intact. `code` is
 *  the ImagingError kind — `refused` is the one worth branching on, because it
 *  means "change the prompt", never "try again". */
export class ImagingRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ImagingRequestError";
  }
}

/**
 * The access header the money/compute routes now require (lib/apiAuth.ts).
 *
 * A browser can only present a secret that shipped in its bundle, so this is
 * `NEXT_PUBLIC_IMAGING_ACCESS_SECRET` — PUBLIC by construction, and therefore a
 * rate-limit + casual-abuse gate rather than a cryptographic identity check.
 * The real upgrade is Firebase ID-token verification server-side once
 * firebase-admin is wired; the server already accepts a Bearer token, so that
 * swap is header-value-only on this side. Empty when unset — the server then
 * fails closed with a 401, which is the honest signal that the gate is on but
 * unconfigured.
 */
export function accessHeader(): Record<string, string> {
  const s = process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET;
  return s && s.trim() ? { authorization: `Bearer ${s.trim()}` } : {};
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...accessHeader() },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ImagingRequestError("The studio could not be reached.", "offline", 0);
  }

  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : "The imaging call failed.";
    const code = typeof json.code === "string" ? json.code : "failed";
    throw new ImagingRequestError(detail, code, res.status);
  }
  return json as T;
}

export const generateImage = (body: ClientSteer & {
  prompt: string;
  negativePrompt?: string;
  aspect: "16:9" | "9:16" | "1:1" | "4:5";
  count?: number;
  references?: ClientImage[];
}) => post<GenerateResult>("/api/imaging/generate", body);

export const editImage = (body: ClientSteer & {
  image: ClientImage;
  instruction: string;
  references?: ClientImage[];
}) => post<GenerateResult>("/api/imaging/edit", body);

export const recognizeImage = (body: ClientSteer & {
  image: ClientImage;
  instruction: string;
  schema?: Record<string, unknown>;
}) => post<{ text: string; json?: unknown; provenance: ClientProvenance }>("/api/imaging/recognize", body);

/** `data:` URL for an <img src>. */
export const imgSrc = (i: { base64: string; mime: string }) => `data:${i.mime};base64,${i.base64}`;
