// LANE - THE LIVE APP: THE FLOOR DRAWS FOUR LANES, ITS PILES ARE v1's WEIR, THE KEYS WORK.
//
// What only a browser can see: the four media lanes in the order the digits bind; each lane's
// piles equal to what v1's live read says is waiting in that medium (`ledger-sync live`, the
// same liveNow the page reads - page against store, never against a number copied here); the
// NEXT pile ringed on the Floor and named by the header as one and the same; the keymap's floor
// verbs answering through the one dispatcher (⇧1-4 focus with the lane in the URL, Esc, C opens
// the month and Esc closes it, a digit and ⏎ open a packet's Board). The type floor and the
// legibility baseline for /floor are held by studio-routes.live.spec.ts.
//
// THE STORE. Over a seeded fixture store:
//   GRAVITONE_STORE_PATH=<tmp>/ledger.sqlite NEXT_PUBLIC_GRAVITONE_DATA=fixtures \
//     npx playwright test -c playwright.live.config.ts tests/live/floor.live.spec.ts
// With both set, the spec seeds fixtures-out/ (`ledger-sync seed-fixtures`) and syncs the temp
// store (`ledger-sync sync --fixtures --store`) first. Without them it reads whatever the app
// reads and seeds nothing; every comparison still holds, and a Weir with no pile anywhere
// fails loudly rather than passing on four empty lanes.

import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const FIXTURES = process.env["NEXT_PUBLIC_GRAVITONE_DATA"] === "fixtures";
const STORE = process.env["GRAVITONE_STORE_PATH"];
const LANES = ["image", "article", "audio", "video"] as const;

type Pile = { source: string; id: string; media: string; pending: number; since?: string; packetId?: string };

function cli(...args: string[]): string {
  const r = spawnSync(process.execPath, [join(ROOT, "pipeline", "ledger-sync.mts"), ...args], { cwd: ROOT, encoding: "utf8", timeout: 180_000, env: process.env });
  expect(r.status, `ledger-sync ${args.join(" ")} failed: ${r.stderr}`).toBe(0);
  return r.stdout;
}

/** v1's Weir as liveNow reads it, through the operator's own CLI. */
function weir(): Pile[] {
  const out = JSON.parse(cli("live", ...(FIXTURES ? ["--fixtures"] : []), "--json")) as { weir: Pile[] };
  return out.weir.filter((w) => w.pending > 0);
}

/** The Board link of a pile: one encoded segment holding pkt:<source>:<runId>. */
// The packet the live read stamped (articles decide as `article`, the sound shelf as `audio`).
const boardHref = (p: Pick<Pile, "source" | "id" | "packetId">): string => `/board/${encodeURIComponent(p.packetId ?? `pkt:${p.source}:${p.id}`)}`;

test.beforeAll(() => {
  if (!FIXTURES || STORE === undefined) return;
  cli("seed-fixtures");
  cli("sync", "--fixtures", "--store", STORE, "--json");
});

async function openFloor(page: Page, q = ""): Promise<void> {
  await page.goto(`/floor${q}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(page.locator('[data-component="Lane"]')).toHaveCount(4);
  // Hydrated: the keymap binds on mount, so a key pressed before this would be nobody's.
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
}

test("four lanes in the order the digits bind, and each lane's piles are v1's Weir in that medium", async ({ page }) => {
  const live = weir();
  expect(live.length, "the store has no pile waiting anywhere: seed fixtures, or this proves nothing").toBeGreaterThan(0);
  await openFloor(page);
  const order = await page.locator('[data-component="Lane"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-lane")));
  expect(order).toEqual([...LANES]);
  for (const lane of LANES) {
    const want = live.filter((w) => w.media === lane).map(boardHref).sort();
    const drawn = (await page.locator(`[data-component="Lane"][data-lane="${lane}"] [data-component="Pile"]`).evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""))).sort();
    expect(drawn, `${lane} lane piles`).toEqual(want);
  }
});

test("the NEXT pile is the oldest waiting one, ringed on the Floor and named by the header", async ({ page }) => {
  const live = weir();
  const rank = (m: string): number => LANES.indexOf(m as (typeof LANES)[number]);
  const at = (w: Pile): number => (w.since === undefined || !Number.isFinite(Date.parse(w.since)) ? Number.POSITIVE_INFINITY : Date.parse(w.since));
  const oldest = [...live].sort((a, b) => at(a) - at(b) || rank(a.media) - rank(b.media) || a.source.localeCompare(b.source) || a.id.localeCompare(b.id))[0];
  expect(oldest, "no pile waiting").toBeDefined();
  if (oldest === undefined) return;
  await openFloor(page);
  const ringed = page.locator('[data-component="Pile"][data-next]');
  await expect(ringed).toHaveCount(1);
  await expect(ringed).toHaveAttribute("href", boardHref(oldest));
  await expect(page.locator('[data-component="NextButton"]')).toHaveAttribute("href", boardHref(oldest));
});

test("⇧1-4 focuses a lane into the URL and folds the rest; Esc shows all lanes", async ({ page }) => {
  await openFloor(page);
  await page.keyboard.press("Shift+Digit3");
  await expect(page).toHaveURL(/[?&]lane=audio\b/);
  await expect(page.locator('[data-component="Lane"][data-lane="audio"]')).toHaveAttribute("data-state", "focused");
  for (const lane of ["image", "article", "video"]) await expect(page.locator(`[data-component="Lane"][data-lane="${lane}"]`)).toHaveAttribute("data-state", "folded");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/lane=/);
  await expect(page.locator('[data-component="Lane"][data-lane="audio"]')).toHaveAttribute("data-state", "open");
});

test("a link carrying ?lane= opens with that lane focused", async ({ page }) => {
  await openFloor(page, "?lane=video");
  await expect(page.locator('[data-component="Lane"][data-lane="video"]')).toHaveAttribute("data-state", "focused");
});

test("C opens the month over the Floor and Esc closes it back to the rail", async ({ page }) => {
  await openFloor(page);
  await page.keyboard.press("c");
  const month = page.locator('[data-component="MonthCalendar"]');
  await expect(month).toBeVisible();
  await expect(page).toHaveURL(/[?&]cal=1\b/);
  await expect(month.getByRole("grid")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/[?&]day=\d{4}-\d{2}-\d{2}\b/);
  // Esc clears the day first (the month's inner back-out), then closes the month.
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/day=/);
  await page.keyboard.press("Escape");
  await expect(month).toHaveCount(0);
  await expect(page).not.toHaveURL(/cal=/);
});

test("a lane's digit opens its first pile's Board, and ⏎ opens the NEXT one", async ({ page }) => {
  const live = weir();
  const lane = LANES.find((l) => live.some((w) => w.media === l));
  expect(lane, "no lane has a pile").toBeDefined();
  if (lane === undefined) return;
  await openFloor(page);
  const first = await page.locator(`[data-component="Lane"][data-lane="${lane}"] [data-component="Pile"]`).first().getAttribute("href");
  await page.keyboard.press(`Digit${LANES.indexOf(lane) + 1}`);
  await expect(page).toHaveURL(new RegExp(`${(first ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  await openFloor(page);
  const next = await page.locator('[data-component="NextButton"]').getAttribute("href");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${(next ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});
