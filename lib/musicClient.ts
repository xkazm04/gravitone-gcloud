// CLIENT-SIDE helper for /api/music/generate — the browser half of the music
// seam, mirroring lib/imagingClient.ts: same access header, same error shape,
// no vendor knowledge. The server owns the cue→plan translation; this file
// sends spotting rows and receives audio.

import { accessHeader } from "./imagingClient";
import type { DetailedMusicResult, MusicAudio, MusicResult, SfxResult, WirePlan } from "./music/types";

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
  return post<MusicResult>("/api/music/generate", cue);
}

/** A playable object URL from a result. Caller revokes when done. */
export function audioUrl(r: MusicResult): string {
  return blobUrl(r.audio);
}

/** A playable object URL from raw audio. Caller revokes when done. */
export function blobUrl(audio: MusicAudio): string {
  const bytes = Uint8Array.from(atob(audio.b64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: audio.mime }));
}

// ── Playground surface ──────────────────────────────────────────────────────

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...accessHeader() },
      body: JSON.stringify(body),
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
  return json as T;
}

export const draftPlan = (body: {
  prompt: string;
  lengthMs?: number;
  style?: string;
  negativeStyle?: string;
  sourcePlan?: WirePlan;
}) => post<{ plan: WirePlan }>("/api/music/plan", body);

export const composeRaw = (body: { prompt?: string; plan?: WirePlan; lengthMs?: number }) =>
  post<DetailedMusicResult>("/api/music/compose", body);

export const generateSfx = (body: {
  text: string;
  durationSeconds?: number;
  promptInfluence?: number;
  loop?: boolean;
}) => post<SfxResult>("/api/music/sfx", body);
