// LANE - THE LIVE APP: /library-next OVER THE FIXTURE LIBRARY (Phase 5, wave A, L50).
//
// WHY THIS RUNG. The rules are one rung down (packages/ui/test/components/library.test.ts: the
// geometry, the fold, the keys; tests/next-server/library-route.test.ts: the fixture index's
// counting, the presentation, the address). What exists only in the running page is checked here:
// that a facet's count on the rail is what clicking it yields, that the filter lives in the URL
// and survives a reload, that 5,000 items hold one screen of tiles and fetch the rest as they
// scroll, that the keys drive it, that an act lands, that the drawers open below 1360 and 1280,
// that a phone does not scroll sideways - and that what is drawn is legible.
//
// The page answers from the fixture side (app/(studio)/library-next/_port/port.ts SIDE): one
// in-memory universe for the server process. The one test that writes (pin) undoes itself.

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

test.use({ viewport: { width: 1600, height: 900 } });

async function open(page: Page, search = ""): Promise<void> {
  await page.goto(`/library-next${search}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Library"][data-ready="true"]')).toBeVisible({ timeout: 120_000 });
}

const listbox = (page: Page) => page.getByRole("listbox", { name: "Library items" });

/** The results' "N items" stamp, as a number. */
async function total(page: Page): Promise<number> {
  const t = await page.locator("[aria-live=polite]").filter({ hasText: "items" }).first().locator("span[aria-hidden=true]").first().innerText();
  return Number(t.replace(/[^\d]/g, ""));
}

/** A rail row by its label, inside a group. */
const railRow = (page: Page, group: string, label: string) => page.locator(`#lib-rail [data-group="${group}"] button[aria-pressed]`).filter({ has: page.locator(`span:text-is("${label}")`) }).first();

async function railCount(page: Page, group: string, label: string): Promise<number> {
  return Number((await railRow(page, group, label).locator("span[aria-hidden=true]").last().innerText()).replace(/[^\d]/g, ""));
}

test("a facet's count is what clicking it yields, and the filter lives in the URL through a reload", async ({ page }) => {
  await open(page, "?kind=audio");
  const n = await railCount(page, "mood", "tense");
  expect(n).toBeGreaterThan(0);
  await railRow(page, "mood", "tense").click();
  await expect(page).toHaveURL(/f=mood:tense/);
  await expect.poll(() => total(page)).toBe(n);
  // OR within the group: a second mood widens, and its own count was the disjunctive one.
  const warm = await railCount(page, "mood", "warm");
  await railRow(page, "mood", "warm").click();
  await expect(page).toHaveURL(/f=mood:warm/);
  await expect.poll(() => total(page)).toBeGreaterThan(Math.max(n, warm));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Library"][data-ready="true"]')).toBeVisible();
  await expect(railRow(page, "mood", "tense")).toHaveAttribute("aria-pressed", "true");
  await expect(railRow(page, "mood", "warm")).toHaveAttribute("aria-pressed", "true");
  // A kind change keeps the shared filters and drops the vocabulary the new kind lacks.
  await page.locator('#lib-rail section[aria-label=Kind] button').filter({ hasText: "Plates" }).click();
  await expect(page).toHaveURL(/kind=plate/);
  await expect(page).not.toHaveURL(/mood/);
});

test("5,000 items hold one screen of tiles; scrolling far fetches the rows it reaches", async ({ page }) => {
  await open(page);
  expect(await total(page)).toBe(5000);
  const rendered = async (): Promise<number> => Number(((await page.getByTestId("rendered").innerText()).match(/rendered ([\d,]+)/)?.[1] ?? "0").replace(/,/g, ""));
  expect(await rendered()).toBeLessThan(60);
  expect(await listbox(page).locator("[role=option]").count()).toBeLessThan(60);
  await listbox(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(listbox(page).locator("[role=option]").last()).toHaveAttribute("aria-label", /media (missing|unreadable)/, { timeout: 15_000 });
  expect(await listbox(page).locator("[role=option]").count()).toBeLessThan(60);
});

test("the keys: / searches with the grammar, the arrows select, ] toggles the detail, Esc backs out", async ({ page }) => {
  await open(page, "?kind=audio");
  const tense = await railCount(page, "mood", "tense");
  await page.keyboard.press("/");
  await expect(page.locator("[data-keyfield=search]")).toBeFocused();
  await page.keyboard.type("mood:tense");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=mood:tense/);
  await expect.poll(() => total(page)).toBe(tense);
  // ⏎ moved focus to the results and selected the first; → walks.
  await expect(listbox(page)).toBeFocused();
  const first = await listbox(page).locator('[role=option][aria-selected="true"]').getAttribute("data-id");
  expect(first).not.toBeNull();
  await page.keyboard.press("ArrowRight");
  await expect(listbox(page).locator('[role=option][aria-selected="true"]')).not.toHaveAttribute("data-id", first ?? "");
  await expect(page).toHaveURL(/sel=audio-/);
  await expect(page.locator("[data-component=LibraryDetail]")).toContainText("Lineage");
  await page.keyboard.press("]");
  await expect(page.locator('[data-component="Library"]')).toHaveAttribute("data-detail", "false");
  await page.keyboard.press("]");
  await expect(page.locator('[data-component="Library"]')).toHaveAttribute("data-detail", "true");
  await page.keyboard.press("Escape");
  await expect(listbox(page).locator('[role=option][aria-selected="true"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/q=/);
});

test("the detail: a facet chip filters, a lineage door filters, pin lands and is undone", async ({ page }) => {
  await open(page, "?kind=plate");
  await listbox(page).locator("[role=option]").first().click();
  const det = page.locator("[data-component=LibraryDetail]");
  await expect(det.getByRole("list", { name: "lineage" })).toBeVisible();
  await det.getByRole("button", { name: /^station: / }).first().click();
  await expect(page).toHaveURL(/f=station:/);
  await det.getByRole("list", { name: "lineage" }).getByRole("button", { name: /^20\d\d-\d\d-\d\d-/ }).first().click();
  await expect(page).toHaveURL(/f=run:/);
  await det.getByRole("button", { name: "Pin to collection" }).click();
  await expect(page.locator('[data-world="next"] [role=status][aria-live=polite]')).toContainText("Pinned");
  await expect(det.getByRole("button", { name: "Unpin" })).toBeVisible();
  await expect.poll(() => railCount(page, "pin", "pinned")).toBe(1);
  await det.getByRole("button", { name: "Unpin" }).click();
  await expect(det.getByRole("button", { name: "Pin to collection" })).toBeVisible();
});

test("below 1360 the detail, below 1280 the rail, are drawers; Esc closes the nearest", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await open(page);
  const toggle = page.getByRole("button", { name: /^vocabulary/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.locator("#lib-rail section[aria-label=Kind] button").first()).toBeInViewport();
  await listbox(page).focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await listbox(page).locator("[role=option]").first().click();
  await expect(page.locator('[data-component="Library"]')).toHaveAttribute("data-detail", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-component="Library"]')).toHaveAttribute("data-detail", "false");
});

test("a phone does not scroll sideways, in the grid and in the list", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const q of ["", "?view=list&kind=audio"]) {
    await open(page, q);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});

test("legibility: the Library, an item open, reads at the floors (text 4.5, marks 3)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "?kind=style");
  await listbox(page).locator("[role=option]").first().click();
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(800);
  const keys = async (): Promise<string[]> => ((await page.evaluate(measurerSource({ ground: DEFAULT_GROUND }))) as Finding[]).map(findingKey);
  const a = await keys();
  await page.waitForTimeout(700);
  const b = await keys();
  // Disabled controls keep the prototype's dimming (WCAG 1.4.3 exempts them; owner ruling 2026-10-15).
  const found = a.filter((k) => b.includes(k) && !k.includes("aria-disabled"));
  expect(found).toEqual([]);
});
