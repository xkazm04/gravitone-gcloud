// LANE - THE LIVE APP: /ledger OVER A REAL KERNEL STORE (Phase 2, lot 16).
//
// WHY THIS RUNG. The Ledger's numbers are computed on the server and its acts happen in a
// browser: that a facet's count on screen is the kernel's own count, that a filter survives
// a reload because it lives in the URL, that ⏎ on a row lands on a page that renders, that
// "Copy JSONL" puts the rows on the clipboard, and that the keys drive it - each exists only
// in the running page. The pure rules are one rung down (tests/next-server/ledger-*.test.ts,
// packages/ui/test/components/ledger.test.ts).
//
// THE STORE. Run it over a seeded fixture store:
//
//   npm run fixtures
//   GRAVITONE_STORE_PATH=<tmp>/ledger.sqlite NEXT_PUBLIC_GRAVITONE_DATA=fixtures \
//     npx playwright test -c playwright.live.config.ts tests/live/ledger.live.spec.ts
//
// The lane's server inherits both variables, so the page and this spec read one file; when
// they point at the fixture universe the spec seeds it first with the operator's own CLI
// (`pipeline/ledger-sync.mts sync --fixtures`). Without them it reads the store the app
// would open and seeds nothing - every comparison below is page-against-store, so it holds
// on any ledger with a few dozen acts, and the floor assertions say so when it is too thin.
// @gt/* is imported dynamically: a static import broke neighbouring probes' loading (WAVE-A).

import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const FIXTURES = process.env["NEXT_PUBLIC_GRAVITONE_DATA"] === "fixtures";
const STORE = process.env["GRAVITONE_STORE_PATH"] ?? join(ROOT, FIXTURES ? "fixtures-out" : "foundry-out", "gravitone.sqlite");

type Counts = { total: number; head: number; facets: { facet: string; values: { value: string; n: number }[] }[] };

async function counts(q: Record<string, unknown>): Promise<Counts> {
  const { openKernel } = await import("@gt/kernel/kernel");
  const { countEvents } = await import("@gt/kernel/events-count");
  const k = openKernel(STORE);
  if (!k.ok) throw k.error;
  try {
    const c = countEvents(k.value.store, q);
    if (!c.ok) throw c.error;
    return { total: c.value.total, head: c.value.head, facets: c.value.facets.map((f) => ({ facet: f.facet, values: [...f.values] })) };
  } finally {
    k.value.close();
  }
}

const facet = (c: Counts, name: string): Record<string, number> => Object.fromEntries((c.facets.find((f) => f.facet === name)?.values ?? []).map((v) => [v.value, v.n]));

// The design is drawn at 1920 and keeps its three columns down to 1360; below 1280 the rail
// is a drawer (the last test). Desktop Chrome's 1280 would start every test in the drawer.
test.use({ viewport: { width: 1600, height: 900 } });

test.beforeAll(() => {
  if (!FIXTURES || process.env["GRAVITONE_STORE_PATH"] === undefined) return;
  const r = spawnSync(process.execPath, [join(ROOT, "pipeline", "ledger-sync.mts"), "sync", "--fixtures", "--store", STORE, "--json"], { cwd: ROOT, encoding: "utf8", timeout: 120_000 });
  expect(r.status, `ledger-sync --fixtures failed: ${r.stderr}`).toBe(0);
});

async function open(page: Page, search = ""): Promise<void> {
  await page.goto(`/ledger${search}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(page.locator('[data-component="Ledger"][data-ready="true"]')).toBeVisible();
}

/** The toolbar's `shown/head` stamp, as numbers. */
async function tally(page: Page): Promise<[number, number]> {
  const text = await page.getByRole("toolbar", { name: "ledger filters" }).locator("span[aria-live=polite]").first().innerText();
  const m = /(\d+)\+?\/(\d+)/.exec(text);
  if (m === null) throw new Error(`no tally in "${text}"`);
  return [Number(m[1]), Number(m[2])];
}

/** One facet row's count, read off the rail. */
async function railCount(page: Page, label: string): Promise<number> {
  const row = page.locator("#lg-facets button[aria-pressed]").filter({ has: page.locator(`span:text-is("${label}")`) }).first();
  return Number((await row.locator("span[aria-hidden=true]").first().innerText()).trim());
}

test("the toolbar, the actor filter and the type rail show the kernel's own counts", async ({ page }) => {
  await open(page);
  const all = await counts({});
  expect(all.total, "the store holds too few acts for this lane to mean anything").toBeGreaterThan(20);
  const [shown, head] = await tally(page);
  expect(shown).toBe(all.total);
  expect(head).toBe(all.head);
  const kinds = facet(all, "actorKind");
  for (const [kind, label] of [["operator", "Operator"], ["agent", "Agent"], ["machine", "Machine"]] as const) {
    const b = page.getByRole("group", { name: "actor" }).getByRole("button", { name: new RegExp(`^${label}`) });
    await expect(b).toContainText(String(kinds[kind] ?? 0));
  }
  const groups = facet(all, "typeGroup");
  expect(Object.keys(groups).length).toBeGreaterThan(1);
  for (const [g, n] of Object.entries(groups)) expect(await railCount(page, g), `type group ${g}`).toBe(n);
});

test("a filter lives in the URL: it survives a reload, and its counts are the kernel's", async ({ page }) => {
  await open(page);
  await page.locator("#lg-facets button[aria-pressed]").filter({ has: page.locator('span:text-is("run")') }).first().click();
  await expect(page).toHaveURL(/[?&]type=run(&|$)/);
  await page.getByRole("group", { name: "actor" }).getByRole("button", { name: /^Machine/ }).click();
  await expect(page).toHaveURL(/actor=machine/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Ledger"][data-ready="true"]')).toBeVisible();
  await expect(page.locator("#lg-facets button[aria-pressed=true]").filter({ has: page.locator('span:text-is("run")') })).toHaveCount(1);
  await expect(page.getByRole("group", { name: "actor" }).getByRole("button", { name: /^Machine/ })).toHaveAttribute("aria-pressed", "true");
  const c = await counts({ type: ["run.*"], actor: { kind: ["machine"] } });
  expect((await tally(page))[0]).toBe(c.total);
  // Every row the page draws satisfies the filter.
  const types = await page.locator("[data-seq] [role=gridcell]:nth-child(4)").allInnerTexts();
  expect(types.length).toBeGreaterThan(0);
  expect(types.every((t) => t.startsWith("run."))).toBe(true);
});

test("the search field: / focuses it, ⏎ applies a token query, Esc clears it", async ({ page }) => {
  await open(page);
  await page.keyboard.press("/");
  await expect(page.locator("[data-keyfield=search]")).toBeFocused();
  await page.keyboard.type("type:run.start");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=type:run\.start/);
  const c = await counts({ type: ["run.start"] });
  await expect.poll(async () => (await tally(page))[0]).toBe(c.total);
  await page.locator("[data-keyfield=search]").focus();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/q=/);
});

test("J and K move the selection, which the URL remembers; V switches to JSON Lines", async ({ page }) => {
  await open(page);
  const seqs = (await page.locator("[data-seq]").evaluateAll((els) => els.slice(0, 3).map((e) => e.getAttribute("data-seq") ?? ""))).map(Number);
  expect(seqs.length).toBe(3);
  await expect(page.locator(`[data-seq="${seqs[0]}"]`)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(page.locator(`[data-seq="${seqs[2]}"]`)).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(new RegExp(`ev=${seqs[2]}`));
  await page.keyboard.press("k");
  await expect(page).toHaveURL(new RegExp(`ev=${seqs[1]}`));
  await page.keyboard.press("v");
  await expect(page).toHaveURL(/view=jsonl/);
  await expect(page.getByRole("button", { name: "Copy JSONL" })).toBeVisible();
});

test("Copy JSONL puts exactly the listed rows on the clipboard, and the agents' route answers the same rows", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "?view=jsonl&type=verdict");
  const lines = await page.locator("[role=grid] [role=row]").count();
  expect(lines).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Copy JSONL" }).click();
  await expect(page.locator('[data-world="next"] [role=status][aria-live=polite]')).toContainText("lines copied");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const copied = clip.split("\n").map((l) => (JSON.parse(l) as { seq: number; type: string }));
  expect(copied.every((e) => e.type.startsWith("verdict."))).toBe(true);
  const res = await page.request.get("/api/ledger?type=verdict&format=jsonl");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/x-ndjson");
  const served = (await res.text()).trim().split("\n").map((l) => (JSON.parse(l) as { seq: number }).seq);
  expect(served.slice(0, copied.length)).toEqual(copied.map((e) => e.seq).slice(0, served.length));
});

test("⏎ on a row opens its record on a page that renders, and every subject link on the page renders", async ({ page }) => {
  await open(page);
  const hrefs = [...new Set(await page.locator("[data-seq] a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? "")))];
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const r = await page.request.get(href);
    expect(r.status(), `subject link ${href}`).toBeLessThan(400);
  }
  // The selected row is the first; ⏎ with the list focused opens its subject.
  const first = await page.locator('[data-seq][aria-selected="true"] a[href]').getAttribute("href");
  if (first === null) throw new Error("the selected row has no subject link");
  await page.locator("[role=grid][aria-label=events]").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => `${u.pathname}${u.search}` === first);
  await expect(page.locator("body")).not.toContainText("This page could not be found");
});

test("below 1280px the rail is a drawer the facets toggle opens, and Esc closes", async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await open(page);
  const rail = page.locator("#lg-facets");
  const toggle = page.getByRole("button", { name: /^facets/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(rail.locator("button[aria-pressed]").first()).toBeInViewport();
  await page.locator("[role=grid][aria-label=events]").focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("an act appended to the store arrives on the open page without a reload", async ({ page }) => {
  // Writes one event, so only on the seeded temp store - never on a store the app owns.
  test.skip(!FIXTURES || process.env["GRAVITONE_STORE_PATH"] === undefined, "writes an event: needs GRAVITONE_STORE_PATH on a seeded fixture store");
  await open(page);
  await page.waitForTimeout(2_500); // the stream opens 1.5 s after mount (feed.ts SETTLE_MS)
  const { openKernel } = await import("@gt/kernel/kernel");
  const { append } = await import("@gt/kernel/events");
  const k = openKernel(STORE);
  if (!k.ok) throw k.error;
  const id = `live-${Date.now()}`;
  const r = k.value.store.tx((t) =>
    append(t, { actor: { kind: "operator", id: "operator" }, type: "verdict.keep", subject: { kind: "run", id }, data: { src: "fixture" }, key: `probe:${id}:arrival`, occurredAt: new Date().toISOString(), atSrc: "recorded" }),
  );
  k.value.close();
  if (!r.ok) throw r.error;
  const row = page.locator(`[data-seq="${r.value.seq}"]`);
  await expect(row).toBeVisible({ timeout: 10_000 });
  await expect(row).toContainText(id);
});
