// WRITES THROUGH A RECORD DEF.
//
// `patchRecord` replaces the read-merge-write that was copied into
// `research/useMusicVideoSource.ts` and `frames/music-video/useMusicVideoComposition.ts`
// ("copied … verbatim"). Each copy was `claimSaveSlot` + `loadStep` + `saveStep`:
//
//   · two transactions, so another write could land between the read and the
//     put — and the latest-wins ticket made it worse, not better: the FIRST of
//     two patches issued in one tick saw a newer ticket and abandoned, so its
//     field never reached disk;
//   · `loadStep` turns a failed read into `{}`, so a transient failure wrote one
//     field over the envelope, the poster and the seed.
//
// Here the read, the version check, the parse, the merge and the put are one
// readwrite transaction (`patchStep`), and patches to a key apply in the order
// they were issued. A read that fails aborts the transaction; a stored record
// from a newer build or one the def cannot parse is refused inside it.

import {
  patchStep,
  saveStep,
  type SaveOutcome,
} from "../stepStore";

import { decodeRecord, type RecordDef, type Refused } from "./registry";

/** A write's outcome. `SaveOutcome` plus the refusals:
 *
 *  `future` / `malformed` — the stored record is not this build's to overwrite
 *  (see `readRecord`). `unread` — the hook issuing a whole-record save has not
 *  successfully read the record it would replace (`useRecord`). */
export type RecordWriteOutcome =
  | SaveOutcome
  | { ok: false; refused: Refused["refused"] | "unread"; detail: string };

/**
 * Read the stored record, hand it to `fn`, write what `fn` returns — atomically.
 *
 * `fn` gets the record as the def parsed it (`undefined` if never written) and
 * must be synchronous and pure: it runs inside the transaction, and may run on
 * a record a sibling writer changed a moment ago, which is the point.
 */
export async function patchRecord<T extends object>(
  def: RecordDef<T>,
  projectId: string,
  fn: (current: T | undefined) => T,
): Promise<RecordWriteOutcome> {
  const r = await patchStep(
    projectId,
    def.key,
    (stored) => {
      const d = decodeRecord(def, stored);
      if (!d.ok) return { skip: d };
      return { put: fn(d.data) };
    },
    { v: def.version },
  );
  if (!r.ok) return r;
  if (r.wrote) return { ok: true };
  const why = r.skip as Refused;
  return { ok: false, refused: why.refused, detail: why.detail };
}

/**
 * Replace the whole record, stamped with the def's version, latest-wins per key
 * exactly as `saveStep` is.
 *
 * It does NOT re-read the stored record first. A whole-record writer is a hook
 * that read the record and holds it in memory, and the guard against writing
 * over a record it never read (or refused) is `useRecord`'s, which never arms
 * this after a failed or refused read. Re-reading here would buy the narrower
 * case — a newer build's tab writing between this hook's read and its save — at
 * the price of a second full read per save on records measured in megabytes
 * (alternatives ≈1.5MB a scene). Stated rather than hidden; `patchRecord` is the
 * tool when that window matters.
 */
export function saveRecord<T extends object>(
  def: RecordDef<T>,
  projectId: string,
  data: T,
): Promise<SaveOutcome> {
  return saveStep<T>(projectId, def.key, data, { v: def.version });
}
