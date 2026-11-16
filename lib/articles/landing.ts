// Landing: the step that hands an approved run to the registry writer. Its own file because
// it is the one step that runs after a human's approval.
//
// A trial run's `required` patch lands whatever the approval names (lib/articles/types.ts
// `RegistryPatch.required`): approveRun records it, and this read includes it again so an
// approval written before the patch existed cannot land a post citing a missing record. A
// `challenged` or `null` trial that landed files one technique lead, so /deepen weighs the
// golden path itself; the golden path's text is never a trial's to rewrite.

import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildMediumPackage } from "./mediumPackage";
import { readPatches } from "./runReads";
import { ArticleError, readJsonFile, readRun, runDir, updateRun } from "./store";
import { LandingError, landRun } from "./registryWrite";
import { appendLead } from "./trial/leads";
import { trialLead } from "./trial/registryRecord";
import { readTrialDetail } from "./trial/store";
import type { ArticleLanding, ArticleRun, PostMeta } from "./types";
import type { EngineDeps } from "./engine";

/* ── landing ───────────────────────────────────────────────────────────────── */

export async function land(id: string, deps: EngineDeps): Promise<void> {
  const run = await readRun(id);
  const dir = runDir(id);
  let unrendered: readonly string[] = [];
  try {
    if (!run.approval) throw new ArticleError("a run with no recorded approval cannot land", 409, "not-approved");
    const patches = (await readPatches(id)).filter((p) => p.required || run.approval!.patches.includes(p.id));
    const meta = await readJsonFile<PostMeta | null>(path.join(dir, "post", "meta.json"), null);
    if (!meta) throw new ArticleError("the post has no meta.json", 409, "no-post");
    await rm(path.join(dir, "medium"), { recursive: true, force: true });
    const pkg = await buildMediumPackage(dir, meta);
    unrendered = pkg.failedFigures;
    if (unrendered.length) console.error(`[articles] ${id}: figures that did not render to PNG: ${unrendered.join(", ")}`);
    const landing = await landRun({
      runDir: dir,
      run,
      approvedPatches: patches,
      ...(deps.registry ? { registry: deps.registry } : {}),
      now: deps.now,
      progress: (l) => updateRun(id, (r) => ({ ...r, landing: landingRecord(l, unrendered) }), deps.now).then(() => undefined),
    });
    // The ONE write of landedAt: the event time the canvas's 7-day expiry reads (types.ts).
    const landed = await updateRun(id, (r) => ({ ...r, status: "landed", landedAt: deps.now().toISOString(), landing: landingRecord(landing, unrendered) }), deps.now);
    if (landed.trial && landed.trial.verdict !== "upheld") await leadForLandedTrial(landed, deps.now());
  } catch (e) {
    const err = e as Error;
    if (e instanceof LandingError && e.output) await writeFile(path.join(dir, "landing.log"), e.output, "utf8").catch(() => undefined);
    await updateRun(
      id,
      (r) => {
        const out: ArticleRun = { ...r, status: "failed", error: `landing: ${err.message}` };
        if (e instanceof LandingError && e.landing.branch) out.landing = landingRecord(e.landing, unrendered);
        return out;
      },
      deps.now,
    );
  }
}

/** The landing as run.json keeps it: the registry write-back's record, where the Medium
 *  package is, and every figure that did not render to PNG for it. A figure lost at landing
 *  does not stop the landing, so this record is the only place the loss stays visible. */
export function landingRecord(landing: ArticleLanding, unrendered: readonly string[]): ArticleLanding {
  return { ...landing, medium: "medium", ...(unrendered.length ? { unrenderedFigures: [...unrendered] } : {}) };
}

/** The run has landed; a lead that cannot be written is logged, never a reason to fail it. */
async function leadForLandedTrial(run: ArticleRun, now: Date): Promise<void> {
  const ref = run.trial!;
  try {
    const detail = await readTrialDetail(path.join(runDir(run.id), "experiment"));
    if (!detail) throw new Error("experiment/verdict.json is missing");
    await appendLead(trialLead({ kind: "technique", prereg: detail.prereg, verdict: detail.verdict, trialId: ref.id, applicationPath: ref.applicationPath, now, runId: run.id }));
  } catch (e) {
    console.error(`[articles] ${run.id}: the landed ${ref.verdict} trial ${ref.id} left no registry lead: ${(e as Error).message}`);
  }
}
