"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Primitives";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import { DEV_AUTH } from "@/lib/devAuth";
import { LOCAL_MODE } from "@/lib/localMode";

// The module list for this app. Projects is the shelf; the studio is opened
// from a row on it and therefore has no context-free link of its own — /studio
// without a project is not a page, it is a redirect back here.
// "Library" holds several modules now — Styles is the first, with Assets and
// Animations beside it — so the nav names the place and the page's own tab
// strip names the module.
//
// THE COLLISION THIS COMMENT ONCE CLAIMED TO HAVE SETTLED WAS NOT SETTLED. It
// said renaming the nav item resolved the clash with the studio's per-project
// asset shelves (app/_library) — but the studio went on drawing its own button
// labelled "Library", three inches under this row and pointing somewhere else:
// this one is a ROUTE to the cross-project shelf, that one swapped a panel
// inside the open project. Two controls, one word, two destinations, visible
// together on every studio screen. Naming one side of a collision settles
// nothing while the other side keeps the word.
// Settled for real on 2026-09-08 by changing the OTHER side: the studio's
// control is now "Outputs" and is a disclosure toggle on the project's own
// title line, not a nav (app/studio/[projectId]/StudioView.tsx). "Library" is
// this link and only this link — the cross-project shelf everything is built
// from; what ONE project produced is that project's Outputs.
export const MODULES = [
  { label: "Projects", href: "/projects" },
  { label: "Library", href: "/library" },
  // Temporary by design: a bench for exercising the music vendor's latest
  // feature surface (plan drafting, section editing, SFX) before any of it is
  // promoted into the studio's own steps. Remove when the Score phase has
  // absorbed what the bench was built to learn.
  { label: "Playground", href: "/playground" },
  // Upstream of the Library, and deliberately not a tab of it: the Library
  // holds ratified things a project stands on, the foundry mass-produces
  // candidates most of which are meant to be deleted. Runs on the local GPU
  // for hours (pipeline/foundry), culled here by hand.
  { label: "Foundry", href: "/foundry" },
];

/** Obsidian app shell: aurora atmosphere + top nav + the account control.
 *
 *  Descended from gravitone/web's AppFrame. The auth gate its header comment
 *  used to promise now exists — it is <AuthGate>, mounted per route (see
 *  app/projects/page.tsx and app/studio/page.tsx) rather than here, because the
 *  landing page uses no frame and every framed route is gated anyway. */
export default function StudioFrame({ children }: { children: React.ReactNode }) {
  // WHERE YOU ARE, MARKED IN THE ONE PLACE THAT IS ALWAYS ON SCREEN.
  //
  // The nav drew four identical links and no current state, so every module
  // page then had to say its own name twice more — an <Eyebrow> and an <h1>
  // over content that is already unmistakably the shelf, the library, the
  // bench. Three labels for one location, and the only one a reader consults
  // to orient themselves is this row. Marked here, the other two are removable.
  //
  // A child route counts as the module (`/projects/new` is Projects), because
  // the question the nav answers is "which part of the app is this", not "which
  // URL". `aria-current="page"` is the same answer for a screen reader, which
  // reads nothing off a brighter white.
  //
  // And a brighter white is all a sighted reader had: white vs white/70 is one
  // signal in one channel, which the repo's own law forbids for a state (colour
  // is never the only signal). So the current module also carries a RULE under
  // it — a shape, present or absent, legible at a glance and in a screenshot at
  // any contrast. It doubles as the kind-marker this row needed: these four are
  // PLACES, underlined the way a tab strip underlines, and nothing inside a
  // page is drawn this way.
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="font-hanken relative min-h-screen overflow-hidden bg-[var(--gt-ink)] text-slate-200 grain">
      {/* The aurora reads --gt-level / --gt-working (globals.css, filter only),
          so the atmosphere can lean into whatever is playing or rendering once
          a signal source exists. At the idle defaults it is the identity
          filter — same frame either way. */}
      <div className="pointer-events-none absolute inset-0 aurora" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      {DEV_AUTH && (
        <div
          data-testid="dev-auth-banner"
          className="font-jetbrains relative z-40 bg-amber-400/15 px-4 py-1.5 text-center text-label tracking-[0.14em] text-amber-200 uppercase"
        >
          dev auth bypass active — signed in as a fixture, not a real account
        </div>
      )}
      {/* `max-w-shell` — 1760px with 8px gutters, declared once in globals.css
          (--container-shell) because the foundry's three fixed bottom bars
          escape this container and have to restate it. Raised from 1440/16px
          on 2026-09-08 for the same reason as 2026-08-28's halving: the type
          scale went up a rung and the width to carry it comes out of
          x-spacing, not out of the content — the operator's explicit trade. */}
      <div className="relative mx-auto max-w-shell px-2">
        <nav className="flex items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-7">
            <Link href="/projects" aria-label="Projects">
              <Wordmark />
            </Link>
            {LOCAL_MODE && (
              // A mode, not a warning — quiet on purpose, unlike the amber
              // dev-auth banner. It answers "where is my work?" at a glance:
              // here, in this browser, nowhere else.
              <span className="font-jetbrains rounded-full border border-white/12 bg-white/[0.04] px-2.5 py-0.5 text-label tracking-[0.14em] text-white/50 uppercase">
                local
              </span>
            )}
            <div className="font-jetbrains hidden items-center gap-7 text-label text-white/70 md:flex">
              {MODULES.map((m) => {
                const here = isActive(m.href);
                return (
                  <Link
                    key={m.href}
                    href={m.href}
                    aria-current={here ? "page" : undefined}
                    className={`relative transition ${
                      here ? "text-white" : "text-white/70 hover:text-white"
                    }`}
                  >
                    {m.label}
                    {here && (
                      <span
                        aria-hidden
                        className="absolute -bottom-1.5 left-0 h-px w-full bg-cyan-400/70"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <UserMenu />
          </div>
        </nav>
        {children}
      </div>
    </div>
  );
}
