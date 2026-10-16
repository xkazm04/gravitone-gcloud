// ONE STYLE WRITE, PURE: a record, an op, the time and who - in; the next record (through the
// record's door) or the ratchet's refusal in its own words - out. The fixture side writes with
// it today; the kernel's `styles` module (L48) owns the same rules for the real side, and the
// door both pass through (@gt/domain/style `styleSchema`, `ratchetBlocker`) is the one they share,
// so the two cannot disagree about what a locked style admits.
//
// Absorbed from v1, each with its reason kept:
//   · judge   lib/useThemes.ts judgeProof: a verdict on a plate. UPGRADED: a verdict is evidence
//             (style.ratchet `proofEvidence`: run = the sheet, scene = the trial problem), so the
//             approvals that cover two problems are what proves an atelier style - one count for
//             the forge and the atelier. Evidence only grows: undeciding a proof does not unprove.
//   · lock    lib/themes.ts canLock/lockBlocker. UPGRADED: refused HERE with the gate's sentence;
//             v1's useThemes.lock (lib/useThemes.ts:147) skipped canLock and locked anything.
//   · ratchet lib/themes.ts ratchetBlocker, now the door's: no unlock, a locked block frozen, a
//             locked sheet keeps an approval. Adding proofs to a locked sheet stays allowed.
//   · remove  a REJECTION IS NEVER REMOVED (visual-style-locking/rejections-as-negative-evidence:
//             it is the record of what the style is not, and it was paid for); an approval is
//             undecided first. Only an undecided plate leaves the sheet.
//   · dup     the only way to change a locked look: the block and words carried over, the sheet
//             and its evidence left behind ("the approvals belonged to the original").
import { parseAt } from "@gt/domain/door";
import { err, ok, type Result } from "@gt/domain/errors";
import { ratchetBlocker, proofEvidence, lockBlocker, statusOf } from "@gt/domain/style.ratchet";
import { styleSchema, type Style } from "@gt/domain/style";
import type { StyleOp } from "@gt/domain/styleView";
import type { z } from "zod";

/** A record before its door: plain ids, no status (the door derives it). */
type Raw = Omit<z.input<typeof styleSchema>, "status">;

export type Who = { readonly at: string; readonly by: string };
export type Applied = { readonly kind: "applied"; readonly next: Style; readonly created?: Style } | { readonly kind: "refused"; readonly reason: string };

const refused = (reason: string): Result<Applied> => ok({ kind: "refused", reason });

/** The observables as plain words (the record's regex-keyed record reads as partial). */
export const wordsOf = (o: Style["observables"]): Record<string, string> =>
  Object.fromEntries(Object.entries(o).filter((e): e is [string, string] => e[1] !== undefined));

/** A parsed record as a door's input again: what every write starts from. */
export const rawOf = (s: Style): Raw => ({ ...s, observables: wordsOf(s.observables) });

/** Any plain shape of a style through its door, the status re-derived first (a caller never writes it). */
export function door(raw: Raw): Result<Style> {
  const read = { evidence: raw.evidence, ...(raw.lock === undefined ? {} : { lock: raw.lock }) };
  return parseAt("style", styleSchema, { ...raw, status: statusOf(read) });
}

function judged(s: Style, op: Extract<StyleOp, { kind: "judge-proof" }>, who: Who): Result<Raw> {
  const p = s.proofs.find((x) => x.id === op.proofId);
  if (p === undefined) return err("not-found", `no proof ${op.proofId} on ${s.name}`);
  const note = op.note?.trim();
  const proofs = s.proofs.map((x) => {
    if (x.id !== p.id) return x;
    const { note: _old, ...rest } = x;
    // A note belongs to a rejection; approving or undeciding drops it, rejecting keeps the old one when no new one came.
    const kept = op.state === "rejected" ? (note !== undefined && note !== "" ? note : x.note) : undefined;
    return { ...rest, state: op.state, ...(kept === undefined ? {} : { note: kept }) };
  });
  const evidence = op.state === "pending" ? s.evidence : [...s.evidence, proofEvidence(s.id, p, op.state === "approved" ? "keep" : "reject", who.at)];
  return ok({ ...rawOf(s), proofs, evidence });
}

function duplicate(s: Style, name: string | undefined, id: string): Result<Raw> {
  return ok({
    id,
    name: name?.trim() || `${s.name} copy`,
    family: s.family,
    origin: s.origin,
    duplicatedFrom: s.id,
    ...(s.discipline === undefined ? {} : { discipline: s.discipline }),
    observables: wordsOf(s.observables),
    recipe: s.recipe,
    negative: s.negative,
    ...(s.palette === undefined ? {} : { palette: s.palette }),
    ...(s.block === undefined ? {} : { block: s.block }),
    elements: s.elements,
    evidence: [],
    exemplars: [],
    proofs: [],
  });
}

/** `freshId` names the duplicate (the store knows which ids are taken). */
export function applyOp(s: Style, op: StyleOp, who: Who, freshId: () => string): Result<Applied> {
  let raw: Result<Raw>;
  switch (op.kind) {
    case "rename": {
      const name = op.name.trim();
      if (name === "") return refused("a style needs a name");
      raw = ok({ ...rawOf(s), name });
      break;
    }
    case "set-block":
      raw = ok({ ...rawOf(s), block: { ...op.block, palette: [...op.block.palette] }, palette: [...op.block.palette] });
      break;
    case "set-elements":
      raw = ok({ ...rawOf(s), elements: [...new Set(op.elements.map((e) => e.trim()).filter((e) => e !== ""))] });
      break;
    case "judge-proof":
      raw = judged(s, op, who);
      break;
    case "remove-proof": {
      const p = s.proofs.find((x) => x.id === op.proofId);
      if (p === undefined) return err("not-found", `no proof ${op.proofId} on ${s.name}`);
      if (p.state === "rejected") return refused("a rejection stays on the sheet — it is the record of what this style is not");
      if (p.state === "approved") return refused("undecide the approval first — an approval is evidence the style was proven on");
      raw = ok({ ...rawOf(s), proofs: s.proofs.filter((x) => x.id !== p.id) });
      break;
    }
    case "promote-proof": {
      const p = s.proofs.find((x) => x.id === op.proofId);
      if (p === undefined) return err("not-found", `no proof ${op.proofId} on ${s.name}`);
      if (p.state !== "approved") return refused("only an approved plate goes on the shelf");
      raw = ok({ ...rawOf(s), proofs: s.proofs.map((x) => (x.id === p.id ? { ...x, promotedAt: x.promotedAt ?? who.at } : x)) });
      break;
    }
    case "lock": {
      if (s.lock !== undefined) return refused("already locked — a lock is one-way");
      const blocker = lockBlocker(s);
      if (blocker !== null) return refused(blocker);
      raw = ok({ ...rawOf(s), lock: { at: who.at, by: who.by } });
      break;
    }
    case "duplicate": {
      const made = duplicate(s, op.name, freshId());
      if (!made.ok) return made;
      const created = door(made.value);
      return created.ok ? ok({ kind: "applied", next: s, created: created.value }) : created;
    }
  }
  if (!raw.ok) return raw;
  const next = door(raw.value);
  if (!next.ok) return next;
  const blocked = ratchetBlocker(s, next.value);
  return blocked === null ? ok({ kind: "applied", next: next.value }) : refused(blocked);
}
