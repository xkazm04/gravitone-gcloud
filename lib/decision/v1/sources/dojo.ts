import "server-only";

import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import path from "node:path";

import type { BlobRef } from "@gt/domain/blob";
import type { ConsequenceItem } from "@gt/domain/board";
import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { InitialDecision } from "@gt/kernel/decision/driver";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { applyBlindEdit, blindComplete, blindKey, ledgerVerdict, measureBlind, pickToArm, pickedCount, type Arm, type BlindEdit, type BlindPick, type BlindState } from "../../../foundry/training/blind.ts";
import { commitCycle, getCycle, patchBlind, patchTrainingVerdicts, trainingFileStat } from "../../../foundry/training/store.ts";
import type { CycleManifest, Improvement, MediaRef, PairResult, TrainingVerdict, TrainingVerdicts } from "../../../foundry/training/types.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import {
  buildConsequence,
  committedOutcome,
  decisionMap,
  foundryFileUrl,
  instantOr,
  mediaRef,
  mintPacket,
  runIdOf,
  v1Call,
  v1DigestOf,
  type AdapterRef,
  type DecisionAdapter,
  type DecisionsAt,
  type Loss,
  type OpenPlan,
  type Preview,
} from "../types.ts";

// THE DOJO GATE AS A BLIND-PAIR PACKET - foundry-out/training/<id>/
// (cycle.json from the training loop, verdicts.json and blind.json from the
// gate) read through getCycle, judged pair by pair, committed through v1's
// own `patchBlind`, `patchTrainingVerdicts` and `commitCycle`.
//
// v1's gate had two acts: blind picks per pair (training/blind.ts), THEN the
// claim per improvement with the judges unmasked. The packet carries the
// first: one row per pair, two arms, the operator's a | b | tie | both-bad.
// The CLAIM is read off the picks, and the rule is stated where the operator
// sees it - every claim in the consequence names its count before the commit:
//
//   approve  the challenger was chosen in MORE pairs than the baseline
//   reject   otherwise - "not shown to be better", which is what v1's ledger
//            writes for a rejected claim (ledgerVerdict: `not-better`)
//
// Kept from v1, verbatim in effect: the seeded A/B map (armInSlotA - a pick is
// written back as the slot v1's map puts that arm in, never re-seeded); the
// BLIND_FLOOR (ledgerVerdict reads the picks we write, so a two-pair claim is
// `unmeasurable` exactly as in v1); guardClaims (claims are written on a
// non-Board surface, so v1 REFUSES a claim whose pairs are not all picked -
// the guard holds, it is not anchored past); commitCycle's own refusal of a
// half-picked improvement; and the blind itself - arm ids are opaque digests,
// so neither the id nor the stored order says which arm is the challenger, and
// the judge's pick is a kernel machine pick, revealed only after the
// operator's (@gt/kernel/decision/read revealPicks).
// Upgraded: v1 computed no consequence server-side; this one names the ledger
// rows, the thumbs copied into git and every media file the commit deletes.
// Disclosed losses: `both-bad` has no v1 word (BlindPick is A | B | tie) and is
// written as `tie` - neither arm was preferred, which is what agreement
// measures; an improvement v1 already decided, or one with no pairs, is not
// re-asked (its claim stands as v1 recorded it, and commitCycle commits it).

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
const shown = (ref: MediaRef): string => ref.poster ?? ref.file;

/** An arm's candidate id: the pair's row plus a digest of which arm it is. Neither the id nor its sort order names the arm. */
export function armId(cycle: string, imp: string, pair: string, arm: Arm): string {
  const h = createHash("sha256").update(`${cycle}\u0000${imp}\u0000${pair}\u0000${arm}`).digest("hex").slice(0, 12);
  return `${imp}/${pair}/${h}`;
}

const decidedInV1 = (v: TrainingVerdicts, imp: string): boolean => v[imp] === "approve" || v[imp] === "reject";

type Pair = { readonly imp: Improvement; readonly pair: PairResult; readonly row: string; readonly baseline: string; readonly challenger: string };

/** The pairs the packet asks: undecided improvements' pairs whose two arms are on disk. */
function pairsOf(v1: DojoV1): Pair[] {
  const out: Pair[] = [];
  for (const imp of v1.cycle.improvements) {
    if (decidedInV1(v1.verdicts, imp.id)) continue;
    const pairs = imp.pairs.filter((p) => !p.baseline.deleted && !p.challenger.deleted && v1.media[shown(p.baseline)] !== undefined && v1.media[shown(p.challenger)] !== undefined);
    // An improvement is judged whole or not at all: a claim from some of its pairs is not v1's claim.
    if (pairs.length === 0 || pairs.length < imp.pairs.length) continue;
    for (const p of pairs) out.push({ imp, pair: p, row: `${imp.id}/${p.id}`, baseline: armId(v1.cycle.id, imp.id, p.id, "baseline"), challenger: armId(v1.cycle.id, imp.id, p.id, "challenger") });
  }
  return out;
}

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef): Promise<Result<DojoV1>> {
  const id = ref.runId;
  const detail = await v1Call(() => getCycle(id));
  if (!detail.ok) return detail;
  const { cycle, verdicts, blind, rev } = detail.value;
  const media: Record<string, BlobRef> = {};
  for (const imp of cycle.improvements) {
    for (const p of imp.pairs) {
      for (const r of [p.baseline, p.challenger]) {
        if (r.deleted) continue;
        const rel = shown(r);
        const at = await v1Call(() => trainingFileStat(id, rel));
        if (!at.ok) {
          if (at.error.code === "not-found" || at.error.code === "invalid") continue;
          return at;
        }
        const b = await mediaRef(at.value.abs);
        if (b.ok) media[rel] = b.value;
        else if (b.error.code !== "not-found") return b;
      }
    }
  }
  const sidecar = await v1Call(() => trainingFileStat(id, "blind.json"));
  const fallback = instantOr(cycle.at, new Date(0).toISOString()).at;
  const picksAt = sidecar.ok ? await stat(sidecar.value.abs).then((s) => s.mtime.toISOString(), () => fallback) : fallback;
  return ok({ cycle, verdicts, blind, rev: rev ?? 0, media, picksAt });
}

/* ── picks <-> arm verdicts <-> claims ─────────────────────────────────────── */

type Outcome = "baseline" | "challenger" | "tie" | "both-bad";

/** The two arms' verdicts read back as the operator's pick (the inverse of @gt/domain/board pickVerdicts). */
function outcomeOf(b: Decision | undefined, c: Decision | undefined): Outcome | null {
  if (b?.verdict == null || c?.verdict == null) return null;
  if (c.verdict === "keep" && b.verdict === "reject") return "challenger";
  if (b.verdict === "keep" && c.verdict === "reject") return "baseline";
  return b.verdict === "keep" ? "tie" : "both-bad";
}

/** The v1 blind pick an outcome is written as, in v1's own A/B map for that pair. */
function v1Pick(o: Outcome, slotA: Arm): BlindPick {
  if (o === "tie" || o === "both-bad") return "tie";
  return o === slotA ? "A" : "B";
}

const slotOf = (blind: BlindState, imp: string, pair: string): Arm => blind.map[blindKey(imp, pair)] ?? "baseline";

type Claim = { readonly imp: Improvement; readonly verdict: TrainingVerdict; readonly challenger: number; readonly baseline: number; readonly ties: number; readonly bothBad: number; readonly edits: readonly BlindEdit[] };

/** The pairs whose two arms a packet holds, re-derived from the cycle by their opaque ids. */
function pairsIn(cycle: CycleManifest, ids: ReadonlySet<string>): Pair[] {
  const out: Pair[] = [];
  for (const imp of cycle.improvements) {
    for (const p of imp.pairs) {
      const baseline = armId(cycle.id, imp.id, p.id, "baseline");
      const challenger = armId(cycle.id, imp.id, p.id, "challenger");
      if (ids.has(baseline) && ids.has(challenger)) out.push({ imp, pair: p, row: `${imp.id}/${p.id}`, baseline, challenger });
    }
  }
  return out;
}

/** Every fully picked improvement's claim, and the blind edits that record its picks in v1. */
function claimsFrom(pairs: readonly Pair[], blind: BlindState, decisions: readonly Decision[]): Claim[] {
  const byCandidate = decisionMap(decisions);
  const out: Claim[] = [];
  for (const imp of new Set(pairs.map((p) => p.imp))) {
    const mine = pairs.filter((p) => p.imp === imp);
    const outcomes = mine.map((p) => ({ p, o: outcomeOf(byCandidate.get(p.baseline), byCandidate.get(p.challenger)) }));
    if (outcomes.some((x) => x.o === null)) continue;
    const count = (o: Outcome) => outcomes.filter((x) => x.o === o).length;
    const challenger = count("challenger");
    const baseline = count("baseline");
    out.push({
      imp,
      verdict: challenger > baseline ? "approve" : "reject",
      challenger,
      baseline,
      ties: count("tie"),
      bothBad: count("both-bad"),
      edits: outcomes.map(({ p, o }) => ({ imp: imp.id, pair: p.pair.id, pick: v1Pick(o ?? "tie", slotOf(blind, imp.id, p.pair.id)) })),
    });
  }
  return out;
}

export const claimsOf = (v1: DojoV1, decisions: readonly Decision[]): Claim[] => claimsFrom(pairsOf(v1), v1.blind, decisions);

/* ── packet ────────────────────────────────────────────────────────────────── */

function refusal(cycle: CycleManifest): string | undefined {
  // v1's own sentences (lib/foundry/training/store.ts commitCycle).
  if (cycle.status === "committed") return "This cycle is already committed.";
  if (cycle.status !== "awaiting-gate" && cycle.status !== "failed") return "The loop is still running this cycle.";
  return undefined;
}

function packet(v1: DojoV1): Result<OpenPlan> {
  const { cycle } = v1;
  const no = refusal(cycle);
  if (no !== undefined) return err("refused", `dojo cycle ${cycle.id}: ${no}`);
  const losses: Loss[] = [];
  const pairs = pairsOf(v1);
  const asked = new Set(pairs.map((p) => p.imp.id));
  for (const imp of cycle.improvements) {
    if (asked.has(imp.id)) continue;
    const why = decidedInV1(v1.verdicts, imp.id)
      ? `v1 already holds the claim (${v1.verdicts[imp.id] ?? ""}); it is committed as recorded`
      : imp.pairs.length === 0
        ? "it has no pairs to judge blind; its claim stays undecided in v1"
        : "a pair's image is not on disk; an improvement is judged whole, so it stays undecided in v1";
    losses.push({ candidate: imp.id, grade: "dropped", reason: why });
  }
  if (pairs.length === 0) return err("refused", `dojo cycle ${cycle.id} has no improvement left to judge blind`);
  const jobId = `dojo:${cycle.id}`;
  const minted = mintPacket({
    id: packetIdOf("dojo", cycle.id),
    lane: cycle.media,
    source: "dojo",
    mode: "blind-pair",
    state: "open",
    runId: cycle.id,
    title: `dojo ${cycle.subject} · ${cycle.id}`,
    // No grades: a blind arm carries nothing the operator could read the judge off.
    items: pairs.flatMap((p) => [
      { id: p.baseline, jobId, row: p.row, media: v1.media[shown(p.pair.baseline)], grades: [] },
      { id: p.challenger, jobId, row: p.row, media: v1.media[shown(p.pair.challenger)], grades: [] },
    ]),
  });
  if (!minted.ok) return minted;

  const initial: InitialDecision[] = [];
  let unstamped = 0;
  for (const p of pairs) {
    const pick = v1.blind.improvements[p.imp.id]?.picks[p.pair.id];
    if (pick === undefined) continue;
    const arm = pickToArm(pick, slotOf(v1.blind, p.imp.id, p.pair.id));
    const verdict = (a: Arm): "keep" | "reject" => (arm === "tie" || arm === a ? "keep" : "reject");
    for (const [a, candidate] of [["baseline", p.baseline], ["challenger", p.challenger]] as const) initial.push({ candidate, verdict: verdict(a), reasons: [], by: "operator", surface: "v1", at: v1.picksAt });
    unstamped++;
  }
  if (unstamped > 0) losses.push({ grade: "approximate", reason: `v1 stamps no instant on a blind pick; ${unstamped} imported pick(s) carry blind.json's write time` });

  const rows: RowWords[] = pairs.map((p) => ({ id: p.row, label: `${p.imp.technique} · ${p.pair.scene}` }));
  const items: Record<string, ItemWords> = {};
  const urls: Record<string, string> = {};
  for (const p of pairs) {
    for (const [arm, id] of [["baseline", p.baseline], ["challenger", p.challenger]] as const) {
      // The arm's name is the machine's tell: the Board withholds item words on an unjudged pair (L21's fixture does).
      items[id] = { label: arm, meta: `scene ${p.pair.scene} · seed ${p.pair.seed}` };
      urls[id] = foundryFileUrl(cycle.id, shown(p.pair[arm]), "training");
    }
  }
  const judged = pairs.filter((p) => p.pair.judge_pick !== "tie");
  return ok({
    packet: minted.value,
    initial,
    // The judge's pick per pair, by the id the door minted; a judge's tie names no arm.
    machinePicks: judged.flatMap((p) => {
      const pickedId = p.pair.judge_pick === "challenger" ? p.challenger : p.baseline;
      const candidate = minted.value.items.find((c) => c.id === pickedId)?.id;
      return candidate === undefined ? [] : [{ row: p.row, candidate }];
    }),
    present: {
      items,
      rows,
      questions: Object.fromEntries(pairs.map((p) => [p.row, p.imp.claim])),
      oracle: { passed: true, summary: `${pairs.length} pairs · ${asked.size} claim(s) · judge masked until you pick` },
      meta: `dojo · ${cycle.dimension} · ${cycle.subject}`,
    },
    urls,
    losses,
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

function digestOf(v1: DojoV1): string {
  return v1DigestOf({
    source: "dojo",
    cycle: v1.cycle.id,
    status: v1.cycle.status,
    improvements: v1.cycle.improvements.map((i) => ({ id: i.id, thumbnail: i.thumbnail ?? null, pairs: i.pairs.map((p) => [p.id, p.baseline.deleted === true, p.challenger.deleted === true, p.judge_pick]) })),
    verdicts: v1.verdicts,
    blind: v1.blind,
    media: Object.entries(v1.media).map(([k, b]) => [k, b.sha256]).sort(),
  });
}

const pct = (x: number) => `${Math.round(100 * x)}%`;

function consequence(v1: DojoV1, at: DecisionsAt): Result<Preview> {
  const { cycle } = v1;
  const no = refusal(cycle);
  if (no !== undefined) return err("refused", `dojo cycle ${cycle.id}: ${no}`);
  const claims = claimsOf(v1, at.decisions);
  // The blind state and the claims commitCycle will read once apply has written them.
  let blind = v1.blind;
  for (const c of claims) for (const e of c.edits) blind = applyBlindEdit(blind, e);
  const verdicts: TrainingVerdicts = { ...v1.verdicts, ...Object.fromEntries(claims.map((c) => [c.imp.id, c.verdict])) };
  const decided = cycle.improvements.filter((i) => decidedInV1(verdicts, i.id));
  // commitCycle refuses a half-picked improvement among the decided; so does the preview, in its words.
  const half = decided.filter((i) => {
    const e = blind.improvements[i.id];
    return !e?.anchored && pickedCount(i, e) > 0 && !blindComplete(i, e);
  });
  if (half.length > 0) return err("refused", `Finish the blind picks (or skip blind) before committing: ${half.map((i) => i.technique).join(", ")}.`);

  const runRel = (rel: string) => `foundry-out/training/${cycle.id}/${rel}`;
  const deletes: ConsequenceItem[] = decided.flatMap((i) =>
    i.pairs.flatMap((p) => [p.baseline, p.challenger].filter((r) => !r.deleted).flatMap((r) => (r.poster ? [r.file, r.poster] : [r.file]).map((f) => ({ target: runRel(f), candidate: i.id, detail: "pair media, decided" })))),
  );
  const rows = decided.map((i) => {
    const human = verdicts[i.id] === "approve" ? "approve" : "reject";
    const entry = blind.improvements[i.id];
    const asIs = entry?.anchored || pickedCount(i, entry) > 0 ? entry : { picks: {}, anchored: true };
    const v = ledgerVerdict(human, measureBlind(i, asIs, blind.map), asIs);
    const claim = claims.find((c) => c.imp.id === i.id);
    const why = claim
      ? ` · challenger chosen in ${claim.challenger} of ${i.pairs.length} pair(s), baseline in ${claim.baseline}${claim.ties ? `, ${claim.ties} tie(s)` : ""}${claim.bothBad ? `, ${claim.bothBad} both bad (written as tie)` : ""}`
      : " · as v1 recorded it";
    return { kind: "index-row" as const, target: "pipeline/foundry/training-ledger.json", candidate: i.id, detail: `${i.technique}: ${human} → ${v}${asIs?.anchored ? " (anchored)" : ""}${why}` };
  });
  const thumbs = decided
    .filter((i) => verdicts[i.id] === "approve" && i.thumbnail)
    .map((i) => ({ kind: "file" as const, target: `pipeline/foundry/training/thumbs/${cycle.id}--${i.id}${path.extname(i.thumbnail ?? "").toLowerCase()}`, candidate: i.id, detail: "the kept thumbnail, copied into git" }));
  const v1Digest = digestOf(v1);
  return ok({
    v1Digest,
    consequence: buildConsequence(at, pairsOf(v1).flatMap((p) => [p.baseline, p.challenger]), {
      deletes,
      writes: [
        ...rows,
        ...thumbs,
        { kind: "file" as const, target: runRel("blind.json"), detail: `${claims.reduce((n, c) => n + c.edits.length, 0)} pick(s)` },
        { kind: "file" as const, target: runRel("verdicts.json"), detail: `${claims.length} claim(s)` },
        { kind: "file" as const, target: runRel("findings.md") },
        { kind: "file" as const, target: runRel("cycle.json"), detail: "status committed" },
      ],
      promotions: claims
        .filter((c) => c.verdict === "approve")
        .map((c) => ({ target: c.imp.technique, candidate: c.imp.id, detail: `approved (${pct(c.challenger / Math.max(1, c.imp.pairs.length))} of pairs chose it): the loop's reflected:false queue` })),
    }, v1Digest),
  });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const done = committedOutcome(claim);
  if (!done.ok) return done;
  const runId = runIdOf(claim);
  if (!runId.ok) return runId;
  const id = runId.value;
  const fresh = await v1Call(() => getCycle(id));
  if (!fresh.ok) return fresh;
  const { cycle, verdicts, blind, rev } = fresh.value;
  // The packet's own pairs, by their opaque ids: what v1 decided itself is not ours to rewrite.
  const claims = claimsFrom(pairsIn(cycle, new Set<string>(claim.packet.items.map((c) => c.id))), blind, claim.decisions);

  if (cycle.status === "committed") {
    const differ = claims.filter((c) => verdicts[c.imp.id] !== c.verdict);
    if (differ.length === 0) return ok(undefined);
    return err("refused", `dojo cycle ${id} was committed in v1 with other claims: ${differ.map((c) => `${c.imp.technique} is ${verdicts[c.imp.id] ?? "undecided"} in v1, ${c.verdict} here`).join("; ")}`);
  }

  const edits = claims.flatMap((c) => c.edits).filter((e) => blind.improvements[e.imp]?.picks[e.pair ?? ""] !== e.pick);
  if (edits.length > 0) {
    const picked = await v1Call(() => patchBlind(id, [...edits]));
    if (!picked.ok) return picked;
  }
  const set: Record<string, TrainingVerdict> = {};
  for (const c of claims) if (verdicts[c.imp.id] !== c.verdict) set[c.imp.id] = c.verdict;
  if (Object.keys(set).length > 0) {
    // Not the Board's surface: guardClaims REFUSES a claim whose pairs are not all picked blind,
    // rather than anchoring it, so the blind guard still stands between the picks and the claim.
    const claimed = await v1Call(() => patchTrainingVerdicts(id, { set, baseRev: rev ?? 0, by: "human", surface: "weir" }));
    if (!claimed.ok) return claimed;
  }
  const committed = await v1Call(() => commitCycle(id));
  return committed.ok ? ok(undefined) : committed;
}

export const dojoAdapter: DecisionAdapter<DojoV1> = { source: "dojo", read, packet, consequence, apply };
