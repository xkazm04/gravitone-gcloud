// Moved to lib/steps/recordRegistry.ts (Phase 4, L46: lib/ may not import app/). Named, not
// `export *`: the probes load this path with a dynamic import, and a star re-export of a module
// compiled to CommonJS reaches them with no named exports at all.
export { RecordRefusal, malformed, defineRecord, recordDefs, isPlainObject, isFromTheFuture, decodeRecord, readRecord } from "@/lib/steps/recordRegistry";
export type { Refused, RecordReadOutcome, Migration, RecordSpec, RecordDef } from "@/lib/steps/recordRegistry";
