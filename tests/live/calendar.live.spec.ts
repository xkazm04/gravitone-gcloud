// LANE - THE LIVE APP: THE CALENDAR ON THE FLOOR (Phase 6, L58) - the rail, the month, and a
// slot's own record as a level over them, on the calendar port's FIXTURE side.
//
// What only a browser can see: C opening the month; a channel toggle hiding that channel's
// slots and riding in the URL; a failed slot's sentence verbatim in the rail, in the month and in
// its record, where the publish chain marks the node it broke at; ⏎ on a selected day opening
// that day's first slot; a move and a cancel landing (the record redraws from the port's answer
// and the rail re-reads); Escape walking back out one layer at a time.
//
// THE UNIVERSE. The lane's server runs GRAVITONE_PRODUCE_SIDE=fixture (playwright.live.config.ts),
// so the calendar port answers from app/(studio)/floor/_calendar/fixture.ts: an in-memory table
// seeded on its first read, at that hour. Its ids are fixed (./fixtureData.ts); the times are
// not, so this spec reads a slot's day from the rail (`data-at`) rather than assuming one. Each
// write test acts on its own slot, so the order of tests changes nothing they assert.

import { expect, test, type Page } from "@playwright/test";

const FAILED = "sl-chokepoint-quota";
const FAILED_TEXT = "upload: 403 quotaExceeded - The request cannot be completed because you have exceeded your quota.";
const TIKTOK_MISSED = "sl-tariff-tt-missed";

async function openFloor(page: Page, q = ""): Promise<void> {
  await page.goto(`/floor${q}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
}

const rail = (page: Page) => page.locator('[data-component="CalendarColumn"]');
const month = (page: Page) => page.locator('[data-component="MonthCalendar"]');
const level = (page: Page) => page.locator('[data-component="SlotDetail"]');

/** The UTC day a slot publishes on, as the rail stamps it. */
async function dayOf(page: Page, id: string): Promise<string> {
  const at = await rail(page).locator(`[data-slot="${id}"]`).first().getAttribute("data-at");
  expect(at, `${id} is not on the rail`).not.toBeNull();
  return (at ?? "").slice(0, 10);
}

test("C opens the month; a channel toggle hides that channel's slots and rides in the URL", async ({ page }) => {
  await openFloor(page);
  const day = await dayOf(page, TIKTOK_MISSED);
  await openFloor(page, `?cal=1&day=${day}`);
  await expect(month(page)).toBeVisible();
  await expect(month(page).locator(`[data-slot="${TIKTOK_MISSED}"]`)).toBeVisible();
  await month(page).getByRole("group", { name: "channels" }).getByRole("button", { name: /tiktok/ }).click();
  await expect(page).toHaveURL(/[?&]off=tiktok\b/);
  await expect(month(page).locator(`[data-slot="${TIKTOK_MISSED}"]`)).toHaveCount(0);
  await expect(month(page).getByText("The quiet tariff · vertical")).toHaveCount(0);
  // The link carries the view.
  await page.reload();
  await expect(month(page).getByRole("group", { name: "channels" }).getByRole("button", { name: /tiktok/ })).toHaveAttribute("aria-pressed", "false");
  await month(page).getByRole("group", { name: "channels" }).getByRole("button", { name: /tiktok/ }).click();
  await expect(month(page).locator(`[data-slot="${TIKTOK_MISSED}"]`)).toBeVisible();
});

test("a failed slot's sentence is verbatim in the rail, the month and its record, broken at upload", async ({ page }) => {
  await openFloor(page);
  await expect(rail(page).locator(`[data-slot="${FAILED}"]`)).toContainText(FAILED_TEXT);
  const day = await dayOf(page, FAILED);
  await openFloor(page, `?cal=1&day=${day}`);
  await expect(month(page).locator(`[role="gridcell"][data-day="${day}"]`)).toContainText(FAILED_TEXT);
  await month(page).locator(`[data-slot="${FAILED}"]`).click();
  await expect(page).toHaveURL(new RegExp(`[?&]slot=${FAILED}\\b`));
  await expect(level(page)).toContainText(FAILED_TEXT);
  await expect(level(page).getByRole("listitem").filter({ hasText: "upload" })).toContainText("broke");
  await expect(level(page).getByRole("listitem").filter({ hasText: "auth" })).toContainText("done");
});

test("⏎ on a selected day opens its first slot, and Escape walks back out one layer at a time", async ({ page }) => {
  await openFloor(page);
  const day = await dayOf(page, FAILED);
  await openFloor(page, `?cal=1&day=${day}`);
  const first = await month(page).locator('[aria-label="day agenda"] [data-component="SlotRow"]').first().getAttribute("data-slot");
  expect(first).not.toBeNull();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`[?&]slot=${first ?? ""}\\b`));
  await expect(level(page)).toHaveAttribute("data-slot", first ?? "");
  await page.keyboard.press("Escape");
  await expect(level(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/slot=/);
  await expect(month(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/day=/);
  await page.keyboard.press("Escape");
  await expect(month(page)).toHaveCount(0);
});

test("a move lands: the record and the rail show the new hour", async ({ page }) => {
  await openFloor(page, "?slot=sl-bitcoin-yt");
  await expect(level(page)).toBeVisible();
  await level(page).getByRole("button", { name: /^Move/ }).first().click();
  const field = level(page).getByLabel("move to, UTC");
  await expect(field).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const to = new Date(Date.now() + 3 * 86_400_000);
  const value = `${to.toISOString().slice(0, 10)}T14:30`;
  await field.fill(value);
  await level(page).locator("form").getByRole("button", { name: "Move" }).click();
  await expect(level(page)).toContainText("14:30 UTC");
  await expect(rail(page).locator('[data-slot="sl-bitcoin-yt"]')).toHaveAttribute("data-at", `${value}:00.000Z`);
});

test("a cancel lands through its confirm: the slot stays on the rail, struck", async ({ page }) => {
  await openFloor(page, "?slot=sl-harbor-ig");
  await expect(level(page)).toHaveAttribute("data-status", "scheduled");
  await level(page).getByRole("button", { name: /^Cancel slot/ }).click();
  const confirm = page.locator('[data-component="SlotConfirm"]');
  await expect(confirm).toContainText("final · it never publishes");
  await confirm.getByRole("button", { name: /^Cancel slot/ }).click();
  await expect(level(page)).toHaveAttribute("data-status", "cancelled");
  await expect(confirm).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(level(page)).toHaveCount(0);
  // Still on the rail in its day, struck - and no longer counted as next.
  await expect(rail(page).locator('[data-slot="sl-harbor-ig"]')).toHaveAttribute("data-status", "cancelled");
});
