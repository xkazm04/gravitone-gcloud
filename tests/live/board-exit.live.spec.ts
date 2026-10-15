// LANE - THE PHASE 3 EXIT: EVERY DECISION SURFACE, DRIVEN IN A BROWSER, LANDS IN THE KERNEL AND
// THEN IN v1.
//
// The plan's exit (docs/next/migration-plan.md §6 Phase 3): "drive every verdict, undo, commit
// and blast-radius preview in a browser and assert the store write; the decision log is
// append-only and shows in the Ledger; /board redirects". For each packet source - forge,
// extract, dojo, strips, article, audio, suno, mv - one journey: the pile is opened FROM THE
// FLOOR, decided with the desk's keys, one act is undone, the consequence is previewed and
// checked against what v1's planner names, the commit is confirmed, and then
//   (a) the kernel holds the decisions and the events (read straight from the SQLite file);
//   (b) v1's own store holds the outcome (its files, as v1's readers read them);
//   (c) the events are on /ledger?q=<packet>;
//   (d) the commit is one act: a reload and a second Enter write no second commit.
// Beside them: /board redirects, a v1 write that fails once is retried by the reconciler when
// a Floor renders, and the cull legend draws only the source's own reason keys.
//
// ITS OWN SERVER, ITS OWN UNIVERSE. A commit writes v1 (deletes plates, rewrites indices,
// approves an article), so this lane never runs against the operator's stores. It seeds the
// fixture universe (`ledger-sync seed-fixtures`) into a temp directory and starts `next dev`
// there - Next does not chdir, so every v1 store resolves under the temp cwd, the kernel store
// is GRAVITONE_STORE_PATH in it, and the article pipeline gets a throwaway registry with the
// stub agent and the stub `gh` (tests/golden-path/_articles.ts's sandbox, as env). Nothing
// spends, nothing leaves the machine, and `foundry-out/` is the temp one.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/board-exit.live.spec.ts
//   EXIT_BASE=http://localhost:3206 EXIT_UNIVERSE=<dir>  reuse a server already started over
//   <dir> (seeded as below) instead of starting one - a debugging convenience.

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

import { DEFAULT_GROUND, findingKey, measurerSource, type Finding } from "./_legibility";

const ROOT = process.cwd();
const PORT = 3206;
const REUSE = process.env["EXIT_BASE"] !== undefined && process.env["EXIT_UNIVERSE"] !== undefined;
const BASE = process.env["EXIT_BASE"] ?? `http://localhost:${PORT}`;
const CLI = path.join(ROOT, "pipeline", "ledger-sync.mts");

let U = process.env["EXIT_UNIVERSE"] ?? "";
/** The gate article's twin, sent back for another turn. */
const RETURNED = "fx-art-gate-2";
let server: ChildProcess | undefined;

const FO = () => path.join(U, "fixtures-out");
const STORE = () => path.join(U, "store.sqlite");
const json = <T>(file: string): T => JSON.parse(readFileSync(file, "utf8")) as T;

/** The fixture universe the server reads, and the two gaps the seed leaves for a decision surface. */
function seedUniverse(): void {
  U = mkdtempSync(path.join(tmpdir(), "gt-board-exit-"));
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "ARTICLES_STORE_DIR", "PUBLISH_STORE_DIR", "CLIP_STORE_DIR", "GPU_LEASE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR"]) delete env[v];
  execFileSync(process.execPath, [CLI, "seed-fixtures"], { cwd: U, env, encoding: "utf8" });
  // The strips store's root is foundry-out/ in both universes (pipeline/fixtures/work.ts).
  cpSync(path.join(FO(), "strips"), path.join(U, "foundry-out", "strips"), { recursive: true });
  // The seed writes strip manifests, not the strips: each rendered card gets placeholder files.
  for (const run of readdirSync(path.join(U, "foundry-out", "strips"))) {
    const m = json<{ cards: { id: string; status: string; files: Record<string, string> }[] }>(path.join(U, "foundry-out", "strips", run, "run.json"));
    for (const c of m.cards.filter((x) => x.status === "rendered")) {
      for (const rel of Object.values(c.files)) {
        mkdirSync(path.dirname(path.join(U, "foundry-out", "strips", run, c.id, rel)), { recursive: true });
        writeFileSync(path.join(U, "foundry-out", "strips", run, c.id, rel), `placeholder ${rel}`);
      }
    }
  }
  // The seed's article at the gate has no post; give it one, and a twin at the gate, so one
  // journey approves and another sends an edit plan back.
  const gate = path.join(FO(), "articles", "fx-art-gate");
  const post = path.join(gate, "post");
  mkdirSync(post, { recursive: true });
  writeFileSync(path.join(post, "post.md"), ["# Delivery guarantees", "", "At least once.", "", "## The outbox", "", "A row in the same transaction.", ""].join("\n"));
  writeFileSync(path.join(post, "index.html"), "<h1>Delivery guarantees</h1>");
  cpSync(gate, path.join(FO(), "articles", RETURNED), { recursive: true });
  const twin = json<Record<string, unknown>>(path.join(FO(), "articles", RETURNED, "run.json"));
  writeFileSync(path.join(FO(), "articles", RETURNED, "run.json"), JSON.stringify({ ...twin, id: RETURNED }));
  // And its settled music video names an export it never wrote.
  for (const job of json<{ jobs: { id: string; state: string; files: { video?: string } }[] }>(path.join(FO(), "sound", "mv.json")).jobs) {
    if (job.state !== "done" || job.files.video === undefined) continue;
    mkdirSync(path.dirname(path.join(FO(), "sound", job.files.video)), { recursive: true });
    writeFileSync(path.join(FO(), "sound", job.files.video), "placeholder export");
  }
}

/** The article sandbox, as env: a throwaway registry, the stub agent and the stub `gh`. */
function articleEnv(): Record<string, string> {
  const reg = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tests", "fixtures", "articles", "registry-fixture.mjs"), path.join(U, "reg")], { encoding: "utf8" })) as { registry: string };
  const stubAgent = path.join(ROOT, "tests", "fixtures", "articles", "stub-agent.mjs");
  const tmp = path.join(U, "tmp");
  mkdirSync(tmp, { recursive: true });
  return {
    AI_REGISTRY_DIR: reg.registry,
    ARTICLES_STORE_DIR: path.join(FO(), "articles"),
    ARTICLES_AGENT_BIN: `node|${stubAgent}`,
    ARTICLES_CODEX_BIN: `node|${stubAgent}|--as=codex`,
    ARTICLES_AGY_BIN: `node|${stubAgent}|--as=agy`,
    ARTICLES_GH_BIN: `node|${path.join(ROOT, "tests", "fixtures", "articles", "stub-gh.mjs")}`,
    TEMP: tmp,
    TMP: tmp,
    TMPDIR: tmp,
  };
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

test.describe.configure({ mode: "serial" });
test.use({ baseURL: BASE });
test.setTimeout(180_000);

test.beforeAll(async () => {
  test.setTimeout(300_000);
  if (REUSE) return;
  seedUniverse();
  const env: NodeJS.ProcessEnv = { ...process.env, ...articleEnv() };
  for (const v of ["FOUNDRY_DIR", "SOUND_STORE_DIR", "PUBLISH_STORE_DIR", "CLIP_STORE_DIR", "GPU_LEASE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR", "SOUND_LEDGER_PATH"]) delete env[v];
  Object.assign(env, {
    NEXT_PUBLIC_GRAVITONE_DATA: "fixtures",
    NEXT_PUBLIC_DEV_AUTH: "1",
    // The fixture universe's own build directory (package.json dev:fixtures), already in
    // tsconfig's include, so this lane leaves no line behind there.
    NEXT_DIST_DIR: ".next-fixtures",
    GRAVITONE_STORE_PATH: STORE(),
  });
  // cwd = the temp universe: v1's stores resolve there. The project is named as an argument.
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "dev", ROOT, "-p", String(PORT)], { cwd: U, env, stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  const log = path.join(U, "next-dev.log");
  // The log lives with the universe; once afterAll removed it, late output has nowhere to go.
  const keep = (b: Buffer) => {
    if (existsSync(U)) appendFileSync(log, b);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  await ready(`${BASE}/floor`, 240_000);
});

test.afterAll(() => {
  if (REUSE) return;
  // By PID, the tree this spec spawned and nothing else (never by image name).
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

/* ── the store, read as a file (the lane does not load @gt/kernel) ──────────── */

function q<T>(sql: string, ...args: (string | number)[]): T[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as T[];
  } finally {
    db.close();
  }
}
const eventsOf = (id: string): string[] => q<{ type: string }>("SELECT type FROM events WHERE subject_kind = 'packet' AND subject_id = ? ORDER BY seq", id).map((r) => r.type);
const applyOf = (id: string) => q<{ state: string; attempts: number; last_error: string | null }>("SELECT state, attempts, last_error FROM packet_applies WHERE packet_id = ?", id)[0];

/** Each candidate's newest decision in the kernel: what the commit handed v1. */
function finalVerdicts(id: string): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const r of q<{ candidate_id: string; verdict: string | null }>("SELECT candidate_id, verdict FROM decisions WHERE packet_id = ? ORDER BY seq", id)) out.set(r.candidate_id, r.verdict);
  return out;
}
const kept = (id: string): number => [...finalVerdicts(id).values()].filter((v) => v === "keep").length;

async function applied(id: string, ms = 30_000): Promise<void> {
  await expect.poll(() => applyOf(id)?.state, { timeout: ms, message: `${id}: the v1 apply never landed (${JSON.stringify(applyOf(id))})` }).toBe("applied");
}

/* ── the Floor, the Board, the keys ─────────────────────────────────────────── */

type Pile = { source: string; id: string; pending: number; packetId?: string };
function weir(): Pile[] {
  const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures", ARTICLES_STORE_DIR: path.join(FO(), "articles") };
  for (const v of ["SOUND_STORE_DIR", "FOUNDRY_DIR"]) delete env[v];
  return (JSON.parse(execFileSync(process.execPath, [CLI, "live", "--fixtures", "--json"], { cwd: U, env, encoding: "utf8" })) as { weir: Pile[] }).weir;
}
/** The smallest pile of a source (or the one with that run id), as the Floor links it. */
function pileOf(source: string, run?: string): Pile & { packetId: string } {
  const p = weir().filter((w) => w.source === source && w.packetId !== undefined && (run === undefined || w.id === run)).sort((a, b) => a.pending - b.pending)[0];
  if (p?.packetId === undefined) throw new Error(`the fixture universe has no ${source} pile`);
  return { ...p, packetId: p.packetId };
}
const href = (id: string) => `/board/${encodeURIComponent(id)}`;
const tiles = (page: Page) => page.locator("[data-tile]");
const consequence = (page: Page) => page.locator('[data-component="ConsequencePanel"]');
const commitButton = (page: Page) => page.getByRole("button", { name: /^commit packet/ });
/** The gate's window (400 ms) closes and the write lands before the next look. */
const landed = (page: Page) => page.waitForTimeout(700).then(() => page.waitForLoadState("networkidle"));

/** From the Floor: the pile's link opens the Board as a sheet over it. Returns the packet id the address settled on. */
async function openFromFloor(page: Page, pile: Pile & { packetId: string }): Promise<string> {
  await page.goto("/floor", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-component="Floor"][data-hydrated]')).toBeVisible();
  const link = page.locator(`a[data-component="Pile"][href="${href(pile.packetId)}"]`);
  await expect(link, `the Floor draws no pile for ${pile.packetId}`).toBeVisible();
  await link.click();
  await expect(page.locator("[data-desk-main]")).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  return decodeURIComponent(new URL(page.url()).pathname.slice("/board/".length));
}

/** No text under 12px and no contrast miss that holds still (the lane's legibility measure). */
async function legible(page: Page): Promise<void> {
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
}

/** Preview, check what v1's planner names, confirm. */
async function previewAndCommit(page: Page, names: RegExp): Promise<void> {
  await landed(page);
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toBeVisible();
  await expect(consequence(page)).toContainText(names);
  await expect(consequence(page).getByRole("button", { name: "Commit" })).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toHaveCount(0, { timeout: 30_000 });
}

/** (a) + (c) + (d), the same for every source. */
async function decidedEverywhere(page: Page, id: string): Promise<void> {
  await applied(id);
  const types = eventsOf(id);
  expect(types[0]).toBe("decision.opened");
  expect(types).toEqual(expect.arrayContaining(["decision.undone", "decision.committed", "decision.applied"]));
  expect(q<{ n: number }>("SELECT count(*) AS n FROM decisions WHERE packet_id = ?", id)[0]?.n ?? 0).toBeGreaterThan(0);
  // (c) the Ledger shows the packet's acts.
  await page.goto(`/ledger?q=${encodeURIComponent(id)}`, { waitUntil: "domcontentloaded" });
  for (const t of ["decision.committed", "decision.applied"]) await expect(page.getByRole("row").filter({ hasText: t }).first()).toBeVisible({ timeout: 20_000 });
  // (d) a reload and a second Enter: the decided desk, and still one commit.
  await page.goto(href(id), { waitUntil: "domcontentloaded" });
  await expect(page.getByText("v1 apply · applied")).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  expect(eventsOf(id).filter((t) => t === "decision.committed")).toHaveLength(1);
  expect(q<{ n: number }>("SELECT count(*) AS n FROM packet_commits WHERE packet_id = ?", id)[0]?.n).toBe(1);
}

/**
 * A matrix cull: reject the first tile with a reason (when the source has any), keep the rest,
 * take the last act back, decide it again, preview, commit.
 */
async function cull(page: Page, withReason: boolean): Promise<number> {
  const n = await tiles(page).count();
  expect(n).toBeGreaterThan(0);
  await tiles(page).nth(0).click();
  await page.keyboard.press("x");
  if (withReason) {
    await tiles(page).nth(0).click();
    await page.keyboard.press("1");
    await expect(tiles(page).nth(0)).toHaveAttribute("aria-label", /, reject: /);
  }
  for (let i = 1; i < n; i++) {
    await tiles(page).nth(i).click();
    await page.keyboard.press("k");
  }
  await landed(page);
  // ⌫ takes back the newest act - what one gate window wrote, which may be several keys - so
  // every tile it reopened is decided again.
  await page.keyboard.press("Backspace");
  await landed(page);
  for (let i = 0; i < n; i++) {
    if (/, (keep|reject)/.test((await tiles(page).nth(i).getAttribute("aria-label")) ?? "")) continue;
    await tiles(page).nth(i).click();
    await page.keyboard.press("k");
  }
  await expect(commitButton(page)).toHaveAttribute("aria-label", "commit packet");
  return n;
}

/* ── the journeys ───────────────────────────────────────────────────────────── */

test("/board redirects to the Floor, and a v1 Board link to its packet", async ({ page }) => {
  await page.goto("/board", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/floor(\?|$)/);
  const forge = pileOf("forge");
  // v1's Board addressed an item as `?i=<source>:<run>::<item>` (lib/board/url.ts).
  await page.goto(`/board?src=cull&i=${encodeURIComponent(`cull:${forge.id}::sc0/x`)}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${BASE}${href(forge.packetId)}`);
  await expect(page.locator("[data-desk-main]")).toBeVisible({ timeout: 30_000 });
});

test("forge: the legend's four reasons, the sheet's Esc, a stale preview refreshed, the commit in v1", async ({ page }) => {
  const pile = pileOf("forge");
  const id = await openFromFloor(page, pile);
  // The key legend draws the forge's four reasons and no more.
  const legend = page.getByRole("group", { name: "cull keys" });
  await expect(legend.locator("kbd", { hasText: /^4$/ })).toBeVisible();
  await expect(legend.locator("kbd", { hasText: /^5$/ })).toHaveCount(0);
  await legible(page);
  // One Esc closes the sheet, back to the Floor; a second stays there.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/floor(\?|$)/);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/floor(\?|$)/);
  // ] walks to the next open packet, [ back.
  await openFromFloor(page, pile);
  await page.keyboard.press("]");
  await expect(page).not.toHaveURL(new RegExp(encodeURIComponent(pile.id)));
  await openFromFloor(page, pile);
  const n = await cull(page, true);
  await landed(page);
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toContainText(`foundry-out/runs/${pile.id}/`);
  // v1 moves while the consequence is up (a kept plate's bytes change): the commit is refused
  // as stale and the fresh consequence is shown to confirm again.
  const run = json<{ candidates: { id: string; file: string }[] }>(path.join(FO(), "runs", pile.id, "run.json"));
  const plate = run.candidates.map((c) => path.join(FO(), "runs", pile.id, c.file)).find((f) => existsSync(f));
  if (plate === undefined) throw new Error("no plate on disk");
  appendFileSync(plate, Buffer.from([0]));
  await consequence(page).getByRole("button", { name: "Commit" }).click();
  await expect(consequence(page)).toContainText("moved · fresh preview", { timeout: 20_000 });
  await consequence(page).getByRole("button", { name: "Commit" }).click();
  await expect(consequence(page)).toHaveCount(0, { timeout: 30_000 });
  await applied(id);
  const after = json<{ status: string }>(path.join(FO(), "runs", pile.id, "run.json"));
  expect(after.status).toBe("committed");
  const verdicts = json<Record<string, { verdict: string }>>(path.join(FO(), "runs", pile.id, "verdicts.json"));
  for (const [candidate, v] of finalVerdicts(id)) expect(verdicts[candidate]?.verdict, candidate).toBe(v);
  expect(kept(id)).toBeGreaterThanOrEqual(n - 1);
  await decidedEverywhere(page, id);
});

test("extract: kept looks reach v1's catalogue", async ({ page }) => {
  const pile = pileOf("extract");
  const id = await openFromFloor(page, pile);
  // The lens is a layer: Esc closes it and leaves the sheet up.
  await tiles(page).nth(0).click();
  await page.keyboard.press("z");
  await expect(page.locator("[data-zoom]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-zoom]")).toHaveCount(0);
  await expect(page.locator("[data-desk-main]")).toBeVisible();
  await landed(page);
  await cull(page, true);
  await previewAndCommit(page, /styles|ledger|extract/);
  await applied(id);
  expect(json<{ status: string }>(path.join(FO(), "extract", pile.id, "run.json")).status).toBe("committed");
  await decidedEverywhere(page, id);
});

test("strips: chips on the reason keys, the commit in v1's strips store", async ({ page }) => {
  const pile = pileOf("strips");
  const id = await openFromFloor(page, pile);
  await cull(page, true);
  await previewAndCommit(page, /motion-styles|strips-ledger/);
  await applied(id);
  expect(json<{ status: string }>(path.join(U, "foundry-out", "strips", pile.id, "run.json")).status).toBe("committed");
  await decidedEverywhere(page, id);
});

test("dojo: blind picks, masked until judged, undo, the claim committed in v1", async ({ page }) => {
  const pile = pileOf("dojo");
  const id = await openFromFloor(page, pile);
  await legible(page);
  if ((await page.locator('[data-component="BlindPair"]').count()) > 0) {
    await expect(page.getByText("machine pick ▒▒ masked")).toBeVisible();
    // A pick unmasks the machine's for that pair (where the judge picked an arm at all).
    const judged = q<{ n: number }>("SELECT count(*) AS n FROM packet_picks WHERE packet_id = ?", id)[0]?.n ?? 0;
    // The reveal is up for one beat (BlindPair REVEAL_MS): watch for it from before the key,
    // or a loaded machine's slow `landed` outlives it.
    const revealed = judged > 0 ? expect(page.getByText(/^machine (agrees|differs)$/).first()).toBeVisible({ timeout: 10_000 }) : Promise.resolve();
    await page.keyboard.press("1");
    await revealed;
    await landed(page);
    for (let guard = 0; guard < 40; guard++) {
      const label = (await commitButton(page).getAttribute("aria-label")) ?? "";
      if (label === "commit packet") break;
      await page.keyboard.press("1");
      await landed(page);
    }
    await page.keyboard.press("Backspace");
    await landed(page);
    await page.keyboard.press("2");
    await expect(commitButton(page)).toHaveAttribute("aria-label", "commit packet", { timeout: 10_000 });
    await previewAndCommit(page, /training-ledger/);
  } else {
    // A cycle every claim of which v1 already holds opens as a review (wave B ruling 3).
    await page.keyboard.press("a");
    await expect(consequence(page)).toContainText(/training-ledger/);
    await page.keyboard.press("Enter");
  }
  await applied(id);
  expect(json<{ status: string }>(path.join(FO(), "training", pile.id, "cycle.json")).status).toBe("committed");
  await decidedEverywhere(page, id);
});

test("article: approve shows the outward acts verbatim; the approval reaches v1 and lands on the stub registry", async ({ page }) => {
  const pile = pileOf("articles", "fx-art-gate");
  const id = await openFromFloor(page, pile);
  await page.keyboard.press("a");
  await expect(consequence(page)).toBeVisible();
  await expect(consequence(page)).toContainText(/push branch article\/.+ to ai-registry's origin/);
  await expect(consequence(page)).toContainText("open a pull request in ai-registry");
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toHaveCount(0, { timeout: 30_000 });
  await applied(id);
  expect(json<{ approval?: { patches: string[] } }>(path.join(FO(), "articles", pile.id, "run.json")).approval).toBeDefined();
  // A review has no undo key: its undo is the decided desk's history, so (d) alone here.
  const types = eventsOf(id);
  expect(types).toEqual(expect.arrayContaining(["decision.opened", "decision.patched", "decision.committed", "decision.applied"]));
  expect(types.filter((t) => t === "decision.committed")).toHaveLength(1);
});

test("article: an edit plan goes back; v1 takes it as the rework note and the run drafts again", async ({ page }) => {
  const pile = pileOf("articles", RETURNED);
  const id = await openFromFloor(page, pile);
  await legible(page);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("e");
  const note = page.getByRole("textbox", { name: /^note on section/ });
  await expect(note).toBeFocused();
  // Esc cancels the note, not the sheet.
  await page.keyboard.press("Escape");
  await expect(note).toHaveCount(0);
  await expect(page.locator("[data-desk-main]")).toBeVisible();
  await page.keyboard.press("e");
  await page.keyboard.type("lead with the reconcile failure");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Shift+E");
  await expect(page.getByText("returned").first()).toBeVisible({ timeout: 20_000 });
  await applied(id);
  const run = json<{ status: string; rework?: { note: string } }>(path.join(FO(), "articles", RETURNED, "run.json"));
  expect(run.rework?.note).toContain("lead with the reconcile failure");
  expect(run.status).not.toBe("awaiting-approval");
  expect(eventsOf(id)).toEqual(expect.arrayContaining(["decision.returned", "decision.applied"]));
});

test("audio: the eleven defects on the reason keys, the verdicts on the sound shelf", async ({ page }) => {
  const pile = pileOf("sound");
  const id = await openFromFloor(page, pile);
  expect(id).toMatch(/^pkt:audio:audio\/triage\/\d+$/);
  await legible(page);
  await expect(page.getByRole("group", { name: "cull keys" }).locator("kbd", { hasText: /^-$/ })).toBeVisible();
  const n = await cull(page, true);
  await previewAndCommit(page, /ledger|takes/);
  await applied(id);
  const takes = json<{ takes: { verdict: string }[] }>(path.join(FO(), "sound", "takes.json")).takes;
  expect(takes.filter((t) => t.verdict === "kept").length).toBeGreaterThanOrEqual(kept(id));
  expect(kept(id)).toBeGreaterThanOrEqual(n - 1);
  await decidedEverywhere(page, id);
});

test("mv: keep and drop, written on the music-video queue", async ({ page }) => {
  const pile = pileOf("mv");
  const id = await openFromFloor(page, pile);
  await cull(page, false);
  await previewAndCommit(page, /mv/);
  await applied(id);
  expect(json<{ jobs: { verdict: string | null }[] }>(path.join(FO(), "sound", "mv.json")).jobs.some((j) => j.verdict !== null)).toBe(true);
  await decidedEverywhere(page, id);
});

test("suno: a v1 write that fails once is drawn on the Floor, then the reconciler lands it", async ({ page }) => {
  test.setTimeout(240_000);
  const pile = pileOf("suno");
  const id = await openFromFloor(page, pile);
  await cull(page, false);
  await landed(page);
  await page.keyboard.press("Enter");
  await expect(consequence(page)).toContainText(/suno/);
  // Another writer holds v1's sound store (lib/sound/store.ts acquireLock: an exclusive lock
  // file, waited on for 10 s, stale after 30 s): the first attempt fails in v1's own words.
  const file = path.join(FO(), "sound", "suno.json");
  const lock = path.join(FO(), "sound", ".lock");
  writeFileSync(lock, JSON.stringify({ pid: 4, at: new Date().toISOString() }));
  try {
    await page.keyboard.press("Enter");
    await expect(consequence(page)).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => applyOf(id)?.last_error ?? "", { timeout: 40_000 }).toContain("the sound store is locked");
    expect(applyOf(id)).toMatchObject({ state: "pending", attempts: 1 });
  } finally {
    rmSync(lock, { force: true });
  }
  // The Floor draws the decided packet v1 has not taken, with v1's sentence.
  await page.goto("/floor", { waitUntil: "domcontentloaded" });
  await expect(page.locator(`[data-component="Unapplied"][data-packet="${id}"]`)).toContainText("the sound store is locked");
  // Due after its backoff (30 s); the next Floor render's sweep delivers it.
  await page.waitForTimeout(32_000);
  await expect
    .poll(
      async () => {
        await page.goto("/floor", { waitUntil: "domcontentloaded" });
        return applyOf(id)?.state;
      },
      { timeout: 60_000, intervals: [2_000, 5_000, 16_000] },
    )
    .toBe("applied");
  expect(eventsOf(id)).toEqual(expect.arrayContaining(["decision.apply-failed", "decision.applied"]));
  const clips = json<{ clips: { verdict: string | null }[] }>(file).clips;
  expect(clips.some((c) => c.verdict === "keep")).toBe(true);
});

test("the decision log is append-only: the store refuses to rewrite or delete a decision", () => {
  const db = new DatabaseSync(STORE());
  try {
    expect(() => db.exec("UPDATE decisions SET verdict = 'keep'")).toThrow(/append-only/);
    expect(() => db.exec("DELETE FROM decisions")).toThrow(/append-only/);
    expect(() => db.exec("DELETE FROM events")).toThrow(/append-only/);
  } finally {
    db.close();
  }
  // Every packet the journeys decided is still in the log, act by act.
  expect(readdirSync(U).length).toBeGreaterThan(0);
  expect(q<{ n: number }>("SELECT count(DISTINCT packet_id) AS n FROM decisions")[0]?.n ?? 0).toBeGreaterThanOrEqual(8);
});
