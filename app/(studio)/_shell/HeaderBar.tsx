"use client";

// The studio header (prototype shell.js `header()` + tokens.css `[data-component=StudioHeader]`):
// the brand, the sections, and on the right the last 24 hours' spend that ./StudioHeader.tsx
// reads on the server (./headerFacts.ts). The prototype's reset chip belonged to its
// localStorage journal and has no counterpart.
//
// Until 2026-10-24 the right side also carried the NEXT decision over every source and a
// `ledger +N` newness badge (with its seen-mark in browser storage). The operator moved NEXT into
// the Scout header, narrowed to the scout's piles (scout/_scout/ScoutHead.tsx), and dropped the
// ledger badge: the Ledger is a section in the nav. The Floor's ⏎ and amber ring still name the
// global NEXT.
//
// The brand returns to the Floor, as the prototype's did (a door now that the Floor exists).
//
// The current section is DERIVED from the pathname (navigation-model), never held. A section
// that is not built is a disabled link: focusable, named, aria-disabled, with no href - so it
// can never be a door to a 404 (primitive-level-a11y honest disablement; Button does the same).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";

import type { SpendFacts } from "./headerFacts.ts";
import { SECTIONS, sectionOf } from "./nav.ts";
import { useShell } from "./Providers.tsx";
import s from "./Shell.module.css";
import { SpendSlot } from "./SpendSlot.tsx";

export function HeaderBar({ devAuth, facts }: { readonly devAuth: boolean; readonly facts: SpendFacts }) {
  const here = sectionOf(usePathname());
  const { signOut } = useShell();
  const kit = SECTIONS.find((x) => x.id === "kit");
  const pages = SECTIONS.filter((x) => x.id !== "kit");

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
        <div className={s.slotSpend}>
          <SpendSlot facts={facts} />
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
