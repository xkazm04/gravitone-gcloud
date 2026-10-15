import "server-only";

import type { BlobRef } from "@gt/domain/blob";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { InitialDecision } from "@gt/kernel/decision/driver";

import type { BlindEdit, BlindState } from "../../../foundry/training/blind.ts";
import type { CycleManifest, Improvement, MediaRef, TrainingVerdict, TrainingVerdicts } from "../../../foundry/training/types.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import { decisionMap, foundryFileUrl, instantOr, mintPacket, type Loss, type OpenPlan } from "../types.ts";

// THE DOJO ADAPTER'S SHARED SHAPES, AND THE CYCLE V1 ALREADY DECIDED - split out
// of ./dojo.ts (the 400-line rule) with the one direction of import kept:
// dojo.ts reads this module, never the reverse. What lives here is what both
// halves of the adapter read (the v1 record, the claim, which arm file is shown)
// and the packet-review fallback of wave B ruling 3.

export type DojoV1 = {
  readonly cycle: CycleManifest;
  readonly verdicts: TrainingVerdicts;
  readonly blind: BlindState;
  readonly rev: number;
  /** By cycle-relative file: the image each arm shows (a video arm shows its poster). */
  readonly media: Readonly<Record<string, BlobRef>>;
  /** When blind.json was last written: v1 stamps no instant on a pick. */
  readonly picksAt: string;
};

/** What the Board may show of an arm: the image, or a video's poster (the only image v1 serves for it). */
export const shown = (ref: MediaRef): string => ref.poster ?? ref.file;

export const decidedInV1 = (v: TrainingVerdicts, imp: string): boolean => v[imp] === "approve" || v[imp] === "reject";

export type Claim = { readonly imp: Improvement; readonly verdict: TrainingVerdict; readonly challenger: number; readonly baseline: number; readonly ties: number; readonly bothBad: number; readonly edits: readonly BlindEdit[] };

/* ── a cycle decided wholly in v1 (wave B ruling 3) ───────────────────────── */
// When every improvement's claim was made in v1, there is no pair left to ask
// blind - but the cycle is still uncommitted, and once the Dojo view retires
// the Board is the only place it can be committed. So it opens as a PACKET
// REVIEW: one item per decided improvement, v1's claims imported as its
// decisions (keep = approve, reject = reject), so the operator reviews them
// and commits, and may still overturn one before the commit. An improvement
// with no image on disk, or one v1 left undecided, is disclosed as dropped.

/** The picture an improvement is reviewed by: its thumbnail, else the challenger arm of its first pair. */
function faceOf(v1: DojoV1, imp: Improvement): { readonly rel: string; readonly ref: BlobRef } | undefined {
  const rels = [...(imp.thumbnail === undefined ? [] : [imp.thumbnail]), ...imp.pairs.flatMap((p) => [p.challenger, p.baseline].filter((r) => !r.deleted).map(shown))];
  for (const rel of rels) {
    const ref = v1.media[rel];
    if (ref !== undefined) return { rel, ref };
  }
  return undefined;
}

/** The improvements a review packet holds: decided in v1, with a face on disk. */
export const reviewed = (v1: DojoV1): Improvement[] => v1.cycle.improvements.filter((i) => decidedInV1(v1.verdicts, i.id) && faceOf(v1, i) !== undefined);

export function reviewPacket(v1: DojoV1): Result<OpenPlan> {
  const { cycle } = v1;
  const imps = reviewed(v1);
  if (imps.length === 0) return err("refused", `dojo cycle ${cycle.id} has no improvement left to judge blind and none decided in v1 to commit`);
  const losses: Loss[] = cycle.improvements
    .filter((i) => !imps.includes(i))
    .map((i) => ({ candidate: i.id, grade: "dropped" as const, reason: decidedInV1(v1.verdicts, i.id) ? "no image of it is on disk; its claim is committed as v1 recorded it" : "v1 left its claim undecided and it has no pairs to judge blind" }));
  losses.push({ grade: "approximate", reason: "v1 stamps no instant on a claim; the imported claims carry cycle.json's instant" });
  const jobId = `dojo:${cycle.id}`;
  const minted = mintPacket({
    id: packetIdOf("dojo", cycle.id),
    lane: cycle.media,
    source: "dojo",
    mode: "packet-review",
    state: "open",
    runId: cycle.id,
    title: `dojo ${cycle.subject} · ${cycle.id}`,
    items: imps.map((i) => ({ id: i.id, jobId, media: faceOf(v1, i)?.ref, grades: [] })),
  });
  if (!minted.ok) return minted;
  const at = instantOr(cycle.at, new Date(0).toISOString()).at;
  const initial: InitialDecision[] = imps.map((i) => ({ candidate: i.id, verdict: v1.verdicts[i.id] === "approve" ? "keep" : "reject", reasons: [], by: "operator", surface: "v1", at }));
  return ok({
    packet: minted.value,
    initial,
    present: {
      items: Object.fromEntries(imps.map((i) => [i.id, { label: i.technique, meta: `${i.pairs.length} pair(s) · v1: ${v1.verdicts[i.id] ?? "undecided"}`, prompt: i.claim }])),
      rows: [],
      oracle: { passed: true, summary: `${imps.length} claim(s) made in v1 · the cycle is not committed` },
      meta: `dojo · ${cycle.dimension} · ${cycle.subject}`,
      review: {
        title: `dojo ${cycle.subject} · ${cycle.id}`,
        standfirst: `${imps.length} claim(s), each decided in v1; the commit writes the training ledger and closes the cycle.`,
        sections: imps.map((i) => ({ id: i.id, heading: `${i.technique} · ${v1.verdicts[i.id] ?? "undecided"}`, text: i.claim })),
        checks: [],
        reviewers: [],
        turn: 1,
      },
    },
    urls: Object.fromEntries(imps.map((i) => [i.id, foundryFileUrl(cycle.id, faceOf(v1, i)?.rel ?? "", "training")])),
    losses,
  });
}

/** A review packet's claims: each improvement's final verdict, keep = approve. */
export function reviewClaims(cycle: CycleManifest, ids: ReadonlySet<string>, decisions: readonly Decision[]): Claim[] {
  const byCandidate = decisionMap(decisions);
  return cycle.improvements.flatMap((imp): Claim[] => {
    const v = ids.has(imp.id) ? byCandidate.get(imp.id)?.verdict : undefined;
    if (v !== "keep" && v !== "reject") return [];
    return [{ imp, verdict: v === "keep" ? "approve" : "reject", challenger: 0, baseline: 0, ties: 0, bothBad: 0, edits: [] }];
  });
}
