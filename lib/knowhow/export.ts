// THE KNOW-HOW EXPORT (spark device-metadata-sync, KS1) - this device's know-how written into the tracked `knowhow/`
// folder (packages/domain/src/knowhow.ts is the contract), so the next ordinary commit carries it. Three streams:
//
//   characters   the production cores (files) and the kernel's character records (store)    ./characters.ts
//   lanes        FINDINGS, the director's bible, the skills' LESSONS (files); accepted       ./lanes.ts
//                production lessons (store); append-only, a lane file is never rewritten
//   productions  every production state file                                                 ./productions.ts
//
// The store-backed halves run only with a store handed in: the running app's afterWrite hook passes the process's
// kernel; the backfill CLI opens one only when GRAVITONE_STORE_PATH names it (a session never opens the operator's).

import { existsSync } from "node:fs";

import { knowhowPaths, type Device } from "@gt/domain/knowhow";
import { charactersForExport } from "@gt/kernel/characters/store";
import { acceptedLessons, lessonsOf } from "@gt/kernel/productions/lessons";
import type { NotPromise, Reader, Store } from "@gt/kernel/store";

import { readState, statePath } from "../production/state.ts";
import { exportCores, exportKernelCharacter, stateIds } from "./characters.ts";
import { thisDevice } from "./device.ts";
import { fileDrafts, kernelLessonDraft, toRecord, type LaneDraft } from "./lanes.ts";
import { exportProduction } from "./productions.ts";
import { emptySummary, put, type ExportSummary } from "./write.ts";

/** `store`: the kernel to read characters and lessons from, when one is at hand (never opened here). */
/** `skills`: the folder whose skills' LESSONS.md are read (default `.claude/skills`; tests). */
export type ExportOptions = { readonly dry?: boolean; readonly store?: Pick<Store, "read">; readonly device?: Device; readonly skills?: string };

function lanes(s: ExportSummary, self: Device, drafts: readonly LaneDraft[], dry: boolean): void {
  for (const d of drafts) {
    const rec = toRecord(d, self.id);
    put(s, rec.id, knowhowPaths.lane(rec.lane, rec.id), rec, { dry, appendOnly: true });
  }
}

function kernel<T>(s: ExportSummary, o: ExportOptions, what: string, f: (r: Reader) => NotPromise<T>): T | undefined {
  if (o.store === undefined) return undefined;
  const r = o.store.read(f);
  if (r.ok) return r.value;
  s.refused.push({ id: what, reason: r.error.message });
  return undefined;
}

/** Every stream there is a source for: the full backfill. `filled` names the streams that had one. */
export function exportAll(o: ExportOptions = {}): ExportSummary & { readonly filled: readonly string[] } {
  const s = emptySummary();
  const self = o.device ?? thisDevice();
  const dry = o.dry === true;
  const filled = ["characters (production cores)", "lanes (FINDINGS, bible, LESSONS)", "productions"];
  exportCores(s, self, dry);
  for (const id of stateIds()) exportProduction(s, self, id, dry);
  lanes(s, self, fileDrafts(o.skills), dry);
  const chars = kernel(s, o, "kernel characters", (r) => charactersForExport(r));
  for (const c of chars ?? []) exportKernelCharacter(s, self, c, dry);
  const lessons = kernel(s, o, "kernel lessons", (r) => acceptedLessons(r).map((x) => x.lesson));
  lanes(
    s,
    self,
    (lessons ?? []).flatMap((l) => kernelLessonDraft(l) ?? []),
    dry,
  );
  if (o.store !== undefined) filled.push("characters (kernel)", "lanes (accepted production lessons)");
  return { ...s, filled };
}

export type TouchedKind = "production" | "character" | "lesson";

/**
 * Only what one write touched. `production`: its file, and every core it cast or styled (her looks and pictures moved).
 * `character`: a kernel record (with a reader) or a production core. `lesson`: a production's accepted lessons.
 */
export function exportTouched(kind: TouchedKind, id: string, o: ExportOptions = {}): ExportSummary {
  const s = emptySummary();
  const self = o.device ?? thisDevice();
  const dry = o.dry === true;
  if (kind === "production") {
    exportProduction(s, self, id, dry);
    const st = existsSync(statePath(id)) ? readState(id) : null;
    if (st?.ok === true) for (const core of new Set([st.value.production.cast.id, ...Object.keys(st.value.styled)])) exportCores(s, self, dry, core);
    return s;
  }
  if (kind === "character") {
    const held = kernel(s, o, id, (r) => charactersForExport(r, id));
    if (held !== undefined && held.length > 0) for (const c of held) exportKernelCharacter(s, self, c, dry);
    else exportCores(s, self, dry, id);
    return s;
  }
  const lessons = kernel(s, o, id, (r) => lessonsOf(r, id)) ?? [];
  lanes(
    s,
    self,
    lessons.flatMap((l) => kernelLessonDraft(l) ?? []),
    dry,
  );
  return s;
}
