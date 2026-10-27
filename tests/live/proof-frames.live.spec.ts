// LANE - THE BOARD'S PROOF SOURCE AND FRAMES ON THE PROJECT'S STYLE (Phase 5, L56), on the REAL
// side, in a browser.
//   · a style's pending proofs are a pile on the Floor; the Board opens it as a cull, the operator
//     approves there, the preview names what the ratchet does, the commit's apply lands each
//     verdict as the atelier's `judge-proof` op on the Style table - and the atelier reads them
//     approved;
//   · a frames act's receipt names the project's style and how many approved proofs ride along as
//     references (four, after the Board's approvals), and its dry job lands the plate.
//
// ITS OWN SERVER, ITS OWN UNIVERSE (board-exit.live.spec.ts's shape): `next dev` runs from a temp
// directory with the kernel store, the blob store and every v1 root under it, the part and board
// ports on their REAL sides, GRAVITONE_DRY_ONLY. The store is seeded by tests/live/_proofSeed.mts
// through the importer's own door. Nothing reaches foundry-out/gravitone.sqlite and nothing calls
// a vendor.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/proof-frames.live.spec.ts
//   PROOF_FRAMES_PORT (default 3238) and PROOF_FRAMES_DIST (default .next-l56) pick the server;
//   PROOF_FRAMES_SHOTS=<dir> saves the screens it walks (1440 and 390).

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["PROOF_FRAMES_PORT"] ?? 3238);
const DIST = process.env["PROOF_FRAMES_DIST"] ?? ".next-l56";
const SHOTS = process.env["PROOF_FRAMES_SHOTS"];
const BASE = `http://localhost:${PORT}`;
const STYLE = "v1-theme:th-live";
const PROJECT = "proof-frames";
const PILE = `pkt:proof:${STYLE}`;

let U = "";
let server: ChildProcess | undefined;
const STORE = () => path.join(U, "store.sqlite");

async function ready(url: string, ms: number): Promise<void> {
  const until = Date.now() + ms;
  for (;;) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch (e) {
      void e; // not listening yet
    }
    if (Date.now() > until) throw new Error(`the server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

test.describe.configure({ mode: "serial" });
test.use({ baseURL: BASE });
test.setTimeout(180_000);

test.beforeAll(async () => {
  test.setTimeout(300_000);
  U = mkdtempSync(path.join(tmpdir(), "gt-proof-frames-"));
  execFileSync(process.execPath, [path.join(ROOT, "tests", "live", "_proofSeed.mts"), STORE()], { cwd: ROOT, encoding: "utf8" });
  // The catalogue directory exists in a checkout (pipeline/foundry); here it is the universe's.
  mkdirSync(path.join(U, "catalogue"), { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const v of ["FOUNDRY_DIR", "SOUND_STORE_DIR", "PUBLISH_STORE_DIR", "CLIP_STORE_DIR", "GPU_LEASE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR", "SOUND_LEDGER_PATH", "GRAVITONE_PRODUCE_SIDE"]) delete env[v];
  Object.assign(env, {
    NEXT_PUBLIC_GRAVITONE_DATA: "fixtures",
    NEXT_PUBLIC_DEV_AUTH: "1",
    NEXT_DIST_DIR: DIST,
    GRAVITONE_STORE_PATH: STORE(),
    // styles.json is re-exported after the Board's apply: into the temp universe, never the repo.
    FOUNDRY_DIR: path.join(U, "catalogue"),
    GRAVITONE_DRY_ONLY: "1",
  });
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: U, env, stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  const log = path.join(U, "next-dev.log");
  const keep = (b: Buffer) => {
    if (existsSync(U)) appendFileSync(log, b);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  await ready(`${BASE}/floor`, 240_000);
});

test.afterAll(() => {
  if (server?.pid !== undefined) {
    // taskkill exits non-zero when the tree is already gone; teardown is not the test.
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } catch {
        /* already exited */
      }
    } else server.kill("SIGTERM");
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

/* ── the store, read as a file ─────────────────────────────────────────────── */

function q<T>(sql: string, ...args: (string | number)[]): T[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as T[];
  } finally {
    db.close();
  }
}
const proofStates = (): Record<string, string> => {
  const rec = q<{ record: string }>("SELECT record FROM styles WHERE id = ?", STYLE)[0]?.record ?? "{}";
  const s = JSON.parse(rec) as { proofs?: { id: string; state: string }[] };
  return Object.fromEntries((s.proofs ?? []).map((p) => [p.id, p.state]));
};
const applyOf = (id: string) => q<{ state: string; last_error: string | null }>("SELECT state, last_error FROM packet_applies WHERE packet_id = ?", id)[0];

const tiles = (page: Page) => page.locator("[data-tile]");
const consequence = (page: Page) => page.locator('[data-component="ConsequencePanel"]');
const receipt = (page: Page) => page.locator('[data-component="Receipt"]');
const landed = (page: Page) => page.waitForTimeout(700).then(() => page.waitForLoadState("networkidle"));

async function shoot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`), fullPage: false });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("a pending proof on the Board, approved there, reads approved in the atelier", async ({ page }) => {
  // The Floor draws the style's pending proofs as a pile, linked to its bare packet.
  await page.goto("/floor", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
  const link = page.locator(`a[data-component="Pile"][href="/board/${encodeURIComponent(PILE)}"]`);
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.locator("[data-desk-main]")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const id = decodeURIComponent(new URL(page.url()).pathname.slice("/board/".length));
  expect(id.startsWith(`${PILE}/`)).toBe(true);
  await shoot(page, "board-proof");

  // Approve every proof on the pile, then preview: the ratchet's consequence is named.
  const n = await tiles(page).count();
  expect(n).toBe(3);
  for (let i = 0; i < n; i++) {
    await tiles(page).nth(i).click();
    await page.keyboard.press("1");
  }
  await landed(page);
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toBeVisible();
  await expect(consequence(page)).toContainText("Live Ink · lock gate");
  await expect(consequence(page)).toContainText("would admit a lock (4 problems covered)");
  await shoot(page, "board-proof-consequence");
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toHaveCount(0, { timeout: 30_000 });

  // The apply lands each verdict as a judge-proof op on the Style table.
  await expect.poll(() => applyOf(id)?.state, { timeout: 30_000, message: JSON.stringify(applyOf(id)) }).toBe("applied");
  expect(proofStates()).toMatchObject({ a1: "approved", p1: "approved", p2: "approved", p3: "approved" });
  expect(q<{ kind: string }>("SELECT kind FROM style_ops WHERE style_id = ? ORDER BY rev", STYLE).map((r) => r.kind)).toEqual(["import-theme", "judge-proof", "judge-proof", "judge-proof"]);

  // The atelier reads the same record.
  await page.goto(`/library/style/${encodeURIComponent(STYLE)}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Atelier"]')).toBeVisible();
  for (const p of ["p1", "p2", "p3"]) await expect(page.locator(`[data-proof="${p}"]`)).toHaveAttribute("data-state", "approved");
  await shoot(page, "atelier-approved");
});

test("a frames job's receipt names the project's style and its reference count; the dry job lands the plate", async ({ page }) => {
  await page.goto(`/projects/${PROJECT}/frames`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="PartWorkspace"]')).toBeVisible();
  await page.waitForLoadState("networkidle");
  await shoot(page, "frames-style");
  await page.getByRole("listbox", { name: "units" }).focus();
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  await expect(receipt(page)).toContainText("style Live Ink · 4 refs");
  await shoot(page, "frames-receipt");
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toHaveCount(0);
  await expect
    .poll(() => q<{ state: string }>("SELECT state FROM jobs WHERE id LIKE ? ORDER BY n DESC LIMIT 1", `job:part:${PROJECT}/frames:render-plate:%`)[0]?.state, { timeout: 30_000 })
    .toBe("done");
});
