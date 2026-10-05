// READING THE POST STANDARD OUT OF THE REGISTRY — by address, at run time. Server only.
//
// The standard a post is held to is registry content: the
// `technical-blog-post-authoring` recipe and the `technical-writing` knowledge
// bundle. pipeline/ARTICLE-POST-PROMPT.md carries tone, structure and the output
// contract and REFERENCES the standard; it never copies it. This file resolves
// the reference on every run:
//
//   <registry>/recipes/index.json            -> recipes["technical-blog-post-authoring"]
//                                               .path/recipe.json, .version
//   <registry>/knowledge/technical-writing/index.json
//                                            -> subjects[slug].file (golden paths)
//                                            -> laws[name].statement
//
// and the run records the recipe version it got and a hash of the bundle index.
//
// WHERE THE REGISTRY IS: $AI_REGISTRY_DIR, then `.ai/manifest.yaml`'s
// `registry.local` (relative to this repo), then `../ai-registry`. An explicit
// $AI_REGISTRY_DIR that does not hold a registry is an error, not a reason to
// try the next candidate — an operator who named one place did not mean another.
//
// NEVER A STALE COPY. If the registry cannot be read, resolution throws
// `registry-unreachable` and the run fails with that name. There is no cached
// standard and no fallback text: a post held to a standard nobody can see is
// not held to a standard.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, type Dirent } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { ArticleError } from "./store";
import type { ArticleStandard, TopicSubject } from "./types";

export const RECIPE_SLUG = "technical-blog-post-authoring" as const;
export const STANDARD_BUNDLE = "technical-writing" as const;

export class RegistryUnreachableError extends ArticleError {
  constructor(detail: string) {
    super(`registry-unreachable: ${detail}`, 503, "registry-unreachable");
    this.name = "RegistryUnreachableError";
  }
}

/** A standard that the registry holds but in a shape this reader cannot use. */
export class StandardMissingError extends ArticleError {
  constructor(detail: string) {
    super(`standard-missing: ${detail}`, 503, "standard-missing");
    this.name = "StandardMissingError";
  }
}

export interface RegistryLocation {
  dir: string;
  via: "env" | "manifest" | "sibling";
}

const isRegistry = (dir: string) => existsSync(path.join(dir, "recipes", "index.json")) && existsSync(path.join(dir, "knowledge"));

/** `registry.local` out of .ai/manifest.yaml, without a YAML dependency: the
 *  block is two-space indented scalars, and unknown fields must be ignored. */
export function manifestRegistryLocal(yaml: string): string | undefined {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((l) => /^registry:\s*(#.*)?$/.test(l));
  if (start < 0) return undefined;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^\S/.test(l)) break;
    const m = /^\s+local:\s*(.+?)\s*$/.exec(l);
    if (m) {
      const v = m[1].replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "").trim();
      return v || undefined;
    }
  }
  return undefined;
}

export function resolveRegistryDir(
  env: Record<string, string | undefined> = process.env,
  repoRoot: string = process.cwd(),
  readManifest: (file: string) => string | undefined = defaultReadManifest,
): RegistryLocation {
  const explicit = env.AI_REGISTRY_DIR?.trim();
  if (explicit) {
    const dir = path.resolve(repoRoot, explicit);
    if (!isRegistry(dir)) throw new RegistryUnreachableError(`AI_REGISTRY_DIR points at ${dir}, which does not hold recipes/index.json and knowledge/`);
    return { dir, via: "env" };
  }
  const tried: string[] = [];
  const yaml = readManifest(path.join(repoRoot, ".ai", "manifest.yaml"));
  const local = yaml ? manifestRegistryLocal(yaml) : undefined;
  if (local) {
    const dir = path.resolve(repoRoot, local);
    if (isRegistry(dir)) return { dir, via: "manifest" };
    tried.push(`${dir} (manifest registry.local)`);
  }
  const sibling = path.resolve(repoRoot, "..", "ai-registry");
  if (isRegistry(sibling)) return { dir: sibling, via: "sibling" };
  tried.push(`${sibling} (../ai-registry)`);
  throw new RegistryUnreachableError(`no registry found; tried ${tried.join(", ")}. Set AI_REGISTRY_DIR.`);
}

/** Sync on purpose: resolution is a handful of stat calls and one small file. */
function defaultReadManifest(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/* ── the indices ───────────────────────────────────────────────────────────── */

interface RecipeIndexRow {
  path: string;
  version: string;
  title?: string;
}

interface KnowledgeIndex {
  subjects: Record<string, { category?: string; subcategory?: string | null; file: string; status?: string; techniques?: { slug: string }[] }>;
  laws?: Record<string, { statement?: string }>;
}

const lf = (s: string) => s.replace(/\r\n/g, "\n");

async function readJsonIn<T>(registry: string, rel: string, what: string): Promise<{ value: T; raw: string }> {
  let raw: string;
  try {
    raw = await readFile(path.join(registry, rel), "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new StandardMissingError(`${what}: ${rel} does not exist in ${registry}`);
    throw new RegistryUnreachableError(`${rel} could not be read (${code ?? (e as Error).message})`);
  }
  try {
    return { value: JSON.parse(raw) as T, raw };
  } catch (e) {
    throw new StandardMissingError(`${rel} is not valid JSON (${(e as Error).message})`);
  }
}

async function readTextIn(registry: string, rel: string, what: string): Promise<string> {
  try {
    return lf(await readFile(path.join(registry, rel), "utf8"));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new StandardMissingError(`${what}: ${rel} does not exist`);
    throw new RegistryUnreachableError(`${rel} could not be read (${code ?? (e as Error).message})`);
  }
}

/** Refuse an index entry that points outside the registry. */
function relInside(registry: string, rel: string): string {
  const abs = path.resolve(registry, rel);
  if (!abs.startsWith(path.resolve(registry) + path.sep)) throw new StandardMissingError(`index entry ${JSON.stringify(rel)} points outside the registry`);
  return path.relative(registry, abs).split(path.sep).join("/");
}

/* ── the standard ──────────────────────────────────────────────────────────── */

export interface ResolvedStandard {
  registry: RegistryLocation;
  standard: Required<ArticleStandard>;
  recipe: { slug: string; version: string; path: string; json: string };
  subjects: { slug: string; file: string; text: string }[];
  laws: { name: string; statement: string }[];
  /** Registry-relative paths of every file an agent may propose a patch to,
   *  copied into its workspace as read-only reference (inputs/registry/). */
  files: string[];
}

export async function resolveStandard(location?: RegistryLocation): Promise<ResolvedStandard> {
  const registry = location ?? resolveRegistryDir();
  const dir = registry.dir;

  const { value: recipes } = await readJsonIn<{ recipes?: Record<string, RecipeIndexRow> }>(dir, "recipes/index.json", "the recipe index");
  const row = recipes.recipes?.[RECIPE_SLUG];
  if (!row?.path || !row.version) throw new StandardMissingError(`recipes/index.json has no "${RECIPE_SLUG}" entry with a path and version`);
  const recipeDir = relInside(dir, row.path);
  const recipeJson = await readTextIn(dir, `${recipeDir}/recipe.json`, "the recipe");

  const indexRel = `knowledge/${STANDARD_BUNDLE}/index.json`;
  const { value: index, raw } = await readJsonIn<KnowledgeIndex>(dir, indexRel, "the bundle index");
  const slugs = Object.keys(index.subjects ?? {}).sort();
  if (!slugs.length) throw new StandardMissingError(`${indexRel} lists no subjects`);
  const subjects = [];
  for (const slug of slugs) {
    const file = relInside(dir, index.subjects[slug].file);
    subjects.push({ slug, file, text: await readTextIn(dir, file, `subject ${slug}`) });
  }
  const laws = Object.entries(index.laws ?? {})
    .filter(([, v]) => typeof v?.statement === "string")
    .map(([name, v]) => ({ name, statement: v.statement as string }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const files = [
    ...(await listFiles(dir, `knowledge/${STANDARD_BUNDLE}`, (f) => f.endsWith(".md"))),
    ...(await listFiles(dir, recipeDir, (f) => /\.(md|json)$/.test(f))),
  ];

  return {
    registry,
    standard: {
      recipe: RECIPE_SLUG,
      version: row.version,
      bundle: STANDARD_BUNDLE,
      subjects: slugs,
      bundleHash: `sha256:${createHash("sha256").update(lf(raw)).digest("hex")}`,
    },
    recipe: { slug: RECIPE_SLUG, version: row.version, path: recipeDir, json: recipeJson },
    subjects,
    laws,
    files,
  };
}

async function listFiles(registry: string, rel: string, keep: (f: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  const walk = async (r: string) => {
    let entries: Dirent[];
    try {
      entries = await readdir(path.join(registry, r), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const child = `${r}/${e.name}`;
      if (e.isDirectory()) await walk(child);
      else if (e.isFile() && keep(e.name)) out.push(child);
    }
  };
  await walk(rel);
  return out.sort();
}

/** The standard as prompt text: the recipe, every golden path, every law —
 *  inlined, each under the registry address it came from. */
export function standardText(s: ResolvedStandard): string {
  const parts = [
    `### Recipe ${s.recipe.slug} ${s.recipe.version} (${s.recipe.path}/recipe.json)`,
    "```json",
    s.recipe.json.trim(),
    "```",
    "",
    `### Laws of the ${STANDARD_BUNDLE} bundle (knowledge/${STANDARD_BUNDLE}/index.json)`,
    ...(s.laws.length ? s.laws.map((l) => `- **${l.name}**: ${l.statement}`) : ["(the bundle index lists no laws)"]),
  ];
  for (const sub of s.subjects) {
    parts.push("", `### Golden path: ${sub.slug} (${sub.file})`, "", sub.text.trim());
  }
  return parts.join("\n");
}

/* ── topics ────────────────────────────────────────────────────────────────── */

/** `bundle/slug` -> the subject's golden path, as the research brief. */
export async function resolveTopicSubject(
  address: string,
  location?: RegistryLocation,
): Promise<{ bundle: string; subject: string; file: string; title: string; text: string }> {
  const m = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(address.trim());
  if (!m) throw new ArticleError(`a subject is addressed as <bundle>/<slug>, got ${JSON.stringify(address)}`, 400, "bad-subject");
  const [, bundle, subject] = m;
  const dir = (location ?? resolveRegistryDir()).dir;
  const { value: index } = await readJsonIn<KnowledgeIndex>(dir, `knowledge/${bundle}/index.json`, `bundle ${bundle}`);
  const row = index.subjects?.[subject];
  if (!row?.file) throw new ArticleError(`knowledge/${bundle}/index.json has no subject "${subject}"`, 404, "no-subject");
  const file = relInside(dir, row.file);
  const text = await readTextIn(dir, file, `subject ${subject}`);
  const h1 = /^#\s+(.+)$/m.exec(text.replace(/^---[\s\S]*?\n---\n/, ""));
  return { bundle, subject, file, title: h1?.[1].trim() ?? subject, text };
}

/** Every subject of every bundle, for the topic picker. */
export async function listTopicSubjects(location?: RegistryLocation): Promise<TopicSubject[]> {
  const dir = (location ?? resolveRegistryDir()).dir;
  let bundles: string[];
  try {
    bundles = (await readdir(path.join(dir, "knowledge"), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (e) {
    throw new RegistryUnreachableError(`knowledge/ could not be listed (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`);
  }
  const out: TopicSubject[] = [];
  for (const bundle of bundles.sort()) {
    const at = path.join(dir, "knowledge", bundle, "index.json");
    if (!(await stat(at).then((s) => s.isFile(), () => false))) continue;
    let index: KnowledgeIndex;
    try {
      index = JSON.parse(await readFile(at, "utf8")) as KnowledgeIndex;
    } catch {
      continue;
    }
    for (const [slug, row] of Object.entries(index.subjects ?? {})) {
      out.push({ bundle, slug, category: row.category ?? "", file: row.file });
    }
  }
  return out.sort((a, b) => a.bundle.localeCompare(b.bundle) || a.slug.localeCompare(b.slug));
}
