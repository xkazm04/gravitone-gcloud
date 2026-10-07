"use client";

// The door's one control. Everything else on the page is a picture; this is the
// verb. The only strings the door carries are this button's label, the names of
// the things drawn (constellations, pictures) and failure states — a sign-in
// that did not work has to be sayable.

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { StaleBadge } from "@/components/ui/signal";
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

/** `appearance` picks the skin and nothing else: the two states, their words,
 *  the reason chip and the error are the same on every landing. "almanac" is
 *  the door's gold pill; "paper" hands the look to the Paper Cosmos stylesheet
 *  (app/_landing/cosmos/cosmos.css, `.pc-enter*`), which draws the coral
 *  cut-paper pill the owner chose with it. */
export function EnterButton({
  className = "",
  appearance = "almanac",
}: {
  className?: string;
  appearance?: "almanac" | "paper";
}) {
  const { user, loading, signIn, error, lastTransition } = useAuth();
  // Real state about the user's work: the shelf was wiped because the session
  // ended or the account changed. A deliberate sign-out stays silent (the user
  // did it). Dismissed locally the moment they sign in again; the provider's
  // transition is not ours to clear.
  const [seen, setSeen] = useState(false);
  const ended = !user && !seen ? REASON_CHIP[lastTransition ?? ""] : undefined;

  const almanacShell =
    "font-hanken inline-flex items-center gap-2.5 rounded-full whitespace-nowrap font-semibold tracking-[0.02em] " +
    "bg-[var(--al-gold)] text-[var(--al-night)] transition duration-300 hover:-translate-y-px hover:brightness-110 " +
    "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--al-white)_35%,transparent),0_8px_34px_color-mix(in_srgb,var(--al-gold)_28%,transparent)] " +
    "px-4 py-2.5 text-[clamp(14px,1vw,14px)] min-[761px]:pl-[1.2em] min-[761px]:pr-[1.45em] min-[761px]:py-[0.8em] min-[761px]:text-[clamp(15px,0.78vw,19px)] " +
    "disabled:opacity-40";
  const paper = appearance === "paper";
  const shell = paper ? "pc-enter" : almanacShell;

  return (
    <div className={paper ? `pc-enter-wrap ${className}` : `flex flex-col items-end gap-2 ${className}`}>
      {user ? (
        <Link href="/projects" className={shell}>
          Enter
          <ArrowRight className={paper ? "pc-enter-arrow" : "h-[1.05em] w-[1.05em]"} aria-hidden />
        </Link>
      ) : (
        <button onClick={() => {
          setSeen(true);
          void signIn();
        }} disabled={loading} className={`cursor-pointer ${shell}`}>
          <svg viewBox="-10 -10 20 20" aria-hidden="true" className={paper ? "pc-enter-g" : "h-[1.05em] w-[1.05em] max-[760px]:hidden"}>
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
        <p
          role="alert"
          className={paper ? "pc-enter-err" : "font-hanken max-w-[240px] text-right text-label text-[var(--al-ant-t)]"}
        >
          {error}
        </p>
      )}
    </div>
  );
}
