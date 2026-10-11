// Reads of runs and their patches, for the routes and the CLI. Nothing here writes.
// Its own file so the read side can be read without the acts that change a run.

import { stat } from "node:fs/promises";

import { readCritiqueDetail } from "./critique";
import { readCheckPasses } from "./checkLoop";
import { inRun, listRuns, readJsonFile, readRun, readTextFile, runDir } from "./store";
import type { ArticleRun, ArticleRunDetail, CheckReport, Claim, PostMeta, RegistryPatch, Source } from "./types";

/* ── reads ─────────────────────────────────────────────────────────────────── */

export const getRun = readRun;

export async function listArticleRuns(): Promise<{ runs: ArticleRun[]; damaged: string[] }> {
  return listRuns();
}

export async function readPatches(id: string): Promise<RegistryPatch[]> {
  return readJsonFile<RegistryPatch[]>(inRun(id, "patches.json"), []);
}

export async function getRunDetail(id: string): Promise<ArticleRunDetail> {
  const run = await readRun(id);
  const [sources, claims, outline, meta, check, patches, critique, checkPasses] = await Promise.all([
    readJsonFile<Source[]>(inRun(id, "sources.json"), []),
    readJsonFile<Claim[]>(inRun(id, "claims.json"), []),
    readTextFile(inRun(id, "outline.md")),
    readJsonFile<PostMeta | null>(inRun(id, "post/meta.json"), null),
    readJsonFile<CheckReport | null>(inRun(id, "check.json"), null),
    readPatches(id),
    readCritiqueDetail(runDir(id)),
    readCheckPasses(runDir(id)),
  ]);
  const withDiffs = await Promise.all(patches.map(async (p) => ({ ...p, diff: (await readTextFile(inRun(id, p.patchFile))) ?? "" })));
  const post = await stat(inRun(id, "post/index.html")).then(() => "post/index.html", () => undefined);
  return {
    run,
    sources,
    claims,
    patches: withDiffs,
    ...(outline !== undefined ? { outline } : {}),
    ...(meta ? { meta } : {}),
    ...(check ? { check } : {}),
    ...(checkPasses.length ? { checkPasses } : {}),
    ...(post ? { post } : {}),
    ...(critique ? { critique } : {}),
  };
}
