// THE EXTRACT DISK LAYER — server only.
//
// foundry-out/extract/<id>/
//     run.json                 the manifest, rewritten after every unit
//     verdicts.json            the human's, never the engine's
//     sources/sNN.<ext>        the uploaded gallery, as uploaded
//     styles/<style>/replica-<src>-r<n>.jpg
//     styles/<style>/transfer-<k>.jpg
//
// Same rules as lib/foundry/store.ts: a run id is a strict slug, every
// run-relative path is resolved and checked to stay inside its run, and the
// versioned index (pipeline/foundry/styles.json) is the only thing a commit
// writes outside the run. A commit here is NOT destructive — nothing is
// deleted, because a rejected style's images are cheap and the human may
// want to see why it was rejected; the verdict is what is final.
//
// The live IO wires the engine to the app's two chokepoints: lib/imaging for
// eyes and pixels, lib/text for the one reasoning turn. Nothing here names a
// vendor. Which one served is on the manifest's `engines` block.

import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { generate, recognize } from "@/lib/imaging/router";
import type { ImageRef } from "@/lib/imaging/types";
import { reason } from "@/lib/text/router";

import { FoundryError } from "../store";
import type { Exemplar, StyleDef } from "../types";
import { foreignLease, newManifest, pruneFailures, step } from "./engine";
import type { EngineIO } from "./engine";
import { imageDims, nearestAspect } from "./imageDims";
import type {
  ExtractCommitResult,
  ExtractDetail,
  ExtractManifest,
  ExtractOptions,
  ExtractSource,
  ExtractSummary,
  ExtractUpload,
  ExtractVerdicts,
  StepResult,
} from "./types";

export const EXTRACT_ROOT = path.join(process.cwd(), "foundry-out", "extract");
const STYLES = path.join(process.cwd(), "pipeline", "foundry", "styles.json");

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
const SERVABLE = new Set([".png", ".jpg", ".jpeg", ".webp", ".json"]);
const EXT: Record<ExtractUpload["mime"], string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

/** Largest single upload the store accepts, decoded. The vendors take ~20 MB
 *  inline; this leaves headroom for the JSON envelope. */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_SOURCES = 60;

function runDir(id: string): string {
  if (!RUN_ID.test(id)) throw new FoundryError("That is not an extract run id.", 400);
  return path.join(EXTRACT_ROOT, id);
}

export function resolveInExtract(id: string, rel: string): string {
  const dir = runDir(id);
  const abs = path.resolve(dir, rel);
  if (abs !== dir && !abs.startsWith(dir + path.sep)) throw new FoundryError("Path is outside the run.", 400);
  if (!SERVABLE.has(path.extname(abs).toLowerCase())) throw new FoundryError("Not a servable file.", 400);
  return abs;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await rename(tmp, file);
}

async function readManifest(id: string): Promise<ExtractManifest> {
  const m = await readJson<ExtractManifest | null>(path.join(runDir(id), "run.json"), null);
  if (!m) throw new FoundryError(`No extract run called ${id}.`, 404);
  return m;
}

const readVerdicts = (id: string) => readJson<ExtractVerdicts>(path.join(runDir(id), "verdicts.json"), {});

/* ── Create ───────────────────────────────────────────────────────────────── */

/** A run id: date + slug, suffixed until free. */
async function freshId(slug: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const base = `${day}-${slug}`;
  for (let i = 0; i < 100; i++) {
    const id = i ? `${base}-${i + 1}` : base;
    try {
      await stat(path.join(EXTRACT_ROOT, id));
    } catch {
      return id;
    }
  }
  throw new FoundryError("Too many runs with that slug today.", 409);
}

export async function createRun(slug: string, uploads: ExtractUpload[], options: Partial<ExtractOptions> = {}): Promise<ExtractManifest> {
  const clean = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (!clean) throw new FoundryError("A slug is required.", 400);
  if (!uploads.length) throw new FoundryError("At least one image is required.", 400);
  if (uploads.length > MAX_SOURCES) throw new FoundryError(`At most ${MAX_SOURCES} images per run.`, 400);

  const id = await freshId(clean);
  const dir = path.join(EXTRACT_ROOT, id);
  await mkdir(path.join(dir, "sources"), { recursive: true });

  const sources: ExtractSource[] = [];
  for (let i = 0; i < uploads.length; i++) {
    const u = uploads[i];
    const bytes = Buffer.from(u.base64, "base64");
    if (!bytes.length) throw new FoundryError(`Image ${i + 1} (${u.name}) is empty.`, 400);
    if (bytes.length > MAX_SOURCE_BYTES) throw new FoundryError(`Image ${i + 1} (${u.name}) is over ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`, 400);
    const dims = imageDims(new Uint8Array(bytes));
    if (!dims) throw new FoundryError(`Image ${i + 1} (${u.name}) is not a PNG, JPEG or WebP.`, 400);
    const sid = `s${String(i + 1).padStart(2, "0")}`;
    const rel = `sources/${sid}${EXT[u.mime]}`;
    await writeFile(path.join(dir, rel), bytes);
    sources.push({
      id: sid,
      name: u.name.slice(0, 120),
      file: rel,
      mime: u.mime,
      width: dims.width,
      height: dims.height,
      aspect: nearestAspect(dims.width, dims.height),
      readback: null,
      error: null,
    });
  }
  const m = newManifest(id, clean, sources, options, new Date().toISOString());
  await writeJsonAtomic(path.join(dir, "run.json"), m);
  return m;
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function listExtractRuns(): Promise<ExtractSummary[]> {
  let names: string[];
  try {
    names = await readdir(EXTRACT_ROOT);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: ExtractSummary[] = [];
  for (const name of names) {
    if (!RUN_ID.test(name)) continue;
    const m = await readJson<ExtractManifest | null>(path.join(EXTRACT_ROOT, name, "run.json"), null);
    if (!m) continue;
    const v = await readJson<ExtractVerdicts>(path.join(EXTRACT_ROOT, name, "verdicts.json"), {});
    out.push({
      id: m.id,
      slug: m.slug,
      created: m.created,
      status: m.status,
      progress: m.progress,
      sources: m.sources.length,
      styles: m.styles.length,
      decided: Object.keys(v).length,
      kept: Object.values(v).filter((r) => r.verdict === "keep").length,
    });
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1));
}

export async function getExtractRun(id: string): Promise<ExtractDetail> {
  const [run, verdicts] = await Promise.all([readManifest(id), readVerdicts(id)]);
  return { run, verdicts };
}

export async function extractFileStat(id: string, rel: string): Promise<{ abs: string; size: number }> {
  const abs = resolveInExtract(id, rel);
  try {
    const s = await stat(abs);
    return { abs, size: s.size };
  } catch {
    throw new FoundryError("No such file in the run.", 404);
  }
}

/* ── The live IO ──────────────────────────────────────────────────────────── */

const MIME_OF: Record<string, ImageRef["mime"]> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

/** Who is driving, for the lease. The app is one owner however many browser
 *  tabs are open — the in-process lock below serialises those. */
export type DriverOwner = "app" | "cli";

export function liveIO(id: string, owner: DriverOwner): EngineIO {
  const dir = runDir(id);
  return {
    async readImage(rel) {
      const abs = resolveInExtract(id, rel);
      const bytes = await readFile(abs);
      return { base64: bytes.toString("base64"), mime: MIME_OF[path.extname(abs).toLowerCase()] ?? "image/jpeg" };
    },
    async writeImage(rel, img) {
      const abs = resolveInExtract(id, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, Buffer.from(img.base64, "base64"));
    },
    async recognize(image, instruction, schema) {
      const r = await recognize({ image, instruction, schema });
      return { value: r.json, model: `${r.provenance.provider}/${r.provenance.model}` };
    },
    async generate(prompt, negativePrompt, aspect, seed) {
      const g = await generate({ prompt, negativePrompt, aspect, count: 1, seed });
      return { value: g.images[0], model: `${g.provenance.provider}/${g.provenance.model}` };
    },
    async reason(prompt, schema) {
      const r = await reason({ prompt, schema, turn: "style-synthesis" });
      return { value: r.json, model: `${r.provenance.provider}/${r.provenance.model}` };
    },
    save: (m) => {
      const terminal = m.status === "done" || m.status === "failed" || m.status === "committed";
      if (terminal) delete m.lease;
      else m.lease = { owner, at: new Date().toISOString() };
      return writeJsonAtomic(path.join(dir, "run.json"), m);
    },
    now: () => new Date().toISOString(),
  };
}

/* ── Step: one unit, or several ───────────────────────────────────────────── */

/** In-process lock per run, so two overlapping /step calls from one browser
 *  (a retry racing a slow round) cannot both append the same round. A second
 *  caller waits for the first and then takes its own unit. */
const locks = new Map<string, Promise<unknown>>();

export async function stepRun(id: string, units = 1, retry = false): Promise<StepResult> {
  const prev = locks.get(id) ?? Promise.resolve();
  const mine = prev.then(async () => {
    const m = await readManifest(id);
    if (m.status === "committed") throw new FoundryError("This run is committed.", 409);
    const other = foreignLease(m, "app", Date.now());
    if (other) throw new FoundryError(`This run is being driven by the ${other.owner} right now; wait for it, or for its lease to lapse.`, 409);
    const io = liveIO(id, "app");
    // A retry prunes every failed element and puts the run back in a live
    // stage; the loop below then takes them again. On a run with nothing
    // failed it is a no-op.
    if (retry) {
      const n = pruneFailures(m);
      m.log.push({ at: io.now(), msg: `retry: ${n} failed unit(s) pruned` });
      await io.save(m);
    }
    let last: StepResult = { unit: null, status: m.status, progress: m.progress };
    for (let i = 0; i < Math.max(1, units); i++) {
      last = await step(m, io);
      if (last.unit === null || last.unit === "finish") break;
    }
    return last;
  });
  locks.set(id, mine.catch(() => undefined));
  try {
    return await mine;
  } finally {
    if (locks.get(id) === mine) locks.delete(id);
  }
}

/* ── Verdicts and commit ──────────────────────────────────────────────────── */

export async function putExtractVerdicts(id: string, verdicts: ExtractVerdicts): Promise<void> {
  const run = await readManifest(id);
  if (run.status === "committed") throw new FoundryError("This run is committed; its verdicts are final.", 409);
  const known = new Set(run.styles.map((s) => s.id));
  const clean: ExtractVerdicts = {};
  for (const [sid, rec] of Object.entries(verdicts)) {
    if (!known.has(sid)) continue;
    if (rec.verdict !== "keep" && rec.verdict !== "reject") continue;
    clean[sid] = { verdict: rec.verdict, at: rec.at || new Date().toISOString() };
  }
  await writeJsonAtomic(path.join(runDir(id), "verdicts.json"), clean);
}

/** Write every KEPT style into the catalogue as a `candidate`, with its
 *  exemplars. Rejected styles are recorded on the run and nothing else. */
export async function commitExtractRun(id: string, verdictsIn?: ExtractVerdicts): Promise<ExtractCommitResult> {
  const run = await readManifest(id);
  if (run.status === "committed") throw new FoundryError("This run is already committed.", 409);
  if (run.status !== "done") throw new FoundryError("The run is not finished.", 409);
  if (verdictsIn) await putExtractVerdicts(id, verdictsIn);
  const verdicts = await readVerdicts(id);
  const at = new Date().toISOString();

  const kept = run.styles.filter((s) => verdicts[s.id]?.verdict === "keep");
  const rejected = run.styles.filter((s) => verdicts[s.id]?.verdict === "reject");
  if (!kept.length) throw new FoundryError("Keep at least one style first.", 400);

  const catalogue = await readJson<{ styles: StyleDef[] } & Record<string, unknown>>(STYLES, { styles: [] });
  const taken = new Set(catalogue.styles.map((s) => s.id));
  const written: string[] = [];
  const models = [run.engines.vision, run.engines.reasoner, run.engines.generator].filter((x): x is string => !!x);

  for (const s of kept) {
    let cid = s.id;
    for (let i = 2; taken.has(cid); i++) cid = `${s.id}-${i}`;
    taken.add(cid);
    const exemplars: Exemplar[] = [];
    for (const mid of s.members) {
      const src = run.sources.find((x) => x.id === mid);
      if (src) exemplars.push({ kind: "extract", run: id, file: src.file, role: "source" });
    }
    for (const r of s.replicas) {
      const best = [...r.rounds].filter((x) => x.file).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
      if (best?.file) exemplars.push({ kind: "extract", run: id, file: best.file, role: "replica" });
    }
    for (const t of s.transfers) if (t.file) exemplars.push({ kind: "extract", run: id, file: t.file, role: "transfer" });

    catalogue.styles.push({
      id: cid,
      name: s.name,
      family: s.family,
      status: "candidate",
      origin: { kind: "extracted", source: id, models },
      observables: { ...s.observables },
      recipe: s.recipe,
      negative: s.negative,
      evidence: [],
      exemplars,
    });
    written.push(cid);
  }
  await writeJsonAtomic(STYLES, catalogue);

  run.status = "committed";
  run.committed = { at, kept: kept.map((s) => s.id), rejected: rejected.map((s) => s.id) };
  run.log.push({ at, msg: `committed: ${written.join(", ")} → styles.json` });
  await writeJsonAtomic(path.join(runDir(id), "run.json"), run);
  return { kept: kept.map((s) => s.id), rejected: rejected.map((s) => s.id), written };
}
