
// Per-project step content.
//
// A project's steps are its own: opening the Research step of project A must not
// show project B's notebook. This is the store that makes "load the project, load
// its step data" true.
//
// It sits in the same IndexedDB as the projects (lib/studioDb.ts) in its own
// object store, keyed `${projectId}:${phase}`. Kept separate from the project
// record deliberately — step content is large and grows, and a project row that
// carried every notebook would have to be read in full just to draw the shelf.
//
// FAILURE IS NOT SWALLOWED HERE, and it used to be. `withStore` wrapped every
// operation in `try { … } catch { return fallback }`, so a quota-exceeded write,
// a blocked-tab upgrade and a missing object store all resolved to the same
// quiet nothing — one layer above lib/studioDb.ts's own header promising the
// opposite ("Failures are NOT swallowed here… has to reach the caller"). Base64
// proofs and plates make quota exhaustion a real destination and not a
// theoretical one: a composed 16-frame cut is ~5MB (frames/useFrames.ts) and a
// theme proof sheet ~3.5MB (lib/themes.ts), both measured in this repo.
//
// The shape of the fix is chosen for the call sites that exist. Every caller
// fires and forgets — `void saveStep(...)` on every keystroke — and that is the
// RIGHT ergonomics for a save that runs that often. So nothing here rejects:
// `saveStep` RESOLVES to an outcome a caller may ignore, and every failure is
// also pushed to the one channel below, which a surface subscribes to once. The
// point was never that each call site grows a try/catch; it is that failure
// stops being unobservable.

// THIS FILE IS THE DOOR. The implementations live in sibling files in this
// directory; every name below is re-exported from its owner, unchanged, so the
// import path `_shared/stepStore` stays the one thing importers depend on.

export type {
  ResearchStepData,
  ResearchNotebookStepData,
  ScopeStepData,
  BeatPicksStepData,
  GuidedModeStepData,
} from "./stepDataResearch";
export type {
  ScriptAdoptionStepData,
  TrailerCutStepData,
  CutStepData,
  ScoreStepData,
} from "./stepDataScript";
export type { MusicVideoSourceStepData } from "./stepDataMusicVideo";
export { downstreamCount, withTrack } from "./stepDataMusicVideo";
export type { StorageFailure, StorageTrouble, SaveOutcome, ReadOutcome } from "./storageOutcome";
export { onStorageTrouble, lastStorageTrouble, clearStorageTrouble } from "./troubleChannel";
export type { StorageOkListener } from "./okChannel";
export { onStorageOk, noteStorageOk } from "./okChannel";
export { reportStorageTrouble, reportTaskTrouble } from "./reportTrouble";
export type { SaveSlot } from "./saveOrder";
export { claimSaveSlot, __resetSaveSlots } from "./saveOrder";
export { readStep, loadStep } from "./readStep";
export { SCHEMA_VERSION } from "./schemaVersion";
export type { SaveWatcher } from "./saveWatchers";
export { onSaveIssued } from "./saveWatchers";
export { saveStep } from "./saveStep";
export type { StepDecision, PatchStepOutcome } from "./patchStep";
export { patchStep } from "./patchStep";
