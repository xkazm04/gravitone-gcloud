"use client";

// The browser's half of the video hop — typed fetches to /api/video/clips.
//
// Holds no secret and knows no vendor: it posts to our own origin with the
// same public access header every studio call carries (lib/imagingClient.ts),
// and imports nothing from the server-only modules beside it — only the wire
// types, which are types and constants.

import { accessHeader, withAccess } from "@/lib/imagingClient";

import type { ClipRecord, VideoCapability, VideoClipRequest, VideoClipStarted } from "./types";

/** A failed video request, with the server's words kept intact. `code` is the
 *  machine half: `over-budget` (402), `no-key` (503), `bad-request`, … */
export class VideoRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VideoRequestError";
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...accessHeader() } });
  } catch {
    throw new VideoRequestError("The studio could not be reached.", "offline", 0);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    // Both spellings are answered (lib/imaging/video/errors.ts); either will do.
    const message =
      typeof json.message === "string" ? json.message : typeof json.detail === "string" ? json.detail : `HTTP ${res.status}`;
    const code = typeof json.error === "string" ? json.error : typeof json.code === "string" ? json.code : "failed";
    throw new VideoRequestError(message, code, res.status);
  }
  return json as T;
}

export const getVideoCapability = () => call<VideoCapability>("/api/video/clips", { cache: "no-store" });

export const startVideoClip = (body: VideoClipRequest) =>
  call<VideoClipStarted>("/api/video/clips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export const getClipRecord = (clipId: string) =>
  call<ClipRecord>(`/api/video/clips/${encodeURIComponent(clipId)}`, { cache: "no-store" });

/** The mp4 for a <video src>, which cannot carry a header — so the credential
 *  rides as `k=` through `withAccess`, as every other file route here takes it. */
export function clipFileUrl(clipId: string): string {
  return withAccess(`/api/video/clips/${encodeURIComponent(clipId)}/file`);
}

export const isTerminalClip = (s: ClipRecord["status"]) => s === "done" || s === "failed" || s === "refused";
