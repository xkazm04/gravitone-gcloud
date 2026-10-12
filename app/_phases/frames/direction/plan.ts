// THE DIRECTION PASS AS A PROPOSAL — pure functions, no React, no I/O.
//
// "Direct the cut" is the most expensive call in the step. Applying its answer
// wholesale (`applySceneSpecs`) erased human fact bindings and hand placement
// with no undo. This module turns the answer into typed ops that can be shown,
// accepted per beat, and reverted:
//
//   planFromSpecs    specs -> a DirectionProposal; reads frames, writes nothing
//   applyOps         one frame + its ops + a conflict policy -> the new frame
//   acceptProposal   fold accepted rows into the cut, returning a checkpoint
//   revertPass/Row   restore from that checkpoint
//
// A CONFLICT is an op that would overwrite a layer a human touched (`by:
// "human"`, set by bindFact / moveLayer / setText). Its default is KEEP.

import type { Frame, FrameElement, FrameText, TextRole } from "../frames";
import type { SceneSpec, SpecRejection } from "../sceneSpec";

export type EditOp =
  | { type: "setSubject"; subject: string }
  | { type: "setMotion"; motion: string }
  | { type: "setRationale"; rationale: string }
  | { type: "replaceElements"; elements: Omit<FrameElement, "id">[] }
  /** Write one text. `matchId` is the existing text it lands on (same role, same
   *  ordinal); absent means a new layer. `keepFactId` carries the existing
   *  binding when the spec cites none, so a pass cannot unbind a figure. */
  | { type: "upsertText"; matchId?: string; text: Omit<FrameText, "id">; keepFactId?: string }
  | { type: "removeText"; id: string };

export interface Conflict {
  layer: "element" | "text";
  /** The human-touched layer ids this op would overwrite. */
  ids: string[];
}

export interface ProposalUnit {
  at: string;
  /** The frame as it was when the proposal was planned. */
  before: Frame;
  ops: EditOp[];
  conflicts: Conflict[];
  rejected?: string;
}

export interface DirectionProposal {
  units: ProposalUnit[];
  /** Beats the engine never mentioned; their frames are untouched. */
  missing: string[];
  createdAt: number;
}

/** `keep` retains human layers; `overwrite` is the explicit opt-in. */
export type ConflictPolicy = "keep" | "overwrite";

const isHuman = (l: { by?: string }) => l.by === "human";

/** Conflicts an op list would raise against this frame. The single source for
 *  both the proposal's conflict list and applyOps' keep/overwrite decision. */
export function conflictsOf(frame: Frame, ops: EditOp[]): Conflict[] {
  const out: Conflict[] = [];
  for (const op of ops) {
    if (op.type === "replaceElements") {
      const ids = frame.elements.filter(isHuman).map((e) => e.id);
      if (ids.length) out.push({ layer: "element", ids });
    } else if (op.type === "upsertText" && op.matchId) {
      const t = frame.texts.find((x) => x.id === op.matchId);
      if (t && isHuman(t)) out.push({ layer: "text", ids: [t.id] });
    } else if (op.type === "removeText") {
      const t = frame.texts.find((x) => x.id === op.id);
      if (t && isHuman(t)) out.push({ layer: "text", ids: [t.id] });
    }
  }
  return out;
}

/** Match each spec text to an existing text of the same role, by ordinal. */
function textOps(frame: Frame, texts: SceneSpec["texts"]): EditOp[] {
  const pool = new Map<TextRole, FrameText[]>();
  for (const t of frame.texts) pool.set(t.role, [...(pool.get(t.role) ?? []), t]);
  const used = new Set<string>();
  const ops: EditOp[] = [];
  for (const text of texts) {
    const match = pool.get(text.role)?.shift();
    if (match) used.add(match.id);
    ops.push({
      type: "upsertText",
      matchId: match?.id,
      text,
      ...(match?.factId && !text.factId ? { keepFactId: match.factId } : {}),
    });
  }
  for (const t of frame.texts) if (!used.has(t.id)) ops.push({ type: "removeText", id: t.id });
  return ops;
}

/** Turn a pass's surviving specs (and what it refused) into a proposal. Reads
 *  `frames`; changes nothing. Frames with neither a spec nor a rejection have no
 *  unit — they are not part of the proposal. */
export function planFromSpecs(
  frames: Frame[],
  specs: SceneSpec[],
  rejected: SpecRejection[] = [],
  now: number = Date.now(),
): DirectionProposal {
  const specAt = new Map(specs.map((s) => [s.beatAt, s]));
  const rejAt = new Map(rejected.map((r) => [r.beatAt, r.reason]));
  const units: ProposalUnit[] = [];
  const mentioned = new Set<string>();
  for (const f of frames) {
    const s = specAt.get(f.at);
    const reason = rejAt.get(f.at);
    if (s) {
      mentioned.add(f.at);
      const ops: EditOp[] = [
        { type: "setSubject", subject: s.subject },
        { type: "setMotion", motion: s.motion },
        { type: "setRationale", rationale: s.rationale },
        { type: "replaceElements", elements: s.elements },
        ...textOps(f, s.texts),
      ];
      units.push({ at: f.at, before: f, ops, conflicts: conflictsOf(f, ops) });
    } else if (reason !== undefined) {
      mentioned.add(f.at);
      units.push({ at: f.at, before: f, ops: [], conflicts: [], rejected: reason });
    }
  }
  return { units, missing: frames.filter((f) => !mentioned.has(f.at)).map((f) => f.at), createdAt: now };
}

const fresh = (taken: Set<string>, base: string) => {
  let id = base;
  for (let n = 1; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
};

/** Apply one frame's ops. Under `keep`, a human-touched layer an op would
 *  overwrite is left exactly as it was; under `overwrite` it is replaced. */
export function applyOps(frame: Frame, ops: EditOp[], policy: ConflictPolicy = "keep"): Frame {
  let f = frame;
  for (const op of ops) {
    switch (op.type) {
      case "setSubject":
        // renderedSubject is deliberately NOT touched: that is what makes the
        // plate stale when the subject moves on.
        f = { ...f, plate: { ...f.plate, subject: op.subject } };
        break;
      case "setMotion":
        f = { ...f, clip: { ...(f.clip ?? { status: "not-started" as const, motion: "" }), motion: op.motion } };
        break;
      case "setRationale":
        f = { ...f, rationale: op.rationale };
        break;
      case "replaceElements": {
        const kept = policy === "keep" ? f.elements.filter(isHuman) : [];
        const taken = new Set(kept.map((e) => e.id));
        f = {
          ...f,
          elements: [
            ...kept,
            ...op.elements.map((e, i) => ({ ...e, id: fresh(taken, `e-${f.id}-${i}`), by: "pass" as const })),
          ],
        };
        break;
      }
      case "upsertText": {
        const cur = op.matchId ? f.texts.find((t) => t.id === op.matchId) : undefined;
        if (cur && isHuman(cur) && policy === "keep") break;
        if (cur) {
          const factId = op.text.factId ?? op.keepFactId;
          f = {
            ...f,
            texts: f.texts.map((t) =>
              t.id === cur.id ? { ...t, ...op.text, factId, id: cur.id, by: "pass" as const } : t,
            ),
          };
        } else {
          const id = fresh(new Set(f.texts.map((t) => t.id)), `t-${f.id}-${f.texts.length}`);
          f = { ...f, texts: [...f.texts, { ...op.text, id, by: "pass" as const }] };
        }
        break;
      }
      case "removeText": {
        const cur = f.texts.find((t) => t.id === op.id);
        if (cur && isHuman(cur) && policy === "keep") break;
        f = { ...f, texts: f.texts.filter((t) => t.id !== op.id) };
        break;
      }
    }
  }
  return f;
}

/** The cut as it was before a pass was applied. */
export interface Checkpoint {
  frames: Frame[];
  takenAt: number;
}

/** Fold accepted rows into the cut. Frames of unaccepted rows are returned by
 *  reference, so they are byte-identical. `checkpoint` is the pre-accept cut. */
export function acceptProposal(
  frames: Frame[],
  proposal: DirectionProposal,
  accept: ReadonlySet<string> | "all",
  policy: ConflictPolicy = "keep",
  now: number = Date.now(),
): { frames: Frame[]; checkpoint: Checkpoint } {
  const byAt = new Map(proposal.units.map((u) => [u.at, u]));
  const out = frames.map((f) => {
    const u = byAt.get(f.at);
    if (!u || u.ops.length === 0 || (accept !== "all" && !accept.has(f.at))) return f;
    return applyOps(f, u.ops, policy);
  });
  return { frames: out, checkpoint: { frames, takenAt: now } };
}

/** Whole-pass revert: the cut exactly as the checkpoint held it. */
export const revertPass = (_current: Frame[], checkpoint: Checkpoint): Frame[] => checkpoint.frames;

/** Revert one row to its checkpointed frame, leaving the rest as they are. */
export function revertRow(current: Frame[], checkpoint: Checkpoint, at: string): Frame[] {
  const old = checkpoint.frames.find((f) => f.at === at);
  return old ? current.map((f) => (f.at === at ? old : f)) : current;
}
