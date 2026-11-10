// LANE - THE LIVE APP: THE PART WORKSPACE, THE RESEARCH AND SCRIPT EDITORS (Phase 4 wave C, L38).
//
// What only a browser can see: every editor face opens in the one workspace (the notebook scope
// board, the beat board, the ads brief; the beat document, the trailer cut, the scenarios); an
// edit lands as an op and ⌫ undoes it, the verdict chip moving both ways; an edit made against a
// rev another tab already moved answers with the part as it is now and writes nothing; each
// generating act opens its RECEIPT in the sheet and ⏎ confirms it (dry: the fixture universe
// runs every act on its stand-in); J/K and H/L walk items and columns; and the editors measure
// legible. Every act goes through the part port's Server Actions, whatever side
// app/(studio)/projects/[id]/_part/port.ts switches to.
//
// THE UNIVERSE. The part port answers from its FIXTURE side, in the produce fixture's project
// universe (`fixtureProduce()`): why-bitcoin carries its own notebook and three composed
// candidates, glass-harbor-trailer its own beat board and cut, and two projects are composed on
// the first part read - an ad (Rainshell) and a free film. Those two get produce-minted ids, so
// the lane finds them by probing their slug (`seeded`). The server is fresh per run.

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(page.locator('[data-component="PartWorkspace"]')).toBeVisible();
  await page.waitForLoadState("networkidle");
}

const chip = (page: Page) => page.locator('[data-component="VerdictChip"]');
const receipt = (page: Page) => page.locator('[data-component="Receipt"]');

/** A seeded project's produce-minted id (`<slug>-<n>`), found by asking the route. */
async function seeded(page: Page, slug: string): Promise<string> {
  await page.request.get("/projects/why-bitcoin/research");
  for (let n = 1; n <= 60; n++) {
    const id = `${slug}-${n}`;
    if ((await page.request.get(`/projects/${id}/research`)).status() === 200) return id;
  }
  throw new Error(`no seeded project ${slug}-n answered`);
}

async function settledFindings(page: Page): Promise<string[]> {
  const sample = async () => ((await page.evaluate(measurerSource({ ground: DEFAULT_GROUND }))) as Finding[]).map(findingKey);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(300);
  const first = new Set(await sample());
  await page.waitForTimeout(700);
  return [...new Set((await sample()).filter((k) => first.has(k)))].sort();
}

test("every face opens in the workspace, each drawing its own project's work", async ({ page }) => {
  await ready(page, "/projects/why-bitcoin/research");
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await expect(page.getByRole("listbox", { name: "The number" })).toBeVisible();
  await ready(page, "/projects/why-bitcoin/script");
  await expect(page.getByRole("article", { name: "Why Bitcoin's Price Won't Rise" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "candidate checks" })).toContainText("enforced");
  await ready(page, "/projects/glass-harbor-trailer/research");
  await expect(page.locator("[data-variant]")).not.toHaveCount(0);
  await ready(page, "/projects/glass-harbor-trailer/script");
  await expect(page.getByRole("complementary", { name: "structure" })).toContainText("well-formed");
  await expect(page.getByRole("complementary", { name: "structure" })).not.toContainText("registry:");
  await expect(page.getByRole("complementary", { name: "structure" })).not.toContainText("magnitudeOf");
  const ad = await seeded(page, "rainshell-social-15");
  await ready(page, `/projects/${ad}/research`);
  await expect(page.getByLabel("product")).toHaveValue(/Rainshell/);
  await expect(page.locator("[data-idea]")).toHaveCount(6);
  await ready(page, `/projects/${ad}/script`);
  await expect(page.getByText("research not ready")).toBeVisible();
  const free = await seeded(page, "any-video-the-night-market");
  await ready(page, `/projects/${free}/research`);
  await expect(chip(page)).toHaveAttribute("data-verdict", "empty");
  // A part kind with no editor yet is a 404, never an empty editor.
  expect((await page.request.get("/projects/why-bitcoin/gate:frames")).status()).toBe(404);
  expect((await page.request.get("/projects/why-bitcoin/nope")).status()).toBe(404);
});

test("an op lands and ⌫ undoes it; the verdict chip moves both ways", async ({ page }) => {
  await ready(page, "/projects/why-bitcoin/research");
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await page.getByRole("listbox", { name: "The number" }).locator('[role="option"]').nth(1).click();
  await page.keyboard.press("x");
  await expect(chip(page)).toHaveAttribute("data-verdict", "working");
  await expect(chip(page)).toContainText("1 card moved since the scope was confirmed");
  await expect(page.getByRole("button", { name: /^undo descope/ })).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await expect(page.getByRole("button", { name: /^undo/ })).toHaveCount(0);
});

test("an edit against a stale rev answers with the part as it is now, and writes nothing", async ({ page, context }) => {
  await ready(page, "/projects/glass-harbor-trailer/research");
  const other = await context.newPage();
  await ready(other, "/projects/glass-harbor-trailer/research");
  // The first tab unpicks the cold open; the second, still at the old rev, picks another variant.
  await page.locator('[data-variant="cold-open-a"]').click();
  await expect(chip(page)).toHaveAttribute("data-verdict", "working");
  await other.locator('[data-variant="cold-open-b"]').click();
  await expect(other.getByText("changed elsewhere")).toBeVisible();
  await expect(chip(other)).toHaveAttribute("data-verdict", "working");
  await expect(other.locator('[data-variant="cold-open-b"]')).toHaveAttribute("aria-pressed", "false");
  await expect(other.locator('[data-variant="cold-open-a"]')).toHaveAttribute("aria-pressed", "false");
  // Restore the spine for the next test: pick it back and the verdict returns.
  await page.locator('[data-variant="cold-open-a"]').click();
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await other.close();
});

test("each generating act opens its receipt in the sheet and ⏎ confirms it", async ({ page }) => {
  const ad = await seeded(page, "rainshell-social-15");
  // ads · generate ideas, then pick one: research turns READY
  await ready(page, `/projects/${ad}/research`);
  await page.getByRole("button", { name: /regenerate ideas/ }).click();
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toHaveCount(0);
  await page.locator("[data-idea]").first().click();
  await page.getByRole("button", { name: /^pick/ }).click();
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  // ads · generate scenarios
  await ready(page, `/projects/${ad}/script`);
  await page.getByRole("button", { name: /generate scenarios/ }).click();
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-scenario]")).toHaveCount(3);
  await page.keyboard.press("a");
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  // notebook · a follow-up turn
  await ready(page, "/projects/why-bitcoin/research");
  await page.getByLabel("question").fill("who are the whale holders?");
  await page.getByLabel("question").press("Enter");
  await expect(page.locator("[data-follow-up]")).toHaveCount(1);
  await page.getByRole("button", { name: /run 1 follow-up/ }).click();
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-follow-up]").first()).toContainText(/returned|unanswered/);
  // document · compose again, then a note and a recalibration that stages a version
  await ready(page, "/projects/why-bitcoin/script");
  await page.getByRole("button", { name: /compose again/ }).click();
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toHaveCount(0);
  await page.getByRole("button", { name: "coverage" }).click();
  await page.locator("[data-usage] select").first().selectOption("less-focus");
  await expect(page.locator("[data-note]")).toHaveCount(1);
  await page.getByRole("button", { name: /recalibrate · 1 note/ }).click();
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-staged]")).toBeVisible();
  // trailer · recompose from the spine
  await ready(page, "/projects/glass-harbor-trailer/script");
  await page.getByRole("button", { name: /recompose from spine/ }).click();
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toHaveCount(0);
});

test("keys walk items and columns; ⏎ picks on the beat board", async ({ page }) => {
  await ready(page, "/projects/why-bitcoin/research");
  const rail = page.getByRole("listbox", { name: "The number" });
  const first = await rail.getAttribute("aria-activedescendant");
  await page.keyboard.press("j");
  await expect(rail).not.toHaveAttribute("aria-activedescendant", first ?? "");
  await page.keyboard.press("l");
  await expect(page.getByRole("listbox", { name: "Flows & plumbing" })).toHaveAttribute("aria-activedescendant", /rail-/);
  await ready(page, "/projects/glass-harbor-trailer/research");
  // The walk starts on the slot's pick (cold-open-a); one J moves to the next variant.
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-variant="cold-open-b"]')).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page)).toHaveAttribute("data-verdict", "working");
  await page.keyboard.press("Backspace");
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await page.keyboard.press("]");
  await page.waitForURL(/\/glass-harbor-trailer\/script$/);
});

for (const [name, url] of [
  ["notebook", "/projects/why-bitcoin/research"],
  ["document", "/projects/why-bitcoin/script"],
  ["beats", "/projects/glass-harbor-trailer/research"],
  ["trailer", "/projects/glass-harbor-trailer/script"],
] as const) {
  test(`legibility: the ${name} editor has no findings`, async ({ page }) => {
    await ready(page, url);
    expect(await settledFindings(page)).toEqual([]);
  });
}
