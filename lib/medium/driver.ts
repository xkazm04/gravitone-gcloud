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

async function createDraft(input: MediumDraftInput): Promise<MediumDraftResult> {
  const browser = await attach({ spawn: true });
  const page = await profileContext(browser).newPage();
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
    const same = (a: string) => a.replace(/\s+/g, " ").trim();
    if (!title || same(title) !== same(input.title)) throw new Error(`medium did not take the title (it holds "${same(title ?? "").slice(0, 60)}")`);

    let placed = 0;
    for (let i = 0; i < input.figures.length && i < captions.length; i++) {
      if (!(await selectMarker(page, SELECTORS.marker(i + 1)))) continue;
      await page.keyboard.press("Backspace");
      const before = await page.locator(SELECTORS.editor.figureImage).count();
      await pastePng(page, input.figures[i].name, await readFile(input.figures[i].path));
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
      placed++;
      if (captions[i]) {
        await page.locator(SELECTORS.editor.caption).nth(before).click();
        await page.keyboard.type(captions[i], { delay: 0 });
      }
    }

    await page.waitForResponse((r) => SELECTORS.api.save.test(r.url()), { timeout: 10_000 }).catch(() => null);
    await page.waitForTimeout(1500);
    if (!SELECTORS.page.draftUrl.test(page.url())) throw new Error("medium did not save a draft");
    const url = page.url().replace(/\?.*$/, "");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: input.shotPath, fullPage: true, timeout: STEP_MS });
    return { url, figures: placed };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export const mediumDriver: MediumDriver = {
  probe: () => probeMediumOn(MEDIUM_CDP_PORT),
  createDraft: (input) =>
    createDraft(input).catch((e: Error) => {
      throw new Error(/^(medium|not signed in|the medium)/.test(e.message) ? e.message : `medium refused the draft: ${e.message.split("\n")[0]}`);
    }),
};
