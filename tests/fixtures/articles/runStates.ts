// SEEDED ARTICLE RUNS, ONE PER STATE — for the /articles surface's probes and
// its browser drive (tests/golden-path/articles-ui.probe.spec.ts).
//
// The engine can only take a run to the gate and past it by doing the work, and
// the in-between states (a step mid-flight, a seat limit, a red registry gate)
// are exactly the ones nobody wants to cause on purpose. So: one real run is
// driven to `awaiting-approval` by the engine (stub agent, throwaway registry —
// tests/golden-path/_articles.ts), and this file CLONES its directory once per
// state and rewrites the clone's run.json to say where it stopped, removing the
// files a run in that state would not have yet.
//
// The manifests are written directly, NOT through lib/articles/store.ts
// updateRun: half of these states are unreachable by a legal transition from a
// run at the gate (a run cannot go back to `researching`). That is the point of
// a fixture; nothing here is a claim about what the engine would do.
//
// `.driver` is the store's lease file. A state seeded with `driverPid` gets one
// naming that process, so it reads as being driven (a live pid) — pass the pid
// of a process that outlives the read, e.g. the test runner's own.

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ArticleRun } from "@/lib/articles/types";

export type SeedState =
  | "researching"
  | "drafting"
  | "stalled"
  | "failed"
  | "unreachable"
  | "gate"
  | "landing"
  | "landed"
  | "land-failed"
  | "rejected";

export const SEED_STATES: readonly SeedState[] = ["researching", "drafting", "stalled", "failed", "unreachable", "gate", "landing", "landed", "land-failed", "rejected"];

const AT = (min: number) => new Date(Date.UTC(2026, 9, 5, 9, min, 0)).toISOString();

/** Clone `templateId` (a run at the gate under `store`) into one run per state.
 *  Returns state -> run id. */
export function seedRunStates(store: string, templateId: string, opts: { driverPid?: number; now?: Date } = {}): Record<SeedState, string> {
  const src = path.join(store, templateId);
  const base = JSON.parse(readFileSync(path.join(src, "run.json"), "utf8")) as ArticleRun;
  const now = (opts.now ?? new Date()).toISOString();
  const out = {} as Record<SeedState, string>;

  for (const state of SEED_STATES) {
    const id = `${templateId}-${state}`.slice(0, 90);
    const dir = path.join(store, id);
    rmSync(dir, { recursive: true, force: true });
    cpSync(src, dir, { recursive: true, filter: (f) => !/[\\/]\.(lock|driver)$/.test(f) });
    const drop = (...rels: string[]) => rels.forEach((r) => rmSync(path.join(dir, r), { recursive: true, force: true }));
    const done = (name: ArticleRun["steps"][number]["name"], a: number, b: number, costUsd?: number) => ({ name, status: "done" as const, startedAt: AT(a), endedAt: AT(b), ...(costUsd !== undefined ? { costUsd } : {}) });
    const research = done("research", 0, 7, 1.2431);
    const outline = done("outline", 7, 9, 0.2107);
    const draft = done("draft", 9, 21, 1.8022);
    const check = done("check", 21, 22);
    const approval = { at: AT(40), patches: ["p1"] };
    const landingBase = { slug: "a-stub-post-about-tokens", branch: "article/a-stub-post-about-tokens" };

    let run: ArticleRun = { ...base, id, steps: [research, outline, draft, check], updatedAt: now };
    switch (state) {
      case "researching":
        drop("sources.json", "claims.json", "outline.md", "post", "check.json", "check", "patches.json", "patches", "patches.rejected.json", "agent");
        run = { ...run, status: "researching", steps: [{ name: "research", status: "running", startedAt: AT(0) }] };
        break;
      case "drafting":
      case "stalled":
        drop("outline.md", "post", "check.json", "check", "patches.json", "patches", "patches.rejected.json");
        run = { ...run, status: "drafting", steps: [research, { name: "outline", status: "running", startedAt: AT(7) }], updatedAt: state === "stalled" ? AT(8) : now };
        break;
      case "failed":
        drop("post", "check.json", "check", "patches.json", "patches", "patches.rejected.json");
        run = { ...run, status: "failed", steps: [research, outline, { name: "draft", status: "failed", startedAt: AT(9), endedAt: AT(10), costUsd: 0.0412 }], error: "draft: the agent seat-limit: Claude AI usage limit reached" };
        mkdirSync(path.join(dir, "agent"), { recursive: true });
        writeFileSync(path.join(dir, "agent", "draft.json"), JSON.stringify({ turn: "article-draft", outcome: "seat-limit", turns: 2, durationMs: 41000, exitCode: 1, costUsd: 0.0412, errors: ["Claude AI usage limit reached"], final: "" }, null, 2));
        break;
      case "unreachable":
        drop("sources.json", "claims.json", "outline.md", "post", "check.json", "check", "patches.json", "patches", "patches.rejected.json", "agent");
        run = { ...run, status: "failed", steps: [], standard: { recipe: "technical-blog-post-authoring", bundle: "technical-writing", subjects: [] }, error: "registry-unreachable: no registry found; tried ../ai-registry (../ai-registry)." };
        break;
      case "gate":
        run = { ...run, status: "awaiting-approval" };
        break;
      case "landing":
        run = { ...run, status: "landing", approval, landing: { ...landingBase, gates: [{ lane: "publications", mode: "write", ok: true }], medium: "medium" } };
        break;
      case "landed":
        run = {
          ...run,
          status: "landed",
          approval,
          landing: {
            ...landingBase,
            commit: "4f1c2e9a7b3d5e6f8a9b0c1d2e3f4a5b6c7d8e9f",
            prUrl: "https://example.invalid/xkazm04/ai-registry/pull/1",
            gates: [
              { lane: "publications", mode: "write", ok: true },
              { lane: "publications", mode: "check", ok: true },
              { lane: "knowledge", mode: "write", ok: true },
              { lane: "knowledge", mode: "check", ok: true },
            ],
            medium: "medium",
          },
        };
        mkdirSync(path.join(dir, "medium"), { recursive: true });
        writeFileSync(path.join(dir, "medium", "story.html"), "<!doctype html><title>story</title><h1>A stub post about tokens</h1>\n");
        writeFileSync(path.join(dir, "medium", "tags.txt"), "tokens\nllm\n");
        writeFileSync(path.join(dir, "medium", "README.md"), "# Paste into Medium\n");
        break;
      case "land-failed":
        run = {
          ...run,
          status: "failed",
          approval,
          error: "landing: the registry gate failed: publications --lane check",
          landing: { ...landingBase, worktree: "C:/tmp/reg-wt-article", gates: [{ lane: "publications", mode: "write", ok: true }, { lane: "publications", mode: "check", ok: false }], medium: "medium" },
        };
        writeFileSync(path.join(dir, "landing.log"), "lane publications: 1 publication(s), 1 problem(s)\na-stub-post-about-tokens: title asks the gate to fail\n");
        break;
      case "rejected":
        run = { ...run, status: "rejected", rejection: { at: AT(41), note: "The counter-source is a news piece; find the primary." } };
        break;
    }
    writeFileSync(path.join(dir, "run.json"), `${JSON.stringify(run, null, 2)}\n`);
    if (opts.driverPid && (state === "researching" || state === "drafting" || state === "landing")) {
      writeFileSync(path.join(dir, ".driver"), JSON.stringify({ pid: opts.driverPid, at: now }));
    }
    out[state] = id;
  }
  return out;
}
