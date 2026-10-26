// lib/articles/diffFiles.ts: the registry patch diff runs git, and git exits 1 both for "there are
// differences" and for "could not read a side" (a path past 260 characters on Windows). The second,
// with stderr and no diff, is a failure - read as "identical" it silently refused a real patch
// (2026-10-18). git is a stand-in here (node:child_process mocked at its execFile door), so the
// three exits it can answer with are driven without a path git genuinely cannot read.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

type Answer = { code: number; stdout: string; stderr: string };
const git: { answer: Answer } = { answer: { code: 0, stdout: "", stderr: "" } };

vi.mock("node:child_process", () => ({
  execFile: (_cmd: string, _args: string[], _opts: unknown, done: (err: Error | null, stdout: string, stderr: string) => void) => {
    const { code, stdout, stderr } = git.answer;
    done(code === 0 ? null : Object.assign(new Error("git"), { code }), stdout, stderr);
  },
}));

const { diffFiles } = await import("@/lib/articles/diffFiles");

let dir = "";
let proposal = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-diff-files-"));
  proposal = path.join(dir, "proposed.md");
  writeFileSync(proposal, "new text\n", "utf8");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  git.answer = { code: 0, stdout: "", stderr: "" };
});

describe("diffFiles over git's exit codes", () => {
  test("exit 1 with stderr and no diff is a failure that names git's words, not an empty patch", async () => {
    git.answer = { code: 1, stdout: "", stderr: "error: Could not access 'a/posts/x.md'\n" };
    await expect(diffFiles(path.join(dir, "absent.md"), proposal, "posts/x.md")).rejects.toThrow(/git diff failed: error: Could not access/);
  });

  test("exit 1 with a diff is the difference, and exit 0 is no difference", async () => {
    git.answer = { code: 1, stdout: "diff --git b/posts/x.md b/posts/x.md\n+new text\n", stderr: "" };
    await expect(diffFiles(path.join(dir, "absent.md"), proposal, "posts/x.md")).resolves.toBe("diff --git a/posts/x.md b/posts/x.md\n+new text\n");
    git.answer = { code: 0, stdout: "", stderr: "" };
    await expect(diffFiles(path.join(dir, "absent.md"), proposal, "posts/x.md")).resolves.toBe("");
  });

  test("any other exit is a failure", async () => {
    git.answer = { code: 128, stdout: "", stderr: "fatal: bad\n" };
    await expect(diffFiles(path.join(dir, "absent.md"), proposal, "posts/x.md")).rejects.toThrow(/git diff failed: fatal: bad/);
  });
});
