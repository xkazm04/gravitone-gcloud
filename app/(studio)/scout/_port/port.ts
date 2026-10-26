import "server-only";

// THE SEAM: which side /scout reads its graph from and writes its steer to. ONE switch, `SIDE`, the produce ports'
// (../../projects/_port/port.ts): GRAVITONE_PRODUCE_SIDE=fixture moves the whole studio into its fixture universe
// at once. The page, the actions and the island reach a side only through `serverScout()`.
//
// The server side speaks the domain's `Result<T>`; ./actions.ts turns it into the wire envelope. Every verb that
// writes answers with the view (the graph and the split) rebuilt after the write.

import type { Result } from "@gt/domain/errors";

import type { SteerSplit } from "../../../../lib/foundry/scout/types.ts";
import type { ScoutView } from "./contract.ts";
import { fixtureScout } from "./fixture.ts";
import { realScout } from "./real.ts";

export const SIDE: "fixture" | "real" = process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? "fixture" : "real";

export type ServerScout = {
  readonly view: () => Promise<Result<ScoutView>>;
  /** `by`: who the steer's history names. */
  readonly pause: (ref: string, by: string) => Promise<Result<ScoutView>>;
  readonly resume: (ref: string, by: string) => Promise<Result<ScoutView>>;
  readonly split: (split: SteerSplit, by: string) => Promise<Result<ScoutView>>;
};

export function serverScout(): ServerScout {
  return SIDE === "fixture" ? fixtureScout : realScout;
}
