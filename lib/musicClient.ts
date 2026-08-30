// CLIENT-SIDE helper for /api/music/generate — the browser half of the music
// seam, mirroring lib/imagingClient.ts: same access header, same error shape,
// no vendor knowledge. The server owns the cue→plan translation; this file
// sends spotting rows and receives audio.

import { accessHeader } from "./imagingClient";
// TYPE-ONLY, therefore erased: nothing from lib/music/ reaches the browser
// bundle. `MusicQuote` is the shape GET /api/music/pricing returns, and naming
// it here is what stops this file inventing a second one.
import type { MusicQuote } from "./music/pricing";
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

// ── THE PRICE, BEFORE THE CLICK ─────────────────────────────────────────────
//
// Music is the only engine in this product that spends on a single click from a
// product surface, and until now the Score step showed the user nothing about
// it — not before, not after. These two helpers are the browser half of that
// fix, kept here rather than in the surface for the same reason
// app/library/Playground.tsx asks /api/imaging/pricing: the figure must come
// from the same declaration the server bills against, never from a copy in a
// component.

/** Asked once per page load and shared. The table is a module constant on the
 *  server, so a second fetch could only ever return the same bytes. */
let pricePromise: Promise<MusicQuote> | null = null;

export function perSecondPrice(): Promise<MusicQuote> {
  pricePromise ??= (async () => {
    const res = await fetch("/api/music/pricing");
    if (!res.ok) throw new Error(`music pricing answered ${res.status}`);
    const doc = (await res.json()) as { perSecond?: MusicQuote };
    const q = doc.perSecond;
    if (!q || typeof q.note !== "string" || typeof q.basis !== "string")
      throw new Error("music pricing returned a body we cannot read");
    return q;
  })().catch((e: unknown) => {
    // One blip must not poison the rest of the session: drop the memo so the
    // next mount asks again.
    pricePromise = null;
    throw e;
  });
  return pricePromise;
}

/**
 * WHAT A SURFACE MAY SAY ABOUT THE COST OF `seconds` OF MUSIC.
 *
 * Five states, kept apart rather than collapsed into one blank, and NONE of
 * them renders as $0.00:
 *
 *   · still asking;
 *   · asked, and the route did not answer;
 *   · the operation is declared FREE (a fact with a source in
 *     lib/music/pricing.ts — the plan endpoint);
 *   · a rate is declared, so there is a figure, in whichever unit the chain
 *     reached: dollars if both links exist, otherwise CREDITS, which are their
 *     own unit and are not silently converted;
 *   · no rate is declared — the honest case today. The SECONDS are still exact
 *     and are shown, because "13 seconds of audio at an undeclared rate" is
 *     strictly more than the user knew before, and a dollar sign here would be
 *     a number nobody has earned.
 *
 * Pure and exported so a probe can drive every branch.
 */
export function costLabel(
  price: MusicQuote | "unknown" | null,
  seconds: number,
): { text: string; title: string } {
  if (price === null)
    return { text: "checking the price…", title: "Asking /api/music/pricing what a render costs." };
  if (price === "unknown")
    return {
      text: `${seconds}s of audio · price unknown`,
      title:
        "The price table could not be reached, so this render's cost is not known in advance. " +
        "The seconds are still exact — they are the length of picture this cue covers.",
    };
  if (price.basis === "free") return { text: "free", title: price.note };
  if (typeof price.usd === "number")
    return { text: `est. $${(price.usd * seconds).toFixed(3)}`, title: price.note };
  if (typeof price.credits === "number")
    return {
      text: `est. ${(price.credits * seconds).toFixed(1)} credits`,
      title: `${price.note} Credits are the vendor's unit; no USD conversion is declared in this repo.`,
    };
  // UNPRICED. Never "$0.00", never a blank.
  return {
    text: `${seconds}s of audio · unpriced`,
    title: price.note,
  };
}
