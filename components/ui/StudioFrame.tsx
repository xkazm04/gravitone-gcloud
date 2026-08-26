"use client";

import Link from "next/link";
import { Wordmark } from "./Primitives";
import UserMenu from "./UserMenu";
import NotificationBell from "./NotificationBell";
import { DEV_AUTH } from "@/lib/devAuth";

// The module list for this app. Projects is the shelf; the studio is opened
// from a row on it and therefore has no context-free link of its own — /studio
// without a project is not a page, it is a redirect back here.
// "Library" holds several modules now — Styles is the first, with Assets and
// Animations beside it — so the nav names the place and the page's own tab
// strip names the module. That also settles the earlier collision with the
// studio's per-project asset shelves (app/_library): those are what ONE project
// produced, this is the cross-project shelf everything is built from.
export const MODULES = [
  { label: "Projects", href: "/projects" },
  { label: "Library", href: "/library" },
  // Temporary by design: a bench for exercising the music vendor's latest
  // feature surface (plan drafting, section editing, SFX) before any of it is
  // promoted into the studio's own steps. Remove when the Score phase has
  // absorbed what the bench was built to learn.
  { label: "Playground", href: "/playground" },
];

/** Obsidian app shell: aurora atmosphere + top nav + the account control.
 *
 *  Descended from gravitone/web's AppFrame. The auth gate its header comment
 *  used to promise now exists — it is <AuthGate>, mounted per route (see
 *  app/projects/page.tsx and app/studio/page.tsx) rather than here, because the
 *  landing page uses no frame and every framed route is gated anyway. */
export default function StudioFrame({ children }: { children: React.ReactNode }) {
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
          className="font-jetbrains relative z-40 bg-amber-400/15 px-4 py-1.5 text-center text-[11px] tracking-[0.14em] text-amber-200 uppercase"
        >
          dev auth bypass active — signed in as a fixture, not a real account
        </div>
      )}
      <div className="relative mx-auto max-w-6xl px-6">
        <nav className="flex items-center justify-between gap-4 py-6">
          <div className="flex items-center gap-7">
            <Link href="/projects" aria-label="Projects">
              <Wordmark />
            </Link>
            <div className="font-jetbrains hidden items-center gap-7 text-[13px] text-white/70 md:flex">
              {MODULES.map((m) => (
                <Link key={m.href} href={m.href} className="transition hover:text-white">
                  {m.label}
                </Link>
              ))}
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
