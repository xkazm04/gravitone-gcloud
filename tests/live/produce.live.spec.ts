// LANE - THE LIVE APP: COMPOSE, PLAN, RECEIPT, CONFIRM, RUNS ACTS, THE FLOOR COMPOSER (Phase 4, L28).
//
// What only a browser can see: a recipe composed with a key, its Plan drawn with priced model
// pickers, a model and a units change moving the plan's estimate, Launch raising a RECEIPT in the
// sheet layer and ⏎ confirming it, the launched jobs in Runs on their lanes; a stale confirm (the
// plan changed in another tab between reading and ⏎) answered with the fresh receipt and its
// moved cells marked, launching nothing until a second ⏎; Runs' acts (pause and resume on P,
// earlier/later, retry, a re-route through its own receipt); a Floor composer launching through
// its receipt; a ceiling under a cost band's worst case confirming as a stop point, with the
// act's ledger chip on its toast; a held lane acknowledged. Every act goes through the produce
// port's Server Actions, whatever side ./app/(studio)/projects/_port/port.ts switches to.
//
// THE UNIVERSE. Wave A's port answers from its FIXTURE side (an in-memory universe per server
// process, seeded on first read): a project that failed its frames gate (`the-quiet-tariff`), a
// draft (`untitled-port-strike`), a Suno run interrupted on the Chrome box (its lane HOLDS). The
// lane's server is fresh per run (reuseExistingServer: false), so the seeds are as they were
// born; a test composes its own project for every write it makes, so the order of tests matters
// only for the two seeded acts (the retry and the acknowledgement), each done once.
//
// LEGIBILITY. /projects/[id] is a dynamic segment the route walk skips (studio-routes spec), so
// the Plan, the receipt sheet and Compose are measured here with the lane's own measurer and the
// legibility spec's settling rule: zero findings.

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

const runsJob = (id: string): string => `/projects/runs?job=${encodeURIComponent(`kernel:${id}`)}`;

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function settledFindings(page: Page): Promise<string[]> {
  const sample = async () => ((await page.evaluate(measurerSource({ ground: DEFAULT_GROUND }))) as Finding[]).map(findingKey);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(300);
  const first = new Set(await sample());
  await page.waitForTimeout(700);
  return [...new Set((await sample()).filter((k) => first.has(k)))].sort();
}

/** Compose a film from Runs with N then 1; land on its Plan. Returns the project id. */
async function composeFilm(page: Page): Promise<string> {
  await ready(page, "/projects/runs");
  await expect(page.locator('[data-component="RunsDayline"][data-measured]')).toBeVisible();
  await page.keyboard.press("n");
  const dialog = page.getByRole("dialog", { name: "compose" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("1");
  await page.waitForURL(/\/projects\/untitled-film-\d+\?composed=1$/);
  await expect(page.locator('[data-component="PlanTable"]')).toBeVisible();
  const id = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
  expect(id).toMatch(/^untitled-film-\d+$/);
  return id;
}

const estimate = (page: Page) => page.locator('[data-component="PlanSummary"] dl dd').first();
const receipt = (page: Page) => page.locator('[data-component="Receipt"]');

test("compose a film, change a model and units (the estimate moves), read the receipt, confirm, see it in Runs", async ({ page }) => {
  const id = await composeFilm(page);
  await expect(page.getByRole("textbox", { name: "title" })).toBeFocused();
  const before = await estimate(page).innerText();
  await page.getByLabel("plates for frames").fill("40");
  await expect(estimate(page)).not.toHaveText(before);
  const mid = await page.locator('[data-component="PlanSummary"]').innerText();
  const gemini = await page.getByLabel("model for script").locator("option", { hasText: "Gemini" }).getAttribute("value");
  expect(gemini).not.toBeNull();
  await page.getByLabel("model for script").selectOption(gemini ?? "");
  await expect(page.locator('[data-component="PlanSummary"]')).not.toHaveText(mid);
  await expect(page.getByLabel("model for script")).toHaveValue(/google/);

  await page.getByRole("button", { name: /Launch plan/ }).click();
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  await expect(receipt(page).locator('tr[data-line$=":frames"] td').nth(3)).toHaveText("40");
  await expect(receipt(page).locator('tr[data-line$=":script"]')).toContainText("google");
  expect(await settledFindings(page), "receipt sheet").toEqual([]);
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/projects/runs\\?project=${id}$`));
  await expect(page.locator('[data-component="RunsDayline"][data-measured]')).toBeVisible();
  await expect(page.locator(`[data-bar="kernel:job:part:${id}:frames"]`)).toBeAttached();
});

test("a stale confirm launches nothing and shows the fresh receipt with what moved; the second ⏎ launches", async ({ page, context }) => {
  const id = await composeFilm(page);
  await page.getByRole("button", { name: /Launch plan/ }).click();
  await expect(receipt(page)).toBeVisible();
  // Another tab changes the plan between the read and the confirm.
  const other = await context.newPage();
  await ready(other, `/projects/${id}`);
  await other.getByLabel("plates for frames").fill("12");
  await expect(other.getByLabel("plates for frames")).toHaveValue("12");
  await other.waitForTimeout(1200);
  await other.close();
  await page.keyboard.press("Enter");
  await expect(receipt(page).getByLabel(/changes since you read it/)).toBeVisible();
  await expect(receipt(page).locator('tr[data-line$=":frames"] td').nth(3)).toHaveText(/^12 \(changed\)$/);
  await expect(page).toHaveURL(new RegExp(`/projects/${id}`));
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/projects/runs\\?project=${id}$`));
});

test("Runs acts: pause and resume on P, later and earlier, re-route through its receipt", async ({ page }) => {
  const id = await composeFilm(page);
  await page.getByRole("button", { name: /Launch plan/ }).click();
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/projects\/runs\?project=/);
  const job = `job:part:${id}:frames`;
  await ready(page, runsJob(job));
  const acts = page.locator('[data-component="JobActs"]');
  await expect(acts).toBeVisible();
  await page.keyboard.press("p");
  await expect(page.getByRole("status").filter({ hasText: /paused/ })).toBeVisible();
  await expect(acts.getByRole("button", { name: /resume/ })).toBeVisible();
  await page.keyboard.press("p");
  await expect(acts.getByRole("button", { name: /pause/ })).toBeVisible();
  await acts.getByRole("button", { name: "later" }).click();
  await expect(page.getByRole("status").filter({ hasText: /behind|end of the lane queue/ })).toBeVisible();
  await page.waitForTimeout(500);
  await acts.getByRole("button", { name: "earlier" }).click();
  await expect(page.getByRole("status").filter({ hasText: /ahead of|end of the lane queue/ })).toBeVisible();

  const list = page.locator('[data-component="RerouteList"]');
  await expect(list.getByRole("button").first()).toBeVisible();
  await page.keyboard.press("o");
  await expect(list.getByRole("button").first()).toBeFocused();
  await list.getByRole("button", { name: /re-route to Nano Banana/ }).click();
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toContainText("nano-banana");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /re-routed/ })).toBeVisible();
  await expect(receipt(page)).toHaveCount(0);
});

test("retry a failed job on the same route", async ({ page }) => {
  await ready(page, runsJob("job:part:the-quiet-tariff:frames"));
  const acts = page.locator('[data-component="JobActs"]');
  await expect(acts).toBeVisible();
  await page.keyboard.press("t");
  await expect(page.getByRole("status").filter({ hasText: /retry · attempt 2/ })).toBeVisible();
});

test("a Floor composer launches through its receipt", async ({ page }) => {
  await ready(page, "/floor");
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
  const form = page.locator('form[data-component="IdeaComposer"][data-lane="video"]');
  await expect(form.locator('[data-component="Estimate"]')).toContainText("cards");
  await form.getByRole("textbox", { name: "first sentence" }).fill("Radar sweeps; one blip stays.");
  await form.getByRole("textbox", { name: "first sentence" }).press("Enter");
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toContainText("strips");
  await page.keyboard.press("Escape");
  await expect(receipt(page)).toHaveCount(0);
  await form.getByRole("button", { name: /Launch/ }).click();
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /Video · launched/ })).toBeVisible();
  await expect(form.locator("..").locator('[data-component="RunTrack"]')).toContainText("Radar sweeps; one blip stays.");
});

test("a ceiling under the worst case is a stop point: the receipt says so and still confirms", async ({ page }) => {
  await ready(page, "/floor");
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
  const form = page.locator('form[data-component="IdeaComposer"][data-lane="article"]');
  await expect(form.locator('[data-component="Estimate"]')).toContainText("$47–92");
  await form.getByRole("textbox", { name: "first sentence" }).fill("The budget is a clock, not a pool.");
  await form.getByRole("textbox", { name: "first sentence" }).press("Enter");
  await expect(receipt(page)).toBeVisible();
  await receipt(page).getByLabel("ceiling in dollars").fill("80");
  await expect(receipt(page).getByLabel("worst case $92 over the ceiling $80")).toBeVisible();
  await expect(receipt(page).getByRole("button", { name: /Confirm/ })).not.toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: /Article · launched/ })).toBeVisible();
  await expect(page.getByRole("status").getByRole("link", { name: /ledger events for/ })).toBeVisible();
});

test("a held lane is drawn on its row and lifted by an acknowledgement", async ({ page }) => {
  await ready(page, "/projects/runs");
  await expect(page.locator('[data-component="RunsDayline"][data-measured]')).toBeVisible();
  const hold = page.locator('[data-component="LaneHold"][data-lane="box.chrome"]');
  await expect(hold).toBeVisible();
  await expect(hold).toContainText("credits may be spent - look first");
  await expect(page.getByRole("img", { name: /on hold/ })).toBeVisible();
  await page.keyboard.press("a");
  await expect(page.getByRole("status").filter({ hasText: /hold acknowledged/ })).toBeVisible();
  await expect(hold).toHaveCount(0);
});

test("the Plan and Compose start legible", async ({ page }) => {
  await ready(page, "/projects/untitled-port-strike");
  await expect(page.locator('[data-component="PlanTable"]')).toBeVisible();
  expect(await settledFindings(page), "plan").toEqual([]);
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "compose" })).toBeVisible();
  expect(await settledFindings(page), "compose").toEqual([]);
});
