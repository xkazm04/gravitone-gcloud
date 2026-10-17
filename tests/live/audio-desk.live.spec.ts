// LANE - THE AUDIO DESK'S ARRANGE BOARD, DRIVEN IN A BROWSER (Phase 6, L60).
//
// Owner ruling 2026-10-17: every Sound lab tool is absorbed into /audio. Driven here, against the
// real sound store in a seeded fixture universe and a kernel store beside it:
//   · the board draws kept takes as stacks - stages across with their counts, rows down, a v2
//     chip on a stack with a return - at 1440 and at 390;
//   · a card dragged one stage on lands in takes.json and as ONE take.moved ledger event;
//   · ⇧→ on a focused card moves it the same way (the keymap's audio.arrange rows);
//   · a move the store refuses (the card moved on disk behind the page) rolls back and the store's
//     sentence stays over the board;
//   · finalize asks for the library label: empty is refused where the operator types, nothing is
//     written; a label lands the take finalized with it;
//   · a Suno return dropped on a remaster card becomes the stack's next version;
//   · the kind seam: the effects board has the sfx rows; the effects composer names the engines
//     and why none makes an effect here.
// GRAVITONE_DRY_ONLY everywhere: nothing spends.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/audio-desk.live.spec.ts
//   AUDIO_DESK_PORT (default 3243), AUDIO_DESK_DIST (default .next-l60), AUDIO_DESK_TMP (the
//   parent of the universe; default the OS temp dir), AUDIO_DESK_SHOTS=<dir> saves the screens.

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Locator, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["AUDIO_DESK_PORT"] ?? 3243);
const DIST = process.env["AUDIO_DESK_DIST"] ?? ".next-l60";
const SHOTS = process.env["AUDIO_DESK_SHOTS"];
const BASE = `http://localhost:${PORT}`;
const CLI = path.join(ROOT, "pipeline", "ledger-sync.mts");

let U = "";
let server: ChildProcess | undefined;
const SOUND = () => path.join(U, "fixtures-out", "sound");
const STORE = () => path.join(U, "store.sqlite");

type Take = { id: string; title: string; kind: string; origin: string; verdict: string; stage: string | null; group: string | null; label: string | null; parentId: string | null; createdAt: string; [k: string]: unknown };
const takes = (): Take[] => (JSON.parse(readFileSync(path.join(SOUND(), "takes.json"), "utf8")) as { takes: Take[] }).takes;
const writeTakes = (t: Take[]): void => writeFileSync(path.join(SOUND(), "takes.json"), JSON.stringify({ version: 1, takes: t }));
const take = (id: string): Take | undefined => takes().find((t) => t.id === id);

/** A head of `kind` in `stage` (no take names it as parent), with a file. */
function headIn(stage: string, kind = "music", skip: readonly string[] = []): Take {
  const all = takes();
  const t = all.find((x) => x.kind === kind && x.verdict === "kept" && (x.stage ?? "pending") === stage && x["file"] !== null && !all.some((y) => y.parentId === x.id) && !skip.includes(x.id));
  if (t === undefined) throw new Error(`no ${kind} head in ${stage}`);
  return t;
}

function events(type: string): { subject: string; data: string }[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare("SELECT subject_id AS subject, data FROM events WHERE type = ? ORDER BY seq").all(type) as { subject: string; data: string }[];
  } finally {
    db.close();
  }
}

let ENV: NodeJS.ProcessEnv = { ...process.env };

function universe(): void {
  U = mkdtempSync(path.join(process.env["AUDIO_DESK_TMP"] ?? tmpdir(), "gt-audio-desk-"));
  const seedEnv: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR"]) delete seedEnv[v];
  execFileSync(process.execPath, [CLI, "seed-fixtures"], { cwd: U, env: seedEnv, encoding: "utf8" });
  // The sound ledger is a temp file: every kept-take patch re-syncs its row, and the tracked
  // pipeline/sound/ledger.json belongs to another session.
  const ledger = path.join(U, "ledger.json");
  writeFileSync(ledger, JSON.stringify({ verdicts: [], lessons: [] }));
  ENV = { ...process.env };
  for (const v of ["FOUNDRY_DIR", "PUBLISH_STORE_DIR", "CLIP_STORE_DIR", "GPU_LEASE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR", "GRAVITONE_PRODUCE_SIDE"]) delete ENV[v];
  Object.assign(ENV, {
    NEXT_PUBLIC_GRAVITONE_DATA: "fixtures",
    NEXT_PUBLIC_DEV_AUTH: "1",
    NEXT_DIST_DIR: DIST,
    GRAVITONE_STORE_PATH: STORE(),
    SOUND_STORE_DIR: SOUND(),
    SOUND_LEDGER_PATH: ledger,
    STRIPS_STORE_DIR: path.join(U, "strips"),
    PUBLISH_STORE_DIR: path.join(U, "publish"),
    GRAVITONE_DRY_ONLY: "1",
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
    if (Date.now() > until) throw new Error(`the audio desk server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOTS !== undefined) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
};

const card = (page: Page, id: string): Locator => page.locator(`[data-card="${id}"]`);
const cell = (page: Page, stage: string, group: string | null): Locator => page.locator(`[data-cell="${stage}|${group === null ? "∅" : `g:${group}`}"]`);

async function drag(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.scrollIntoViewIfNeeded();
  const a = await from.locator("span").first().boundingBox();
  const b = await to.boundingBox();
  if (a === null || b === null) throw new Error("nothing to drag or no target");
  await page.mouse.move(a.x + 4, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y + 20, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + Math.min(40, b.height / 2), { steps: 8 });
  await page.mouse.up();
}

// Serial: one universe and one server for the file; each case picks its card from the store as it
// is when the case starts. The keyboard case runs LAST, so the pointer cases are proven whatever it
// meets.
test.describe.configure({ mode: "serial" });
test.use({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
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
  await ready(`${BASE}/audio?s=arrange`, 240_000);
});

test.afterAll(async () => {
  // By PID, the tree this spec spawned and nothing else (never by image name).
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  // Windows will not remove the directory a live process runs in: wait for the port to close.
  for (let i = 0; i < 40; i++) {
    const up = await fetch(BASE).then(
      () => true,
      () => false,
    );
    if (!up) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
});

test("the board draws kept takes as stacks: stages across with counts, rows down, a return's v2", async ({ page }) => {
  await page.goto("/audio?s=arrange");
  const grid = page.getByRole("grid", { name: "arrange board" });
  await expect(grid).toBeVisible();
  for (const st of ["pending", "remaster", "edit", "finalized"]) await expect(grid.getByRole("columnheader", { name: new RegExp(`^${st}`) })).toBeVisible();
  const kept = takes().filter((t) => t.kind === "music" && t.verdict === "kept");
  const heads = kept.filter((t) => !kept.some((y) => y.parentId === t.id));
  await expect(page.locator("[data-card]")).toHaveCount(heads.length);
  await expect(page.getByRole("button", { name: /^versions of / }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /^arrange/ })).toHaveAttribute("aria-current", "page");
  await shot(page, "audio-arrange-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(grid).toBeVisible();
  await shot(page, "audio-arrange-390");
});

test("a card dragged one stage on lands in the store, with one take.moved event", async ({ page }) => {
  const t = headIn("pending");
  await page.goto("/audio?s=arrange");
  await drag(page, card(page, t.id), cell(page, "remaster", t.group));
  await expect.poll(() => take(t.id)?.stage).toBe("remaster");
  await expect(cell(page, "remaster", t.group).locator(`[data-card="${t.id}"]`)).toBeVisible();
  await expect.poll(() => events("take.moved").filter((e) => e.subject === t.id).length).toBe(1);
});

test("a move the store refuses rolls back, and the store's sentence stays over the board", async ({ page }) => {
  const t = headIn("pending");
  await page.goto("/audio?s=arrange");
  // Behind the page's back the card moves to edit: the page still draws it pending.
  writeTakes(takes().map((x) => (x.id === t.id ? { ...x, stage: "edit" } : x)));
  await drag(page, card(page, t.id), cell(page, "remaster", t.group));
  await expect(page.getByRole("region", { name: "arrange" }).getByRole("alert")).toContainText(`${t.title} · refused · ${t.title} moved since it was picked up: it is in edit`);
  await expect(cell(page, "remaster", t.group).locator(`[data-card="${t.id}"]`)).toHaveCount(0);
  expect(take(t.id)?.stage).toBe("edit");
  await shot(page, "audio-arrange-refused");
});

test("finalize asks for the label: empty is refused where it is typed, a label lands it", async ({ page }) => {
  const t = headIn("edit");
  await page.goto("/audio?s=arrange");
  await drag(page, card(page, t.id), cell(page, "finalized", t.group));
  const field = page.getByRole("textbox", { name: "library label" });
  await expect(field).toBeVisible();
  await expect(field).not.toHaveValue("");
  await field.fill("");
  await page.getByRole("button", { name: "Finalize", exact: true }).click();
  await expect(page.getByRole("region", { name: "arrange" }).getByRole("alert")).toContainText("a finalized take needs a library label");
  expect(take(t.id)?.stage).toBe("edit");
  await shot(page, "audio-arrange-label");
  await field.fill("Ambient · night");
  await page.getByRole("button", { name: "Finalize", exact: true }).click();
  await expect.poll(() => [take(t.id)?.stage, take(t.id)?.label]).toEqual(["finalized", "Ambient · night"]);
  await expect.poll(() => events("take.finalized").filter((e) => e.subject === t.id).length).toBe(1);
});

test("a Suno return dropped on a remaster card becomes the stack's next version", async ({ page }) => {
  const t = headIn("remaster");
  // The card's version number after the return: its chain's length, plus the return.
  let n = 1;
  for (let up = t.parentId; up !== null; up = take(up)?.parentId ?? null) n += 1;
  const before = takes().length;
  await page.goto("/audio?s=arrange");
  const wav = readFileSync(path.join(SOUND(), String((t["file"] as { path: string }).path)));
  await page.getByLabel(`return for ${t.title}, moves to edit`).setInputFiles({ name: "remaster-1.wav", mimeType: "audio/wav", buffer: wav });
  await expect.poll(() => takes().length).toBe(before + 1);
  const v2 = takes().find((x) => x.parentId === t.id);
  expect(v2).toMatchObject({ origin: "suno-return", verdict: "kept", stage: "edit", group: t.group });
  await expect(page.getByRole("button", { name: `versions of ${t.title}` })).toBeVisible();
  await expect(card(page, v2?.id ?? "")).toHaveAttribute("aria-label", `${t.title}, v${n + 1}`);
  await shot(page, "audio-arrange-returned");
});

test("the kind seam: effects have their own rows, and the effects composer names its engines", async ({ page }) => {
  await page.goto("/audio?s=arrange&kind=sfx");
  await expect(page.getByRole("rowheader").filter({ hasText: "impacts" })).toBeVisible();
  await page.goto("/audio?kind=sfx");
  const list = page.getByRole("list", { name: "engines" });
  await expect(list).toContainText("ElevenLabs");
  await expect(list).toContainText("no desk producer");
  await expect(list).toContainText("not installed");
  await shot(page, "audio-effects");
});

test("⇧→ on a focused card moves it one stage on", async ({ page }) => {
  const t = headIn("pending");
  await page.goto("/audio?s=arrange");
  // A focus that lands before hydration is a DOM focus React never heard: the board would hold no
  // focused card and the press would (rightly) decline. Wait for the island, then focus.
  await page.waitForLoadState("networkidle");
  await card(page, t.id).focus();
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => take(t.id)?.stage).toBe("remaster");
  await expect(card(page, t.id)).toBeFocused();
});
