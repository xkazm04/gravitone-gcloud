import "server-only";

import path from "node:path";

import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { mergePart, openOf, partRefusal, partRunId, remainderLine, splitPart } from "../../../foundry/scout/parts.ts";
import { listSeedBatches, mutateSeedBatch, readSeedBatch, seedOf, seedsRoot } from "../../../foundry/scout/seedStore.ts";
import { musicFacets, seedFacets } from "../../../foundry/scout/seeds.ts";
import type { Seed, SeedBatch, SeedCommit } from "../../../foundry/scout/types.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import { buildConsequence, committedOutcome, decisionMap, mintPacket, runIdOf, v1Call, v1DigestOf, type AdapterRef, type DecisionAdapter, type DecisionsAt, type OpenPlan, type Preview } from "../types.ts";
import { textRef } from "./scoutPlan.ts";

// ONE BATCH OF SEEDS AS A PACKET (spark scout-decision-graph WP-S1) - <scoutRoot>/seeds/<batch>/batch.json
// (lib/foundry/scout/seedStore.ts), read through readSeedBatch, decided as ONE matrix cull with a row per
// seed and ONE words-only cell whose id IS the seed id (`sd-004`), so the desk's ideas list decides it in
// place. The row is the sentence; the cell's meta its facets (`adult · comedy › sketch · animated comedy
// sketch · short`, a music seed's song after them: `· 92 bpm · nylon guitar, cello · melancholic · instrumental`),
// and a child seed's first line under the sentence is the parent it narrows.
//
// EVERY REJECT NAMES A REASON (@gt/domain/source `seeds`.reasonOnReject): the kernel's commit refuses a
// reasonless one (packages/kernel/src/decision/core.ts planCommit), and so does this apply - a packet that
// reached it some other way still cannot write a ban that says nothing.
//
// THE COMMIT is one write: `batch.committed` {at, by, kept, rejected, reasons, notes, dry}, under the batch's
// lock. Kept seeds are branch roots the next night grows (taste.ts: child seeds, idea artboards); rejected
// ones are the bans the next batch is written against. Nothing else is written, by a dry batch or a live one.
//
// IDEMPOTENT: the record is compared, never overwritten - the same seeds kept and rejected is success, a
// different outcome is a loud refusal naming each seed that differs (scout.ts's rule).
//
// IN PARTS (spark scout-storyboards, lib/foundry/scout/parts.ts): a batch may commit with seeds left undecided -
// never with a reasonless reject - and they open as `pkt:seeds:<batch>:2`, then `:3`. `batch.committed` is the
// union of every part, `open` the seeds still waiting; a kept seed is a branch root from the part that kept it.

/** Repo-relative, forward slashes: the root a consequence names. */
const rel = (abs: string): string => path.relative(process.cwd(), abs).replace(/\\/g, "/");

/** The batch, and every batch's seeds by ref so a child names its parent's sentence. */
type SeedsRead = { readonly batch: SeedBatch; readonly all: readonly SeedBatch[]; readonly at: string; /** The part this read opens (absent: 1). */ readonly part?: number };

/** A child seed's line: the parent it narrows, cut at 60 characters on a word. */
export const PARENT_CUT = 60;
const cut = (s: string): string => (s.length <= PARENT_CUT ? s : `${s.slice(0, PARENT_CUT - 1).replace(/\s+\S*$/, "")}…`);

/** What a verdict does to a seed, as the preview says it. */
export const SEED_VERDICT = { keep: "a branch: child seeds and ideas grow from it next night", reject: "banned from the next batch" } as const;

/* ── read ──────────────────────────────────────────────────────────────────── */

async function read(ref: AdapterRef): Promise<Result<SeedsRead>> {
  const { run, part } = splitPart(ref.runId);
  const got = await v1Call(() => readSeedBatch(run));
  if (!got.ok) return got;
  const all = await v1Call(() => listSeedBatches());
  if (!all.ok) return all;
  return ok({ batch: got.value, all: all.value, at: rel(seedsRoot()), ...(part === 1 ? {} : { part }) });
}

/** The seeds part n decides (part 1: every seed; part n: those the record leaves open), and why it cannot open, if so. */
function partOf(v1: SeedsRead): { readonly part: number; readonly seeds: readonly Seed[]; readonly no?: string } {
  const b = v1.batch;
  const part = v1.part ?? 1;
  const open = new Set(openOf(b.committed));
  const seeds = part === 1 ? b.seeds : b.seeds.filter((s) => open.has(s.id));
  const no = partRefusal(b.committed, part);
  if (no === undefined) return { part, seeds };
  return { part, seeds, no: no === "already committed" ? `seeds batch ${b.id}: This batch is already committed.` : `seeds batch ${b.id}: ${no}` };
}

/* ── packet ────────────────────────────────────────────────────────────────── */

/** The cell's hashed text. A music seed's song is a line after the rest; a seed without one hashes exactly as it did before the field (a packet minted then keeps its refs). */
export const body = (s: Seed): string => [s.sentence, s.audience, s.genre, s.subgenre, s.type, s.format, s.parent ?? "", ...(s.music === undefined ? [] : [musicFacets(s.music)])].join("\n");

function wordsOf(v1: SeedsRead, s: Seed): ItemWords {
  const parent = s.parent === undefined ? undefined : seedOf(v1.all, s.parent)?.seed.sentence;
  return { label: s.sentence, meta: seedFacets(s), ...(s.parent === undefined ? {} : { prompt: `from: ${parent === undefined ? s.parent : cut(parent)}` }) };
}

function packet(v1: SeedsRead): Result<OpenPlan> {
  const b = v1.batch;
  const { part, seeds, no } = partOf(v1);
  if (no !== undefined) return err("refused", no);
  if (seeds.length === 0) return err("refused", `seeds batch ${b.id} holds no seed to judge`);
  const jobId = `seeds:${b.id}`;
  const run = partRunId(b.id, part);
  const minted = mintPacket({
    id: packetIdOf("seeds", run),
    lane: "image",
    source: "seeds",
    mode: "matrix-cull",
    state: "open",
    runId: run,
    title: `seeds ${b.id}${part === 1 ? "" : ` · part ${part}`}`,
    items: seeds.map((s) => ({ id: s.id, jobId, media: textRef(body(s)), row: s.id, grades: [] })),
  });
  if (!minted.ok) return minted;
  const rows: RowWords[] = seeds.map((s) => ({ id: s.id, label: s.sentence, group: "seeds" }));
  const children = seeds.filter((s) => s.parent !== undefined).length;
  return ok({
    packet: minted.value,
    initial: [],
    present: {
      items: Object.fromEntries(seeds.map((s) => [s.id, wordsOf(v1, s)])),
      rows,
      meta: `seeds · ${seeds.length}${children === 0 ? "" : ` · ${children} children`}${b.night === undefined ? "" : ` · night ${b.night}`}${b.dry ? " · dry" : ""}`,
    },
    // A seed is its words: nothing is fetched for a text cell.
    urls: Object.fromEntries(seeds.map((s) => [s.id, ""])),
    losses: [],
  });
}

/* ── consequence ───────────────────────────────────────────────────────────── */

const digestOf = (v1: SeedsRead): string => v1DigestOf({ source: "seeds", batch: v1.batch.id, dry: v1.batch.dry, seeds: v1.batch.seeds, committed: v1.batch.committed ?? null, part: v1.part ?? 1 });

function consequence(v1: SeedsRead, at: DecisionsAt): Result<Preview> {
  const b = v1.batch;
  const { part, seeds, no } = partOf(v1);
  if (no !== undefined) return err("refused", no);
  const ids = seeds.map((s) => s.id);
  const byCell = decisionMap(at.decisions);
  const file = { kind: "file" as const, target: `${v1.at}/${b.id}/batch.json` };
  const v1Digest = digestOf(v1);
  const writes = [];
  for (const id of ids) {
    const d = byCell.get(id);
    if (d?.verdict === "keep") writes.push({ ...file, candidate: id, detail: b.dry ? "kept · dry: nothing derives from it" : SEED_VERDICT.keep });
    else if (d?.verdict === "reject") writes.push({ ...file, candidate: id, detail: d.reasons.length > 0 ? `${SEED_VERDICT.reject} (${d.reasons.join(", ")})` : `${SEED_VERDICT.reject} · needs a reason` });
  }
  const left = ids.filter((id) => (byCell.get(id)?.verdict ?? null) === null).length;
  if (ids.length > 0 && left === ids.length) return err("refused", `seeds batch ${b.id}: nothing decided; ${left} undecided`);
  const what = part === 1 ? (left === 0 ? "committed" : "part 1") : left === 0 ? `part ${part} · committed` : `part ${part}`;
  writes.push({ ...file, detail: b.dry ? `${what} · dry: the verdicts only; nothing derives from it` : `${what}: every verdict, its reasons and its note` });
  if (left > 0) writes.push({ ...file, detail: remainderLine(left, packetIdOf("seeds", partRunId(b.id, part + 1))) });
  return ok({ v1Digest, consequence: buildConsequence(at, ids, { writes }, v1Digest) });
}

/* ── apply ─────────────────────────────────────────────────────────────────── */

/** What `batch.committed` holds after this outcome: every verdict on the packet's seeds, in batch order. */
export function seedCommitOf(batch: SeedBatch, items: readonly string[], decisions: readonly Decision[], at: string): SeedCommit {
  const byCell = decisionMap(decisions);
  const kept: string[] = [];
  const rejected: string[] = [];
  const reasons: Record<string, readonly string[]> = {};
  const notes: Record<string, string> = {};
  const open: string[] = [];
  let operator = false;
  for (const id of items) {
    const d = byCell.get(id);
    if (d === undefined || d.verdict === null) {
      open.push(id);
      continue;
    }
    if (d.by === "operator") operator = true;
    if (d.verdict === "keep") kept.push(id);
    else {
      rejected.push(id);
      if (d.reasons.length > 0) reasons[id] = [...d.reasons];
    }
    if (d.note !== undefined) notes[id] = d.note;
  }
  return { at, by: operator ? "operator" : "agent", kept, rejected, reasons, notes, dry: batch.dry, ...(open.length === 0 ? {} : { open }) };
}

async function apply(claim: ApplyClaim): Promise<Result<void>> {
  const done = committedOutcome(claim);
  if (!done.ok) return done;
  const runId = runIdOf(claim);
  if (!runId.ok) return runId;
  const { run: id, part } = splitPart(runId.value);
  const got = await v1Call(() => readSeedBatch(id));
  if (!got.ok) return got;
  const items = claim.packet.items.map((it) => it.id);
  const record = seedCommitOf(got.value, items, claim.decisions, new Date().toISOString());

  // This part over the batch's record (lib/foundry/scout/parts.ts mergePart): a redelivery is success, a seed v1
  // holds with another verdict is named and refused, a part out of turn is refused.
  const settled = (b: SeedBatch): Result<void> | undefined => {
    const m = mergePart<SeedCommit>(b.committed, record, part);
    if (m.kind === "write") return undefined;
    if (m.kind === "same") return ok(undefined);
    return err("refused", m.kind === "differ" ? `seeds batch ${id} was committed with other verdicts: ${m.why}` : `seeds batch ${id}: ${m.why}`);
  };
  const before = settled(got.value);
  if (before !== undefined) return before;
  const bare = record.rejected.filter((s) => (record.reasons[s] ?? []).length === 0);
  if (bare.length > 0) return err("refused", `seeds batch ${id}: ${bare.length} rejected need a reason: ${bare.join(", ")}`);
  const after = await v1Call(() =>
    mutateSeedBatch(id, (b) => {
      const m = mergePart<SeedCommit>(b.committed, record, part);
      return m.kind === "write" ? { ...b, committed: m.next } : b;
    }),
  );
  if (!after.ok) return after;
  return settled(after.value) ?? err("internal", `seeds batch ${id}: the commit record did not land`);
}

export const seedsAdapter: DecisionAdapter<SeedsRead> = { source: "seeds", partial: true, read, packet, consequence, apply };
