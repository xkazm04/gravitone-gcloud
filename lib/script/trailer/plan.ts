// THE TRAILER EDIT PLAN — what the model returns for a trailer cut, and the
// refusal layer between it and the cut.
//
// Same stance as `../editPlan.ts`: the schema is a REQUEST (the local CLI has no
// `output_config.format`), so `parseTrailerPlan` is where the contract is
// actually enforced. The vocabulary is `BeatPatch` per beat (`./cut.ts`) until a
// `CutOp` vocabulary exists; the plan's op shape is the seam that vocabulary
// would replace.
//
// THE SPINE STAYS THE CREATOR'S. A patch can change what a beat says and how it
// connects (label, text, connector, raises, promises, spends). It can never
// change `kind` or `movement`, and it can never name a beat the cut does not
// have. Those are refused, not repaired, and the refusal lists every finding so
// the creator sees what the model tried.

import { withBeat, type BeatPatch } from "@/lib/script/trailer/cut";
import type { TrailerCut } from "@/lib/script/trailer/types";
import type { StructureReport } from "@/lib/script/trailer/report";

export interface TrailerPlanOp {
  beatId: string;
  patch: BeatPatch;
  /** Written for the person deciding whether to accept it. */
  why: string;
}

export interface TrailerPlan {
  ops: TrailerPlanOp[];
  summary: string;
}

/** The fields a patch may carry — `BeatPatch`'s keys, as runtime data. */
export const PATCHABLE_FIELDS = ["label", "text", "connector", "raises", "promises", "spends"] as const;
const FORBIDDEN_FIELDS = ["kind", "movement"] as const;

const CONNECTOR_ENUM = ["BUT", "THEREFORE", "AND THEN"] as const;
const RAISES_ENUM = ["scale", "threat", "speed", "intimacy", "cost"] as const;

/** The shape the engine must return, as JSON Schema. A function of the cut: the
 *  `beatId` enum is the cut's ACTUAL beat ids, so the contract itself forbids
 *  naming a beat that is not there. `kind` and `movement` are absent from the
 *  patch properties and `additionalProperties` is false. */
export function trailerEditPlanSchema(cut: Pick<TrailerCut, "beats">) {
  return {
    type: "object",
    properties: {
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            beatId: { type: "string", enum: cut.beats.map((b) => b.id) },
            patch: {
              type: "object",
              properties: {
                label: { type: "string" },
                text: { type: "string" },
                connector: { type: "string", enum: CONNECTOR_ENUM },
                raises: { type: "array", items: { type: "string", enum: RAISES_ENUM } },
                spends: { type: "array", items: { type: "string" } },
              },
              additionalProperties: false,
            },
            why: { type: "string", description: "written for the person deciding whether to accept it" },
          },
          required: ["beatId", "patch", "why"],
          additionalProperties: false,
        },
      },
      summary: { type: "string" },
    },
    required: ["ops", "summary"],
    additionalProperties: false,
  } as const;
}

export type ParsedTrailerPlan =
  | { ok: true; plan: TrailerPlan }
  | { ok: false; findings: string[] };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Validate a model's raw plan against the cut it was written for. All-or-
 *  nothing: one bad op refuses the plan, with every problem listed, because a
 *  half-applied plan is a cut nobody reviewed. */
export function parseTrailerPlan(cut: TrailerCut, raw: unknown): ParsedTrailerPlan {
  const findings: string[] = [];
  if (!isObj(raw) || !Array.isArray(raw.ops)) {
    return { ok: false, findings: ["The plan is not an object with an `ops` array."] };
  }
  const known = new Set(cut.beats.map((b) => b.id));
  const patchable = PATCHABLE_FIELDS as readonly string[];
  const forbidden = FORBIDDEN_FIELDS as readonly string[];
  const ops: TrailerPlanOp[] = [];

  raw.ops.forEach((o, i) => {
    const at = `op ${i + 1}`;
    if (!isObj(o) || typeof o.beatId !== "string" || !isObj(o.patch)) {
      findings.push(`${at}: needs a string beatId and an object patch.`);
      return;
    }
    if (!known.has(o.beatId)) {
      findings.push(`${at}: beat "${o.beatId}" is not in the cut.`);
      return;
    }
    let clean = true;
    for (const k of Object.keys(o.patch)) {
      if (forbidden.includes(k)) {
        findings.push(`${at} (${o.beatId}): changes \`${k}\` — the spine stays the creator's.`);
        clean = false;
      } else if (!patchable.includes(k)) {
        findings.push(`${at} (${o.beatId}): unknown patch field \`${k}\`.`);
        clean = false;
      }
    }
    if (!clean) return;
    ops.push({
      beatId: o.beatId,
      // Keys were checked against PATCHABLE_FIELDS just above; value types are
      // the schema's request, not a guarantee.
      patch: o.patch as BeatPatch,
      why: typeof o.why === "string" ? o.why : "",
    });
  });

  if (findings.length) return { ok: false, findings };
  return { ok: true, plan: { ops, summary: typeof raw.summary === "string" ? raw.summary : "" } };
}

/** The candidate cut: the plan's ops replayed over the cut, in order. Pure; the
 *  saved cut is untouched until the creator accepts. */
export function replayTrailerPlan(cut: TrailerCut, plan: TrailerPlan): TrailerCut {
  return plan.ops.reduce((c, op) => withBeat(c, op.beatId, op.patch), cut);
}

export interface StructureDelta {
  /** Violations in the current cut that the candidate no longer has. */
  closed: string[];
  /** Violations the candidate has that the current cut did not. Reported beside
   *  Accept; never a block ("never the gate", `./structure.ts`). */
  opened: string[];
  enforcedBefore: number;
  enforcedAfter: number;
}

/** Violations compared by `rule/subject` identity, not by count, so a plan that
 *  closes one violation and opens another reads as 1 closed AND 1 opened rather
 *  than as no change. */
export function structureDelta(
  current: Pick<StructureReport, "findings" | "enforced">,
  candidate: Pick<StructureReport, "findings" | "enforced">,
): StructureDelta {
  const keys = (r: Pick<StructureReport, "findings">) =>
    new Set(r.findings.filter((f) => f.verdict === "violation").map((f) => `${f.rule}/${f.subject}`));
  const before = keys(current);
  const after = keys(candidate);
  return {
    closed: [...before].filter((k) => !after.has(k)),
    opened: [...after].filter((k) => !before.has(k)),
    enforcedBefore: current.enforced,
    enforcedAfter: candidate.enforced,
  };
}
