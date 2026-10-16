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

import { readFileSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { estimatePerImage } from "@/lib/imaging/pricing";
import { generate, recognize } from "@/lib/imaging/router";
import type { ImageRef } from "@/lib/imaging/types";
import { reason } from "@/lib/text/router";

import {
  FoundryError,
  containedIn,
  listManifests,
  readJson,
  readManifestFile,
  runRoot,
  writeJsonAtomic,
} from "../runStore";
import { blobStore } from "@gt/kernel/blob";
import type { StyleDraft } from "@gt/kernel/styles/core";
import { commitExtractStylesIn } from "@gt/kernel/styles/writers";
import { blobRootOf } from "../../kernelProcess.ts";
import type { BlobRef } from "@gt/domain/blob";
import { DEFAULT_CALL_ESTIMATE_USD, newManifest, settleReason } from "./engine";
import type { EngineIO } from "./engine";
import { imageDims, nearestAspect } from "./imageDims";
import { exportStyles, extractRoot, OPERATOR, readStyleDefs, styleStore } from "../catalogue";
import { planExtractCommit } from "../commitPlan";
import { foundryFs } from "../fsPort";
import type {
  ExtractCommitPlan,
  ExtractCommitResult,
  ExtractDetail,
  ExtractManifest,
  ExtractOptions,
  ExtractSource,
  ExtractSummary,
  ExtractUpload,
  ExtractVerdictRecord,
  ExtractVerdicts,
} from "./types";
import {
  patchVerdictMap,
  readVerdictState,
  replaceVerdictMap,
  replaceVerdictMapHeld,
  withRunLock,
  type VerdictPatch,
  type VerdictSpec,
  type VerdictState,
} from "../verdictLog";

/** EXTRACT_STORE_DIR redirects the run root, the way ARTICLES_STORE_DIR and the
 *  other `*_DIR` roots do, so a test or a probe cell never writes the checkout. */
export const EXTRACT_ROOT = extractRoot();

const EXT: Record<ExtractUpload["mime"], string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

/** Largest single upload the store accepts, decoded. The vendors take ~20 MB
 *  inline; this leaves headroom for the JSON envelope. */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_SOURCES = 60;

function runDir(id: string): string {
  return runRoot(EXTRACT_ROOT, id, "extract run");
}

export function resolveInExtract(id: string, rel: string): string {
  return containedIn(runDir(id), rel, true, "run");
}

async function readManifest(id: string): Promise<ExtractManifest> {
  const m = await readManifestFile<ExtractManifest>(path.join(runDir(id), "run.json"), id, "extract run");
  if (m === undefined)
    throw new FoundryError(`The manifest of extract run ${id} is unreadable — a driver may be mid-write, or the file is damaged. Try again; if it persists, inspect foundry-out/extract/${id}/run.json.`, 503);
  if (!m) throw new FoundryError(`No extract run called ${id}.`, 404);
  return m;
}

/**
 * The manifest, read SYNCHRONOUSLY: the job's plan reads it inside the kernel's
 * store transaction, which cannot await (lib/producers/extract.ts). Same
 * sentences as `readManifest` for an absent and an unreadable file.
 */
export function readManifestNow(id: string): ExtractManifest {
  const file = path.join(runDir(id), "run.json");
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new FoundryError(`No extract run called ${id}.`, 404);
    throw e;
  }
  try {
    return JSON.parse(text) as ExtractManifest;
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e;
    throw new FoundryError(`The manifest of extract run ${id} is unreadable — inspect foundry-out/extract/${id}/run.json.`, 503);
  }
}

/** Write the manifest back (tmp + rename). The job's port presents its fence first. */
export const saveManifest = (m: ExtractManifest): Promise<void> => writeJsonAtomic(path.join(runDir(m.id), "run.json"), m);

const readVerdicts = (id: string) => readJson<ExtractVerdicts>(path.join(runDir(id), "verdicts.json"), {});

/* ── Create ───────────────────────────────────────────────────────────────── */

/**
 * Claim a run id: date + slug, suffixed until free. The DIRECTORY is the
 * reservation — a non-recursive `mkdir` throws EEXIST atomically, so the id is
 * held by the same syscall that proves it was free (a stat-then-create gap let
 * two concurrent creates take the same id and overwrite each other's run.json).
 * Only EEXIST means "taken"; any other error (permissions, disk) propagates.
 */
async function reserveRunDir(slug: string): Promise<{ id: string; dir: string }> {
  const day = new Date().toISOString().slice(0, 10);
  const base = `${day}-${slug}`;
  await mkdir(EXTRACT_ROOT, { recursive: true });
  for (let i = 0; i < 100; i++) {
    const id = i ? `${base}-${i + 1}` : base;
    const dir = path.join(EXTRACT_ROOT, id);
    try {
      await mkdir(dir);
      return { id, dir };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
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

  // VALIDATE EVERY UPLOAD BEFORE TOUCHING THE DISK. This used to decode and
  // write one image at a time, refusing on the first bad one — so a gallery
  // whose third file was a GIF left `sources/s01`, `sources/s02` in a run
  // directory with no run.json: invisible to the list (no manifest), counted
  // by `reserveRunDir` (the directory exists), so the operator's next attempt with
  // the same slug landed on `-2` and the orphan stayed on disk for good. A
  // refusal must leave nothing behind, and the 400 must name the bad image
  // before anything has been written for it.
  const prepared: { bytes: Buffer; source: ExtractSource }[] = [];
  for (let i = 0; i < uploads.length; i++) {
    const u = uploads[i];
    const bytes = Buffer.from(u.base64, "base64");
    if (!bytes.length) throw new FoundryError(`Image ${i + 1} (${u.name}) is empty.`, 400);
    if (bytes.length > MAX_SOURCE_BYTES) throw new FoundryError(`Image ${i + 1} (${u.name}) is over ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`, 400);
    const dims = imageDims(new Uint8Array(bytes));
    if (!dims) throw new FoundryError(`Image ${i + 1} (${u.name}) is not a PNG, JPEG or WebP.`, 400);
    const sid = `s${String(i + 1).padStart(2, "0")}`;
    const rel = `sources/${sid}${EXT[u.mime]}`;
    prepared.push({
      bytes,
      source: {
        id: sid,
        name: u.name.slice(0, 120),
        file: rel,
        mime: u.mime,
        width: dims.width,
        height: dims.height,
        aspect: nearestAspect(dims.width, dims.height),
        readback: null,
        error: null,
      },
    });
  }

  const { id, dir } = await reserveRunDir(clean);
  await mkdir(path.join(dir, "sources"), { recursive: true });
  for (const p of prepared) await writeFile(path.join(dir, p.source.file), p.bytes);
  const sources = prepared.map((p) => p.source);
  const m = newManifest(id, clean, sources, options, new Date().toISOString());
  await writeJsonAtomic(path.join(dir, "run.json"), m);
  return m;
}

/* ── Reads ────────────────────────────────────────────────────────────────── */

export async function listExtractRuns(): Promise<ExtractSummary[]> {
  const { items } = await listManifests<ExtractManifest, ExtractSummary>(EXTRACT_ROOT, "run.json", async (name, m) => {
    const v = await readJson<ExtractVerdicts>(path.join(EXTRACT_ROOT, name, "verdicts.json"), {});
    return {
      id: m.id,
      slug: m.slug,
      created: m.created,
      status: m.status,
      progress: m.progress,
      sources: m.sources.length,
      styles: m.styles.length,
      decided: Object.keys(v).length,
      kept: Object.values(v).filter((r) => r.verdict === "keep").length,
      ...(m.spend ? { spendUsd: m.spend.usd } : {}),
    };
  });
  return items.sort((a, b) => (a.created < b.created ? 1 : -1));
}

export async function getExtractRun(id: string): Promise<ExtractDetail> {
  const [run, { verdicts, rev }] = await Promise.all([readManifest(id), readVerdictState<ExtractVerdictRecord>(runDir(id))]);
  return { run, verdicts, rev };
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

/** Test seam: wraps the live IO for one run, so a probe can swap the vendor
 *  calls and keep the real disk. Null restores the live IO. Under a job the
 *  wrapped calls are still metered and still answered by stand-ins when dry
 *  (lib/producers/extract.ts), so this only ever replaces the VENDOR. */
let __ioOverride: ((id: string, live: EngineIO) => EngineIO) | null = null;
export function __setExtractIO(f: ((id: string, live: EngineIO) => EngineIO) | null): void {
  __ioOverride = f;
}

export function liveIO(id: string): EngineIO {
  const base = liveIOBase(id);
  return __ioOverride ? __ioOverride(id, base) : base;
}

function liveIOBase(id: string): EngineIO {
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
      return { value: r.json, model: `${r.provenance.provider}/${r.provenance.model}`, costUsd: r.provenance.costUsd, basis: r.provenance.costBasis };
    },
    async generate(prompt, negativePrompt, aspect, seed) {
      const g = await generate({ prompt, negativePrompt, aspect, count: 1, seed });
      return { value: g.images[0], model: `${g.provenance.provider}/${g.provenance.model}`, costUsd: g.provenance.costUsd, basis: g.provenance.costBasis };
    },
    async reason(prompt, schema) {
      const r = await reason({ prompt, schema, turn: "style-synthesis" });
      return { value: r.json, model: `${r.provenance.provider}/${r.provenance.model}`, costUsd: r.provenance.costUsd, basis: r.provenance.costBasis };
    },
    // A generate is estimated at the imaging layer's own per-image figure (it
    // errs high on purpose); vision and reasoning turns have no declared
    // per-call rate, so they take the engine's defaults.
    estimateUsd: (kind) => (kind === "generate" ? (estimatePerImage().usd ?? DEFAULT_CALL_ESTIMATE_USD.generate) : DEFAULT_CALL_ESTIMATE_USD[kind]),
    // No lease stamp any more: the run's kernel job holds a fenced slot lease
    // (lib/producers/extract.ts), which replaced v1's six-minute manifest stamp
    // and the in-process promise chain that serialised /step calls.
    save: (m) => {
      delete m.lease;
      return saveManifest(m);
    },
    now: () => new Date().toISOString(),
  };
}

/* ── Verdicts and commit ──────────────────────────────────────────────────── */

/** The extractor's gate rules for the verdict kernel (verdictLog.ts): a known
 *  style, keep or reject, and the reasons and note a reject carries. */
function verdictSpec(id: string): VerdictSpec<ExtractManifest, ExtractVerdictRecord> {
  return {
    dir: runDir(id),
    readManifest: () => readManifest(id),
    committed: (m) => (m.status === "committed" ? "This run is committed; its verdicts are final." : null),
    clean: (m, key, raw, by) => {
      if (!m.styles.some((s) => s.id === key)) return undefined;
      const rec = raw as Partial<ExtractVerdictRecord> | null;
      if (!rec || (rec.verdict !== "keep" && rec.verdict !== "reject")) return undefined;
      const reasons = Array.isArray(rec.reasons) ? rec.reasons.filter((r): r is string => typeof r === "string" && !!r).slice(0, 8) : [];
      const who = rec.by === "human" || rec.by === "model" ? rec.by : by;
      return {
        verdict: rec.verdict,
        at: rec.at || new Date().toISOString(),
        ...(reasons.length ? { reasons } : {}),
        ...(typeof rec.note === "string" && rec.note.trim() ? { note: rec.note.slice(0, 500) } : {}),
        ...(who ? { by: who } : {}),
      };
    },
  };
}

/** PUT: the whole map, written through the kernel as the diff it amounts to. */
export async function putExtractVerdicts(id: string, verdicts: ExtractVerdicts): Promise<void> {
  await replaceVerdictMap(verdictSpec(id), verdicts);
}

/** PATCH: keyed changes against a revision; 409 on a stale base. */
export function patchExtractVerdicts(id: string, patch: VerdictPatch): Promise<VerdictState<ExtractVerdictRecord>> {
  return patchVerdictMap(verdictSpec(id), patch);
}

/** Preview what an extract commit will do without writing to styles.json. */
export async function previewExtractCommit(id: string): Promise<ExtractCommitPlan> {
  const [run, verdicts, catalogue] = await Promise.all([
    readManifest(id),
    readVerdicts(id),
    readStyleDefs(),
  ]);
  return planExtractCommit(run, verdicts, catalogue);
}

export type CommitExtractOptions = { verdicts?: ExtractVerdicts; token?: string };

/** Write every KEPT style into the catalogue as a `candidate`, with its
 *  exemplars. Rejected styles are recorded on the run and nothing else. */
export async function commitExtractRun(
  id: string,
  verdictsOrOptions?: ExtractVerdicts | CommitExtractOptions | string,
  tokenArg?: string,
): Promise<ExtractCommitResult> {
  let verdictsIn: ExtractVerdicts | undefined;
  let token: string | undefined;

  if (typeof verdictsOrOptions === "string") {
    token = verdictsOrOptions;
  } else if (verdictsOrOptions && typeof verdictsOrOptions === "object") {
    if ("token" in verdictsOrOptions || "verdicts" in verdictsOrOptions) {
      const opts = verdictsOrOptions as { verdicts?: ExtractVerdicts; token?: string };
      verdictsIn = opts.verdicts;
      token = opts.token;
    } else {
      verdictsIn = verdictsOrOptions as ExtractVerdicts;
    }
  }
  if (tokenArg) token = tokenArg;

  // The run lock (verdictLog.ts) is taken FIRST: a verdict write that arrives
  // while this decides waits, then sees `committed`. Inline verdicts are
  // written under the lock already held, never re-taking it. The catalogue
  // half is ONE style-store transaction (packages/kernel/src/styles), which is
  // the fence v1's withCatalogue built by hand around styles.json.
  const dir = runDir(id);
  return withRunLock(dir, async () => {
    // Every disk effect below goes through the port (lib/foundry/fsPort.ts).
    const fs = foundryFs();
    const run = await readManifest(id);
    if (run.status === "committed") throw new FoundryError("This run is already committed.", 409);
    // A dry run's pixels and readbacks are stand-ins (lib/producers/extract.ts):
    // writing them into the catalogue would make placeholders evidence.
    if (run.dry) throw new FoundryError("This run was dry: its images are stand-ins, and a dry run is never committed.", 409);
    // `failed` is committable, as the forge's is: a breaker or budget stop leaves
    // finished styles the operator can judge, and exemplars carry `settled`.
    // Keep this array and EXTRACT_COMMITTABLE in app/foundry/parts.tsx identical.
    if (!["done", "failed"].includes(run.status)) throw new FoundryError("The extract is still running this run.", 409);
    if (verdictsIn) await replaceVerdictMapHeld(verdictSpec(id), run, verdictsIn, "commit");
    const verdicts = await readVerdicts(id);

    const plan = planExtractCommit(run, verdicts, await readStyleDefs());
    if (token !== undefined && token !== plan.token) {
      throw new FoundryError("The run state changed since the preview was generated.", 409);
    }

    const at = new Date().toISOString();

    const kept = run.styles.filter((s) => verdicts[s.id]?.verdict === "keep");
    const rejected = run.styles.filter((s) => verdicts[s.id]?.verdict === "reject");
    if (!kept.length) throw new FoundryError("Keep at least one style first.", 400);

    const models = [run.engines.vision, run.engines.reasoner, run.engines.generator].filter((x): x is string => !!x);
    const styles = await styleStore();
    const blobs = blobStore(blobRootOf(styles));
    // The exemplar FILES become blobs before the transaction (content-addressed,
    // so a retry re-puts nothing). A file that is gone is left out, never guessed.
    type Ex = StyleDraft["exemplars"][number];
    const exemplarOf = async (file: string, role: Ex["role"], settled?: Ex["settled"] | null): Promise<Ex[]> => {
      const ref = await exemplarBlob(blobs, id, file);
      return ref === undefined ? [] : [{ role, media: ref, run: id, file, ...(settled ? { settled } : {}) }];
    };
    const drafts: StyleDraft[] = [];
    for (const s of kept) {
      const exemplars: Ex[] = [];
      for (const mid of s.members) {
        const src = run.sources.find((x) => x.id === mid);
        if (src) exemplars.push(...(await exemplarOf(src.file, "source")));
      }
      for (const r of s.replicas) {
        const best = [...r.rounds].filter((x) => x.file).sort((a, b) => (b.score ?? -1) - (a.score ?? -1))[0];
        // The settle reason travels with the exemplar. Without it a replica the
        // loop GAVE UP on enters the catalogue as evidence the recipe works,
        // indistinguishable from one that hit the target.
        if (best?.file) exemplars.push(...(await exemplarOf(best.file, "replica", settleReason(run, r.rounds))));
      }
      for (const t of s.transfers) if (t.file) exemplars.push(...(await exemplarOf(t.file, "transfer")));
      drafts.push({ id: s.id, name: s.name, family: s.family, origin: { kind: "extracted" as const, source: id, models }, observables: { ...s.observables }, recipe: s.recipe, negative: s.negative, elements: [], evidence: [], exemplars, proofs: [] });
    }
    // Ids: a look's own, or `-2`, `-3` past every id another run holds; a retry
    // replaces this run's own unjudged entries rather than colliding with them.
    const committedStyles = styles.tx((t) => commitExtractStylesIn(t, id, drafts, OPERATOR));
    if (!committedStyles.ok) throw new FoundryError(`The commit failed: ${committedStyles.error.message}`, committedStyles.error.code === "refused" || committedStyles.error.code === "conflict" ? 409 : 503);
    const written = committedStyles.value;
    exportStyles(styles);

    run.status = "committed";
    // Cost per usable: what the whole run spent over what survived the cull.
    const spendUsd = run.spend?.usd;
    run.committed = {
      at,
      kept: kept.map((s) => s.id),
      rejected: rejected.map((s) => s.id),
      written,
      ...(spendUsd !== undefined ? { spendUsd, costPerKeptUsd: Math.round((spendUsd / kept.length) * 1e6) / 1e6 } : {}),
    };
    run.log.push({ at, msg: `committed: ${written.join(", ")} → styles.json` });
    await fs.writeJsonAtomic(path.join(dir, "run.json"), run);
    return { kept: kept.map((s) => s.id), rejected: rejected.map((s) => s.id), written };
  });
}

const IMAGE_MIME: Readonly<Record<string, string>> = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

/** A run-relative file as a blob, or undefined when the file is not on disk. */
async function exemplarBlob(blobs: ReturnType<typeof blobStore>, id: string, rel: string): Promise<BlobRef | undefined> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(resolveInExtract(id, rel));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  const put = await blobs.put(bytes, IMAGE_MIME[path.extname(rel).toLowerCase()] ?? "image/jpeg");
  if (!put.ok) throw new FoundryError(`exemplar ${id}/${rel}: ${put.error.message}`, 503);
  return put.value;
}
