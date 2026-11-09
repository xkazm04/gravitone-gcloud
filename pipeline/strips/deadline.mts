// AN OUTER DEADLINE THAT DOES NOT DEPEND ON THE PAGE (spark scout-producers, 2026-11-08).
//
// A strip page is LLM-authored code. A synchronous loop in it blocks the page's own timers, so the
// in-page `Promise.race` of renderStrip's drawFrame cannot fire, and a Playwright call waits on a
// renderer that will never answer - while the job's heartbeat keeps the lane's lease alive. The
// registry's guest-execution-bounding/terminate-from-outside-when-you-cannot-count: the host owns
// no dispatch loop in a browser, so nothing can be counted; the one honest bound is a process the
// host can kill. The deadline here is a timer in THIS process, the verdict a thrown sentence, and
// what a fired deadline does to the work is that the browser's processes end - the future is not
// merely dropped.
//
// The browser's pids are asked of the BROWSER process over CDP (SystemInfo.getProcessInfo), which
// answers while a renderer is hung; the browser's own pid is cached from the first ask in case it
// no longer does. A killed browser is the caller's to close: closing a dead one resolves.

import { execFile } from "node:child_process";
import { rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { Browser } from "playwright";

type ProcessInfo = { readonly type: string; readonly id: number };

const BROWSER_PID = new WeakMap<Browser, number>();
const ASK_MS = 3000;

async function processInfo(browser: Browser): Promise<ProcessInfo[]> {
  const cdp = await browser.newBrowserCDPSession();
  try {
    const r = (await cdp.send("SystemInfo.getProcessInfo" as never)) as { processInfo: ProcessInfo[] };
    return r.processInfo;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** End every process of `browser`: the renderers and the GPU first, the browser last. Never this process. */
export async function killBrowser(browser: Browser): Promise<void> {
  const asked = await Promise.race([processInfo(browser).catch(() => [] as ProcessInfo[]), new Promise<ProcessInfo[]>((r) => setTimeout(() => r([]), ASK_MS).unref())]);
  const cached = BROWSER_PID.get(browser);
  const ids = [...asked.filter((p) => p.type !== "browser").map((p) => p.id), ...(cached === undefined ? [] : [cached]), ...asked.filter((p) => p.type === "browser").map((p) => p.id)];
  for (const pid of new Set(ids)) {
    if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

/**
 * `work`, or the browser killed and a sentence thrown once `ms` has passed. The timer belongs to this
 * process, so a page that never yields cannot delay it; `what` names the work in the sentence the
 * operator reads on the reel (`videoError`).
 */
export async function bounded<T>(browser: Browser, ms: number, what: string, work: () => Promise<T>): Promise<T> {
  if (!BROWSER_PID.has(browser)) {
    const first = await processInfo(browser).catch(() => [] as ProcessInfo[]);
    const own = first.find((p) => p.type === "browser");
    if (own !== undefined) BROWSER_PID.set(browser, own.id);
  }
  let timer: NodeJS.Timeout | undefined;
  const expired = Symbol("deadline");
  const late = new Promise<typeof expired>((r) => {
    timer = setTimeout(() => r(expired), ms);
  });
  const running = work();
  running.catch(() => {});
  try {
    const first = await Promise.race([running, late]);
    if (first !== expired) return first as T;
  } finally {
    clearTimeout(timer);
  }
  await killBrowser(browser);
  throw new Error(`${what} did not finish within ${Math.round(ms / 1000)} s: the page never yielded, so the browser was killed`);
}

const execFileP = promisify(execFile);

/**
 * One ffmpeg encode to `final`, killed at `ms` and landed by rename. ffmpeg writes `<name>.partial<ext>`
 * (a name no reader lists; the extension is what picks the container) beside it, and the file takes
 * its real name only when the encode finished, so a killed or failed ffmpeg leaves nothing at `final`.
 */
export async function ffmpegTo(args: readonly string[], final: string, ms: number): Promise<void> {
  const ext = path.extname(final);
  const tmp = `${final.slice(0, final.length - ext.length)}.partial${ext}`;
  try {
    await execFileP("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, tmp], { maxBuffer: 1 << 26, timeout: ms, killSignal: "SIGKILL" });
    await rename(tmp, final);
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {});
    const killed = typeof e === "object" && e !== null && (e as { killed?: boolean }).killed === true;
    if (killed) throw new Error(`ffmpeg writing ${path.basename(final)} did not finish within ${Math.round(ms / 1000)} s and was killed`);
    throw e;
  }
}

/** A test shortens every deadline at once (STRIP_DEADLINE_SCALE=0.05); a render never sets it. */
const k = (): number => {
  const v = Number(process.env["STRIP_DEADLINE_SCALE"] ?? 1);
  return Number.isFinite(v) && v > 0 ? v : 1;
};

/** What each phase may take, scaled by the frames it handles; sized from renders measured at 90-216 s for 240 frames. */
export const BUDGET = {
  /** Loading a strip page: its `load` event, then window.STRIP_READY. */
  get open(): number { return 75_000 * k(); },
  /** One frame drawn, over the in-page 15 s race. */
  get frame(): number { return 25_000 * k(); },
  /** Closing a page, a screenshot, one text measurement. */
  get still(): number { return 30_000 * k(); },
  /** The whole sequential capture, per frame over a fixed floor: 240 frames get 780 s against 216 s measured. */
  capture: (frames: number): number => (180_000 + frames * 2_500) * k(),
  mp4: (frames: number): number => (120_000 + frames * 1_000) * k(),
  webm: (frames: number): number => (120_000 + frames * 2_000) * k(),
  sheet: (frames: number): number => (60_000 + frames * 500) * k(),
} as const;
