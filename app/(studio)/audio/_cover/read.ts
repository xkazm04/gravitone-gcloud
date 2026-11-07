import "server-only";

import type { CoverDeskView } from "@gt/domain/cover";

import { COVER_LAYOUTS, type CoverLayout } from "./contract.ts";

// WP0 STUB, filled by WP2.
type Q = Readonly<Record<string, string | readonly string[] | undefined>>;

export async function readCoverDesk(_q: Q): Promise<CoverDeskView> {
  return { covers: [] };
}

export function coverLayout(q: Q): CoverLayout {
  const raw = q["layout"];
  return COVER_LAYOUTS.find((l) => l === raw) ?? "steps";
}
