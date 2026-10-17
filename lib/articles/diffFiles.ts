// The registry patch diff: git diff --no-index between the registry's copy and a proposal.
// Its own file because it is the only piece of ingestion that runs git.

import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { cwdBoundGitEnv } from "@/lib/gitEnv";

import { readTextFile } from "./store";

/** `git diff --no-index` between the registry's copy (or nothing) and the
 *  proposal, rewritten to registry-relative `a/` `b/` paths for `git apply`. */
export async function diffFiles(original: string, proposal: string, target: string): Promise<string> {
  const proposed = await readTextFile(proposal);
  if (proposed === undefined) throw new Error(`no proposed file at out/proposals/<id>/${target}`);
  const base = await readTextFile(original);
  const tmp = path.join(os.tmpdir(), "gravitone-article-diff", `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    const a = path.join(tmp, "a", ...target.split("/"));
    const b = path.join(tmp, "b", ...target.split("/"));
    await mkdir(path.dirname(b), { recursive: true });
    await writeFile(b, proposed.replace(/\r\n/g, "\n"), "utf8");
    if (base !== undefined) {
      await mkdir(path.dirname(a), { recursive: true });
      await writeFile(a, base.replace(/\r\n/g, "\n"), "utf8");
    }
    const left = base !== undefined ? `a/${target}` : "/dev/null";
    const diff = await new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        ["-c", "core.autocrlf=false", "-c", "core.safecrlf=false", "-c", "core.longpaths=true", "diff", "--no-index", "--no-color", "--no-prefix", "--", left, `b/${target}`],
        { cwd: tmp, env: cwdBoundGitEnv(), maxBuffer: 16 * 1024 * 1024, windowsHide: true },
        (err, stdout, stderr) => {
          // exit 1 = "there are differences", which is the point. But git also exits 1 when it
          // could not read a side ("Could not access", a path past 260 characters on Windows),
          // with stderr and no diff: read as "identical", that silently refused a real patch
          // (found by the trial-gate builder, 2026-10-18). No diff plus stderr is a failure.
          const code = err ? (err as unknown as { code?: number }).code : 0;
          if (code === 1 && !String(stdout).trim() && String(stderr).trim()) reject(new Error(`git diff failed: ${String(stderr).trim().slice(0, 300)}`));
          else if (code === 0 || code === 1) resolve(String(stdout));
          else reject(new Error(`git diff failed: ${String(stderr).trim().slice(0, 300)}`));
        },
      );
    });
    // A new file's header names b/ twice; git apply wants a/ on the left.
    return diff.replace(/^diff --git b\/(\S+) b\/(\S+)$/m, "diff --git a/$1 b/$2");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
