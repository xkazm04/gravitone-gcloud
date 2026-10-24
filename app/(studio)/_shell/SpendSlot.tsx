// The last 24 hours' spend as both headers draw it (./HeaderBar.tsx on every studio page, the Scout
// header beside its NEXT): HeaderChips' SpendChip, or - when the ledger could not be read - a rose
// `unread` chip carrying the store's own words, never a $0 that reads as "nothing was spent".
// No hooks and no directive, so a Server Component and the client bar render the same markup.
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { SpendChip } from "@gt/ui/components/header/HeaderChips.tsx";

import type { SpendFacts } from "./headerFacts.ts";

export function SpendSlot({ facts }: { readonly facts: SpendFacts }) {
  return facts.spend === null ? <Chip label="spend 24h" value="unread" tone="rose" name={`spend 24h could not be read: ${facts.problems.join("; ")}`} /> : <SpendChip spend={facts.spend} />;
}
