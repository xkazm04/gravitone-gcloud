import type { ColorRole, StyleBlock } from "@gt/catalog/style";
import type { BlobRef } from "./blob.ts";
import { styleMachine, type StyleStatus } from "./style.machine.ts";

// THE RATCHET, zod-free - one pure reading of a style's evidence, proof sheet and lock event that
// the record's door (./style.ts), the kernel's writes (packages/kernel/src/styles) and the view a
// screen is handed (./styleView.ts) all share. Two v1 ratchets lived in two places and met here:
//   · the catalogue's (lib/foundry/commitPlan.ts `humanKeep` + lib/foundry/store.ts commitRun):
//     `proven` when an operator kept the style in PROVEN_KEEPS distinct run/scene cells;
//   · the theme's (lib/themes.ts `canLock` / `lockBlocker` / `ratchetBlocker` / `styleRefs`,
//     lib/themes/coverage.ts): `locked` when no proof is pending and approvals under the CURRENT
//     block cover LOCK_PROBLEMS trial problems; a lock is one-way and freezes the block.
// UPGRADED: an approved proof is EVIDENCE in the catalogue's sense (run = the proof sheet, scene =
// the trial problem it answers), so one count drives `proven` for a forge style and an atelier
// style alike; and the lock is refused at the write, not greyed out in a view - v1's
// `useThemes.lock` (lib/useThemes.ts:147) skipped `canLock` and could lock anything.
// Pure, and STRUCTURAL: it reads the shapes below, never ./style.ts (whose door imports this file
// at runtime) or ./styleView.ts (which projects through it), so the three form no cycle; a
// parsed `Style` satisfies every shape here by construction.

/** An evidence row before the record's door brands its run id (only a door mints an id). */
export type EvidenceInput = { readonly run: string; readonly scene: string; readonly mechanism: string; readonly verdict: "keep" | "reject"; readonly at: string; readonly by: "operator" | "agent" };
export type RatchetProof = {
  readonly id: string;
  readonly state: "pending" | "approved" | "rejected";
  readonly media: BlobRef;
  readonly trialId?: string;
  readonly blockDigest?: string;
  readonly at: string;
};
/** What the ratchet reads off a style: its evidence, its sheet, its block and its lock event. */
export type RatchetStyle = {
  readonly evidence: readonly EvidenceInput[];
  readonly lock?: { readonly at: string; readonly by: string; readonly grandfathered?: true };
  readonly block?: StyleBlock;
  readonly proofs: readonly RatchetProof[];
};

export type StyleTrial = {
  readonly id: string;
  readonly label: string;
  readonly problem: string;
  readonly beat: string;
  /** The subject clause handed to the model, verbatim: an edited subject is no longer the trial. */
  readonly subject: string;
};

/** v1's promotion threshold: distinct run/scene cells an operator kept. */
export const PROVEN_KEEPS = 2;
/** Distinct trial problems a sheet must be approved on, under its current block, to lock. */
export const LOCK_PROBLEMS = 3;
/** The production model's reference window, counted over APPROVED proofs (lib/themes.ts says why
 *  rejections must not count: a sheet of fourteen became a dead end). */
export const PROOF_CAP = 14;
/** References SENT per generation (each is a whole image on every call; value saturates at four). */
export const SEND_REFS = 4;
/** Of those, pinned to the sheet's founding approvals, so a late frame is judged against the style
 *  the early frames saw. Strictly under SEND_REFS, or nothing rolls. */
export const PINNED_REFS = 2;
/** The evidence `mechanism` an approved proof is recorded under. */
export const PROOF_MECHANISM = "proof";

/** THE TRIAL SET (v1 lib/library/trials.ts, verbatim): five real beats, five visual problems, so
 *  no style passes all five by being good at one thing. Held equal to v1's by
 *  tests/next-server/style-ratchet-v1.test.ts until v1's copy retires with its /library. */
export const STYLE_TRIALS: readonly StyleTrial[] = [
  { id: "peak-and-fall", label: "the fall", problem: "quantity", beat: "HOOK · the record high, then half of it gone",
    subject: "A single line rising steeply to a sharp peak near the top right, then falling away to roughly half its peak height. A small marker sits at the peak. Plain ground line beneath. Centred, large and simple, generous empty space around the curve." },
  { id: "wish-list", label: "the wish list", problem: "inventory", beat: "HOOK · every item delivered — reserve, law, regulators, ETFs",
    subject: "Four simple emblems in an evenly spaced row: a government building with columns, a rolled document with a ribbon, a balance scale, and a bank card. Each has a small tick mark beside it. Uniform size, even spacing, clean ground line, generous empty space." },
  { id: "booking-not-meal", label: "the booking", problem: "analogy", beat: "MOVEMENT 1 · a full reservation book, an empty dining room",
    subject: "A frame split into two equal halves by a thin vertical line. On the left, an open reservation book with every line filled. On the right, a dining table with two empty chairs and nothing on it. Both halves equally weighted, large simple shapes, generous empty space." },
  { id: "flywheel", label: "the flywheel", problem: "mechanism", beat: "MOVEMENT 2 · the mNAV machine, and the moment it inverts",
    subject: "A closed circular loop of three thick arrows chasing each other clockwise around a central stack of coins. One arrow, at the lower left, points the wrong way against the other two, breaking the circuit. Centred, large simple shapes, generous empty space." },
  { id: "the-exit", label: "the exit", problem: "flow", beat: "MOVEMENT 1 · long-term holders selling into the demand meant to lift them",
    subject: "Two thick opposing streams of small shapes meeting head-on in the middle of the frame: one stream flowing in from the left, a heavier stream flowing out to the right. Where they meet the flow is visibly congested. Horizontal composition, large simple shapes, generous empty space." },
];

export const TRIAL_PROBLEMS: readonly string[] = [...new Set(STYLE_TRIALS.map((t) => t.problem))];
const PROBLEM_OF = new Map(STYLE_TRIALS.map((t) => [t.id, t.problem]));

/** The problem a trial id probes; undefined for a free subject or an id the set no longer knows. */
export const problemOfTrial = (trialId: string | undefined): string | undefined => (trialId === undefined ? undefined : PROBLEM_OF.get(trialId));

/* ── The block, compiled and digested ─────────────────────────────────────── */

const ROLE_PHRASE: { readonly [K in ColorRole]: string } = {
  ground: "as the dominant background",
  objects: "for the objects",
  accent: "used only on the single element that carries the point, and nowhere else",
};

/** The style half of every prompt (v1 lib/stylePrompt.ts `compileStyleBlock`, byte for byte: a
 *  proof's recorded digest is of THESE words, so a second spelling would stale every v1 sheet). */
export function compileStyleBlock(b: StyleBlock): string {
  const palette = b.palette.map((c) => `${c.name} (${c.hex}) ${ROLE_PHRASE[c.role]}`).join(", ");
  return [`${b.technique}.`, `${b.subject}.`, `Strict three-colour palette: ${palette}.`, `${b.finish}.`].join(" ");
}

/** FNV-1a 32 of the compiled style half (v1 lib/themes/coverage.ts): an identity check, not security. */
export function blockDigest(block: StyleBlock): string {
  const s = compileStyleBlock(block);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** By value, slot by slot: a caller that resends the block it did not touch has not changed it. */
export function sameBlock(a: StyleBlock | undefined, b: StyleBlock | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.technique !== b.technique || a.subject !== b.subject || a.finish !== b.finish || a.palette.length !== b.palette.length) return false;
  return a.palette.every((c, i) => c.name === b.palette[i]?.name && c.hex === b.palette[i]?.hex && c.role === b.palette[i]?.role);
}

/* ── The reading ──────────────────────────────────────────────────────────── */

type Sheet = Pick<RatchetStyle, "block" | "proofs">;

/** Distinct run/scene cells an OPERATOR kept. An agent's keep is evidence, never a vote. */
export function keptCells(s: Pick<RatchetStyle, "evidence">): number {
  return new Set(s.evidence.filter((e) => e.verdict === "keep" && e.by === "operator").map((e) => `${e.run}/${e.scene}`)).size;
}

/** THE status: derived, never written by a caller. The lock is an event on the record. */
export function statusOf(s: Pick<RatchetStyle, "evidence" | "lock">): StyleStatus {
  if (s.lock !== undefined) return "locked";
  return keptCells(s) >= PROVEN_KEEPS ? "proven" : "candidate";
}

export type Coverage = {
  readonly byProblem: ReadonlyMap<string, { approved: number; rejected: number; trialIds: string[] }>;
  /** Approved under another block than the current one: no longer counted, no longer sent. */
  readonly stale: ReadonlySet<string>;
  /** Proofs that predate lineage (no digest): listed, never guessed about. */
  readonly unknown: ReadonlySet<string>;
  readonly digest: string | null;
};

export function sheetCoverage(s: Sheet): Coverage {
  const digest = s.block === undefined ? null : blockDigest(s.block);
  const byProblem = new Map<string, { approved: number; rejected: number; trialIds: string[] }>();
  for (const problem of TRIAL_PROBLEMS)
    byProblem.set(problem, { approved: 0, rejected: 0, trialIds: STYLE_TRIALS.filter((t) => t.problem === problem).map((t) => t.id) });
  const stale = new Set<string>();
  const unknown = new Set<string>();
  for (const p of s.proofs) {
    if (p.blockDigest === undefined) {
      unknown.add(p.id);
      continue;
    }
    if (p.blockDigest !== digest) {
      if (p.state === "approved") stale.add(p.id);
      continue;
    }
    const row = byProblem.get(problemOfTrial(p.trialId) ?? "");
    if (row === undefined) continue;
    if (p.state === "approved") row.approved++;
    else if (p.state === "rejected") row.rejected++;
  }
  return { byProblem, stale, unknown, digest };
}

/** A sheet made wholly of proofs that predate lineage (v1 coverage.ts `isLegacySheet`). v1 let
 *  such a sheet lock on one approval. RULED 2026-10-17 (Phase 5, Director): that grandfather rule
 *  is now carried by the LOCK, not the sheet - a v1 theme already locked in v1 imports locked
 *  (`lock.grandfathered`, see packages/kernel/src/styles/v1theme.ts); a legacy sheet NOT yet
 *  locked meets the same gate as any other (proven + coverage under the current block). Kept as
 *  a reading so the atelier can say why such a sheet's approvals do not cover a problem. */
export const isLegacySheet = (s: Pick<RatchetStyle, "proofs">): boolean => s.proofs.length > 0 && s.proofs.every((p) => p.blockDigest === undefined);

export const problemsCovered = (c: Coverage): string[] => [...c.byProblem].filter(([, v]) => v.approved > 0).map(([k]) => k);

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Why the lock act is refused, in the work's words; null when it would be admitted (or the style
 * is already locked). v1 `lockBlocker`'s sentences, plus the two gates the merge added: a style
 * needs a block to lock, and it must be proven (an approval on a trial problem is a kept cell, so
 * a sheet covering three problems is proven by construction; the check is the backstop). No
 * sheet is exempt from coverage any more: v1's one-approval legacy gate moved onto the lock.
 */
export function lockBlocker(s: RatchetStyle): string | null {
  if (s.lock !== undefined) return null;
  if (s.block === undefined) return "no block yet — adopt the style or write its four slots first";
  if (!s.proofs.length) return "generate at least one proof first";
  const pending = s.proofs.filter((p) => p.state === "pending").length;
  if (pending) return `${plural(pending, "proof")} still undecided`;
  if (!s.proofs.some((p) => p.state === "approved")) return "every proof was rejected — generate another";
  const c = sheetCoverage(s);
  const covered = problemsCovered(c);
  if (covered.length < LOCK_PROBLEMS) {
    const missing = TRIAL_PROBLEMS.filter((p) => !covered.includes(p));
    const staleNote = c.stale.size ? ` (${c.stale.size} approved under an earlier block no longer count)` : "";
    return `approve ${plural(LOCK_PROBLEMS - covered.length, "more problem")} — ${covered.length} of ${LOCK_PROBLEMS} covered; missing ${missing.join(", ")}${staleNote}`;
  }
  const cells = keptCells(s);
  if (cells < PROVEN_KEEPS) return `not proven — operator keeps in ${cells} of ${PROVEN_KEEPS} distinct cells`;
  return null;
}

/**
 * WHAT THE RATCHET FREEZES, as a rule on the write (v1 `ratchetBlocker`, which a view held): the
 * status moves only along the machine (candidate -> proven -> locked, never back); a lock is never
 * lifted or re-stamped; a locked block never changes (duplicate instead); a locked sheet keeps at
 * least one approval. Adding a proof to a locked sheet stays allowed: an approval is a reference
 * for the next call, not a change to what was ratified. Null when `after` may land.
 */
export function ratchetBlocker(before: RatchetStyle, after: RatchetStyle): string | null {
  const from = statusOf(before);
  const to = statusOf(after);
  if (from !== to && !styleMachine.can(from, to)) return `the ratchet is one-way — a ${from} style cannot become ${to}`;
  if (before.lock === undefined) return null;
  if (after.lock?.at !== before.lock.at || after.lock.by !== before.lock.by || after.lock.grandfathered !== before.lock.grandfathered)
    return "a lock is one-way — duplicate this style into a new draft instead of unlocking it";
  if (!sameBlock(before.block, after.block))
    return "this style is locked and projects build on it — duplicate it into a new draft to change the block";
  if (before.proofs.some((p) => p.state === "approved") && !after.proofs.some((p) => p.state === "approved"))
    return "this style is locked on its approved proof — keep at least one approval, or duplicate it into a new draft";
  return null;
}

/** The references a generation sends: the founding approvals pinned, then the newest, capped at
 *  SEND_REFS; approvals under an earlier block are not sent (unknown lineage is not stale). */
export function styleRefs(s: Sheet): BlobRef[] {
  const { stale } = sheetCoverage(s);
  const approved = s.proofs
    .filter((p) => p.state === "approved" && !stale.has(p.id))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id.localeCompare(b.id)));
  const pinned = approved.slice(0, PINNED_REFS);
  const rolling = approved.slice(pinned.length).reverse().slice(0, Math.max(0, SEND_REFS - pinned.length));
  return [...pinned, ...rolling].map((p) => p.media);
}

/** The evidence row a judged proof writes: run = the style's sheet, scene = its trial problem (a
 *  free subject is a scene of its own, so two pictures of one problem are one cell). */
export function proofEvidence(styleId: string, p: Pick<RatchetProof, "id" | "trialId">, verdict: "keep" | "reject", at: string): EvidenceInput {
  const scene = problemOfTrial(p.trialId) ?? `free:${p.id}`;
  return { run: `sheet:${styleId}`, scene, mechanism: PROOF_MECHANISM, verdict, at, by: "operator" };
}
