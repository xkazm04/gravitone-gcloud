// LANE - THE LIBRARY ON ITS REAL SIDE, IN A BROWSER (Phase 5 wave B, L53).
//
// The fixture lane (./library.live.spec.ts) holds the screen's rules over an in-memory corpus.
// This one holds the cutover: /library answering from the kernel's `library` index, over a store
// the projection filled from v1's own stores, with the media facts MEASURED by ffprobe/ffmpeg -
// so what it checks are things only the real side can get wrong:
//   · search through FTS5 lands the items whose words match, and a facet's count is its result;
//   · the attention facet holds the exports ffprobe could not decode, each open on the probe's
//     own words; a render ffmpeg measured near-black says its luma;
//   · the detail's lineage resolves against the index (a plate's run is a door to filter by);
//   · Pin is an act: the detail turns, and the kernel's event log holds `library.pinned`.
//
// ITS OWN SERVER, ITS OWN UNIVERSE (./produce-real.live.spec.ts's shape). The fixture universe
// is seeded into a temp directory, a throwaway registry stands in for the real one, and
// `pipeline/library-sync.mts --store <temp> --inline` fills the index and probes the media before
// `next dev` starts there with GRAVITONE_STORE_PATH on that temp store. No process here opens
// foundry-out/gravitone.sqlite, and nothing spends (GRAVITONE_DRY_ONLY).
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/library-real.live.spec.ts
//   LIBRARY_REAL_PORT (default 3235) and LIBRARY_REAL_DIST (default .next-l53) pick the server;
//   LIBRARY_REAL_SHOTS=<dir> saves the screens it walks (1440 and 390 wide).

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["LIBRARY_REAL_PORT"] ?? 3235);
const DIST = process.env["LIBRARY_REAL_DIST"] ?? ".next-l53";
const SHOTS = process.env["LIBRARY_REAL_SHOTS"];
const BASE = `http://localhost:${PORT}`;

let U = "";
let server: ChildProcess | undefined;
let ENV: NodeJS.ProcessEnv = { ...process.env };
const STORE = () => path.join(U, "store.sqlite");

function universe(): void {
  U = mkdtempSync(path.join(tmpdir(), "gt-library-real-"));
  const base: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR", "CLIP_STORE_DIR", "PUBLISH_EXPORTS_DIR", "AD_EXPORT_DIR", "SOUND_LEDGER_PATH", "GRAVITONE_PRODUCE_SIDE"]) delete base[v];
  execFileSync(process.execPath, [path.join(ROOT, "pipeline", "ledger-sync.mts"), "seed-fixtures"], { cwd: U, env: base, encoding: "utf8" });
  const reg = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs"), path.join(U, "reg")], { encoding: "utf8" })) as { registry: string };
  ENV = { ...base, AI_REGISTRY_DIR: reg.registry, GRAVITONE_STORE_PATH: STORE(), GRAVITONE_DRY_ONLY: "1", NEXT_PUBLIC_DEV_AUTH: "1", NEXT_DIST_DIR: DIST };
  // The index and the facts, measured here once: the page's own sync then finds nothing missing.
  execFileSync(process.execPath, [path.join(ROOT, "pipeline", "library-sync.mts"), "--fixtures", "--store", STORE(), "--inline", "--probe-limit", "1000"], { cwd: U, env: ENV, encoding: "utf8" });
}

async function ready(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > until) throw new Error(`the library server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function q<T>(sql: string, ...args: string[]): T[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as T[];
  } finally {
    db.close();
  }
}

/** The kernel's own answer for a query, from a process of its own: what the page must agree with. */
function kernelTotal(query: object): number {
  const code = `
    const { openKernel } = await import("@gt/kernel/kernel");
    const { queryLibrary } = await import("@gt/kernel/library/query");
    const k = openKernel(process.env.STORE);
    if (!k.ok) throw k.error;
    const p = queryLibrary(k.value.store, JSON.parse(process.env.Q));
    if (!p.ok) throw p.error;
    process.stdout.write(String(p.value.total));
    k.value.close();`;
  return Number(execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: ROOT, env: { ...ENV, STORE: STORE(), Q: JSON.stringify(query) }, encoding: "utf8" }));
}

test.describe.configure({ mode: "serial" });
test.use({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
test.setTimeout(240_000);

test.beforeAll(async () => {
  test.setTimeout(420_000);
  universe();
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: U, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  const log = path.join(U, "next-dev.log");
  const keep = (b: Buffer) => {
    if (existsSync(U)) appendFileSync(log, b);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  await ready(`${BASE}/library`, 240_000);
});

test.afterAll(() => {
  // By PID, the tree this spec spawned and nothing else (never by image name).
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

/* ── the screen ─────────────────────────────────────────────────────────────── */

async function open(page: Page, search = ""): Promise<void> {
  await page.goto(`/library${search}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Library"][data-ready="true"]')).toBeVisible({ timeout: 120_000 });
}
const listbox = (page: Page) => page.getByRole("listbox", { name: "Library items" });
const detail = (page: Page) => page.locator("[data-component=LibraryDetail]");
async function total(page: Page): Promise<number> {
  const t = await page.locator("[aria-live=polite]").filter({ hasText: "items" }).first().locator("span[aria-hidden=true]").first().innerText();
  return Number(t.replace(/[^\d]/g, ""));
}
const railRow = (page: Page, group: string, label: string) => page.locator(`#lib-rail [data-group="${group}"] button[aria-pressed]`).filter({ has: page.locator(`span:text-is("${label}")`) }).first();
async function railCount(page: Page, group: string, label: string): Promise<number> {
  return Number((await railRow(page, group, label).locator("span[aria-hidden=true]").last().innerText()).replace(/[^\d]/g, ""));
}
/** Tiles whose picture the blob route actually served (decoded, not a broken image). */
const drawn = (page: Page): Promise<number> =>
  page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>("[role=listbox] [role=option] img")].filter((i) => i.complete && i.naturalWidth > 0).length);

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  await page.waitForLoadState("networkidle");
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

/* ── the journeys ───────────────────────────────────────────────────────────── */

test("the index answers: its total is the store's, a search lands its words, a facet's count is its result", async ({ page }) => {
  const [{ n }] = q<{ n: number }>("SELECT count(*) AS n FROM library_items");
  await open(page);
  expect(await total(page)).toBe(n);
  // The tiles are the blobs the projection ingested, served by /api/blob/<sha>.
  await expect.poll(() => drawn(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await shot(page, "library-real-1440");
  // FTS over titles, meta and facet values: the extract run's key-art sources, and what its set made.
  const k = kernelTotal({ q: "keyart", limit: 0 });
  expect(k).toBeGreaterThan(0);
  expect(k).toBeLessThan(n);
  await page.locator("[data-keyfield=search]").fill("keyart");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=keyart/);
  await expect.poll(() => total(page)).toBe(k);
  // A facet on the takes: the count on the rail is what clicking it yields.
  await open(page, "?kind=audio");
  const first = page.locator('#lib-rail [data-group="mood"] button[aria-pressed="false"]').first();
  const label = await first.locator("span").first().innerText();
  const count = await railCount(page, "mood", label);
  expect(count).toBeGreaterThan(0);
  await first.click();
  await expect(page).toHaveURL(/f=mood:/);
  await expect.poll(() => total(page)).toBe(count);
});

test("the attention facet holds what ffprobe could not decode, each on the probe's own words; a near-black render says its luma", async ({ page }) => {
  const bad = q<{ id: string; error: string }>(
    "SELECT d.id AS id, f.error AS error FROM library_docs d JOIN library_items i ON i.seq = d.seq JOIN media_facts f ON f.sha = d.media_sha WHERE i.attention = 'unreadable' ORDER BY d.id",
  );
  expect(bad.length).toBeGreaterThan(0);
  await open(page);
  expect(await railCount(page, "attention", "unreadable")).toBe(bad.length);
  await railRow(page, "attention", "unreadable").click();
  await expect(page).toHaveURL(/f=attention:unreadable/);
  await expect.poll(() => total(page)).toBe(bad.length);
  await listbox(page).locator("[role=option]").first().click();
  const sel = new URL(page.url()).searchParams.get("sel");
  const words = bad.find((b) => b.id === sel)?.error ?? "";
  expect(words).not.toBe("");
  await expect(detail(page)).toContainText(words.slice(0, 40));
  await expect(detail(page)).toContainText("media unreadable");
  await shot(page, "library-real-unreadable-1440");

  const [dark] = q<{ id: string; luma: number }>(
    "SELECT d.id AS id, f.mean_luma AS luma FROM library_docs d JOIN media_facts f ON f.sha = d.media_sha WHERE f.near_black = 1 AND d.media_mime LIKE 'image/%' ORDER BY d.id LIMIT 1",
  );
  expect(dark).toBeDefined();
  await open(page, `?sel=${encodeURIComponent(dark?.id ?? "")}`);
  await expect(detail(page).getByText(/^luma/)).toContainText(String(dark?.luma));
});

test("the detail resolves lineage against the index, and Pin lands as an event", async ({ page }) => {
  const [plate] = q<{ id: string; run: string }>(
    "SELECT d.id AS id, f.value AS run FROM library_docs d JOIN library_items i ON i.seq = d.seq JOIN library_facets f ON f.item_seq = d.seq AND f.grp = 'run' WHERE i.kind = 'plate' ORDER BY d.id LIMIT 1",
  );
  expect(plate).toBeDefined();
  await open(page, `?kind=plate&sel=${encodeURIComponent(plate?.id ?? "")}`);
  const lineage = detail(page).getByRole("list", { name: "lineage" });
  await expect(lineage).toBeVisible();
  await lineage.getByRole("button", { name: plate?.run ?? "" }).first().click();
  await expect(page).toHaveURL(new RegExp(`f=run:${plate?.run}`));
  await detail(page).getByRole("button", { name: "Pin to collection" }).click();
  await expect(page.locator('[data-world="next"] [role=status][aria-live=polite]')).toContainText("Pinned");
  await expect(detail(page).getByRole("button", { name: "Unpin" })).toBeVisible();
  const ev = q<{ type: string; subject_id: string }>("SELECT type, subject_id FROM events WHERE type LIKE 'library.%' ORDER BY seq");
  expect(ev).toEqual([{ type: "library.pinned", subject_id: plate?.id }]);
  await shot(page, "library-real-detail-1440");
});

test("v1's ?style= handoff opens the style's atelier, and a phone does not scroll sideways", async ({ page }) => {
  // An id the store holds under neither name is passed through: the atelier answers for it.
  await page.goto("/library?style=th-not-imported", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/library\/style\/th-not-imported$/);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const s of ["", "?view=list&kind=audio"]) {
    await open(page, s);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
  await open(page);
  await shot(page, "library-real-390");
});
