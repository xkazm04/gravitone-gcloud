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

export interface ClientProvenance {
  provider: string;
  model: string;
  costUsd?: number;
  durationMs: number;
  cleanup?: "deleted" | "failed" | "not-applicable";
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

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
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

export const generateImage = (body: {
  prompt: string;
  negativePrompt?: string;
  aspect: "16:9" | "9:16" | "1:1" | "4:5";
  count?: number;
  references?: ClientImage[];
}) => post<GenerateResult>("/api/imaging/generate", body);

export const editImage = (body: {
  image: ClientImage;
  instruction: string;
  references?: ClientImage[];
}) => post<GenerateResult>("/api/imaging/edit", body);

export const recognizeImage = (body: {
  image: ClientImage;
  instruction: string;
  schema?: Record<string, unknown>;
}) => post<{ text: string; json?: unknown; provenance: ClientProvenance }>("/api/imaging/recognize", body);

/** `data:` URL for an <img src>. */
export const imgSrc = (i: { base64: string; mime: string }) => `data:${i.mime};base64,${i.base64}`;
