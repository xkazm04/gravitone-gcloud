"use client";

// A STEP RECORD, HYDRATED — and a save that cannot be armed by a read that did
// not happen.
//
// `useStepFor` (../useLoadFor.ts) already refused to hydrate on a FAILED read.
// This is the same rule over a record def, extended to the read that SUCCEEDED
// but was refused: a record from a newer build, or one the def cannot parse.
// Both leave the hook un-hydrated, and `save` answers `refused: "unread"`
// without touching the store — a surface whose save effect fires on hydration
// therefore never fires at all.
//
// `patch` is NOT gated on hydration, on purpose: `patchRecord` reads, checks
// and writes inside one transaction, so it cannot write over a record it has
// not read. A patch issued before hydration merges onto disk truth.

import { useCallback, useState } from "react";

import { useLoadFor } from "../useLoadFor";
import { patchRecord, saveRecord, type RecordWriteOutcome } from "./patch";
import { readRecord, type RecordDef, type Refused } from "./registry";

export interface RecordHook<T extends object> {
  /** The current project's record has been read and handed to `apply`. */
  hydrated: boolean;
  /** The current project's record was read and refused — shown to nobody,
   *  written by nobody. Null otherwise (including a failed read, which reports
   *  through the store's trouble channel instead). */
  refused: Refused | null;
  /** Replace the record. Refused as `unread` until `hydrated`. */
  save: (data: T) => Promise<RecordWriteOutcome>;
  /** Merge into the record atomically; see the header for why it is ungated. */
  patch: (fn: (current: T | undefined) => T) => Promise<RecordWriteOutcome>;
}

export function useRecord<T extends object>(
  def: RecordDef<T>,
  projectId: string,
  apply: (data: T | undefined) => void,
): RecordHook<T> {
  const key = `${projectId}:${def.key}`;
  // Keyed like `useLoadFor`'s own flag: a refusal for project A must not be
  // reported while project B's read is in flight.
  const [refusal, setRefusal] = useState<{ key: string; why: Refused } | null>(null);

  const hydrated = useLoadFor(
    key,
    () => readRecord(def, projectId),
    (outcome, k) => {
      if (!outcome.ok) {
        if ("refused" in outcome) setRefusal({ key: k, why: outcome });
        return false;
      }
      setRefusal(null);
      apply(outcome.data);
    },
  );

  const save = useCallback(
    async (data: T): Promise<RecordWriteOutcome> => {
      if (!hydrated)
        return {
          ok: false,
          refused: "unread",
          detail: `${def.key} for ${projectId} was never read successfully; a save would replace what is stored`,
        };
      return saveRecord(def, projectId, data);
    },
    [hydrated, def, projectId],
  );

  const patch = useCallback(
    (fn: (current: T | undefined) => T) => patchRecord(def, projectId, fn),
    [def, projectId],
  );

  return { hydrated, refused: refusal?.key === key ? refusal.why : null, save, patch };
}
