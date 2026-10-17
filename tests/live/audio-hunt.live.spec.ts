// LANE - THE AUDIO DESK'S HUNT AND LESSONS, DRIVEN IN A BROWSER (Phase 6, L65; the render a Run, L72).
//
// Owner ruling 2026-10-17: the Sound lab's Hunt and Lessons are rebuilt in /audio. Driven here,
// against the real sound store in a seeded fixture universe, a kernel store beside it, the text
// engine stubbed (SOUND_HUNT_ENGINE=stub: no seat is asked) and GRAVITONE_DRY_ONLY (no vendor):
//   · the shelf draws the fixture hunts as mini-maps; `?h=` opens one whole, a failed leaf's
//     engine words verbatim - at 1440 and at 390;
//   · an idea drafts a map (one hunt.drafted event) and the URL opens it;
//   · picked leaves are priced by a RECEIPT in seconds of audio that writes nothing; ⏎ confirms:
//     ONE dry kernel job on cloud.elevenlabs, the leaves heard by stand-in takes filed against
//     the hunt, no vendor asked;
//   · the crown keeps the take (pending, so Arrange has it) in one store write and one event;
//   · a lesson is never written without the sign: a claim without its "because" is refused where
//     it is typed and nothing is written; the sign appends it, links the hunt, records one
//     lesson.confirmed, and the lessons section lists it.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/audio-hunt.live.spec.ts
//   AUDIO_HUNT_PORT (default 3253), AUDIO_HUNT_DIST (default .next-l65), AUDIO_HUNT_TMP (the parent
//   of the universe; default the OS temp dir), AUDIO_HUNT_SHOTS=<dir> saves the screens.

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["AUDIO_HUNT_PORT"] ?? 3253);
const DIST = process.env["AUDIO_HUNT_DIST"] ?? ".next-l65";
const SHOTS = process.env["AUDIO_HUNT_SHOTS"];
const BASE = `http://localhost:${PORT}`;
const CLI = path.join(ROOT, "pipeline", "ledger-sync.mts");

let U = "";
let server: ChildProcess | undefined;
const SOUND = () => path.join(U, "fixtures-out", "sound");
const STORE = () => path.join(U, "store.sqlite");
const LEDGER = () => path.join(U, "ledger.json");

type Node = { id: string; parentId: string | null; label: string; provider: string; prompt: string; state: string; takeIds: string[]; winner: boolean; error: string | null };
type HuntRow = { id: string; kind: string; idea: string; nodes: Node[]; lessonId: string | null };
type Take = { id: string; verdict: string; stage: string | null; huntId: string | null; nodeId: string | null; origin: string };
const read = <T,>(f: string): T => JSON.parse(readFileSync(f, "utf8")) as T;
const hunts = (): HuntRow[] => read<{ hunts: HuntRow[] }>(path.join(SOUND(), "hunts.json")).hunts;
const hunt = (id: string): HuntRow | undefined => hunts().find((h) => h.id === id);
const takes = (): Take[] => read<{ takes: Take[] }>(path.join(SOUND(), "takes.json")).takes;
const lessons = (): { id: string; claim: string; huntId: string | null }[] => read<{ lessons: { id: string; claim: string; huntId: string | null }[] }>(LEDGER()).lessons;

function rows(sql: string, ...args: string[]): Record<string, unknown>[] {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    return db.prepare(sql).all(...args) as Record<string, unknown>[];
  } finally {
    db.close();
  }
}
const events = (type: string): { subject: string; data: string }[] => rows("SELECT subject_id AS subject, data FROM events WHERE type = ? ORDER BY seq", type) as { subject: string; data: string }[];

let ENV: NodeJS.ProcessEnv = { ...process.env };

function universe(): void {
  U = mkdtempSync(path.join(process.env["AUDIO_HUNT_TMP"] ?? tmpdir(), "gt-audio-hunt-"));
  const seedEnv: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "SOUND_LEDGER_PATH", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR"]) delete seedEnv[v];
  execFileSync(process.execPath, [CLI, "seed-fixtures"], { cwd: U, env: seedEnv, encoding: "utf8" });
  // The sound ledger is a temp copy of the seeded one: a lesson is appended to it, and the tracked
  // pipeline/sound/ledger.json belongs to another session.
  const seeded = path.join(U, "fixtures-out", "sound-ledger.json");
  writeFileSync(LEDGER(), existsSync(seeded) ? readFileSync(seeded, "utf8") : JSON.stringify({ verdicts: [], lessons: [] }));
  // The hunt and lesson prompts are code read from <cwd>/pipeline (lib/sound/hunt.ts promptFile),
  // and the server's cwd is the universe.
  mkdirSync(path.join(U, "pipeline"), { recursive: true });
  for (const f of ["SOUND-HUNT-PROMPT.md", "SOUND-LESSON-PROMPT.md"]) copyFileSync(path.join(ROOT, "pipeline", f), path.join(U, "pipeline", f));
  ENV = { ...process.env };
  for (const v of ["FOUNDRY_DIR", "PUBLISH_STORE_DIR", "CLIP_STORE_DIR", "GPU_LEASE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR", "GRAVITONE_PRODUCE_SIDE"]) delete ENV[v];
  Object.assign(ENV, {
    NEXT_PUBLIC_GRAVITONE_DATA: "fixtures",
    NEXT_PUBLIC_DEV_AUTH: "1",
    NEXT_DIST_DIR: DIST,
    GRAVITONE_STORE_PATH: STORE(),
    SOUND_STORE_DIR: SOUND(),
    SOUND_LEDGER_PATH: LEDGER(),
    STRIPS_STORE_DIR: path.join(U, "strips"),
    PUBLISH_STORE_DIR: path.join(U, "publish"),
    SPEND_STORE_DIR: path.join(U, "spend"),
    GRAVITONE_DRY_ONLY: "1",
    SOUND_HUNT_ENGINE: "stub",
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

const leaves = (h: HuntRow): Node[] => h.nodes.filter((n) => !h.nodes.some((m) => m.parentId === n.id) && n.prompt !== "");

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
  await ready(`${BASE}/audio?s=hunt`, 240_000);
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

let drafted = "";

test("the shelf draws past hunts as mini-maps; ?h= opens one whole, a failure in its own words", async ({ page }) => {
  const music = hunts().filter((h) => h.kind === "music");
  const failed = music.flatMap((h) => h.nodes.filter((n) => n.error !== null).map((n) => ({ h, n })))[0];
  if (failed === undefined) throw new Error("the fixtures carry no failed music leaf");
  await page.goto("/audio?s=hunt");
  await expect(page.getByRole("list", { name: "past hunts" }).getByRole("link")).toHaveCount(music.length);
  await shot(page, "audio-hunt-shelf");
  await page.getByRole("list", { name: "past hunts" }).getByRole("link", { name: new RegExp(`^${failed.h.idea.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
  await expect(page).toHaveURL(new RegExp(`h=${failed.h.id}`));
  const map = page.getByRole("group", { name: "hunt map" });
  await expect(map).toBeVisible();
  await expect(map.locator("[data-leaf]")).toHaveCount(leaves(failed.h).length);
  await expect(map).toContainText(failed.n.error ?? "");
  await shot(page, "audio-hunt-open-1440");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(map).toBeVisible();
  await shot(page, "audio-hunt-open-390");
});

test("an idea drafts a map through the text engine, and the URL opens it", async ({ page }) => {
  const before = hunts().length;
  await page.goto("/audio?s=hunt");
  await page.getByRole("textbox", { name: "music hunt idea" }).fill("a calm bed under a two-minute product walkthrough");
  await page.getByRole("button", { name: "Draft the map" }).click();
  await expect(page).toHaveURL(/h=hn-/);
  drafted = new URL(page.url()).searchParams.get("h") ?? "";
  expect(hunts()).toHaveLength(before + 1);
  const h = hunt(drafted);
  expect(h?.idea).toBe("a calm bed under a two-minute product walkthrough");
  await expect(page.getByRole("group", { name: "hunt map" }).locator("[data-leaf]")).toHaveCount(h === undefined ? -1 : leaves(h).length);
  expect(events("hunt.drafted").filter((e) => e.subject === drafted)).toHaveLength(1);
});

test("picked leaves are a receipt that writes nothing; ⏎ renders them dry as one job", async ({ page }) => {
  const h = hunt(drafted);
  if (h === undefined) throw new Error("no drafted hunt");
  const el = leaves(h).filter((n) => n.provider === "elevenlabs").slice(0, 2);
  await page.goto(`/audio?s=hunt&h=${drafted}`);
  const map = page.getByRole("group", { name: "hunt map" });
  await map.getByRole("button", { name: el[0]?.label ?? "", exact: true }).click();
  await map.getByRole("button", { name: el[1]?.label ?? "", exact: true }).click({ modifiers: ["Control"] });
  const takesBefore = takes().length;
  await page.getByRole("group", { name: "render the selection" }).getByRole("button", { name: "Render" }).click();
  await expect(page.getByRole("region", { name: "receipt, 2 lines, dry" })).toBeVisible();
  expect(takes()).toHaveLength(takesBefore);
  expect(rows("SELECT id FROM jobs WHERE substr(id, 1, ?) = ?", String(`job:run:hunt.${drafted}.`.length), `job:run:hunt.${drafted}.`)).toHaveLength(0);
  await shot(page, "audio-hunt-receipt");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/hunt · 2 leaves · done/)).toBeVisible({ timeout: 60_000 });
  const jobs = rows("SELECT id, lane, state, record FROM jobs WHERE substr(id, 1, ?) = ?", String(`job:run:hunt.${drafted}.`.length), `job:run:hunt.${drafted}.`);
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ lane: "cloud.elevenlabs", state: "done" });
  // A Run like every launch (L72): its row names the hunt producer and the leaves it rendered.
  const run = rows("SELECT record FROM runs WHERE job_id = ?", String(jobs[0]?.["id"]));
  expect(run).toHaveLength(1);
  const record = JSON.parse(String(run[0]?.["record"])) as { input: { leaves: string[] } };
  expect(record).toMatchObject({ producer: "hunt", lane: "audio", recipe: "track/music", input: { producer: "hunt", hunt: drafted } });
  expect([...record.input.leaves].sort()).toEqual(el.map((n) => n.id).sort());
  expect(String(jobs[0]?.["record"])).toContain('"kind":"dry"');
  const filed = takes().filter((t) => t.huntId === drafted);
  expect(filed.map((t) => t.nodeId).sort()).toEqual(el.map((n) => n.id).sort());
  expect(filed.every((t) => t.origin === "hunt" && t.verdict === "unjudged")).toBe(true);
  for (const n of el) expect(hunt(drafted)?.nodes.find((x) => x.id === n.id)).toMatchObject({ state: "rendered", error: null });
  await expect(page.getByRole("group", { name: "audition" }).getByRole("button", { name: /^play / })).toHaveCount(2);
  await shot(page, "audio-hunt-heard");
});

test("the crown keeps the take, pending, in one write and one event", async ({ page }) => {
  const h = hunt(drafted);
  const w = h?.nodes.find((n) => n.state === "rendered");
  if (h === undefined || w === undefined) throw new Error("nothing heard");
  await page.goto(`/audio?s=hunt&h=${drafted}`);
  await page.locator(`[data-leaf="${w.id}"]`).getByRole("button", { name: "Crown" }).click();
  await expect.poll(() => hunt(drafted)?.nodes.find((n) => n.id === w.id)?.winner).toBe(true);
  const t = takes().find((x) => x.id === w.takeIds[w.takeIds.length - 1]);
  expect(t).toMatchObject({ verdict: "kept" });
  expect(t?.stage ?? "pending").toBe("pending");
  expect(events("hunt.crowned").filter((e) => e.subject === drafted)).toHaveLength(1);
});

test("a lesson is never written without the sign; the sign appends, links and records it", async ({ page }) => {
  const before = lessons().length;
  await page.goto(`/audio?s=hunt&h=${drafted}`);
  await page.getByRole("button", { name: "Write it myself" }).click();
  const claim = page.getByRole("textbox", { name: "the lesson, one sentence" });
  await claim.fill("When the bed sits under a walkthrough, lock the tempo");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect(page.getByRole("region", { name: "lesson" }).getByRole("alert")).toContainText("say why");
  expect(lessons()).toHaveLength(before);
  await shot(page, "audio-hunt-lesson");
  await claim.fill("When the bed sits under a walkthrough, lock the tempo, because the unlocked leaf drifted.");
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await expect.poll(() => lessons().length).toBe(before + 1);
  const l = lessons()[before];
  expect(l).toMatchObject({ huntId: drafted, claim: "When the bed sits under a walkthrough, lock the tempo, because the unlocked leaf drifted." });
  expect(hunt(drafted)?.lessonId).toBe(l?.id);
  expect(events("lesson.confirmed").filter((e) => e.subject === l?.id)).toHaveLength(1);
  await page.goto("/audio?s=lessons");
  await expect(page.getByRole("list", { name: "signed lessons" })).toContainText("because the unlocked leaf drifted");
  await shot(page, "audio-lessons");
});
