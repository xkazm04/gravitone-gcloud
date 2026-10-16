import { z } from "zod";
import type { BlobRef } from "@gt/domain/blob";
import { parseAt, type Parsed } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { compileStyleBlock, proofEvidence } from "@gt/domain/style.ratchet";
import type { Tx } from "../store.ts";
import { withStatus, type StyleDraft } from "./core.ts";
import { admit, putStyleIn, readStyleIn } from "./driver.ts";

// A V1 THEME, IN - THE ENTRY POINT WAVE B'S THEME IMPORT CALLS (Phase 5 decision 7: the Phase 4
// importer, lib/import/project.ts, extended to every theme). v1 kept themes in the browser's
// IndexedDB (lib/themes.ts `Theme`); the importer reads them out of the archive and hands each one
// here, with its proofs' base64 already put into the blob store (`media` resolves a proof id).
//
// THE GRANDFATHER RULING (Director, 2026-10-17): a theme v1 had ALREADY locked imports LOCKED,
// and its lock says so (`lock.grandfathered`) - it passed v1's gate, which for a sheet that
// predates lineage was one approval, and re-gating it would strand every project built on it. A
// theme NOT yet locked imports as a draft and meets the new gate like any other: proven (its
// approvals are operator keeps, one cell per trial problem) and coverage under the current block.
//
// The id is `v1-theme:<id>`, the one the Phase 4 project importer already wrote into imported
// projects' `styleId` (lib/import/project.ts), so those references resolve. A theme's catalogue
// half is its own block: recipe = the compiled style half v1 sent with every frame.

const v1Proof = z.object({
  id: z.string().min(1),
  label: z.string(),
  state: z.enum(["pending", "approved", "rejected"]),
  note: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  costUsd: z.number().nonnegative().optional(),
  trialId: z.string().optional(),
  blockDigest: z.string().optional(),
  createdAt: z.number(),
});

export const v1ThemeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  origin: z.enum(["scratch", "preset", "screenshot", "plate", "foundry"]),
  presetId: z.string().min(1).optional(),
  foundryStyleId: z.string().min(1).optional(),
  discipline: z.enum(["educational", "trailer", "free", "music-video", "ads"]).optional(),
  block: z.object({
    technique: z.string(),
    subject: z.string(),
    palette: z.array(z.object({ name: z.string(), hex: z.string(), role: z.enum(["ground", "objects", "accent"]) })),
    finish: z.string(),
  }),
  elements: z.array(z.string()),
  proofs: z.array(v1Proof),
  createdAt: z.number(),
  updatedAt: z.number(),
  lockedAt: z.number().optional(),
});
export type V1Theme = Parsed<z.output<typeof v1ThemeSchema>>;

export const themeStyleId = (themeId: string): string => `v1-theme:${themeId}`;

const iso = (ms: number): string => new Date(ms).toISOString();

/** v1's origins in the store's words; `scratch` ("from a brief") is retired and reads as authored. */
const ORIGIN = { scratch: "authored", preset: "preset", screenshot: "authored", plate: "plate", foundry: "foundry" } as const;

export type ThemeDraft = { readonly draft: StyleDraft; readonly missing: readonly string[] };

/** One theme as a store draft. A proof whose bytes did not reach the blob store is left out and named. */
export function draftFromV1Theme(raw: unknown, media: (proofId: string) => BlobRef | undefined): Result<ThemeDraft> {
  const parsed = parseAt("v1 theme", v1ThemeSchema, raw);
  if (!parsed.ok) return parsed;
  const t = parsed.value;
  const id = themeStyleId(t.id);
  const missing: string[] = [];
  const proofs = t.proofs.flatMap((p) => {
    const ref = media(p.id);
    if (ref === undefined) {
      missing.push(p.id);
      return [];
    }
    const { createdAt, note, model, provider, costUsd, trialId, blockDigest, ...rest } = p;
    return [{ ...rest, media: ref, at: iso(createdAt), ...(note ? { note } : {}), ...(model ? { model } : {}), ...(provider ? { provider } : {}), ...(costUsd === undefined ? {} : { costUsd }), ...(trialId ? { trialId } : {}), ...(blockDigest ? { blockDigest } : {}) }];
  });
  // An approval was an operator's keep; a rejection a reject - the sheet's history as evidence.
  const evidence = proofs.filter((p) => p.state !== "pending").map((p) => proofEvidence(id, p, p.state === "approved" ? "keep" : "reject", p.at));
  const origin = { kind: ORIGIN[t.origin], ...(t.presetId ? { presetId: t.presetId } : {}), ...(t.foundryStyleId ? { source: t.foundryStyleId } : {}) };
  const draft: StyleDraft = {
    id,
    name: t.name,
    family: "theme",
    origin,
    ...(t.discipline === undefined ? {} : { discipline: t.discipline }),
    observables: {},
    recipe: compileStyleBlock(t.block),
    negative: "",
    palette: t.block.palette,
    block: t.block,
    elements: t.elements,
    evidence,
    exemplars: [],
    proofs,
    ...(t.lockedAt === undefined ? {} : { lock: { at: iso(t.lockedAt), by: "v1", grandfathered: true as const } }),
  };
  return { ok: true, value: { draft, missing } };
}

/** Import one drafted theme inside the caller's transaction: created, or `same` when the store
 *  already holds that id (the store's record is the truth from then on - never re-imported). */
export function importV1ThemeIn(t: Tx, d: ThemeDraft, by: Actor): "created" | "same" {
  if (readStyleIn(t, d.draft.id) !== undefined) return "same";
  const next = withStatus(d.draft);
  const admitted = admit(next);
  if (!admitted.ok) throw admitted.error;
  const grandfathered = d.draft.lock?.grandfathered === true;
  putStyleIn(t, null, next, { kind: "import-theme", op: { id: d.draft.id }, by, type: "style.imported", data: { from: "v1-theme", proofs: d.draft.proofs.length, ...(grandfathered ? { grandfathered: true } : {}), ...(d.missing.length ? { missingProofs: d.missing.length } : {}) } });
  return "created";
}
