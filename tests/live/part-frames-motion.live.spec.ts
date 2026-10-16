// LANE - THE LIVE APP: THE FRAMES AND MOTION EDITORS (Phase 4 wave C, L39).
//
// What only a browser can see: the frames ledger derives from the chain Script ADOPTED (and
// draws nothing before - no fixture fallback); a layer dragged on the canvas lands as ONE op and
// ⌫ undoes it; "direct the cut" opens its receipt, lands a PROPOSAL whose refusals are the scene
// validator's own sentences, and is accepted and reverted by op; ⏎ prices a single plate's render;
// a trailer's SHOTS render plates and carry the shot review with what it did not check; Motion
// directs a plate (receipt), accepts with ⌘⏎ and renders a clip (receipt); the ads take grid
// adopts with 1-9. Every act runs on the fixture side's dry stand-ins (GRAVITONE_DRY_ONLY).
//
// THE UNIVERSE is the part port's fixture side (part-editors.live.spec.ts says how): why-bitcoin,
// glass-harbor-trailer, and the seeded ad. The server is fresh per run; this file adopts why-
// bitcoin's first candidate, which the research/script lane does not read back.

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

async function confirm(page: Page): Promise<void> {
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toHaveCount(0);
}

async function seeded(page: Page, slug: string): Promise<string> {
  await page.request.get("/projects/why-bitcoin/research");
  for (let n = 1; n <= 60; n++) {
    const id = `${slug}-${n}`;
    if ((await page.request.get(`/projects/${id}/research`)).status() === 200) return id;
  }
  throw new Error(`no seeded project ${slug}-n answered`);
}

async function adoptExplainer(page: Page): Promise<void> {
  await ready(page, "/projects/why-bitcoin/script");
  if ((await page.getByRole("button", { name: /^undo adopt/ }).count()) === 0) {
    await page.keyboard.press("a");
    await expect(page.getByRole("button", { name: /^undo adopt/ })).toBeVisible();
  }
}

async function settledFindings(page: Page): Promise<string[]> {
  const sample = async () => ((await page.evaluate(measurerSource({ ground: DEFAULT_GROUND }))) as Finding[]).map(findingKey);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(300);
  const first = new Set(await sample());
  await page.waitForTimeout(700);
  return [...new Set((await sample()).filter((k) => first.has(k)))].sort();
}

test("frames draws nothing before Script adopts, then derives the adopted chain's units", async ({ page }) => {
  await ready(page, "/projects/why-bitcoin/frames");
  await expect(page.locator("[data-unit]")).toHaveCount(0);
  await expect(chip(page)).toHaveAttribute("data-verdict", "empty");
  await adoptExplainer(page);
  await ready(page, "/projects/why-bitcoin/frames");
  await expect(page.locator("[data-unit]").first()).toBeVisible();
  await expect(chip(page)).toContainText("plates composed");
});

test("a layer moves as one op, ⌫ undoes it; the receipt for one plate opens on ⏎", async ({ page }) => {
  await adoptExplainer(page);
  await ready(page, "/projects/why-bitcoin/frames");
  const layer = page.locator('[data-component="FrameCanvas"] [data-layer^="text:"]').first();
  await layer.click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /^undo move/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: /^undo move/ })).toHaveCount(0);
  // ⏎ on a focused control is the control's own; from the ledger it prices the unit's plate.
  await page.getByRole("listbox", { name: "units" }).focus();
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toContainText("render");
  await page.keyboard.press("Escape");
  await expect(receipt(page)).toHaveCount(0);
});

test("direct the cut: a proposal with the validator's refusals, accepted and reverted by op", async ({ page }) => {
  await adoptExplainer(page);
  await ready(page, "/projects/why-bitcoin/frames");
  await page.getByRole("button", { name: /^direct the cut/ }).click();
  await confirm(page);
  const proposal = page.getByRole("region", { name: "direction proposal" });
  await expect(proposal).toBeVisible();
  await expect(proposal).toContainText("refused");
  await expect(page.getByRole("complementary", { name: "unit" })).toContainText("A figure cites no fact. Every number on screen must be traceable.");
  await page.keyboard.press("a");
  await expect(proposal).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^revert pass/ })).toBeVisible();
  await page.getByRole("button", { name: /^revert pass/ }).click();
  await expect(page.getByRole("button", { name: /^revert pass/ })).toHaveCount(0);
});

test("render the owed plates; the verdict says what is left in the work's words", async ({ page }) => {
  await adoptExplainer(page);
  await ready(page, "/projects/why-bitcoin/frames");
  await page.getByRole("button", { name: /^render \d+ plates/ }).click();
  await confirm(page);
  await expect(page.locator('[data-unit][data-plate="empty"]')).toHaveCount(0);
  await expect(chip(page)).toContainText(/figures? unsourced/);
});

test("a trailer's shots render plates and carry the shot review with what it did not check", async ({ page }) => {
  await ready(page, "/projects/glass-harbor-trailer/frames");
  await expect(page.locator("[data-unit]").first()).toBeVisible();
  await page.getByRole("button", { name: /^review/ }).click();
  const review = page.getByRole("region", { name: "shot review" });
  await expect(review).toContainText("not checked");
  await expect(review).toContainText("whether the cut WORKS");
  await page.getByRole("listbox", { name: "units" }).focus();
  await page.keyboard.press("Enter");
  await confirm(page);
  await expect(page.locator('[data-unit][data-plate="ready"]')).toHaveCount(1);
});

test("motion: ⏎ directs (receipt), ⌘⏎ accepts, R renders the clip (receipt)", async ({ page }) => {
  await adoptExplainer(page);
  await ready(page, "/projects/why-bitcoin/frames");
  if ((await page.locator('[data-unit][data-plate="empty"]').count()) > 0) {
    await page.getByRole("button", { name: /^render \d+ plates/ }).click();
    await confirm(page);
  }
  await ready(page, "/projects/why-bitcoin/motion");
  const first = page.locator("[data-unit]").first();
  await page.keyboard.press("Enter");
  await confirm(page);
  await expect(page.getByRole("region", { name: "proposal" })).toBeVisible();
  await page.keyboard.press("Control+Enter");
  await expect(first).toHaveAttribute("data-motion", "moving");
  await page.keyboard.press("r");
  await confirm(page);
  await expect(page.locator('[data-component="FrameCanvas"] video')).toHaveCount(1);
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: /^undo/ })).toBeVisible();
});

test("ads: the take grid makes takes behind a receipt and adopts with 1-9", async ({ page }) => {
  const ad = await seeded(page, "rainshell-social-15");
  await ready(page, `/projects/${ad}/research`);
  if ((await page.locator("[data-idea]").count()) > 0 && (await chip(page).getAttribute("data-verdict")) !== "ready") {
    await page.locator("[data-idea]").first().click();
    await page.getByRole("button", { name: /^pick/ }).click();
    await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  }
  await ready(page, `/projects/${ad}/script`);
  if ((await page.locator("[data-scenario]").count()) === 0) {
    await page.getByRole("button", { name: /generate scenarios/ }).click();
    await confirm(page);
  }
  if ((await chip(page).getAttribute("data-verdict")) !== "ready") {
    await page.keyboard.press("a");
    await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  }
  await ready(page, `/projects/${ad}/frames`);
  await page.getByRole("button", { name: /3 (more )?takes/ }).first().click();
  await confirm(page);
  await expect(page.locator("[data-take]")).toHaveCount(3);
  await page.keyboard.press("2");
  await expect(page.locator("[data-take]").nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(chip(page)).toContainText("1 of 3 images adopted");
});

for (const [name, url] of [
  ["frames · shots", "/projects/glass-harbor-trailer/frames"],
  ["frames · assembly", "/projects/why-bitcoin/frames"],
  ["motion", "/projects/why-bitcoin/motion"],
] as const) {
  test(`legibility: the ${name} editor has no findings`, async ({ page }) => {
    await ready(page, url);
    expect(await settledFindings(page)).toEqual([]);
  });
}
