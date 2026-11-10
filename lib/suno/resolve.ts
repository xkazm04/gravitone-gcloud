// THE BYTES SEAM (spark suno-api, hybrid) — server-only. Suno's official API refuses to stream a
// suno.com song (`/v0/audio/{id}/stream`, measured 2026-11-10: "This app can't stream suno.com songs.
// Play the song at its song_url."), its private CDN files answer 403, and `/download` costs a download
// credit. The signed-in profile's own `GET /api/clip/<id>` (studio-api, Clerk bearer) hands back the
// CloudFront media URL for free, the same URL `createSunoTracks` returns - so an API clip's audio is
// resolved here.
//
// Also home of the clip-JSON pieces the browser driver (./driver.ts) shares with it: the raw clip
// shape, the media-URL rule and the in-tab clip fetch. They live here, not in driver.ts, so the two
// modules do not import each other.
//
// One tab per batch, closed in `finally`; never `browser.close()` (./browser.ts, THE ONE RULE).

import type { Page, Request } from "playwright";

import { attach, isSignedIn, profileContext } from "./browser";
import { SELECTORS } from "./selectors";

/** Both in-page fetches return small JSON (a clip record, one feed page), never audio. */
export const API_FETCH_TIMEOUT_MS = 30_000;
/** How long a fresh tab gets to expose a Clerk session (or make a call that carries a bearer). */
const TOKEN_WAIT_MS = 30_000;

/** studio-api's clip JSON, as far as the drivers read it. */
export interface RawClip {
  id?: string;
  status?: string;
  title?: string;
  audio_url?: string;
  image_url?: string;
  image_large_url?: string;
  media_urls?: { url?: string }[];
  metadata?: {
    duration?: number | null;
    error_message?: string | null;
    tags?: string | null;
    prompt?: string | null;
    negative_tags?: string | null;
    gpt_description_prompt?: string | null;
    make_instrumental?: boolean | null;
    model_badges?: Record<string, { display_name?: string } | undefined> | null;
  };
  major_model_version?: string | null;
  model_name?: string | null;
  created_at?: string | null;
  is_trashed?: boolean | null;
}

/** `media_urls[0].url` first; `audio_url` only when it is not the `/api/forbidden` sentinel. */
export function audioOf(c: RawClip): string | null {
  const media = c.media_urls?.find((m) => typeof m.url === "string" && m.url)?.url;
  if (media) return media;
  if (c.audio_url && !SELECTORS.api.forbiddenAudio.test(c.audio_url)) return c.audio_url;
  return null;
}

/** GET /api/clip/<id> from inside the tab, with a fresh Clerk token when the
 *  page exposes one and the last captured headers otherwise. Null on any miss:
 *  the passive listener may still have it. */
export async function fetchClip(page: Page, id: string, headers: Record<string, string>): Promise<RawClip | null> {
  try {
    return (await page.evaluate(
      async ({ url, headers, timeoutMs }) => {
        const clerk = (window as unknown as { Clerk?: { session?: { getToken?: () => Promise<string | null> } } }).Clerk;
        const token = await clerk?.session?.getToken?.().catch(() => null);
        const h: Record<string, string> = { ...headers };
        if (token) h.authorization = `Bearer ${token}`;
        // No bearer is not a miss: measured 2026-11-10, suno.com no longer exposes window.Clerk and
        // /api/clip/<id> answers the signed-in profile's own clip 200 without one.
        const r = await fetch(url, { headers: h, signal: AbortSignal.timeout(timeoutMs) });
        return r.ok ? ((await r.json()) as unknown) : null;
      },
      { url: SELECTORS.api.base + SELECTORS.api.clip(id), headers, timeoutMs: API_FETCH_TIMEOUT_MS },
    )) as RawClip | null;
  } catch {
    return null;
  }
}

/** The bearer headers a studio-api request carried, or null when it carried none. */
export function bearerHeaders(r: Request): Record<string, string> | null {
  if (!r.url().startsWith(SELECTORS.api.base)) return null;
  const h = r.headers();
  if (!h.authorization) return null;
  const out: Record<string, string> = { authorization: h.authorization };
  if (h["browser-token"]) out["browser-token"] = h["browser-token"];
  if (h["device-id"]) out["device-id"] = h["device-id"];
  return out;
}

/** True once the tab can authorise a clip fetch: a Clerk session, or a captured bearer. */
async function waitForToken(page: Page, has: () => boolean): Promise<boolean> {
  const until = Date.now() + TOKEN_WAIT_MS;
  while (Date.now() < until) {
    if (has()) return true;
    const session = await page
      .evaluate(() => Boolean((window as unknown as { Clerk?: { session?: unknown } }).Clerk?.session))
      .catch(() => false);
    if (session) return true;
    await page.waitForTimeout(250);
  }
  return has();
}

/** Each song id -> its CloudFront media URL, from inside the signed-in profile (free: no credit, no
 *  download). A song the page cannot see maps to null. A browser that is not running and cannot be
 *  launched rejects with `suno browser not running`; a signed-out profile with `not signed in to suno`. */
export async function resolveSunoAudio(songIds: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(songIds.filter((id) => typeof id === "string" && id))];
  if (!ids.length) return out;
  const browser = await attach({ spawn: true });
  const ctx = profileContext(browser);
  if (!(await isSignedIn(ctx))) throw new Error("not signed in to suno");

  const page = await ctx.newPage();
  let headers: Record<string, string> = {};
  const onRequest = (r: Request) => {
    const h = bearerHeaders(r);
    if (h) headers = h;
  };
  page.on("request", onRequest);
  try {
    await page.goto(SELECTORS.page.createUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (page.url().includes(SELECTORS.page.signInPath)) throw new Error("not signed in to suno");
    await waitForToken(page, () => Boolean(headers.authorization));
    for (const id of ids) {
      const clip = await fetchClip(page, id, headers);
      out.set(id, clip ? audioOf(clip) : null);
    }
    return out;
  } finally {
    page.off("request", onRequest);
    await page.close().catch(() => {});
  }
}
