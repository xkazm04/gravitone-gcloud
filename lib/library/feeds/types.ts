import type { LibraryItemInput } from "@gt/domain/libraryItem";
import type { LibraryExtras } from "@gt/domain/library";
import type { StyleFacets } from "@gt/kernel/library/core";

// THE LIBRARY PROJECTION'S CONTRACT (Phase 5, COMMON decision 5) - what each
// feed under lib/library/feeds/ hands the sync (lib/library/project.ts).
//
// A feed is a reader and a pure mapping, like a Phase 2 ledger source
// (lib/ledger/v1/types.ts): `read()` goes through v1's own readers, which stay
// the writers of their stores - NOTHING here writes a v1 file - and returns the
// items those stores hold now. Media that lives as a file on disk is named, not
// read: the sync ingests it into a blob (content-addressed, so a second sync
// writes nothing) and points the item at it.

/** Which universe the sync projects (lib/fixtures/mode.ts): every item says it. */
export type FeedCtx = { readonly universe: "real" | "fixture" };

export type FeedItem = {
  readonly item: LibraryItemInput;
  readonly meta: string;
  readonly extras: LibraryExtras;
  /** A file the item's media is, ingested into a blob by the sync. */
  readonly file?: { readonly abs: string; readonly mime: string };
};

export type FeedRead = {
  readonly items: readonly FeedItem[];
  /** Records the feed could not map, with the reason: reported, never dropped silently. */
  readonly skipped: readonly { readonly id: string; readonly reason: string }[];
  /** The styles a plate's family and observables are read through (the styles feed only). */
  readonly styles?: ReadonlyMap<string, StyleFacets>;
};

export type Feed = { readonly id: string; read(ctx: FeedCtx): Promise<FeedRead> };

const MIME: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

/** A file's mime by its extension, or undefined for one the Library does not draw. */
export function mimeOf(file: string): string | undefined {
  const dot = file.lastIndexOf(".");
  return dot < 0 ? undefined : MIME[file.slice(dot).toLowerCase()];
}

/** A run's day as an instant, when an id carries one (`2026-08-26-...`). */
export function dayOf(s: string): string | undefined {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(s);
  return m === null ? undefined : `${m[1]}T12:00:00.000Z`;
}

/** An ISO instant, or undefined: v1 stamps are mostly ISO, some are not. */
export function isoOf(s: string | null | undefined): string | undefined {
  if (s === null || s === undefined) return undefined;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

export const words = (s: string): string => s.replace(/[-_]/g, " ");
