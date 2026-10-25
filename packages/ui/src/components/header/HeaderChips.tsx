// The studio header's right side (prototype shell.js `header()`, tokens.css `.next-btn`,
// `.hdr-spend`, `#hdr-ses`): the NEXT decision, the last 24 hours' spend, and the ledger's acts
// since the operator last looked. Every (studio) page draws them; the Floor computes what the
// NEXT is.
//
//   NextButton  the oldest pile waiting on the operator: its title, its size, ⏎ (the Floor's
//               open-next). With nothing waiting it is the prototype's emerald "weir clear".
//   SpendChip   the total, and - when any of it is not money that left an account - each
//               source's share beside it (`model $3.20`), so a modelled figure is never read
//               as spent. A capped read says the sum is a floor.
//   LedgerDelta a door to the Ledger carrying `+N`.

import type { MouseEvent } from "react";

import { Chip } from "../chip/Chip.tsx";
import { usd } from "../eventrow/usd.ts";
import { capsFor } from "../keycaps/caps.ts";
import keycap from "../keycaps/Keycaps.module.css";
import { SourceTag } from "../source/SourceTag.tsx";
import { Tally } from "../tally/Tally.tsx";
import { spendParts, type Spend } from "./header.ts";
import s from "./HeaderChips.module.css";

/** `1 item`, `2 items`: the names below are read aloud. */
const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

const plain = (e: MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

export type NextPile = { readonly title: string; readonly count: number; readonly href: string };

export function NextButton({ next, onOpen }: { readonly next: NextPile | null; readonly onOpen?: (href: string) => void }) {
  if (next === null) return <Chip label="weir clear" tone="emerald" dot />;
  const cap = capsFor("floor", "open-next")[0];
  return (
    <a
      className={s.next}
      href={next.href}
      data-component="NextButton"
      aria-label={`Open next decision: ${next.title}, ${count(next.count, "item")}`}
      onClick={(e) => {
        if (onOpen === undefined || !plain(e)) return;
        e.preventDefault();
        onOpen(next.href);
      }}
    >
      <span className={s.lbl} aria-hidden="true">
        NEXT
      </span>
      <span className={s.t} aria-hidden="true">
        {next.title}
      </span>
      <span aria-hidden="true">
        <Tally value={next.count} />
      </span>
      {cap !== undefined && (
        <kbd className={keycap.cap} aria-hidden="true">
          {cap}
        </kbd>
      )}
    </a>
  );
}

export function SpendChip({ spend }: { readonly spend: Spend }) {
  const parts = spendParts(spend);
  const total = `${usd(spend.total)}${spend.capped ? "+" : ""}`;
  const spoken = `spend in the last 24 hours ${total}${parts.map((p) => `, ${p.src} ${usd(p.usd)}`).join("")}${spend.capped ? ", more acts than were read" : ""}`;
  return (
    <span className={s.spend} data-component="SpendChip" role="group" aria-label={spoken}>
      <span aria-hidden="true" className={s.spendRow}>
        <Chip label="spend 24h" value={total} />
        {parts.map((p) => (
          <SourceTag key={p.src} kind={p.src} value={usd(p.usd)} />
        ))}
      </span>
    </span>
  );
}

export function LedgerDelta({ delta, href = "/ledger" }: { readonly delta: number; readonly href?: string }) {
  // The Chip's own link form; cyan while there is something new (the prototype lit #hdr-ses
  // cyan as an act landed).
  return <Chip label="ledger" value={`+${delta}`} tone={delta > 0 ? "cyan" : "neutral"} href={href} name={`ledger, ${count(delta, "new act")} since your last visit`} />;
}
