// The /reels fixture side: ./fixtureData.ts, read-only. A row is its detail with the detail's extra fields left off.
import { FIXTURE_REELS } from "./fixtureData.ts";
import type { ReelDetail, ReelRow, ReelsPort } from "./types.ts";

export function rowOf(d: ReelDetail): ReelRow {
  const { slug, title, hook, stage, last, seconds, bytes, poster, strip, updatedAt, progress } = d;
  return { slug, title, hook, stage, strip, updatedAt, ...(last === undefined ? {} : { last }), ...(seconds === undefined ? {} : { seconds }), ...(bytes === undefined ? {} : { bytes }), ...(poster === undefined ? {} : { poster }), ...(progress === undefined ? {} : { progress }) };
}

export const fixtureReels: ReelsPort = {
  listReels: () => Promise.resolve(FIXTURE_REELS.map(rowOf)),
  reel: (slug) => Promise.resolve(FIXTURE_REELS.find((r) => r.slug === slug)),
};
