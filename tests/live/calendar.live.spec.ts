// LANE - THE LIVE APP: THE CALENDAR ON THE FLOOR (Phase 6, L58; the real side and the schedule
// sheet, L63) - the rail, the month, and a slot's own record as a level over them, on the
// calendar port's FIXTURE side; then (the last describe) the same screens on the REAL side, over
// the kernel's slot store.
//
// What only a browser can see: C opening the month; a channel toggle hiding that channel's
// slots and riding in the URL; a failed slot's sentence verbatim in the rail, in the month and in
// its record, where the publish chain marks the node it broke at; ⏎ on a selected day opening
// that day's first slot; a move and a cancel landing (the record redraws from the port's answer
// and the rail re-reads); Escape walking back out one layer at a time.
//
// THE UNIVERSE. The lane's server runs GRAVITONE_PRODUCE_SIDE=fixture (playwright.live.config.ts),
// so the calendar port answers from app/(studio)/floor/_calendar/fixture.ts: an in-memory table
// seeded on its first read, at that hour. Its ids are fixed (./fixtureData.ts); the times are
// not, so this spec reads a slot's day from the rail (`data-at`) rather than assuming one. Each
// write test acts on its own slot, so the order of tests changes nothing they assert.

import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const FAILED = "sl-chokepoint-quota";
const FAILED_TEXT = "upload: 403 quotaExceeded - The request cannot be completed because you have exceeded your quota.";
const TIKTOK_MISSED = "sl-tariff-tt-missed";

async function openFloor(page: Page, q = ""): Promise<void> {
  await page.goto(`/floor${q}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
}

const rail = (page: Page) => page.locator('[data-component="CalendarColumn"]');
const month = (page: Page) => page.locator('[data-component="MonthCalendar"]');
const level = (page: Page) => page.locator('[data-component="SlotDetail"]');

/** The UTC day a slot publishes on, as the rail stamps it. */
async function dayOf(page: Page, id: string): Promise<string> {
  const at = await rail(page).locator(`[data-slot="${id}"]`).first().getAttribute("data-at");
  expect(at, `${id} is not on the rail`).not.toBeNull();
  return (at ?? "").slice(0, 10);
}

test("C opens the month; a channel toggle hides that channel's slots and rides in the URL", async ({ page }) => {
  await openFloor(page);
  const day = await dayOf(page, TIKTOK_MISSED);
  await openFloor(page, `?cal=1&day=${day}`);
  await expect(month(page)).toBeVisible();
  await expect(month(page).locator(`[data-slot="${TIKTOK_MISSED}"]`)).toBeVisible();
  await month(page).getByRole("group", { name: "channels" }).getByRole("button", { name: /tiktok/ }).click();
  await expect(page).toHaveURL(/[?&]off=tiktok\b/);
  await expect(month(page).locator(`[data-slot="${TIKTOK_MISSED}"]`)).toHaveCount(0);
  await expect(month(page).getByText("The quiet tariff · vertical")).toHaveCount(0);
  // The link carries the view.
  await page.reload();
  await expect(month(page).getByRole("group", { name: "channels" }).getByRole("button", { name: /tiktok/ })).toHaveAttribute("aria-pressed", "false");
  await month(page).getByRole("group", { name: "channels" }).getByRole("button", { name: /tiktok/ }).click();
  await expect(month(page).locator(`[data-slot="${TIKTOK_MISSED}"]`)).toBeVisible();
});

test("a failed slot's sentence is verbatim in the rail, the month and its record, broken at upload", async ({ page }) => {
  await openFloor(page);
  await expect(rail(page).locator(`[data-slot="${FAILED}"]`)).toContainText(FAILED_TEXT);
  const day = await dayOf(page, FAILED);
  await openFloor(page, `?cal=1&day=${day}`);
  await expect(month(page).locator(`[role="gridcell"][data-day="${day}"]`)).toContainText(FAILED_TEXT);
  await month(page).locator(`[data-slot="${FAILED}"]`).click();
  await expect(page).toHaveURL(new RegExp(`[?&]slot=${FAILED}\\b`));
  await expect(level(page)).toContainText(FAILED_TEXT);
  await expect(level(page).getByRole("listitem").filter({ hasText: "upload" })).toContainText("broke");
  await expect(level(page).getByRole("listitem").filter({ hasText: "auth" })).toContainText("done");
});

test("⏎ on a selected day opens its first slot, and Escape walks back out one layer at a time", async ({ page }) => {
  await openFloor(page);
  const day = await dayOf(page, FAILED);
  await openFloor(page, `?cal=1&day=${day}`);
  const first = await month(page).locator('[aria-label="day agenda"] [data-component="SlotRow"]').first().getAttribute("data-slot");
  expect(first).not.toBeNull();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`[?&]slot=${first ?? ""}\\b`));
  await expect(level(page)).toHaveAttribute("data-slot", first ?? "");
  await page.keyboard.press("Escape");
  await expect(level(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/slot=/);
  await expect(month(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/day=/);
  await page.keyboard.press("Escape");
  await expect(month(page)).toHaveCount(0);
});

test("a move lands: the record and the rail show the new hour", async ({ page }) => {
  await openFloor(page, "?slot=sl-bitcoin-yt");
  await expect(level(page)).toBeVisible();
  await level(page).getByRole("button", { name: /^Move/ }).first().click();
  const field = level(page).getByLabel("move to, UTC");
  await expect(field).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const to = new Date(Date.now() + 3 * 86_400_000);
  const value = `${to.toISOString().slice(0, 10)}T14:30`;
  await field.fill(value);
  await level(page).locator("form").getByRole("button", { name: "Move" }).click();
  await expect(level(page)).toContainText("14:30 UTC");
  await expect(rail(page).locator('[data-slot="sl-bitcoin-yt"]')).toHaveAttribute("data-at", `${value}:00.000Z`);
});

test("a cancel lands through its confirm: the slot stays on the rail, struck", async ({ page }) => {
  await openFloor(page, "?slot=sl-harbor-ig");
  await expect(level(page)).toHaveAttribute("data-status", "scheduled");
  await level(page).getByRole("button", { name: /^Cancel slot/ }).click();
  const confirm = page.locator('[data-component="SlotConfirm"]');
  await expect(confirm).toContainText("final · it never publishes");
  await confirm.getByRole("button", { name: /^Cancel slot/ }).click();
  await expect(level(page)).toHaveAttribute("data-status", "cancelled");
  await expect(confirm).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(level(page)).toHaveCount(0);
  // Still on the rail in its day, struck - and no longer counted as next.
  await expect(rail(page).locator('[data-slot="sl-harbor-ig"]')).toHaveAttribute("data-status", "cancelled");
});

test("the schedule sheet opens from the month, warns and refuses in the engine's words, and lands a slot", async ({ page }) => {
  await openFloor(page, "?cal=1&day=2030-01-14");
  await month(page).getByRole("button", { name: "Schedule" }).first().click();
  await expect(page).toHaveURL(/[?&]new=1\b/);
  const sheet = page.locator('[data-component="ScheduleForm"]');
  await expect(sheet.locator('[role="radio"][data-item]').first()).toBeVisible();
  await expect(sheet.getByLabel("publish at, UTC")).toHaveValue("2030-01-14T12:00");
  // An item already on YouTube: warned before the write, refused verbatim after it.
  await sheet.locator('[data-item="video:export:why-bitcoin"]').click();
  await expect(sheet.locator('[data-channel="instagram"]')).toHaveAttribute("aria-disabled", "true");
  await expect(sheet).toContainText("held · Why the Bitcoin price does not rise");
  await sheet.getByRole("button", { name: "Schedule" }).click();
  await expect(sheet).toContainText("video:export:why-bitcoin is already on youtube (slot sl-bitcoin-yt");
  // A free one lands, and the sheet gives way to the slot it made.
  await sheet.locator('[data-item="video:export:river-steps"]').click();
  await sheet.getByLabel("tags, comma separated").fill("rain, documentary");
  await sheet.getByRole("button", { name: "Schedule" }).click();
  await expect(page).toHaveURL(/[?&]slot=sl-new-\d+\b/);
  await expect(level(page)).toContainText("Two hundred days of rain");
  await expect(level(page)).toContainText("#documentary");
});

test("the month says which channel cannot publish, on its toggle and in the agenda", async ({ page }) => {
  await openFloor(page, "?cal=1");
  await expect(month(page).getByRole("group", { name: "channels" }).locator('[data-state="not_wired"]')).toContainText("not wired");
  const ig = month(page).locator('[data-component="ChannelReadiness"] [data-channel="instagram"]');
  await expect(ig).toHaveAttribute("data-state", "not_wired");
  await expect(ig).toContainText("INSTAGRAM_ACCESS_TOKEN · unset");
});

/* ── the real side ──────────────────────────────────────────────────────────
 *
 * ITS OWN SERVER, ITS OWN UNIVERSE (./library-real.live.spec.ts's shape): the fixture universe is
 * seeded into a temp directory (`ledger-sync seed-fixtures` writes v1's publish JSON there,
 * pipeline/fixtures/publish.ts), the Library index is filled from it (`library-sync --inline`),
 * the L57 importer takes the calendar into a temp kernel store (`import/slots.mts --yes`), and
 * `next dev` starts with GRAVITONE_STORE_PATH on that store and the produce side REAL. Nothing
 * here opens foundry-out/gravitone.sqlite, and nothing spends or sends (GRAVITONE_DRY_ONLY, and
 * no channel variable is set). CALENDAR_REAL_PORT (default 3251) and CALENDAR_REAL_DIST (default
 * .next-l63) pick the server; CALENDAR_REAL_SHOTS=<dir> saves the screens at 1440 and 390.
 */
test.describe("on the real side, over the kernel's slot store", () => {
  const ROOT = process.cwd();
  const PORT = Number(process.env["CALENDAR_REAL_PORT"] ?? 3251);
  const DIST = process.env["CALENDAR_REAL_DIST"] ?? ".next-l63";
  const SHOTS = process.env["CALENDAR_REAL_SHOTS"];
  const BASE = `http://localhost:${PORT}`;
  let U = "";
  let server: ChildProcess | undefined;
  const STORE = () => path.join(U, "store.sqlite");

  function q<T>(sql: string, ...args: string[]): T[] {
    const db = new DatabaseSync(STORE(), { readOnly: true });
    try {
      return db.prepare(sql).all(...args) as T[];
    } finally {
      db.close();
    }
  }
  const one = <T>(sql: string, ...args: string[]): T => {
    const [row] = q<T>(sql, ...args);
    expect(row, sql).toBeDefined();
    return row as T;
  };

  async function ready(url: string, ms: number): Promise<void> {
    const until = Date.now() + ms;
    for (;;) {
      try {
        if ((await fetch(url)).status < 500) return;
      } catch {
        // not listening yet
      }
      if (Date.now() > until) throw new Error(`the calendar server never answered ${url}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  async function shot(page: Page, name: string): Promise<void> {
    if (SHOTS === undefined) return;
    mkdirSync(SHOTS, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`), fullPage: false });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  test.describe.configure({ mode: "serial" });
  test.use({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  test.setTimeout(240_000);

  test.beforeAll(async () => {
    test.setTimeout(600_000);
    U = mkdtempSync(path.join(tmpdir(), "gt-calendar-real-"));
    const base: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
    for (const v of ["GRAVITONE_STORE_PATH", "GRAVITONE_PRODUCE_SIDE", "FOUNDRY_DIR", "SOUND_STORE_DIR", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR", "CLIP_STORE_DIR", "PUBLISH_STORE_DIR", "PUBLISH_EXPORTS_DIR", "AD_EXPORT_DIR", "SOUND_LEDGER_PATH", "PUBLISH_MODE", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "TIKTOK_ACCESS_TOKEN", "INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_USER_ID"]) delete base[v];
    const run = (script: string[], e: NodeJS.ProcessEnv): string => execFileSync(process.execPath, script, { cwd: U, env: e, encoding: "utf8", timeout: 300_000 });
    // A throwaway registry stands in for the real one, which the Library's registry feed reads.
    const reg = (JSON.parse(run([path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs"), path.join(U, "reg")], base)) as { registry: string }).registry;
    const env: NodeJS.ProcessEnv = { ...base, AI_REGISTRY_DIR: reg, GRAVITONE_STORE_PATH: STORE(), GRAVITONE_DRY_ONLY: "1", NEXT_PUBLIC_DEV_AUTH: "1", NEXT_DIST_DIR: DIST };
    run([path.join(ROOT, "pipeline", "ledger-sync.mts"), "seed-fixtures"], base);
    run([path.join(ROOT, "pipeline", "library-sync.mts"), "--fixtures", "--store", STORE(), "--inline", "--probe-limit", "1000"], env);
    // The importer exits 1 when it refuses a row, and v1's fixture holds re-cuts of one export on
    // one channel that the slot store's one-holder rule refuses (reported to the Director, L57's
    // importer); what this lane needs is that it imported the calendar it could.
    const imp = spawnSync(process.execPath, [path.join(ROOT, "pipeline", "import", "slots.mts"), "--yes", "--store", STORE(), "--json"], { cwd: U, env, encoding: "utf8", timeout: 300_000 });
    const imported = (JSON.parse(imp.stdout) as { outcomes: { outcome: string }[] }).outcomes.filter((o) => o.outcome === "imported").length;
    expect(imported, imp.stderr).toBeGreaterThan(0);
    const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: U, env, stdio: ["ignore", "pipe", "pipe"] });
    server = child;
    const log = path.join(U, "next-dev.log");
    const keep = (b: Buffer): void => {
      if (existsSync(U)) appendFileSync(log, b);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    await ready(`${BASE}/floor`, 300_000);
  });

  test.afterAll(() => {
    // By PID, the tree this describe spawned and nothing else (never by image name).
    if (server?.pid !== undefined) {
      if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      else server.kill("SIGTERM");
    }
    if (U !== "") rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  });

  test("the rail and the month are the store's slots; a failed slot's record carries its sentence", async ({ page }) => {
    const failed = one<{ id: string; error: string }>("SELECT id, json_extract(record, '$.error') AS error FROM slots WHERE state = 'failed' ORDER BY at DESC LIMIT 1");
    await openFloor(page);
    await expect(rail(page).locator(`[data-slot="${failed.id}"]`)).toContainText(failed.error);
    await shot(page, "calendar-real-rail");
    await openFloor(page, `?cal=1&slot=${encodeURIComponent(failed.id)}`);
    await expect(level(page)).toHaveAttribute("data-status", "failed");
    await expect(level(page)).toContainText(failed.error);
    await shot(page, "calendar-real-slot");
  });

  test("the month's agenda says a channel is not wired, by its variables' names", async ({ page }) => {
    await openFloor(page, "?cal=1");
    const tt = month(page).locator('[data-component="ChannelReadiness"] [data-channel="tiktok"]');
    await expect(tt).toHaveAttribute("data-state", "not_wired");
    await expect(tt).toContainText("TIKTOK_ACCESS_TOKEN · unset");
    await expect(month(page)).toContainText("dry run");
    await shot(page, "calendar-real-month");
  });

  test("a move lands as a kernel event at the new hour", async ({ page }) => {
    const s = one<{ id: string }>("SELECT id FROM slots WHERE state = 'scheduled' AND channel = 'youtube' AND at > ? ORDER BY at LIMIT 1", new Date().toISOString());
    const before = one<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'slot.schedule' AND subject_id = ?", s.id).n;
    await openFloor(page, `?slot=${encodeURIComponent(s.id)}`);
    await level(page).getByRole("button", { name: /^Move/ }).first().click();
    const to = new Date(Date.now() + 5 * 86_400_000);
    const value = `${to.toISOString().slice(0, 10)}T15:45`;
    await level(page).getByLabel("move to, UTC").fill(value);
    await level(page).locator("form").getByRole("button", { name: "Move" }).click();
    await expect(level(page)).toContainText("15:45 UTC");
    expect(one<{ at: string }>("SELECT at FROM slots WHERE id = ?", s.id).at).toBe(`${value}:00.000Z`);
    expect(one<{ n: number }>("SELECT count(*) AS n FROM events WHERE type = 'slot.schedule' AND subject_id = ?", s.id).n).toBe(before + 1);
  });

  test("a cancel keeps a failed slot's sentence, in the record and in the store", async ({ page }) => {
    const failed = one<{ id: string; error: string }>("SELECT id, json_extract(record, '$.error') AS error FROM slots WHERE state = 'failed' ORDER BY at LIMIT 1");
    await openFloor(page, `?slot=${encodeURIComponent(failed.id)}`);
    await level(page).getByRole("button", { name: /^Cancel slot/ }).click();
    await page.locator('[data-component="SlotConfirm"]').getByRole("button", { name: /^Cancel slot/ }).click();
    await expect(level(page)).toHaveAttribute("data-status", "cancelled");
    await expect(level(page)).toContainText(failed.error);
    const row = one<{ state: string; error: string }>("SELECT state, json_extract(record, '$.error') AS error FROM slots WHERE id = ?", failed.id);
    expect([row.state, row.error]).toEqual(["cancelled", failed.error]);
  });

  test("an export is put back on the calendar: refused while a slot holds it, landed once that slot is cancelled", async ({ page }) => {
    // Every fixture export already holds YouTube (the one channel wired here, dry), so the journey
    // is the operator's own: the engine refuses a second slot, the held one is cancelled, then it lands.
    const s = one<{ id: string; item: string }>("SELECT id, item FROM slots WHERE state = 'scheduled' AND channel = 'youtube' AND at > ? ORDER BY at DESC LIMIT 1", new Date().toISOString());
    const item = s.item;
    await openFloor(page, `?cal=1&new=1&item=${encodeURIComponent(item)}`);
    const sheet = page.locator('[data-component="ScheduleForm"]');
    await expect(sheet.locator(`[data-item="${item}"]`)).toHaveAttribute("aria-checked", "true");
    await expect(sheet).toContainText("held · ");
    await sheet.getByRole("button", { name: "Schedule" }).click();
    await expect(sheet).toContainText(`${item} is already on youtube (slot ${s.id}`);
    await shot(page, "calendar-real-schedule");
    await openFloor(page, `?slot=${encodeURIComponent(s.id)}`);
    await level(page).getByRole("button", { name: /^Cancel slot/ }).click();
    await page.locator('[data-component="SlotConfirm"]').getByRole("button", { name: /^Cancel slot/ }).click();
    await expect(level(page)).toHaveAttribute("data-status", "cancelled");
    await openFloor(page, `?cal=1&new=1&item=${encodeURIComponent(item)}`);
    await expect(sheet.locator(`[data-item="${item}"]`)).toHaveAttribute("aria-checked", "true");
    await sheet.getByRole("button", { name: "Schedule" }).click();
    await expect(page).toHaveURL(/[?&]slot=sl-[0-9a-f]{8}\b/);
    const id = new URL(page.url()).searchParams.get("slot") ?? "";
    const made = one<{ item: string; channel: string; state: string }>("SELECT item, channel, state FROM slots WHERE id = ?", id);
    expect(made).toEqual({ item, channel: "youtube", state: "scheduled" });
    expect(one<{ actor: string }>("SELECT actor_kind AS actor FROM events WHERE type = 'slot.create' AND subject_id = ?", id).actor).toBe("operator");
  });
});
