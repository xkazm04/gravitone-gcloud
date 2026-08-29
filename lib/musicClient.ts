// CLIENT-SIDE helper for /api/music/generate — the browser half of the music
// seam, mirroring lib/imagingClient.ts: same access header, same error shape,
// no vendor knowledge. The server owns the cue→plan translation; this file
// sends spotting rows and receives audio.

import { accessHeader } from "./imagingClient";
import type {
  CuePicture,
  DetailedMusicResult,
  MusicAudio,
  MusicResult,
  SfxResult,
  WirePlan,
} from "./music/types";

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

/**
 * What the browser sends for one cue.
 *
 * `durS` used to be here and is deliberately gone: the seconds of music bought
 * are now DERIVED server-side from `picture`, so a client cannot ask for a
 * length that disagrees with the film it claims to be scoring. What travels is
 * the spotting decision (which scenes) and the musical one (tempo, intent) —
 * never a duration on its own.
 */
export interface CueRequest {
  title: string;
  intent: string;
  bpm: number;
  styleBlock: string[];
  avoid?: string[];
  /** The scenes this cue plays under, from the project's own scene record. */
  picture: CuePicture;
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
