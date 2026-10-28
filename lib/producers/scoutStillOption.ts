import { err, ok, type Result } from "@gt/domain/errors";
import type { ResourceLane } from "@gt/domain/lane";
import type { ModelOption } from "@gt/domain/produce";
import { TABLES } from "@gt/kernel/router/tables";
import { STUDIO_CREDIT } from "@gt/producers/scout-ideas/define";

import type { ReplicaGenerator } from "../foundry/scout/stillEngine.ts";
import { PRICES } from "../imaging/pricing.ts";

// ONE SCOUT STILL ON A RECEIPT, PRICED BY THE ENGINE THAT DRAWS IT (spark scout-vision S6) - the line a
// scene's replicas and a game asset's concepts carry. Until S6 both were fixed to the Flare row whatever
// SCOUT_REPLICA_GENERATOR said, so a night drawing on local Flux showed a Leonardo price it never paid.
//   leonardo-studio  UNPRICED: the studio bills prepaid studio credits and no USD-per-studio-credit rate has
//                    been checked (lib/imaging/pricing.ts's leonardo-studio row) - the idea artboard's
//                    line (lib/producers/scoutIdea.ts `ideaOption`), 8 credits a still at Low.
//   comfy-flux2      FREE: Flux 2 dev on this box's card, no vendor paid (the reference sheet's line).
//   leonardo-flare   the router's Flare row at lib/imaging/pricing.ts's per-image fallback, as before;
//                    the API's reported credits replace it when booked.

/** Seconds one studio still takes - typing, generating, downloading, deleting: the idea artboard's, not yet measured. */
const STUDIO_SECONDS = 45;
/** Seconds one Flare still takes: the 2026-10-22 smoke's 15 s, with a poll's slack. */
const FLARE_SECONDS = 20;
/** Seconds one Flux 2 dev still takes on the card: the storyboard frame's illustrative figure. */
const FLUX_SECONDS = 96;

/** `<prefix>/<provider>/<model>` keyed, labelled `label`, on `lane`: one still by `generator`. */
export function scoutStillOption(prefix: string, label: string, lane: ResourceLane, generator: ReplicaGenerator): Result<ModelOption> {
  if (generator === "leonardo-studio") {
    const model = TABLES.image.candidates.find((c) => c.provider === "leonardo-studio")?.models["generate"];
    if (model === undefined) return err("internal", `the router table has no leonardo-studio row to price a ${label} with`);
    return ok({
      key: `${prefix}/leonardo-studio/${model}`,
      lane,
      provider: "leonardo-studio",
      model,
      label,
      secondsPerUnit: STUDIO_SECONDS,
      usdPerUnit: null,
      unpricedReason: STUDIO_CREDIT,
      src: "illustrative",
      basis: { seconds: { src: "illustrative", note: "one studio still at Low with its download and delete, not yet measured" }, usd: { src: "real", note: STUDIO_CREDIT } },
    });
  }
  if (generator === "comfy-flux2") {
    const row = PRICES.find((p) => p.provider === "comfy-flux2");
    if (row === undefined) return err("internal", `the price table has no comfy-flux2 row to price a ${label} with`);
    return ok({
      key: `${prefix}/comfy-flux2/${row.model}`,
      lane,
      provider: "comfy-flux2",
      model: row.model,
      label: `${label} · local`,
      secondsPerUnit: FLUX_SECONDS,
      usdPerUnit: 0,
      src: "illustrative",
      basis: {
        seconds: { src: "illustrative", note: "one Flux 2 dev still on this box's ComfyUI, the storyboard frame's figure, not yet measured" },
        usd: { src: "real", note: "free: a local model on this box's card; no vendor is paid" },
      },
    });
  }
  const model = TABLES.image.candidates.find((c) => c.provider === "leonardo-flare")?.models["generate"];
  const price = PRICES.find((p) => p.provider === "leonardo-flare" && p.model === model)?.usdPerImage;
  if (model === undefined || price === undefined) return err("internal", `the router table or the price table has no leonardo-flare row to price a ${label} with`);
  const note = "the per-image fallback (6 credits at USD_PER_CREDIT 0.00257); measured 15 s / 6 credits at LOW 1376x768, 2026-10-22 smoke; the API's reported credits replace it when booked";
  return ok({
    key: `${prefix}/leonardo-flare/${model}`,
    lane,
    provider: "leonardo-flare",
    model,
    label,
    secondsPerUnit: FLARE_SECONDS,
    usdPerUnit: price,
    src: "illustrative",
    basis: { seconds: { src: "illustrative", note: "one LOW still, measured 15 s on 2026-10-22, with a poll's slack" }, usd: { src: "illustrative", note } },
  });
}
