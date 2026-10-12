// The check step: the deterministic check run over the finished post, as one of the
// drive's steps. Its own file; the check between writer turns is in checkLoop.ts.

import { rm } from "node:fs/promises";
import path from "node:path";

import { runCheck } from "./checks";
import { runDir, writeJsonAtomic } from "./store";
import type { EngineDeps } from "./engine";

/* ── the check step ────────────────────────────────────────────────────────── */

export async function checkStep(id: string, deps: EngineDeps): Promise<undefined> {
  const dir = runDir(id);
  await rm(path.join(dir, "check"), { recursive: true, force: true });
  const report = await runCheck(dir, { render: deps.render, now: deps.now });
  await writeJsonAtomic(path.join(dir, "check.json"), report);
  return undefined;
}
