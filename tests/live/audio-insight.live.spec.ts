// LANE - THE AUDIO DESK'S STRENGTHS, RUBRIC AND BATCH, DRIVEN IN A BROWSER (Phase 6, L66).
//
// Owner ruling 2026-10-17: every Sound lab tool is absorbed into /audio. Driven here, against the
// real sound store in a seeded fixture universe and a kernel store beside it:
//   · strengths: the provider × value table draws a cell under three judged takes as "waiting"
//     with no figure, and a picked cell's lesson draft states its evidence;
//   · rubric: a judged take is scored by pressing a step - the score lands in takes.json and as
//     ONE take.rated event - and a take that missed its asked tempo says so beside its rubric;
//   · batch: a music batch is a receipt that writes nothing, then N dry Suno drafts under one
//     confirm; an effect batch names why no engine on the desk makes effects.
// GRAVITONE_DRY_ONLY everywhere: nothing spends.
//
// NEEDS the Director's desk rows (strengths, rubric, batch in app/(studio)/audio/_audio/desk.ts and
// their cases in ../page.tsx) - the sections are unreachable before them.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/audio-insight.live.spec.ts
//   AUDIO_INSIGHT_PORT (default 3254), AUDIO_INSIGHT_DIST (default .next-l66), AUDIO_INSIGHT_TMP
//   (the parent of the universe; default the OS temp dir), AUDIO_INSIGHT_SHOTS=<dir> saves screens.

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["AUDIO_INSIGHT_PORT"] ?? 3254);
const DIST = process.env["AUDIO_INSIGHT_DIST"] ?? ".next-l66";
const SHOTS = process.env["AUDIO_INSIGHT_SHOTS"];
const BASE = `http://localhost:${PORT}`;
const CLI = path.join(ROOT, "pipeline", "ledger-sync.mts");

let U = "";
let server: ChildProcess | undefined;
const SOUND = () => path.join(U, "fixtures-out", "sound");
const STORE = () => path.join(U, "store.sqlite");

type Take = { id: string; title: string; kind: string; origin: string; verdict: string; tempoBpm: number | null; ratings: Record<string, number | null>; measured: unknown; [k: string]: unknown };
const takes = (): Take[] => (JSON.parse(readFileSync(path.join(SOUND(), "takes.json"), "utf8")) as { takes: Take[] }).takes;
const writeTakes = (t: Take[]): void => writeFileSync(path.join(SOUND(), "takes.json"), JSON.stringify({ version: 1, takes: t }));
const sunoJobs = (): { id: string; job?: string }[] => (existsSync(path.join(SOUND(), "suno.json")) ? (JSON.parse(readFileSync(path.join(SOUND(), "suno.json"), "utf8")) as { jobs: { id: string; job?: string }[] }).jobs : []);

function events(type: string): { subject: string }[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare("SELECT subject_id AS subject FROM events WHERE type = ? ORDER BY seq").all(type) as { subject: string }[];
  } finally {
    db.close();
  }
}

let ENV: NodeJS.ProcessEnv = { ...process.env };
/** The judged music take the rubric case scores, briefed at 120 bpm and measured at 96. */
let MISSED = "";

function universe(): void {
  U = mkdtempSync(path.join(process.env["AUDIO_INSIGHT_TMP"] ?? tmpdir(), "gt-audio-insight-"));
  const seedEnv: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR"]) delete seedEnv[v];
  execFileSync(process.execPath, [CLI, "seed-fixtures"], { cwd: U, env: seedEnv, encoding: "utf8" });
  // A judged take that ignored its asked tempo, so the brief check has something to say.
  const all = takes();
  const judged = all.find((t) => t.kind === "music" && t.verdict !== "unjudged");
  if (judged === undefined) throw new Error("the fixture universe has no judged music take");
  MISSED = judged.id;
  writeTakes(all.map((t) => (t.id === MISSED ? { ...t, tempoBpm: 120, ratings: {}, measured: { tempoBpm: 96, key: null, durationS: null, lufs: null, truePeakDb: null, energy: null } } : t)));
  // The sound ledger is a temp file: the tracked pipeline/sound/ledger.json belongs to another session.
  const ledger = path.join(U, "ledger.json");
  // Its verdict rows are the seeded takes' own judgments (what `sound.mts judge` writes), so the
  // strengths table has cells to draw - an empty ledger would leave it all ghosts.
  const rows = takes()
    .filter((t) => t.verdict !== "unjudged")
    .map((t) => ({
      takeId: t.id, kind: t.kind, provider: t["provider"] ?? "local", op: t["op"] ?? "manual", origin: t.origin,
      technique: t["technique"] ?? [], terms: t["terms"] ?? { genre: [], mood: [], instrument: [], sfxCategory: null },
      prompt: t["prompt"] ?? "", negative: t["negative"] ?? null, durationS: t["durationS"] ?? null, verdict: t.verdict,
      ratings: t.ratings ?? {}, score: null, reasons: t["reasons"] ?? [], huntId: t["huntId"] ?? null, parentId: t["parentId"] ?? null,
      judgedAt: t["judgedAt"] ?? "2026-10-12T00:00:00.000Z",
    }));
  writeFileSync(ledger, JSON.stringify({ verdicts: rows, lessons: [] }));
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
  await ready(`${BASE}/audio?s=strengths`, 240_000);
});

test.afterAll(async () => {
  // By PID, the tree this spec spawned and nothing else (never by image name).
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
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

test("strengths: a cell under three takes waits with no figure; a picked cell drafts its lesson from its evidence", async ({ page }) => {
  await page.goto("/audio?s=strengths");
  const table = page.getByRole("region", { name: "provider strengths" });
  await expect(table).toBeVisible();
  await expect(page.getByRole("link", { name: /^strengths/ })).toHaveAttribute("aria-current", "page");
  const cells = table.getByRole("button", { name: / on / });
  await expect(cells.first()).toBeVisible();
  // Every waiting cell says how many more it needs, and none of them carries a rate.
  const waiting = table.getByRole("button", { name: /judged, \d more before a rate$/ });
  for (const c of await waiting.all()) await expect(c).not.toContainText("%");
  await shot(page, "audio-strengths-1440");
  const measured = table.getByRole("button", { name: /: kept \d+% of \d+/ });
  if ((await measured.count()) > 0) {
    await measured.first().click();
    await expect(page.getByRole("textbox", { name: "lesson claim" })).toHaveValue(/^When .*because .*kept \d+ of \d+/);
    await shot(page, "audio-strengths-cell");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(table).toBeVisible();
  await shot(page, "audio-strengths-390");
});

test("rubric: a pressed step lands in takes.json and as one take.rated event; the brief's miss is beside the take", async ({ page }) => {
  await page.goto("/audio?s=rubric");
  const t = page.locator(`[data-take="${MISSED}"]`);
  await expect(t).toBeVisible();
  await expect(t.getByRole("listitem", { name: "tempo asked 120 bpm, measured 96 bpm, −24 bpm" })).toBeVisible();
  await shot(page, "audio-rubric-1440");
  await t.getByRole("button", { name: "melody 8" }).click();
  await expect.poll(() => takes().find((x) => x.id === MISSED)?.ratings["melody"]).toBe(8);
  await expect(t.getByRole("button", { name: "melody 8" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => events("take.rated").filter((e) => e.subject === MISSED).length).toBe(1);
});

test("batch: music is a receipt that writes nothing, then N dry Suno drafts; effects price through the sfx producer", async ({ page }) => {
  await page.goto("/audio?s=batch");
  const before = sunoJobs().length;
  await page.getByRole("textbox").first().fill("slow synthwave, warm pads");
  await page.getByRole("button", { name: /^Price 2 × take/ }).click();
  await expect(page.getByText("Render box · Chrome").first()).toBeVisible();
  expect(sunoJobs().length).toBe(before);
  await shot(page, "audio-batch-receipt");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/batch · suno · 2 jobs/)).toBeVisible();
  const made = sunoJobs().slice(before);
  expect(made.map((j) => j.job)).toEqual(made.map((j) => `job:run:suno.${j.id}`));
  expect(made).toHaveLength(2);
  await page.goto("/audio?s=batch&kind=sfx");
  // Effects are made on the desk since the registry names ElevenLabs as their maker (the sfx producer).
  await expect(page.getByRole("region", { name: "batch" }).first()).not.toContainText("makes no sfx batch on this desk");
  await expect(page.getByRole("button", { name: /^Price / })).toBeVisible();
  await shot(page, "audio-batch-sfx");
});
