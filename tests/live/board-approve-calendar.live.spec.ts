// LANE - THE LIVE APP: APPROVE -> CALENDAR ON THE ARTICLE REVIEW DESK (Phase 6, L64) - the
// prototype's "Approve → calendar A" (index.html :659, :842-850) on the PacketReview specimen /kit
// draws over an article packet.
//
// What only a browser can see: the desk of an article (a publishable subject) carries the calendar
// control - the blog channel's mark and a UTC hour proposed at the next day's 08:00 - beside the
// oracle, and its end reads "Approve → calendar"; the hour round-trips through the browser's
// `datetime-local` as UTC, whatever zone the browser runs in (the lane pins a far one); a desk whose
// subject is not publishable (the cut specimen's `step` packet) shows no calendar. The verdict the
// approve writes, the slot the apply makes and the pull request that publishes it are pinned one
// rung down (tests/next-server/decision-v1-article-calendar.test.ts), where the store is.

import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Pacific/Kiritimati" });

test("an article's review desk proposes a blog slot in UTC and approves to the calendar", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/kit", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  const cal = page.locator('[data-component="ApproveSchedule"]').first();
  await expect(cal).toBeVisible();
  await expect(cal.getByRole("group", { name: "channel" })).toContainText("blog");
  const when = cal.getByLabel("publish at, UTC");
  const proposed = await when.inputValue();
  // The next UTC day at 08:00, read as UTC, not as the browser's zone (UTC+14 here).
  const next = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  expect(proposed).toBe(`${next}T08:00`);
  await when.fill("2026-12-24T09:30");
  await expect(when).toHaveValue("2026-12-24T09:30");
  await expect(page.getByRole("button", { name: /^Approve → calendar/ })).toHaveCount(1);
  // The cut desk judges a cut, not a publishable export: no calendar on it.
  await expect(page.locator('[data-component="ApproveSchedule"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
