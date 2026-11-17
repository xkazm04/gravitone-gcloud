// THE RELEASE RECORD, THE STORE'S HALF (spark studio-to-release WP1). The table, its triggers and the row door are
// ./schema.ts; what a release may hold is the release door (@gt/domain/release.schema) and what a record may hold is
// the record door (@gt/domain/release.record.schema). Nothing is written that the door would not read back.
//
// Every write is one transaction: the row and ONE `release.*` event (RELEASE_EVENTS) carrying the actor it was handed.
// COMPARE-AND-SWAP: a write names the version it read. When the stored version is another, nothing is written and the
// answer is the record as stored, `stale: true` - the writer re-bases on it rather than overwriting what the agent (or
// another tab) wrote in between. The UPDATE itself carries the version too, and the table refuses a write that does
// not move it by exactly one, so a second writer that slipped past the read still cannot land.
//
// WHO MAY DO WHAT is the store's, whoever asks: an agent only PROPOSES (a field, a value, its source); making a release,
// editing it and answering a proposal are the operator's (owner, studio-to-release: the agent can NOT keep or release).
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import type { Release } from "@gt/domain/release";
import { RELEASE_ID_RE, type ProposalPath, type ReleaseEventType, type ReleaseProposal, type ReleaseRecord } from "@gt/domain/release.record";
import { applyProposal, parseReleaseRecord, proposalInputSchema, releaseProposalSchema } from "@gt/domain/release.record.schema";
import { releaseSchema } from "@gt/domain/release.schema";
import { z } from "zod";

import { append } from "../events.ts";
import type { Reader, Row, Tx } from "../store.ts";
import { RELEASE_COLUMNS, releaseRowSchema } from "./schema.ts";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

const pendingSchema = z.array(releaseProposalSchema);
/** The door's own schema, its JSON value read as `unknown` (z.json()'s recursive type is too deep to instantiate here). */
const proposalInput: z.ZodType<{ readonly path: string; readonly value: unknown; readonly source: string }> = proposalInputSchema;

function toRecord(row: Row): ReleaseRecord {
  const h = must(parseAt("release row", releaseRowSchema, row));
  const record = must(
    parseReleaseRecord({
      release: must(parseJsonAt(`release ${h.id}`, releaseSchema, h.release)),
      version: h.version,
      sessionId: h.session_id,
      createdAt: h.created_at,
      updatedAt: h.updated_at,
      pending: must(parseJsonAt(`release ${h.id} pending`, pendingSchema, h.pending)),
    }),
  );
  return record as ReleaseRecord;
}

export function readReleaseRecord(r: Reader, id: string): ReleaseRecord | undefined {
  const row = r.get(`SELECT ${RELEASE_COLUMNS} FROM releases WHERE id = ?`, id);
  return row === undefined ? undefined : toRecord(row);
}

/** Every release, newest first. */
export function listReleaseRecords(r: Reader): readonly ReleaseRecord[] {
  return r.all(`SELECT ${RELEASE_COLUMNS} FROM releases ORDER BY created_at DESC, rowid DESC`).map(toRecord);
}

const mustHave = (r: Reader, id: string): ReleaseRecord => {
  const rec = readReleaseRecord(r, id);
  if (rec === undefined) throw new AppError("not-found", `release: no ${id}`);
  return rec;
};

/** The operator's acts on a release; an agent proposes and nothing else. */
function operatorOnly(actor: Actor, what: string): void {
  if (actor.kind === "agent") throw new AppError("refused", `release: an agent proposes a release's fields; ${what} is the operator's (${actor.kind} ${actor.id} tried)`);
}

const subject = (id: string) => ({ kind: "release", id });

/** The whole record held to the record door before it is written: what lands is what reads back. */
function held(next: ReleaseRecord): ReleaseRecord {
  return must(parseReleaseRecord(next)) as ReleaseRecord;
}

export type CreateInput = { readonly release: Release; readonly sessionId: string | null };

/** A new release at version 1, its session fixed. Emits `release.created` with `data` (the takes it was made from). */
export function createReleaseIn(t: Tx, input: CreateInput, actor: Actor, data: EventData = {}): ReleaseRecord {
  operatorOnly(actor, "making a release");
  const id = input.release.id;
  if (!RELEASE_ID_RE.test(id)) throw new AppError("invalid", `release: ${JSON.stringify(id).slice(0, 40)} is not a release id (rel- and 12 hex)`);
  if (readReleaseRecord(t, id) !== undefined) throw new AppError("conflict", `release: ${id} already exists`);
  const record = held({ release: input.release, version: 1, sessionId: input.sessionId, createdAt: t.at, updatedAt: t.at, pending: [] });
  t.run(
    `INSERT INTO releases (${RELEASE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    1,
    record.sessionId,
    record.release.status,
    JSON.stringify(record.release),
    "[]",
    t.at,
    t.at,
  );
  append(t, { actor, type: "release.created" satisfies ReleaseEventType, subject: subject(id), data: { sessionId: record.sessionId, title: record.release.title, ...data } });
  return mustHave(t, id);
}

export type ReleaseWrite = { readonly record: ReleaseRecord; readonly stale: boolean };

/** The CAS write: the next release and pending list at version + 1, and its one event. */
function writeIn(t: Tx, stored: ReleaseRecord, next: { readonly release: Release; readonly pending: readonly ReleaseProposal[] }, type: ReleaseEventType, data: EventData, actor: Actor): ReleaseWrite {
  const id = stored.release.id;
  if (next.release.id !== id) throw new AppError("invalid", `release: a write to ${id} cannot make it ${next.release.id}`);
  const record = held({ ...stored, release: next.release, pending: next.pending, version: stored.version + 1, updatedAt: t.at });
  const w = t.run(
    "UPDATE releases SET version = ?, status = ?, release = ?, pending = ?, updated_at = ? WHERE id = ? AND version = ?",
    record.version,
    record.release.status,
    JSON.stringify(record.release),
    JSON.stringify(record.pending),
    t.at,
    id,
    stored.version,
  );
  if (w.changes !== 1) throw new AppError("conflict", `release: ${id} moved past version ${stored.version} while it was written`);
  append(t, { actor, type, subject: subject(id), data: { version: record.version, ...data } });
  return { record: mustHave(t, id), stale: false };
}

type Versioned = { readonly id: string; readonly version: number };

/** The stored record when the write may go ahead, or the stale answer when it may not. */
function current(t: Tx, input: Versioned): { readonly stored: ReleaseRecord; readonly stale: ReleaseWrite | null } {
  const stored = mustHave(t, input.id);
  return { stored, stale: stored.version === input.version ? null : { record: stored, stale: true } };
}

export type ProposeInput = Versioned & {
  readonly proposals: readonly { readonly path: string; readonly value: unknown; readonly source: string }[];
  readonly turnId: string | null;
};

/**
 * The agent's proposals, appended to `pending` (an id and the store's instant each). Every one is held to the release
 * door by applying it to the stored release: one the release could not hold refuses the whole call with the door's
 * sentence, and nothing is written. Nothing reaches the release itself. Emits `release.proposed`.
 */
export function proposeIn(t: Tx, input: ProposeInput, actor: Actor): ReleaseWrite {
  if (input.proposals.length === 0) throw new AppError("invalid", "release: a proposal call carries at least one proposal");
  const { stored, stale } = current(t, input);
  if (stale !== null) return stale;
  const version = stored.version + 1;
  const made = input.proposals.map((raw, i): ReleaseProposal => {
    const p = must(parseAt(`proposal ${i + 1}`, proposalInput, raw));
    const path = p.path as ProposalPath;
    must(applyProposal(stored.release, path, p.value));
    return { id: `p-${version}-${i + 1}`, path, value: p.value, source: p.source, turnId: input.turnId, at: t.at };
  });
  const data = { turnId: input.turnId, proposals: made.map((p) => ({ id: p.id, path: p.path, source: p.source })) };
  return writeIn(t, stored, { release: stored.release, pending: [...stored.pending, ...made] }, "release.proposed", data, actor);
}

export type AnswerInput = Versioned & { readonly proposalIds: readonly string[] };

function picked(stored: ReleaseRecord, ids: readonly string[]): readonly ReleaseProposal[] {
  if (ids.length === 0) throw new AppError("invalid", "release: name at least one pending proposal");
  if (new Set(ids).size !== ids.length) throw new AppError("invalid", "release: a proposal is named twice");
  return ids.map((id) => {
    const p = stored.pending.find((x) => x.id === id);
    if (p === undefined) throw new AppError("not-found", `release: ${stored.release.id} has no pending proposal ${id}`);
    return p;
  });
}

/**
 * Accept pending proposals, in the order named: each value is applied through the release door (refused with its
 * sentence when the release can no longer hold it - a track since removed, say - and then nothing is written), and
 * each accepted proposal leaves `pending`. Emits `release.accepted`.
 */
export function acceptIn(t: Tx, input: AnswerInput, actor: Actor): ReleaseWrite {
  operatorOnly(actor, "accepting a proposal");
  const { stored, stale } = current(t, input);
  if (stale !== null) return stale;
  const chosen = picked(stored, input.proposalIds);
  const release = chosen.reduce((r, p) => must(applyProposal(r, p.path, p.value)), stored.release);
  const gone = new Set(input.proposalIds);
  const data = { proposals: chosen.map((p) => ({ id: p.id, path: p.path })) };
  return writeIn(t, stored, { release, pending: stored.pending.filter((p) => !gone.has(p.id)) }, "release.accepted", data, actor);
}

/** Dismiss pending proposals: they leave `pending`, the release is untouched. Emits `release.dismissed`. */
export function dismissIn(t: Tx, input: AnswerInput, actor: Actor): ReleaseWrite {
  operatorOnly(actor, "dismissing a proposal");
  const { stored, stale } = current(t, input);
  if (stale !== null) return stale;
  const chosen = picked(stored, input.proposalIds);
  const gone = new Set(input.proposalIds);
  const data = { proposals: chosen.map((p) => ({ id: p.id, path: p.path })) };
  return writeIn(t, stored, { release: stored.release, pending: stored.pending.filter((p) => !gone.has(p.id)) }, "release.dismissed", data, actor);
}

export type EditInput = Versioned & {
  /** The operator's edit, run on the STORED release once the version is known to be current. */
  readonly edit: (r: Release) => Release;
  /** `release.scheduled` for the Schedule press; `release.edited` for every other edit. */
  readonly type: "release.edited" | "release.scheduled";
  readonly data: EventData;
};

/** One edit, the release re-checked whole through the door before it lands. Emits `release.edited` or `release.scheduled`. */
export function editIn(t: Tx, input: EditInput, actor: Actor): ReleaseWrite {
  operatorOnly(actor, input.type === "release.scheduled" ? "scheduling a release" : "editing a release");
  const { stored, stale } = current(t, input);
  if (stale !== null) return stale;
  const next = must(parseAt(`release ${stored.release.id}`, releaseSchema, input.edit(stored.release))) as Release;
  return writeIn(t, stored, { release: next, pending: stored.pending }, input.type, input.data, actor);
}
