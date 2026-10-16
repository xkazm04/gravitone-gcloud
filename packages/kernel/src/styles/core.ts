import { err, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Style, StyleProof } from "@gt/domain/style";
import { blockDigest, lockBlocker, proofEvidence, sameBlock, statusOf, type EvidenceInput } from "@gt/domain/style.ratchet";
import type { StyleOp } from "@gt/domain/styleView";

// THE STYLE OPS, PURE - what an operator's edit does to one record, with time and identity as
// parameters (plan §9.3: IO-free cores). The driver (./driver.ts) reads the record, calls this,
// passes the result through the record's door and the ratchet, and writes it with its log row
// and event in one transaction. Nothing here can make a status: every plan re-derives it, so a
// caller that sent `status: "locked"` would be sending a field this function never reads.
//
// v1 had these acts in four places (lib/themes.ts putTheme behind useThemes.update, parts.tsx's
// proof buttons, SpecEditor's lock, LibraryAtelier's duplicate-by-hand) and only views stopped a
// locked block being rewritten. Here an act is a value the log keeps, and the ratchet sees every
// one of them on its way to the row.

/** What a plan writes: the next record (unparsed - the driver's door mints it), the event, and
 *  for `duplicate` the id it creates (the source record is untouched). */
export type StylePlan = {
  readonly id: string;
  readonly next: Readonly<Record<string, unknown>>;
  readonly type: string;
  readonly data: EventData;
  readonly created: boolean;
};

export type OpContext = {
  readonly at: string;
  /** The operator's actor id: who the lock event and every proof judgement name. */
  readonly by: string;
  /** Whether an id is taken in the store (duplicate's id is derived, never caller-supplied). */
  readonly taken: (id: string) => boolean;
};

/** The record as plain JSON with its status re-derived: what every plan hands the door. */
export function withStatus<T extends { readonly evidence: readonly EvidenceInput[]; readonly lock?: Style["lock"] | undefined }>(s: T): T & { status: Style["status"] } {
  return { ...s, status: statusOf({ evidence: s.evidence, ...(s.lock === undefined ? {} : { lock: s.lock }) }) };
}

function proofOf(s: Style, proofId: string): Result<StyleProof> {
  const p = s.proofs.find((x) => x.id === proofId);
  return p === undefined ? err("not-found", `${s.name} has no proof ${proofId}`) : ok(p);
}

/** A record on its way to the door: evidence rows not yet branded, status not yet derived. */
export type StyleDraft = Omit<Style, "id" | "evidence" | "exemplars" | "duplicatedFrom" | "status"> & {
  readonly id: string;
  readonly evidence: readonly EvidenceInput[];
  readonly exemplars: readonly (Omit<Style["exemplars"][number], "run"> & { readonly run: string })[];
  readonly duplicatedFrom?: string;
};

const plan = (s: Style, next: StyleDraft, type: string, data: EventData): Result<StylePlan> => ok({ id: s.id, next: withStatus(next), type, data, created: false });

/** A duplicate's id: `<source>-copy`, then `-copy-2`, ... - readable, stable, never reused. */
export function duplicateId(sourceId: string, taken: (id: string) => boolean): string {
  let id = `${sourceId}-copy`;
  for (let i = 2; taken(id); i++) id = `${sourceId}-copy-${i}`;
  return id;
}

/** Plan one operator op. A refusal is `refused` with the work's sentence; nothing is planned. */
export function planOp(s: Style, op: StyleOp, ctx: OpContext): Result<StylePlan> {
  switch (op.kind) {
    case "rename": {
      const name = op.name.trim();
      if (name === s.name) return err("invalid", "rename: the name is unchanged");
      return plan(s, { ...s, name }, "style.renamed", { from: s.name, to: name });
    }
    case "set-block": {
      if (sameBlock(s.block, op.block)) return err("invalid", "set-block: the block is unchanged");
      return plan(s, { ...s, block: op.block }, "style.edited", { field: "block", digest: blockDigest(op.block) });
    }
    case "set-elements": {
      const elements = [...new Set(op.elements.map((e) => e.trim()).filter((e) => e !== ""))];
      if (elements.length === s.elements.length && elements.every((e, i) => e === s.elements[i])) return err("invalid", "set-elements: the elements are unchanged");
      return plan(s, { ...s, elements }, "style.edited", { field: "elements", count: elements.length });
    }
    case "judge-proof": {
      const p = proofOf(s, op.proofId);
      if (!p.ok) return p;
      if (p.value.state === op.state && (op.note === undefined || op.note === p.value.note)) return err("invalid", `judge-proof: ${op.proofId} is already ${op.state}`);
      const { note: _old, ...bare } = p.value;
      void _old;
      const note = op.note?.trim();
      const judged: StyleProof = { ...bare, state: op.state, ...(note ? { note } : p.value.note !== undefined && op.note === undefined ? { note: p.value.note } : {}) };
      // An approval is a keep and a rejection a reject, appended - never rewritten - so a
      // keep once given still counts toward `proven` (the ratchet does not demote).
      const evidence = op.state === "pending" || op.state === p.value.state ? s.evidence : [...s.evidence, proofEvidence(s.id, p.value, op.state === "approved" ? "keep" : "reject", ctx.at)];
      return plan(s, { ...s, proofs: s.proofs.map((x) => (x.id === op.proofId ? judged : x)), evidence }, "style.judged", { proofId: op.proofId, state: op.state, ...(note ? { note } : {}) });
    }
    case "remove-proof": {
      const p = proofOf(s, op.proofId);
      if (!p.ok) return p;
      return plan(s, { ...s, proofs: s.proofs.filter((x) => x.id !== op.proofId) }, "style.proof-removed", { proofId: op.proofId, state: p.value.state });
    }
    case "promote-proof": {
      const p = proofOf(s, op.proofId);
      if (!p.ok) return p;
      if (p.value.state !== "approved") return err("refused", "only an approved proof goes on the shelf");
      if (p.value.promotedAt !== undefined) return err("invalid", `promote-proof: ${op.proofId} is already on the shelf`);
      const proofs = s.proofs.map((x) => (x.id === op.proofId ? { ...x, promotedAt: ctx.at } : x));
      return plan(s, { ...s, proofs }, "style.proof-promoted", { proofId: op.proofId, sha256: p.value.media.sha256 });
    }
    case "lock": {
      if (s.lock !== undefined) return err("refused", "already locked — a lock is one-way");
      const blocker = lockBlocker(s);
      if (blocker !== null) return err("refused", `cannot lock: ${blocker}`);
      return plan(s, { ...s, lock: { at: ctx.at, by: ctx.by } }, "style.locked", { by: ctx.by, ...(s.block === undefined ? {} : { digest: blockDigest(s.block) }) });
    }
    case "duplicate": {
      const id = duplicateId(s.id, ctx.taken);
      const name = op.name?.trim() || `${s.name} (copy)`;
      const { lock: _l, proofs: _p, evidence: _e, exemplars: _x, status: _s, ...look } = s;
      void [_l, _p, _e, _x, _s];
      const next = withStatus({ ...look, id, name, evidence: [], exemplars: [], proofs: [], duplicatedFrom: s.id });
      return ok({ id, next, type: "style.duplicated", data: { from: s.id, name }, created: true });
    }
  }
}
