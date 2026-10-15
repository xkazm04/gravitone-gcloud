import "server-only";

import { extractSource } from "./sources/extract.ts";
import { forgeSource } from "./sources/forge.ts";
import { trainingSource } from "./sources/training.ts";
import type { Source } from "./types.ts";

// EVERY v1 STORE THE LEDGER PROJECTS, one line each (COMMON decision 5). The
// sync, Runs' live read and the reconcile probe all walk this list, so a
// source added here is synced, drawn and reconciled with no other change.
// Order is the report's order, nothing more: sources never depend on each other.

export const V1_SOURCES: readonly Source<unknown>[] = [
  forgeSource,
  extractSource,
  trainingSource,
];
