import { randomBytes as cryptoRandomBytes } from "node:crypto";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import type { Actor, EventData } from "@gt/domain/event";
import { SPEND_REQUEST_ID_RE, SPEND_TRANSITIONS, type SpendRequest, type SpendRequestState, type SpendSubject } from "@gt/domain/mcp";
import type { Receipt } from "@gt/domain/produce";

import { append } from "../events.ts";
import type { Reader, Row, Tx } from "../store.ts";
import { COLUMNS, jobIdsSchema, reasonsSchema, receiptSchema, rowSchema, spendSubjectSchema } from "./schema.ts";

// THE SPEND-REQUEST STORE (spark athena-control-mcp) - an agent's live launch that would spend, held for
// the operator's K or X on `pkt:spend:<day>`. The MCP door (app/_server/mcp/) files; the Board adapter
// (lib/decision/v1/sources/spend.ts) decides and launches. Every write appends ONE `spend-request.<state>` event (the subject kind; `spend.*` is the spend ledger's)
// with the actor it was handed, in the same transaction as the row: a move the ledger does not show did
// not happen. Transitions follow @gt/domain/mcp SPEND_TRANSITIONS; the table's trigger refuses the rest
// a second time (./schema.ts), so a hand edit cannot skip the operator either.

export type FileInput = { readonly subject: SpendSubject; readonly receipt: Receipt };

export type ListFilter = { readonly day?: string; readonly state?: SpendRequestState; readonly actorId?: string; readonly limit?: number };

export type Decision = { readonly verdict: "confirmed" } | { readonly verdict: "refused"; readonly reasons: readonly string[]; readonly note?: string };

const ID_BYTES = 6;
const SUBJECT_KIND = "spend-request";
/** A list with no limit still ends: the Board reads a day, the agent its recent asks. */
const DEFAULT_LIMIT = 200;

const subjectOf = (id: string) => ({ kind: SUBJECT_KIND, id });

/** A Result's value, or its error thrown: inside a read or a tx, a throw is the refusal. */
function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

// A row that will not parse is corruption; it refuses rather than reads as a smaller ask.
function toRequest(row: Row): SpendRequest {
  const r = must(parseAt("spend request row", rowSchema, row));
  const reasons = r.reasons === null ? undefined : must(parseJsonAt(`spend request ${r.id} reasons`, reasonsSchema, r.reasons));
  const jobIds = r.job_ids === null ? undefined : must(parseJsonAt(`spend request ${r.id} job_ids`, jobIdsSchema, r.job_ids));
  return {
    id: r.id,
    day: r.day,
    actor: { kind: r.actor_kind, id: r.actor_id },
    subject: must(parseJsonAt(`spend request ${r.id} subject`, spendSubjectSchema, r.subject)),
    receipt: must(parseJsonAt(`spend request ${r.id} receipt`, receiptSchema, r.receipt)),
    state: r.state,
    filedAt: r.filed_at,
    ...(reasons === undefined ? {} : { reasons }),
    ...(r.note === null ? {} : { note: r.note }),
    ...(r.decided_at === null ? {} : { decidedAt: r.decided_at }),
    ...(jobIds === undefined ? {} : { jobIds }),
    ...(r.failure === null ? {} : { failure: r.failure }),
  };
}

/** What the ledger says about the ask: the money, and what it was for. */
function requestedData(input: FileInput): EventData {
  const money = { kind: input.subject.kind, usd: input.receipt.totals.usd, unpriced: input.receipt.totals.unpriced };
  return input.subject.kind === "run" ? { ...money, lane: input.subject.input.lane } : { ...money, projectId: input.subject.id, rev: input.subject.rev };
}

/** File a request inside the caller's transaction; `t.at` stamps it and names its day. */
export function fileSpendRequest(t: Tx, input: FileInput, actor: Actor, random: (n: number) => Uint8Array = cryptoRandomBytes): SpendRequest {
  const subject = must(parseAt("spend request subject", spendSubjectSchema, input.subject));
  const receipt = must(parseAt("spend request receipt", receiptSchema, input.receipt));
  const id = `sr_${Buffer.from(random(ID_BYTES)).toString("hex")}`;
  if (!SPEND_REQUEST_ID_RE.test(id)) throw new AppError("internal", "spend request: the random source did not yield a well-formed id");
  const at = Date.parse(t.at);
  if (!Number.isFinite(at)) throw new AppError("internal", `spend request: "${t.at}" is not an instant`);
  const day = new Date(at).toISOString().slice(0, 10);
  t.run(
    "INSERT INTO spend_requests (id, day, actor_kind, actor_id, subject, receipt, state, filed_at) VALUES (?, ?, ?, ?, ?, ?, 'requested', ?)",
    id,
    day,
    actor.kind,
    actor.id,
    JSON.stringify(subject),
    JSON.stringify(receipt),
    t.at,
  );
  append(t, { actor, type: "spend-request.requested", subject: subjectOf(id), data: requestedData(input) });
  return mustRead(t, id);
}

export function readSpendRequest(r: Reader, id: string): SpendRequest | undefined {
  const row = r.get(`SELECT ${COLUMNS} FROM spend_requests WHERE id = ?`, id);
  return row === undefined ? undefined : toRequest(row);
}

/** Newest first. */
export function listSpendRequests(r: Reader, f: ListFilter = {}): readonly SpendRequest[] {
  const where: string[] = [];
  const params: string[] = [];
  const by = (column: string, value: string | undefined): void => {
    if (value === undefined) return;
    where.push(`${column} = ?`);
    params.push(value);
  };
  by("day", f.day);
  by("state", f.state);
  by("actor_id", f.actorId);
  const limit = f.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) throw new AppError("invalid", `spend requests: limit ${String(limit)} is not a positive whole number`);
  const clause = where.length === 0 ? "" : `WHERE ${where.join(" AND ")}`;
  // rowid breaks a tie between requests filed in one transaction (one `t.at`): the later insert is newer.
  return r.all(`SELECT ${COLUMNS} FROM spend_requests ${clause} ORDER BY filed_at DESC, rowid DESC LIMIT ?`, ...params, limit).map(toRequest);
}

function mustRead(r: Reader, id: string): SpendRequest {
  const s = readSpendRequest(r, id);
  if (s === undefined) throw new AppError("not-found", `no spend request ${id}`);
  return s;
}

/** The request at `id`, when it may become `next`; a conflict naming both states otherwise. */
function movable(t: Tx, id: string, next: SpendRequestState): SpendRequest {
  const s = mustRead(t, id);
  if (!SPEND_TRANSITIONS[s.state].includes(next)) throw new AppError("conflict", `${id} is ${s.state}; it cannot become ${next}`);
  return s;
}

/** requested -> confirmed | refused. A refusal carries at least one reason. */
export function decideSpendRequest(t: Tx, id: string, d: Decision, actor: Actor): SpendRequest {
  if (d.verdict === "refused" && d.reasons.length === 0) throw new AppError("invalid", `refusing ${id} needs at least one reason`);
  movable(t, id, d.verdict);
  if (d.verdict === "confirmed") {
    t.run("UPDATE spend_requests SET state = 'confirmed', decided_at = ? WHERE id = ?", t.at, id);
    append(t, { actor, type: "spend-request.confirmed", subject: subjectOf(id), data: {} });
  } else {
    t.run("UPDATE spend_requests SET state = 'refused', decided_at = ?, reasons = ?, note = ? WHERE id = ?", t.at, JSON.stringify(d.reasons), d.note ?? null, id);
    append(t, { actor, type: "spend-request.refused", subject: subjectOf(id), data: d.note === undefined ? { reasons: [...d.reasons] } : { reasons: [...d.reasons], note: d.note } });
  }
  return mustRead(t, id);
}

/** confirmed -> launched, with the jobs the launch made. */
export function markSpendLaunched(t: Tx, id: string, jobIds: readonly string[], actor: Actor): SpendRequest {
  movable(t, id, "launched");
  t.run("UPDATE spend_requests SET state = 'launched', job_ids = ? WHERE id = ?", JSON.stringify(jobIds), id);
  append(t, { actor, type: "spend-request.launched", subject: subjectOf(id), data: { jobIds: [...jobIds] } });
  return mustRead(t, id);
}

/** confirmed -> failed, with why the launch did not happen. */
export function markSpendFailed(t: Tx, id: string, failure: string, actor: Actor): SpendRequest {
  if (failure.trim() === "") throw new AppError("invalid", `marking ${id} failed needs the reason it did not launch`);
  movable(t, id, "failed");
  t.run("UPDATE spend_requests SET state = 'failed', failure = ? WHERE id = ?", failure, id);
  append(t, { actor, type: "spend-request.failed", subject: subjectOf(id), data: { failure } });
  return mustRead(t, id);
}
