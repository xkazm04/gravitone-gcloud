// THE MEDIUM DRIVER — server-only. Pastes a story into a PRIVATE draft in the
// operator's signed-in Medium (the dedicated profile, lib/medium/browser.ts).
//
// HOW A DRAFT IS MADE (recon 2026-10-16). The editor is one contenteditable. A
// synthetic paste carrying `text/html` goes through Medium's own paste parser, so
// the draft shows exactly how Medium reads the story: the first h1 becomes the
// Title, h2 becomes h3, h3 becomes h4, code blocks are auto-highlighted. A figure
// is a PNG pasted as a File at its marker paragraph; Medium uploads it and the
// caption is typed into the figure's own caption field. Medium saves by itself.
//
// WHAT THIS NEVER DOES: publish. There is no selector for it, every request that
// looks like publishing or scheduling is aborted at the page, and the tab opened
// here is the only tab closed. Errors are short and name the work.

import { readFile } from "node:fs/promises";
import type { Page } from "playwright";
import { attach, isSignedIn, profileContext } from "./browser";
import { SELECTORS } from "./selectors";
import { MEDIUM_CDP_PORT, type MediumDraftInput, type MediumDraftResult, type MediumDriver, type MediumHealth } from "./types";

const PROBE_TTL_MS = 15_000;
const STEP_MS = 30_000;
const UPLOAD_MS = 60_000;
/** No autosave in flight and none started for this long = Medium holds every edit. */
const QUIET_MS = 5_000;
const SETTLE_MS = 90_000;

const probeCache = new Map<number, { at: number; health: MediumHealth }>();

/** The probe on an explicit port — never launches, so it never opens a window. */
export async function probeMediumOn(port: number): Promise<MediumHealth> {
  const hit = probeCache.get(port);
  if (hit && Date.now() - hit.at < PROBE_TTL_MS) return hit.health;
  let health: MediumHealth;
  try {
    const browser = await attach({ port, spawn: false });
    health = (await isSignedIn(profileContext(browser))) ? { ok: true } : { ok: false, reason: "not signed in to medium" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    health = { ok: false, reason: /not running/.test(msg) ? "medium browser not running" : `medium browser unreachable: ${msg.split("\n")[0]}` };
  }
  probeCache.set(port, { at: Date.now(), health });
  return health;
}

/** `<figure><img><figcaption>…</figcaption></figure>` blocks become marker paragraphs; captions come back as plain text, in order. */
const FIGURE_RE = /<figure>\s*<img [^>]*>\s*(?:<figcaption>([\s\S]*?)<\/figcaption>)?\s*<\/figure>/g;

export function splitFigures(html: string): { html: string; captions: string[] } {
  const captions: string[] = [];
  const out = html.replace(FIGURE_RE, (_m, cap: string | undefined) => {
    captions.push((cap ?? "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim());
    return `<p>${SELECTORS.marker(captions.length)}</p>`;
  });
  return { html: out, captions };
}

async function pasteHtml(page: Page, html: string): Promise<void> {
  await page.locator(SELECTORS.editor.body).first().evaluate((el, h) => {
    const dt = new DataTransfer();
    dt.setData("text/html", h);
    dt.setData("text/plain", h.replace(/<[^>]+>/g, " "));
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
}

/** Select the marker's paragraph contents so the next key press empties it. */
async function selectMarker(page: Page, marker: string): Promise<boolean> {
  return page.locator(SELECTORS.editor.body).first().evaluate((el, m) => {
    const p = [...el.querySelectorAll("p")].find((x) => x.textContent?.includes(m));
    if (!p) return false;
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  }, marker);
}

async function pastePng(page: Page, name: string, png: Buffer): Promise<void> {
  await page.locator(SELECTORS.editor.body).first().evaluate(
    (el, a) => {
      const bin = atob(a.b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const dt = new DataTransfer();
      dt.items.add(new File([u], a.name, { type: "image/png" }));
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { name, b64: png.toString("base64") },
  );
}

/** Count the page's autosaves in flight. Medium saves in debounced batches, so the
 *  tab may close only once they have gone quiet: closing after the first save lost
 *  the last three of thirteen figures and left two markers in the draft (2026-10-16). */
function saveWatch(page: Page) {
  const state = { inFlight: 0, last: Date.now() };
  const isSave = (r: { url: () => string; method: () => string }) => r.method() !== "GET" && SELECTORS.api.save.test(r.url());
  page.on("request", (r) => {
    if (isSave(r)) {
      state.inFlight++;
      state.last = Date.now();
    }
  });
  const done = (r: { url: () => string; method: () => string }) => {
    if (isSave(r)) {
      state.inFlight = Math.max(0, state.inFlight - 1);
      state.last = Date.now();
    }
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return {
    touch: () => void (state.last = Date.now()),
    settled: async () => {
      const until = Date.now() + SETTLE_MS;
      while (Date.now() < until) {
        if (state.inFlight === 0 && Date.now() - state.last >= QUIET_MS) return;
        await page.waitForTimeout(500);
      }
      throw new Error("medium was still saving the draft after 90 s");
    },
  };
}

/** What the saved draft holds, read after a reload rather than believed from the edit. */
async function readBack(page: Page): Promise<{ figures: number; markers: number }> {
  return page.locator(SELECTORS.editor.body).first().evaluate((el, a) => ({
    figures: el.querySelectorAll(a.img).length,
    markers: (el.textContent ?? "").split(a.marker).length - 1,
  }), { img: SELECTORS.editor.figureImage, marker: SELECTORS.markerPrefix });
}

async function createDraft(input: MediumDraftInput): Promise<MediumDraftResult> {
  const browser = await attach({ spawn: true });
  const page = await profileContext(browser).newPage();
  const saves = saveWatch(page);
  try {
    await page.route(SELECTORS.api.forbidden, (route) => route.abort());
    await page.goto(input.existingUrl ?? SELECTORS.page.newStoryUrl, { waitUntil: "domcontentloaded", timeout: STEP_MS });
    if (SELECTORS.page.signedOut.test(page.url())) throw new Error("not signed in to medium");
    const body = page.locator(SELECTORS.editor.body).first();
    await body.waitFor({ timeout: STEP_MS }).catch(() => {
      throw new Error("the medium editor did not open");
    });

    const { html, captions } = splitFigures(input.storyHtml);
    await body.click();
    if (input.existingUrl) await page.keyboard.press("Control+A");
    const saved = page.waitForResponse((r) => SELECTORS.api.save.test(r.url()), { timeout: STEP_MS }).catch(() => null);
    await pasteHtml(page, html);
    await saved;

    const title = await page.locator(SELECTORS.editor.title).first().textContent({ timeout: STEP_MS }).catch(() => null);
    // Medium sets its own typography: curly quotes and apostrophes, dashes, non-breaking spaces
    // (2026-10-16: four titles with an apostrophe were refused as "not taken").
    const same = (a: string) => a.replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/…/g, "...").replace(/\s+/g, " ").trim();
    if (!title || same(title) !== same(input.title)) throw new Error(`medium did not take the title (it holds "${same(title ?? "").slice(0, 60)}")`);

    for (let i = 0; i < captions.length; i++) {
      if (!input.figures[i]) break;
      const png = await readFile(input.figures[i].path).catch(() => null);
      if (!(await selectMarker(page, SELECTORS.marker(i + 1)))) continue;
      await page.keyboard.press("Backspace");
      if (!png) continue;
      const before = await page.locator(SELECTORS.editor.figureImage).count();
      await pastePng(page, input.figures[i].name, png);
      try {
        await page.waitForFunction(
          (a) => {
            const imgs = [...document.querySelectorAll(a.sel)] as HTMLImageElement[];
            return imgs.length > a.n && imgs.every((im) => /^https?:/.test(im.src));
          },
          { sel: SELECTORS.editor.figureImage, n: before },
          { timeout: UPLOAD_MS },
        );
      } catch {
        continue;
      }
      if (captions[i]) {
        await page.locator(SELECTORS.editor.caption).nth(before).click();
        await page.keyboard.type(captions[i], { delay: 0 });
      }
      saves.touch();
    }

    await saves.settled();
    if (!SELECTORS.page.draftUrl.test(page.url())) throw new Error("medium did not save a draft");
    const url = page.url().replace(/\?.*$/, "");
    await page.reload({ waitUntil: "domcontentloaded", timeout: STEP_MS });
    await body.waitFor({ timeout: STEP_MS });
    await page.waitForTimeout(2_000);
    const held = await readBack(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: input.shotPath, fullPage: true, timeout: STEP_MS });
    return { url, figures: held.figures, expected: captions.length, markers: held.markers };
  } catch (e) {
    // A failure after Medium saved a draft still names it, so the next attempt replaces that
    // draft instead of leaving it orphaned in the account and starting another.
    const at = page.url().replace(/\?.*$/, "");
    if (SELECTORS.page.draftUrl.test(at)) Object.assign(e as object, { draftUrl: at });
    throw e;
  } finally {
    await page.close().catch(() => undefined);
  }
}

export const mediumDriver: MediumDriver = {
  probe: () => probeMediumOn(MEDIUM_CDP_PORT),
  createDraft: (input) =>
    createDraft(input).catch((e: Error & { draftUrl?: string }) => {
      const out = new Error(/^(medium|not signed in|the medium)/.test(e.message) ? e.message : `medium refused the draft: ${e.message.split("\n")[0]}`);
      throw e.draftUrl ? Object.assign(out, { draftUrl: e.draftUrl }) : out;
    }),
};
