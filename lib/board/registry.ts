// THE SOURCE REGISTRY — every human gate in the app, reachable by id, loaded
// only when asked.
//
// Lazy in two senses, both from the brief's risk line ("lazy per-source load,
// counted not fully hydrated"):
//   · MODULE. Each adapter is a dynamic import, so the Board's first paint does
//     not carry the step store, the render registry and the notebook fixture
//     for sources nobody has opened.
//   · DATA. `count()` is asked of every source first — for the foundry
//     sources that is one summary request each, never a run detail — and
//     `loadEntries()` only for the sources the view actually shows.
//
// A source's STATE is a first-class value, not an exception: loading, loaded
// (with items), empty (read fine, nothing there), unavailable (could not be
// read here — no route, no network, no IndexedDB, no account) or error (read
// and failed, with the real message).

import { SourceUnavailable, type BoardCount, type BoardEntry, type BoardSourceExt } from "./source";
import { SOURCE_ORDER } from "./source";
import type { BoardSourceId } from "./types";

export interface SourceCtx {
  uid: string | null;
}

type Loader = (ctx: SourceCtx) => Promise<BoardSourceExt>;

const LOADERS: Record<BoardSourceId, Loader> = {
  cull: () => import("./sources/cull").then((m) => m.makeCullSource()),
  extract: () => import("./sources/extract").then((m) => m.makeExtractSource()),
  dojo: () => import("./sources/dojo").then((m) => m.makeDojoSource()),
  proof: (ctx) => import("./sources/proof").then((m) => m.makeProofSource(ctx)),
  adoption: (ctx) => import("./sources/adoption").then((m) => m.makeAdoptionSource(ctx)),
  alternative: (ctx) => import("./sources/alternative").then((m) => m.makeAlternativeSource(ctx)),
  triage: (ctx) => import("./sources/triage").then((m) => m.makeTriageSource(ctx)),
  publish: () => import("./sources/publish").then((m) => m.makePublishSource()),
  articles: () => import("./sources/articles").then((m) => m.makeArticlesSource()),
};

/** Labels without loading a module — the rail draws before any source answers. */
export const SOURCE_LABEL: Record<BoardSourceId, string> = {
  cull: "Cull",
  extract: "Extract",
  dojo: "Dojo",
  proof: "Proofs",
  adoption: "Adoption",
  alternative: "Alternatives",
  triage: "Triage",
  publish: "Publish",
  articles: "Articles",
};

export type SourceState =
  | { kind: "idle" }
  | { kind: "loading"; count: BoardCount | null }
  | { kind: "counted"; count: BoardCount }
  | { kind: "loaded"; count: BoardCount; entries: BoardEntry[] }
  | { kind: "empty"; count: BoardCount }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; message: string };

export function createRegistry(ctx: SourceCtx) {
  const cache = new Map<BoardSourceId, Promise<BoardSourceExt>>();
  const get = (id: BoardSourceId): Promise<BoardSourceExt> => {
    let p = cache.get(id);
    if (!p) {
      p = LOADERS[id](ctx);
      cache.set(id, p);
    }
    return p;
  };
  return { get, ids: SOURCE_ORDER };
}

export type Registry = ReturnType<typeof createRegistry>;

/** A failure, as the state the rail draws. */
export function stateOfError(e: unknown): SourceState {
  if (e instanceof SourceUnavailable) return { kind: "unavailable", reason: e.message };
  return { kind: "error", message: e instanceof Error ? e.message : String(e) };
}

/** Counts → the state before items: an empty source says so without a load. */
export function stateOfCount(count: BoardCount): SourceState {
  return count.total === 0 ? { kind: "empty", count } : { kind: "counted", count };
}

export function stateOfEntries(count: BoardCount, entries: BoardEntry[]): SourceState {
  return entries.length === 0 ? { kind: "empty", count } : { kind: "loaded", count, entries };
}
