// THE CATALOG'S READING (spark studio-to-release WP1): the stored releases by where they stand, and where each opens.
// Pure and zod-free (the catalog is a client island).
//
// WHERE A RELEASE STANDS is read, never stored a second time: scheduled and published are the release's own status
// (only the operator's Schedule press, and later the publish, set them); before that a release is `ready` exactly when
// nothing in `releaseProblems` blocks it, and a `draft` otherwise - so a draft that the operator (or an accepted
// proposal) has just completed moves to ready without anyone pressing anything.
//
// A CARD OPENS INTO THE STUDIO's package stage, in the session the release was born in (studioHref); a release made
// from the shelf has no session and opens the studio with none. The wizard stays reachable for it on this tab
// (`?s=release&r=<id>`).
import { releaseKind, type ReleaseKind, type ReleaseStatus } from "@gt/domain/release";
import { releaseProblems, releaseReady } from "@gt/domain/release.problems";
import type { ReleaseRecord } from "@gt/domain/release.record";

import { studioHref } from "../../studio/url.ts";
import type { ReleaseSource } from "../_port/port.ts";

export const CATALOG_COLUMNS: readonly ReleaseStatus[] = ["draft", "ready", "scheduled", "published"];

export function standingOf(r: ReleaseRecord): ReleaseStatus {
  const s = r.release.status;
  if (s === "scheduled" || s === "published") return s;
  return releaseReady(releaseProblems(r.release)) ? "ready" : "draft";
}

export interface CatalogCard {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly kind: ReleaseKind;
  readonly tracks: number;
  readonly durationS: number;
  readonly sleeve: string | null;
  readonly releaseDate: string | null;
  readonly blocks: number;
  readonly warns: number;
  /** The agent's suggestions still waiting on the operator. */
  readonly pending: number;
  readonly sessionId: string | null;
  readonly href: string;
}

export function cardOf(r: ReleaseRecord, source: ReleaseSource): CatalogCard {
  const rel = r.release;
  const problems = releaseProblems(rel);
  return {
    id: rel.id,
    title: rel.title.trim() === "" ? "untitled" : rel.title,
    artist: rel.artist,
    kind: releaseKind(rel.tracks),
    tracks: rel.tracks.length,
    durationS: rel.tracks.reduce((a, t) => a + t.durationS, 0),
    sleeve: rel.sleeve?.href ?? null,
    releaseDate: rel.releaseDate,
    blocks: problems.filter((p) => p.severity === "block").length,
    warns: problems.filter((p) => p.severity === "warn").length,
    pending: r.pending.length,
    sessionId: r.sessionId,
    href: studioHref({ session: r.sessionId, offline: false, source: source === "fixture" ? "fixture" : "live", stage: "package", release: rel.id }),
  };
}

/** Every stored release in its column, in the store's order (newest first) within each. */
export function catalogOf(records: readonly ReleaseRecord[], source: ReleaseSource): Readonly<Record<ReleaseStatus, readonly CatalogCard[]>> {
  const out: Record<ReleaseStatus, CatalogCard[]> = { draft: [], ready: [], scheduled: [], published: [] };
  for (const r of records) out[standingOf(r)].push(cardOf(r, source));
  return out;
}
