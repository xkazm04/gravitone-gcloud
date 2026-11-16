// THE RELEASE TAB'S PORT (spark audio-distribution, S1): what the desk reads, from either side. The
// fixture side is scripted (./fixture.ts); the real side reads the kept takes and the channels'
// readiness and the releases the kernel store keeps (./real.ts; spark studio-to-release persists them: the agent
// and the operator now edit one record, so the record lives where both writes land).
import type { ChannelRow, ShelfTake } from "@gt/domain/release";
import type { ReleaseRecord } from "@gt/domain/release.record";

export type ReleaseSource = "fixture" | "real";

export interface ReleaseUrl {
  readonly source: ReleaseSource;
  /** The release open on first paint, when the URL names one. */
  readonly release: string | null;
}

/** A music-video still a track already has: one of the sleeve's three sources. */
export interface MvLook {
  readonly takeId: string;
  readonly href: string;
  readonly title: string;
}

export interface ReleaseRead {
  readonly source: ReleaseSource;
  readonly artist: string;
  readonly shelf: readonly ShelfTake[];
  /** Every release as the store keeps it (version, session, the agent's pending proposals), newest first. */
  readonly records: readonly ReleaseRecord[];
  readonly channels: readonly ChannelRow[];
  readonly mvLooks: readonly MvLook[];
}

export interface ReleasePort {
  read(): Promise<ReleaseRead>;
}
