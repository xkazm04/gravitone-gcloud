import type { LoadSample } from "@gt/domain/load";
import type { Reader } from "../store.ts";

// THE BOX'S LOAD SAMPLES (spark night-load-band) - one row a minute, written by the always-on worker's
// `load-sample` timer, read by a /scout night over its window.
//
// WP-L0 CONTRACT STUB: the read signature is final; WP-L1 adds the migration module (registered in ../kernel.ts
// beside resourcesMigrations), the writer and the prune, and fills this body.

/** The samples taken in [fromMs, toMs], oldest first. */
export function readLoadSamples(_r: Reader, _fromMs: number, _toMs: number): LoadSample[] {
  return [];
}
