import "server-only";

// THE PRODUCTION BASIN'S FIXTURE SIDE (spark character-cores S1). WP0 stub: WP1 fills it from the fixture imported out
// of a real music clip (fixtureProduction.json, written by pipeline/production-fixture.mts) and answers the swap and
// the verdict in memory, as the real side will from the kernel production manifest (S2).

import { err, ok } from "@gt/domain/errors";

import type { ServerCanvas } from "./port.ts";

const NOT_IMPORTED = "the production fixture is not imported yet (pipeline/production-fixture.mts)";

export const fixtureProductions: Pick<ServerCanvas, "productions" | "cores" | "swapPreview" | "swapAccept" | "productionVerdict"> = {
  productions: async () => ok({ productions: [] }),
  cores: async () => ok({ cores: [] }),
  swapPreview: async () => err("unavailable", NOT_IMPORTED),
  swapAccept: async () => err("unavailable", NOT_IMPORTED),
  productionVerdict: async () => err("unavailable", NOT_IMPORTED),
};
