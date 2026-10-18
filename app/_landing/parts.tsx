"use client";

// The landing's one control. Everything else on the page is a picture; this is
// the verb. The only strings the landing carries are this button's label, the
// names of the things drawn (types, templates, the library) and failure states
// — a sign-in that did not work has to be sayable.

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { StaleBadge } from "@/components/ui/signal/StaleBadge";
import { useAuth } from "@/lib/useAuth";

/**
 * Signed out it opens Google's popup (lib/useAuth falls back to a full-page
 * redirect when the popup is blocked); signed in it is simply the way through,
 * because a returning user should not have to prove anything twice.
 *
 * THE TWO STATES DO NOT SHARE A WORD (2026-09-08). Signed in it is a link to
 * /projects, signed out it hands you to Google, and a first-time visitor — the
 * only kind this page has, everything else being gated — used to click a word
 * meaning "go in" and get an account chooser nobody had mentioned. The label
 * names the thing that is about to happen. It stays one string and one verb
 * phrase, so the wordless brief holds. Sign-in is a detour, not the doorway, so
 * it carries the Google mark and not the arrow.
 *
 * It sits top right and is the only gold-filled thing on the page, so it is
 * findable at a glance at every size; on phones it is the same pill, smaller.
 */
const REASON_CHIP: Record<string, string | undefined> = {
  "session-ended": "session ended",
  "account-switched": "account changed",
};

/** The look is the Paper Cosmos stylesheet's (app/_landing/cosmos/cosmos.css, `.pc-enter*`): the
 *  coral cut-paper pill the owner chose with it. An `appearance` prop once picked between that and
 *  the retired Almanac door's gold pill (Tailwind over `--al-*`); nothing has drawn the gold one
 *  since the Almanac landing retired, so L74 dropped it and the prop. */
export function EnterButton({ className = "" }: { className?: string }) {
  const { user, loading, signIn, error, lastTransition } = useAuth();
  // Real state about the user's work: the shelf was wiped because the session
  // ended or the account changed. A deliberate sign-out stays silent (the user
  // did it). Dismissed locally the moment they sign in again; the provider's
  // transition is not ours to clear.
  const [seen, setSeen] = useState(false);
  const ended = !user && !seen ? REASON_CHIP[lastTransition ?? ""] : undefined;

  return (
    <div className={`pc-enter-wrap ${className}`}>
      {user ? (
        <Link href="/projects" className="pc-enter">
          Enter
          <ArrowRight className="pc-enter-arrow" aria-hidden />
        </Link>
      ) : (
        <button onClick={() => {
          setSeen(true);
          void signIn();
        }} disabled={loading} className="cursor-pointer pc-enter">
          <svg viewBox="-10 -10 20 20" aria-hidden="true" className="pc-enter-g">
            <path d="M5.3-5.3A7.5 7.5 0 1 0 7.4 1.3L2.4 1.3" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="5.3" cy="-5.3" r="1.7" fill="currentColor" />
            <circle cx="2.4" cy="1.3" r="2" fill="currentColor" />
          </svg>
          Sign in with Google
        </button>
      )}
      {ended && (
        <StaleBadge words={ended} glyph="history" />
      )}
      {error && (
        <p role="alert" className="pc-enter-err">
          {error}
        </p>
      )}
    </div>
  );
}
