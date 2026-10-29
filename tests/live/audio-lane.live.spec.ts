// LANE - THE AUDIO LANE'S COMPOSER AND THE SUNO DOOR, DRIVEN IN A BROWSER (Phase 5, L52).
//
// Owner ruling 2026-10-17: v1's Library Audio tab (the Recipe Book) is rebuilt as the Audio lane's
// composer surface, and the Floor's audio composer launches from a sentence. Driven here:
//   · the Floor's audio composer, which until Phase 5 refused its confirm, launches a sentence:
//     the dry stand-in (no text turn), a suno.json record and ONE dry box.chrome kernel job.
// (/audio's own composer - terms, seed, variations, Send to Suno - retired with spark
// audio-agent-studio stage S2: /audio's compose section is the agent studio now.)
// /kit is not walked here: it reads tokens/source.json from the server's working directory, which
// in this universe is the temp dir; tests/live/kit.live.spec.ts walks every @gt/ui export there.
//
// ITS OWN SERVER, ITS OWN UNIVERSE (produce-real.live.spec.ts's shape): the fixture universe is
// seeded into a temp directory and `next dev` runs there; the kernel store, the sound store and
// the sound ledger are all in it. GRAVITONE_DRY_ONLY everywhere: nothing spends, no browser
// reaches suno.com, no text turn runs.
//
// Run: npx playwright test -c playwright.live.config.ts tests/live/audio-lane.live.spec.ts
//   AUDIO_LANE_PORT (default 3234) and AUDIO_LANE_DIST (default .next-fixtures, already in tsconfig's include; the produce lanes share it, so run them one at a time) pick the server;
//   AUDIO_LANE_SHOTS=<dir> saves the screens it walks.

import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { expect, test, type Page } from "@playwright/test";

const ROOT = process.cwd();
const PORT = Number(process.env["AUDIO_LANE_PORT"] ?? 3234);
const DIST = process.env["AUDIO_LANE_DIST"] ?? ".next-fixtures";
const SHOTS = process.env["AUDIO_LANE_SHOTS"];
const BASE = `http://localhost:${PORT}`;
const CLI = path.join(ROOT, "pipeline", "ledger-sync.mts");

let U = "";
let server: ChildProcess | undefined;
const STORE = () => path.join(U, "store.sqlite");
const SOUND = () => path.join(U, "fixtures-out", "sound");

type Take = { id: string; kind: string; origin: string; verdict: string; createdAt: string; [k: string]: unknown };

/** The judged fixture takes as ledger rows: the vocabulary the terms column is derived from. */
function ledgerFromTakes(): string {
  const takes = (JSON.parse(readFileSync(path.join(SOUND(), "takes.json"), "utf8")) as { takes: Take[] }).takes;
  const verdicts = takes
    .filter((t) => t.origin !== "fixture" && t.verdict !== "unjudged")
    .map((t) => ({ takeId: t.id, kind: t.kind, provider: t["provider"], op: t["op"], origin: t.origin, technique: t["technique"] ?? [], terms: t["terms"], prompt: t["prompt"] ?? "", negative: null, durationS: t["durationS"] ?? null, verdict: t.verdict, ratings: t["ratings"] ?? {}, score: null, reasons: t["reasons"] ?? [], huntId: null, parentId: null, judgedAt: t.createdAt }));
  const file = path.join(U, "ledger.json");
  writeFileSync(file, JSON.stringify({ verdicts, lessons: [] }));
  return file;
}

let ENV: NodeJS.ProcessEnv = { ...process.env };

function universe(): void {
  U = mkdtempSync(path.join(tmpdir(), "gt-audio-lane-"));
  const seedEnv: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_GRAVITONE_DATA: "fixtures" };
  for (const v of ["GRAVITONE_STORE_PATH", "FOUNDRY_DIR", "SOUND_STORE_DIR", "ARTICLES_STORE_DIR", "STRIPS_STORE_DIR"]) delete seedEnv[v];
  execFileSync(process.execPath, [CLI, "seed-fixtures"], { cwd: U, env: seedEnv, encoding: "utf8" });
  ENV = { ...process.env };
  for (const v of ["FOUNDRY_DIR", "PUBLISH_STORE_DIR", "CLIP_STORE_DIR", "GPU_LEASE_DIR", "TEXT_TURN_DIR", "SPEND_STORE_DIR", "GRAVITONE_PRODUCE_SIDE"]) delete ENV[v];
  Object.assign(ENV, {
    NEXT_PUBLIC_GRAVITONE_DATA: "fixtures",
    NEXT_PUBLIC_DEV_AUTH: "1",
    NEXT_DIST_DIR: DIST,
    GRAVITONE_STORE_PATH: STORE(),
    SOUND_STORE_DIR: SOUND(),
    SOUND_LEDGER_PATH: ledgerFromTakes(),
    STRIPS_STORE_DIR: path.join(U, "strips"),
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
    if (Date.now() > until) throw new Error(`the audio lane server never answered ${url}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}

const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOTS !== undefined) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

function sunoJobs(): { id: string; proposalId: string; state: string; job?: string }[] {
  return (JSON.parse(readFileSync(path.join(SOUND(), "suno.json"), "utf8")) as { jobs: { id: string; proposalId: string; state: string; job?: string }[] }).jobs;
}

function kernelJob(id: string): { producer: string; lane: string; mode: string } | undefined {
  const db = new DatabaseSync(STORE(), { readOnly: true });
  try {
    const row = db.prepare("SELECT lane, record FROM jobs WHERE id = ?").get(id) as { lane: string; record: string } | undefined;
    if (row === undefined) return undefined;
    const rec = JSON.parse(row.record) as { producer?: string; mode?: { kind?: string } };
    return { producer: rec.producer ?? "?", lane: row.lane, mode: rec.mode?.kind ?? "?" };
  } finally {
    db.close();
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
  await ready(`${BASE}/audio`, 240_000);
});

test.afterAll(() => {
  // By PID, the tree this spec spawned and nothing else (never by image name).
  if (server?.pid !== undefined) {
    if (process.platform === "win32") execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
  rmSync(U, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
});

test("the Floor's audio composer launches a sentence as a Suno take (dry: no text turn)", async ({ page }) => {
  await page.goto("/floor?lane=audio");
  const box = page.getByPlaceholder("A bed that holds a full minute…");
  await box.fill("A bed that holds a full minute under the narrator.");
  await box.press("Enter");
  await expect(page.getByText("Render box · Chrome")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/launched · suno\.sj-floor-/)).toBeVisible();
  const j = sunoJobs().find((x) => x.id.startsWith("sj-floor-"));
  if (j === undefined) throw new Error("no Floor record");
  expect(kernelJob(`job:run:suno.${j.id}`)).toEqual({ producer: "suno", lane: "box.chrome", mode: "dry" });
  await shot(page, "floor-audio-launched");
});
