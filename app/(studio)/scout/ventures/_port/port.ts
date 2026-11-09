import "server-only";

// THE SEAM for /scout/ventures: GRAVITONE_PRODUCE_SIDE=fixture is a scripted slate, otherwise the kernel's heads (./real.ts).

import { err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";

import type { VentureCreateInput, VenturesView } from "./contract.ts";
import { fixtureVentures } from "./fixture.ts";
import { realVentures } from "./real.ts";

export type ServerVentures = {
  readonly view: () => Promise<Result<VenturesView>>;
  readonly create: (input: VentureCreateInput, who: Actor) => Promise<Result<VenturesView>>;
};

const fixtureSide: ServerVentures = {
  view: async () => ok(fixtureVentures()),
  create: async () => err("refused", "the fixture side has no record to act on (GRAVITONE_PRODUCE_SIDE=fixture)"),
};

export function serverVentures(): ServerVentures {
  return process.env["GRAVITONE_PRODUCE_SIDE"] === "fixture" ? fixtureSide : realVentures;
}
