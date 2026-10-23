import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { AppError, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import type { Store } from "@gt/kernel/store";
import { MESH } from "@gt/producers/mesh/define";
import { madeFree, madePaid } from "@gt/producers/research/partAct";
import { meteredCall } from "@gt/producers/research/metered";
import type { AssetPorts, AssetRequest } from "@gt/producers/scout-asset/define";

import { ImagingError } from "../imaging/errors.ts";
import type { GeneratedImages, GenerateRequest, ImageRef } from "../imaging/types.ts";
import { admitsMesh, inputGate, type Decode } from "../foundry/mesh/inputGate.ts";
import { assetDir, createAsset, resolveInAsset } from "../foundry/mesh/store.ts";
import { TECHNIQUES, type GateResult, type MeshAsset, type MeshVariant, type Technique } from "../foundry/mesh/types.ts";
import { readAssetNow } from "../foundry/mesh/variant.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { assetConceptName, assetIdFor, conceptFile, conceptIndexOf, standConcept } from "../foundry/scout/concept.ts";
import { REPLICA_GENERATOR, REPLICA_NEGATIVE } from "../foundry/scout/scene.ts";
import { mutateNight, readNight, resolveInNight, withCandidate } from "../foundry/scout/store.ts";
import type { Asset3dCandidate, Night } from "../foundry/scout/types.ts";
import { imageFailure } from "./frames.ts";
import { launchStage } from "./mesh.ts";

// THE ASSET'S ACTS - the ports of packages/producers/src/scout-asset/define.ts over the imaging
// router, the input gate, the mesh store and the night store.
//
//   concept   one Flare still from the request's prompt, metered (a dry job is answered by
//             lib/foundry/scout/concept.ts `standConcept`, OUR silhouette on a plain ground, and
//             books a would-call), written to assets/<c-NN>/concept-<k>.<ext> in the night
//   handoff   every concept through the input gate; the mesh asset written with one variant per
//             technique - a variant whose concept failed (or could not be decoded) is written
//             FAILED with the gate's codes and never reaches a GPU; the mesh job queued in this
//             job's mode for the worker. Every concept refused: no asset, no job, the candidate
//             failed with the codes. Idempotent: an asset already written is read, an open mesh
//             job is that job.
//   ended     a failed job's sentence on the candidate, verbatim
//
// Every night write is fenced against the job's slot first (the scene acts' `fence`).

export type AssetEngines = {
  readonly generate: (req: GenerateRequest) => Promise<GeneratedImages>;
  /** The input gate's decoder; absent: ffmpeg (lib/foundry/mesh/inputGate.ts). */
  readonly decode?: Decode;
};

const MACHINE: Actor = { kind: "machine", id: "scout" };
const data = (x: unknown): EventData => JSON.parse(JSON.stringify(x)) as EventData;
const fatal = (code: "not-found" | "refused" | "internal", message: string): StepOutcome => ({ kind: "fatal", code, message });
/** Words the canonical view must not grow: what an image-to-3D model would turn into geometry. */
const CONCEPT_NEGATIVE = `${REPLICA_NEGATIVE}, scenery, second object, ground shadow, cropped, perspective distortion`;

async function load(req: AssetRequest): Promise<{ readonly night: Night; readonly c: Asset3dCandidate }> {
  const night = await readNight(req.nightId);
  const c = night.candidates.find((x): x is Asset3dCandidate => x.id === req.candidateId && x.kind === "asset3d");
  if (c === undefined) throw new AppError("not-found", `no game asset ${req.candidateId} in night ${req.nightId}`);
  return { night, c };
}

function fence(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; night.json is not written`);
  const r = ctx.fx.tx("scout.fence", (t) => assertFence(t, slot, lease.fence));
  if (!r.ok) throw r.error;
}

async function writeCandidate(req: AssetRequest, jobId: string, fn: (c: Asset3dCandidate) => Asset3dCandidate, alsoJob?: string): Promise<void> {
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find((x): x is Asset3dCandidate => x.id === req.candidateId && x.kind === "asset3d");
    if (c === undefined) return n;
    const m = withCandidate(n, { ...fn(c), jobId });
    const jobs = [jobId, ...(alsoJob === undefined ? [] : [alsoJob])].filter((j) => !m.jobs.includes(j));
    return jobs.length === 0 ? m : { ...m, jobs: [...m.jobs, ...jobs] };
  });
}

/* ── concept ──────────────────────────────────────────────────────────────── */

async function conceptAct(e: AssetEngines, req: AssetRequest, k: number, ctx: StepContext): Promise<StepOutcome> {
  const { c } = await load(req);
  const ask = req.concepts[k - 1];
  if (ask === undefined) return fatal("internal", `${c.id} has no concept ${k} on its request`);
  const gen: GenerateRequest = { prompt: ask.prompt, negativePrompt: CONCEPT_NEGATIVE, aspect: ask.aspect, count: 1, prefer: REPLICA_GENERATOR, seed: k };
  const got = await meteredCall<{ images: ImageRef[]; provenance?: GeneratedImages["provenance"] }>(ctx, {
    provider: "imaging-router",
    model: "generate",
    // No `references`: a concept is drawn from the brief's words alone.
    payload: { prompt: gen.prompt, negativePrompt: gen.negativePrompt, aspect: gen.aspect, count: gen.count, prefer: gen.prefer, seed: gen.seed },
    estimate: req.estimates.concept,
    stand: () => ({ images: [{ base64: standConcept(c.brief.class, ask.design).toString("base64"), mime: "image/png" }] }),
    live: async () => {
      const out = await e.generate(gen);
      const p = out.provenance;
      return { value: { images: out.images, provenance: p }, served: `${p.provider}/${p.model}`, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for the concept still` } : { usd: p.costUsd }) };
    },
  });
  const img = got.images[0];
  if (img === undefined) return { kind: "vendor-failure", message: `${c.id} concept ${k}: the imaging router answered with no image` };
  const rel = conceptFile(c.id, k, img.mime);
  fence(ctx);
  const abs = resolveInNight(req.nightId, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, Buffer.from(img.base64, "base64"));
  await writeCandidate(req, ctx.job.id, (x) => {
    const concepts = [...x.concepts];
    concepts[k - 1] = rel;
    return { ...x, concepts: concepts.map((f) => f ?? "") };
  });
  const p = got.provenance;
  return madePaid(data({ concept: k, design: ask.design, file: rel, dry: p === undefined, ...(p === undefined ? {} : { model: p.model, provider: p.provider, ...(p.costUsd === undefined ? {} : { costUsd: p.costUsd }) }) }), ctx);
}

/* ── handoff ──────────────────────────────────────────────────────────────── */

/** The gate's words for a refusal: its fails, or what it could not measure. */
const refusalOf = (g: GateResult, k: number): string => `the input gate read concept-${k} as ${g.verdict}: ${(g.fails.length > 0 ? g.fails : g.warns).join("; ") || "no reason recorded"}`;

/** The variants a hand-off writes: one per technique, refused where its concept failed the gate (M1 rides on T1's). */
export function plannedVariants(techniques: readonly Technique[], req: Pick<AssetRequest, "concepts">, gates: readonly GateResult[], ext: readonly string[]): MeshVariant[] {
  const out: MeshVariant[] = [];
  for (const t of techniques) {
    const i = conceptIndexOf(t, req.concepts);
    const g = gates[i];
    const design = req.concepts[i]?.design ?? "canonical";
    const t1 = out.find((v) => v.technique === "T1");
    const own = i === 0 ? {} : { concept: assetConceptName(design, ext[i] ?? ".png") };
    const base = { id: t.toLowerCase(), technique: t, limitations: [], files: {}, gates: g === undefined ? [] : [g], jobs: [], ...own };
    if (g === undefined || !admitsMesh(g)) out.push({ ...base, status: "failed", error: g === undefined ? `concept-${i + 1} was never drawn` : refusalOf(g, i + 1) });
    else if (t === "M1" && t1?.status !== "pending") out.push({ ...base, status: "failed", error: "M1 touches up the T1 mesh, and T1's concept was refused" });
    else out.push({ ...base, status: "pending" });
  }
  return out;
}

async function handoffAct(e: AssetEngines, store: () => Result<Store>, req: AssetRequest, ctx: StepContext): Promise<StepOutcome> {
  const { night, c } = await load(req);
  const techniques = req.techniques.filter((t): t is Technique => (TECHNIQUES as readonly string[]).includes(t));
  if (c.concepts.length < req.concepts.length || c.concepts.some((f) => f === "")) return fatal("internal", `${c.id}: ${req.concepts.length} concept(s) were priced and ${c.concepts.filter((f) => f !== "").length} are on the candidate`);
  const assetId = c.assetId ?? assetIdFor(night.id, c.id, c.brief.subject);
  let asset: MeshAsset | null;
  try {
    asset = readAssetNow(assetId);
  } catch (x) {
    if (x instanceof FoundryError) return fatal("refused", x.message);
    throw x;
  }
  if (asset === null) {
    const gates: GateResult[] = [];
    for (const f of c.concepts) gates.push(await inputGate(resolveInNight(night.id, f), e.decode));
    const variants = plannedVariants(techniques, req, gates, c.concepts.map((f) => path.extname(f).toLowerCase()));
    if (!variants.some((v) => v.status === "pending")) {
      const why = `no mesh launched: ${variants.map((v) => `${v.id} - ${v.error ?? v.status}`).join("; ")}`;
      fence(ctx);
      await writeCandidate(req, ctx.job.id, (x) => ({ ...x, status: "failed", error: why }));
      return madeFree(data({ refused: true, gates }));
    }
    const ext = path.extname(c.concepts[0] ?? ".png").toLowerCase() || ".png";
    fence(ctx);
    try {
      await createAsset({ id: assetId, createdAt: new Date().toISOString(), brief: c.brief, concept: `concept${ext}`, variants, night: night.id, dry: ctx.job.mode.kind === "dry", rights: "publishable" });
    } catch (x) {
      // A drive that died after the reservation: the directory exists, the manifest may not.
      if (!(x instanceof FoundryError && x.status === 409)) throw x;
    }
    if (readAssetNow(assetId) === null) return fatal("internal", `mesh asset ${assetId} was reserved and holds no manifest; inspect ${assetDir(assetId)}`);
    for (const [i, f] of c.concepts.entries()) {
      const design = req.concepts[i]?.design ?? "canonical";
      await copyFile(resolveInNight(night.id, f), resolveInAsset(assetId, assetConceptName(design, path.extname(f).toLowerCase() || ".png")));
    }
  }
  const s = store();
  if (!s.ok) return { kind: "vendor-failure", message: `the kernel store is not open to queue ${assetId}'s mesh job: ${s.error.message}` };
  const launched = launchStage(s.value, MESH, { assetId }, { mode: ctx.job.mode, actor: MACHINE });
  if (!launched.ok) return fatal("refused", `mesh asset ${assetId}: ${launched.error.message}`);
  const meshJob = launched.value.kind === "nothing" ? undefined : launched.value.jobId;
  fence(ctx);
  await writeCandidate(req, ctx.job.id, (x) => ({ ...x, assetId, status: "rendered" }), meshJob);
  return madeFree(data({ assetId, mesh: launched.value.kind, ...(meshJob === undefined ? {} : { jobId: meshJob }) }));
}

/* ── The ending ───────────────────────────────────────────────────────────── */

/** A failed job's sentence on a candidate that is still this job's and still pending; anything else is the hand-off's. */
async function ended(req: AssetRequest, job: Job, ending: string): Promise<void> {
  if (ending !== "failed") return;
  await mutateNight(req.nightId, (n) => {
    const c = n.candidates.find((x): x is Asset3dCandidate => x.id === req.candidateId && x.kind === "asset3d");
    if (c === undefined || c.status !== "pending" || (c.jobId !== undefined && c.jobId !== job.id)) return n;
    const m = withCandidate(n, { ...c, status: "failed", jobId: job.id, error: job.error?.message ?? `job ${job.id} failed` });
    return m.jobs.includes(job.id) ? m : { ...m, jobs: [...m.jobs, job.id] };
  });
}

const guarded =
  <A extends unknown[]>(act: (...a: A) => Promise<StepOutcome>) =>
  async (...a: A): Promise<StepOutcome> => {
    try {
      return await act(...a);
    } catch (x) {
      if (x instanceof ImagingError && x.kind === "refused") return fatal("refused", x.message);
      return imageFailure(x);
    }
  };

export function assetActs(e: AssetEngines, store: () => Result<Store>): Pick<AssetPorts, "concept" | "handoff" | "ended"> {
  return {
    concept: guarded((req: AssetRequest, k: number, ctx: StepContext) => conceptAct(e, req, k, ctx)),
    handoff: guarded((req: AssetRequest, ctx: StepContext) => handoffAct(e, store, req, ctx)),
    ended,
  };
}
