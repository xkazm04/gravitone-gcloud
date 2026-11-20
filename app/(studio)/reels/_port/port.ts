import "server-only";

// THE SEAM: which side /reels reads. ONE switch, the produce ports' (../../projects/_port/port.ts):
// GRAVITONE_PRODUCE_SIDE=fixture moves the whole studio into its fixture universe at once.
import { fixtureReels } from "./fixture.ts";
import { realReels } from "./real.ts";
import type { ReelsPort } from "./types.ts";

export const SIDE: "fixture" | "real" = process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? "fixture" : "real";

export function serverReels(): ReelsPort {
  return SIDE === "fixture" ? fixtureReels : realReels;
}
