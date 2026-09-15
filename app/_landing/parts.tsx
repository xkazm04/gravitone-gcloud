"use client";

// Shared leaves for the wordless landing variants.
//
// The brief for this page is one line: no copy, one CTA, and an image that says
// what the app is. So the only string on the door is the verb on the button —
// everything else has to be carried by the drawing. The two exceptions are
// failure states (a sign-in that did not work has to be sayable) and the
// accessible name on the art, which is for screen readers and costs no pixels.
//
// Motion is entrance-only and hover-gated, per the repo's animation austerity
// rule: nothing here is still running once you have looked at it. All of it is
// CSS, so globals.css's prefers-reduced-motion block already switches it off.
//
// The two keyframes the door's art uses — `gt-rise` (the app's shared entrance,
// at this surface's own weight) and `gt-bloom` (a scale, the one entrance in
// the app that is genuinely a different shape) — are declared in globals.css
// with every other entrance, rather than being injected here by a <style> tag.

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useAuth } from "@/lib/useAuth";

/**
 * The door. Signed out it opens Google's popup (lib/useAuth falls back to a
 * full-page redirect when the popup is blocked); signed in it is simply the way
 * through, because a returning user should not have to prove anything twice.
 *
 * THE TWO STATES NO LONGER SHARE A WORD (2026-09-08). Both used to say "Enter",
 * which is true of exactly one of them: signed in it is a link to /projects,
 * signed out it hands you to Google. A first-time visitor — the only kind this
 * page has, since everything else is gated — clicked a word meaning "go in" and
 * got an account chooser nobody had mentioned. The label now names the thing
 * that is about to happen. It is still one string and still a verb phrase, so
 * the wordless brief holds.
 *
 * The arrow goes with it. An arrow means "onward, through here"; sign-in is a
 * detour, not the doorway, and dropping it is also what keeps the longer label
 * inside a 360px viewport (measured: ~301px of pill against 312px of usable
 * width, versus ~329px with the icon).
 */
export function EnterButton({ className = "" }: { className?: string }) {
  const { user, loading, signIn, error } = useAuth();

  const shell =
    "font-jetbrains inline-flex items-center gap-3 rounded-full px-8 py-4 text-label tracking-[0.18em] uppercase " +
    "bg-gradient-to-r from-cyan-300 to-cyan-200 text-slate-950 font-semibold transition hover:brightness-110 " +
    "cta-glow disabled:opacity-40";

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {user ? (
        <Link href="/projects" className={shell}>
          Enter
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : (
        <button onClick={() => void signIn()} disabled={loading} className={`cursor-pointer ${shell}`}>
          Sign in with Google
        </button>
      )}
      {error && (
        <p className="font-jetbrains max-w-xs text-center text-content text-rose-300/90">{error}</p>
      )}
    </div>
  );
}

/** The page the art hangs in: ink, aurora, grain, nothing else. */
export function LandingShell({
  label,
  children,
}: {
  /** Accessible name for the illustration. Not the page's heading — that is the
   *  sr-only <h1> below, which has to live outside this region to survive. */
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--gt-ink)] grain">
      {/* THE PAGE'S ONE HEADING. Measured over CDP against the running app on
          2026-09-08: `headings on page: 0`. Navigating by heading is a primary
          screen-reader mode, and this door offered it nothing — the product's
          name existed only in <title>. `sr-only` (built into Tailwind v4) costs
          no pixels, which is the same exception this file's header already
          grants the accessible name on the art.

          IT SITS OUTSIDE <main role="img">, and that placement is the whole
          trick: role="img" makes its subtree presentational, so a heading
          inside would be pruned from the accessibility tree and this fix would
          silently do nothing. (The ENTER control inside survives only because
          ARIA never prunes a focusable descendant — verified in the AX dump,
          where it is still exposed and still first in tab order.) The string is
          the <title> in app/layout.tsx verbatim, so the two cannot drift. */}
      <h1 className="sr-only">Gravitone — a content studio</h1>
      <div className="pointer-events-none absolute inset-0 aurora" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      <main
        role="img"
        aria-label={label}
        className="relative grid min-h-screen place-items-center px-6 py-20"
      >
        {children}
      </main>
    </div>
  );
}
