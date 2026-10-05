// THE LEDGER — what the team learned about prompting, as a git-tracked file.
//
// pipeline/sound/ledger.json holds two lists and nothing else:
//
//   verdicts   one row per JUDGED, NON-FIXTURE take (a bare version is not
//              one — see "A VERSION IS NOT A VERDICT"): what it was briefed with
//              (provider, op, technique, terms, the prompt itself) and what the
//              person decided (verdict, rubric, defect codes). Upserted every
//              time a take is judged; removed if it is un-judged.
//   lessons    every lesson a human confirmed, append-only.
//
// WHY A FILE IN GIT AND NOT A ROW IN THE STORE. The store (foundry-out/sound/)
// is this machine's: its bytes are large and gitignored. The ledger is small,
// and it is the part that has to travel — a lesson learned on one machine is a
// prompt rule on every machine, and `npx tsx pipeline/sound.mts knowledge`
// regenerates knowledge/audio/ from it anywhere the repo is checked out. A
// verdict row therefore carries everything the knowledge needs WITHOUT the
// bytes: the prompt and the terms, not a pointer to a file that is not there.
//
// FIXTURES NEVER ENTER. The 160 contest rows are design samples whose verdicts
// nobody gave (app/library/audio/audioSeed.ts: "NOTHING HERE IS A REAL TAKE"),
// and a knowledge doc that learned from them would be measuring a fixture
// generator. The exclusion is here, at the one write, rather than at every read.
//
// A VERSION IS NOT A VERDICT. A file brought back from Suno's studio against a
// card on Arrangement's board (origin "suno-return", parentId = the card's
// take) is filed `kept` because the board can only hold kept takes — not
// because anybody judged it. Its parent was the judgement; counting the return
// too would score one decision twice, and score it for Suno, which only
// remastered what another provider made. THE RULE (isVersionOnly): a
// suno-return WITH a parent and with no judgement of its own — no rubric score,
// no defect code — gets no ledger row, whatever its verdict field says. The
// moment a person scores it or names a defect on it, it is a judged take in its
// own right and enters like any other. A return with no parent (a Hunt's Suno
// leaf coming back) answers a brief of its own and always counts.
//
// Every write happens inside a store transaction (./store.ts withStore), so the
// ledger and the take it describes cannot disagree after a crash.

import type { DefectCode, Lesson, ProviderId, SoundKind, SoundOp, SoundTake, SoundTerms, TakeOrigin } from "./types";
import { RUBRIC } from "./types";
import { mintId, SoundError, type StoreTx } from "./store";

export interface LedgerVerdict {
  takeId: string;
  kind: SoundKind;
  provider: ProviderId;
  op: SoundOp;
  origin: TakeOrigin;
  technique: string[];
  terms: SoundTerms;
  prompt: string;
  negative: string | null;
  durationS: number | null;
  verdict: "kept" | "rejected";
  ratings: Record<string, number | null>;
  /** The take's rubric mean; null when nothing was scored. */
  score: number | null;
  reasons: DefectCode[];
  huntId: string | null;
  /** The take this one is a version of (closeout r4, additive). Rows written
   *  before the field read as null. */
  parentId?: string | null;
  judgedAt: string;
}

/** True when a take is a version of an already-judged take and carries no
 *  judgement of its own (the rule above). Pure, so the ledger write and the
 *  insights read apply the SAME test — the second one to the rows a hand edit
 *  or an older build may have left in the file. */
export function isVersionOnly(t: {
  origin: TakeOrigin;
  parentId?: string | null;
  ratings: Record<string, number | null> | null | undefined;
  reasons: readonly DefectCode[] | null | undefined;
}): boolean {
  if (t.origin !== "suno-return" || !t.parentId) return false;
  const scored = Object.values(t.ratings ?? {}).some((v) => typeof v === "number" && Number.isFinite(v));
  return !scored && !(t.reasons ?? []).length;
}

/**
 * A take's rubric mean: the mean of the scores it carries on ITS kind's rubric
 * (types.ts RUBRIC). Null when none of those dimensions is scored.
 *
 * A bag that carries none of its kind's keys but does carry numbers — a take
 * the Library scored before the sfx rubric existed — is averaged over what it
 * has, rather than reading as unscored: the person did score it, and an absent
 * number would understate what the ledger knows.
 */
export function rubricMean(kind: SoundKind, ratings: Record<string, number | null> | null | undefined): number | null {
  if (!ratings) return null;
  const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
  let vals = RUBRIC[kind].map((k) => ratings[k]).filter(valid);
  if (!vals.length) vals = Object.values(ratings).filter(valid);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function verdictRow(t: SoundTake): LedgerVerdict | null {
  if (t.origin === "fixture" || t.verdict === "unjudged" || isVersionOnly(t)) return null;
  return {
    takeId: t.id,
    kind: t.kind,
    provider: t.provider,
    op: t.op,
    origin: t.origin,
    technique: [...t.technique],
    terms: {
      genre: [...t.terms.genre],
      mood: [...t.terms.mood],
      instrument: [...t.terms.instrument],
      sfxCategory: t.terms.sfxCategory,
    },
    prompt: t.prompt,
    negative: t.negative,
    durationS: t.durationS,
    verdict: t.verdict,
    ratings: { ...t.ratings },
    score: rubricMean(t.kind, t.ratings),
    reasons: [...t.reasons],
    huntId: t.huntId,
    parentId: t.parentId,
    judgedAt: t.judgedAt ?? new Date().toISOString(),
  };
}

/** Bring the ledger in line with one take's current state, inside `tx`.
 *  A judged non-fixture take is upserted; anything else is removed. Rows stay
 *  sorted by judgedAt then id, so a git diff of the file shows the new
 *  judgement and not a reshuffle. */
export async function syncVerdict(tx: StoreTx, t: SoundTake): Promise<void> {
  const ledger = await tx.get("ledger");
  const row = verdictRow(t);
  const at = ledger.verdicts.findIndex((v) => v.takeId === t.id);
  if (!row && at === -1) return;
  if (row) {
    if (at === -1) ledger.verdicts.push(row);
    else ledger.verdicts[at] = row;
  } else ledger.verdicts.splice(at, 1);
  ledger.verdicts.sort((a, b) => a.judgedAt.localeCompare(b.judgedAt) || a.takeId.localeCompare(b.takeId));
  tx.touch("ledger");
}

const PROVIDERS: readonly ProviderId[] = ["elevenlabs", "suno", "local"];

/** A lesson as a caller hands it over, held to the contract before it is kept.
 *  The claim is the whole point of a lesson; without one there is nothing to
 *  learn and the write is refused (400), never stored empty. */
export function parseLessonInput(body: unknown): Omit<Lesson, "id" | "confirmedAt"> {
  if (!body || typeof body !== "object") throw new SoundError("a lesson must be a JSON object", 400);
  const b = body as Record<string, unknown>;
  const claim = typeof b.claim === "string" ? b.claim.trim() : "";
  if (!claim) throw new SoundError("a lesson needs a claim: one sentence, \"when X, brief Y, because Z\"", 400);
  if (claim.length > 600) throw new SoundError("a lesson's claim is one sentence; this one is over 600 characters", 400);
  const kind = b.kind === "sfx" ? "sfx" : b.kind === "music" ? "music" : null;
  if (!kind) throw new SoundError('a lesson needs a kind: "music" or "sfx"', 400);
  const source = b.source === "hunt" ? "hunt" : "triage";
  const provider = PROVIDERS.find((p) => p === b.provider) ?? null;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : []);
  const ev = (b.evidence && typeof b.evidence === "object" ? b.evidence : {}) as Record<string, unknown>;
  const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    kind,
    source,
    provider,
    huntId: typeof b.huntId === "string" && b.huntId ? b.huntId : null,
    claim,
    technique: strs(b.technique),
    evidence: {
      n: typeof ev.n === "number" && Number.isFinite(ev.n) && ev.n >= 0 ? Math.round(ev.n) : 0,
      keepRate: numOrNull(ev.keepRate),
      meanScore: numOrNull(ev.meanScore),
      takeIds: strs(ev.takeIds),
    },
  };
}

/** Append a confirmed lesson, inside `tx`. `confirmedAt` is stamped here: a
 *  lesson reaches this function only from a human's confirm (the lessons route,
 *  or the CLI with the operator at the terminal) — never from a model turn. */
export async function appendLesson(tx: StoreTx, input: Omit<Lesson, "id" | "confirmedAt">, now = new Date()): Promise<Lesson> {
  const ledger = await tx.get("ledger");
  const lesson: Lesson = { id: mintId("ls"), ...input, confirmedAt: now.toISOString() };
  ledger.lessons.push(lesson);
  tx.touch("ledger");
  return lesson;
}
