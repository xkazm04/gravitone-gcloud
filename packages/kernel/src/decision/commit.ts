import { z } from "zod";
import { checkEditPlan, EDIT_DIRECTIVES, type EditPlan } from "@gt/domain/board";
import { parseJsonAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { candidateIdSchema, type PacketId } from "@gt/domain/ids";
import { packetMachine } from "@gt/domain/packet";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { Tx } from "../store.ts";
import { consequenceToken } from "./consequence.ts";
import { commitRulesOf, currentOf, planCommit, type UndecidedAs } from "./core.ts";
import { actorOf, candidateId, write, type Author } from "./driver.ts";
import { currentDecisions, head, items, rows } from "./read.ts";

// THE TWO FINAL ACTS - commit and return - and the outbox row each one writes.
//
// THE KERNEL OWNS THE DECISION; v1 RECEIVES THE OUTCOME (Phase 3 decisions 1
// and 2). v1's producers still read v1's files until Phase 4, so a commit must
// reach them through v1's own writers (patchVerdicts + commitRun, approveRun,
// patchTake, …). That call leaves the machine, and an external effect inside a
// transaction is the shape the store forbids (store.ts: the callback cannot
// await). So the commit writes its intent as a ROW - `packet_applies`, state
// pending - in the same transaction as the decision, its commit record and its
// Event, and ./apply.ts delivers it after (delivery-guarantees:
// co-transactional-consume, "an escaping effect becomes a row"). The commit
// cannot land without its apply, nor the apply without its commit.
//
// Both acts are idempotent on a ticket: a retry whose first attempt landed
// (and whose caller never heard) gets the first result back, byte for byte; a
// different ticket on a finished packet is a conflict, never a second act.

export type CommitInput = Author & {
  readonly packetId: PacketId;
  /** The idempotency key: a retried commit with the same ticket returns the first result. */
  readonly ticket: string;
  /** The preview's token (Consequence.token) and the v1 digest it was taken
   *  over, re-read by the adapter now. Refused as "stale-preview" when the
   *  decisions or v1 have moved since the operator saw the blast radius. */
  readonly token: string;
  readonly v1Digest: string;
  /** An explicit sweep of the undecided, matrix cull only (core.ts MODE_POLICY);
   *  absent - the default for every mode - refuses while anything is undecided. */
  readonly undecidedAs?: UndecidedAs;
};

const commitResultSchema = z.object({
  packetId: z.string(),
  ticket: z.string(),
  rev: z.number().int().nonnegative(),
  kept: z.array(candidateIdSchema),
  rejected: z.array(candidateIdSchema),
  undecided: z.array(candidateIdSchema),
  at: z.string(),
});
export type CommitResult = z.output<typeof commitResultSchema>;

/** The stored result of a packet's commit, or undefined before it. */
export function committedResult(t: Pick<Tx, "get">, packetId: string): Result<CommitResult> | undefined {
  const row = t.get("SELECT result FROM packet_commits WHERE packet_id = ?", packetId);
  return row === undefined ? undefined : parseJsonAt("stored commit", commitResultSchema, String(row["result"]));
}

/** A pending apply, due now: the outbox row both final acts write. */
function enqueueApply(t: Tx, packetId: string, act: "commit" | "return", ticket: string): void {
  t.run("INSERT INTO packet_applies (packet_id, act, ticket, state, attempts, next_at, created_at) VALUES (?, ?, ?, 'pending', 0, ?, ?)", packetId, act, ticket, t.at, t.at);
}

/**
 * Commit a packet: ONE act (plan §2.1), refused while anything is undecided
 * (Phase 3 decision 5) and when the preview it was shown is stale.
 */
export function commit(t: Tx, input: CommitInput): Result<CommitResult> {
  const prior = committedResult(t, input.packetId);
  if (prior !== undefined) {
    if (prior.ok && prior.value.ticket !== input.ticket) return err("conflict", `decision: packet ${input.packetId} was committed under another ticket`);
    return prior;
  }
  const h = head(t, input.packetId);
  const to = packetMachine.assert(h.state, "committed");
  if (!to.ok) return err("refused", `decision: packet ${h.id} is ${h.state} and cannot be committed`);
  const plan = planCommit(h.mode, items(t, h.id).map((i) => i.candidate_id), currentOf(rows(t, h.id)), input.undecidedAs, commitRulesOf(h.source));
  if (!plan.ok) return plan;
  const token = consequenceToken(currentDecisions(t, h.id).decisions, input.v1Digest);
  if (token !== input.token) return err("conflict", `decision: what packet ${h.id} would commit changed since its preview; preview again`, { detail: "stale-preview" });
  let rev = h.rev;
  if (plan.value.writeRejects.length > 0) {
    rev += 1;
    write(t, h.id, rev, plan.value.writeRejects.map((c) => ({ candidate: c, verdict: "reject", reasons: [] })), input, "commit", null, null);
  }
  t.run("UPDATE packets SET state = ? WHERE id = ?", to.value, h.id);
  const result: CommitResult = { packetId: h.id, ticket: input.ticket, rev, kept: plan.value.kept.map(candidateId), rejected: plan.value.rejected.map(candidateId), undecided: plan.value.undecided.map(candidateId), at: t.at };
  t.run("INSERT INTO packet_commits (packet_id, ticket, result, at) VALUES (?, ?, ?, ?)", h.id, input.ticket, canonical(result), t.at);
  enqueueApply(t, h.id, "commit", input.ticket);
  append(t, {
    actor: actorOf(input),
    type: "decision.committed",
    subject: { kind: "packet", id: h.id },
    data: {
      rev,
      ticket: input.ticket,
      token,
      kept: result.kept.length,
      rejected: result.rejected.length,
      undecided: result.undecided.length,
      ...(input.undecidedAs === undefined ? {} : { undecidedAs: input.undecidedAs }),
      surface: input.surface,
    },
  });
  return ok(result);
}

export type ReturnInput = Author & {
  readonly packetId: PacketId;
  /** The revision the operator wrote the plan against. */
  readonly baseRev: number;
  readonly ticket: string;
  readonly plan: EditPlan;
};

const returnResultSchema = z.object({
  packetId: z.string(),
  ticket: z.string(),
  rev: z.number().int().nonnegative(),
  plan: z.array(z.object({ section: z.string(), directive: z.enum(EDIT_DIRECTIVES), text: z.string() })),
  at: z.string(),
});
export type ReturnResult = z.output<typeof returnResultSchema>;

/** The plan a returned review was sent back with, or undefined. */
export function returnedPlan(t: Pick<Tx, "get">, packetId: string): Result<ReturnResult> | undefined {
  const row = t.get("SELECT packet_id AS packetId, ticket, rev, plan, at FROM packet_returns WHERE packet_id = ?", packetId);
  if (row === undefined) return undefined;
  const plan = parseJsonAt("stored edit plan", returnResultSchema.shape.plan, String(row["plan"]));
  if (!plan.ok) return plan;
  return ok({ packetId: String(row["packetId"]), ticket: String(row["ticket"]), rev: Number(row["rev"]), plan: plan.value, at: String(row["at"]) });
}

/**
 * Send a packet review back for another turn with a structured edit plan
 * (Phase 3 decision 8; prototype EditNote): v1 articles' awaiting-approval ->
 * drafting. The plan is stored with the act, and the source's adapter renders
 * it to v1's form where v1 takes a string (the article rework note) when the
 * outbox delivers it. The next turn arrives as a new packet.
 */
export function returnPacket(t: Tx, input: ReturnInput): Result<ReturnResult> {
  const earlier = returnedPlan(t, input.packetId);
  if (earlier !== undefined) {
    if (earlier.ok && earlier.value.ticket !== input.ticket) return err("conflict", `decision: packet ${input.packetId} was returned under another ticket`);
    return earlier;
  }
  const h = head(t, input.packetId);
  if (h.mode !== "packet-review") return err("refused", `decision: only a packet review is sent back; ${h.id} is a ${h.mode}`);
  const to = packetMachine.assert(h.state, "returned");
  if (!to.ok) return err("refused", `decision: packet ${h.id} is ${h.state}`);
  if (input.baseRev !== h.rev) return err("conflict", `decision: the packet moved on (now at revision ${h.rev}); re-read the review and send it again`);
  const plan = checkEditPlan(input.plan);
  if (!plan.ok) return err("invalid", `decision: ${plan.error.message}`);
  t.run("UPDATE packets SET state = ? WHERE id = ?", to.value, h.id);
  t.run("INSERT INTO packet_returns (packet_id, ticket, plan, rev, at) VALUES (?, ?, ?, ?, ?)", h.id, input.ticket, canonical(plan.value), h.rev, t.at);
  enqueueApply(t, h.id, "return", input.ticket);
  append(t, { actor: actorOf(input), type: "decision.returned", subject: { kind: "packet", id: h.id }, data: { rev: h.rev, ticket: input.ticket, plan: plan.value.map((n) => ({ ...n })), surface: input.surface } });
  return ok({ packetId: h.id, ticket: input.ticket, rev: h.rev, plan: [...plan.value], at: t.at });
}
