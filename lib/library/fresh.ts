import "server-only";

import type { Result } from "@gt/domain/errors";
import { blobStore } from "@gt/kernel/blob";
import type { Store } from "@gt/kernel/store";
import { queueFacts } from "@gt/producers/media-facts/run";

import { FIXTURE_MODE } from "../fixtures/mode.ts";
import { blobRootOf, kernel } from "../kernelStore.ts";
import { characterFeed } from "./feeds/character.ts";
import { dojoFeed, extractFeed, forgeFeed, stripsFeed, stylesFeed } from "./feeds/foundry.ts";
import { kernelFeed } from "./feeds/kernel.ts";
import { meshFeed } from "./feeds/mesh.ts";
import { scoutFeed } from "./feeds/scout.ts";
import { mvFeed, registryFeed, sunoFeed, takesFeed } from "./feeds/sound.ts";
import { clipsFeed, exportsFeed } from "./feeds/studio.ts";
import type { Feed, FeedCtx } from "./feeds/types.ts";
import { syncLibrarySoon, type Freshness } from "./project.ts";

// THE APP'S LIBRARY SYNC: every feed, on this process's kernel, in its universe.
// The styles feed comes first so a plate's family and observables resolve in the
// same sync (project.ts collects the styles before any upsert, whatever the order).

/** Every source the Library projects (scout-library.md §3), one line each. */
export const LIBRARY_FEEDS: readonly Feed[] = [stylesFeed, forgeFeed, extractFeed, dojoFeed, stripsFeed, takesFeed, sunoFeed, mvFeed, clipsFeed, exportsFeed, kernelFeed, registryFeed, scoutFeed, meshFeed, characterFeed];

export const libraryCtx = (store?: Store): FeedCtx => ({ universe: FIXTURE_MODE ? "fixture" : "real", ...(store === undefined ? {} : { store }) });

/** The sync's facts: one `media-facts` job for the worker, named on the ledger as this sync's. */
export const queueLibraryFacts = (store: Store): ReturnType<typeof queueFacts> => queueFacts(store, { kind: "machine", id: "library-sync" }, () => new Date());

/** For a page that shows the Library: start a sync if one is due. New media is queued for its
 *  facts as a job; nothing is probed inside the request. */
export function freshLibrary(): Result<Freshness> {
  const k = kernel();
  if (!k.ok) return k;
  return syncLibrarySoon(k.value.store, blobStore(blobRootOf(k.value.store)), LIBRARY_FEEDS, libraryCtx(k.value.store), { queue: queueLibraryFacts });
}
