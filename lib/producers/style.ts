import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parseAt, parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { StyleProof } from "@gt/domain/style";
import { blockDigest, STYLE_TRIALS, styleRefs } from "@gt/domain/style.ratchet";
import type { BlobRef } from "@gt/domain/blob";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects } from "@gt/kernel/effects";
import { processKernel, storeLocation } from "@gt/kernel/process";
import { queryEvents } from "@gt/kernel/events-query";
import type { Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { runJob, type RunReport } from "@gt/kernel/job-run";
import type { Store } from "@gt/kernel/store";
import { readStyleIn } from "@gt/kernel/styles/driver";
import type { StyleRow } from "@gt/kernel/styles/schema";
import { addProofsIn, adoptStyleIn } from "@gt/kernel/styles/writers";
import { meteredCall } from "@gt/producers/research/metered";
import {
  defineStyleProducer,
  lookOutputSchema,
  outputOf,
  PALETTE_STEP,
  plateOutputSchema,
  proofStep,
  STYLE_REQUEST,
  styleRequestSchema,
  type AdoptRequest,
  type LookOutput,
  type PlateOutput,
  type ProofRequest,
  type StyleRequest,
} from "@gt/producers/style/define";

import { adoptionDraft, type AdoptIO } from "@/lib/foundry/adopt";
import { exportStyles } from "@/lib/foundry/catalogue";
import { FoundryError } from "@/lib/foundry/runStore";
import { getCatalogue, resolveInRun } from "@/lib/foundry/store";
import { ImagingError } from "@/lib/imaging/errors";
import { generate, recognize } from "@/lib/imaging/router";
import type { GeneratedImages, ImageRef, Recognition } from "@/lib/imaging/types";
import { OUT_DIRNAME } from "@/lib/fixtures/mode";
// The kernel process's own spelling, not lib/parts/gates.ts's re-export: that module is `server-only`, and
// the registry (which binds this producer) loads it lazily, so the worker and a CLI can import the registry.
import { blobRootOf } from "@/lib/kernelProcess";
import { compilePrompt, NEGATIVE_PROMPT } from "@/lib/stylePrompt";

import { codeRoot } from "./forge.ts";
import { imageFailure, PIXEL } from "./frames.ts";
import { actRefusal, STYLE_LANE } from "./styleLaunch.ts";

// THE STYLE PRODUCER, BOUND (Phase 5 wave B, L54) - packages/producers/src/style's ports over
// v1's engines: the imaging router's `generate` (a proof plate, conditioned on the style's SENT
// references - v1 lib/themes.ts `styleRefs`, which only the Playground's browser fetch used) and
// `recognize` (adopt's palette read: v1 lib/foundry/adopt.ts unchanged behind its `AdoptIO`, the
// port v1's adopt route built inline), every call through the job's meter; the landing through
// the kernel's `styles` writers (`addProofsIn`, `adoptStyleIn`), then styles.json re-exported.
//
// DRY IS A STAND-IN, SAID ON THE PLATE. A dry plate is the committed 2026-08-13 Google trial
// grid's picture for that trial (public/trials/google/newsprint-cutout/<trial>.jpg, else the 1x1
// pixel), labelled `dry stand-in`, provider `dry-run`, cost 0 - never presented as a render of
// this style (the L51 fixture's rule). A dry adopt reads a palette whose names say it is a
// stand-in. Both land the way a dry frames job's pixel plates land in a part's record: the
// operator chose dry on the receipt, and the set-block op corrects the palette before a lock.

const DRY_GRID = "newsprint-cutout";
const DRY_PALETTE = {
  palette: [
    { name: "dry stand-in ground", hex: "#1c1d24", role: "ground" },
    { name: "dry stand-in objects", hex: "#8a8f99", role: "objects" },
    { name: "dry stand-in accent", hex: "#3fc6f0", role: "accent" },
  ],
};

/** The landing writes as the operator whose receipt the job carries. */
const actorOf = (req: StyleRequest): Actor => ({ kind: "operator", id: req.by });

export type StyleEngines = {
  readonly generate: (req: Parameters<typeof generate>[0]) => Promise<GeneratedImages>;
  readonly recognize: (req: Parameters<typeof recognize>[0]) => Promise<Recognition>;
};
export const LIVE_STYLE_ENGINES: StyleEngines = { generate, recognize };

/** The request a style job carries: the event its launch wrote beside the enqueue. */
export function requestOf(store: Store, jobId: string): Result<StyleRequest> {
  const page = queryEvents(store, { type: [STYLE_REQUEST], subject: { kind: "job", id: jobId }, limit: 1 });
  if (!page.ok) return page;
  const e = page.value.events[0];
  return e === undefined ? err("not-found", `job ${jobId} carries no style request`) : parseAt("style request", styleRequestSchema, e.data);
}

function dryPlate(trialId: string): ImageRef {
  const file = path.join(codeRoot(), "public", "trials", "google", DRY_GRID, `${trialId}.jpg`);
  return existsSync(file) ? { base64: readFileSync(file).toString("base64"), mime: "image/jpeg" } : PIXEL;
}

const IMAGE_MIMES: readonly ImageRef["mime"][] = ["image/png", "image/jpeg", "image/webp"];

async function refImages(blobs: BlobStore, refs: readonly BlobRef[]): Promise<ImageRef[]> {
  const out: ImageRef[] = [];
  for (const r of refs) {
    // A reference the router cannot carry (not png/jpeg/webp) is left out, never re-labelled.
    const mime = IMAGE_MIMES.find((m) => m === r.mime);
    if (mime === undefined) continue;
    const file = blobs.pathOf(r);
    if (!file.ok) throw file.error;
    out.push({ base64: (await readFile(file.value)).toString("base64"), mime });
  }
  return out;
}

type Fatal = "not-found" | "refused" | "conflict" | "invalid" | "unavailable";
const fatal = (code: Fatal, message: string): StepOutcome => ({ kind: "fatal", code, message });

/** The style as it is now (the world the resume re-checks). */
function current(ctx: StepContext, req: StyleRequest): Result<StyleRow> {
  const row = ctx.fx.tx("style.read", (t) => readStyleIn(t, req.styleId) ?? null);
  if (!row.ok) return row;
  return row.value === null ? err("not-found", `no style ${req.styleId}`) : ok(row.value);
}

async function plate(e: StyleEngines, store: Store, req: ProofRequest, trialId: string, ctx: StepContext): Promise<StepOutcome> {
  const row = current(ctx, req);
  if (!row.ok) return fatal("not-found", row.error.message);
  const s = row.value.style;
  if (s.block === undefined) return fatal("refused", `${s.name} has no block to render proofs of`);
  // Re-check before paying (hitl-approval: resume-after-decision): a look rewritten since the
  // receipt was confirmed is not the look the operator priced.
  const now = blockDigest(s.block);
  if (now !== req.digest) return fatal("conflict", `${s.name}'s block changed since it was priced (${req.digest} → ${now}); nothing more is rendered under it — read its receipt again`);
  const trial = STYLE_TRIALS.find((t) => t.id === trialId);
  if (trial === undefined) return fatal("invalid", `no trial ${trialId}`);
  const prompt = compilePrompt(s.block, trial.subject);
  const negativePrompt = [NEGATIVE_PROMPT, s.negative].filter((x) => x.trim() !== "").join(", ");
  const refs = styleRefs(s);
  try {
    const got = await meteredCall<{ images: ImageRef[]; provenance?: GeneratedImages["provenance"] }>(ctx, {
      provider: "imaging-router",
      model: "generate",
      payload: { prompt, negativePrompt, aspect: "16:9", count: 1, prefer: "google", references: refs.map((r) => r.sha256) },
      estimate: req.estimate,
      stand: () => ({ images: [dryPlate(trialId)] }),
      live: async () => {
        const references = await refImages(blobStore(blobRootOf(store)), refs);
        const out = await e.generate({ prompt, negativePrompt, aspect: "16:9", count: 1, prefer: "google", ...(references.length ? { references } : {}) });
        const p = out.provenance;
        return { value: { images: out.images, provenance: p }, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for the plate` } : { usd: p.costUsd }) };
      },
    });
    const img = got.images[0];
    if (img === undefined) return { kind: "vendor-failure", message: "the imaging router answered with no image" };
    const put = await ctx.fx.blob(new Uint8Array(Buffer.from(img.base64, "base64")), img.mime);
    if (!put.ok) return fatal("unavailable", put.error.message);
    const p = got.provenance;
    const out: PlateOutput =
      p === undefined
        ? { trialId, media: put.value, model: "stand-in", provider: "dry-run", costUsd: 0, dry: true }
        : { trialId, media: put.value, model: p.model, provider: p.provider, ...(p.costUsd === undefined ? {} : { costUsd: p.costUsd }), dry: false };
    return { kind: "produced", output: out, ...(p?.costUsd === undefined ? {} : { costUsd: p.costUsd }) };
  } catch (x) {
    // One refused subject (a safety block) is the job's sentence, never fed to the breaker.
    if (x instanceof ImagingError && x.kind === "refused") return fatal("refused", `${trial.label}: ${x.message}`);
    return imageFailure(x);
  }
}

/** v1's adopt route port (app/api/foundry/styles/[id]/adopt, retired), the recognizer metered. */
function adoptIO(e: StyleEngines, ctx: StepContext, req: AdoptRequest, dry: { value: boolean }): AdoptIO {
  const read = async <T,>(run: string, rel: string, as: (b: Buffer) => T): Promise<T | null> => {
    try {
      return as(await readFile(resolveInRun(run, rel)));
    } catch (x) {
      // A plate or sidecar that is not on this machine is a skipped seed (v1), never a guess.
      if ((x as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw x;
    }
  };
  return {
    readPlate: (run, rel) => read(run, rel, (b) => ({ base64: b.toString("base64"), mime: "image/png" })),
    async readSidecar(run, rel) {
      const text = await read(run, rel, (b) => b.toString("utf8"));
      if (text === null) return null;
      // A damaged sidecar reads as absent, as v1's did: adopt.ts then fails that plate closed.
      const r = parseJsonAt("forge sidecar", z.unknown(), text);
      return r.ok ? r.value : null;
    },
    recognize: (image, instruction, schema) =>
      meteredCall<unknown>(ctx, {
        provider: "imaging-router",
        model: "recognize",
        payload: { instruction, schema, image: image.mime },
        estimate: req.estimate,
        stand: () => {
          dry.value = true;
          return DRY_PALETTE;
        },
        live: async () => {
          const r = await e.recognize({ image, instruction, schema });
          const p = r.provenance;
          return { value: r.json, ...(p.costUsd === undefined ? { unpriced: `${p.provider} reported no cost for the palette read` } : { usd: p.costUsd }) };
        },
      }),
  };
}

async function palette(e: StyleEngines, req: AdoptRequest, ctx: StepContext): Promise<StepOutcome> {
  const cat = await getCatalogue();
  const def = cat.styles.find((s) => s.id === req.styleId);
  if (def === undefined) return fatal("not-found", `no style ${req.styleId}`);
  // Re-check before paying (hitl-approval: resume-after-decision), as the proofs path does: a style
  // that gained a look since the receipt was confirmed refuses here, not after the palette read.
  const row = current(ctx, req);
  if (!row.ok) return fatal("not-found", row.error.message);
  const why = actRefusal({ kind: "adopt", fromStyleId: req.styleId }, row.value.style, true);
  if (why !== null) return fatal("refused", why);
  const dry = { value: false };
  const read = await adoptionDraft(def, cat.ledger, adoptIO(e, ctx, req, dry)).then(
    (d) => ok(d),
    (x: unknown) => {
      // adoptionDraft refuses a candidate with v1's 409; anything else is the drive's failure.
      if (x instanceof FoundryError && x.status === 409) return err("refused", x.message);
      throw x;
    },
  );
  if (!read.ok) return fatal("refused", read.error.message);
  const draft = read.value;
  // NO PALETTE, NO LOOK (v1): the job ends with the reason and nothing is written.
  if (draft.paletteMissing) return fatal("refused", `${def.name} was not adopted: ${draft.reason ?? "no palette could be read"}`);
  const seeds: LookOutput["seeds"][number][] = [];
  for (const p of draft.proofs) {
    const put = await ctx.fx.blob(new Uint8Array(Buffer.from(p.base64, "base64")), p.mime);
    if (!put.ok) return fatal("unavailable", `${p.id}: ${put.error.message}`);
    seeds.push({ id: p.id, label: p.label, media: put.value, ...(p.model ? { model: p.model } : {}), ...(p.note ? { note: p.note } : {}) });
  }
  const out: LookOutput = { ...draft.block, palette: draft.block.palette.map((c) => ({ ...c })), seeds, ...(draft.proofsLeftOut ? { leftOut: draft.proofsLeftOut } : {}), dry: dry.value };
  return { kind: "produced", output: out };
}

/** The landing: one store write (the ratchet and the door on the way), then the export. */
async function land(store: Store, req: StyleRequest, ctx: StepContext): Promise<StepOutcome> {
  const at = new Date().toISOString();
  let wrote: Result<StyleRow>;
  if (req.kind === "adopt") {
    const look = outputOf(PALETTE_STEP, lookOutputSchema, ctx.outputs);
    if (!look.ok) return fatal("invalid", look.error.message);
    const { seeds, palette: colors, technique, subject, finish } = look.value;
    const proofs: StyleProof[] = seeds.map((x) => ({ id: x.id, label: x.label, media: x.media, state: "pending", ...(x.note === undefined ? {} : { note: x.note }), ...(x.model === undefined ? {} : { model: x.model }), source: x.id, at }));
    wrote = ctx.fx.tx("style.adopt", (t) => adoptStyleIn(t, req.styleId, { block: { technique, subject, palette: colors, finish }, palette: colors, proofs }, actorOf(req)));
  } else {
    const plates: PlateOutput[] = [];
    for (const t of req.trialIds) {
      const p = outputOf(proofStep(t), plateOutputSchema, ctx.outputs);
      if (!p.ok) return fatal("invalid", p.error.message);
      plates.push(p.value);
    }
    const tail = ctx.job.id.slice(ctx.job.id.lastIndexOf(":") + 1);
    const proofs: StyleProof[] = plates.map((p) => {
      const t = STYLE_TRIALS.find((x) => x.id === p.trialId);
      return {
        id: `pr-${tail}-${p.trialId}`,
        label: `${t?.label ?? p.trialId}${p.dry ? " · dry stand-in" : ""}`,
        media: p.media,
        state: "pending",
        trialId: p.trialId,
        blockDigest: req.digest,
        model: p.model,
        provider: p.provider,
        ...(p.costUsd === undefined ? {} : { costUsd: p.costUsd }),
        at,
      };
    });
    // addProofsIn refuses a plate whose digest is not the block's NOW: the last re-check.
    wrote = ctx.fx.tx("style.proofs", (t) => addProofsIn(t, req.styleId, proofs, actorOf(req)));
  }
  if (!wrote.ok) return fatal(wrote.error.code === "not-found" ? "not-found" : wrote.error.code === "conflict" ? "conflict" : "refused", wrote.error.message);
  exportStyles(store);
  return { kind: "produced", output: { styleId: req.styleId, rev: wrote.value.rev }, costUsd: 0 };
}

/** The producer over one store; `engines` are the vendors (a test hands fakes, never the router). */
export function styleProducer(store: () => Result<Store>, engines: StyleEngines = LIVE_STYLE_ENGINES): Producer {
  const s = (): Store => {
    const r = store();
    if (!r.ok) throw r.error;
    return r.value;
  };
  return defineStyleProducer(STYLE_LANE, {
    request: (job) => requestOf(s(), job.id),
    palette: (req, ctx) => palette(engines, req, ctx),
    plate: (req, trialId, ctx) => plate(engines, s(), req, trialId, ctx),
    land: (req, ctx) => land(s(), req, ctx),
  });
}

/** The producer the worker carries (lib/producers/registry.ts BOUND): the universe's store, opened
 *  lazily at the first job, as lib/producers/sound.ts `soundKernel` opens it for the CLIs. */
export function styleJobProducer(): Producer {
  return styleProducer(() => {
    const k = processKernel(storeLocation(OUT_DIRNAME));
    return k.ok ? ok(k.value.store) : k;
  });
}

/**
 * Drive one style job on this process (the act's confirm, beside the worker that will also carry
 * `style` once it is bound in lib/producers/registry.ts): the kernel's own `runJob`, so the lease,
 * the meter and the job's ending are the worker's rules. A lane another job is busy on answers
 * `busy` and the job stays queued for the next drive - never run around the lane.
 */
export function driveStyleJob(store: Store, jobId: string, o: { readonly dryOnly?: boolean; readonly engines?: StyleEngines } = {}): Promise<Result<RunReport>> {
  const fx = liveEffects(store, blobStore(blobRootOf(store)));
  return runJob(fx, styleProducer(() => ok(store), o.engines), jobId, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) });
}

