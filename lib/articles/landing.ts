// Landing: the step that hands an approved run to the registry writer. Its own file because
// it is the one step that runs after a human's approval.

import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildMediumPackage } from "./mediumPackage";
import { readPatches } from "./runReads";
import { ArticleError, readJsonFile, readRun, runDir, updateRun } from "./store";
import { LandingError, landRun } from "./registryWrite";
import type { ArticleRun, PostMeta } from "./types";
import type { EngineDeps } from "./engine";

/* ── landing ───────────────────────────────────────────────────────────────── */

export async function land(id: string, deps: EngineDeps): Promise<void> {
  const run = await readRun(id);
  const dir = runDir(id);
  try {
    if (!run.approval) throw new ArticleError("a run with no recorded approval cannot land", 409, "not-approved");
    const patches = (await readPatches(id)).filter((p) => run.approval!.patches.includes(p.id));
    const meta = await readJsonFile<PostMeta | null>(path.join(dir, "post", "meta.json"), null);
    if (!meta) throw new ArticleError("the post has no meta.json", 409, "no-post");
    await rm(path.join(dir, "medium"), { recursive: true, force: true });
    const pkg = await buildMediumPackage(dir, meta);
    if (pkg.failedFigures.length) console.error(`[articles] ${id}: figures that did not render to PNG: ${pkg.failedFigures.join(", ")}`);
    const landing = await landRun({
      runDir: dir,
      run,
      approvedPatches: patches,
      ...(deps.registry ? { registry: deps.registry } : {}),
      now: deps.now,
      progress: (l) => updateRun(id, (r) => ({ ...r, landing: { ...l, medium: "medium" } }), deps.now).then(() => undefined),
    });
    // The ONE write of landedAt: the event time the canvas's 7-day expiry reads (types.ts).
    await updateRun(id, (r) => ({ ...r, status: "landed", landedAt: deps.now().toISOString(), landing: { ...landing, medium: "medium" } }), deps.now);
  } catch (e) {
    const err = e as Error;
    if (e instanceof LandingError && e.output) await writeFile(path.join(dir, "landing.log"), e.output, "utf8").catch(() => undefined);
    await updateRun(
      id,
      (r) => {
        const out: ArticleRun = { ...r, status: "failed", error: `landing: ${err.message}` };
        if (e instanceof LandingError && e.landing.branch) out.landing = { ...e.landing, medium: "medium" };
        return out;
      },
      deps.now,
    );
  }
}
