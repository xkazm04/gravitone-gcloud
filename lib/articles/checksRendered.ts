// THE CHECK, RENDERED ITEMS — the items measured in a real browser.
//
// Split out of checks.ts (the door) for the 200-line limit. Opens the post from
// disk at 390 and 1440 px with every http(s) request aborted and counted, then
// reads the body and chrome type sizes, the sideways overflow and the network
// requests from the page. MEASURE is a string on purpose; its comment says why.

import path from "node:path";
import { pathToFileURL } from "node:url";

import { THRESHOLDS } from "./checks";
import { absent, item } from "./checksItems";
import type { CheckItem } from "./types";

/* ── the rendered items ────────────────────────────────────────────────────── */

/** A body paragraph is a <p> or <li> outside figure/nav/header/footer/sources
 *  chrome that carries at least this many characters — a byline or a date line
 *  is chrome however it is tagged, and a real paragraph is longer than one. */
const BODY_MIN_CHARS = 80;

/**
 * Runs in the page. A STRING, not a function: a function literal compiled by
 * tsx gains `__name(...)` helper calls that do not exist in the browser, and
 * the CLI runs under tsx.
 */
const MEASURE = `(() => {
  const EXCL = 'figure, figcaption, footer, nav, header, aside, #sources, pre, code, [data-role="content-preview"], h1, h2, h3, h4, h5, h6, blockquote';
  let body = Infinity, bodyAt = '', chrome = Infinity, chromeAt = '', bodyCount = 0;
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const el of all) {
    let own = false;
    for (const n of el.childNodes) { if (n.nodeType === 3 && n.textContent.trim().length > 0) { own = true; break; } }
    if (!own) continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const px = parseFloat(cs.fontSize);
    const tag = el.tagName.toLowerCase();
    const where = tag + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\\s+/)[0] : '');
    if (tag !== 'sup' && tag !== 'sub' && px < chrome) { chrome = px; chromeAt = where; }
    if ((tag === 'p' || tag === 'li') && !el.closest(EXCL) && el.textContent.trim().length >= ${BODY_MIN_CHARS}) {
      bodyCount++;
      if (px < body) { body = px; bodyAt = where; }
    }
  }
  return { body: isFinite(body) ? body : null, bodyAt, chrome: isFinite(chrome) ? chrome : null, chromeAt, bodyCount,
    overflow: document.documentElement.scrollWidth - window.innerWidth };
})()`;

interface Measured {
  body: number | null;
  bodyAt: string;
  chrome: number | null;
  chromeAt: string;
  bodyCount: number;
  overflow: number;
}

const RENDERED = [
  ["body-font-1440", "Body type at 1440 px"],
  ["body-font-390", "Body type at 390 px"],
  ["chrome-font", "Captions and chrome type"],
  ["no-overflow-390", "No sideways scroll at 390 px"],
  ["offline-rendered", "No network requests when rendered"],
] as const;

/** `screenshots: false` takes the measurements and no pictures: the between-turn checks read the
 *  numbers, and the check step deletes check/ before the run whose pictures the human sees. */
export async function renderedItems(postDir: string, shotDir: string, opts: { screenshots?: boolean } = {}): Promise<{ items: CheckItem[]; screenshots: string[] }> {
  const shoot = opts.screenshots !== false;
  const index = path.join(postDir, "index.html");
  const items: CheckItem[] = [];
  const screenshots: string[] = [];
  const unmeasured = (why: string) => ({
    items: RENDERED.map(([id, label]) => absent("medium-fidelity", id, label, why)),
    screenshots: [] as string[],
  });
  let browser: import("playwright").Browser | undefined;
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch (e) {
    return unmeasured(`no browser could be launched: ${(e as Error).message.split("\n")[0]}`);
  }
  try {
    const { mkdir } = await import("node:fs/promises");
    if (shoot) await mkdir(shotDir, { recursive: true });
    const requests: string[] = [];
    const results: Record<number, Measured> = {};
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "light" });
      const page = await ctx.newPage();
      await page.route("**/*", (route) => {
        const u = route.request().url();
        if (/^https?:/i.test(u)) {
          requests.push(u);
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(pathToFileURL(index).href, { waitUntil: "load" });
      results[width] = (await page.evaluate(MEASURE)) as Measured;
      if (shoot) {
        const shot = path.join(shotDir, `screenshot-${width}.png`);
        await page.screenshot({ path: shot, fullPage: true });
        screenshots.push(shot);
      }
      if (shoot && width === 1440) {
        await page.emulateMedia({ colorScheme: "dark" });
        const dark = path.join(shotDir, `screenshot-${width}-dark.png`);
        await page.screenshot({ path: dark, fullPage: true });
        screenshots.push(dark);
      }
      await ctx.close();
    }
    const px = (v: number | null) => (v === null ? "none found" : `${v}px`);
    for (const [width, min] of [
      [1440, THRESHOLDS.minBodyPx1440],
      [390, THRESHOLDS.minBodyPx390],
    ] as const) {
      const r = results[width];
      items.push(
        item("medium-fidelity", `body-font-${width}`, `Body type at ${width} px`, r.body !== null && r.body >= min, {
          value: px(r.body),
          expected: `≥ ${min}px`,
          detail: [r.body === null ? "no body paragraphs were found" : `smallest at ${r.bodyAt} across ${r.bodyCount} paragraphs and list items`],
        }),
      );
    }
    const chrome = Math.min(results[1440].chrome ?? Infinity, results[390].chrome ?? Infinity);
    items.push(
      item("medium-fidelity", "chrome-font", "Captions and chrome type", isFinite(chrome) && chrome >= THRESHOLDS.minChromePx, {
        value: isFinite(chrome) ? `${chrome}px` : "none found",
        expected: `≥ ${THRESHOLDS.minChromePx}px`,
        detail: [`smallest at ${(results[1440].chrome ?? Infinity) <= (results[390].chrome ?? Infinity) ? `${results[1440].chromeAt} (1440)` : `${results[390].chromeAt} (390)`}`],
      }),
    );
    items.push(item("medium-fidelity", "no-overflow-390", "No sideways scroll at 390 px", results[390].overflow <= 1, { value: `${Math.max(0, results[390].overflow)}px wider than the viewport`, expected: "0px" }));
    items.push(item("medium-fidelity", "offline-rendered", "No network requests when rendered", !requests.length, { value: requests.length, expected: "0", ...(requests.length ? { detail: [...new Set(requests)].slice(0, 10) } : {}) }));
  } catch (e) {
    // A page that crashes the renderer, or a goto that times out, is a
    // measurement that could not be taken: said so, never read as a pass.
    return unmeasured(`the render failed: ${(e as Error).message.split("\n")[0]}`);
  } finally {
    await browser.close();
  }
  return { items, screenshots };
}
