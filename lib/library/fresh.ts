import "server-only";

import path from "node:path";

import type { Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";

import { FIXTURE_MODE, OUT_DIRNAME } from "../fixtures/mode.ts";
import { kernel } from "../kernelStore.ts";
import { ffmpegProbe } from "../producers/media-facts.ts";
import { dojoFeed, extractFeed, forgeFeed, stripsFeed, stylesFeed } from "./feeds/foundry.ts";
import { mvFeed, registryFeed, takesFeed } from "./feeds/sound.ts";
import type { Feed, FeedCtx } from "./feeds/types.ts";
import { syncLibrarySoon, type Freshness } from "./project.ts";

// THE APP'S LIBRARY SYNC: every feed, on this process's kernel, in its universe.
// The styles feed comes first so a plate's family and observables resolve in the
// same sync (project.ts collects the styles before any upsert, whatever the order).

/** Every source the Library projects (scout-library.md §3), one line each. Not yet
 *  fed: Suno clips not returned as takes, video clips (lib/imaging/video), publish
 *  exports and kernel part blobs - named in the L49 report for wave B. */
export const LIBRARY_FEEDS: readonly Feed[] = [stylesFeed, forgeFeed, extractFeed, dojoFeed, stripsFeed, takesFeed, mvFeed, registryFeed];

export const libraryCtx = (): FeedCtx => ({ universe: FIXTURE_MODE ? "fixture" : "real" });

/** The blobs beside a file store (`<dir>/blobs`, as lib/parts/gates.ts `blobRootOf`). */
export const blobRootFor = (location: string): string => (location === ":memory:" ? path.resolve(OUT_DIRNAME, "blobs") : path.join(path.dirname(location), "blobs"));

/** For a page that shows the Library: start a sync if one is due. */
export function freshLibrary(): Result<Freshness> {
  const k = kernel();
  if (!k.ok) return k;
  return syncLibrarySoon(k.value.store, blobStore(blobRootFor(k.value.store.location)), LIBRARY_FEEDS, libraryCtx(), { probe: ffmpegProbe() });
}
