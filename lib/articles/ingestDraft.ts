// Ingesting a draft: the post files out of out/, and the patch proposals turned into diffs.
// Its own file because the draft writes both, and the critique's revision reuses the post half.
//
// A TRIAL RUN'S PATCHES are held to the trial's scope. Across 17 classic runs the pipeline
// proposed 17 registry patches, 14 of them to the technical-writing bundle and 0 to the run's
// own subject, and none was adopted (2026-10-18). A trial run measured one technique of one
// subject, so a model proposal it keeps must amend a technique of THAT subject: one outside
// the subject's directory, outside its techniques/, or of any other kind is refused with its
// reason, like every other refusal. Then code adds `t1`, the trial's own measurement record
// (lib/articles/trial/registryRecord.ts), `required` because the post cites it as source 1.
// Model ids stay `p<n>`, so `t1` never collides with one.

import { readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { diffFiles } from "./diffFiles";
import { readOutJson } from "./ingestSources";
import { MAX_PATCHES } from "./prompt";
import { resolveRegistryDir, type RegistryLocation } from "./registryRead";
import { PATCHABLE_ROOTS } from "./registryWrite";
import { readJsonFile, readTextFile, writeFileAtomic, writeJsonAtomic } from "./store";
import { uniqueDir } from "./tempDir";
import { appendTrialSection, applicationMarkdown } from "./trial/registryRecord";
import { readTrialDetail } from "./trial/store";
import { PATCH_KINDS, type ArticleRun, type ArticleTrialRef, type PostMeta, type RegistryPatch, type Source } from "./types";

const PATCH_ID = /^p\d{1,2}$/;

/** The post files out of a draft or a critique rewrite. Validated before the
 *  previous post is touched; then the previous post is replaced wholesale. */
export async function ingestPost(ws: string, dir: string): Promise<void> {
  const out = path.join(ws, "out");
  const html = await readTextFile(path.join(out, "post", "index.html"));
  const md = await readTextFile(path.join(out, "post", "post.md"));
  if (!html?.trim()) throw new Error("the agent did not write out/post/index.html");
  if (!md?.trim()) throw new Error("the agent did not write out/post/post.md");
  const metaRaw = await readOutJson<Record<string, unknown>>(path.join(out, "post", "meta.json"), "out/post/meta.json");
  if (typeof metaRaw.title !== "string" || !metaRaw.title.trim()) throw new Error("out/post/meta.json has no title");
  const meta: PostMeta = {
    title: metaRaw.title.trim(),
    subtitle: typeof metaRaw.subtitle === "string" ? metaRaw.subtitle.trim() : "",
    tags: Array.isArray(metaRaw.tags) ? metaRaw.tags.filter((t): t is string => typeof t === "string" && !!t.trim()).map((t) => t.trim()).slice(0, 5) : [],
  };

  await rm(path.join(dir, "post"), { recursive: true, force: true });
  await writeFileAtomic(path.join(dir, "post", "index.html"), html);
  await writeFileAtomic(path.join(dir, "post", "post.md"), md);
  await writeJsonAtomic(path.join(dir, "post", "meta.json"), meta);
  let figs: string[] = [];
  try {
    figs = (await readdir(path.join(out, "post", "figures"))).filter((f) => /^[\w.-]+\.svg$/i.test(f));
  } catch {
    // no figures directory: the check counts zero and says so
  }
  for (const f of figs) await writeFileAtomic(path.join(dir, "post", "figures", f), await readFile(path.join(out, "post", "figures", f)));
}

/** `registry` is where the trial record's current text is read from; resolved like every
 *  other registry read when the caller does not pass the one it already holds. */
export async function ingestDraft(ws: string, dir: string, registry?: RegistryLocation): Promise<void> {
  // A redraft replaces the previous post and its patches wholesale.
  await ingestPost(ws, dir);
  await ingestPatches(ws, dir, registry);
}

/** The proposals in `out/patches.json` (+ `out/proposals/`) become the run's patches, diffs by
 *  code; a trial run's record (`t1`) is rebuilt beside them. Replaces the previous patches
 *  wholesale. The draft calls it, and a trial run's revision calls it when it rewrote its
 *  amendment (critiqueWriter.ts `revise`). */
export async function ingestPatches(ws: string, dir: string, registry?: RegistryLocation): Promise<void> {
  const out = path.join(ws, "out");
  const trial = (await readJsonFile<ArticleRun | null>(path.join(dir, "run.json"), null))?.trial;
  await rm(path.join(dir, "patches"), { recursive: true, force: true });

  // Patches: proposals in, diffs out — computed here, never typed by the model.
  const sources = await readJsonFile<Source[]>(path.join(dir, "sources.json"), []);
  const nums = new Set(sources.map((s) => s.n));
  let proposed: unknown = [];
  try {
    proposed = await readOutJson<unknown>(path.join(out, "patches.json"), "out/patches.json");
  } catch {
    proposed = [];
  }
  const accepted: RegistryPatch[] = [];
  const rejected: { entry: unknown; reason: string }[] = [];
  // At most twice the limit is read; what lies past it is still named, as one row, so a proposal
  // the gate never shows is counted where the refused ones are.
  const read = MAX_PATCHES * 2;
  if (Array.isArray(proposed) && proposed.length > read) rejected.push({ entry: { unread: proposed.length - read }, reason: `${proposed.length - read} more proposals past the first ${read} were not read` });
  for (const entry of Array.isArray(proposed) ? proposed.slice(0, read) : []) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const reason = patchProblem(o, nums, accepted) ?? (trial ? trialPatchProblem(o, trial) : undefined);
    if (reason) {
      rejected.push({ entry, reason });
      continue;
    }
    if (accepted.length >= MAX_PATCHES) {
      rejected.push({ entry, reason: `more than ${MAX_PATCHES} proposals` });
      continue;
    }
    const id = String(o.id);
    const target = String(o.target);
    const proposal = path.join(out, "proposals", id, ...target.split("/"));
    const original = path.join(ws, "inputs", "registry", ...target.split("/"));
    let diff: string;
    try {
      diff = await diffFiles(original, proposal, target);
    } catch (e) {
      rejected.push({ entry, reason: (e as Error).message });
      continue;
    }
    if (!diff.trim()) {
      rejected.push({ entry, reason: "the proposed file is identical to the registry's" });
      continue;
    }
    const patchFile = `patches/${id}.patch`;
    await writeFileAtomic(path.join(dir, patchFile), diff);
    accepted.push({
      id,
      target,
      kind: o.kind as RegistryPatch["kind"],
      rationale: String(o.rationale).trim().slice(0, 600),
      sources: (o.sources as number[]).map(Number),
      patchFile,
    });
  }
  if (trial) {
    const record = await trialRecordPatch(dir, trial, registry ?? resolveRegistryDir());
    if ("patch" in record) accepted.push(record.patch);
    else rejected.push({ entry: { id: TRIAL_PATCH_ID, target: trial.applicationPath, kind: "application" }, reason: record.skipped });
  }
  await writeJsonAtomic(path.join(dir, "patches.json"), accepted);
  if (rejected.length) await writeJsonAtomic(path.join(dir, "patches.rejected.json"), rejected);
  else await rm(path.join(dir, "patches.rejected.json"), { force: true });
}

/* ── the trial's record ────────────────────────────────────────────────────── */

export const TRIAL_PATCH_ID = "t1";
export const TRIAL_PATCH_RATIONALE = "The trial's measurement record; the post cites it as source 1.";

/** `knowledge/<...>/<subject>` out of `<subject dir>/applications/<stack>--<technique>.md`. */
export function trialSubjectDir(ref: Pick<ArticleTrialRef, "applicationPath">): string {
  const p = ref.applicationPath.replace(/\\/g, "/");
  const at = p.lastIndexOf("/applications/");
  if (at <= 0 || !p.startsWith("knowledge/")) throw new Error(`run.trial.applicationPath ${JSON.stringify(ref.applicationPath)} is not <subject dir>/applications/<file>`);
  return p.slice(0, at);
}

/** Why a model proposal on a trial run is refused, or undefined when it is in scope: a
 *  technique amendment whose target is a file under the subject's techniques/. The golden path
 *  is never a trial's to rewrite (one experiment does not move a stance), and the application
 *  is `t1`'s alone. */
function trialPatchProblem(o: Record<string, unknown>, trial: ArticleTrialRef): string | undefined {
  const subject = trialSubjectDir(trial);
  const target = String(o.target);
  if (!target.startsWith(`${subject}/`)) return `a trial run's patch must sit under the subject's directory ${subject}/`;
  if (o.kind !== "technique") return `a trial run proposes technique amendments only; ${String(o.kind)} is not one`;
  if (!target.startsWith(`${subject}/techniques/`)) return `a technique amendment targets a file under ${subject}/techniques/`;
  return undefined;
}

/**
 * Patch `t1`: the application record of the run's trial, built by code from `<run>/experiment/`
 * against the registry's current file (`applicationMarkdown` for a new file, `appendTrialSection`
 * over one that exists), its diff computed exactly as a model proposal's is, and written to
 * `patches/t1.patch`. `skipped` when the registry already holds this trial's section: there is
 * nothing to land. A trial run whose experiment holds no verdict throws, naming the file: the
 * post cites a record that would not exist.
 */
export async function trialRecordPatch(dir: string, trial: ArticleTrialRef, registry: RegistryLocation): Promise<{ patch: RegistryPatch } | { skipped: string }> {
  const detail = await readTrialDetail(path.join(dir, "experiment"));
  if (!detail) throw new Error(`experiment/verdict.json is missing: trial ${trial.id}'s record cannot be built`);
  const target = trial.applicationPath;
  trialSubjectDir(trial);
  const input = { prereg: detail.prereg, verdict: detail.verdict, results: detail.results, execs: detail.execs, trialId: trial.id };
  const original = path.join(registry.dir, ...target.split("/"));
  const existing = await readTextFile(original);
  const text = existing === undefined ? applicationMarkdown(input) : appendTrialSection(existing, input);
  if (existing !== undefined && text === existing.replace(/\r\n/g, "\n")) return { skipped: `the registry already holds trial ${trial.id}'s section in ${target}` };

  const tmp = await uniqueDir(path.join(os.tmpdir(), "gravitone-article-trial"), trial.id);
  try {
    const proposal = path.join(tmp, ...target.split("/"));
    await writeFileAtomic(proposal, text);
    const diff = await diffFiles(original, proposal, target);
    // The text differs from the registry's by construction, so an empty diff is git failing to
    // read a file, not agreement: measured 2026-10-18, `git diff --no-index` on a path past
    // Windows' 260 characters prints "Could not access" and exits 1, the code it also uses for
    // "differs". A required record that would land nothing must stop the draft, by name.
    if (!diff.trim()) throw new Error(`the diff for ${TRIAL_PATCH_ID} (${target}) came back empty: git could not read the proposed record`);
    const patchFile = `patches/${TRIAL_PATCH_ID}.patch`;
    await writeFileAtomic(path.join(dir, patchFile), diff);
    return { patch: { id: TRIAL_PATCH_ID, target, kind: "application", rationale: TRIAL_PATCH_RATIONALE, sources: [trial.sourceN], patchFile, required: true } };
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}

function patchProblem(o: Record<string, unknown>, nums: Set<number>, accepted: RegistryPatch[]): string | undefined {
  if (typeof o.id !== "string" || !PATCH_ID.test(o.id)) return "id must be p1, p2, …";
  if (accepted.some((p) => p.id === o.id)) return `id ${o.id} repeats`;
  if (typeof o.target !== "string" || !PATCHABLE_ROOTS.some((r) => (o.target as string).startsWith(r))) return `target must be under ${PATCHABLE_ROOTS.join(" or ")}`;
  if (/(^|\/)\.\.(\/|$)|\\|^\//.test(o.target as string) || !/\.(md|json)$/.test(o.target as string)) return "target must be a relative .md or .json path with no ..";
  if (!PATCH_KINDS.includes(o.kind as RegistryPatch["kind"])) return `kind must be one of ${PATCH_KINDS.join(", ")}`;
  if (typeof o.rationale !== "string" || !o.rationale.trim()) return "a rationale is required";
  if (!Array.isArray(o.sources) || !o.sources.length || o.sources.some((n) => !nums.has(Number(n)))) return "sources must name at least one source that exists";
  return undefined;
}
