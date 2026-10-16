// LANE - THE PHASE 5 EXIT: ADOPTING A STYLE TO LOCKED, DRIVEN END TO END ON THE REAL SIDE (L54).
//
// The fixture lane (./style-atelier.live.spec.ts) holds the atelier's screen rules over an
// in-memory universe. This one holds the exit the plan names - "adopting a style to locked is
// driven end to end" - over the kernel store, so what it checks is what only the real side can
// get wrong:
//   · the style is opened FROM THE LIBRARY (the index projected from the Style table), not by URL;
//   · Adopt runs as a priced job through its receipt: the palette read off a kept forge plate on
//     disk (dry: a stand-in palette that says so), the kept text-lane plates seeded as pending;
//   · Generate proofs runs as a priced job: one line per chosen trial, one plate each, dry;
//   · before coverage the gate holds in its own words, no lock is offered and ⇧L changes nothing;
//   · three trial problems approved and nothing pending, the lock is admitted;
//   · the store agrees: the style row is locked, two `style` jobs ended done and dry.
//
// ITS OWN SERVER, ITS OWN UNIVERSE (./library-real.live.spec.ts's shape). A temp directory holds
// the catalogue (one proven style, its forge ledger, two kept plates on disk) and the kernel store;
// `next dev` runs there with GRAVITONE_STORE_PATH on that store and GRAVITONE_DRY_ONLY=1. No process
// here opens foundry-out/gravitone.sqlite, writes pipeline/foundry/styles.json, or calls a vendor.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/style-exit.live.spec.ts
//   STYLE_EXIT_PORT (default 3236) and STYLE_EXIT_DIST (default .next-fixtures, already in
//   tsconfig's include) pick the server; STYLE_EXIT_SHOTS=<dir> saves the screens (1440 and 390).

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["STYLE_EXIT_PORT"] ?? 3236);
const DIST = process.env["STYLE_EXIT_DIST"] ?? ".next-fixtures";
const SHOTS = process.env["STYLE_EXIT_SHOTS"];
const BASE = `http://localhost:${PORT}`;
const STYLE = "painted-3d";

let U = "";
let server: ChildProcess | undefined;
const STORE = () => path.join(U, "store.sqlite");

/** The kept forge plates adopt reads: two text-lane keeps, each a real picture on disk. */
const KEPT = [
  { run: "2026-08-26-dry-run", scene: "wow-archer", seed: 1, from: "public/presets/paper-relief.jpg" },
  { run: "2026-08-26-sweep-01", scene: "matrix-rooftop", seed: 2, from: "public/presets/data-neon.jpg" },
];

function universe(): NodeJS.ProcessEnv {
  U = mkdtempSync(path.join(tmpdir(), "gt-style-exit-"));
  const out = path.join(U, "fixtures-out");
  const cat = path.join(out, "catalogue");
  mkdirSync(cat, { recursive: true });
  // The catalogue's own entry for the style, verbatim from the repo's export: proven by operator keeps.
  const repo = JSON.parse(readFileSync(path.join(ROOT, "pipeline", "foundry", "styles.json"), "utf8")) as { styles: { id: string }[] };
  const entry = repo.styles.find((s) => s.id === STYLE);
  if (entry === undefined) throw new Error(`pipeline/foundry/styles.json holds no ${STYLE}`);
  writeFileSync(path.join(cat, "styles.json"), JSON.stringify({ styles: [entry] }));
  const rows = KEPT.map((k) => ({ run: k.run, scene: k.scene, style: STYLE, mechanism: "text", seed: k.seed, verdict: "keep", craft: null, style_score: null, has_text: null, at: "2026-08-27T07:13:28.768Z" }));
  writeFileSync(path.join(cat, "ledger.json"), JSON.stringify({ rows }));
  for (const k of KEPT) {
    const dir = path.join(out, "runs", k.run, "scenes", k.scene, "candidates");
    mkdirSync(dir, { recursive: true });
    const plate = path.join(dir, `${STYLE}--text--s${k.seed}.png`);
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(ROOT, k.from), "-vf", "scale=480:-2", plate]);
    writeFileSync(plate.replace(/\.png$/, ".json"), JSON.stringify({ mechanism: { reference: false }, workflow: { "1": { inputs: { unet_name: "flux2-klein-9b" } } } }));
  }
  const base: NodeJS.ProcessEnv = { ...process.env };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "FOUNDRY_RUNS_DIR", "EXTRACT_STORE_DIR", "SOUND_STORE_DIR", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR", "CLIP_STORE_DIR", "PUBLISH_EXPORTS_DIR", "AD_EXPORT_DIR", "SOUND_LEDGER_PATH", "GRAVITONE_PRODUCE_SIDE"]) delete base[v];
  const reg = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs"), path.join(U, "reg")], { encoding: "utf8" })) as { registry: string };
  return { ...base, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures", AI_REGISTRY_DIR: reg.registry, GRAVITONE_STORE_PATH: STORE(), GRAVITONE_DRY_ONLY: "1", NEXT_PUBLIC_DEV_AUTH: "1", NEXT_DIST_DIR: DIST };
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
    if (Date.now() > until) throw new Error(`the style server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

test.describe.configure({ mode: "serial" });
test.use({ baseURL: BASE });
test.setTimeout(300_000);

test.beforeAll(async () => {
  test.setTimeout(300_000);
  const env = universe();
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: U, env, stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  const log = path.join(U, "next-dev.log");
  const keep = (b: Buffer) => {
    if (existsSync(U)) appendFileSync(log, b);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  await ready(`${BASE}/library`, 240_000);
});

/** Whether a process is still there (signal 0 delivers nothing; ESRCH means gone). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ESRCH") return false;
    throw e;
  }
}

test.afterAll(() => {
  // By PID, the tree this spec spawned and nothing else (never by image name).
  const pid = server?.pid;
  if (pid !== undefined) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      } catch (e) {
        // Measured 2026-10-16: taskkill /T exits non-zero when a child of the tree ended between
        // its walk and its kill. The tree is gone all the same; a server still up is the failure.
        if (alive(pid)) throw e;
      }
    } else server?.kill("SIGTERM");
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

/* ── the screens ────────────────────────────────────────────────────────────── */

const atelier = (page: Page) => page.locator('[data-component="Atelier"]');
const gate = (page: Page) => page.locator('[data-component="LockGate"]');
const receipt = (page: Page) => page.locator('[data-component="Receipt"]');
const proof = (page: Page, id: string) => page.locator(`[data-proof="${id}"]`);
const rev = async (page: Page): Promise<number> => Number(await atelier(page).getAttribute("data-rev"));

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  // A screen is looked at once its plates have arrived, not while they are still decoding.
  await page.waitForFunction(() => [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).every((i) => i.complete && i.naturalWidth > 0));
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** Read the receipt an act raised, confirm it with ⏎, and wait for the job's landing. */
async function confirmReceipt(page: Page, lines: RegExp): Promise<void> {
  const before = await rev(page);
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toContainText(lines);
  await page.keyboard.press("Enter");
  await expect(receipt(page)).toBeHidden({ timeout: 60_000 });
  await expect.poll(() => rev(page), { timeout: 60_000 }).toBeGreaterThan(before);
}

function q<T>(sql: string, ...args: string[]): T[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as T[];
  } finally {
    db.close();
  }
}

test("the exit: from the Library, adopt -> generate proofs (dry) -> judge three problems -> lock", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // OPEN IT FROM THE LIBRARY: the style kind, the style's tile, its detail's door to the atelier.
  await page.goto("/library?kind=style", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  const tile = page.locator(`[role="option"][data-id="style:${STYLE}"]`);
  await expect(tile).toBeVisible({ timeout: 60_000 });
  await tile.click();
  await page.getByRole("link", { name: /open style/i }).click();
  await expect(page).toHaveURL(new RegExp(`/library/style/${STYLE}$`));
  await expect(atelier(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(gate(page)).toHaveAttribute("data-status", "proven");
  await shot(page, "exit-1-proven-1440");

  // ADOPT: the palette read is priced (unpriced, with the table's reason) before it runs.
  await page.getByRole("button", { name: "adopt" }).first().click();
  await confirmReceipt(page, /palette readback/);
  await expect(page.locator('[data-component="Palette"] li')).toHaveCount(3);
  await expect(page.locator('[data-component="Palette"]')).toContainText("dry stand-in");
  const seeded = page.locator('[data-proof^="forge:"]');
  await expect(seeded).toHaveCount(2);
  await shot(page, "exit-2-adopted-1440");

  // GENERATE: three trial columns, one priced plate each, rendered dry through the job.
  for (const name of [/the fall/, /the wish list/, /the booking/]) await page.getByRole("button", { name }).first().click();
  await page.keyboard.press("g");
  await confirmReceipt(page, /the fall · quantity[\s\S]*the wish list · inventory[\s\S]*the booking · analogy/);
  const current = page.locator('[data-proof][data-lineage="current"]');
  await expect(current).toHaveCount(3);

  // THE REFUSAL PATH: before coverage the gate holds in its own words; no lock is offered and the
  // key changes nothing (the server refuses the act itself: tests/next-server/style-real.test.ts).
  await expect(gate(page)).toContainText("5 proofs still undecided");
  await expect(page.getByRole("button", { name: /^lock/ })).toHaveCount(0);
  await page.keyboard.press("Shift+L");
  await expect(gate(page)).toHaveAttribute("data-status", "proven");
  await shot(page, "exit-3-held-1440");

  // JUDGE: each rendered plate approved with A; each forge plate rejected with its reason.
  for (const id of await current.evaluateAll((els) => els.map((e) => e.getAttribute("data-proof") ?? ""))) {
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
  }

  // LOCK: the gate holds now; ⇧L locks, and the block becomes prose.
  await expect(gate(page)).toHaveAttribute("data-can-lock", "");
  await page.keyboard.press("Shift+L");
  await expect(gate(page)).toHaveAttribute("data-status", "locked");
  await expect(page.locator('[data-component="StyleSlots"] textarea')).toHaveCount(0);
  await shot(page, "exit-4-locked-1440");

  // THE STORE AGREES: the row is locked, and both acts were jobs that ran dry to done.
  expect(q<{ status: string }>("SELECT status FROM styles WHERE id = ?", STYLE)[0]?.status).toBe("locked");
  const jobs = q<{ state: string; mode: string }>("SELECT state, json_extract(record, '$.mode.kind') AS mode FROM jobs WHERE json_extract(record, '$.producer') = 'style' ORDER BY n");
  expect(jobs).toEqual([
    { state: "done", mode: "dry" },
    { state: "done", mode: "dry" },
  ]);
});

test("the locked style at 390: the look and its sheet, read-only", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/library/style/${STYLE}`, { waitUntil: "domcontentloaded" });
  await expect(atelier(page)).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(gate(page)).toHaveAttribute("data-status", "locked");
  await expect(page.getByRole("button", { name: /^approve/ })).toHaveCount(0);
  await shot(page, "exit-5-locked-390");
});
