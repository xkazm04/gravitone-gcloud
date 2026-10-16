import { z } from "zod";

import { defineStepRecord, engineField, textOrNull, versionField } from "./record.ts";

// THE SCRIPT PART'S RECORDS (v1 app/_phases/script/records.ts, app/_phases/_shared/records/ads.ts;
// shapes lib/steps/stepDataScript.ts, app/_phases/script/history.ts, lib/script/trailer/ops.ts).
//
// What changed from v1, additively:
//   script-versions  `candidates` + `engine` - v1's candidates were three hard-coded renders
//                    (lib/script/renders.ts) that every project shared, so `/api/script`
//                    (compose) had no caller. A compose turn's renders are THIS project's and
//                    land here, beside the version ledger whose `beats` are keyed by render id.
//                    `staged` is the staged Version itself (v1 kept a StagedRecord wrapper whose
//                    damage dropped only itself - kept: a malformed `staged` is dropped with the
//                    reason in `stagedDropped`, never the whole ledger).

export const SCRIPT_ADOPTED = defineStepRecord({
  key: "script-adopted",
  owner: "script",
  version: 1,
  // `""` = cleared here, kept distinct from no record at all (v1 useAdoption `everWritten`).
  schema: z.looseObject({ ...versionField, renderId: z.string().default("") }),
});

const version = z.looseObject({ id: z.string().min(1), label: z.string(), basedOn: z.string().nullable().optional() });

export const SCRIPT_VERSIONS = defineStepRecord({
  key: "script-versions",
  owner: "script",
  version: 1,
  schema: z
    .looseObject({
      ...versionField,
      notes: z.array(z.looseObject({ id: z.string().min(1), cardId: z.string().min(1), kind: z.string() })).default([]),
      /** Accepted versions, oldest first. */
      accepted: z.array(version).default([]),
      digest: z.string().optional(),
      staged: z.unknown().optional(),
      stagedDropped: z.string().optional(),
      candidates: z.array(z.looseObject({ id: z.string().min(1), title: z.string(), beats: z.array(z.looseObject({})) })).default([]),
      engine: engineField.default(null),
    })
    .transform((r) => {
      if (r.staged === undefined || r.staged === null) {
        const { staged: _drop, ...rest } = r;
        void _drop;
        return rest;
      }
      const s = version.safeParse(r.staged);
      if (s.success) return { ...r, staged: s.data };
      const { staged: _bad, ...rest } = r;
      void _bad;
      return { ...rest, stagedDropped: "script-versions.staged is not a staged version" };
    }),
});

export const SCRIPT_TRAILER = defineStepRecord({
  key: "script-trailer",
  owner: "script",
  version: 1,
  // v1: a record without a cut is not one useTrailerCut wrote - it never saves a null cut.
  schema: z.looseObject({
    ...versionField,
    cut: z.looseObject({ beats: z.array(z.looseObject({ id: z.string().min(1) })) }),
    budget: z.looseObject({}).optional(),
    /** The confirmed spine the cut was composed from; another spine on the board = the cut predates it. */
    spine: z.record(z.string(), z.string()).optional(),
    origin: z.looseObject({}).optional(),
    originBudget: z.looseObject({}).optional(),
    ops: z.array(z.looseObject({})).optional(),
    head: z.number().int().nonnegative().optional(),
  }),
});

export const adShotSchema = z.looseObject({ id: z.string().min(1), durationS: z.number().positive() });

export const ADS_SCENARIOS = defineStepRecord({
  key: "ads-scenarios",
  owner: "script",
  version: 1,
  schema: z.looseObject({
    ...versionField,
    /** The idea the scenarios execute: another picked idea makes them stale. */
    ideaId: textOrNull.default(null),
    options: z.array(z.looseObject({ id: z.string().min(1), title: z.string(), shots: z.array(adShotSchema) })).default([]),
    pickedId: textOrNull.default(null),
    engine: engineField.default(null),
  }),
});
