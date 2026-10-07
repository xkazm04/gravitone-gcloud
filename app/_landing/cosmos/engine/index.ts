// Paper Cosmos engine — entry point. WP0 stub: the signature is the contract
// the client component (../Cosmos.tsx) and the performance layer build against;
// the port (WP1) fills the body.

import type { Galaxy } from "../types";

/** Quality tiers. `full`: every paper plane, idle sway and parallax (GPU).
 *  `lite`: planes flattened to depth bands, no infinite animation (CPU
 *  compositing). `still`: one flattened scene, no parallax (reduced motion or a
 *  device the governor measured as too slow for lite). */
export type CosmosTier = "full" | "lite" | "still";

export interface CosmosOptions {
  /** forced tier; omitted = probe + governor decide */
  tier?: CosmosTier;
  /** called with the path of the item under attention when Enter is pressed
   *  inside the scene (keyboard), so the host can route it */
  onEnter?: (path: string[]) => void;
  /** reports tier decisions and measurements, for tests and diagnostics */
  onTier?: (tier: CosmosTier, why: string) => void;
}

export interface CosmosHandle {
  destroy(): void;
  tier(): CosmosTier;
}

export function mountCosmos(root: HTMLElement, galaxy: Galaxy, opts: CosmosOptions = {}): CosmosHandle {
  void root;
  void galaxy;
  const t: CosmosTier = opts.tier ?? "full";
  return { destroy() {}, tier: () => t };
}
