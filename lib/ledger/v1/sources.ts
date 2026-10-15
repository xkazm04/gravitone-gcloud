import "server-only";

import { articlesSource } from "./sources/articles.ts";
import { clipsSource } from "./sources/clips.ts";
import { extractSource } from "./sources/extract.ts";
import { forgeSource } from "./sources/forge.ts";
import { gpuSource } from "./sources/gpu.ts";
import { mvSource } from "./sources/mv.ts";
import { publishSource } from "./sources/publish.ts";
import { spendSource } from "./sources/spend.ts";
import { stripsSource } from "./sources/strips.ts";
import { sunoSource } from "./sources/suno.ts";
import { trainingSource } from "./sources/training.ts";
import { turnsSource } from "./sources/turns.ts";
import type { Source } from "./types.ts";

// EVERY v1 STORE THE LEDGER PROJECTS, one line each (COMMON decision 5). The
// sync, Runs' live read and the reconcile probe all walk this list, so a
// source added here is synced, drawn and reconciled with no other change.
// Order is the report's order, nothing more: sources never depend on each other.

export const V1_SOURCES: readonly Source<unknown>[] = [
  forgeSource,
  extractSource,
  trainingSource,
  stripsSource,
  articlesSource,
  sunoSource,
  mvSource,
  publishSource,
  turnsSource,
  spendSource,
  gpuSource,
  clipsSource,
];
