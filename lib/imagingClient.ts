"use client";

// The browser's half of lib/imaging — typed fetches to /api/imaging/*.
//
// A separate module from lib/imaging/* on purpose: those files read API keys
// and must never be reachable from a component. This one holds no secret and
// knows no vendor; it posts JSON to our own origin and unwraps the answer.

import { ID_TOKEN_HEADER, currentIdToken } from "./sessionToken";

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
    readonly retryAt?: number,
    readonly provider?: string,
  ) {
    super(message);
    this.name = "ImagingRequestError";
  }
}

/**
 * The access headers the gated routes require (lib/apiAuth.ts). Synchronous:
 * it is spread inline into every client `fetch`.
 *
 * Two credentials, and the server's PRINCIPAL_MODE decides which one counts —
 * this side cannot know the mode, so it sends what it has, shaped so that
 * BOTH servers are satisfied by the same request:
 *
 *   · a bundle WITH `NEXT_PUBLIC_IMAGING_ACCESS_SECRET` (the legacy deploy)
 *     sends `Authorization: Bearer <secret>` exactly as before, plus the
 *     cached Firebase ID token in its own header once there is one. A legacy
 *     server reads the secret and ignores the token; a verified server reads
 *     the token and ignores the secret.
 *   · a bundle WITHOUT it (the verified deploy, where a public secret buys
 *     nothing) sends `Authorization: Bearer <idToken>`.
 *
 * The token comes from lib/sessionToken.ts, fed by useAuth's onIdTokenChanged.
 * Empty when there is neither — the server then answers 401 by name.
 */
export function accessHeader(): Record<string, string> {
  const secret = bundleSecret();
  const token = currentIdToken();
  if (secret) return token ? { authorization: `Bearer ${secret}`, [ID_TOKEN_HEADER]: token } : { authorization: `Bearer ${secret}` };
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** The public bundle secret, trimmed, or "" — read HERE and nowhere else in the
 *  client (credential-door.probe walks the tree for a second reader). */
function bundleSecret(): string {
  const s = process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET;
  return s && s.trim() ? s.trim() : "";
}

/** The query parameter the media/file routes read the credential from. */
export const ACCESS_QUERY_PARAM = "k";

/**
 * THE QUERY CREDENTIAL — the one value a media URL may carry, or `undefined`.
 *
 * <img>, <video>, <audio>, <iframe> and a plain <a download> cannot send a
 * header, so the routes that serve bytes to them (and only those — pinned by
 * credential-door.probe) read the credential from `?k=`. A URL has room for ONE
 * credential, so where `accessHeader()` can send both, this picks:
 *
 *   · a bundle WITH the public secret (legacy): the secret, exactly as the
 *     hand-built URLs sent it. A legacy server compares `k` to its secret, and
 *     a token there would be "wrong";
 *   · a bundle WITHOUT it (verified): the cached Firebase ID token;
 *   · the dev fixture, the local owner, or nobody signed in: nothing. Those
 *     users have no token (lib/sessionToken.ts never caches one for them).
 *
 * A TOKEN IN A URL CAN REACH ACCESS LOGS, browser history and a Referer. That
 * is accepted here because of what the token can do and for how long: a
 * Firebase ID token expires within the hour, and the server reads `k` only on
 * GET byte-serves behind the READ door (`guardAccessOnly`). The money door
 * (`guardRequest`) never reads a query credential, so a logged URL can, at
 * worst, re-fetch bytes its holder could already see — for minutes, not spend.
 */
export function accessQuery(): string | undefined {
  return bundleSecret() || currentIdToken() || undefined;
}

/** `url` with the query credential appended (`?k=` or `&k=`, before any
 *  `#fragment`), or `url` unchanged when there is none. Build every media URL
 *  through this — never by reading the bundle secret or `accessHeader()`. */
export function withAccess(url: string): string {
  const k = accessQuery();
  if (!k) return url;
  const hash = url.indexOf("#");
  const [path, frag] = hash === -1 ? [url, ""] : [url.slice(0, hash), url.slice(hash)];
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${ACCESS_QUERY_PARAM}=${encodeURIComponent(k)}${frag}`;
}

export interface BudgetQuoteResult {
  ceilingUsd: number;
  spentUsd: number;
  remainingUsd: number;
  windowMs: number;
  perImageUsd: number | null;
  quote: {
    remainingUsd: number;
    estimateUsd: number | null;
    affordableImages: number;
    verdict: "fits" | "partial" | "blocked" | "unknown";
    resumeAt: number | null;
  };
}

export async function quoteBudget(images?: number): Promise<BudgetQuoteResult> {
  const url = typeof images === "number" && images > 0 ? `/api/imaging/budget?images=${images}` : "/api/imaging/budget";
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { ...accessHeader() },
    });
  } catch {
    throw new ImagingRequestError("The studio could not be reached.", "offline", 0);
  }

  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : "The imaging call failed.";
    const code = typeof json.code === "string" ? json.code : "failed";
    const retryAt = typeof json.retryAt === "number" ? json.retryAt : undefined;
    const provider = typeof json.provider === "string" ? json.provider : undefined;
    throw new ImagingRequestError(detail, code, res.status, retryAt, provider);
  }
  return json as BudgetQuoteResult;
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
    const retryAt = typeof json.retryAt === "number" ? json.retryAt : undefined;
    const provider = typeof json.provider === "string" ? json.provider : undefined;
    throw new ImagingRequestError(detail, code, res.status, retryAt, provider);
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
