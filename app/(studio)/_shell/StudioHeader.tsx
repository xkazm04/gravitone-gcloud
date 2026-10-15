"use client";

// The studio header (prototype shell.js `header()` + tokens.css `[data-component=StudioHeader]`):
// the brand, the sections, and on the right the three numbers the Floor feeds - the NEXT
// decision, 24h spend and the ledger delta. Nothing feeds them before Phase 2, so each is a
// Ghost holding the shape the number will arrive into (app-shell lazy-section-loading: the
// placeholder is the section's shape, so data replaces it rather than rearranging the bar).
// The prototype's reset chip belonged to its localStorage journal and has no counterpart.
//
// The brand is not a link yet: the prototype's brand returned to the Floor, and a brand
// that leads to a page that does not exist is a dead door. It becomes one with the Floor.
//
// The current section is DERIVED from the pathname (navigation-model), never held. A section
// that is not built is a disabled link: focusable, named, aria-disabled, with no href - so
// it can never be a door to a 404 (primitive-level-a11y honest disablement; Button does the
// same for the same reason).

import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { Button } from "@gt/ui/components/button/Button.tsx";
import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { Ghost } from "@gt/ui/components/ghost/Ghost.tsx";

import { SECTIONS, sectionOf } from "./nav.ts";
import { useShell } from "./Providers.tsx";
import s from "./Shell.module.css";

export function StudioHeader({ devAuth }: { readonly devAuth: boolean }) {
  const here = sectionOf(usePathname());
  const { signOut } = useShell();
  const kit = SECTIONS.find((x) => x.id === "kit");
  const pages = SECTIONS.filter((x) => x.id !== "kit");
  return (
    <header className={s.header} data-component="StudioHeader">
      <span className={s.brand}>
        <BrandMark />
        <span>Gravitone</span>
      </span>
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
          <Ghost label="next decision: no data yet" />
        </div>
        <div className={s.slotSpend}>
          <Ghost label="spend 24h: no data yet" />
        </div>
        <div className={s.slotLedger}>
          <Ghost label="ledger delta: no data yet" />
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
