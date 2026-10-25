import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { dryAgentBin } from "../../lib/articles/dryAgent.ts";
import { standInTurn } from "../../lib/articles/turns.ts";

// A dry article job is answered by lib/articles/dryStandIn.mjs wherever the process started:
// a worker or server whose cwd is not the repository root must not get "Cannot find module".

const HOME = process.cwd();
const TMP = mkdtempSync(path.join(tmpdir(), "gt-dry-root-"));
afterAll(() => {
  process.chdir(HOME);
  rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

describe("the dry stand-in is found from the engine's code, not from the working directory", () => {
  it("names a file that exists when the process started elsewhere", () => {
    process.chdir(TMP);
    const [, stand] = dryAgentBin({});
    expect(stand && existsSync(stand), `${stand} exists`).toBe(true);
    expect(stand).toBe(path.join(HOME, "lib", "articles", "dryStandIn.mjs"));
  });

  it("answers a writer turn with cwd outside the repository", async () => {
    const work = path.join(TMP, "work");
    mkdirSync(path.join(work, "inputs"), { recursive: true });
    mkdirSync(path.join(work, "out"), { recursive: true });
    process.chdir(TMP);
    const r = await standInTurn({ kind: "writer", input: { cwd: work, prompt: "ARTICLE-PHASE: research Topic: tokens", model: "sonnet", effort: "low", timeoutMin: 1, turn: "research" as never } });
    expect(r.errors).toEqual([]);
    expect(r.outcome).toBe("completed");
  });
});
