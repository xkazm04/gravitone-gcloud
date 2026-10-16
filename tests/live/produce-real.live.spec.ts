// LANE - THE REAL PRODUCE PORT, DRIVEN IN A BROWSER, RUN BY THE WORKER (Phase 4 wave B2, L35).
//
// The exit of the produce wiring: what the Floor composers, the Plan and the Runs acts do lands
// in the kernel as Run rows and jobs, the worker (`npm run worker -- --once`) drives what a
// bound producer carries to done - DRY - and the outcome is visible in Runs and the Ledger.
//   · a Floor article launch, through its receipt: one Run row, one dry job; the worker drives
//     it to done; Runs draws it; the Ledger lists its events. Arming the receipt live is refused
//     in this process (GRAVITONE_DRY_ONLY=1), in the server's words, under the receipt;
//   · a plan launch: one job per work part, the first queued, the rest planned behind it; the
//     worker leaves a part whose kind no producer binds yet queued (wave C binds the step
//     producers), never failing it;
//   · the Runs acts against those real jobs: pause and resume (P), later and earlier, a re-route
//     to another lane through its own receipt (the job relaunched on cloud.google), and a crash
//     on the text seat: the lane holds, the retry is refused until the hold is acknowledged (A),
//     then the retry (T) takes the job again.
//
// ITS OWN SERVER, ITS OWN UNIVERSE (tests/live/board-exit.live.spec.ts's shape). The fixture
// universe is seeded into a temp directory and `next dev` runs there: every v1 store resolves
// under it, the kernel store is GRAVITONE_STORE_PATH in it, the article pipeline gets a
// throwaway registry and the stub agent, and every process - the server, the worker, the crash
// seed - is GRAVITONE_DRY_ONLY. Nothing spends and nothing leaves the machine.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/produce-real.live.spec.ts
//   PRODUCE_REAL_PORT (default 3215) and PRODUCE_REAL_DIST (default .next-fixtures, already in
//   tsconfig's include) pick the server; PRODUCE_REAL_SHOTS=<dir> saves the screens it walks.

import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["PRODUCE_REAL_PORT"] ?? 3215);
const DIST = process.env["PRODUCE_REAL_DIST"] ?? ".next-fixtures";
const SHOTS = process.env["PRODUCE_REAL_SHOTS"];
const BASE = `http://localhost:${PORT}`;
const CLI = path.join(ROOT, "pipeline", "ledger-sync.mts");

let U = "";
let server: ChildProcess | undefined;
const STORE = () => path.join(U, "store.sqlite");

/* ── the universe ───────────────────────────────────────────────────────────── */

function articleEnv(): Record<string, string> {
  const reg = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs"), path.join(U, "reg")], { encoding: "utf8" })) as { registry: string };
  const stub = path.join(ROOT, "tests", "fixtures", "articles", "stub-agent.mjs");
  const tmp = path.join(U, "tmp");
  mkdirSync(tmp, { recursive: true });
  return {
    AI_REGISTRY_DIR: reg.registry,
    ARTICLES_STORE_DIR: path.join(U, "fixtures-out", "articles"),
    // A dry job's turns are the product's stand-in; the live bins point at the stub all the same.
    ARTICLES_DRY_AGENT_BIN: `node|${path.join(ROOT, "lib", "articles", "dryStandIn.mjs")}`,
    ARTICLES_AGENT_BIN: `node|${stub}`,
    ARTICLES_CODEX_BIN: `node|${stub}|--as=codex`,
    ARTICLES_AGY_BIN: `node|${stub}|--as=agy`,
    ARTICLES_GH_BIN: `node|${path.join(ROOT, "tests", "fixtures", "articles", "stub-gh.mjs")}`,
    TEMP: tmp,
    TMP: tmp,
    TMPDIR: tmp,
  };
}

let ENV: NodeJS.ProcessEnv = { ...process.env };

function universe(): void {
  U = mkdtempSync(path.join(tmpdir(), "gt-produce-real-"));
  const seedEnv: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR"]) delete seedEnv[v];
  execFileSync(process.execPath, [CLI, "seed-fixtures"], { cwd: U, env: seedEnv, encoding: "utf8" });
  // The strips approach cards and briefs, read only: the video composer's subjects are their cases.
  cpSync(path.join(ROOT, "pipeline", "strips", "approaches.json"), path.join(U, "pipeline", "strips", "approaches.json"));
  cpSync(path.join(ROOT, "pipeline", "strips", "data"), path.join(U, "pipeline", "strips", "data"), { recursive: true });
  ENV = { ...process.env, ...articleEnv() };
  for (const v of ["FOUNDRY_DIR", "SOUND_STORE_DIR", "PUBLISH_STORE_DIR", "CLIP_STORE_DIR", "GPU_LEASE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR", "SOUND_LEDGER_PATH", "GRAVITONE_PRODUCE_SIDE"]) delete ENV[v];
  Object.assign(ENV, {
    NEXT_PUBLIC_GRAVITONE_DATA: "fixtures",
    NEXT_PUBLIC_DEV_AUTH: "1",
    NEXT_DIST_DIR: DIST,
    GRAVITONE_STORE_PATH: STORE(),
    GRAVITONE_DRY_ONLY: "1",
    STRIPS_STORE_DIR: path.join(U, "strips"),
  });
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
    if (Date.now() > until) throw new Error(`the produce server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

test.describe.configure({ mode: "serial" });
test.use({ baseURL: BASE });
test.setTimeout(240_000);

test.beforeAll(async () => {
  test.setTimeout(300_000);
  universe();
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: U, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
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
  // By PID, the tree this spec spawned and nothing else (never by image name).
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

/* ── the store as a file, the worker and the crash as processes ─────────────── */

function q<T>(sql: string, ...args: string[]): T[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as T[];
  } finally {
    db.close();
  }
}
const jobRow = (id: string) => q<{ id: string; lane: string; state: string; record: string }>("SELECT id, lane, state, record FROM jobs WHERE id = ?", id)[0];
const jobsOf = (projectId: string) => q<{ id: string; state: string }>("SELECT id, state FROM jobs WHERE json_extract(record, '$.correlation.projectId') = ? ORDER BY id", projectId);

/**
 * `npm run worker -- --once --json` over the universe: the same process an operator starts, from
 * the checkout (the article engine reads its prompt files from the repo), every store it writes
 * named by the environment - the kernel's, the article runs' - so nothing lands in the checkout.
 */
function worker(lanes: string): { code: number; out: string; err: string } {
  const r = spawnSync(process.execPath, [path.join(ROOT, "workers", "runner.mts"), "--once", "--json", "--lanes", lanes, "--idle-ms", "200"], { cwd: ROOT, env: ENV, encoding: "utf8", timeout: 200_000 });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

/** A drive that dies mid-step on `jobId`, then the recovery sweep: the job interrupted, its paid lane held. */
function crash(jobId: string): string {
  const code = `
    const { openKernel } = await import("@gt/kernel/kernel");
    const { liveEffects } = await import("@gt/kernel/effects");
    const { blobStore } = await import("@gt/kernel/blob");
    const { runJob, recover } = await import("@gt/kernel/job-run");
    const k = openKernel(process.env.STORE, { busyTimeoutMs: 30000 });
    if (!k.ok) throw k.error;
    const fx = liveEffects(k.value.store, blobStore(process.env.STORE + ".blobs"));
    const host = "l35-crash";
    const crash = { lane: "seat.text", plan: (_j, o) => (o.has("a") ? [] : [{ name: "a", estimate: { seconds: 1, usd: 0 } }]), perform: () => Promise.reject("crash") };
    await runJob(fx, crash, process.env.JOB, { holder: { bootId: "dead", pid: 999999, host }, alive: () => true, heartbeatMs: 60000 }).catch((e) => { if (e !== "crash") throw e; });
    const r = recover(fx, { holder: { bootId: "sweep", pid: 1, host }, alive: () => false });
    process.stdout.write(JSON.stringify(r.ok ? r.value.map((j) => j.id) : r.error.message));
    k.value.close();
    process.exit(0);`;
  return execFileSync(process.execPath, ["--input-type=module", "-e", code], { cwd: ROOT, env: { ...ENV, STORE: STORE(), JOB: jobId }, encoding: "utf8" });
}

/* ── the screens ────────────────────────────────────────────────────────────── */

async function open(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await page.waitForLoadState("networkidle");
}
const receipt = (page: Page) => page.locator('[data-component="Receipt"]');
const toast = (page: Page, re: RegExp) => page.getByRole("status").filter({ hasText: re });
const runsJob = (id: string): string => `/projects/runs?job=${encodeURIComponent(`kernel:${id}`)}`;
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS === undefined) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

let articleJob = "";
let film = "";

test("a Floor article launch is one dry job the worker drives to done, in Runs and the Ledger", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/floor");
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
  const form = page.locator('form[data-component="IdeaComposer"][data-lane="article"]');
  await expect(form.locator('[data-component="Estimate"]')).toContainText("$47–92");
  await form.getByRole("textbox", { name: "first sentence" }).fill("Budgets are counted in tokens.");
  await form.getByRole("textbox", { name: "first sentence" }).press("Enter");
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  // Arming it live is the server's to refuse here: this process runs dry only.
  await page.getByRole("button", { name: /arm live/ }).click();
  await expect(page.getByText(/runs dry only \(GRAVITONE_DRY_ONLY=1\)/)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  await shot(page, "floor-receipt-1440");
  await receipt(page).getByRole("button", { name: /Confirm/ }).click();
  await expect(toast(page, /Article · launched · floor-token-budgeting-/)).toBeVisible();

  const runs = q<{ id: string; job_id: string }>("SELECT id, job_id FROM runs");
  expect(runs).toHaveLength(1);
  articleJob = runs[0]?.job_id ?? "";
  expect(jobRow(articleJob)).toMatchObject({ lane: "seat.text", state: "queued" });
  expect(JSON.parse(jobRow(articleJob)?.record ?? "{}")).toMatchObject({ producer: "article", mode: { kind: "dry" } });

  const w = worker("seat.text");
  expect(w.code, `${w.out}\n${w.err}`).toBe(0);
  expect(w.out).toContain(`"jobId":"${articleJob}"`);
  expect(jobRow(articleJob)?.state).toBe("done");
  // Dry: the would-calls were booked and no dollar was.
  expect(q<{ c: number }>("SELECT count(*) AS c FROM events WHERE subject_id = ? AND type = 'dryrun.would-call'", articleJob)[0]?.c ?? 0).toBeGreaterThan(0);

  await open(page, runsJob(articleJob));
  await expect(page.locator(`[data-bar="kernel:${articleJob}"]`)).toBeAttached();
  // Selected from the URL: the inspector names the run by its first sentence, done and dry.
  await expect(page.getByText("Budgets are counted in tokens.").last()).toBeVisible();
  await shot(page, "runs-article-done-1440");
  await page.goto(`/ledger?q=${encodeURIComponent(articleJob)}`, { waitUntil: "domcontentloaded" });
  for (const t of ["job.enqueued", "job.done"]) await expect(page.getByRole("row").filter({ hasText: t }).first()).toBeVisible({ timeout: 20_000 });
});

test("a plan launch is one job per part; the worker leaves a part kind no producer binds queued, not failed", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/projects/runs");
  await expect(page.locator('[data-component="RunsDayline"][data-measured]')).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "compose" })).toBeVisible();
  await page.keyboard.press("1");
  await page.waitForURL(/\/projects\/untitled-film-[a-z0-9]+\?composed=1$/);
  film = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
  await expect(page.locator('[data-component="PlanTable"]')).toBeVisible();
  await page.getByRole("button", { name: /Launch plan/ }).click();
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toHaveAttribute("data-mode", "dry");
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/projects/runs\\?project=${film}$`));
  const mine = jobsOf(film);
  expect(mine.map((j) => j.state).sort()).toEqual(["planned", "planned", "planned", "planned", "planned", "queued"]);
  expect(jobRow(`job:part:${film}/research`)?.state).toBe("queued");
  await expect(page.locator(`[data-bar="kernel:job:part:${film}/frames"]`)).toBeAttached();
  await shot(page, "runs-plan-launched-1440");

  const w = worker("seat.text");
  expect(w.code, `${w.out}\n${w.err}`).toBe(0);
  // --once drains what this worker can start: a head whose producer it does not carry is not that.
  expect(w.err).toContain("[worker] 0 drive(s), 0 recovered as interrupted, 0 failed");
  expect(jobRow(`job:part:${film}/research`)?.state).toBe("queued");
});

test("Runs acts on real jobs: pause and resume, later and earlier, a re-route to another lane through its receipt", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const research = `job:part:${film}/research`;
  await open(page, runsJob(research));
  const acts = page.locator('[data-component="JobActs"]');
  await expect(acts).toBeVisible();
  await page.keyboard.press("p");
  await expect(toast(page, /paused · held at queued/)).toBeVisible();
  await expect.poll(() => jobRow(research)?.state).toBe("paused");
  await expect(acts.getByRole("button", { name: /resume/ })).toBeVisible();
  await page.keyboard.press("p");
  await expect(toast(page, /resumed · back to queued/)).toBeVisible();
  await expect.poll(() => jobRow(research)?.state).toBe("queued");
  await acts.getByRole("button", { name: "later" }).click();
  await expect(toast(page, /behind|end of the lane queue/)).toBeVisible();
  await page.waitForTimeout(500);
  await acts.getByRole("button", { name: "earlier" }).click();
  await expect(toast(page, /ahead of|end of the lane queue/)).toBeVisible();

  const frames = `job:part:${film}/frames`;
  await open(page, runsJob(frames));
  const list = page.locator('[data-component="RerouteList"]');
  await expect(list.getByRole("button").first()).toBeVisible();
  await list.getByRole("button", { name: /re-route to Nano Banana/ }).click();
  await expect(receipt(page)).toBeVisible();
  await expect(receipt(page)).toContainText("google");
  await shot(page, "runs-reroute-receipt-1440");
  await page.keyboard.press("Enter");
  await expect(toast(page, /re-routed/)).toBeVisible();
  await expect.poll(() => jobRow(frames)?.state).toBe("cancelled");
  expect(jobRow(`${frames}~2`)).toMatchObject({ lane: "cloud.google", state: "planned" });
  expect(q<{ job_id: string }>("SELECT job_id FROM parts WHERE part_id = ?", `${film}/frames`)[0]?.job_id).toBe(`${frames}~2`);
});

test("a crash holds the text seat: the retry is refused until the hold is acknowledged, then it takes the job again", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const research = `job:part:${film}/research`;
  expect(JSON.parse(crash(research))).toEqual([research]);
  expect(jobRow(research)?.state).toBe("interrupted");
  await open(page, runsJob(research));
  const hold = page.locator('[data-component="LaneHold"][data-lane="seat.text"]');
  await expect(hold).toBeVisible();
  await expect(hold).toContainText("credits may be spent - look first");
  await shot(page, "runs-hold-1440");
  await page.keyboard.press("t");
  await expect(toast(page, /acknowledge the hold first/)).toBeVisible();
  expect(jobRow(research)?.state).toBe("interrupted");
  await page.keyboard.press("a");
  await expect(toast(page, /seat\.text hold acknowledged/)).toBeVisible();
  await expect(hold).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.keyboard.press("t");
  await expect(toast(page, /retry · attempt 2 · same route/)).toBeVisible();
  await expect.poll(() => jobRow(research)?.state).toBe("queued");
  await page.goto(`/ledger?q=${encodeURIComponent(research)}`, { waitUntil: "domcontentloaded" });
  for (const t of ["job.interrupted", "job.retried"]) await expect(page.getByRole("row").filter({ hasText: t }).first()).toBeVisible({ timeout: 20_000 });
});

test("the receipt sheet at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, `/projects/${encodeURIComponent(film)}`);
  await expect(page.locator('[data-component="PlanTable"]')).toBeVisible();
  await shot(page, "plan-launched-390");
});
