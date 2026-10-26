import "server-only";

import type { Decision as BoardDecision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { SpendRequest, SpendSubject } from "@gt/domain/mcp";
import type { Receipt } from "@gt/domain/produce";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import type { Decision } from "@gt/kernel/spend-requests/store";
import { costWords } from "@gt/ui/components/produce/produce.ts";

import { packetIdOf } from "../../../ledger/v1/packet.ts";
import type { WeirItem } from "../../../ledger/v1/types.ts";
import { buildConsequence, committedOutcome, decisionMap, mintPacket, runIdOf, v1DigestOf, type AdapterRef, type DecisionAdapter, type DecisionsAt, type OpenPlan, type Preview } from "../types.ts";
import { textRef } from "./scoutPlan.ts";
import { liveSpendDeps } from "./spendLive.ts";
import { cellBody, itemWords, keepWords, laneOf, linesWords, rejectWords, rowWords, shownReceipt, shownUsd, spendPiles, totalWords, whatOf, type Priced, type SpendRow } from "./spendWords.ts";

// ONE DAY'S SPEND REQUESTS AS A PACKET (spark athena-control-mcp WP3) - `pkt:spend:<day>`, a row per
// request an agent filed when its live launch would spend (@gt/kernel/spend-requests/store), decided as
// ONE matrix cull whose cells are words (./spendWords.ts). K pays at the price on the card; X names why
// not (SOURCES.spend.reasonOnReject: the kernel's planCommit refuses a reasonless X), and the agent that
// asked reads the reasons and the note back from the request.
//
// THE PILE IS KERNEL-NATIVE, as the Style table's proofs are (./proof.ts proofPiles): the requests
// live in the kernel store, not in a v1 store the ledger projects, so the day's pile is read beside
// liveNow (app/(studio)/_shell/live.ts) and carries its own packetId, rather than registered as a
// ledger Source the sync would walk and the runs/reconcile probes would demand v1 predicates for.
//
// THE PILE IS AN AGGREGATE PER DAY (./proof.ts's rule): the Floor and @gt/domain/mcp name it bare,
// `pkt:spend:<day>`, and the adapter resolves it to `<day>/<cutoff>`, the cutoff the newest pending
// request's instant. A request filed while a packet is open waits for the next one, and a request filed
// after the day's packet committed opens a second packet the same day instead of being stranded behind
// a committed id (the Board's bare-aggregate rule, app/(studio)/board/_port/real.ts listPackets).
//
// APPLY, per decided request, compare-not-overwrite (./seeds.ts) with ./article.ts's resume rule:
//   K  requested -> confirmed (operator:board) -> the receipt re-read LIVE -> launched live with that
//      operator and ceilingUsd = the worst case the card showed (a stop point, kernel job-core `next`)
//      -> markSpendLaunched(jobIds). Anything that stops the launch after the confirm - a stale plan,
//      `dry-only`, a refusal - is markSpendFailed with its sentence verbatim, never retried into spend.
//   X  requested -> refused, with the decision's reasons and note.
//   A request already holding THIS outcome is success; one that is no longer `requested` with another
//   outcome is skipped and named in the apply's refusal, and nothing is ever launched twice: a request
//   left `confirmed` by an interrupted apply is failed with that said, not re-launched (its launch may
//   have landed; Runs shows it).

/** The store seam: the kernel's spend-request store (@gt/kernel/spend-requests/store) behind Results. */
export type SpendStore = {
  /** The day's requests still `requested`. */
  readonly requested: (day: string) => Result<readonly SpendRequest[]>;
  /** Every request still `requested`, any day (the Floor's piles). */
  readonly pending: () => Result<readonly SpendRequest[]>;
  readonly get: (id: string) => Result<SpendRequest | undefined>;
  readonly decide: (id: string, d: Decision, actor: Actor) => Result<SpendRequest>;
  readonly launched: (id: string, jobIds: readonly string[], actor: Actor) => Result<SpendRequest>;
  readonly failed: (id: string, failure: string, actor: Actor) => Result<SpendRequest>;
};

/** A live launch's outcome: its jobs, or the receipt as it reads now when the one handed over was stale. */
export type Launched = { readonly kind: "launched"; readonly jobIds: readonly string[] } | { readonly kind: "stale"; readonly fresh: Receipt };

/** The produce doors the real Floor and Plan launch through, LIVE. */
export type SpendDoors = {
  readonly price: (subject: SpendSubject) => Promise<Result<Priced>>;
  readonly launch: (subject: SpendSubject, receipt: Receipt, ceilingUsd: number | undefined, actor: Actor) => Promise<Result<Launched>>;
};

export type SpendDeps = { readonly store: () => Result<SpendStore>; readonly doors: () => SpendDoors };

/** A day's pile at a cutoff: `runId` is `<day>/<cutoff ms>`, the rows the requests filed at or before it. */
export type SpendV1 = { readonly day: string; readonly runId: string; readonly cutoff: number; readonly rows: readonly SpendRow[] };

/** The Board's commit is the operator's confirm (./article.ts OPERATOR_ACT): it arms the launch live. */
export const BOARD: Actor = { kind: "operator", id: "board" };
/** `<day>` (the day's current pile) or `<day>/<cutoff ms>` (one opened pile). */
const REF_RE = /^(\d{4}-\d{2}-\d{2})(?:\/(\d{1,15}))?$/;
/** An interrupted apply's request: confirmed, its launch unreported. */
export const INTERRUPTED = "confirmed on the Board; the apply stopped before its launch reported back, and nothing was re-launched";

/** The surface's invariant (@gt/domain/mcp): an agent never spends, so its K is no confirm. */
const AGENT_KEEP = (id: string): string => `${id}: a spend request is paid by an operator; an agent's keep is no confirm`;

const atMs = (r: Pick<SpendRequest, "filedAt">): number => Date.parse(r.filedAt);

/* ── read ──────────────────────────────────────────────────────────────────── */

const same = (a: readonly string[], b: readonly string[]): boolean => [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** What the commit's digest holds: each request's state and filed token, and the price it reads now. */
function digestOf(v1: SpendV1): string {
  return v1DigestOf({
    source: "spend",
    run: v1.runId,
    requests: v1.rows.map(({ req, now }) => ({
      id: req.id,
      state: req.state,
      filed: req.receipt.token,
      // The price, not the live token: a live token digests the queue, which moves with every job.
      now: now.ok ? { total: totalWords(now.value.receipt), usd: now.value.receipt.totals.usd, range: now.value.receipt.totals.usdRange ?? null, lines: linesWords(now.value.receipt) } : { error: now.error.message },
    })),
  });
}

export function makeSpendAdapter(deps: SpendDeps): DecisionAdapter<SpendV1> {
  async function read(ref: AdapterRef): Promise<Result<SpendV1>> {
    const m = REF_RE.exec(ref.runId);
    const day = m?.[1];
    if (m === null || day === undefined) return err("invalid", `a spend packet is a day (YYYY-MM-DD), not ${ref.runId}`);
    const s = deps.store();
    if (!s.ok) return s;
    const reqs = s.value.requested(day);
    if (!reqs.ok) return reqs;
    const named = m[2] === undefined ? undefined : Number(m[2]);
    const cutoff = named ?? Math.max(...reqs.value.map(atMs));
    if (!Number.isFinite(cutoff)) return err("not-found", `no spend request filed on ${day} is waiting`);
    // Oldest first: the order the agent asked in.
    const sorted = reqs.value.filter((r) => atMs(r) <= cutoff).sort((a, b) => a.filedAt.localeCompare(b.filedAt) || a.id.localeCompare(b.id));
    const doors = deps.doors();
    const rows = await Promise.all(sorted.map(async (req): Promise<SpendRow> => ({ req, now: await doors.price(req.subject) })));
    return ok({ day, runId: `${day}/${cutoff}`, cutoff, rows });
  }

  /* ── packet ──────────────────────────────────────────────────────────────── */

  function packet(v1: SpendV1): Result<OpenPlan> {
    if (v1.rows.length === 0) return err("not-found", `no spend request filed on ${v1.day} is waiting`);
    const minted = mintPacket({
      id: packetIdOf("spend", v1.runId),
      lane: laneOf(v1.rows.map((r) => r.req)),
      source: "spend",
      mode: "matrix-cull",
      state: "open",
      runId: v1.runId,
      title: `spend ${v1.day}`,
      items: v1.rows.map(({ req }) => ({ id: req.id, jobId: `spend:${req.id}`, media: textRef(cellBody(req)), row: req.id, grades: [] })),
    });
    if (!minted.ok) return minted;
    const usd = v1.rows.reduce((n, r) => n + (shownUsd(shownReceipt(r)) ?? 0), 0);
    return ok({
      packet: minted.value,
      // The pile is the PENDING requests: nothing on it holds a verdict to import.
      initial: [],
      present: {
        items: Object.fromEntries(v1.rows.map((r) => [r.req.id, itemWords(r)])),
        rows: v1.rows.map(rowWords),
        meta: `spend · ${v1.day} · ${v1.rows.length} · ${costWords({ usd })}`,
      },
      // A request is its words: nothing is fetched for a text cell.
      urls: Object.fromEntries(v1.rows.map((r) => [r.req.id, ""])),
      losses: [],
    });
  }

  /* ── consequence ─────────────────────────────────────────────────────────── */

  function consequence(v1: SpendV1, at: DecisionsAt): Result<Preview> {
    const byCell = decisionMap(at.decisions);
    const writes: Preview["consequence"]["writes"][number][] = [];
    const outward: { kind: string; sentence: string }[] = [];
    for (const row of v1.rows) {
      const d = byCell.get(row.req.id);
      const target = `spend request ${row.req.id}`;
      if (d?.verdict === "keep") {
        if (d.by !== "operator") return err("refused", AGENT_KEEP(row.req.id));
        const r = shownReceipt(row);
        writes.push({ kind: "index-row", target, candidate: row.req.id, detail: keepWords(r) });
        outward.push({ kind: "live launch", sentence: `${whatOf(row.req.subject, row.now.ok ? row.now.value.title : undefined)} · ${linesWords(r)} · ${totalWords(r)}` });
      } else if (d?.verdict === "reject") {
        writes.push({ kind: "index-row", target, candidate: row.req.id, detail: d.reasons.length > 0 ? `${rejectWords(row.req)} (${d.reasons.join(", ")})` : `${rejectWords(row.req)} · needs a reason` });
      }
    }
    const v1Digest = digestOf(v1);
    return ok({ v1Digest, consequence: buildConsequence(at, v1.rows.map((r) => r.req.id), { writes, outward }, v1Digest) });
  }

  /* ── apply ───────────────────────────────────────────────────────────────── */

  /** K on a confirmed request: price it live now, launch it at the card's stop point, record the outcome. */
  async function launchOne(store: SpendStore, req: SpendRequest): Promise<Result<void>> {
    const doors = deps.doors();
    const record = (r: Result<SpendRequest>): Result<void> => (r.ok ? ok(undefined) : r);
    const priced = await doors.price(req.subject);
    if (!priced.ok) return record(store.failed(req.id, priced.error.message, BOARD));
    // The stop point is the card's: the receipt the first read in this apply prices, which the commit's
    // digest held equal to the one the operator saw. A stale token re-reads ONCE, at the same stop point.
    const ceilingUsd = shownUsd(priced.value.receipt);
    let receipt = priced.value.receipt;
    for (let attempt = 0; ; attempt++) {
      const out = await doors.launch(req.subject, receipt, ceilingUsd, BOARD);
      if (!out.ok) return record(store.failed(req.id, out.error.message, BOARD));
      if (out.value.kind === "launched") return record(store.launched(req.id, out.value.jobIds, BOARD));
      if (attempt >= 1) return record(store.failed(req.id, "what this launch would do changed since its receipt; read the fresh receipt", BOARD));
      receipt = out.value.fresh;
    }
  }

  /** One decided request; a skip's sentence when it holds another outcome. */
  async function applyOne(store: SpendStore, id: string, d: BoardDecision): Promise<Result<string | undefined>> {
    const got = store.get(id);
    if (!got.ok) return got;
    const req = got.value;
    if (req === undefined) return ok(`${id} is not a spend request`);
    if (d.verdict === "keep") {
      if (d.by !== "operator") return ok(AGENT_KEEP(id));
      switch (req.state) {
        case "requested": {
          const c = store.decide(id, { verdict: "confirmed" }, BOARD);
          if (!c.ok) return c;
          const l = await launchOne(store, c.value);
          return l.ok ? ok(undefined) : l;
        }
        case "confirmed": {
          const f = store.failed(id, INTERRUPTED, BOARD);
          return f.ok ? ok(undefined) : f;
        }
        case "launched":
        case "failed":
          return ok(undefined);
        case "refused":
          return ok(`${id} is refused; this packet keeps it`);
      }
    }
    if (d.verdict === "reject") {
      if (req.state === "requested") {
        if (d.reasons.length === 0) return ok(`${id} is rejected with no reason`);
        const r = store.decide(id, { verdict: "refused", reasons: d.reasons, ...(d.note === undefined ? {} : { note: d.note }) }, BOARD);
        return r.ok ? ok(undefined) : r;
      }
      if (req.state === "refused") return same(req.reasons ?? [], d.reasons) && (req.note ?? "") === (d.note ?? "") ? ok(undefined) : ok(`${id} was refused for other reasons`);
      return ok(`${id} is ${req.state}; this packet refuses it`);
    }
    return ok(undefined);
  }

  async function apply(claim: ApplyClaim): Promise<Result<void>> {
    const done = committedOutcome(claim);
    if (!done.ok) return done;
    const day = runIdOf(claim);
    if (!day.ok) return day;
    const s = deps.store();
    if (!s.ok) return s;
    const byCell = decisionMap(claim.decisions);
    const skipped: string[] = [];
    // In the packet's order, which is the order the agent asked in.
    for (const { id } of claim.packet.items) {
      const d = byCell.get(id);
      if (d === undefined || d.verdict === null) continue;
      const r = await applyOne(s.value, id, d);
      if (!r.ok) return r;
      if (r.value !== undefined) skipped.push(r.value);
    }
    return skipped.length === 0 ? ok(undefined) : err("refused", `spend ${day.value}: skipped ${skipped.join("; ")}`);
  }

  return { source: "spend", read, packet, consequence, apply };
}

/* ── the Floor ─────────────────────────────────────────────────────────────── */

/** Every day with a request waiting, as a Weir pile the Board opens by its bare day. */
export function spendPilesOf(store: SpendStore): Result<WeirItem[]> {
  const p = store.pending();
  return p.ok ? ok(spendPiles(p.value)) : p;
}

export const spendAdapter: DecisionAdapter<SpendV1> = makeSpendAdapter(liveSpendDeps);

/** The live store's spend piles, for the request's Weir read (app/(studio)/_shell/live.ts). */
export function liveSpendPiles(): Result<WeirItem[]> {
  const s = liveSpendDeps.store();
  return s.ok ? spendPilesOf(s.value) : s;
}

