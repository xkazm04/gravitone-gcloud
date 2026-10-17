// THE LESSON DOOR (Phase 6, L65) - a lesson drafted (by the text engine, or by hand from the
// map) and a lesson CONFIRMED, which is the only write. v1's three doors absorbed:
// lib/sound/hunt.ts `draftHuntLesson` (POST /api/sound/hunts/[id]/lesson: a draft, nothing
// stored), POST /api/sound/lessons (a human's confirm, appended to the ledger) and the hunt's
// `lessonId` PATCH (the link, in a second request that could fail after the first landed).
//
// THE LAW (agent-memory memory-governance, pending-beliefs-live-apart): a lesson is a belief the
// next hunt is briefed with (lib/sound/hunt.ts huntPrompt quotes the confirmed ones), so it is
// never written without the operator's confirm. An engine draft is not stored anywhere - not
// even as "pending" - it lives in the signer's form until they sign or discard it, so no reader
// can ever recall an unconfirmed lesson as settled.
//
// Upgraded:
//   · the evidence is counted by THIS door from the hunt's map at confirm time (one count for
//     the engine and the hand paths, @gt/ui lesson.ts), and a confirm signed over a count that
//     has since moved is refused with both counts (hitl-approval resume-after-decision);
//   · the append, the hunt's link and the ledger event are one gesture: the lesson and the link
//     in ONE sound-store transaction, then the event keyed by the signer's op id - a retried
//     confirm finds the lesson it wrote (its id is derived from the op) and writes nothing new;
//   · the ledger file is written through the store seam (lib/sound/store.ts `withStore`, which
//     honours SOUND_LEDGER_PATH) and knowledge/audio/ is left to `pipeline/sound.mts knowledge`.
//
// THE CALL SHAPE (L66 drafts lessons from a strengths cell through this same door): build the
// proposal with @gt/ui lesson.ts `cellLesson(cell)` (source "triage", huntId null, the floor
// n >= 3 held there), let the operator write the claim, then
//   confirmLesson(kernel, { ...proposal, claim, opId }, actor, now)
// - or, from a client island, the Server Action `confirmLessonAct` in
// app/(studio)/audio/_lessons/acts.ts with the same object. A triage lesson's evidence is the
// cell's, as handed; a hunt lesson's is recounted here.
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { appendOnce, hasKey } from "@gt/kernel/ingest";
import type { Store } from "@gt/kernel/store";
import { reconcile } from "@gt/ui/components/audio/hunt.ts";
import { claimProblem, evidenceKey, evidenceOf, handLesson, huntLessonBlock, type LessonProposal } from "@gt/ui/components/audio/lesson.ts";

import { fill, LESSON_SCHEMA, promptFile, type ReasonFn } from "./hunt.ts";
import { rubricMean } from "./ledger.ts";
import { readHunts, readLedger, readTakes, SoundError, withStore } from "./store.ts";
import { TECHNIQUES, type Hunt, type Lesson, type ProviderId, type SoundKind, type SoundTake } from "./types.ts";

export const LESSON_OP_RE = /^[a-z0-9]{6,40}$/;
const PROVIDERS: readonly ProviderId[] = ["elevenlabs", "suno", "local"];
const words = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function inStore<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof SoundError) return err(e.status === 404 ? "not-found" : e.status === 400 ? "invalid" : e.status === 409 ? "conflict" : "unavailable", e.message);
    return err("internal", words(e), { cause: e });
  }
}

/* ── the hunt's evidence, counted here ──────────────────────────────────── */

type Counted = { readonly hunt: Hunt; readonly proposal: LessonProposal; readonly takes: readonly SoundTake[] };

/** The hunt squared with its takes, and the hand lesson its map supports (with the winners' rubric mean). */
async function counted(huntId: string): Promise<Result<Counted>> {
  return inStore(async () => {
    const [{ hunts }, { takes }] = await Promise.all([readHunts(), readTakes()]);
    const h = hunts.find((x) => x.id === huntId);
    if (h === undefined) return err("not-found", `no hunt ${huntId}`);
    const hunt: Hunt = { ...h, nodes: reconcile(h.id, h.nodes, takes) };
    const block = huntLessonBlock(hunt.nodes);
    if (block !== null) return err("refused", block);
    const cited = new Set(evidenceOf(hunt.nodes).takeIds);
    const means = takes.filter((t) => cited.has(t.id)).flatMap((t) => {
      const m = rubricMean(t.kind, t.ratings);
      return m === null ? [] : [m];
    });
    const meanScore = means.length === 0 ? null : Math.round((means.reduce((a, b) => a + b, 0) / means.length) * 100) / 100;
    return ok({ hunt, takes, proposal: handLesson(hunt, meanScore) });
  });
}

/* ── the draft ──────────────────────────────────────────────────────────── */

export type LessonDraft = {
  readonly proposal: LessonProposal;
  /** What the signer must send back: the evidence the draft was counted over. */
  readonly key: string;
  /** The engine's provenance, when it drafted the claim. */
  readonly draftedBy: string | null;
  /** The engine's own failure, verbatim, when it could not: the claim is then the signer's. */
  readonly engineError: string | null;
};

function resultsOf(h: Hunt, takes: readonly SoundTake[]): string {
  const byId = new Map(takes.map((t) => [t.id, t] as const));
  return h.nodes
    .filter((n) => n.state === "rendered")
    .flatMap((n) =>
      n.takeIds.flatMap((id) => {
        const t = byId.get(id);
        if (t === undefined) return [];
        const mean = rubricMean(t.kind, t.ratings);
        const call = n.winner ? "WINNER" : t.verdict === "rejected" ? `rejected${t.reasons.length > 0 ? ` (${t.reasons.join(", ")})` : ""}` : t.verdict;
        return [`- [${n.axis}] ${n.label} · ${n.provider} · ${n.technique.join("+") || "no technique"} · ${call}${mean === null ? "" : ` · mean ${Math.round(mean * 10) / 10}`}\n  prompt: ${t.prompt || n.prompt}`];
      }),
    )
    .join("\n");
}

const strOf = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const field = (v: unknown, k: string): unknown => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Readonly<Record<string, unknown>>)[k] : undefined);

/**
 * A hunt's lesson, drafted. The engine writes the claim, the techniques (held to the kind's
 * list) and the provider; the evidence is the map's. An engine that fails is not the draft
 * failing: the hand draft comes back with the engine's words beside it.
 */
export async function draftLesson(huntId: string, reason: ReasonFn): Promise<Result<LessonDraft>> {
  const c = await counted(huntId);
  if (!c.ok) return c;
  const { hunt, takes, proposal } = c.value;
  const key = evidenceKey(proposal.evidence);
  try {
    const sections = await promptFile("SOUND-LESSON-PROMPT.md");
    const prompt = fill(sections["shared"] ?? "", { KIND: hunt.kind === "music" ? "music" : "sound effect", IDEA: hunt.idea, RESULTS: resultsOf(hunt, takes), TECHNIQUES: TECHNIQUES[hunt.kind].join(", ") });
    const out = await reason({ turn: "sound-lesson", prompt, schema: LESSON_SCHEMA });
    const claim = strOf(field(out.json, "claim"), 600);
    if (claim === "") return ok({ proposal, key, draftedBy: null, engineError: "the text engine drafted an empty claim" });
    const known = new Set(TECHNIQUES[hunt.kind]);
    const raw = field(out.json, "technique");
    const technique = Array.isArray(raw) ? [...new Set(raw.filter((t): t is string => typeof t === "string" && known.has(t.trim())).map((t) => t.trim()))] : [...proposal.technique];
    const named = PROVIDERS.find((p) => p === field(out.json, "provider"));
    return ok({ proposal: { ...proposal, claim, technique, provider: named ?? proposal.provider }, key, draftedBy: `${out.provenance.provider} · ${out.provenance.model} · ${out.provenance.rung}`, engineError: null });
  } catch (e) {
    return ok({ proposal, key, draftedBy: null, engineError: words(e) });
  }
}

/** The hand draft alone, without asking the engine (the form's "write it myself"). */
export async function handDraft(huntId: string): Promise<Result<LessonDraft>> {
  const c = await counted(huntId);
  return c.ok ? ok({ proposal: c.value.proposal, key: evidenceKey(c.value.proposal.evidence), draftedBy: null, engineError: null }) : c;
}

/* ── the confirm ────────────────────────────────────────────────────────── */

export type ConfirmInput = LessonProposal & { readonly opId: string; readonly key?: string };
export type Confirmed = { readonly lesson: Lesson; readonly already: boolean; readonly recorded: boolean };

const lessonIdOf = (opId: string): string => `ls-${opId}`;

/** The signer's lesson, held to the contract and (for a hunt) to the evidence counted now. */
async function settle(input: ConfirmInput): Promise<Result<Omit<Lesson, "id" | "confirmedAt">>> {
  const problem = claimProblem(input.claim);
  if (problem !== null) return err("invalid", problem);
  const kind: SoundKind = input.kind;
  const known = new Set(TECHNIQUES[kind]);
  const technique = [...new Set(input.technique.map((t) => t.trim()).filter((t) => known.has(t)))];
  const provider = PROVIDERS.find((p) => p === input.provider) ?? null;
  if (input.source === "triage" || input.huntId === null) {
    if (input.evidence.n < 1) return err("invalid", "a lesson stands on at least one judged take");
    return ok({ kind, source: input.source, provider, huntId: null, claim: input.claim.trim(), technique, evidence: { ...input.evidence, takeIds: [...input.evidence.takeIds] } });
  }
  const c = await counted(input.huntId);
  if (!c.ok) return c;
  if (c.value.hunt.kind !== kind) return err("invalid", `hunt ${input.huntId} is ${c.value.hunt.kind}, not ${kind}`);
  const now = c.value.proposal.evidence;
  if (input.key !== undefined && input.key !== evidenceKey(now)) {
    return err("conflict", `the hunt moved since this draft: it was signed over n=${input.evidence.n}, ${input.evidence.takeIds.length} cited; it now stands on n=${now.n}, ${now.takeIds.length} cited - draft it again`);
  }
  return ok({ kind, source: "hunt", provider, huntId: input.huntId, claim: input.claim.trim(), technique, evidence: { ...now, takeIds: [...now.takeIds] } });
}

/**
 * Write a confirmed lesson: appended to the ledger and linked to its hunt in ONE store
 * transaction, then the `lesson.confirmed` event. A replayed op answers the lesson it wrote.
 */
export async function confirmLesson(kernel: Store, input: ConfirmInput, actor: Actor, now: Date): Promise<Result<Confirmed>> {
  if (!LESSON_OP_RE.test(input.opId)) return err("invalid", "a lesson confirm carries the signer's op id");
  const key = `audio-lesson:${input.opId}`;
  const id = lessonIdOf(input.opId);
  const seen = hasKey(kernel, key);
  if (!seen.ok) return seen;
  if (seen.value) {
    const had = await inStore(async () => ok((await readLedger()).lessons.find((l) => l.id === id)));
    if (!had.ok) return had;
    if (had.value !== undefined) return ok({ lesson: had.value, already: true, recorded: false });
  }
  const body = await settle(input);
  if (!body.ok) return body;
  const landed = await inStore(() =>
    withStore(async (tx): Promise<Result<{ lesson: Lesson; already: boolean }>> => {
      const ledger = await tx.get("ledger");
      const had = ledger.lessons.find((l) => l.id === id);
      if (had !== undefined) return ok({ lesson: had, already: true });
      const lesson: Lesson = { id, ...body.value, confirmedAt: now.toISOString() };
      ledger.lessons.push(lesson);
      tx.touch("ledger");
      if (lesson.huntId !== null) {
        const file = await tx.get("hunts");
        const h = file.hunts.find((x) => x.id === lesson.huntId);
        if (h === undefined) return err("not-found", `no hunt ${lesson.huntId}`);
        h.lessonId = lesson.id;
        tx.touch("hunts");
      }
      return ok({ lesson, already: false });
    }),
  );
  if (!landed.ok) return landed;
  const l = landed.value.lesson;
  const ev = kernel.tx((t) =>
    appendOnce(t, { actor, type: "lesson.confirmed", lane: "audio", key, subject: { kind: "lesson", id: l.id }, data: { kind: l.kind, source: l.source, claim: l.claim, n: l.evidence.n, ...(l.huntId === null ? {} : { huntId: l.huntId }), ...(l.provider === null ? {} : { provider: l.provider }) } }),
  );
  if (!ev.ok) return err(ev.error.code, `the ledger took the lesson, the event log did not: ${ev.error.message} - confirm again to record it`);
  return ok({ lesson: l, already: landed.value.already, recorded: ev.value.appended });
}

/** The confirmed lessons of a kind, newest first. */
export async function listLessons(kind: SoundKind): Promise<Result<readonly Lesson[]>> {
  return inStore(async () => ok((await readLedger()).lessons.filter((l) => l.kind === kind).sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))));
}
