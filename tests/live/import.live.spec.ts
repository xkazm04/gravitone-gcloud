// LANE - THE LIVE APP: v1's BROWSER PROJECTS INTO THE KERNEL, ONE CLICK (Phase 4 wave D, L42).
//
// What only a browser can show: /projects/import reads THIS origin's v1 IndexedDB (seeded here
// with v1-shaped rows - a film with plates as data: URLs and a frames sign-off, an ad, an empty
// project) through v1's own `exportAccount` and `inspectArchive`, previews what the import would
// create, imports on one confirm, and each imported project opens as a Plan with its recipe's
// parts. A second read skips every project. The re-export (GET /api/import?project=) comes back
// through the second door (a `.gravitone` file) and is read as already imported; a damaged file
// is refused by v1's own reader with v1's code before anything is uploaded.
//
// ITS OWN SERVER (tests/live/produce-real.live.spec.ts's shape): `next dev` on IMPORT_PORT (3218)
// with NEXT_DIST_DIR .next-l42, the kernel store a temp GRAVITONE_STORE_PATH (blobs beside it),
// GRAVITONE_DRY_ONLY=1. Nothing real is read or written.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/import.live.spec.ts
//   IMPORT_SHOTS=<dir> saves the screens it walks (1440 and 390 wide).

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["IMPORT_PORT"] ?? 3218);
const DIST = process.env["IMPORT_DIST"] ?? ".next-l42";
const SHOTS = process.env["IMPORT_SHOTS"];
const BASE = `http://localhost:${PORT}`;

let U = "";
let server: ChildProcess | undefined;

async function answered(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not listening yet
    }
    if (Date.now() > until) throw new Error(`the import server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

test.describe.configure({ mode: "serial" });
test.use({ baseURL: BASE });
test.setTimeout(240_000);

test.beforeAll(async () => {
  test.setTimeout(300_000);
  U = mkdtempSync(path.join(tmpdir(), "gt-import-live-"));
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const v of ["GRAVITONE_STORE_PATH", "GRAVITONE_PRODUCE_SIDE", "NEXT_PUBLIC_GRAVITONE_DATA"]) delete env[v];
  Object.assign(env, { NEXT_PUBLIC_DEV_AUTH: "1", NEXT_DIST_DIR: DIST, GRAVITONE_STORE_PATH: path.join(U, "store.sqlite"), GRAVITONE_DRY_ONLY: "1" });
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  const log = path.join(U, "next-dev.log");
  const keep = (b: Buffer) => {
    if (existsSync(U)) appendFileSync(log, b);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  await answered(`${BASE}/projects/import`, 240_000);
});

test.afterAll(() => {
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/* ── v1's rows, as v1 stores them ──────────────────────────────────────────── */

const UID = "dev-fixture-uid";
const png = (seed: number) => `data:image/png;base64,${Buffer.from([137, 80, 78, 71, seed, seed + 1, 0, 255, 13, 10]).toString("base64")}`;
const T = Date.parse("2026-09-01T10:00:00Z");
const progress = { research: "done", script: "done", frames: "review", motion: "empty", score: "working", cut: "empty" };
const unit = (id: string, at: number, seed: number) => ({ id, kind: "beat", sourceId: "r-glass", beatRef: { at }, startS: at * 5, endS: at * 5 + 5, plate: { state: "ready", src: png(seed), model: "gpt-image-2.5", costUsd: 0.04 }, clip: { status: "not-started", motion: "" }, elements: [], texts: [] });
const ROWS = {
  projects: [
    { id: "p-live-film", uid: UID, title: "Glass harbor", logline: "", template: "short-educational-video", discipline: "educational", themeId: "th-live", targetS: 90, createdAt: T, updatedAt: T, phase: "frames", progress, signedOff: { frames: T + 1000 } },
    { id: "p-live-ad", uid: UID, title: "Rainshell", logline: "", template: "ad-social-15", discipline: "ads", targetS: 15, createdAt: T, updatedAt: T, phase: "research", progress },
    { id: "p-live-empty", uid: UID, title: "Not yet", logline: "", template: "teaser", discipline: "trailer", targetS: 45, createdAt: T, updatedAt: T, phase: "research", progress },
  ],
  steps: [
    { id: "p-live-film:research", projectId: "p-live-film", phase: "research", data: { topic: "glass harbors", researched: true } },
    { id: "p-live-film:frames", projectId: "p-live-film", phase: "frames", data: { v: 2, renderId: "r-glass", units: [unit("u1", 0, 1), unit("u2", 1, 2)], frames: [] } },
    { id: "p-live-film:score", projectId: "p-live-film", phase: "score", data: { spots: [{ id: "s1", title: "open", sceneIds: ["u1"], note: "" }] } },
    { id: "p-live-film:script-mode", projectId: "p-live-film", phase: "script-mode", data: { mode: "expert" } },
    { id: "p-live-ad:ads-brief", projectId: "p-live-ad", phase: "ads-brief", data: { brief: { product: "Rainshell", audience: "", proposition: "", tone: "", mustInclude: [], cta: "", platform: "" } } },
  ],
  themes: [{ id: "th-live", uid: UID, name: "Ledger ink", origin: "scratch", block: { medium: "ink" }, elements: [], proofs: [{ id: "pr-1", label: "first", base64: Buffer.from("proof").toString("base64"), mime: "image/png", state: "approved", createdAt: 1 }], createdAt: T, updatedAt: T }],
};

/** v1's rows into this origin's v1 database (the page opened it at its version, with its stores). */
async function seedBrowser(page: Page): Promise<void> {
  await page.evaluate(async (rows) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("gravitone-studio");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["projects", "steps", "themes"], "readwrite");
      for (const p of rows.projects) tx.objectStore("projects").put(p);
      for (const s of rows.steps) tx.objectStore("steps").put(s);
      for (const t of rows.themes) tx.objectStore("themes").put(t);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, ROWS);
}

const view = (page: Page) => page.locator('[data-component="Import"]');
const row = (page: Page, title: string) => page.locator("li[data-outcome]").filter({ hasText: title });

test("one click: this browser's v1 projects previewed, imported, and opened as Plans", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/projects/import", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(view(page)).toHaveAttribute("data-phase", "preview");
  await expect(page.getByText("no v1 projects in this browser")).toBeVisible();
  await seedBrowser(page);
  await page.getByRole("button", { name: "This browser" }).click();
  await expect(view(page)).toHaveAttribute("data-phase", "preview");
  await expect(page.locator("li[data-outcome=import]")).toHaveCount(3);
  await expect(row(page, "Glass harbor")).toContainText("film/short-educational-video");
  await expect(row(page, "Glass harbor").getByLabel("losses")).toContainText("script-mode");
  await expect(row(page, "Not yet")).toContainText("draft");
  await shot(page, "import-preview-1440");

  await page.getByRole("button", { name: "Import 3" }).click();
  await expect(view(page)).toHaveAttribute("data-phase", "done");
  await expect(page.locator("li[data-outcome=imported]")).toHaveCount(3);
  await shot(page, "import-done-1440");

  await row(page, "Glass harbor").getByRole("link", { name: "Plan" }).click();
  await expect(page).toHaveURL(/\/projects\/v1-p-live-film$/);
  await expect(page.locator("tr[data-part]")).toHaveCount(10);
  await expect(page.locator('tr[data-part="v1-p-live-film/gate:frames"]')).toBeVisible();
  await shot(page, "import-plan-1440");
});

test("a second read skips every project; the re-export comes back through the file door as already imported", async ({ page }) => {
  // A new context is a new browser profile: the same v1 rows, read again into the same kernel.
  await page.goto("/projects/import", { waitUntil: "domcontentloaded" });
  await expect(view(page)).toHaveAttribute("data-phase", "preview");
  await seedBrowser(page);
  await page.getByRole("button", { name: "This browser" }).click();
  await expect(page.locator("li[data-outcome=skip]")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Import 0" })).toHaveAttribute("aria-disabled", "true");

  const exported = await page.request.get("/api/import?project=v1-p-live-film&project=v1-p-live-ad");
  expect(exported.status()).toBe(200);
  expect(exported.headers()["content-type"]).toBe("application/gzip");
  const file = path.join(U, "export.gravitone");
  writeFileSync(file, await exported.body());
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(view(page)).toHaveAttribute("data-phase", "preview");
  await expect(page.locator("li[data-outcome=skip]")).toHaveCount(2);
  await expect(page.getByText("export.gravitone")).toBeVisible();

  const bad = path.join(U, "bad.gravitone");
  writeFileSync(bad, '{"kind":"gravitone-archive","format":1,"dbVersion":5,"exportedAt":1,"from":"x","scope":"account"}\n');
  await page.locator('input[type="file"]').setInputFiles(bad);
  await expect(view(page)).toHaveAttribute("data-phase", "refused");
  await expect(page.getByRole("region", { name: "refused" })).toContainText("truncated");
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "import-refused-390");
  await page.locator('input[type="file"]').setInputFiles(file);
  await expect(page.locator("li[data-outcome=skip]")).toHaveCount(2);
  await shot(page, "import-preview-390");
});
