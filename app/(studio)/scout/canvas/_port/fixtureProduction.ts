import "server-only";

// THE PRODUCTION BASIN'S FIXTURE SIDE (spark character-cores). One real production - the paused Unlatched clip's first
// 1:46 as a graph of stations - and the cores it can cast, imported once by pipeline/production-fixture.mts into
// ./fixtureProduction.json. Since S1.5 (WP5) the production lives in a file seeded from that JSON
// (lib/production/state.ts) and every verb here is lib/production/ops.ts over it, read per call: pipeline/production.mts
// changes the same file, so a recast or a redraw from the CLI shows on the next render, without a store or a vendor.

import { ok, type Result } from "@gt/domain/errors";
import type { Production, SwapPreview } from "@gt/domain/productionGraph";

import { acceptSwap as accept, listCores, listProductions, previewSwap as preview, setVerdict as verdict } from "../../../../../lib/production/ops.ts";
import type { ProductionVerdictInput, SwapInput } from "./contract.ts";
import type { ServerCanvas } from "./port.ts";

export { checkFixture, isDrift, type ProductionFixture } from "../../../../../lib/production/check.ts";

/** Nothing is held in memory any more: the production's file is the state. Kept for the tests that start it over. */
export function resetFixtureProductions(): void {}

export const previewSwap = (input: SwapInput): Result<SwapPreview> => preview(input);
export const acceptSwap = (input: SwapInput): Result<{ readonly production: Production }> => accept(input);
export const setVerdict = (input: ProductionVerdictInput): Result<{ readonly production: Production }> => verdict(input);

export const fixtureProductions: Pick<ServerCanvas, "productions" | "cores" | "swapPreview" | "swapAccept" | "productionVerdict"> = {
  productions: async () => {
    const p = listProductions();
    return p.ok ? ok({ productions: p.value }) : p;
  },
  cores: async () => {
    const c = listCores();
    return c.ok ? ok({ cores: c.value }) : c;
  },
  swapPreview: async (input) => preview(input),
  swapAccept: async (input) => accept(input),
  productionVerdict: async (input) => verdict(input),
};
