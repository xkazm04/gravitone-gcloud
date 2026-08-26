// CLIENT-SIDE helper for /api/music/generate — the browser half of the music
// seam, mirroring lib/imagingClient.ts: same access header, same error shape,
// no vendor knowledge. The server owns the cue→plan translation; this file
// sends spotting rows and receives audio.

import { accessHeader } from "./imagingClient";
import type { MusicResult } from "./music/types";

export class MusicRequestError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "MusicRequestError";
    this.code = code;
    this.status = status;
  }
}

export interface CueRequest {
  title: string;
  intent: string;
  bpm: number;
  durS: number;
  styleBlock: string[];
  avoid?: string[];
}

export async function generateCueAudio(cue: CueRequest): Promise<MusicResult> {
  let res: Response;
  try {
    res = await fetch("/api/music/generate", {
      method: "POST",
      headers: { "content-type": "application/json", ...accessHeader() },
      body: JSON.stringify(cue),
    });
  } catch {
    throw new MusicRequestError("The studio could not be reached.", "offline", 0);
  }
  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const detail = typeof json.detail === "string" ? json.detail : "The music call failed.";
    const code = typeof json.code === "string" ? json.code : "failed";
    throw new MusicRequestError(detail, code, res.status);
  }
  return json as MusicResult;
}

/** A playable object URL from a result. Caller revokes when done. */
export function audioUrl(r: MusicResult): string {
  const bytes = Uint8Array.from(atob(r.audio.b64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: r.audio.mime }));
}
