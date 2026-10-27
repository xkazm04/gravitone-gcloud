// LANE - THE LIVE APP: THE SCORE, CUT, ALBUM AND EXPLAINER EDITORS (Phase 4 wave C, L40).
//
// What only a browser can see: the score spots this project's own picture (the trailer's cut
// proposes its movements, a cue moves a scene at a time by ⇧→ and ⌫ undoes it), a tempo arms the
// cue's render and its receipt confirms with ⏎ into a take; the cut lays the same cue on its music
// lane, nudges a block by the keys and exports through a receipt; the explainer's article, strips
// and voice each land by their act and the cut over them reaches READY with no music rows; the
// album's words are drafted by a turn and the render waits on a kept still; the ad's bed scores
// the picked scenario and its finish holds the render on clips. And the editors measure legible.
//
// THE UNIVERSE is the part port's FIXTURE side (GRAVITONE_PRODUCE_SIDE=fixture on the lane's
// server), the produce fixture's projects plus three the part fixture composes on its first read:
// the ad (Rainshell), the free film and the album (Salt lines). Those get produce-minted ids, so
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

async function confirm(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).first().click();
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toHaveCount(0);
}

async function seeded(page: Page, slug: string, key: string): Promise<string> {
  await page.request.get("/projects/why-bitcoin/research");
  for (let n = 1; n <= 60; n++) {
    const id = `${slug}-${n}`;
    if ((await page.request.get(`/projects/${id}/${key}`)).status() === 200) return id;
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

test("the trailer's score spots its own picture; a cue moves by a scene and ⌫ undoes it; a tempo arms its render", async ({ page }) => {
  await ready(page, "/projects/glass-harbor-trailer/frames");
  if (await page.getByRole("button", { name: /render \d+ plates/ }).count()) await confirm(page, /render \d+ plates/);
  await ready(page, "/projects/glass-harbor-trailer/score");
  const cues = page.getByRole("listbox", { name: "cues" }).locator('[role="option"]');
  await expect(cues).toHaveCount(8);
  await expect(cues.first()).toContainText("proposed");
  // Proposals are shown, never saved by being looked at.
  await expect(chip(page)).toHaveAttribute("data-verdict", "empty");
  await expect(page.getByRole("group", { name: "acts" })).toContainText("needs a tempo");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(page.getByRole("button", { name: /^undo span/ })).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: /^undo/ })).toHaveCount(0);
  const bpm = page.getByLabel("tempo · bpm");
  await bpm.fill("72");
  await bpm.press("Tab");
  await expect(chip(page)).toHaveAttribute("data-verdict", "working");
  await confirm(page, /^render cold open/);
  await expect(page.locator("[data-take]")).toHaveCount(1);
  await expect(page.locator("[data-take]").first()).toContainText("in use");
});

test("the cut lays the same cue on its lanes, nudges a block by the keys, and exports through a receipt", async ({ page }) => {
  await ready(page, "/projects/glass-harbor-trailer/cut");
  await expect(page.getByRole("list", { name: "finish line" })).toContainText("lines not recorded");
  await page.locator('[data-block^="pic-"]').first().click();
  await page.keyboard.press(".");
  await expect(page.getByRole("button", { name: /^undo \+50ms/ })).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("button", { name: /^undo/ })).toHaveCount(0);
  await confirm(page, /export animatic|export again/);
  await expect(page.getByText(/^animatic \d/)).toBeVisible();
});

test("the cut plays: the timecode and the needle follow the clock, and pause holds them", async ({ page }) => {
  await ready(page, "/projects/glass-harbor-trailer/cut");
  const needle = page.locator('[class*="needle"]');
  const read = page.locator('[class*="read"]').first();
  const left = async () => Number.parseFloat(await needle.evaluate((el) => (el as HTMLElement).style.left));
  const at = await read.textContent();
  await page.getByRole("button", { name: "play" }).click();
  await expect.poll(left).toBeGreaterThan(0);
  await expect(read).not.toHaveText(at ?? "");
  await page.getByRole("button", { name: "pause" }).click();
  const held = await read.textContent();
  await page.waitForTimeout(400);
  await expect(read).toHaveText(held ?? "");
});

test("the explainer writes, draws and records, and its cut reaches READY with no music rows", async ({ page }) => {
  const id = "provider-routing-explainer";
  await ready(page, `/projects/${id}/article`);
  await confirm(page, /write article|write again/);
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await ready(page, `/projects/${id}/strips`);
  await confirm(page, /draw \d+ cards|draw again/);
  await expect(page.locator("[data-card]")).toHaveCount(6);
  await ready(page, `/projects/${id}/voice`);
  const lines = page.getByRole("listbox", { name: "lines" }).locator('[role="option"]');
  const n = await lines.count();
  for (let i = 0; i < n; i++) {
    await lines.nth(i).click();
    await confirm(page, /^record line/);
  }
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await ready(page, `/projects/${id}/cut`);
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await expect(page.locator("[data-check]")).toHaveCount(5);
  await expect(page.locator('[data-check="coverage"]')).toHaveCount(0);
});

test("the album's words are drafted by a turn; the render waits on a kept still", async ({ page }) => {
  const id = await seeded(page, "salt-lines-album-video", "words");
  await ready(page, `/projects/${id}/words`);
  await expect(chip(page)).toHaveAttribute("data-verdict", "empty");
  await confirm(page, /write words|write again/);
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await expect(page.getByLabel(/^title/)).toHaveValue("Salt lines");
  await ready(page, `/projects/${id}/render`);
  await expect(page.getByRole("group", { name: "acts" })).toContainText("needs a kept still");
});

test("the ad's bed scores the picked scenario; its finish holds the render on clips", async ({ page }) => {
  const ad = await seeded(page, "rainshell-social-15", "research");
  // The ad is one project for the whole lane (the part fixture composes it once, by title), and
  // part-editors.live has already picked its first idea by the time this file runs: a picked idea
  // draws a "picked" chip where "pick" was (AdsBrief), so the pick is made only when research is
  // not READY yet - the same guard part-frames-motion's ads test holds. Likewise the adopt.
  await ready(page, `/projects/${ad}/research`);
  if ((await chip(page).getAttribute("data-verdict")) !== "ready") {
    await page.locator("[data-idea]").first().click();
    await page.getByRole("button", { name: /^pick/ }).click();
    await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  }
  await ready(page, `/projects/${ad}/script`);
  if (await page.getByRole("button", { name: /generate scenarios/ }).count()) await confirm(page, /generate scenarios/);
  if ((await chip(page).getAttribute("data-verdict")) !== "ready") {
    await page.keyboard.press("a");
    await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  }
  await ready(page, `/projects/${ad}/score`);
  const bpm = page.getByLabel("tempo · bpm");
  await bpm.fill("96");
  await bpm.press("Tab");
  await confirm(page, /render bed|render another take/);
  await expect(chip(page)).toHaveAttribute("data-verdict", "ready");
  await ready(page, `/projects/${ad}/cut`);
  await expect(page.locator('[data-check="clips"]')).toContainText("without a clip");
  await expect(page.locator('[data-aspect="9:16"]')).toContainText("blocked");
});

for (const [name, url] of [
  ["score", "/projects/glass-harbor-trailer/score"],
  ["cut", "/projects/glass-harbor-trailer/cut"],
  ["voice", "/projects/provider-routing-explainer/voice"],
  ["strips", "/projects/provider-routing-explainer/strips"],
] as const) {
  test(`legibility: the ${name} editor has no findings`, async ({ page }) => {
    await ready(page, url);
    expect(await settledFindings(page)).toEqual([]);
  });
}
