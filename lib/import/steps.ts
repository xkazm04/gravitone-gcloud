import { encodeRecord, isStepKey, STEP_RECORDS, type StepKey, type StepKind } from "@gt/domain/steps/registry";

import { framesV1ToV2 } from "@/app/_phases/frames/picture/migrate";

import { markOriginal, refsInRecord, type Sink } from "./bytes.ts";

// ONE v1 STEP ROW -> ONE PART RECORD (Phase 4 wave D, L42), through @gt/domain/steps' doors.
//
// v1 kept a project's work as rows `{id: "<projectId>:<key>", projectId, phase: <key>, data}` in
// one IndexedDB store (app/_phases/_shared/records/registry.ts). The kernel keeps the same keys
// as `part_records`, each owned by the part of its step kind (STEP_RECORDS[key].owner). The walk
// up to the kernel's version is v1's own where v1 had one, and the importer's where the domain
// door said it would be (packages/domain/src/steps/frames.ts: "the importer is the road"):
//   frames v1   v1's `framesV1ToV2` (app/_phases/frames/picture/migrate.ts, pure, the render
//               registry it reads ships in this build) - then as v2;
//   frames v2   plates' base64 -> blob refs (./bytes.ts), the `frames` shadow dropped (v3 holds
//               units only; v1's own reader rebuilt the shadow from units on every read);
//   frames-alts v1 -> v2   the same plate rule;
//   the rest    v1 = the kernel's v1; the stored `v` is stripped and the door stamps it.
// The record is then put through its door (`encodeRecord`) here, at staging, so a record the
// door refuses is known before the review screen, not discovered inside the transaction.
//
// NOTHING IS DROPPED SILENTLY (registry import-normalization/lossy-conversion-disclosure). Every
// row comes back graded on the closed scale:
//   full        held by its part, as v1 meant it;
//   data-only   carried in the import record verbatim (re-exported byte for byte) but held by no
//               part: a key no step record declares (`script-mode`, v1's guided/expert switch for
//               the script editor), a record of a part the recipe does not have (an album video's
//               step rows - its parts are still, words, render), a newer build's record (v1 rule:
//               never written over), or one its door refuses, with the door's sentence.

export type Grade = "full" | "approximate" | "data-only" | "dropped";
export type Loss = { readonly entity: string; readonly grade: Exclude<Grade, "full">; readonly reason: string };

export type StagedStep = {
  /** v1's record key (the row's `phase`). */
  readonly key: string;
  /** The row with its byte strings marked, for the byte-exact re-export. */
  readonly original: unknown;
  /** Present when a part holds it: the record at the kernel's version, `v` absent (the door stamps it). */
  readonly held?: { readonly key: StepKey; readonly owner: StepKind; readonly record: Readonly<Record<string, unknown>> };
  readonly loss?: Loss;
};

type Obj = Readonly<Record<string, unknown>>;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function withoutV(o: Obj): Record<string, unknown> {
  const { v: _v, ...rest } = o;
  void _v;
  return rest;
}

/** The record walked up to its def's version, bytes as refs. A string is the refusal. */
function lift(key: StepKey, data: Obj, sink: Sink): Record<string, unknown> | string {
  const def = STEP_RECORDS[key];
  const raw = data["v"] ?? 1;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) return `${key}.v is ${String(raw)}`;
  if (key === "frames") {
    if (raw > 3) return `${key} was written as v${raw} by a newer build; this build reads up to v3`;
    // v3 is the kernel's own shape - a re-imported kernel export; v1 and v2 are v1's.
    const v2 = raw === 1 ? framesV1ToV2({ ...data }) : { ...data };
    const { frames: _shadow, ...units } = withoutV(v2);
    void _shadow;
    const lifted = refsInRecord(units, sink);
    return isObj(lifted) ? lifted : "frames is not an object";
  }
  if (key === "frames-alts") {
    if (raw > 2) return `${key} was written as v${raw} by a newer build; this build reads up to v2`;
    const lifted = refsInRecord(withoutV(data), sink);
    return isObj(lifted) ? lifted : "frames-alts is not an object";
  }
  if (raw > def.version) return `${key} was written as v${raw} by a newer build; this build reads up to v${def.version}`;
  return withoutV(data);
}

/**
 * Stage one v1 step row. `owners`: the step kinds whose part the recipe has (a film has all six,
 * an album video none). Bytes the row carries are staged into `sink` either way - the original
 * keeps them as refs too.
 */
export function stageStep(row: Obj, owners: ReadonlySet<StepKind>, sink: Sink): StagedStep {
  const key = String(row["phase"]);
  const original = markOriginal(row, sink);
  const data = row["data"];
  if (!isObj(data)) return { key, original, loss: { entity: key, grade: "data-only", reason: `${key} is stored as ${Array.isArray(data) ? "a list" : typeof data}, not an object` } };
  if (!isStepKey(key)) return { key, original, loss: { entity: key, grade: "data-only", reason: `no part record is named ${key}; carried in the import record` } };
  const owner = STEP_RECORDS[key].owner;
  if (!owners.has(owner)) return { key, original, loss: { entity: key, grade: "data-only", reason: `this recipe has no ${owner} part to hold ${key}; carried in the import record` } };
  const lifted = lift(key, data, sink);
  if (typeof lifted === "string") return { key, original, loss: { entity: key, grade: "data-only", reason: lifted } };
  const door = encodeRecord(key, lifted);
  if (!door.ok) return { key, original, loss: { entity: key, grade: "data-only", reason: door.error.message } };
  return { key, original, held: { key, owner, record: lifted } };
}
