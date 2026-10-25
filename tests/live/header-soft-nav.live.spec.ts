// LANE - THE LIVE APP: THE HEADER'S SECTION LINKS ARE SOFT NAVIGATIONS (app-shell: the shell
// never unmounts). A document load re-runs Providers (keymap install, identity check, one
// POST /api/session) and drops the toast; a soft navigation keeps all of it.
//
// The instrument: a marker set on window survives a soft navigation and dies with a document
// load; POST /api/session is counted across the clicks.
//
//   GRAVITONE_PRODUCE_SIDE=fixture LIVE_PORT=3191 \
//     npx playwright test -c playwright.live.config.ts tests/live/header-soft-nav.live.spec.ts

import { expect, test } from "@playwright/test";

test("Floor -> Library -> Ledger from the header keeps the document and posts no second session", async ({ page }) => {
  const sessionPosts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && new URL(r.url()).pathname === "/api/session") sessionPosts.push(r.url());
  });
  await page.goto("/floor");
  const nav = page.getByRole("navigation", { name: "sections" });
  await expect(nav.getByRole("link", { name: "Library" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => {
    (window as unknown as { __shellMark: number }).__shellMark = 1;
  });
  const settled = sessionPosts.length;

  await nav.getByRole("link", { name: "Library" }).click();
  await page.waitForURL(/\/library$/);
  await nav.getByRole("link", { name: "Ledger" }).click();
  await page.waitForURL(/\/ledger$/);
  await page.waitForLoadState("networkidle");

  expect(await page.evaluate(() => (window as unknown as { __shellMark?: number }).__shellMark), "the document was reloaded").toBe(1);
  expect(sessionPosts.length - settled, "POST /api/session after the first load").toBe(0);
});
