// Ingesting a draft: the post files out of out/, and the patch proposals turned into diffs.
// Its own file because the draft writes both, and the critique's revision reuses the post half.

import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { diffFiles } from "./diffFiles";
import { readOutJson } from "./ingestSources";
import { MAX_PATCHES } from "./prompt";
import { PATCHABLE_ROOTS } from "./registryWrite";
import { readJsonFile, readTextFile, writeFileAtomic, writeJsonAtomic } from "./store";
import { PATCH_KINDS, type PostMeta, type RegistryPatch, type Source } from "./types";

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

export async function ingestDraft(ws: string, dir: string): Promise<void> {
  const out = path.join(ws, "out");
  // A redraft replaces the previous post and its patches wholesale.
  await ingestPost(ws, dir);
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
  for (const entry of Array.isArray(proposed) ? proposed.slice(0, MAX_PATCHES * 2) : []) {
    const o = (entry ?? {}) as Record<string, unknown>;
    const reason = patchProblem(o, nums, accepted);
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
  await writeJsonAtomic(path.join(dir, "patches.json"), accepted);
  if (rejected.length) await writeJsonAtomic(path.join(dir, "patches.rejected.json"), rejected);
  else await rm(path.join(dir, "patches.rejected.json"), { force: true });
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
