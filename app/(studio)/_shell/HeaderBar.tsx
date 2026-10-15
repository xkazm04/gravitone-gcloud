"use client";

// The studio header (prototype shell.js `header()` + tokens.css `[data-component=StudioHeader]`):
// the brand, the sections, and on the right the three numbers - the NEXT decision, 24h spend and
// the ledger delta - that ./StudioHeader.tsx reads on the server (./headerFacts.ts). The
// prototype's reset chip belonged to its localStorage journal and has no counterpart.
//
// The brand returns to the Floor, as the prototype's did (a door now that the Floor exists).
//
// The current section is DERIVED from the pathname (navigation-model), never held. A section
// that is not built is a disabled link: focusable, named, aria-disabled, with no href - so it
// can never be a door to a 404 (primitive-level-a11y honest disablement; Button does the same).
//
// LEDGER +N is a newness badge (app-shell badge-and-attention): the mark is the last ledger seq
// the operator saw, stored under ./keys.ts LEDGER_SEEN, and it moves to the head when the
// Ledger is on screen - genuine exposure, not a hover. The first visit ever records the head
// without counting, so a fresh browser does not open on "+40 000". The mark is read from the
// store inside the effect, never from a render value (the hydration render has no storage, and
// writing from it would overwrite the real mark).

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { LedgerDelta, NextButton, SpendChip } from "@gt/ui/components/header/HeaderChips.tsx";
import { ledgerDelta } from "@gt/ui/components/header/header.ts";

import type { HeaderFacts } from "./headerFacts.ts";
import { LEDGER_SEEN } from "./keys.ts";
import { SECTIONS, sectionOf } from "./nav.ts";
import { useShell } from "./Providers.tsx";
import s from "./Shell.module.css";

export function HeaderBar({ devAuth, facts }: { readonly devAuth: boolean; readonly facts: HeaderFacts }) {
  const here = sectionOf(usePathname());
  const router = useRouter();
  const { signOut, store, toast } = useShell();
  // The mark as state, read after mount (the server has no storage) and on every write, from
  // this tab or another (store.subscribe; @gt/ui useStored takes classic-zod keys only).
  const [seen, setSeen] = useState<number | undefined>(undefined);
  useEffect(() => {
    const sync = (): void => {
      const m = store.read(LEDGER_SEEN);
      setSeen(m.ok ? m.value : undefined);
    };
    sync();
    const off = store.subscribe(sync);
    window.addEventListener("storage", sync);
    return () => {
      off();
      window.removeEventListener("storage", sync);
    };
  }, [store]);
  const kit = SECTIONS.find((x) => x.id === "kit");
  const pages = SECTIONS.filter((x) => x.id !== "kit");

  useEffect(() => {
    const mark = store.read(LEDGER_SEEN);
    if (!mark.ok) return;
    if (mark.value !== undefined && here !== "ledger") return;
    if (mark.value === facts.head) return;
    const wrote = store.write(LEDGER_SEEN, facts.head);
    if (!wrote.ok) toast(`storage - ${wrote.error.message}`);
  }, [here, facts.head, store, toast]);

  return (
    <header className={s.header} data-component="StudioHeader">
      <Link className={s.brand} href="/floor" aria-label="Gravitone floor">
        <BrandMark />
        <span>Gravitone</span>
      </Link>
      <nav className={s.nav} aria-label="sections">
        {pages.map((x, i) => {
          const prev = pages[i - 1];
          const sep = prev !== undefined && prev.group !== x.group;
          return (
            <Fragment key={x.id}>
              {sep && <span className={s.sep} aria-hidden="true" />}
              {x.built ? (
                <a href={x.href} aria-current={here === x.id ? "page" : undefined}>
                  {x.label}
                </a>
              ) : (
                <a role="link" aria-disabled="true" tabIndex={0}>
                  {x.label}
                </a>
              )}
            </Fragment>
          );
        })}
      </nav>
      <div className={s.right}>
        {devAuth && (
          <span data-testid="dev-auth-banner">
            <Chip label="dev auth" tone="rose" dot />
          </span>
        )}
        <div className={s.slotNext}>
          <NextButton next={facts.next} onOpen={(href) => router.push(href)} />
        </div>
        <div className={s.slotSpend}>
          {facts.spend === null ? <Chip label="spend 24h" value="unread" tone="rose" name={`spend 24h could not be read: ${facts.problems.join("; ")}`} /> : <SpendChip spend={facts.spend} />}
        </div>
        <div className={s.slotLedger}>
          <LedgerDelta delta={here === "ledger" ? 0 : ledgerDelta(facts.head, seen)} />
        </div>
        {kit !== undefined && (
          <a className={s.kitLink} href={kit.href} aria-current={here === "kit" ? "page" : undefined}>
            {kit.label}
          </a>
        )}
        <Button label="Sign out" size="sm" onPress={() => void signOut()} />
      </div>
    </header>
  );
}

/** shell.js `I.mark`: the weir's four bars and the wall. Colour from tokens, through classes. */
function BrandMark() {
  return (
    <svg className={s.mark} viewBox="0 0 26 26" width={26} height={26} fill="none" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="7" className={s.markRim} />
      <path d="M7 17v-3M10.5 17v-6M14 17v-9M17.5 17v-5" className={s.markBars} />
      <path d="M20.5 6v14" className={s.markWall} />
    </svg>
  );
}
