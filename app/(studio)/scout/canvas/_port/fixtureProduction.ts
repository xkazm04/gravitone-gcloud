import "server-only";

// THE PRODUCTION BASIN'S FIXTURE SIDE (spark character-cores). One real production - the paused Unlatched clip's first
// 1:46 as a graph of stations - and the cores it can cast, imported once by pipeline/production-fixture.mts into
// lib/production/fixtureProduction.json. Since S1.5 (WP5) the production lives in a file seeded from that JSON
// (lib/production/state.ts) and every verb here is lib/production/ops.ts over it, read per call: pipeline/production.mts
// changes the same file, so a recast or a redraw from the CLI shows on the next render, without a store or a vendor.
//
// Beside it, another device's copy of the same production (./fixtureForeign.ts, spark device-metadata-sync KS3): listed
// read-only, and every write on it refused with the state's own sentence, as the real side refuses a foreign state file.

import { err, ok, type Result } from "@gt/domain/errors";
import type { Production, SwapPreview } from "@gt/domain/productionGraph";

import { acceptSwap as accept, listCores, listProductions, previewSwap as preview, setVerdict as verdict, shownState } from "../../../../../lib/production/ops.ts";
import { devicesOf } from "../../../../../lib/knowhow/mirror.ts";
import { readOnlyRefusal } from "../../../../../lib/production/state.ts";
import type { ProductionVerdictInput, SwapInput } from "./contract.ts";
import { fixtureForeign, fixtureForeignCharacters } from "./fixtureForeign.ts";
import type { ServerCanvas } from "./port.ts";

export { checkFixture, isDrift, type ProductionFixture } from "../../../../../lib/production/check.ts";

/** Nothing is held in memory any more: the production's file is the state. Kept for the tests that start it over. */
export function resetFixtureProductions(): void {}

/** The foreign fixture's refusal when `production` names it (and no state file of that id took its place). */
function foreignRefusal(production: string): Result<never> | null {
  const f = fixtureForeign();
  if (f === null || f.production.id !== production) return null;
  const listed = listProductions();
  if (listed.ok && listed.value.some((p) => p.id === production)) return null;
  return readOnlyRefusal(f) ?? err("refused", `${f.production.title}: lessons only here`);
}

export const previewSwap = (input: SwapInput): Result<SwapPreview> => foreignRefusal(input.production) ?? preview(input);
export const acceptSwap = (input: SwapInput): Result<{ readonly production: Production }> => foreignRefusal(input.production) ?? accept(input);
export const setVerdict = (input: ProductionVerdictInput): Result<{ readonly production: Production }> => foreignRefusal(input.production) ?? verdict(input);

export const fixtureProductions: Pick<ServerCanvas, "productions" | "cores" | "swapPreview" | "swapAccept" | "productionVerdict"> = {
  productions: async () => {
    const p = listProductions();
    if (!p.ok) return p;
    const f = fixtureForeign();
    return ok({ productions: f === null || p.value.some((x) => x.id === f.production.id) ? p.value : [...p.value, shownState(f)] });
  },
  cores: async () => {
    const c = listCores();
    if (!c.ok) return c;
    // the other device's pictures of a core, unless the mirror already counted more devices
    const theirs = fixtureForeignCharacters();
    return ok({
      cores: c.value.map((x) => {
        const r = theirs[x.id];
        const n = r === undefined ? 1 : devicesOf(r, "dev:fixture-self");
        return n > (x.devices ?? 1) ? { ...x, devices: n } : x;
      }),
    });
  },
  swapPreview: async (input) => previewSwap(input),
  swapAccept: async (input) => acceptSwap(input),
  productionVerdict: async (input) => setVerdict(input),
};
