// THE MEDIUM BROWSER — server-only. Attaches over CDP to the dedicated Chrome
// profile (~/.medium-chrome on MEDIUM_CDP_PORT), launching it where this machine
// may spawn a local binary and nothing answers.
//
// THE ONE RULE (lib/suno/browser.ts says it first): the browser on the other end
// of the socket is the OPERATOR'S Chrome, signed in to their own Medium account.
// `browser.close()` would close that Chrome, so it is never called. The driver
// closes only the tabs it opened.
//
// Chrome 136+ refuses --remote-debugging-port on the default user-data-dir, so
// the operator signs in once in this profile (`npm run medium:browser`).

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { canSpawnLocalBinaries } from "@/lib/deployment";
import { cdpAnswers, findChrome } from "@/lib/suno/browser";
import { MEDIUM_CDP_PORT } from "./types";
import { SELECTORS } from "./selectors";

export const MEDIUM_PROFILE_DIR = join(homedir(), ".medium-chrome");

/** The flags pipeline/medium-browser.mjs launches with too — keep the two equal. */
export function mediumChromeArgs(port: number = MEDIUM_CDP_PORT): string[] {
  return [`--user-data-dir=${MEDIUM_PROFILE_DIR}`, `--remote-debugging-port=${port}`, "--no-first-run", "--no-default-browser-check", SELECTORS.page.newStoryUrl];
}

async function launch(port: number, waitMs = 15_000): Promise<void> {
  const exe = findChrome();
  if (!exe) throw new Error("medium browser not running and chrome was not found");
  const child = spawn(exe, mediumChromeArgs(port), { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    if (await cdpAnswers(port, 1000)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("medium browser did not open its debugging port");
}

type Held = { port: number; browser: Browser };
const g = globalThis as typeof globalThis & { __gtMediumBrowser?: Held; __gtMediumAttaching?: Promise<Browser> };

export interface AttachOptions {
  port?: number;
  /** Launch the profile when nothing answers. Off for probes: a probe must
   *  never open a window on the operator's screen. */
  spawn?: boolean;
}

/** One Browser connection per process, re-made when it drops. Throws
 *  "medium browser not running" when nothing answers and no launch is allowed. */
export async function attach(opts: AttachOptions = {}): Promise<Browser> {
  const port = opts.port ?? MEDIUM_CDP_PORT;
  const held = g.__gtMediumBrowser;
  if (held && held.port === port && held.browser.isConnected()) return held.browser;
  if (g.__gtMediumAttaching && port === MEDIUM_CDP_PORT) return g.__gtMediumAttaching;

  const run = (async () => {
    if (!(await cdpAnswers(port))) {
      if (!opts.spawn || !canSpawnLocalBinaries()) throw new Error("medium browser not running");
      await launch(port);
    }
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10_000 });
    g.__gtMediumBrowser = { port, browser };
    browser.on("disconnected", () => {
      if (g.__gtMediumBrowser?.browser === browser) g.__gtMediumBrowser = undefined;
    });
    return browser;
  })();

  if (port === MEDIUM_CDP_PORT) g.__gtMediumAttaching = run;
  try {
    return await run;
  } finally {
    if (g.__gtMediumAttaching === run) g.__gtMediumAttaching = undefined;
  }
}

/** The profile's own (persistent) context — where the Medium cookies live. */
export function profileContext(browser: Browser): BrowserContext {
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("medium browser has no profile context");
  return ctx;
}

/** Signed in = Medium's `sid` session cookie is present. (Recon-pending: confirm the name.) */
export async function isSignedIn(ctx: BrowserContext): Promise<boolean> {
  const cookies = await ctx.cookies(SELECTORS.auth.cookieUrl);
  return cookies.some((c) => c.name === SELECTORS.auth.sessionCookie && c.value.length > 0);
}
