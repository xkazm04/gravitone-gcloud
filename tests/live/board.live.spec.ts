// LANE - THE LIVE APP: THE BOARD RISES OVER THE FLOOR, EVERY DESK KEY DECIDES, A COMMIT SHOWS
// WHAT IT WILL DO FIRST, AND THE SERVER HOLDS EVERY WRITE.
//
// What only a browser can see: the Board as a sheet over the Floor (an intercepted soft
// navigation) and as a page (a reload); one Escape closing one layer - the lens, the note, the
// consequence, the sheet - and a second Escape not walking history twice; each desk's keys
// answering through the one dispatcher in the sheet's mode; the commit refusing while anything
// is open; the consequence panel before every commit and its fresh copy after a stale token;
// and every write surviving a reload, because the store (the Board port) holds it, not the tab.
//
// THE PORT. Wave A's Board answers from the fixture port (app/(studio)/board/_port/fixture.ts),
// which enforces the kernel's rules. Each test starts it over through its development-only
// control (POST /board/fixture). The Floor's piles are v1's Weir: one that the fixture was not
// seeded with opens as its source's fixture stand-in, so "from the Floor" is driven for real.
// When L24 flips the port to the kernel, the same journeys hold against the real store.
//
// Run: LIVE_PORT=<port> npx playwright test -c playwright.live.config.ts tests/live/board.live.spec.ts

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

const at = (id: string): string => `/board/${encodeURIComponent(id)}`;
const sheet = (page: Page) => page.locator('[data-component="LevelSheet"]');
const tile = (page: Page, i: number) => page.locator(`[data-tile="${i}"]`);
const commitButton = (page: Page) => page.getByRole("button", { name: /^commit packet/ });
const consequence = (page: Page) => page.locator('[data-component="ConsequencePanel"]');

async function reset(page: Page, body: Record<string, string> = {}): Promise<void> {
  const r = await page.request.post("/board/fixture", { data: body });
  expect(r.ok(), `fixture control answered ${r.status()}: ${await r.text()}`).toBe(true);
}

/** A packet's page, hydrated: the gate has loaded it and the desk's keys are bound. */
async function openBoard(page: Page, id: string): Promise<void> {
  await page.goto(at(id), { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(sheet(page)).toBeVisible();
  await expect(page.locator("[data-desk-main]")).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** The gate's window (400 ms) closes and the write lands before the next look. */
const landed = (page: Page) => page.waitForTimeout(700).then(() => page.waitForLoadState("networkidle"));

test.beforeEach(async ({ page }) => {
  await page.goto("/kit", { waitUntil: "domcontentloaded" });
  await reset(page);
});

test("from the Floor a pile opens the Board as a sheet over it; Esc closes it once, a second Esc stays", async ({ page }) => {
  await page.goto("/floor", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
  const pile = page.locator('a[data-component="Pile"]').first();
  await expect(pile, "the Floor shows no pile to open - the Weir is empty in this universe").toBeVisible();
  await pile.click();
  await expect(page).toHaveURL(/\/board\/pkt%3A/);
  await expect(page.getByRole("dialog", { name: /^Floor › Board/ })).toBeVisible();
  // The Floor stayed mounted under the sheet: it was not a page load.
  await expect(page.locator('[data-component="Floor"]')).toBeAttached();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/floor(\?|$)/);
  await expect(sheet(page)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/floor(\?|$)/);
  await expect(page.locator('[data-component="Floor"]')).toBeVisible();
});

test("a reload opens the same packet as a page; Esc from the page goes to the Floor", async ({ page }) => {
  await openBoard(page, "pkt:forge:sweep-01");
  await expect(page.getByRole("region", { name: /Forge sweep-01$/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/floor(\?|$)/);
});

test("matrix cull: K X U, a reason key, toggling a reason, moves, row acts, the lens, undo - and the server holds them", async ({ page }) => {
  await openBoard(page, "pkt:strips:strips-07");
  await expect(tile(page, 0)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("k");
  await expect(tile(page, 0)).toHaveAttribute("aria-label", /, keep$/);
  await expect(tile(page, 1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("x");
  await expect(tile(page, 1)).toHaveAttribute("aria-label", /, reject$/);
  await page.keyboard.press("2");
  await expect(tile(page, 2)).toHaveAttribute("aria-label", /, reject: legibility$/);
  // Back to it: a reason on a standing reject toggles and stays.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("1");
  await expect(tile(page, 2)).toHaveAttribute("aria-label", /, reject: concept, legibility$/);
  await expect(tile(page, 2)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("j");
  await page.keyboard.press("u");
  await expect(tile(page, 1)).toHaveAttribute("aria-label", / strip$/);
  await page.keyboard.press("l");
  await page.keyboard.press("ArrowDown");
  await expect(tile(page, 5)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Shift+X");
  for (const i of [3, 4, 5]) await expect(tile(page, i)).toHaveAttribute("aria-label", /, reject$/);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Shift+K");
  for (const i of [0, 1, 2]) await expect(tile(page, i)).toHaveAttribute("aria-label", /, keep$/);
  // ⌫ takes back the last act - the whole row - as one.
  await landed(page);
  await page.keyboard.press("Backspace");
  await expect(tile(page, 2)).toHaveAttribute("aria-label", /, reject: concept, legibility$/);
  await expect(tile(page, 1)).toHaveAttribute("aria-label", / strip$/);
  // The lens is a layer: Esc closes it, not the sheet.
  await page.keyboard.press("z");
  await expect(page.locator("[data-zoom]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-zoom]")).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  // The store held every act: a reload draws the same verdicts.
  await landed(page);
  await openBoard(page, "pkt:strips:strips-07");
  await expect(tile(page, 0)).toHaveAttribute("aria-label", /, keep$/);
  await expect(tile(page, 1)).toHaveAttribute("aria-label", / strip$/);
  await expect(tile(page, 2)).toHaveAttribute("aria-label", /, reject: concept, legibility$/);
  await expect(tile(page, 4)).toHaveAttribute("aria-label", /, reject$/);
});

test("commit refuses while anything is open, jumps to the first open tile, then shows the consequence and commits", async ({ page }) => {
  await openBoard(page, "pkt:forge:sweep-01");
  await expect(commitButton(page)).toHaveAttribute("aria-label", "commit packet, 10 undecided");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toHaveCount(0);
  // Imported verdicts keep tiles 0 and 2 decided, so the first open tile is 1.
  await expect(tile(page, 1)).toHaveAttribute("aria-selected", "true");
  for (const row of [0, 1, 2]) {
    await page.locator(`[data-tile="${row * 4}"]`).click();
    await page.keyboard.press(row === 0 ? "Shift+K" : "Shift+X");
  }
  await expect(commitButton(page)).toHaveAttribute("aria-label", "commit packet");
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toBeVisible();
  await expect(consequence(page)).toContainText("foundry-out/runs/sweep-01/flywheel/signal-ledger.png");
  // Esc cancels the consequence and leaves the sheet up.
  await page.keyboard.press("Escape");
  await expect(consequence(page)).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(consequence(page).getByRole("button", { name: "Commit" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("committed").first()).toBeVisible();
  await openBoard(page, "pkt:forge:sweep-01");
  await expect(page.locator('[data-desk-main]')).toContainText("kept4");
});

test("a stale preview is refused at commit and the fresh one is shown to confirm again", async ({ page }) => {
  await openBoard(page, "pkt:mv:mv-03");
  await page.keyboard.press("Shift+K");
  await landed(page);
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toBeVisible();
  await expect(consequence(page)).not.toContainText("moved · fresh preview");
  await reset(page, { drift: "pkt:mv:mv-03" });
  await consequence(page).getByRole("button", { name: "Commit" }).click();
  await expect(consequence(page)).toContainText("moved · fresh preview");
  await consequence(page).getByRole("button", { name: "Commit" }).click();
  await expect(consequence(page)).toHaveCount(0);
  await expect(page.getByText("committed").first()).toBeVisible();
});

test("audio cull: the source's defects on the reason keys, Space plays the take", async ({ page }) => {
  await openBoard(page, "pkt:audio:takes-11");
  await page.keyboard.press("4");
  await expect(tile(page, 0)).toHaveAttribute("aria-label", /, reject: tempo-instability$/);
  await page.keyboard.press("Space");
  await expect(tile(page, 1)).toContainText("▶");
});

test("blind pair: masked until picked, then revealed with the machine's agreement; tie, both bad, undo, commit", async ({ page }) => {
  await openBoard(page, "pkt:dojo:cycle-3");
  await expect(page.getByText("LEFT · ▒▒▒▒")).toBeVisible();
  await expect(page.getByText("machine pick ▒▒ masked")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(commitButton(page)).toHaveAttribute("aria-label", "commit packet, 3 left");
  await page.keyboard.press("1");
  await expect(page.getByText(/^machine (agrees|differs)$/)).toBeVisible();
  await expect(page.getByText("2/3")).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press("0");
  await expect(page.getByText("3/3")).toBeVisible({ timeout: 5_000 });
  await landed(page);
  await page.keyboard.press("Backspace");
  await expect(page.getByText("2/3")).toBeVisible();
  await page.keyboard.press("0");
  await expect(page.getByText("3/3")).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press("x");
  await expect(commitButton(page)).toHaveAttribute("aria-label", "commit packet", { timeout: 5_000 });
  await expect(page.getByText(/^picked · /)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("committed").first()).toBeVisible();
});

test("packet review: sections, a note with a directive, Esc cancels the note not the sheet, the edit plan goes back", async ({ page }) => {
  await openBoard(page, "pkt:article:run-42");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-sec="1"]')).toHaveClass(/focus/);
  await page.keyboard.press("e");
  const note = page.getByRole("textbox", { name: "note on section 2" });
  await expect(note).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "less_weight" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(note).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("e");
  await page.keyboard.type("lead with the herd, not the cliché");
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-sec="1"]')).toContainText("lead with the herd, not the cliché");
  await page.keyboard.press("Shift+E");
  await expect(page.getByText("returned").first()).toBeVisible();
});

test("packet review: approve shows the outward act verbatim before the commit", async ({ page }) => {
  await openBoard(page, "pkt:article:run-42");
  await page.keyboard.press("a");
  await expect(consequence(page)).toContainText("push branch article/retry-budgets-that-end to ai-registry and open a PR");
  await page.keyboard.press("Enter");
  await expect(page.getByText("committed").first()).toBeVisible();
});

test("cut review: beats, a beat note, approve through the consequence", async ({ page }) => {
  await openBoard(page, "pkt:step:cut-01");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("e");
  await page.keyboard.type("hold the push a beat longer");
  await page.keyboard.press("Enter");
  await expect(page.getByText("hold the push a beat longer")).toBeVisible();
  await page.keyboard.press("a");
  await expect(consequence(page)).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("committed").first()).toBeVisible();
});

test("[ and ] walk the open packets", async ({ page }) => {
  await openBoard(page, "pkt:forge:sweep-01");
  await page.keyboard.press("]");
  await expect(page).not.toHaveURL(/sweep-01/);
});

for (const id of ["pkt:forge:sweep-01", "pkt:dojo:cycle-3", "pkt:article:run-42", "pkt:audio:takes-11", "pkt:step:cut-01"]) {
  test(`${id}: no text under 12px and zero contrast misses`, async ({ page }) => {
    await openBoard(page, id);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      const world = document.querySelector('[data-world="next"]');
      if (world === null) return ["no world"];
      const w = document.createTreeWalker(world, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n !== null; n = w.nextNode()) {
        const el = n.parentElement;
        if (el === null || (n.textContent ?? "").trim() === "") continue;
        const b = el.getBoundingClientRect();
        if (b.width <= 1 || b.height <= 1) continue;
        const px = Number.parseFloat(getComputedStyle(el).fontSize);
        if (px < 12) out.push(`${px}px ${(n.textContent ?? "").trim().slice(0, 30)}`);
      }
      return out;
    });
    expect(small).toEqual([]);
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
    await page.waitForTimeout(300);
    const sample = async () => ((await page.evaluate(measurerSource({ ground: DEFAULT_GROUND }))) as Finding[]).map(findingKey);
    const first = new Set(await sample());
    await page.waitForTimeout(700);
    expect([...new Set((await sample()).filter((k) => first.has(k)))]).toEqual([]);
  });
}
