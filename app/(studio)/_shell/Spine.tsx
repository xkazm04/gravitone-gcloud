"use client";

// THE STUDIO'S SPINE (design baseline §1a, from the contest's X1 "Spine"): the app's sections as one column on the
// left edge of every (studio) route - the brand, each place a glyph over its name, and at the foot what is about
// the operator: dev auth, the jobs that need them, the last 24 hours' spend, the kit, sign out. It replaced the
// header row (HeaderBar, retired 2026-11-17): where the operator is now reads as one tree down the left edge -
// spine, then a route's rooms (./ContextColumn.tsx), then a room's stages - and nothing about place sits above
// the work.
//
// The current section is derived from the pathname (./nav.ts sectionOf), never held; its lifted ground glides
// between places. Section links are ./NavLink.tsx (prefetch off, a soft navigation, the pending mark). A section
// that is not built is a disabled link: focusable, named, aria-disabled, with no href.
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Chip } from "@gt/ui/components/chip/Chip.tsx";
import { SectionGlyph } from "@gt/ui/components/glyph/SectionGlyph.tsx";

import { GLIDE } from "./ContextColumn.tsx";
import { FailedSlot, type NeedsReread } from "./FailedSlot.tsx";
import type { NeedsFacts, SpendFacts } from "./headerFacts.ts";
import { NavLink } from "./NavLink.tsx";
import { SECTIONS, sectionOf } from "./nav.ts";
import { useShell } from "./Providers.tsx";
import s from "./Shell.module.css";
import { SpendReadout } from "./SpendReadout.tsx";

export type SpineProps = { readonly devAuth: boolean; readonly facts: SpendFacts; readonly needs: NeedsFacts; readonly rereadNeeds: NeedsReread };

export function Spine({ devAuth, facts, needs, rereadNeeds }: SpineProps) {
  const here = sectionOf(usePathname());
  const reduce = useReducedMotion();
  const glide = reduce === true ? { duration: 0 } : GLIDE;
  const { signOut } = useShell();
  const kit = SECTIONS.find((x) => x.id === "kit");
  const pages = SECTIONS.filter((x) => x.id !== "kit");
  return (
    <header className={s.spine} data-component="StudioHeader">
      <Link className={s.brand} href="/floor" aria-label="Gravitone floor">
        <BrandMark />
      </Link>
      <nav className={s.nav} aria-label="sections">
        {pages.map((x) =>
          x.built ? (
            <NavLink key={x.id} className={s.item} href={x.href} current={here === x.id}>
              {here === x.id && <motion.span layoutId="spine-here" className={s.here} transition={glide} aria-hidden="true" />}
              <SectionGlyph name={x.id} className={s.glyph} />
              <span className={s.label}>{x.label}</span>
            </NavLink>
          ) : (
            <a key={x.id} className={s.item} role="link" aria-disabled="true" tabIndex={0}>
              <SectionGlyph name={x.id} className={s.glyph} />
              <span className={s.label}>{x.label}</span>
            </a>
          ),
        )}
      </nav>
      <div className={s.foot}>
        {devAuth && (
          <span data-testid="dev-auth-banner" className={s.dev}>
            <Chip label="dev" tone="rose" dot name="dev auth" />
          </span>
        )}
        <div className={s.needs}>
          <FailedSlot facts={needs} reread={rereadNeeds} readout />
        </div>
        <SpendReadout facts={facts} />
        {kit !== undefined && (
          <NavLink className={s.item} href={kit.href} current={here === "kit"}>
            {here === "kit" && <motion.span layoutId="spine-here" className={s.here} transition={glide} aria-hidden="true" />}
            <SectionGlyph name="kit" className={s.glyph} />
            <span className={s.label}>{kit.label}</span>
          </NavLink>
        )}
        <button type="button" className={s.item} onClick={() => void signOut()}>
          <SectionGlyph name="signout" className={s.glyph} />
          <span className={s.label}>Sign out</span>
        </button>
      </div>
    </header>
  );
}

/** The weir's four bars and the wall. Colour from tokens, through classes. */
export function BrandMark() {
  return (
    <svg className={s.mark} viewBox="0 0 26 26" width={26} height={26} fill="none" aria-hidden="true">
      <rect x="1" y="1" width="24" height="24" rx="7" className={s.markRim} />
      <path d="M7 17v-3M10.5 17v-6M14 17v-9M17.5 17v-5" className={s.markBars} />
      <path d="M20.5 6v14" className={s.markWall} />
    </svg>
  );
}
