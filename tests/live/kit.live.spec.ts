// LANE — THE LIVE APP: /kit, THE NEW DESIGN SYSTEM'S SPECIMEN SHEET (app/(studio)/kit).
//
// WHY THIS RUNG. Three claims here exist only in a rendered page: that every @gt/ui
// component actually mounted (a component can typecheck and still throw in render, or be
// left out of the sheet), that the type floor holds in COMPUTED sizes (a token can be
// right and a cascade from v1's root - this world still nests under it - can shrink it),
// and that a Hint's tip is dismissed by Escape without focus moving, which needs a real
// pointer, a real keydown and the live layer stack. Everything a module can answer is
// answered one rung down (packages/ui/test).
//
// THE POPULATIONS ARE WALKED, NOT LISTED. The component list is every exported component
// function under packages/ui/src/components (read off the filesystem, so a new component
// is a new requirement the day it lands); the token list is packages/ui/tokens/source.json.
// Each has a floor, because a walk that found nothing would pass every assertion.
//
// A PAGE PER GROUP (design baseline P4, 2026-11-17): the sheet is /kit (the tokens) and /kit/<group> for the rest
// (app/(studio)/kit/sections.ts KIT_GROUPS), so the specimen and type-floor claims walk every group page and take
// the union; a group page that does not render is its own failure.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { KIT_GROUPS, kitHref } from "../../app/(studio)/kit/sections.ts";

const PAGES = KIT_GROUPS.map((g) => kitHref(g.id));

/** Open each group page in turn and hand it to `read`. */
async function eachPage(page: Page, read: (url: string) => Promise<void>): Promise<void> {
  for (const url of PAGES) {
    await page.goto(url, { waitUntil: "networkidle" });
    await read(url);
  }
}

const ROOT = process.cwd();
const COMPONENTS = join(ROOT, "packages", "ui", "src", "components");

function exportedComponents(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith(".tsx")) {
        for (const m of readFileSync(full, "utf8").matchAll(/^export function ([A-Z]\w*)/gm)) if (m[1] !== undefined) out.push(m[1]);
      }
    }
  };
  walk(COMPONENTS);
  return out.sort();
}

function sourceTokens(): string[] {
  const src = JSON.parse(readFileSync(join(ROOT, "packages", "ui", "tokens", "source.json"), "utf8")) as { groups: { tokens: { name: string }[] }[] };
  return src.groups.flatMap((g) => g.tokens.map((t) => t.name)).sort();
}

test.describe("/kit", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/kit", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
    await expect(page.locator('[data-world="next"] [data-specimen]').first()).toBeVisible();
  });

  test("renders a specimen of every @gt/ui component, with no page error", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const wanted = exportedComponents();
    expect(wanted.length, "walked no component exports").toBeGreaterThan(25);
    const drawn = new Set<string>();
    await eachPage(page, async (url) => {
      const here = (await page.locator("[data-specimen]").evaluateAll((els) => els.map((e) => e.getAttribute("data-specimen") ?? ""))).flatMap((s) => s.split(" "));
      expect(here.length, `${url} drew no specimen`).toBeGreaterThan(0);
      for (const n of here) drawn.add(n);
    });
    expect(wanted.filter((n) => !drawn.has(n)), "components with no specimen on /kit").toEqual([]);
    expect(errors).toEqual([]);
  });

  test("draws every token of tokens/source.json", async ({ page }) => {
    const wanted = sourceTokens();
    expect(wanted.length, "source.json held no tokens").toBeGreaterThan(50);
    const drawn = new Set(await page.locator("[data-token]").evaluateAll((els) => els.map((e) => e.getAttribute("data-token") ?? "")));
    expect(wanted.filter((n) => !drawn.has(n)), "tokens the kit does not draw").toEqual([]);
  });

  test("hydrating the PacketReview scrolls nothing into view", async ({ page }) => {
    // The sheet scrolls inside its own body, so scrollY cannot see a jump; the call itself is the
    // measure, taken on any element inside the review before the review's own fiber appears.
    await page.addInitScript(() => {
      const w = window as unknown as { __reviewScrolls: number };
      w.__reviewScrolls = 0;
      const native = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, ...args: Parameters<Element["scrollIntoView"]>): void {
        if (this.closest('[data-component="PacketReview"]') !== null) w.__reviewScrolls++;
        native.apply(this, args);
      };
    });
    await page.goto("/kit/operations", { waitUntil: "networkidle" });
    // Hydration of the whole sheet is slow and in pieces: wait for the review's own fiber.
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-component="PacketReview"]');
      return el !== null && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
    });
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => (window as unknown as { __reviewScrolls: number }).__reviewScrolls)).toBe(0);
  });

  test("no readable text under 12px (computed, after v1's cascade)", async ({ page }) => {
    await eachPage(page, async (url) => {
    const r = await page.evaluate(() => {
      const world = document.querySelector('[data-world="next"]');
      if (world === null) return { checked: 0, small: ["no world root"] };
      const walker = document.createTreeWalker(world, NodeFilter.SHOW_TEXT);
      const small: string[] = [];
      let checked = 0;
      for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
        const el = n.parentElement;
        if (el === null || (n.textContent ?? "").trim() === "") continue;
        const box = el.getBoundingClientRect();
        // Spoken-only text (an sr-only label is a 1px box) is the non-visual channel, not type.
        if (box.width <= 1 || box.height <= 1) continue;
        checked++;
        const px = Number.parseFloat(getComputedStyle(el).fontSize);
        if (px < 12) small.push(`${px}px ${el.tagName.toLowerCase()}.${el.className}: ${(n.textContent ?? "").trim().slice(0, 40)}`);
      }
      return { checked, small };
    });
    expect(r.checked, `${url} measured no text`).toBeGreaterThan(20);
    expect(r.small, url).toEqual([]);
    });
  });

  test("a Hint opens on hover and Escape dismisses it without moving focus (WCAG 1.4.13)", async ({ page }) => {
    await page.goto("/kit/signal", { waitUntil: "networkidle" });
    const hint = page.locator('[data-specimen="Hint"]');
    const glyph = hint.getByRole("button", { name: "spend" });
    const tip = hint.locator('[role="tooltip"]');
    await glyph.scrollIntoViewIfNeeded();
    // Focus somewhere else first: the dismissal must leave it exactly there.
    await page.locator("#keys-h").evaluate((h) => {
      h.setAttribute("tabindex", "-1");
      (h as HTMLElement).focus();
    });
    await glyph.hover();
    await expect(tip).toHaveCSS("opacity", "1");
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCSS("opacity", "0");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("keys-h");
    // Dismissed stays dismissed while the pointer rests; leaving and re-entering reopens it.
    await page.mouse.move(0, 0);
    await glyph.hover();
    await expect(tip).toHaveCSS("opacity", "1");
  });
});
