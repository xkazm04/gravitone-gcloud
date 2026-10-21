// THE LEONARDO STUDIO BROWSER — server-only. Attaches over CDP to the dedicated
// Chrome profile (~/.leonardo-chrome, its debugging port named by
// LEONARDO_STUDIO_CDP) and, where this machine may spawn a local binary,
// launches it when nothing answers.
//
// THE ONE RULE, inherited from lib/suno/browser.ts and for the same reason: the
// browser on the other end of the socket is the OPERATOR'S Chrome, signed in to
// their own Leonardo account with their own credits. `browser.close()` on a
// CDP-attached browser closes that Chrome, so it is never called here — the
// driver closes only the tab it opened, and a dropped connection is re-made.
//
// Why a dedicated profile: Chrome 136+ refuses --remote-debugging-port on the
// default user-data-dir (measured 2026-10-11; the operator's everyday account
// lives there), so the operator signs in once in this profile and it stays
// signed in.

import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { canSpawnLocalBinaries } from "@/lib/deployment";
import { cdpAnswers, launchDetachedChrome } from "@/lib/suno/browser";
import { STUDIO } from "./selectors";

export const LEONARDO_PROFILE_DIR = join(homedir(), ".leonardo-chrome");

/** The default endpoint, the one the 2026-10-11 run measured. */
export const DEFAULT_STUDIO_CDP = "http://127.0.0.1:9333";

/** The CDP endpoint the operator opted in with, normalised to an origin. */
export function studioEndpoint(raw: string | undefined = process.env.LEONARDO_STUDIO_CDP): string {
  const v = raw?.trim() || DEFAULT_STUDIO_CDP;
  // A bare port ("9333") is the shorthand anyone types first.
  if (/^\d+$/.test(v)) return `http://127.0.0.1:${v}`;
  return v.replace(/\/+$/, "");
}

function parseEndpoint(endpoint: string): { hostname: string; port: number } | null {
  try {
    const u = new URL(endpoint);
    const port = Number(u.port);
    return Number.isInteger(port) && port > 0 ? { hostname: u.hostname, port } : null;
  } catch {
    return null;
  }
}

/** Loopback endpoints only may be launched: a remote one is somebody else's
 *  machine, and a probe must never open a window anywhere. */
function launchablePort(endpoint: string): number | null {
  const parsed = parseEndpoint(endpoint);
  if (!parsed || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname)) return null;
  return parsed.port;
}

function portOf(endpoint: string): number | null {
  return parseEndpoint(endpoint)?.port ?? null;
}

/** The flags the 2026-10-11 run launched with. */
export function leonardoChromeArgs(port: number): string[] {
  return [
    `--user-data-dir=${LEONARDO_PROFILE_DIR}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    STUDIO.page.generateUrl,
  ];
}

type Held = { endpoint: string; browser: Browser };
const g = globalThis as typeof globalThis & { __gtLeoBrowser?: Held; __gtLeoAttaching?: Map<string, Promise<Browser>> };

export interface AttachOptions {
  endpoint?: string;
  /** Launch the profile when nothing answers. Off for health: a snapshot read
   *  must never open a window on the operator's screen. */
  spawn?: boolean;
}

/** One Browser connection per process and endpoint, re-made when it drops.
 *  Throws "leonardo studio browser not running" when nothing answers and no
 *  launch is allowed. */
export async function attach(opts: AttachOptions = {}): Promise<Browser> {
  const endpoint = opts.endpoint ?? studioEndpoint();
  const held = g.__gtLeoBrowser;
  if (held && held.endpoint === endpoint && held.browser.isConnected()) return held.browser;
  const pending = (g.__gtLeoAttaching ??= new Map());
  const inflight = pending.get(endpoint);
  if (inflight) return inflight;

  const run = (async () => {
    const port = portOf(endpoint);
    if (port === null) throw new Error(`leonardo studio endpoint is not a URL with a port: ${endpoint}`);
    if (!(await cdpAnswers(port))) {
      const local = launchablePort(endpoint);
      if (!opts.spawn || local === null || !canSpawnLocalBinaries()) throw new Error("leonardo studio browser not running");
      await launchDetachedChrome("leonardo studio browser", leonardoChromeArgs(local), local);
    }
    const browser = await chromium.connectOverCDP(endpoint, { timeout: 10_000 });
    g.__gtLeoBrowser = { endpoint, browser };
    browser.on("disconnected", () => {
      if (g.__gtLeoBrowser?.browser === browser) g.__gtLeoBrowser = undefined;
    });
    return browser;
  })();

  pending.set(endpoint, run);
  try {
    return await run;
  } finally {
    if (pending.get(endpoint) === run) pending.delete(endpoint);
  }
}

/** The profile's own (persistent) context — where the Leonardo session lives. */
export function profileContext(browser: Browser): BrowserContext {
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("leonardo studio browser has no profile context");
  return ctx;
}

/** Signed in = a session cookie for app.leonardo.ai exists and has not expired.
 *  The cookie's NAME is unverified (selectors.ts); recon lists the real ones. */
export async function isSignedIn(ctx: BrowserContext): Promise<boolean> {
  const now = Date.now() / 1000;
  const cookies = await ctx.cookies(STUDIO.auth.cookieUrl);
  return cookies.some((c) => STUDIO.auth.sessionCookie.test(c.name) && c.value && (c.expires <= 0 || c.expires > now));
}
