// LANE - THE LIVE APP: RUNS DRAWS EVERY RESOURCE, A SELECTION LIGHTS ITS THREAD, THE KEYS WORK.
//
// What only a browser can see: the day-line laid out (one row per resource lane, then the Weir
// and the Calendar), a click selecting a bar and dimming the rest, the selection reaching the
// URL without a server round trip, and the keymap's read verbs (J/K walk, Esc deselects, R
// re-centres) answering through the app's one dispatcher. The type floor and the legibility
// baseline for /projects/runs are held by studio-routes.live.spec.ts, which walks every (studio)
// route; this file does not restate them.
//
// It runs in whatever universe the lane's server is in. The rows are the domain's lanes, so they
// are always there; bars need data - the Weir's piles are drawn from arrival to NOW, so any
// store with a pile waiting has a bar - and a world with none fails loudly rather than passing
// on an empty day-line.

import { expect, test, type Page } from "@playwright/test";

// The domain's lanes in drawing order (@gt/domain/lane RESOURCE_LANES; ES modules are not
// loaded into this lane's spec files, so the eight ids are named here and the page is the check).
const LANES = ["gpu.local", "box.render", "box.chrome", "seat.text", "cloud.google", "cloud.elevenlabs", "cloud.leonardo", "cloud.qwen"];

test.beforeEach(async ({ page }) => {
  await page.goto("/projects/runs", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  // Hydrated and re-windowed: keys are bound and the drawn set is the client's (RunsDayline).
  await expect(page.locator('[data-component="RunsDayline"][data-measured]')).toBeVisible();
});

test("one row per resource lane, then the Weir and the Calendar, under a named day-line", async ({ page }) => {
  const rows = await page.locator("[data-row]").evaluateAll((els) => els.map((e) => e.getAttribute("data-row")));
  expect(rows).toEqual([...LANES, "weir", "calendar"]);
  await expect(page.getByRole("group", { name: /^Runs day-line: 10 rows/ })).toBeVisible();
  await expect(page.getByText(/^NOW \d\d:\d\d$/).first()).toBeVisible();
});

type Reach = { readonly id: string; readonly x: number; readonly y: number };

/**
 * The bars a pointer can actually reach, each with a point on it: the middle of the part of the
 * bar inside the scroller's viewport and right of the sticky lane labels, where the bar is the
 * topmost element. (A Weir pile runs from its arrival to NOW, so its own middle can be far off
 * screen.) Read only once the drawn set is settled - the first paint is windowed around NOW on
 * the server, the client re-windows to the measured viewport on its first frame, and a bar can
 * leave the DOM in between (found in integration: `.first()` resolved to a bar the re-window
 * then dropped, and the click landed on its neighbour).
 */
async function reachableBars(page: Page): Promise<Reach[]> {
  const read = (): Promise<Reach[]> =>
    page.evaluate(() => {
      const scroller = document.querySelector('[data-component="RunsDayline"] [role="group"]');
      const label = document.querySelector("[data-row] > div");
      if (scroller === null || label === null) return [];
      const view = scroller.getBoundingClientRect();
      const left = label.getBoundingClientRect().right;
      return [...scroller.querySelectorAll<HTMLElement>("[data-bar]")].flatMap((el) => {
        const r = el.getBoundingClientRect();
        const x0 = Math.max(r.left, left + 1);
        const x1 = Math.min(r.right, view.right - 1);
        const y0 = Math.max(r.top, view.top);
        const y1 = Math.min(r.bottom, view.bottom - 1);
        if (x1 - x0 < 4 || y1 - y0 < 4) return [];
        const x = (x0 + x1) / 2;
        const y = (y0 + y1) / 2;
        return document.elementFromPoint(x, y)?.closest("[data-bar]") === el ? [{ id: el.getAttribute("data-bar") ?? "", x: x - r.left, y: y - r.top }] : [];
      });
    });
  const key = (rs: readonly Reach[]): string => rs.map((r) => r.id).join(" ");
  await expect
    .poll(
      async () => {
        const a = key(await read());
        await page.waitForTimeout(400);
        return a !== "" && a === key(await read());
      },
      { message: "no bar a pointer can reach settled on the day-line" },
    )
    .toBe(true);
  return read();
}

test("selecting a bar lights it, dims the rest, names it in the inspector and in the URL", async ({ page }) => {
  const reach = await reachableBars(page);
  const pick = reach[0];
  if (pick === undefined) throw new Error("no bar on the day-line - this universe has no live work and no pile at the Weir");
  const id = pick.id;
  const bar = page.locator(`[data-bar="${id}"]`);
  await bar.click({ position: { x: pick.x, y: pick.y } });
  await expect(bar).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-component="RunsDayline"] [data-lit]')).toHaveCount(1);
  await expect.poll(() => new URL(page.url()).searchParams.get("job")).toBe(id);
  const inspector = page.getByRole("complementary", { name: "inspector" });
  await expect(inspector.getByRole("heading", { level: 2 })).not.toHaveText("Every resource");
  // A bar off the lit thread is drawn at the prototype's .26 (polled: the dim is a .25 s transition).
  const other = reach.map((r) => r.id).find((x) => x !== id);
  if (other !== undefined) {
    const el = page.locator(`[data-bar="${other}"]`);
    const offThread = await el.evaluate((n) => !(n.getAttribute("class") ?? "").includes("thread"));
    if (offThread) await expect.poll(async () => Number(await el.evaluate((n) => getComputedStyle(n).opacity))).toBeLessThan(0.3);
  }
});

test("J walks to the next job, K back, Esc lets go - through the keymap, with the URL following", async ({ page }) => {
  const bars = page.locator("[data-bar]");
  const n = await bars.count();
  expect(n, "no bar to walk").toBeGreaterThan(0);
  await page.locator('[data-component="RunsDayline"] [role="group"]').focus();
  await page.keyboard.press("j");
  await expect(page.locator('[data-bar][aria-pressed="true"]')).toHaveCount(1);
  const a = new URL(page.url()).searchParams.get("job");
  expect(a).not.toBeNull();
  if (n > 1) {
    await page.keyboard.press("j");
    await expect.poll(() => new URL(page.url()).searchParams.get("job")).not.toBe(a);
    await page.keyboard.press("k");
    await expect.poll(() => new URL(page.url()).searchParams.get("job")).toBe(a);
  }
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-bar][aria-pressed="true"]')).toHaveCount(0);
  await expect.poll(() => new URL(page.url()).searchParams.get("job")).toBeNull();
  await expect(page.getByRole("complementary", { name: "inspector" }).getByRole("heading", { level: 2 })).toHaveText("Every resource");
});

test("a zoom is in the URL and on the axis corner; R brings NOW back into view", async ({ page }) => {
  await page.getByRole("group", { name: "zoom" }).getByRole("button", { name: "week" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("zoom")).toBe("week");
  const scroller = page.locator('[data-component="RunsDayline"] [role="group"]');
  await scroller.evaluate((el) => {
    el.scrollLeft = 0;
  });
  await scroller.focus();
  await page.keyboard.press("r");
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
});

test("the write verbs are not drawn and not answered: no pause, retry, re-route or compose", async ({ page }) => {
  // The prototype's own labels (projects.js Inspector, renderList, ResourceSummary), anchored:
  // a v1 record may well be called "video-compose".
  for (const name of [/^pause/i, /^resume/i, /^retry/i, /^re-route/i, /^\+ ?compose/i, /^launch plan/i, /^earlier/i, /^later/i]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await page.locator('[data-component="RunsDayline"] [role="group"]').focus();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
