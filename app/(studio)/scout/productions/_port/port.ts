import "server-only";

// THE SEAM for /scout/productions. S0 has one side, the scripted fixture; S1 adds the production record behind this
// function and the page stays as it is.

import type { Result } from "@gt/domain/errors";

import type { ProductionsView } from "./contract.ts";
import { fixtureProductions } from "./fixture.ts";

export function serverProductions(): Result<ProductionsView> {
  return fixtureProductions();
}
