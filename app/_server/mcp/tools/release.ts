import { z } from "zod";

import { STUDIO_EVENTS, studioSessionSchema } from "@gt/domain/audio.studio.events";
import type { StudioNodeOf } from "@gt/domain/audio.studio";
import { ok, type Result } from "@gt/domain/errors";
import type { McpFamily } from "@gt/domain/mcp";
import { releaseKind, type Release } from "@gt/domain/release";
import { PROBLEM_TEXT, releaseProblems } from "@gt/domain/release.problems";
import { RELEASE_ID_RE, RELEASE_PROPOSAL_FIELDS, TRACK_PROPOSAL_FIELDS, type ReleaseRecord } from "@gt/domain/release.record";
import { proposalInputSchema } from "@gt/domain/release.record.schema";
import { queryEvents } from "@gt/kernel/events-query";
import type { Store } from "@gt/kernel/store";

import { listReleases, proposeToRelease, readRelease } from "../../../../lib/release/store.ts";
import { readTakeFacts } from "../../../../lib/sound/suno/facts.ts";
import { foldStudioEvents, uploadedTakeIds } from "../../../(studio)/audio/studio/_port/ledger.ts";
import { STUDIO_SUBJECT_KIND } from "../../../(studio)/audio/studio/_live/say.ts";
import { studioHref } from "../../../(studio)/audio/studio/url.ts";
import { defineOp, READS, WRITES, type McpToolSpec, type Obj } from "../op.ts";

// THE RELEASE ON THE AGENT DOOR (spark studio-to-release WP2; registry agent-host-experience: journey-shaped ops,
// every op completes as text, the irreversible act stays in the product). The operator packages a studio track
// into a release on the studio's package stage; the agent beside them only PROPOSES field values:
//
//   release_read     (read) one release, or a conversation's releases: the release, its version, its live problems
//                    (with the store's rule text), its pending proposals, the fields still empty, and what the
//                    conversation knows to draft from (its Suno prompt cards, which ones the person kept, the
//                    facts of its takes) - and, in words, what the agent may do next.
//   release_propose  (write, act scope) proposals {path, value, source} against the version read, through the one
//                    release store (lib/release/store.ts). A stale version is answered in-band (read again); a value
//                    the release door refuses is refused with the door's sentence. Proposals only: nothing reaches
//                    the release until the operator accepts it, and keeping, releasing and scheduling are not ops.
//
// The pre-flight review is no op of its own: the agent posts an `audio_turn` with a `release` piece (the `card`
// release_read hands it) and its words.
//
// FAMILY: both ops belong in `read` / `launch`, but those families' published descriptions are at 238 and 240 of
// DESCRIPTION_MAX (app/_server/mcp/projection.ts FAMILY_WORDS + their op names), so either op there fails the
// registry's own rule. Until a `release` family exists (MCP_FAMILIES + FAMILY_WORDS), they ride one family together.
export const RELEASE_OPS_FAMILY: McpFamily = "release";

/** The most releases one read answers when it names neither a release nor a conversation (bounded-enumeration). */
export const RELEASE_READ_MAX = 10;
/** The newest studio events of a conversation one read folds (as audio_inbox). */
const SCAN = 1000;
/** The newest prompt cards one read hands the agent. */
const PROMPTS_MAX = 8;

type Prompt = { readonly promptId: string; readonly parent: string | null; readonly name: string | null; readonly style: string; readonly lyrics: string | null; readonly exclude: string | null; readonly instrumental: boolean; readonly model: string; readonly turnId: string };

/** What a conversation knows to draft a release from: its Suno prompt cards (newest last), the ones the person kept,
 *  and the takes its person uploaded. A conversation with no events reads as empty, never as an error. */
function sessionDraft(store: Store, session: string): Result<{ readonly prompts: readonly Prompt[]; readonly kept: readonly string[]; readonly uploaded: readonly string[] }> {
  const page = queryEvents(store, { type: [STUDIO_EVENTS.say, STUDIO_EVENTS.turn], subject: { kind: STUDIO_SUBJECT_KIND, id: session }, by: "seq", order: "desc", limit: SCAN });
  if (!page.ok) return page;
  const conv = foldStudioEvents(page.value.events.map((e) => ({ seq: e.seq, at: e.at, type: e.type, data: e.data }))).sessions[0];
  const turns = conv?.turns ?? [];
  const prompts: Prompt[] = [];
  const kept: string[] = [];
  for (const { turn } of turns) {
    if (turn.from === "user" && turn.verdict?.keep === true && !kept.includes(turn.verdict.promptId)) kept.push(turn.verdict.promptId);
    for (const n of turn.show) {
      if (n.kind !== "suno_prompt") continue;
      const p: StudioNodeOf<"suno_prompt"> = n;
      prompts.push({ promptId: p.promptId, parent: p.parent ?? null, name: p.name ?? null, style: p.style, lyrics: p.lyrics ?? null, exclude: p.exclude ?? null, instrumental: p.instrumental, model: p.model, turnId: turn.id });
    }
  }
  return ok({ prompts: prompts.slice(-PROMPTS_MAX), kept, uploaded: conv === undefined ? [] : uploadedTakeIds([conv]) });
}

const blank = (v: unknown): boolean => v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Every proposal path whose field is still empty (null, blank or an empty list), release fields first. */
export function emptyPaths(r: Release): string[] {
  const top: Readonly<Record<string, unknown>> = { ...r, "genre.primary": r.genre.primary, "genre.secondary": r.genre.secondary };
  const out: string[] = RELEASE_PROPOSAL_FIELDS.filter((f) => blank(top[f]));
  r.tracks.forEach((t, i) => {
    const row = t as unknown as Readonly<Record<string, unknown>>;
    for (const f of TRACK_PROPOSAL_FIELDS) if (blank(row[f])) out.push(`track:${i + 1}.${f}`);
  });
  return out;
}

/** The `release` piece for the pre-flight review, ready for audio_turn's show. */
export function releaseCard(rec: ReleaseRecord, blocks: number, warns: number): StudioNodeOf<"release"> {
  const r = rec.release;
  return { id: "release", kind: "release", releaseId: r.id, title: r.title.trim() === "" ? r.id : r.title, releaseKind: releaseKind(r.tracks), blocks, warns, status: r.status, pending: rec.pending.length };
}

/** One release as the agent reads it: the record, its live problems, what is empty, and what to draft from. */
async function readOne(store: Store, rec: ReleaseRecord, asked: string | null): Promise<Result<Obj>> {
  const r = rec.release;
  const problems = releaseProblems(r).map((p) => ({ ...p, rule: PROBLEM_TEXT[p.code] }));
  const blocks = problems.filter((p) => p.severity === "block").length;
  const warns = problems.length - blocks;
  const session = rec.sessionId ?? asked;
  const draft = session === null ? ok({ prompts: [], kept: [], uploaded: [] }) : sessionDraft(store, session);
  if (!draft.ok) return draft;
  const takeIds = [...new Set([...r.tracks.map((t) => t.takeId), ...draft.value.uploaded])];
  const facts = await readTakeFacts(takeIds);
  return ok({
    id: r.id,
    version: rec.version,
    sessionId: rec.sessionId,
    kind: releaseKind(r.tracks),
    release: r,
    problems,
    blocks,
    warns,
    pending: rec.pending,
    empty: emptyPaths(r),
    draftFrom: {
      session,
      prompts: draft.value.prompts,
      keptPrompts: draft.value.kept,
      takes: facts.ok ? facts.value : {},
      takesNote: facts.ok ? null : `the takes' facts could not be read: ${facts.error.message}`,
    },
    card: releaseCard(rec, blocks, warns),
    view: studioHref({ session, offline: false, source: "live", stage: "package", release: r.id }),
  });
}

const NEXT = [
  "Propose a value for an empty field with release_propose {id, version, proposals: [{path, value, source}]}, naming in source where the value came from (a prompt card's style, a take's measured tempo, the person's words).",
  "Propose only what the conversation knows: never invent a rights fact (vendor, plan tier, licence, songwriters); ask the person instead.",
  "Post the pre-flight review as an audio_turn whose show holds this release's card and whose text names the blocks.",
  "Accepting, keeping, releasing and scheduling are the operator's presses on the package stage; there is no op for them.",
];

type ReadArgs = { readonly id?: string | undefined; readonly session?: string | undefined };

export async function readReleases(store: Store, a: ReadArgs): Promise<Result<Obj>> {
  let records: readonly ReleaseRecord[];
  if (a.id !== undefined) {
    const one = await readRelease(a.id);
    if (!one.ok) return one;
    records = [one.value];
  } else {
    const all = await listReleases();
    if (!all.ok) return all;
    records = a.session === undefined ? all.value.slice(0, RELEASE_READ_MAX) : all.value.filter((r) => r.sessionId === a.session);
  }
  const releases: Obj[] = [];
  for (const rec of records) {
    const one = await readOne(store, rec, a.session ?? null);
    if (!one.ok) return one;
    releases.push(one.value);
  }
  const none = a.session === undefined ? "there is no release yet" : `conversation ${a.session} has no release yet`;
  return ok({
    releases,
    ...(releases.length === 0 ? { said: `${none}: the operator makes one with "Release this" on a studio track; an agent cannot.` } : {}),
    next: releases.length === 0 ? [] : NEXT,
  });
}

type ProposeArgs = { readonly id: string; readonly version: number; readonly proposals: readonly { readonly path: string; readonly value: unknown; readonly source: string }[]; readonly turnId?: string | undefined };

export async function proposeReleaseFields(a: ProposeArgs, by: Parameters<typeof proposeToRelease>[0]["by"]): Promise<Result<Obj>> {
  const out = await proposeToRelease({ id: a.id, version: a.version, proposals: a.proposals, turnId: a.turnId ?? null, by });
  if (!out.ok) return out;
  const { record, stale } = out.value;
  if (stale)
    return ok({
      id: a.id,
      stale: true,
      written: 0,
      version: record.version,
      said: `release ${a.id} is at version ${record.version}, not ${a.version}: nothing was written. Read it again with release_read and propose against version ${record.version}.`,
    });
  return ok({
    id: a.id,
    stale: false,
    written: a.proposals.length,
    version: record.version,
    pending: record.pending.length,
    said: `${a.proposals.length} proposal${a.proposals.length === 1 ? "" : "s"} wait on the operator's accept or dismiss; nothing reaches the release before that.`,
  });
}

const releaseId = z.string().regex(RELEASE_ID_RE, "a release id is rel- and 12 hex digits");
/** Proposals one call may carry: a release's fields and a few tracks' worth. */
export const PROPOSALS_MAX = 40;

export const RELEASE_OPS: readonly McpToolSpec[] = [
  defineOp({
    family: RELEASE_OPS_FAMILY,
    op: "release_read",
    title: "Read a release",
    description: "One release by id, or a conversation's releases: the release, its version, live problems, pending proposals, empty fields, and what the conversation knows to draft from (Suno prompts, take facts). Says what to propose next.",
    input: z.object({ id: releaseId.optional(), session: studioSessionSchema.optional() }).strict(),
    annotations: READS,
    writes: false,
    run: (a, { deps }) => {
      const s = deps.store();
      return s.ok ? readReleases(s.value, a) : s;
    },
  }),
  defineOp({
    family: RELEASE_OPS_FAMILY,
    op: "release_propose",
    title: "Propose release fields",
    description: "Propose values for a release's fields ({path, value, source}) against the version release_read gave. Proposals only: the operator accepts or dismisses each. A stale version writes nothing; read again.",
    input: z.object({ id: releaseId, version: z.number().int().positive(), proposals: z.array(proposalInputSchema).min(1).max(PROPOSALS_MAX), turnId: z.string().min(1).max(200).optional() }).strict(),
    annotations: WRITES,
    writes: true,
    run: (a, { agent }) => proposeReleaseFields(a, agent.actor),
  }),
];
