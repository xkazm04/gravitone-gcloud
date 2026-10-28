import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { manifestRegistryLocal } from "../../articles/registryRead";
import { watchlistRelOf } from "./knowledge";

// THE REGISTRY DIGEST - server only. What the ai-registry says about tonight's work, written
// into each new night as registry.md beside taste.md (spark registry-feedback-loop, 2026-10-22):
// the media-generation techniques whose use_when matches the night's directions, and the
// registry's gaps, one of which steers one search line a night.
//
// The registry is READ, never written, from here. The only write is one line to this repo's
// own `.ai/consults.jsonl` (the knowledge-sync clause: bare slugs, `deviations` 0 - a digest
// raises nothing), and only when a registry resolved: a night that read nothing logs nothing.
//
// THE LOOKUP reads `knowledge/media-generation/index.json` in-process rather than spawning
// `scripts/research-map.mjs --json`. Both were measured on this box on 2026-10-22 against the
// real registry (37 subjects, 253 techniques, a 188 KB index): the spawn took ~210 ms wall for
// three terms and answers at SUBJECT grain - its hit names the subject's file and lists
// `matched_techniques` with no use_when, so the line this digest owes ("<subject>/<technique>
// - <one use_when> (<file>)") would still need the index read here. The direct read - parse,
// score every technique against every direction, count the thin subjects' application files -
// took ~25 ms end to end, and has no child process to fail.
// The index is the registry's own published projection (`scripts/build-index.mjs`), so reading
// it is not a second implementation of the registry's rules - and every path printed is the
// index's `file`, verbatim: a path is never built from a slug (the registry's addressing rule).
//
// Ranking is token overlap weighted by rarity (idf over the bundle's techniques). Each direction
// is one vote - the share of its weight a technique answers - and the votes are summed, so a
// technique that answers three of tonight's directions outranks one that echoes a long watchlist
// line's commonest word. At most four lines per subject: twelve
// lines that all say visual-style-locking tell the night less than twelve that span it.

export type RegistryDigestOptions = {
  /** The registry checkout; default `AI_REGISTRY_DIR`, else `.ai/manifest.yaml` `registry.local`. */
  readonly registryDir?: string;
  /** The repo whose knowledge/ and .ai/ are read and logged to; default `process.cwd()`. */
  readonly repoDir?: string;
  /** The night's search directions, verbatim; absent, the lines of `knowledge/scout/watchlist.md` then the muse archive's `knowledge/scout-muse/watchlist.md` under repoDir. */
  readonly directions?: readonly string[];
};

export type RegistryDigest = {
  /** The markdown the night reads: `registry: none` when no registry resolves - never a failure. */
  readonly text: string;
  /** Where the registry resolved, when it did. */
  readonly registryDir?: string;
  /** What was read, for the consults line: bare slugs. */
  readonly subjects: readonly string[];
  readonly techniques: readonly string[];
};

export const REGISTRY_BUNDLE = "media-generation";
/** Where the bundle's index sits under a registry checkout. */
export const REGISTRY_INDEX = path.join("knowledge", REGISTRY_BUNDLE, "index.json");
/** The scout's own vocabulary: what every night does, whatever the watchlist says. */
export const SCOUT_VOCABULARY = ["art style extraction", "scene grammar", "camera movement", "lighting", "cut rhythm", "local video model", "genre"] as const;
export const REGISTRY_REMEDY = "set AI_REGISTRY_DIR or .ai/manifest.yaml registry.local";

const GOVERNS_CAP = 12;
const GAPS_CAP = 8;
const PER_SUBJECT = 4;
const LOOK_FOR_WORDS = 15;
/**
 * The subjects scout's own acts are governed by (the spark's scout digest, 2026-10-22): style
 * extraction is visual-style-locking, a scene recipe is cinematic-language and frame-direction,
 * a replica still is image-prompt-composition, the engine choice is generative-provider-routing,
 * a clip's shape is platform-format-adaptation. Every slug was checked against the real index.
 * A technique in one of these that matches the night at all has its score TRIPLED - a multiplier,
 * not a tier: a tier lets a one-word "cut" match in a governing subject outrank a technique that
 * answers seven of tonight's directions outside them (video-assembly/generated-shot-sourcing,
 * which stays in). Measured on the real index 2026-10-22: x1 left style-onboarding-from-sample
 * 31st; x2 lifted it to 11th but kept chunk-boundary-continuity, in on "scene" and "cut" alone;
 * x3 keeps the first and drops the second.
 */
export const GOVERNING_SUBJECTS: ReadonlySet<string> = new Set(["visual-style-locking", "cinematic-language", "frame-direction", "image-prompt-composition", "generative-provider-routing", "platform-format-adaptation"]);
const GOVERNING_BOOST = 3;
/** The categories whose thin subjects are the scout's to fill: it makes pictures and runs nights. */
const THIN_CATEGORIES = new Set(["visual-generation", "production-ops"]);

type Technique = { readonly slug: string; readonly use_when?: readonly string[] };
type Subject = {
  readonly category?: string;
  readonly status?: string;
  readonly file: string;
  readonly techniques?: readonly Technique[];
  readonly applications?: readonly { readonly technique?: string }[];
};
export type RegistryIndex = { readonly subjects: Readonly<Record<string, Subject>> };

/** A resolved registry and its index, or the one clause that says why there is none. */
export type Resolved = { readonly dir: string; readonly index: RegistryIndex } | { readonly why: string };

const isDir = async (p: string): Promise<boolean> => (await stat(p).catch(() => null))?.isDirectory() ?? false;

/** Where the registry lives - the option, the env, then the manifest - and its parsed index. Never throws. */
export async function resolveRegistry(o: { readonly registryDir?: string; readonly repoDir?: string; readonly env?: Readonly<Record<string, string | undefined>> } = {}): Promise<Resolved> {
  const repo = o.repoDir ?? process.cwd();
  const fromEnv = (o.env ?? process.env)["AI_REGISTRY_DIR"]?.trim();
  let dir: string;
  let via: string;
  if (o.registryDir !== undefined && o.registryDir !== "") [dir, via] = [o.registryDir, "the registryDir option"];
  else if (fromEnv !== undefined && fromEnv !== "") [dir, via] = [fromEnv, "AI_REGISTRY_DIR"];
  else {
    const yaml = await readFile(path.join(repo, ".ai", "manifest.yaml"), "utf8").catch(() => null);
    const local = yaml === null ? undefined : manifestRegistryLocal(yaml);
    if (local === undefined) return { why: yaml === null ? "no AI_REGISTRY_DIR and no .ai/manifest.yaml" : "no AI_REGISTRY_DIR and no registry.local in .ai/manifest.yaml" };
    [dir, via] = [path.resolve(repo, local), "registry.local"];
  }
  dir = path.resolve(repo, dir);
  if (!(await isDir(dir))) return { why: `${via} names ${dir}, which does not exist` };
  let raw: string;
  try {
    raw = await readFile(path.join(dir, REGISTRY_INDEX), "utf8");
  } catch {
    return { why: `no ${REGISTRY_INDEX.replaceAll("\\", "/")} under ${dir}` };
  }
  try {
    const index = JSON.parse(raw) as RegistryIndex;
    if (typeof index.subjects !== "object" || index.subjects === null) return { why: `${dir}'s index.json carries no subjects` };
    return { dir, index };
  } catch (e) {
    return { why: `${dir}'s index.json does not parse: ${(e as Error).message}` };
  }
}

export const techniqueCount = (index: RegistryIndex): number => Object.values(index.subjects).reduce((n, s) => n + (s.techniques?.length ?? 0), 0);

// --- matching -------------------------------------------------------------------------------

const STOP = new Set("the and for with from into over under that this what when where which while their them they its his her our your you are was were has have had not but how why who all any one two can may will each every more most less only than then there these those such about after before between onto per via also just very much many some".split(" "));

/** A crude stem - a plural's `s`, then one of a few endings - so `extraction` meets `extractor` and `lighting` meets `light`. */
function stem(w: string): string {
  const one = w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
  for (const end of ["ing", "ion", "ed", "er", "or", "ly"]) if (one.endsWith(end) && one.length - end.length >= 4) return one.slice(0, -end.length);
  return one;
}

/** Lower-case word stems of three letters or more, the commonest small words dropped. */
export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) if (w.length >= 3 && !STOP.has(w)) out.add(stem(w));
  return out;
}

/** A watchlist bullet as a direction: its kind tag and any url dropped, the words kept. */
export function watchlistDirections(md: string): string[] {
  const out: string[] = [];
  for (const line of md.split(/\r?\n/)) {
    const m = /^\s*[-*]\s+(.*)$/.exec(line);
    if (m?.[1] === undefined) continue;
    const text = m[1]
      .replace(/^(channel|site|tag):\s*/i, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/(\s+-)+\s+/g, " - ")
      .replace(/^-\s+|\s+-$/g, "")
      .trim();
    if (text !== "") out.push(text);
  }
  return out;
}

type Row = { readonly subject: string; readonly technique: string; readonly useWhen: string; readonly file: string; readonly score: number };

function rank(index: RegistryIndex, directions: readonly string[]): Row[] {
  const techs: { subject: string; t: Technique; file: string; bag: Set<string> }[] = [];
  for (const [subject, s] of Object.entries(index.subjects)) {
    for (const t of s.techniques ?? []) techs.push({ subject, t, file: s.file, bag: tokens([subject, t.slug, ...(t.use_when ?? [])].join(" ")) });
  }
  const df = new Map<string, number>();
  for (const x of techs) for (const w of x.bag) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string): number => Math.log(1 + techs.length / (df.get(w) ?? techs.length));
  const queries = directions.map(tokens);
  const all = new Set(queries.flatMap((q) => [...q]));
  const weigh = (bag: Set<string>, q: Set<string>): number => [...q].reduce((n, w) => n + (bag.has(w) ? idf(w) : 0), 0);
  // Each direction is one vote: the share of its weight a technique answers. A long watchlist
  // line would otherwise outvote "lighting" by sheer word count.
  const whole = queries.map((q) => weigh(new Set(q), q) || 1);
  const rows: Row[] = [];
  for (const x of techs) {
    const score = queries.reduce((n, q, i) => n + weigh(x.bag, q) / (whole[i] ?? 1), 0) * (GOVERNING_SUBJECTS.has(x.subject) ? GOVERNING_BOOST : 1);
    if (score <= 0) continue;
    const uses = x.t.use_when ?? [];
    let best = uses[0] ?? "";
    let bestScore = -1;
    for (const u of uses) {
      const sc = weigh(tokens(u), all);
      if (sc > bestScore) [best, bestScore] = [u, sc];
    }
    rows.push({ subject: x.subject, technique: x.t.slug, useWhen: best, file: x.file, score });
  }
  rows.sort((a, b) => b.score - a.score || `${a.subject}/${a.technique}`.localeCompare(`${b.subject}/${b.technique}`));
  const per = new Map<string, number>();
  const kept: Row[] = [];
  for (const r of rows) {
    if (kept.length >= GOVERNS_CAP) break;
    const n = per.get(r.subject) ?? 0;
    if (n >= PER_SUBJECT) continue;
    per.set(r.subject, n + 1);
    kept.push(r);
  }
  return kept;
}

// --- gaps -----------------------------------------------------------------------------------

/** At most fifteen words: a gap line says what a search would look for, not why. */
function lookFor(text: string): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  return words.length <= LOOK_FOR_WORDS ? words.join(" ") : `${words.slice(0, LOOK_FOR_WORDS - 1).join(" ")} …`;
}

const words = (slug: string): string => slug.replace(/-/g, " ");

/** Files under the subject's `applications/` beside its document (the index's `file`, verbatim). */
async function applicationFiles(registry: string, file: string): Promise<number> {
  const dir = path.join(registry, path.dirname(file), "applications");
  const names = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return names.filter((d) => d.isFile()).length;
}

/** `## Q1 · Is the hazard list ...?` -> `Q1 · Is the hazard list ...?`: every `##`/`###` heading's text. */
export function openQuestionHeadings(md: string): string[] {
  return md
    .split(/\r?\n/)
    .map((l) => /^#{2,3}\s+(.+?)\s*$/.exec(l)?.[1])
    .filter((h): h is string => h !== undefined);
}

async function gaps(registry: string, index: RegistryIndex, repo: string): Promise<string[]> {
  const draft: string[] = [];
  const thin: string[] = [];
  for (const [subject, s] of Object.entries(index.subjects)) {
    if (s.status === "draft") {
      draft.push(`- ${subject} (draft) - look for: ${lookFor(`published evidence on ${words(subject)} to forge it`)}`);
      continue;
    }
    if (!THIN_CATEGORIES.has(s.category ?? "")) continue;
    const n = await applicationFiles(registry, s.file);
    if (n > 1) continue;
    const applied = new Set((s.applications ?? []).map((a) => a.technique));
    const bare = (s.techniques ?? []).find((t) => !applied.has(t.slug)) ?? s.techniques?.[0];
    const use = bare?.use_when?.[0] ?? words(subject);
    thin.push(`- ${subject} (${n} application${n === 1 ? "" : "s"}) - look for: ${lookFor(`a worked case of ${use}`)}`);
  }
  const md = await readFile(path.join(repo, "knowledge", "OPEN-QUESTIONS.md"), "utf8").catch(() => "");
  const open = openQuestionHeadings(md).map((h) => {
    const [name, question] = h.includes(" · ") ? [h.slice(0, h.indexOf(" · ")), h.slice(h.indexOf(" · ") + 3)] : ["", h];
    return `- OPEN-QUESTIONS${name === "" ? "" : ` ${name}`} - look for: ${lookFor(question)}`;
  });
  // Round-robin so no one kind crowds the others out of eight lines: the project's own open
  // questions are as much a gap as the registry's drafts.
  const out: string[] = [];
  const lanes = [draft, thin, open];
  for (let i = 0; out.length < GAPS_CAP && lanes.some((l) => i < l.length); i++) {
    for (const l of lanes) if (i < l.length && out.length < GAPS_CAP) out.push(l[i] as string);
  }
  return out;
}

// --- the digest -----------------------------------------------------------------------------

const isoSeconds = (d: Date): string => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** One line to `<repo>/.ai/consults.jsonl` - a failed append costs the log, never the night. */
async function logConsult(repo: string, subjects: readonly string[], techniques: readonly string[]): Promise<void> {
  const line = JSON.stringify({ ts: isoSeconds(new Date()), bundle: REGISTRY_BUNDLE, subjects, techniques, deviations: 0 });
  try {
    await mkdir(path.join(repo, ".ai"), { recursive: true });
    await appendFile(path.join(repo, ".ai", "consults.jsonl"), `${line}\n`, "utf8");
  } catch {
    // The digest is still true without its log line.
  }
}

export async function registryDigest(o: RegistryDigestOptions = {}): Promise<RegistryDigest> {
  const repo = path.resolve(o.repoDir ?? process.cwd());
  const r = await resolveRegistry({ ...(o.registryDir === undefined ? {} : { registryDir: o.registryDir }), repoDir: repo });
  if ("why" in r) return { text: `# Registry\n\nregistry: none (${r.why})\n`, subjects: [], techniques: [] };

  // One loop (spark scout-vision S3): the scout watchlist, then the muse archive's, read as legacy - its character craft
  // is tonight's too.
  const read = (rel: string): Promise<string> => readFile(path.join(repo, "knowledge", ...rel.split("/")), "utf8").catch(() => "");
  const watch = o.directions ?? [...new Set([...watchlistDirections(await read(watchlistRelOf("scout"))), ...watchlistDirections(await read(watchlistRelOf("muse")))])];
  let rows: Row[];
  let gapLines: string[];
  try {
    rows = rank(r.index, [...watch, ...SCOUT_VOCABULARY]);
    gapLines = await gaps(r.dir, r.index, repo);
  } catch (e) {
    // An index of a shape this reader does not know: the night opens without the registry.
    return { text: `# Registry\n\nregistry: none (${r.dir}'s index.json is not the shape this digest reads: ${(e as Error).message})\n`, subjects: [], techniques: [] };
  }
  const subjects = [...new Set(rows.map((x) => x.subject))];
  const techniques = [...new Set(rows.map((x) => x.technique))];

  const governs = rows.length === 0 ? ["- nothing in the bundle matched tonight's directions"] : rows.map((x) => `- ${x.subject}/${x.technique} - ${x.useWhen} (${x.file})`);
  const text = ["# Registry", "", "## Governs tonight", "", ...governs, "", "## Gaps", "", ...(gapLines.length === 0 ? ["- none found"] : gapLines), ""].join("\n");
  await logConsult(repo, subjects, techniques);
  return { text, registryDir: r.dir, subjects, techniques };
}
