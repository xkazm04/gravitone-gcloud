// THE SUNO BROWSER — server-only. Attaches over CDP to the dedicated Chrome
// profile (~/.suno-chrome on SUNO_CDP_PORT) and, where this machine may spawn a
// local binary, launches it when nothing answers.
//
// THE ONE RULE: the browser on the other end of the socket is the OPERATOR'S
// Chrome, signed in to their own Suno account. `browser.close()` on a
// CDP-attached browser closes that Chrome, so it is never called here — the
// driver closes only the tabs it opened, and a stale connection is simply
// dropped and re-made.
//
// Why a dedicated profile at all: Chrome 136+ refuses --remote-debugging-port
// on the default user-data-dir, so the operator signs in once in this profile
// and it stays signed in.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { canSpawnLocalBinaries } from "@/lib/deployment";
import { SUNO_CDP_PORT } from "./types";
import { SELECTORS } from "./selectors";

export const SUNO_PROFILE_DIR = join(homedir(), ".suno-chrome");

/** The flags pipeline/suno-browser.mjs launches with too — keep the two equal. */
export function sunoChromeArgs(port: number = SUNO_CDP_PORT): string[] {
  return [
    `--user-data-dir=${SUNO_PROFILE_DIR}`,
    `--remote-debugging-port=${port}`,
    "--no-first-run",
    "--no-default-browser-check",
    SELECTORS.page.createUrl,
  ];
}

/** Does anything answer CDP on this port? A plain HTTP probe — far cheaper
 *  than a websocket attach, and it never throws. */
export async function cdpAnswers(port: number, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** chrome.exe on this machine: the override, then the usual install roots. */
export function findChrome(): string | null {
  const override = process.env.SUNO_CHROME_PATH;
  if (override && existsSync(override)) return override;
  const rel = join("Google", "Chrome", "Application", "chrome.exe");
  const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA];
  for (const root of roots) {
    if (!root) continue;
    const p = join(root, rel);
    if (existsSync(p)) return p;
  }
  for (const p of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]) {
    if (existsSync(p)) return p;
  }
  return null;
}

/** Launch the profile detached (it outlives this process) and wait for CDP. */
async function launch(port: number, waitMs = 15_000): Promise<void> {
  const exe = findChrome();
  if (!exe) throw new Error("suno browser not running and chrome was not found");
  const child = spawn(exe, sunoChromeArgs(port), { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    if (await cdpAnswers(port, 1000)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("suno browser did not open its debugging port");
}

type Held = { port: number; browser: Browser };
const g = globalThis as typeof globalThis & { __gtSunoBrowser?: Held; __gtSunoAttaching?: Promise<Browser> };

export interface AttachOptions {
  port?: number;
  /** Launch the profile when nothing answers. Off for probes: a probe must
   *  never open a window on the operator's screen. */
  spawn?: boolean;
}

/** One Browser connection per process, re-made when it drops. Throws
 *  "suno browser not running" when nothing answers and no launch is allowed. */
export async function attach(opts: AttachOptions = {}): Promise<Browser> {
  const port = opts.port ?? SUNO_CDP_PORT;
  const held = g.__gtSunoBrowser;
  if (held && held.port === port && held.browser.isConnected()) return held.browser;
  if (g.__gtSunoAttaching && port === SUNO_CDP_PORT) return g.__gtSunoAttaching;

  const run = (async () => {
    if (!(await cdpAnswers(port))) {
      if (!opts.spawn || !canSpawnLocalBinaries()) throw new Error("suno browser not running");
      await launch(port);
    }
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10_000 });
    g.__gtSunoBrowser = { port, browser };
    browser.on("disconnected", () => {
      if (g.__gtSunoBrowser?.browser === browser) g.__gtSunoBrowser = undefined;
    });
    return browser;
  })();

  if (port === SUNO_CDP_PORT) g.__gtSunoAttaching = run;
  try {
    return await run;
  } finally {
    if (g.__gtSunoAttaching === run) g.__gtSunoAttaching = undefined;
  }
}

/** The profile's own (persistent) context — where the Suno cookies live. */
export function profileContext(browser: Browser): BrowserContext {
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("suno browser has no profile context");
  return ctx;
}

/** Signed in = Clerk's `__client_uat*` cookie holds a positive epoch. */
export async function isSignedIn(ctx: BrowserContext): Promise<boolean> {
  const cookies = await ctx.cookies(SELECTORS.auth.cookieUrl);
  return cookies.some((c) => c.name.startsWith(SELECTORS.auth.clientUatPrefix) && Number(c.value) > 0);
}
