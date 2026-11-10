// LANE - THE LIVE APP: THE STYLE ATELIER (Phase 5, L51).
//
// What only a browser can see: a proven catalogue style with no look is ADOPTED through its
// receipt, proofs are GENERATED for chosen trial columns through theirs (dry: the fixture side
// lands a committed grid plate as the render), each plate is JUDGED - approve with A, reject with
// R and its one-line reason - and the style LOCKS only once the server's gate holds, the ratchet
// drawn at each step; a locked style's block is prose and DUPLICATE is the way on; an edit made
// against a rev another tab already moved answers with the style as it is now and writes
// nothing; and the atelier measures legible at 1440 and 390.
//
// THE UNIVERSE. The style port answers from its FIXTURE side (app/(studio)/library/style/
// _port/port.ts): painted-3d (proven, no look), newsprint-cutout (mid-proofing), blueprint
// (locked), chalk-argument (words, no sheet), soft-backlit-bokeh (an extracted candidate). The
// journey mutates painted-3d, so it runs once per server; the server is fresh per run.

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

const at = (id: string): string => `/library/style/${id}`;
const atelier = (page: Page) => page.locator('[data-component="Atelier"]');
const gate = (page: Page) => page.locator('[data-component="LockGate"]');
const receipt = (page: Page) => page.locator('[data-component="Receipt"]');
const proof = (page: Page, id: string) => page.locator(`[data-proof="${id}"]`);

async function ready(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(atelier(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
}

async function rev(page: Page): Promise<number> {
  return Number(await atelier(page).getAttribute("data-rev"));
}

/** Open the receipt an act raised, read it, confirm with ⏎, and wait for the landing. */
async function confirmReceipt(page: Page): Promise<void> {
  const before = await rev(page);
  await expect(receipt(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toBeHidden();
  await expect.poll(() => rev(page)).toBeGreaterThan(before);
}

async function settledFindings(page: Page): Promise<string[]> {
  const sample = async () => ((await page.evaluate(measurerSource({ ground: DEFAULT_GROUND }))) as Finding[]).map(findingKey);
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
  await page.waitForTimeout(300);
  const first = new Set(await sample());
  await page.waitForTimeout(700);
  return [...new Set((await sample()).filter((k) => first.has(k)))].sort();
}

test("an unknown style is a 404, never an empty atelier", async ({ page }) => {
  expect((await page.request.get(at("no-such-style"))).status()).toBe(404);
});

test("adopt -> generate (dry) -> judge -> lock, driven end to end", async ({ page }) => {
  await ready(page, at("painted-3d"));
  await expect(gate(page)).toHaveAttribute("data-status", "proven");
  await expect(page.getByRole("button", { name: /^lock/ })).toHaveCount(0);

  // ADOPT: the palette readback is priced (unpriced, with the table's reason) before it runs.
  await page.getByRole("button", { name: "adopt" }).first().click();
  await expect(receipt(page)).toContainText("palette readback");
  await confirmReceipt(page);
  await expect(page.locator('[data-component="Palette"] li')).toHaveCount(3);
  await expect(page.locator('[data-component="StyleSlots"]')).toBeVisible();
  const seeded = page.locator('[data-proof^="forge:"]');
  await expect(seeded).toHaveCount(2);
  await expect(gate(page)).toContainText("2 proofs still undecided");

  // GENERATE: choose three trial columns; the receipt prices one plate each.
  for (const name of [/the fall/, /the wish list/, /the booking/]) await page.getByRole("button", { name }).first().click();
  await page.keyboard.press("g");
  await expect(receipt(page)).toContainText("$0.14");
  await confirmReceipt(page);
  await expect(page.locator('[data-proof][data-lineage="current"]')).toHaveCount(3);

  // JUDGE: J walks to a plate, A approves it; a forge plate is rejected with its reason.
  for (const id of await page.locator('[data-proof][data-lineage="current"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-proof") ?? ""))) {
    await proof(page, id).getByRole("button", { name: /^hold/ }).click();
    const r = await rev(page);
    await page.keyboard.press("a");
    await expect.poll(() => rev(page)).toBeGreaterThan(r);
    await expect(proof(page, id)).toHaveAttribute("data-state", "approved");
  }
  for (const id of await seeded.evaluateAll((els) => els.map((e) => e.getAttribute("data-proof") ?? ""))) {
    await proof(page, id).getByRole("button", { name: /^hold/ }).click();
    await page.keyboard.press("r");
    const note = page.locator('[data-keyfield="proof-note"]');
    await expect(note).toBeFocused();
    await note.fill("a forge plate, not this look");
    const r = await rev(page);
    await page.keyboard.press("Enter");
    await expect.poll(() => rev(page)).toBeGreaterThan(r);
    await expect(proof(page, id)).toHaveAttribute("data-state", "rejected");
    await expect(proof(page, id)).toContainText("a forge plate, not this look");
  }

  // LOCK: the gate holds now; ⇧L locks, and the block becomes prose.
  await expect(gate(page)).toHaveAttribute("data-can-lock", "");
  await page.keyboard.press("Shift+L");
  await expect(gate(page)).toHaveAttribute("data-status", "locked");
  await expect(page.locator('[data-component="StyleSlots"] textarea')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^approve/ })).toHaveCount(0);
});

test("a held gate says why, and the lock is not offered until it holds", async ({ page }) => {
  await ready(page, at("newsprint-cutout"));
  await expect(gate(page)).toContainText("1 proof still undecided");
  await expect(page.getByRole("button", { name: /^lock/ })).toHaveCount(0);
  await page.keyboard.press("Shift+L");
  await expect(gate(page)).toHaveAttribute("data-status", "proven");
  // A stale approval is drawn as such and does not cover its problem.
  await expect(proof(page, "pr-nc-exit")).toHaveAttribute("data-lineage", "stale");
  await expect(page.locator('[data-trial="the-exit"]')).not.toHaveAttribute("data-covered", "");
});

test("an edit against a moved rev redraws the truth and writes nothing", async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  await ready(a, at("chalk-argument"));
  await ready(b, at("chalk-argument"));
  await a.getByLabel("style name").fill("Chalk, first");
  await a.getByRole("button", { name: "rename" }).click();
  await expect(a.getByRole("heading", { level: 1 })).toHaveText("Chalk, first");
  await b.getByLabel("style name").fill("Chalk, second");
  await b.getByRole("button", { name: "rename" }).click();
  await expect(b.getByText("changed elsewhere — redrawn as it is now")).toBeVisible();
  await expect(b.getByRole("heading", { level: 1 })).toHaveText("Chalk, first");
  await a.close();
  await b.close();
});

test("a locked look is changed only by duplicating it", async ({ page }) => {
  await ready(page, at("blueprint"));
  await expect(gate(page)).toHaveAttribute("data-status", "locked");
  await expect(page.locator('[data-component="StyleSlots"] textarea')).toHaveCount(0);
  await page.getByRole("button", { name: "duplicate" }).click();
  await expect(page).toHaveURL(/\/library\/style\/blueprint-copy$/);
  await expect(gate(page)).toHaveAttribute("data-status", "candidate");
  await expect(page.locator('[data-component="StyleSlots"] textarea')).toHaveCount(3);
});

for (const [name, width, height] of [["1440", 1440, 900], ["390", 390, 844]] as const) {
  test(`legibility: the atelier at ${name} has no findings`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await ready(page, at("newsprint-cutout"));
    expect(await settledFindings(page)).toEqual([]);
  });
}
