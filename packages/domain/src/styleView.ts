import type { Discipline } from "@gt/catalog/projects";
import type { PaletteColor, StyleBlock } from "@gt/catalog/style";
import type { BlobRef } from "./blob.ts";
import type { StaleReceipt } from "./produce.ts";
import type { Style } from "./style.ts";
import type { StyleStatus } from "./style.machine.ts";
import {
  isLegacySheet,
  keptCells,
  LOCK_PROBLEMS,
  lockBlocker,
  PROOF_CAP,
  PROVEN_KEEPS,
  problemOfTrial,
  sheetCoverage,
  styleRefs,
} from "./style.ratchet.ts";

// THE STYLE AS THE ATELIER DRAWS IT - zod-free, so a client screen can hold every type here and
// never load a schema (tests/next-gates/client-closure.test.ts walks the chain). The record is
// @gt/domain/style; this is what a reader is HANDED: the record plus everything derived from it
// by the one ratchet (./style.ratchet.ts), computed on the server once, so no screen re-derives
// a gate and starts disagreeing with the door that enforces it. v1 computed `statusOf`,
// `canLock`, `lockBlocker`, the sheet's coverage pips and `styleRefs` in each surface that needed
// them (app/library/SpecEditor.tsx, parts.tsx, TrialMatrix.tsx); `useThemes.lock` then skipped
// `canLock` entirely, because the gate lived in the views and not in the write.
//
// Words, not codes, where a person reads them: `why` and `lock.blocker` are v1's `lockBlocker`
// sentences ("approve 2 more problems - 1 of 3 covered; missing inventory, flow"), produced by
// the same function the kernel refuses a lock with.

export type { StyleStatus } from "./style.machine.ts";

/** Where a style came from. The first three are the catalogue's (v1 lib/foundry/types.ts); the
 *  last three are v1 themes' (lib/themes.ts `ThemeOrigin`; `scratch` - "from a brief" - retired). */
export type StyleOriginKind = "readback" | "authored" | "extracted" | "preset" | "plate" | "foundry";

export type ProofState = "pending" | "approved" | "rejected";

/** How a proof's picture relates to the CURRENT block: rendered under it, under an earlier one
 *  (its approval no longer counts and is not sent as a reference), or before lineage existed. */
export type ProofLineage = "current" | "stale" | "unknown";

export type StyleEvidenceRow = {
  readonly run: string;
  readonly scene: string;
  readonly mechanism: string;
  readonly verdict: "keep" | "reject";
  readonly at: string;
  readonly by: "operator" | "agent";
  /** An operator's keep: the only evidence that moves the ratchet. An agent's keep is shown, never counted. */
  readonly counts: boolean;
};

export type StyleExemplarView = {
  readonly role: "source" | "replica" | "transfer";
  readonly media: BlobRef;
  readonly run: string;
  /** v1's run-relative path, kept as lineage. */
  readonly file?: string;
  readonly settled?: "round-cap" | "generation-failed" | "target-met" | "no-usable-fix";
  /** A replica whose critique loop gave up: material, never proof the recipe produces the style. */
  readonly abandoned: boolean;
};

export type StyleProofView = {
  readonly id: string;
  readonly label: string;
  readonly media: BlobRef;
  readonly state: ProofState;
  readonly note?: string;
  readonly trialId?: string;
  /** The trial problem it answers; absent for a free subject or a trial the set no longer knows. */
  readonly problem?: string;
  readonly blockDigest?: string;
  readonly lineage: ProofLineage;
  readonly model?: string;
  readonly provider?: string;
  /** Absent = the vendor said nothing (counted as unpriced, never as free). */
  readonly costUsd?: number;
  /** Where the picture came from when it was not generated for this sheet (adopt's `forge:<run>/<file>`). */
  readonly source?: string;
  readonly at: string;
};

/** One trial problem's verdicts under the CURRENT block. */
export type StyleCoverageRow = {
  readonly problem: string;
  readonly trialIds: readonly string[];
  readonly approved: number;
  readonly rejected: number;
  readonly covered: boolean;
};

export type { StyleTrial } from "./style.ratchet.ts";

export type StyleLockGate = {
  /** The lock act would be admitted now. */
  readonly can: boolean;
  /** Why not, in the work's words; null when it can, or when it is already locked. */
  readonly blocker: string | null;
  /** Every proof predates lineage: none of its approvals covers a trial problem. */
  readonly legacySheet: boolean;
  /** Locked in v1 under v1's gate and imported locked; never set on a lock made here. */
  readonly grandfathered?: true;
  readonly lockedAt?: string;
  readonly lockedBy?: string;
};

export type StyleView = {
  readonly id: string;
  /** The store's revision of this record; every op names it as its base. */
  readonly rev: number;
  readonly name: string;
  readonly family: string;
  readonly status: StyleStatus;
  /** One sentence: why the style stands where it does, or what moves it next. */
  readonly why: string;
  readonly origin: {
    readonly kind: StyleOriginKind;
    readonly source?: string;
    readonly models?: readonly string[];
    readonly signature?: string;
    readonly edited?: boolean;
    readonly presetId?: string;
  };
  /** The style this one was duplicated from (the only way to change a locked look). */
  readonly duplicatedFrom?: string;
  readonly discipline?: Discipline;
  readonly observables: Readonly<Record<string, string>>;
  readonly recipe: string;
  readonly negative: string;
  /** The three roles; null until adopt read them (or the block carries them). */
  readonly palette: readonly PaletteColor[] | null;
  /** The four slots; null for a catalogue style nobody has adopted yet. */
  readonly block: StyleBlock | null;
  readonly blockDigest: string | null;
  readonly elements: readonly string[];
  readonly evidence: readonly StyleEvidenceRow[];
  /** Distinct run/scene cells an operator kept, against PROVEN_KEEPS. */
  readonly keptCells: number;
  readonly provenKeeps: number;
  readonly exemplars: readonly StyleExemplarView[];
  readonly proofs: readonly StyleProofView[];
  readonly coverage: readonly StyleCoverageRow[];
  readonly lockProblems: number;
  readonly lock: StyleLockGate;
  readonly sheet: {
    readonly approved: number;
    readonly pending: number;
    readonly rejected: number;
    /** PROOF_CAP: the model's reference window, counted over APPROVED proofs only. */
    readonly cap: number;
    readonly full: boolean;
    readonly spend: { readonly usd: number; readonly unpriced: number };
  };
  /** What a generation against this style sends: founding approvals pinned, newest after (styleRefs). */
  readonly refs: readonly BlobRef[];
  readonly updatedAt: string;
};

/** A list row: the shelf, the picker, the Library's style tiles. */
export type StyleSummary = {
  readonly id: string;
  readonly rev: number;
  readonly name: string;
  readonly family: string;
  readonly status: StyleStatus;
  readonly originKind: StyleOriginKind;
  readonly discipline?: Discipline;
  readonly palette: readonly PaletteColor[] | null;
  /** The first approved current proof, else the first exemplar; null when the style has no picture. */
  readonly cover: BlobRef | null;
  readonly proofs: { readonly approved: number; readonly pending: number; readonly rejected: number };
  readonly keptCells: number;
  readonly lockBlocker: string | null;
  readonly updatedAt: string;
};

/** An operator's edit to one style, against a revision. Each is one store transaction + one event. */
export type StyleOp =
  | { readonly kind: "set-block"; readonly block: StyleBlock }
  | { readonly kind: "set-elements"; readonly elements: readonly string[] }
  | { readonly kind: "judge-proof"; readonly proofId: string; readonly state: ProofState; readonly note?: string }
  | { readonly kind: "remove-proof"; readonly proofId: string }
  /** Put an approved proof on the Library shelf (v1 parts.tsx "promote"); recorded, the index projects it. */
  | { readonly kind: "promote-proof"; readonly proofId: string }
  | { readonly kind: "lock" }
  /** A new candidate with this style's look and none of its sheet; answers the new id. */
  | { readonly kind: "duplicate"; readonly name?: string }
  | { readonly kind: "rename"; readonly name: string };

export type StyleOpKind = StyleOp["kind"];

export type StyleOpRequest = { readonly styleId: string; readonly baseRev: number; readonly op: StyleOp };

/**
 * What an op answered. `conflict` = the base was stale: nothing written, here is the truth to
 * redraw from (the part driver's 409 shape). `refused` = the ratchet said no, in its own words
 * (a lock one-way, a frozen block, a gate not met); nothing written.
 */
export type StyleOpOutcome =
  | { readonly kind: "applied"; readonly view: StyleView; readonly created?: string }
  | { readonly kind: "conflict"; readonly view: StyleView }
  | { readonly kind: "refused"; readonly reason: string; readonly view: StyleView };

/**
 * The acts that cost or call out, so they run as jobs through a receipt rather than as an op.
 *   adopt            v1 lib/foundry/adopt.ts, IN PLACE (one record is the catalogue entry AND the
 *                    look, so adopt mints nothing; v1 minted a second record, a theme): a
 *                    PROVEN catalogue style with no block yet gains its look - the
 *                    palette read off its kept plates by the recognize model (3 roles, or
 *                    `paletteMissing`), recipe slots, and up to SEED_CAP kept forge plates as
 *                    PENDING proofs for the operator to judge.
 *   generate-proofs  one proof per trial through the imaging router, priced, under the CURRENT
 *                    block (each proof records its blockDigest and trialId).
 */
/** What a confirmed act answered: launched (the job, and the view as its landing will be drawn
 *  from), or the receipt was stale - nothing launched, here is the fresh price (Phase 4 COMMON 3). */
export type StyleActOutcome = { readonly kind: "launched"; readonly jobId: string; readonly view: StyleView } | StaleReceipt;

export type StyleAct =
  | { readonly kind: "adopt"; readonly fromStyleId: string }
  | { readonly kind: "generate-proofs"; readonly styleId: string; readonly baseRev: number; readonly trialIds: readonly string[] };

/* ── The one projection: record -> view ───────────────────────────────────── */

const ABANDONED = new Set(["generation-failed", "no-usable-fix"]);

function why(s: Style, cells: number, blocker: string | null): string {
  if (s.lock !== undefined)
    return s.lock.grandfathered
      ? `locked in v1 (${s.lock.at.slice(0, 10)}) under v1's gate — the block is frozen; duplicate to change the look`
      : `locked ${s.lock.at.slice(0, 10)} by ${s.lock.by} — the block is frozen; duplicate to change the look`;
  if (cells < PROVEN_KEEPS) return `candidate — operator keeps in ${cells} of ${PROVEN_KEEPS} distinct cells; approvals on trial problems count`;
  // A proven style with no look is held by exactly the gate's first sentence: say it once (L51).
  return blocker === null ? "proven — the lock gate holds" : `proven — to lock: ${blocker}`;
}

/** The record as a screen draws it. `rev` and `updatedAt` are the store's, not the record's. */
export function styleView(s: Style, rev: number, updatedAt: string): StyleView {
  const c = sheetCoverage(s);
  const cells = keptCells(s);
  const blocker = lockBlocker(s);
  const count = (state: ProofState): number => s.proofs.filter((p) => p.state === state).length;
  const approved = count("approved");
  // The block's palette is the one every frame is compiled with; the catalogue's (adopt's read)
  // stands in only while there is no block.
  const palette = s.block?.palette ?? s.palette ?? null;
  return {
    id: s.id,
    rev,
    name: s.name,
    family: s.family,
    status: s.status,
    why: why(s, cells, blocker),
    origin: s.origin,
    ...(s.duplicatedFrom === undefined ? {} : { duplicatedFrom: s.duplicatedFrom }),
    ...(s.discipline === undefined ? {} : { discipline: s.discipline }),
    observables: Object.fromEntries(Object.entries(s.observables).filter((e): e is [string, string] => e[1] !== undefined)),
    recipe: s.recipe,
    negative: s.negative,
    palette,
    block: s.block ?? null,
    blockDigest: c.digest,
    elements: s.elements,
    evidence: s.evidence.map((e) => ({ ...e, counts: e.verdict === "keep" && e.by === "operator" })),
    keptCells: cells,
    provenKeeps: PROVEN_KEEPS,
    exemplars: s.exemplars.map((e) => ({ ...e, abandoned: e.settled !== undefined && ABANDONED.has(e.settled) })),
    proofs: s.proofs.map((p) => {
      const problem = problemOfTrial(p.trialId);
      const lineage: ProofLineage = p.blockDigest === undefined ? "unknown" : p.blockDigest === c.digest ? "current" : "stale";
      const { promotedAt: _promoted, ...rest } = p;
      void _promoted;
      return { ...rest, lineage, ...(problem === undefined ? {} : { problem }) };
    }),
    coverage: [...c.byProblem].map(([problem, v]) => ({ problem, trialIds: v.trialIds, approved: v.approved, rejected: v.rejected, covered: v.approved > 0 })),
    lockProblems: LOCK_PROBLEMS,
    lock: {
      can: s.lock === undefined && blocker === null,
      blocker,
      legacySheet: isLegacySheet(s),
      ...(s.lock === undefined ? {} : { lockedAt: s.lock.at, lockedBy: s.lock.by, ...(s.lock.grandfathered ? { grandfathered: true as const } : {}) }),
    },
    sheet: {
      approved,
      pending: count("pending"),
      rejected: count("rejected"),
      cap: PROOF_CAP,
      // The window holds approvals that are SENT: one under an earlier block is not (L51).
      full: approved - c.stale.size >= PROOF_CAP,
      // Rounded to the tenth of a cent: a sum of vendor floats is not a price anyone quoted.
      spend: { usd: Math.round(s.proofs.reduce((sum, p) => sum + (p.costUsd ?? 0), 0) * 1000) / 1000, unpriced: s.proofs.filter((p) => p.costUsd === undefined).length },
    },
    refs: styleRefs(s),
    updatedAt,
  };
}

/** A list row from the record. */
export function styleSummary(s: Style, rev: number, updatedAt: string): StyleSummary {
  const { stale } = sheetCoverage(s);
  const count = (state: ProofState): number => s.proofs.filter((p) => p.state === state).length;
  const cover = s.proofs.find((p) => p.state === "approved" && !stale.has(p.id))?.media ?? s.exemplars[0]?.media ?? null;
  return {
    id: s.id,
    rev,
    name: s.name,
    family: s.family,
    status: s.status,
    originKind: s.origin.kind,
    ...(s.discipline === undefined ? {} : { discipline: s.discipline }),
    palette: s.block?.palette ?? s.palette ?? null,
    cover,
    proofs: { approved: count("approved"), pending: count("pending"), rejected: count("rejected") },
    keptCells: keptCells(s),
    lockBlocker: lockBlocker(s),
    updatedAt,
  };
}

/** A list row from a view already projected (the atelier's shelf holds views, not records). The
 *  same rows as `styleSummary`: the cover is the first approved proof that is still sent. */
export function summaryOfView(v: StyleView): StyleSummary {
  const cover = v.proofs.find((p) => p.state === "approved" && p.lineage !== "stale")?.media ?? v.exemplars[0]?.media ?? null;
  return {
    id: v.id,
    rev: v.rev,
    name: v.name,
    family: v.family,
    status: v.status,
    originKind: v.origin.kind,
    ...(v.discipline === undefined ? {} : { discipline: v.discipline }),
    palette: v.palette,
    cover,
    proofs: { approved: v.sheet.approved, pending: v.sheet.pending, rejected: v.sheet.rejected },
    keptCells: v.keptCells,
    lockBlocker: v.lock.blocker,
    updatedAt: v.updatedAt,
  };
}
