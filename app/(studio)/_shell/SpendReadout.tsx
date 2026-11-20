// The last 24 hours' spend as the spine draws it - the figure, its window under it - a door to the Ledger. The
// same facts as ./SpendSlot.tsx (the Scout header's chip): unread is rose and carries the store's own words as its
// name, never a $0 that reads as "nothing was spent". No hooks, so the server and the client render the same.
import { spendParts } from "@gt/ui/components/header/header.ts";
import { usd } from "@gt/ui/components/eventrow/usd.ts";
import Link from "next/link";

import type { SpendFacts } from "./headerFacts.ts";
import s from "./Shell.module.css";

export function SpendReadout({ facts }: { readonly facts: SpendFacts }) {
  if (facts.spend === null)
    return (
      <Link className={s.readout} href="/ledger" prefetch={false} data-tone="rose" aria-label={`spend 24h could not be read: ${facts.problems.join("; ")}`}>
        <span className={s.value}>unread</span>
        <span className={s.window}>24h</span>
      </Link>
    );
  const sp = facts.spend;
  const total = `${usd(sp.total)}${sp.capped ? "+" : ""}`;
  const parts = spendParts(sp);
  const spoken = `spend in the last 24 hours ${total}${parts.map((p) => `, ${p.src} ${usd(p.usd)}`).join("")}${sp.capped ? ", more acts than were read" : ""}`;
  return (
    <Link className={s.readout} href="/ledger" prefetch={false} aria-label={spoken} data-component="SpendChip">
      <span className={s.value} aria-hidden="true">
        {total}
      </span>
      <span className={s.window} aria-hidden="true">
        24h
      </span>
    </Link>
  );
}
