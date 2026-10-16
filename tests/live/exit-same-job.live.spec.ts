// LANE - THE PHASE 4 EXIT: EACH PRODUCER STARTED FROM THE UI AND FROM ITS CLI ON THE SAME JOB (L44).
//
// The plan's exit criterion (docs/next/migration-plan.md §6, Phase 4): "each producer can be started
// from the UI and from its CLI on the same job". Every producer lot proved its own half in process
// (tests/next-server/producer-*-entry/-mv/-suno/-article: the route handler and the CLI's verbs over
// one store). This lane proves it ASSEMBLED, across real processes over one store file:
//   · UI -> CLI: a launch through the running server's port (the route the screen calls, or the
//     screen itself) and the producer's CLI `status --json`, a separate process, names THAT job id;
//   · CLI -> UI: the CLI launches with `--detach`, and Runs - the screen, in a browser - draws the
//     job it enqueued;
//   · the worker: `node workers/runner.mts --once` (and `python pipeline/foundry/worker.py --once`
//     for forge and Dojo's card stack) drives both jobs to done.
// Everything dry: GRAVITONE_DRY_ONLY=1 on the server, every CLI and every worker; each store in a
// temp universe; nothing spends and nothing leaves the machine.
//
// ITS OWN SERVER (produce-real.live.spec.ts's shape): `next dev` on EXIT_PORT (3220) with
// NEXT_DIST_DIR=.next-l44, cwd in the universe, every store the producers write named by an
// environment variable both the server and the CLIs read, so the two sides cannot resolve two
// different files.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/exit-same-job.live.spec.ts

import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["EXIT_PORT"] ?? 3220);
const DIST = process.env["EXIT_DIST"] ?? ".next-l44";
const BASE = `http://localhost:${PORT}`;
const SECRET = "l44-exit-secret";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

let U = "";
let server: ChildProcess | undefined;
let ENV: NodeJS.ProcessEnv = { ...process.env };
const STORE = () => path.join(U, "store.sqlite");

/* ── the universe ───────────────────────────────────────────────────────────── */

function universe(): void {
  U = mkdtempSync(path.join(tmpdir(), "gt-l44-exit-"));
  const reg = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs"), path.join(U, "reg")], { encoding: "utf8" })) as { registry: string };
  const stub = path.join(ROOT, "tests", "fixtures", "articles", "stub-agent.mjs");
  const tmp = path.join(U, "tmp");
  for (const d of [tmp, path.join(U, "pipeline", "strips"), path.join(U, "foundry-out", "runs"), path.join(U, "foundry-out", "training"), path.join(U, "frames"), path.join(U, "catalogue")]) mkdirSync(d, { recursive: true });
  // The strips approach cards and briefs, read only, for a server whose cwd is the universe.
  cpSync(path.join(ROOT, "pipeline", "strips", "approaches.json"), path.join(U, "pipeline", "strips", "approaches.json"));
  cpSync(path.join(ROOT, "pipeline", "strips", "data"), path.join(U, "pipeline", "strips", "data"), { recursive: true });
  cpSync(path.join(ROOT, "pipeline", "foundry", "styles.json"), path.join(U, "catalogue", "styles.json"));
  // The engines read their prompts (and the article reviewer panel) from `<cwd>/pipeline` - part of the code.
  for (const f of [...readdirSync(path.join(ROOT, "pipeline")).filter((n) => n.endsWith(".md")), "article-reviewers.json"]) cpSync(path.join(ROOT, "pipeline", f), path.join(U, "pipeline", f));
  writeFileSync(path.join(U, "frames", "f1.jpg"), PNG);
  // The stock scene a Floor sweep runs (pipeline/foundry/plans/dry-run.json): its frame must be on
  // this machine, or the receipt refuses the sweep (L45).
  writeFileSync(path.join(U, "frames", "wow-shadowlands-002.jpg"), PNG);
  ENV = { ...process.env };
  for (const v of ["GRAVITONE_PRODUCE_SIDE", "LEONARDO_STUDIO_CDP", "SUNO_CDP", "SUNO_DRIVER"]) delete ENV[v];
  Object.assign(ENV, {
    NEXT_PUBLIC_GRAVITONE_DATA: "fixtures",
    NEXT_PUBLIC_DEV_AUTH: "1",
    NEXT_DIST_DIR: DIST,
    GRAVITONE_DRY_ONLY: "1",
    IMAGING_ACCESS_SECRET: SECRET,
    IMAGING_RATE_CAPACITY: "100000",
    GRAVITONE_STORE_PATH: STORE(),
    // Every store a producer writes, named once for every process.
    ARTICLES_STORE_DIR: path.join(U, "articles"),
    STRIPS_STORE_DIR: path.join(U, "strips"),
    EXTRACT_STORE_DIR: path.join(U, "extract"),
    FOUNDRY_DIR: path.join(U, "catalogue"),
    SOUND_STORE_DIR: path.join(U, "sound"),
    SOUND_LEDGER_PATH: path.join(U, "sound-ledger.json"),
    FOUNDRY_RUNS_DIR: path.join(U, "foundry-out", "runs"),
    FOUNDRY_TRAINING_DIR: path.join(U, "foundry-out", "training"),
    FOUNDRY_FRAMES_DIR: path.join(U, "frames"),
    GPU_LEASE_DIR: path.join(U, "gpu"),
    AI_REGISTRY_DIR: reg.registry,
    ARTICLES_AGENT_BIN: `node|${stub}`,
    ARTICLES_CODEX_BIN: `node|${stub}|--as=codex`,
    ARTICLES_AGY_BIN: `node|${stub}|--as=agy`,
    ARTICLES_GH_BIN: `node|${path.join(ROOT, "tests", "fixtures", "articles", "stub-gh.mjs")}`,
    PYTHONIOENCODING: "utf-8",
    TEMP: tmp,
    TMP: tmp,
    TMPDIR: tmp,
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
    if (Date.now() > until) throw new Error(`the exit server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// NOT serial: each producer's two directions are their own tests, so one producer's red (a
// defect this lane exists to find) does not hide the next producer's evidence. A failure restarts
// the Playwright worker, which builds a fresh universe and server for the tests after it.
test.use({ baseURL: BASE });
test.setTimeout(300_000);

test.beforeAll(async () => {
  test.setTimeout(400_000);
  universe();
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: U, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  const log = path.join(U, "next-dev.log");
  const keep = (b: Buffer) => {
    if (existsSync(U)) appendFileSync(log, b);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  await ready(`${BASE}/projects/runs`, 300_000);
});

test.afterAll(() => {
  // By PID, the tree this spec spawned and nothing else (never by image name).
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  if (process.env["EXIT_KEEP"] === undefined) rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  else console.log(`[exit] universe kept at ${U}`);
});

/* ── the store as a file, the CLIs and the workers as processes ─────────────── */

function q<T>(sql: string, ...args: string[]): T[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as T[];
  } finally {
    db.close();
  }
}
type JobRow = { id: string; lane: string; state: string; producer: string; mode: string };
const jobRow = (id: string): JobRow | undefined =>
  q<JobRow>("SELECT id, lane, state, json_extract(record, '$.producer') AS producer, json_extract(record, '$.mode.kind') AS mode FROM jobs WHERE id = ?", id)[0];

type Ran = { code: number; out: string; err: string };
const NODE_FLAGS = ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"];

/** A producer CLI, from the checkout (prompts, briefs and Python live there), over the universe's stores. */
function cli(script: string, args: readonly string[], extra: Readonly<Record<string, string>> = {}): Ran {
  const r = spawnSync(process.execPath, [...NODE_FLAGS, path.join(ROOT, script), ...args], { cwd: ROOT, env: { ...ENV, ...extra }, encoding: "utf8", timeout: 240_000 });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}
/** The CLIs whose documented entry is `npx tsx <script>` (their v1 imports carry no extension). */
function tsx(script: string, args: readonly string[]): Ran {
  const quoted = ["npx", "--no-install", "tsx", path.join(ROOT, script), ...args].map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
  const r = spawnSync(quoted, { cwd: ROOT, env: ENV, encoding: "utf8", timeout: 240_000, shell: true });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}
function python(script: string, args: readonly string[]): Ran {
  const r = spawnSync(process.env["PYTHON"] ?? "python", [path.join(ROOT, script), ...args], { cwd: ROOT, env: ENV, encoding: "utf8", timeout: 240_000 });
  return { code: r.status ?? -1, out: r.stdout ?? "", err: r.stderr ?? "" };
}
const hasPython = (): boolean => spawnSync(process.env["PYTHON"] ?? "python", ["-c", "import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)"]).status === 0;

/** The one JSON document a `--json` CLI prints (the last parseable block of stdout). */
function doc(r: Ran): Record<string, unknown> {
  const text = r.out.trim();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const last = text.split("\n").at(-1) ?? "";
    try {
      return JSON.parse(last) as Record<string, unknown>;
    } catch {
      throw new Error(`no JSON document (exit ${r.code}):\n${r.out}\n${r.err}`);
    }
  }
}

/** `npm run worker -- --once --json --lanes <lanes>` over the universe. */
function worker(lanes: string): Ran & { lines: Record<string, unknown>[] } {
  const r = cli(path.join("workers", "runner.mts"), ["--once", "--json", "--lanes", lanes, "--idle-ms", "200"]);
  const lines = r.out
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { ...r, lines };
}

/** A route the screens call, through the server's port, with the access secret. */
let ip = 0;
async function api(p: string, method = "GET", body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const r = await fetch(`${BASE}${p}`, {
    method,
    headers: { authorization: `Bearer ${SECRET}`, "x-forwarded-for": `10.44.${++ip % 250}.1`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { text };
  }
  return { status: r.status, json };
}

/** Runs, opened on one job: the screen draws its bar. */
async function drawn(page: Page, jobId: string): Promise<void> {
  await page.goto(`/projects/runs?job=${encodeURIComponent(`kernel:${jobId}`)}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("dev-auth-banner")).toBeVisible();
  await expect(page.locator(`[data-bar="kernel:${jobId}"]`)).toBeAttached({ timeout: 30_000 });
}



/** Every job id the store holds for one producer, in id order. */
const idsOf = (producer: string): string[] => q<{ id: string }>("SELECT id FROM jobs WHERE json_extract(record, '$.producer') = ? ORDER BY id", producer).map((r) => r.id);
/** The jobs a step added for `producer`: the ids it holds now that it did not hold before. */
const added = (producer: string, before: readonly string[]): string[] => idsOf(producer).filter((id) => !before.includes(id));

/** The job each producer's UI half launched, for its CLI half's worker drive (absent after a restart). */
const UI_JOB = new Map<string, string>();

/** The CLI half: its detached job is queued and dry, Runs draws it, and the worker drives it and the UI's to done. */
async function cliHalf(page: Page, producer: string, launch: () => Ran, drive: () => Ran & { lines: Record<string, unknown>[] }): Promise<void> {
  const before = idsOf(producer);
  const launched = launch();
  expect(launched.code, `${launched.out}\n${launched.err}`).toBe(0);
  const mine = added(producer, before);
  expect(mine, `the CLI enqueued one ${producer} job\n${launched.out}`).toHaveLength(1);
  const cliJob = mine[0] ?? "";
  expect(jobRow(cliJob)).toMatchObject({ producer, mode: "dry", state: "queued" });
  await drawn(page, cliJob);
  const ui = UI_JOB.get(producer);
  const w = drive();
  const both = ui === undefined || jobRow(ui) === undefined ? [cliJob] : [cliJob, ui];
  for (const id of both) expect(jobRow(id)?.state, `${id} after the worker\n${w.out}\n${w.err}`).toBe("done");
  expect(w.code, `${w.out}\n${w.err}`).toBe(0);
}

/* ── article (seat.text) ────────────────────────────────────────────────────── */

test("article · UI -> CLI: POST /api/articles enqueues the job `article.mts status --json` names", async () => {
  const ui = await api("/api/articles", "POST", { topic: { kind: "free", text: "Budgets are counted in tokens." }, mode: "dry" });
  expect(ui.status, JSON.stringify(ui.json)).toBe(201);
  const runId = String((ui.json["run"] as Record<string, unknown>)["id"]);
  const uiJob = String(ui.json["jobId"]);
  expect(jobRow(uiJob)).toMatchObject({ producer: "article", mode: "dry", state: "queued" });
  const status = tsx(path.join("pipeline", "article.mts"), ["status", runId, "--json"]);
  expect(status.code, status.err).toBe(0);
  expect((doc(status)["jobs"] as { id: string }[]).map((j) => j.id)).toContain(uiJob);
  UI_JOB.set("article", uiJob);
});

test("article · CLI -> UI: `article.mts run --dry --detach` is drawn in Runs; the worker drives both jobs to done", async ({ page }) => {
  await cliHalf(page, "article", () => tsx(path.join("pipeline", "article.mts"), ["run", "--topic", "A ceiling is a stop point.", "--dry", "--detach", "--json"]), () => worker("seat.text"));
});

/* ── strips (seat.text) ─────────────────────────────────────────────────────── */

test("strips · UI -> CLI: the route's receipt, confirmed by its token, enqueues the job `run.mts --status --json` names", async () => {
  const body = { run: "l44-ui", only: ["E01"], controls: true };
  const r0 = await api("/api/foundry/strips", "POST", body);
  expect(r0.status, JSON.stringify(r0.json)).toBe(200);
  const token = String((r0.json["receipt"] as Record<string, unknown>)["token"]);
  const r1 = await api("/api/foundry/strips", "POST", { ...body, token });
  expect(r1.status, `the confirm of a NEW strip run, in the running server: ${JSON.stringify(r1.json)}`).toBe(202);
  const uiJob = String(r1.json["jobId"]);
  const status = tsx(path.join("pipeline", "strips", "run.mts"), ["--status", "l44-ui", "--json"]);
  expect(status.code, status.err).toBe(0);
  expect(doc(status)["jobId"]).toBe(uiJob);
  UI_JOB.set("strips", uiJob);
});

test("strips · CLI -> UI: `run.mts --dry --detach` is drawn in Runs; the worker drives both jobs to done", async ({ page }) => {
  await cliHalf(page, "strips", () => tsx(path.join("pipeline", "strips", "run.mts"), ["--run", "l44-cli", "--only", "E02", "--controls", "--dry", "--detach", "--json"]), () => worker("seat.text"));
});

/* ── extract (cloud.google) ─────────────────────────────────────────────────── */

test("extract · UI -> CLI: the step route's receipt, confirmed, kicks the job `extract.mts --status --json` names", async () => {
  const images = [1, 2].map((n) => ({ name: `tile-${n}.png`, mime: "image/png", base64: PNG.toString("base64") }));
  const created = await api("/api/foundry/extract", "POST", { slug: "l44-ui", images });
  expect(created.status, JSON.stringify(created.json)).toBeLessThan(300);
  const runId = String((created.json["run"] as Record<string, unknown>)["id"]);
  const step = `/api/foundry/extract/${encodeURIComponent(runId)}/step`;
  const rec = await api(step, "POST", {});
  expect(rec.status, JSON.stringify(rec.json)).toBe(200);
  const token = String((rec.json["receipt"] as Record<string, unknown>)["token"]);
  const kicked = await api(step, "POST", { mode: "dry", token });
  expect(kicked.status, JSON.stringify(kicked.json)).toBe(200);
  const uiJob = String(kicked.json["jobId"]);
  expect(jobRow(uiJob)).toMatchObject({ producer: "extract", mode: "dry" });
  const status = tsx(path.join("pipeline", "foundry", "extract.mts"), ["--status", runId, "--json"]);
  expect(status.code, status.err).toBe(0);
  expect(doc(status)["jobId"]).toBe(uiJob);
  UI_JOB.set("extract", uiJob);
});

test("extract · CLI -> UI: `extract.mts <folder> --dry --detach` is drawn in Runs; the worker drives both jobs to done", async ({ page }) => {
  const gallery = path.join(U, "gallery");
  mkdirSync(gallery, { recursive: true });
  for (const n of [1, 2]) writeFileSync(path.join(gallery, `g-${n}.png`), PNG);
  await cliHalf(page, "extract", () => tsx(path.join("pipeline", "foundry", "extract.mts"), [gallery, "--slug", "l44-cli", "--dry", "--detach", "--json"]), () => worker("cloud.google"));
});

/* ── music video (box.render) ───────────────────────────────────────────────── */

/**
 * A 1.5 s, 22.05 kHz mono 16-bit PCM WAV: a tone at `hz`. A dry mv job still runs its FREE local
 * analyse step for real (L31: only paid vendor calls have stand-ins), and the render page decodes
 * the track - a placeholder file fails there with "does not decode as audio".
 */
function wav(hz: number): Buffer {
  const rate = 22_050;
  const n = Math.round(rate * 1.5);
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); // PCM
  b.writeUInt16LE(1, 22); // mono
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 8000), 44 + i * 2);
  return b;
}

/** A folder of real, decodable tracks. */
function tracks(name: string, titles: readonly string[]): string {
  const dir = path.join(U, "music", name);
  mkdirSync(dir, { recursive: true });
  titles.forEach((t, i) => writeFileSync(path.join(dir, `${t}.wav`), wav(220 + 110 * i)));
  return dir;
}

test("mv · UI -> CLI: the Settled column's import, add and Start (receipt, then its token) launch the job `music-video.mts status --json` names", async () => {
  const imported = await api("/api/sound/mv/import", "POST", { dir: tracks("ui", ["06_Night Ferry"]) });
  expect(imported.status, JSON.stringify(imported.json)).toBeLessThan(300);
  const takeId = String((imported.json["takeIds"] as string[])[0]);
  const posted = await api("/api/sound/mv", "POST", { sources: [{ kind: "take", id: takeId, title: "06_Night Ferry" }] });
  expect(posted.status, JSON.stringify(posted.json)).toBe(201);
  const before = idsOf("mv");
  const receipt = await api("/api/sound/mv/run");
  expect(receipt.status, JSON.stringify(receipt.json)).toBe(200);
  const token = String((receipt.json["receipt"] as Record<string, unknown>)["token"]);
  const started = await api("/api/sound/mv/run", "POST", { running: true, token });
  expect(started.status, JSON.stringify(started.json)).toBe(200);
  const [uiJob] = added("mv", before);
  expect(uiJob, "Start launched one mv job").toBeDefined();
  expect(jobRow(uiJob ?? "")).toMatchObject({ producer: "mv", mode: "dry" });
  const status = tsx(path.join("pipeline", "music-video.mts"), ["status", "--json"]);
  expect(status.code, status.err).toBe(0);
  expect((doc(status)["jobs"] as { job?: string }[]).map((j) => j.job)).toContain(uiJob);
  // The column stays ON, as the operator leaves it: switching it off pauses the job it launched.
  UI_JOB.set("mv", uiJob ?? "");
});

test("mv · CLI -> UI: `music-video.mts run <dir> --dry --detach` is drawn in Runs; the worker drives both jobs to done", async ({ page }) => {
  await cliHalf(page, "mv", () => tsx(path.join("pipeline", "music-video.mts"), ["run", tracks("cli", ["07_Salt Lines"]), "--dry", "--detach", "--json"]), () => worker("box.render"));
});

/* ── Suno (box.chrome) ──────────────────────────────────────────────────────── */

async function proposal(title: string): Promise<string> {
  const p = await api("/api/sound/suno/proposals", "POST", { fields: { title, style: "warm synthwave, analog pads" }, lane: { axis: "group", value: "ungrouped" } });
  expect(p.status, JSON.stringify(p.json)).toBe(201);
  return String((p.json["proposal"] as Record<string, unknown>)["id"]);
}

test("suno · UI -> CLI: the Queue column's queue and Start (receipt, then its token) launch the job `suno.mts status --json` names", async () => {
  const pid = await proposal("L44 UI");
  const queued = await api("/api/sound/suno/queue", "POST", { proposalIds: [pid] });
  expect(queued.status, JSON.stringify(queued.json)).toBe(201);
  const before = idsOf("suno");
  const receipt = await api("/api/sound/suno/run");
  expect(receipt.status, JSON.stringify(receipt.json)).toBe(200);
  const token = String((receipt.json["receipt"] as Record<string, unknown>)["token"]);
  const started = await api("/api/sound/suno/run", "POST", { running: true, token });
  expect(started.status, JSON.stringify(started.json)).toBe(200);
  const [uiJob] = added("suno", before);
  expect(uiJob, "Start launched one suno job").toBeDefined();
  expect(jobRow(uiJob ?? "")).toMatchObject({ producer: "suno", mode: "dry" });
  const status = tsx(path.join("pipeline", "suno.mts"), ["status", "--json"]);
  expect(status.code, status.err).toBe(0);
  expect((doc(status)["jobs"] as { job?: string }[]).map((j) => j.job)).toContain(uiJob);
  // The column stays ON, as the operator leaves it: switching it off pauses every job it launched,
  // and a CLI `start` does not resume a column somebody else stopped. The CLI's own `enqueue` never
  // launches (whatever the switch says), so its `start` below launches only its own prompt.
  UI_JOB.set("suno", uiJob ?? "");
});

test("suno · CLI -> UI: `suno.mts enqueue` + `start --dry --detach` is drawn in Runs; the worker drives both jobs to done", async ({ page }) => {
  const pid = await proposal("L44 CLI");
  const enq = tsx(path.join("pipeline", "suno.mts"), ["enqueue", pid, "--json"]);
  expect(enq.code, `${enq.out}\n${enq.err}`).toBe(0);
  await cliHalf(page, "suno", () => tsx(path.join("pipeline", "suno.mts"), ["start", "--dry", "--detach", "--json"]), () => worker("box.chrome"));
});

/* ── forge and Dojo (gpu.local, Python's worker) ────────────────────────────── */

/** `npm run worker:gpu -- --once --json` over the universe. */
function gpuWorker(): Ran & { lines: Record<string, unknown>[] } {
  const r = python(path.join("pipeline", "foundry", "worker.py"), ["--once", "--json"]);
  const lines = r.out
    .split("\n")
    .filter((l) => l.trim().startsWith("{"))
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { ...r, lines };
}

test("forge · UI: the Floor's image composer launches a forge sweep through its receipt", async ({ page }) => {
  // The Floor's image lane is the forge's UI door (decision 11: the Floor composer lives in the Foundry cell).
  const before = idsOf("forge");
  await page.goto("/floor", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
  const form = page.locator('form[data-component="IdeaComposer"][data-composer="image"]');
  await expect(form).toBeVisible();
  const box = form.getByRole("textbox").first();
  await box.fill("painted-3d over the harbour frame");
  await box.press("Enter");
  await expect(page.locator('[data-component="Receipt"]')).toBeVisible();
  await page.locator('[data-component="Receipt"]').getByRole("button", { name: /Confirm/ }).click();
  await page.waitForTimeout(2000);
  // What the sheet said, when it is still open (a refusal keeps it; a launch closes it - L45).
  const sheet = page.locator('[data-component="Receipt"]').locator("xpath=..");
  const said = (await sheet.count()) === 0 ? "(the receipt closed)" : (await sheet.innerText()).split("\n").filter((l) => /launch|refus|cannot|no plan/i.test(l)).join(" | ");
  expect(added("forge", before), `a confirmed image receipt enqueues a forge job; the screen said: ${said}`).toHaveLength(1);
});

test("forge · CLI -> UI: `forge.py --dry --detach` and the Node launcher name one job; Runs draws it; worker.py drives it to done", async ({ page }) => {
  test.skip(!hasPython(), "no python 3 on this machine");
  const plan = path.join(U, "plan.json");
  writeFileSync(plan, JSON.stringify({ id: "l44", scenes: [{ id: "s1", frame: "f1.jpg" }], styles: ["painted-3d"], mechanisms: [{ id: "text", reference: false }], seeds: [7] }));
  const d = python(path.join("pipeline", "foundry", "forge.py"), [plan, "--run-id", "l44", "--dry", "--detach", "--json"]);
  expect(d.code, `${d.out}\n${d.err}`).toBe(0);
  const jobId = String(doc(d)["jobId"]);
  expect(jobRow(jobId)).toMatchObject({ producer: "forge", mode: "dry", state: "queued", lane: "gpu.local" });
  const viaNode = cli(path.join("pipeline", "foundry", "launch.mts"), ["forge", "--run-id", "l44", "--dry", "--detach", "--json"]);
  expect(viaNode.code, `${viaNode.out}\n${viaNode.err}`).toBe(0);
  expect(doc(viaNode)).toMatchObject({ kind: "existing", jobId });
  await drawn(page, jobId);
  const w = gpuWorker();
  expect(w.code, `${w.out}\n${w.err}`).toBe(0);
  expect(w.lines).toEqual(expect.arrayContaining([expect.objectContaining({ jobId, outcome: "done" })]));
  expect(jobRow(jobId)?.state).toBe("done");
});

test("dojo · UI -> CLI: Runs' start-cycle door, through its receipt, enqueues the job `launch.mts dojo` names as existing (L45)", async ({ page }) => {
  // A cycle the dojo skill left `planning`: its gen-spec (one local image pair) and cycle.json.
  const id = "l45-ui-cycle";
  const dir = path.join(U, "foundry-out", "training", id);
  mkdirSync(dir, { recursive: true });
  const pair = (p: string, seed: number) => ({ id: p, seed, baseline: { prompt: `${p} baseline` }, challenger: { prompt: `${p} challenger` } });
  writeFileSync(path.join(dir, "gen-spec.json"), JSON.stringify({ stack: "local", media: "image", pairs: [pair("p1", 1)] }));
  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify({ version: 1, id, status: "planning", improvements: [{ claim: "the challenger holds the key light", subject: "frame-direction", technique: "t" }], log: [] }));
  const before = idsOf("dojo");
  await page.goto("/projects/runs", { waitUntil: "domcontentloaded" });
  const door = page.locator(`[data-component="DojoDoors"] [data-cycle="${id}"]`);
  await expect(door).toBeVisible({ timeout: 30_000 });
  await door.getByRole("button", { name: /start cycle/ }).click();
  const receipt = page.locator('[data-component="Receipt"]');
  await expect(receipt).toBeVisible();
  await expect(receipt).toHaveAttribute("data-mode", "dry");
  await receipt.getByRole("button", { name: /Confirm/ }).click();
  await expect(receipt).toHaveCount(0);
  const mine = added("dojo", before);
  expect(mine, "the confirmed receipt enqueued one dojo job").toHaveLength(1);
  const uiJob = mine[0] ?? "";
  expect(jobRow(uiJob)).toMatchObject({ producer: "dojo", mode: "dry", state: "queued", lane: "gpu.local" });
  const l = cli(path.join("pipeline", "foundry", "launch.mts"), ["dojo", id, "--dry", "--detach", "--json"]);
  expect(l.code, `${l.out}\n${l.err}`).toBe(0);
  expect(doc(l)).toMatchObject({ kind: "existing", jobId: uiJob });
  UI_JOB.set("dojo", uiJob);
});

test("dojo · CLI -> UI: `launch.mts dojo --dry --detach` is drawn in Runs; worker.py drives it to done", async ({ page }) => {
  test.skip(!hasPython(), "no python 3 on this machine");
  const id = "l44-cycle";
  const dir = path.join(U, "foundry-out", "training", id);
  mkdirSync(dir, { recursive: true });
  const pair = (p: string, seed: number) => ({ id: p, seed, baseline: { prompt: `${p} baseline` }, challenger: { prompt: `${p} challenger` } });
  writeFileSync(path.join(dir, "gen-spec.json"), JSON.stringify({ stack: "local", media: "image", pairs: [pair("p1", 1)] }));
  writeFileSync(path.join(dir, "cycle.json"), JSON.stringify({ version: 1, id, status: "generating", improvements: [{ claim: "the challenger holds the key light", subject: "frame-direction", technique: "t" }], log: [] }));
  const l = cli(path.join("pipeline", "foundry", "launch.mts"), ["dojo", id, "--dry", "--detach", "--json"]);
  expect(l.code, `${l.out}\n${l.err}`).toBe(0);
  const jobId = String(doc(l)["jobId"]);
  expect(jobRow(jobId)).toMatchObject({ producer: "dojo", mode: "dry", state: "queued", lane: "gpu.local" });
  await drawn(page, jobId);
  const w = gpuWorker();
  expect(w.code, `${w.out}\n${w.err}`).toBe(0);
  expect(jobRow(jobId)?.state, `${w.out}\n${w.err}`).toBe("done");
  // The UI half's job (the start-cycle door, above), when this worker still holds it: driven too.
  const ui = UI_JOB.get("dojo");
  if (ui !== undefined && jobRow(ui) !== undefined) expect(jobRow(ui)?.state, `${ui} after the worker\n${w.out}\n${w.err}`).toBe("done");
});

/* ── a part act from an editor ──────────────────────────────────────────────── */

test("a part act: the research editor's act, through its receipt, is one dry job Runs draws, ending done (in the request's drive, or the worker's, whose line names it)", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/projects/runs", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="RunsDayline"][data-measured]')).toBeVisible();
  await page.keyboard.press("n");
  await expect(page.getByRole("dialog", { name: "compose" })).toBeVisible();
  await page.keyboard.press("1");
  await page.waitForURL(/\/projects\/untitled-film-[a-z0-9]+\?composed=1$/);
  const film = decodeURIComponent(new URL(page.url()).pathname.split("/").pop() ?? "");
  const before = q<{ id: string }>("SELECT id FROM jobs").map((r) => r.id);
  await page.goto(`/projects/${encodeURIComponent(film)}/research`, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="PartWorkspace"]')).toBeVisible();
  await page.waitForLoadState("networkidle");
  const act = page.getByRole("button", { name: /run research|research/i }).first();
  await act.click();
  const receipt = page.locator('[data-component="Receipt"]');
  await expect(receipt).toBeVisible();
  await expect(receipt).toHaveAttribute("data-mode", "dry");
  await page.keyboard.press("Enter");
  await expect(receipt).toHaveCount(0);
  const mine = q<{ id: string }>("SELECT id FROM jobs").map((r) => r.id).filter((id) => !before.includes(id));
  expect(mine, "the act enqueued one job").toHaveLength(1);
  const jobId = mine[0] ?? "";
  expect(jobRow(jobId)).toMatchObject({ producer: "research", mode: "dry" });
  await drawn(page, jobId);
  if (jobRow(jobId)?.state !== "done") {
    const w = worker(jobRow(jobId)?.lane ?? "seat.text");
    expect(w.lines.map((l) => l["jobId"]), `${w.out}\n${w.err}`).toContain(jobId);
  }
  expect(jobRow(jobId)?.state).toBe("done");
});
