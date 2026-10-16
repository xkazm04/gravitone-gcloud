import "server-only";

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { StyleProof } from "@gt/domain/style";
import { blockDigest, keptCells, lockBlocker, PROVEN_KEEPS, proofEvidence, sheetCoverage, STYLE_TRIALS, problemOfTrial, type EvidenceInput } from "@gt/domain/style.ratchet";
import type { ProofState } from "@gt/domain/styleView";
import type { ApplyClaim } from "@gt/kernel/decision/apply";
import { applyStyleOp, listStylesIn, readStyleIn } from "@gt/kernel/styles/driver";
import type { StyleRow } from "@gt/kernel/styles/schema";
import type { Reader, Store } from "@gt/kernel/store";
import type { ItemWords, RowWords } from "@gt/ui/board/port";

import { kernel } from "../../../kernelStore.ts";
import { exportStyles } from "../../../foundry/catalogue.ts";
import { packetIdOf } from "../../../ledger/v1/packet.ts";
import type { WeirItem } from "../../../ledger/v1/types.ts";
import { blobRouteUrl } from "../../../parts/gates.ts";
import { buildConsequence, candidateOf, committedOutcome, decisionMap, fromV1, mintPacket, runIdOf, v1DigestOf, type AdapterRef, type DecisionAdapter, type DecisionsAt, type OpenPlan, type Preview } from "../types.ts";

// A STYLE'S PENDING PROOFS AS A PACKET (Phase 5, L56) - the Board's proof source, moved off the
// browser onto the Style table. v1 (lib/board/sources/proof.ts, retired with this file) read the
// IndexedDB `themes` store through lib/themes.ts and wrote a judged proof straight back with
// `putTheme`: no revision, no event, and an approval landed whatever the theme had become since.
// Here a style's PENDING proofs are one matrix cull (a row per trial problem - the lock gate
// counts problems, so the operator sees the coverage they are deciding), and the commit's apply
// is the atelier's own `judge-proof` op on the kernel's `styles` module, AT THE STYLE'S REV:
// every verdict is one op in the style's log, its evidence row appended by the ratchet's
// `proofEvidence`, its event on the ledger, styles.json re-exported after.
//
// KEPT from v1: a LOCKED style is left out (its proofs anchor projects; the Board does not reopen
// what the atelier closed - v1 parts.tsx stopped offering approve/reject on lock, and the
// ratchet would refuse an un-approval anyway); v1's three refusals, in its words ("That style no
// longer exists.", "This style is locked; its proofs are final.", "That proof is no longer on the
// sheet."). UPGRADED: a proof the atelier judged while the packet was open is never overwritten -
// the same verdict is success, another is refused (hitl-approval resume-after-decision); the
// preview names what the verdicts do to the RATCHET (a promotion to proven, the lock gate after);
// only an operator's verdict lands (an approval is an operator keep - an agent's is no vote).
//
// THE PILE IS AN AGGREGATE PER STYLE (./audio.ts's rule): the Weir names it bare
// (`pkt:proof:<styleId>`) and the adapter resolves it to `<styleId>/<cutoff>`, the cutoff the
// newest pending proof's instant, so proofs that land while a packet is open wait for the next.

export type ProofDeps = {
  readonly store: () => Result<Store>;
  /** Re-export pipeline/foundry/styles.json after a write (the Python readers' copy). */
  readonly exportStyles: (store: Store) => void;
};

export type ProofV1 = {
  readonly runId: string;
  readonly cutoff: number;
  readonly row: StyleRow;
};

/** Who a Board verdict is written as on the style's log (the board's author is on the decision's own event). */
const OPERATOR: Actor = { kind: "operator", id: "operator" };
const NOTE_MAX = 500;
const pending = (p: StyleProof): boolean => p.state === "pending";
const atMs = (p: Pick<StyleProof, "at">): number => Date.parse(p.at);

/** The pile at a cutoff: the sheet's pending proofs drawn at or before it, oldest first. */
function pileOf(row: StyleRow, cutoff: number): StyleProof[] {
  return row.style.proofs.filter((p) => pending(p) && atMs(p) <= cutoff).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/** `<styleId>` (the current pile) or `<styleId>/<cutoff ms>`; the style must exist under the first. */
function parseRef(r: Reader, runId: string): Result<{ readonly row: StyleRow; readonly cutoff: number | undefined }> {
  const whole = readStyleIn(r, runId);
  if (whole !== undefined) return ok({ row: whole, cutoff: undefined });
  const m = /^(.+)\/(\d{1,15})$/.exec(runId);
  const row = m?.[1] === undefined ? undefined : readStyleIn(r, m[1]);
  if (row === undefined || m?.[2] === undefined) return err("not-found", "That style no longer exists.");
  return ok({ row, cutoff: Number(m[2]) });
}

/** The trial row a proof is decided in: its problem, or a free subject of its own. */
const rowOf = (p: StyleProof): string => problemOfTrial(p.trialId) ?? "free";
const trialLabel = (p: StyleProof): string | undefined => STYLE_TRIALS.find((t) => t.id === p.trialId)?.label;

function words(p: StyleProof, digest: string | null): ItemWords {
  const lineage = p.blockDigest === undefined ? "before lineage" : p.blockDigest === digest ? undefined : "an earlier block";
  const cost = p.costUsd === undefined ? "unpriced" : `$${p.costUsd.toFixed(3)}`;
  const meta = [trialLabel(p), p.model, cost, lineage].filter((x): x is string => x !== undefined).join(" · ");
  return { label: p.label, meta };
}

export function makeProofAdapter(deps: ProofDeps): DecisionAdapter<ProofV1> {
  async function read(ref: AdapterRef): Promise<Result<ProofV1>> {
    const s = deps.store();
    if (!s.ok) return s;
    const got = s.value.read((r) => parseRef(r, ref.runId));
    if (!got.ok) return got;
    if (!got.value.ok) return got.value;
    const { row, cutoff: named } = got.value.value;
    if (row.style.lock !== undefined) return err("refused", "This style is locked; its proofs are final.");
    const at = row.style.proofs.filter(pending).map(atMs);
    const cutoff = named ?? (at.length === 0 ? undefined : Math.max(...at));
    if (cutoff === undefined) return err("not-found", `no proof of ${row.style.name} is waiting to be judged`);
    return ok({ runId: `${row.style.id}/${cutoff}`, cutoff, row });
  }

  function packet(v1: ProofV1): Result<OpenPlan> {
    const s = v1.row.style;
    if (s.lock !== undefined) return err("refused", "This style is locked; its proofs are final.");
    const pile = pileOf(v1.row, v1.cutoff);
    if (pile.length === 0) return err("not-found", `no proof of ${s.name} drawn at or before ${new Date(v1.cutoff).toISOString()} is waiting to be judged`);
    const minted = mintPacket({
      id: packetIdOf("proof", v1.runId),
      lane: "image",
      source: "proof",
      mode: "matrix-cull",
      state: "open",
      runId: v1.runId,
      title: `${s.name} · ${pile.length} proof${pile.length === 1 ? "" : "s"}`,
      items: pile.map((p) => ({ id: p.id, jobId: `style:${s.id}`, media: p.media, row: rowOf(p), grades: [] })),
    });
    if (!minted.ok) return minted;
    const digest = s.block === undefined ? null : blockDigest(s.block);
    const rows: RowWords[] = [...new Set(pile.map(rowOf))].map((id) => ({ id, label: id }));
    return ok({
      packet: minted.value,
      // The pile is the PENDING proofs: nothing on it holds a verdict to import.
      initial: [],
      present: {
        items: Object.fromEntries(pile.map((p) => [p.id, words(p, digest)])),
        rows,
        // No oracle: the gate a pile of pending proofs reads before it is decided is always "N
        // undecided" - a fail the operator is about to resolve, not a machine's opinion. What the
        // verdicts do to the gate is the preview's.
        meta: `${s.name} · ${s.status}${digest === null ? "" : ` · block ${digest}`}`,
      },
      urls: Object.fromEntries(pile.map((p) => [p.id, blobRouteUrl(p.media)])),
      losses: [],
    });
  }

  function consequence(v1: ProofV1, at: DecisionsAt): Result<Preview> {
    const s = v1.row.style;
    if (s.lock !== undefined) return err("refused", "This style is locked; its proofs are final.");
    const byId = new Map(s.proofs.map((p) => [p.id, p]));
    const items = new Set(pileOf(v1.row, v1.cutoff).map((p) => p.id));
    const writes: Preview["consequence"]["writes"][number][] = [];
    const read: unknown[] = [];
    let after = s.proofs;
    let evidence: readonly EvidenceInput[] = s.evidence;
    for (const [id, d] of decisionMap(at.decisions)) {
      items.add(id);
      const p = byId.get(id);
      if (p === undefined) return err("conflict", "That proof is no longer on the sheet.");
      read.push({ id, state: p.state, note: p.note ?? null, digest: p.blockDigest ?? null });
      if (d.verdict === null) continue;
      if (d.by !== "operator") return err("refused", `proof ${id}: a proof is judged by an operator; an agent's verdict is no keep`);
      const state: ProofState = d.verdict === "keep" ? "approved" : "rejected";
      if (p.state !== "pending" && p.state !== state) return err("conflict", `proof ${id} was ${p.state} in the atelier since this pile opened; the commit would overwrite it`);
      if (p.state === state) continue;
      writes.push({ kind: "index-row", target: `style ${s.id} · ${p.label}`, candidate: id, detail: `${state}${d.note === undefined ? "" : ` · ${d.note}`}` });
      after = after.map((x) => (x.id === id ? { ...x, state } : x));
      evidence = [...evidence, proofEvidence(s.id, p, d.verdict, d.at)];
    }
    if (writes.length > 0) writes.push({ kind: "file", target: "pipeline/foundry/styles.json", detail: "re-exported from the style store" });
    const promotions: { target: string; candidate?: string; detail: string }[] = [];
    if (keptCells(s) < PROVEN_KEEPS && keptCells({ evidence }) >= PROVEN_KEEPS) promotions.push({ target: `${s.name} · proven`, detail: `operator keeps in ${keptCells({ evidence })} distinct cells` });
    const gate = lockBlocker({ ...s, proofs: after, evidence });
    const covered = [...sheetCoverage({ ...s, proofs: after }).byProblem].filter(([, v]) => v.approved > 0).length;
    promotions.push({ target: `${s.name} · lock gate`, detail: gate === null ? `would admit a lock (${covered} problems covered)` : gate });
    const v1Digest = v1DigestOf({ source: "proof", style: s.id, cutoff: v1.cutoff, digest: s.block === undefined ? null : blockDigest(s.block), proofs: read });
    return ok({ v1Digest, consequence: buildConsequence(at, [...items], { writes, promotions }, v1Digest) });
  }

  async function apply(claim: ApplyClaim): Promise<Result<void>> {
    const done = committedOutcome(claim);
    if (!done.ok) return done;
    const run = runIdOf(claim);
    if (!run.ok) return run;
    const s = deps.store();
    if (!s.ok) return s;
    const store = s.value;
    const ref = store.read((r) => parseRef(r, run.value));
    if (!ref.ok) return ref;
    if (!ref.value.ok) return ref.value;
    const styleId = ref.value.value.row.style.id;
    for (const d of claim.decisions) {
      if (d.verdict === null) continue;
      const id = candidateOf(d);
      const state: ProofState = d.verdict === "keep" ? "approved" : "rejected";
      const note = d.note?.trim().slice(0, NOTE_MAX);
      if (d.by !== "operator") return err("refused", `proof ${id}: a proof is judged by an operator; an agent's verdict is no keep`);
      // An op at the style's CURRENT rev; a conflict means another write landed between the read
      // and the op - read again (bounded), the verdict is still the same act.
      for (let attempt = 0; ; attempt++) {
        const now = store.read((r) => readStyleIn(r, styleId));
        if (!now.ok) return now;
        const row = now.value;
        if (row === undefined) return err("not-found", "That style no longer exists.");
        const p = row.style.proofs.find((x) => x.id === id);
        if (p === undefined) return err("refused", "That proof is no longer on the sheet.");
        // A redelivery finds its own verdict and writes nothing; another verdict is the atelier's, and stands.
        if (p.state === state) break;
        if (row.style.lock !== undefined) return err("refused", "This style is locked; its proofs are final.");
        if (p.state !== "pending") return err("refused", `proof ${id} is ${p.state} in the atelier; this packet would have it ${state} - judge it there`);
        const out = applyStyleOp(store, { styleId, baseRev: row.rev, op: { kind: "judge-proof", proofId: id, state, ...(note ? { note } : {}) } }, OPERATOR);
        if (!out.ok) return out;
        if (out.value.kind === "applied") break;
        if (out.value.kind === "refused") return err("refused", out.value.reason);
        if (attempt >= 2) return err("conflict", `style ${styleId} kept moving while proof ${id} was judged; the apply will retry`);
      }
    }
    // The export is a projection of the store: re-written on every delivery, so a delivery whose
    // ops landed and whose export failed (the outbox retries it) heals the file on the retry.
    try {
      deps.exportStyles(store);
    } catch (e) {
      return fromV1(e);
    }
    return ok(undefined);
  }

  return { source: "proof", read, packet, consequence, apply };
}

/** Every unlocked style with a proof waiting, as a Weir pile the Board opens by its bare id. */
export function proofPiles(r: Reader): WeirItem[] {
  return listStylesIn(r).flatMap((row): WeirItem[] => {
    const s = row.style;
    if (s.lock !== undefined) return [];
    const waiting = s.proofs.filter(pending);
    if (waiting.length === 0) return [];
    const since = waiting.map((p) => p.at).sort()[0];
    return [{ source: "proof", id: s.id, title: `${s.name} · proofs`, media: "image", kind: "cull", ...(since === undefined ? {} : { since }), decided: 0, pending: waiting.length, href: `/library/style/${encodeURIComponent(s.id)}`, packetId: packetIdOf("proof", s.id) }];
  });
}

const liveStore = (): Result<Store> => {
  const k = kernel();
  return k.ok ? ok(k.value.store) : k;
};

export const proofAdapter = makeProofAdapter({ store: liveStore, exportStyles: (s) => void exportStyles(s) });

/** The live store's proof piles, for the request's Weir read (app/(studio)/_shell/live.ts). */
export function liveProofPiles(): Result<WeirItem[]> {
  const s = liveStore();
  return s.ok ? s.value.read(proofPiles) : s;
}
