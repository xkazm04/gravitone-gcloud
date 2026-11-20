// LANE - THE LIVE APP: THE TIMELINE STREET OPENS OVERLAYS (spark character-cores S1.5 WP7).
//
// What only a browser can see: a keyframe pressed on the timeline street opens a modal dialog over the page (the
// street's rows keep their height), ← → step it through the keyframes in the order they play, the canvas keymap is
// paused under it, and Esc closes it with focus back on the very tile that was pressed. A take opens the clip overlay
// with the take's verdict in it, and the docked review under the street is gone.
//
// Fixture side, over the production fixture's media (foundry-out/production-fixture, or PRODUCTION_FIXTURE_DIR - point
// it at a copy when another session is drawing into the real one):
//   PRODUCTION_FIXTURE_DIR=<copy> npx playwright test -c playwright.live.config.ts tests/live/scout-street-overlay.live.spec.ts

import { expect, test, type Page } from "@playwright/test";

async function openStreet(page: Page): Promise<void> {
  await page.goto("/scout/canvas?street=unlatched&v=b", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(page.locator('[data-role="street"][data-variant="b"]')).toBeVisible();
}

test("a keyframe opens its overlay, the arrows step it, Esc returns focus to the tile", async ({ page }) => {
  await openStreet(page);
  const street = page.locator('[data-role="street"]');
  const tall = (await street.boundingBox())?.height ?? 0;
  const tile = page.getByRole("button", { name: /^B07, keyframes/ });
  await tile.click();

  const dialog = page.getByRole("dialog", { name: /B07/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog.getByRole("img", { name: /^B07/ })).toBeVisible();
  await expect(dialog.locator("q")).toContainText("Rotoscoped animation still");
  // The street did not grow under the press.
  expect((await street.boundingBox())?.height ?? 0).toBeCloseTo(tall, 0);
  await expect(page.locator('[data-role="street-detail"], [data-role="street-review"]')).toHaveCount(0);

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: /B08/ })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: /B07/ })).toBeVisible();
  // The canvas keymap is paused: V (cycle the street's variant) does nothing while the dialog is open.
  await page.keyboard.press("v");
  await expect(page.locator('[data-role="street"][data-variant="b"]')).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(tile).toBeFocused();
  // One Esc closed the overlay only: the street is still open.
  await expect(street).toBeVisible();
});

test("a take opens the clip overlay with its verdict; a 'from' tile moves the overlay to its node", async ({ page }) => {
  await openStreet(page);
  const tile = page.getByRole("button", { name: /^K02, clips/ });
  await tile.click();
  const dialog = page.locator('[data-role="clip-overlay"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("group", { name: "review of K02" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Play$/ })).toBeVisible();

  await dialog.locator('[data-role="overlay-from"]').getByRole("button", { name: /^K02 start, keyframes/ }).click();
  await expect(page.getByRole("dialog", { name: /K02 start/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tile).toBeFocused();
});
