"use client";

// WHAT A SHELF ROW ACTUALLY KNOWS.
//
// `Asset.meta` is free-form on purpose (lib/assets.ts) — a plate from the trial
// grid carries its grade, a promoted proof carries the style it was rendered
// from. That freedom is right for the store and wrong for a reader: without one
// place that knows the shapes, every surface that wants to show a cost or a
// model re-derives the same casts and disagrees with the next one about what an
// absent field means.
//
// So this module is the ONLY thing that reads `meta`, and it answers in one
// shape. Absence stays absence: a plate kept before the vendor was recorded has
// no provider, and this returns undefined rather than "unknown" — the caller
// decides whether a blank or a sentence is the honest rendering.

import type { Provenance } from "@/app/_studio/types";
import type { Asset, PromotedMeta } from "@/lib/assets";
import type { StyleBlock } from "@/lib/themes";

/** How the plate got onto the shelf. The two writers today, and the honest
 *  third case for a row written by something that does not exist yet. */
export type AssetOrigin = "promoted" | "trial" | "unknown";

export interface AssetFacts {
  origin: AssetOrigin;
  /** The origin as a sentence, because "promoted" is our word, not the user's. */
  originLine: string;
  styleName?: string;
  provider?: string;
  model?: string;
  costUsd?: number;
  /** The four slots that produced these pixels. Promoted plates only: the trial
   *  index records what was rendered, not the block it was rendered from. */
  block?: StyleBlock;
  /** What the trial grid was asking this plate to solve, and the beat it sat on. */
  problem?: string;
  beat?: string;
  trialId?: string;
  /** Text leaked into the image — the one defect that makes a plate unusable. */
  hasText: boolean;
  /** The bytes this row points at are gone (lib/assets.ts#hydrateProofSrcs). */
  unresolved: boolean;
  createdAt: number;
  promotedAt?: number;
  provenance?: Provenance;
}

/** The promoted shape is the one carrying BOTH ids — a trial row has neither,
 *  and a future writer that copies half the shape is not a promoted proof. */
function isPromoted(meta: Record<string, unknown>): meta is PromotedMeta & Record<string, unknown> {
  return typeof meta.themeId === "string" && typeof meta.proofId === "string";
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Text leakage is recorded by the trial grader, under `grade.hasText`. It is
 *  read defensively because `grade` is typed `unknown` at the seam it arrives
 *  through (lib/useAssets.ts#TrialEntry) — a grader that changes shape should
 *  make the badge disappear, not throw inside a gallery. */
function readHasText(meta: Record<string, unknown>): boolean {
  const grade = meta.grade;
  return typeof grade === "object" && grade !== null && (grade as { hasText?: unknown }).hasText === true;
}

export function readAssetFacts(asset: Asset): AssetFacts {
  const meta = (asset.meta ?? {}) as Record<string, unknown>;
  const unresolved = meta.unresolved === true;

  if (isPromoted(meta)) {
    const p = meta as unknown as PromotedMeta;
    return {
      origin: "promoted",
      originLine: p.styleName
        ? `Approved on the proof sheet for ${p.styleName}, and kept.`
        : "Approved on a style's proof sheet, and kept.",
      styleName: p.styleName,
      provider: p.provider,
      // The model lives on the provenance for a promoted plate — the same
      // record the studio's lineage UI walks — not beside it.
      model: p.provenance?.model,
      costUsd: p.costUsd,
      block: p.block,
      hasText: readHasText(meta),
      unresolved,
      createdAt: asset.createdAt,
      promotedAt: p.promotedAt,
      provenance: p.provenance,
    };
  }

  const trialId = str(meta.trialId);
  if (trialId) {
    const styleName = str(meta.styleName);
    return {
      origin: "trial",
      originLine: styleName
        ? `Rendered on the trial grid for ${styleName}.`
        : "Rendered on the trial grid.",
      styleName,
      provider: str(meta.provider),
      model: str(meta.model),
      costUsd: num(meta.costUsd),
      problem: str(meta.problem),
      beat: str(meta.beat),
      trialId,
      hasText: readHasText(meta),
      unresolved,
      createdAt: asset.createdAt,
    };
  }

  return {
    origin: "unknown",
    // Not "made by an unknown process" — that claims knowledge of a process.
    // The row exists and says nothing about itself, and so does this.
    originLine: "Nothing on this row says where it came from.",
    styleName: str(meta.styleName),
    provider: str(meta.provider),
    model: str(meta.model),
    costUsd: num(meta.costUsd),
    hasText: readHasText(meta),
    unresolved,
    createdAt: asset.createdAt,
  };
}

/* ── Formatters ───────────────────────────────────────────────────────────── */

/**
 * A render cost. Two decimals hides everything this project actually spends —
 * a Nano Banana plate is fractions of a cent — so a figure under a cent keeps
 * four, and the reader never sees "$0.00" for money that was spent.
 */
export const fmtUsd = (n?: number): string | null =>
  n == null ? null : n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;

/** ISO date, deliberately: this renders inside a portal on the client while the
 *  same row may be described on the server, and a locale-formatted date is a
 *  hydration mismatch waiting for a user in another timezone. */
export const fmtWhen = (ms?: number): string | null => {
  if (ms == null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/** The style block as label/value rows, so the viewer does not hardcode the
 *  slot names in its JSX and silently drop one when the block grows. */
export function blockRows(block: StyleBlock): { label: string; value: string }[] {
  return [
    { label: "technique", value: block.technique },
    { label: "subject", value: block.subject },
    { label: "finish", value: block.finish },
  ].filter((r) => Boolean(r.value));
}
