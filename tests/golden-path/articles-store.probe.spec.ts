// LANE — THE ARTICLE RUN STORE AND ITS STATUS MACHINE (lib/articles/store.ts).
//
// What is pinned: the contract's ten statuses, exactly; the legal moves and
// that `updateRun` refuses an illegal one BEFORE writing; that a corrupt
// run.json is refused rather than replaced; that run ids are held to the minted
// shape (a path is built from them); the per-run lock serialising concurrent
// writers; and the driver lease — one live driver per run, a dead one broken.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { test, expect } from "@playwright/test";

import {
  acquireDriver,
  ArticleError,
  canTransition,
  freshRunId,
  inRun,
  listRuns,
  readRun,
  runDir,
  TRANSITIONS,
  updateRun,
  writeNewRun,
} from "@/lib/articles/store";
import { ARTICLE_STATUSES, type ArticleRun, type ArticleStatus } from "@/lib/articles/types";

import { keepEnv } from "./_helpers";

keepEnv(["ARTICLES_STORE_DIR"]);

let root = "";
test.beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "articles-store-"));
  process.env.ARTICLES_STORE_DIR = root;
});
test.afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const mkRun = (id: string, status: ArticleStatus = "queued"): ArticleRun => ({
  id,
  status,
  topic: { kind: "free", text: "probe" },
  promptRef: { file: "pipeline/ARTICLE-POST-PROMPT.md", sha: "0".repeat(64) },
  standard: { recipe: "technical-blog-post-authoring", version: "0.1.0", bundle: "technical-writing", subjects: ["a"], bundleHash: "sha256:x" },
  model: "claude-opus-5",
  effort: "high",
  steps: [],
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
});

async function code(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof ArticleError ? e.code : `other:${(e as Error).message}`;
  }
}

test("statuses: exactly the contract's ten, and every one has a row", () => {
  expect([...ARTICLE_STATUSES]).toEqual([
    "queued", "researching", "drafting", "checking", "awaiting-approval",
    "approved", "landing", "landed", "rejected", "failed",
  ]);
  expect(Object.keys(TRANSITIONS).sort()).toEqual([...ARTICLE_STATUSES].sort());
  for (const to of Object.values(TRANSITIONS).flat()) expect(ARTICLE_STATUSES).toContain(to);
});

test("transitions: terminal states stay put, and nothing lands without approval", () => {
  expect(TRANSITIONS.landed).toEqual([]);
  expect(TRANSITIONS.rejected).toEqual([]);
  // the only door into `landing` is `approved`, and into `approved` the gate or a re-land
  const into = (s: ArticleStatus) => ARTICLE_STATUSES.filter((f) => f !== s && TRANSITIONS[f].includes(s));
  expect(into("landing")).toEqual(["approved"]);
  expect(into("approved").sort()).toEqual(["awaiting-approval", "failed"]);
  expect(into("landed")).toEqual(["landing"]);
  // every working state can fail; the gate and the terminals cannot
  for (const s of ["queued", "researching", "drafting", "checking", "approved", "landing"] as ArticleStatus[]) expect(canTransition(s, "failed")).toBe(true);
  for (const s of ["awaiting-approval", "landed", "rejected"] as ArticleStatus[]) expect(canTransition(s, "failed")).toBe(false);
  expect(canTransition("researching", "awaiting-approval")).toBe(false);
  expect(canTransition("queued", "approved")).toBe(false);
});

test("updateRun: an illegal move is refused and nothing is written", async () => {
  await writeNewRun(mkRun("2026-10-05-a"));
  expect(await code(updateRun("2026-10-05-a", (r) => ({ ...r, status: "approved" })))).toBe("bad-transition");
  expect((await readRun("2026-10-05-a")).status).toBe("queued");
  const moved = await updateRun("2026-10-05-a", (r) => ({ ...r, status: "researching" }), () => new Date("2026-10-05T01:00:00Z"));
  expect(moved.status).toBe("researching");
  expect(moved.updatedAt).toBe("2026-10-05T01:00:00.000Z");
  // the mutator cannot rename the run
  const renamed = await updateRun("2026-10-05-a", (r) => ({ ...r, id: "something-else" }));
  expect(renamed.id).toBe("2026-10-05-a");
});

test("updateRun: concurrent writers are serialised, none is lost", async () => {
  await writeNewRun(mkRun("2026-10-05-b", "awaiting-approval"));
  await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      updateRun("2026-10-05-b", (r) => ({ ...r, steps: [...r.steps, { name: "check", status: "done", startedAt: String(i) }] })),
    ),
  );
  expect((await readRun("2026-10-05-b")).steps).toHaveLength(12);
  expect(existsSync(path.join(root, "2026-10-05-b", ".lock"))).toBe(false);
});

test("a corrupt run.json is refused, never replaced", async () => {
  mkdirSync(path.join(root, "2026-10-05-c"), { recursive: true });
  writeFileSync(path.join(root, "2026-10-05-c", "run.json"), "{ not json");
  expect(await code(readRun("2026-10-05-c"))).toBe("corrupt-file");
  expect(await code(updateRun("2026-10-05-c", (r) => r))).toBe("corrupt-file");
  expect(readFileSync(path.join(root, "2026-10-05-c", "run.json"), "utf8")).toBe("{ not json");
  const { runs, damaged } = await listRuns();
  expect(runs).toEqual([]);
  expect(damaged).toEqual(["2026-10-05-c"]);
});

test("ids: minted shape only; a path cannot escape its run", async () => {
  for (const bad of ["../x", "a/b", "A-B", "", "x".repeat(120), "..", "a b"]) {
    expect(() => runDir(bad), bad).toThrow(ArticleError);
  }
  await writeNewRun(mkRun("2026-10-05-d"));
  expect(() => inRun("2026-10-05-d", "../2026-10-05-e/run.json")).toThrow(/escapes/);
  expect(inRun("2026-10-05-d", "post/index.html")).toBe(path.join(root, "2026-10-05-d", "post", "index.html"));
  const now = new Date("2026-10-05T12:00:00Z");
  expect(await freshRunId("Token Tax: Why?", now)).toBe("2026-10-05-token-tax-why");
  mkdirSync(path.join(root, "2026-10-05-token-tax-why"));
  expect(await freshRunId("Token Tax: Why?", now)).toBe("2026-10-05-token-tax-why-2");
  expect(await code(writeNewRun(mkRun("2026-10-05-d")))).toBe("exists");
});

test("listRuns: newest first", async () => {
  await writeNewRun({ ...mkRun("2026-10-05-old"), createdAt: "2026-10-01T00:00:00.000Z" });
  await writeNewRun({ ...mkRun("2026-10-05-new"), createdAt: "2026-10-04T00:00:00.000Z" });
  expect((await listRuns()).runs.map((r) => r.id)).toEqual(["2026-10-05-new", "2026-10-05-old"]);
});

test("driver lease: one live driver; a dead driver's lease is broken", async () => {
  await writeNewRun(mkRun("2026-10-05-f"));
  const lease = await acquireDriver("2026-10-05-f");
  expect(await code(acquireDriver("2026-10-05-f"))).toBe("busy");
  await lease.release();
  // a lease left by a process that no longer exists
  writeFileSync(path.join(root, "2026-10-05-f", ".driver"), JSON.stringify({ pid: 2 ** 22 + 12345, at: "x" }));
  const again = await acquireDriver("2026-10-05-f");
  await again.release();
});
