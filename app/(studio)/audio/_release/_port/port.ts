// THE RELEASE TAB'S PORT (spark audio-distribution, S1): what the desk reads, from either side. The
// fixture side is scripted (./fixture.ts); the real side reads the kept takes and the channels'
// readiness (./real.ts) and holds no releases - S1 persists nothing, a release is a draft the page
// owns until it closes (wizard-flows: state lives where the side effects live, and S1 has none).
import type { ChannelRow, Release, ShelfTake } from "@gt/domain/release";

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
  readonly releases: readonly Release[];
  readonly channels: readonly ChannelRow[];
  readonly mvLooks: readonly MvLook[];
}

export interface ReleasePort {
  read(): Promise<ReleaseRead>;
}
