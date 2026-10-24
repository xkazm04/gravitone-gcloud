// THE POSTS AN EXPLAINER MAY ADOPT - finished article text, read where it lives. Nothing here writes.
//
// Two places hold a post whose words will not change under an adopter:
//   · an article run (lib/articles/store.ts, `<store>/<runId>/post/post.md`) at a status that
//     means the human approved it - approved, landing, landed, and failed WITH an approval (a
//     landing that failed after the approval: the text was approved, only the pull request broke).
//     A run at the gate or earlier is still being written, and a rejected one was refused;
//   · a publication in the registry's publications lane (`<registry>/publications/<slug>/post.md`),
//     the landed copy - and on a machine that never ran the pipeline, the only copy. The registry is
//     found the way every other reader finds it (./registryRead.ts `resolveRegistryDir`).
// A publication that names a run already listed is that run's post twice; the run is kept.
//
// ABSENCE IS AN EMPTY LIST. No store directory, no registry, no publications lane: nothing to
// adopt, said by the list's length - not an error the editor would have to explain. A post that
// cannot be read is left out of the list; asked for by id, it is refused with its reason.

import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";

import { RegistryUnreachableError, resolveRegistryDir } from "./registryRead";
import { explainerSectionsOf, titleOf } from "./sections";
import { ArticleError, inRun, listRuns, readJsonFile, readTextFile, RUN_ID_RE } from "./store";
import type { ArticleRun, ArticleStatus, PostMeta } from "./types";

export type AdoptSource = "run" | "publication";

export type Adoptable = {
  readonly source: AdoptSource;
  readonly id: string;
  readonly title: string;
  /** The run's status, or the publication's (publication.json `status`). */
  readonly status?: string;
  /** Sections and words as the explainer cuts the post (./sections.ts `explainerSectionsOf`). */
  readonly sections: number;
  readonly words: number;
};

export type AdoptedPost = { readonly title: string; readonly markdown: string; readonly sha: string };

const FINAL: readonly ArticleStatus[] = ["approved", "landing", "landed"];

/** A run whose post is final: approved or past it, or failed after an approval. */
export const isFinalRun = (r: Pick<ArticleRun, "status" | "approval">): boolean => FINAL.includes(r.status) || (r.status === "failed" && r.approval !== undefined);

/** A publication's slug, held to the run id's shape before it becomes a path. */
const SLUG_RE = RUN_ID_RE;

const words = (s: string): number => s.split(/\s+/).filter((x) => x !== "").length;
const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");

function counted(source: AdoptSource, id: string, post: AdoptedPost, status: string | undefined): Adoptable {
  const sections = explainerSectionsOf(post.markdown);
  return { source, id, title: post.title, ...(status === undefined ? {} : { status }), sections: sections.length, words: sections.reduce((n, s) => n + words(s.body), 0) };
}

/** The registry's directory, or null when this machine has none (an explicit AI_REGISTRY_DIR that
 *  holds no registry is the same absence here: there is nothing to adopt from it). */
function registryOrNull(): string | null {
  try {
    return resolveRegistryDir().dir;
  } catch (e) {
    if (e instanceof RegistryUnreachableError) return null;
    throw e;
  }
}

/* ── runs ──────────────────────────────────────────────────────────────────── */

async function runPost(id: string): Promise<AdoptedPost | null> {
  const markdown = await readTextFile(inRun(id, "post/post.md"));
  if (markdown === undefined) return null;
  const meta = await readJsonFile<PostMeta | null>(inRun(id, "post/meta.json"), null);
  return { title: meta?.title?.trim() || titleOf(markdown) || id, markdown, sha: sha256(markdown) };
}

/* ── publications ──────────────────────────────────────────────────────────── */

type PublicationJson = { readonly title?: string; readonly status?: string; readonly run?: { readonly id?: string } };

async function publicationOf(registry: string, slug: string): Promise<{ post: AdoptedPost; status?: string; runId?: string } | null> {
  const dir = path.join(registry, "publications", slug);
  const markdown = await readTextFile(path.join(dir, "post.md"));
  if (markdown === undefined) return null;
  const pub = await readJsonFile<PublicationJson | null>(path.join(dir, "publication.json"), null);
  const title = pub?.title?.trim() || titleOf(markdown) || slug;
  return { post: { title, markdown, sha: sha256(markdown) }, ...(pub?.status === undefined ? {} : { status: pub.status }), ...(pub?.run?.id === undefined ? {} : { runId: pub.run.id }) };
}

async function publicationSlugs(registry: string): Promise<string[]> {
  try {
    const ents = await readdir(path.join(registry, "publications"), { withFileTypes: true });
    return ents.filter((d) => d.isDirectory() && SLUG_RE.test(d.name)).map((d) => d.name).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

/* ── the two reads ─────────────────────────────────────────────────────────── */

/** Every post an explainer may adopt on this machine: final runs, newest first (listRuns' order), then
 *  publications by slug. */
export async function listAdoptable(): Promise<Adoptable[]> {
  const { runs } = await listRuns();
  const out: Adoptable[] = [];
  const listed = new Set<string>();
  for (const r of runs.filter(isFinalRun)) {
    const post = await runPost(r.id).catch(() => null);
    if (post === null) continue;
    out.push(counted("run", r.id, post, r.status));
    listed.add(r.id);
  }
  const registry = registryOrNull();
  if (registry === null) return out;
  for (const slug of await publicationSlugs(registry)) {
    const p = await publicationOf(registry, slug).catch(() => null);
    if (p === null || (p.runId !== undefined && listed.has(p.runId))) continue;
    out.push(counted("publication", slug, p.post, p.status));
  }
  return out;
}

/** One adoptable post's text and its digest, or a refusal that says why it cannot be adopted. */
export async function readAdoptable(source: AdoptSource, id: string): Promise<AdoptedPost> {
  if (!RUN_ID_RE.test(id)) throw new ArticleError(`not a ${source === "run" ? "run id" : "publication slug"}: ${JSON.stringify(id)}`, 400, "bad-id");
  if (source === "run") {
    const { runs } = await listRuns();
    const run = runs.find((r) => r.id === id);
    if (run === undefined) throw new ArticleError(`no article run ${id}`, 404, "not-adoptable");
    if (!isFinalRun(run)) throw new ArticleError(`article run ${id} is ${run.status}; only an approved post is adopted`, 409, "not-adoptable");
    const post = await runPost(id);
    if (post === null) throw new ArticleError(`article run ${id} holds no post/post.md`, 404, "not-adoptable");
    return post;
  }
  const registry = registryOrNull();
  if (registry === null) throw new ArticleError(`no registry on this machine holds publication ${id}`, 404, "not-adoptable");
  const p = await publicationOf(registry, id);
  if (p === null) throw new ArticleError(`no publication ${id}`, 404, "not-adoptable");
  return p.post;
}
