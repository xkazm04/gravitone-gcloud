"use client";

// The account control in the top nav — ported from the parent app's UserMenu,
// minus the API-key clipboard row and the consent badge (both belonged to the
// TTS backend), and minus framer-motion: this repo doesn't carry that
// dependency and a 160ms entrance is a keyframe, not a library.
//
// The entrance is the app's shared `.gt-rise` (globals.css) at this surface's
// weight — a 6px drop over 160ms, because a menu falls out of the control that
// opened it. It used to be a `gt-menu-in` keyframe declared here and injected
// by a <style> tag inside the open panel.
//
// NOT role="menu". It claimed the role — and role="menuitem" on its one item —
// which promises arrow-key navigation and Escape-to-close-and-restore, and it
// had neither; it had no Escape handler at all, while the bell beside it in the
// same nav did. Rather than build an ARIA menu widget for a panel with one
// button in it, the roles are gone and the contract is the plain one the markup
// already implements: Tab walks it, Enter fires, Escape closes and returns
// focus to the trigger, aria-expanded says which state it is in.

import { useEffect, useId, useRef, useState } from "react";
import { useAnnounce } from "@/lib/announcer";
import { useAuth } from "@/lib/useAuth";
import { LOCAL_MODE } from "@/lib/localMode";
import { Button } from "./Primitives";
import SignOutDialog, { buildArchive, saveArchive } from "./SignOutDialog";
import { errorText } from "./archiveSummary";
import { useWorld } from "./world";

/** In the Almanac world (`useWorld`) the control wears the kit's skin (`k-acct`, `k-tray`
 *  in components/kit/account.css); the behaviour is the same in both. `defaultOpen`
 *  seeds the panel open for the /kit specimen. */
export default function UserMenu({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  // NOT `signOut`. The account menu never ends a session itself: "Sign out"
  // opens <SignOutDialog>, which previews the wipe, offers the archive, and is
  // the one place the destructive call is made (AUP-B; signout-dialog.probe).
  const { user, profile, loading, ready, signIn } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const al = useWorld() === "almanac";
  const [open, setOpen] = useState(defaultOpen);
  const seeded = useRef(defaultOpen);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // ESCAPE, which this panel did not have at all. NotificationBell and
  // ContextMenu — the same dropdown shape, ten lines away in the same nav —
  // both closed on Escape; this one left a keyboard user with an open panel and
  // no way to dismiss it. Focus goes back to the trigger, so the next Tab
  // continues from where the user was rather than from the top of the document.
  useEffect(() => {
    if (!open) return;
    // Seeded open (the /kit specimen): do not steal focus and scroll to the panel.
    if (!seeded.current) firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // `ready` is FIREBASE being configured. Local mode has a user and no Firebase by design, and
  // the LOCAL_MODE branch of the panel below (where the work lives) was unreachable behind
  // this early return: the menu said "auth off" over a signed-in local owner.
  if (!ready && !(LOCAL_MODE && user)) {
    return <span className={al ? "k-caps k-muted" : "font-jetbrains text-label text-white/55"}>auth off</span>;
  }
  if (loading) {
    return <span className={al ? "k-caps k-muted" : "font-jetbrains text-label text-white/50"}>…</span>;
  }
  if (!user) {
    return (
      <Button variant="ghost" className="cursor-pointer px-4 py-1.5" onClick={() => void signIn()}>
        Sign in
      </Button>
    );
  }

  const initial = (profile?.displayName ?? user.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        ref={triggerRef}
        onClick={() => {
          seeded.current = false;
          setOpen((o) => !o);
        }}
        // NOT aria-haspopup. `aria-haspopup="true"` is the spec synonym for
        // `"menu"`, so this control announced "has menu" — re-making, to a
        // screen reader, the exact promise the header comment above says was
        // withdrawn from the markup: a menu owes arrow-key navigation and this
        // panel has one button in it. Disclosure is the honest pattern and it
        // needs only the two attributes below.
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={al ? "k-acct k-acct--user" : "flex cursor-pointer items-center gap-2 rounded-full border border-white/12 py-1 pr-3 pl-1 transition hover:border-white/25"}
      >
        {profile?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoURL}
            alt=""
            className={al ? "k-acct__av" : "h-7 w-7 rounded-full"}
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={al ? "k-acct__av k-acct__av--initial" : "grid h-7 w-7 place-items-center rounded-full bg-cyan-300 text-label font-semibold text-slate-950"}>
            {initial}
          </span>
        )}
        <span className={al ? "k-acct__name" : "hidden max-w-[140px] truncate text-label text-white/90 sm:block"}>
          {profile?.displayName ?? user.email}
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          style={{ "--gt-rise-y": "-6px", "--gt-rise-dur": "160ms" } as React.CSSProperties}
          className={al ? "gt-rise k-tray k-tray--menu" : "gt-rise glass-panel absolute top-full right-0 z-50 mt-2 w-60 rounded-xl p-2"}
        >
          <div className={al ? "k-tray__who" : "px-3 py-2"}>
            <div className={al ? "k-tray__nm" : "truncate text-label text-white"}>{profile?.displayName}</div>
            <div className={al ? "k-tray__em" : "font-jetbrains truncate text-label text-white/55"}>
              {LOCAL_MODE ? "this machine, this browser profile" : user.email}
            </div>
          </div>
          <div className={al ? "k-tray__rule" : "my-1 h-px bg-white/8"} />
          {LOCAL_MODE ? (
            // No sign-out in local mode: there is no session to end, and the
            // eviction a real sign-out runs would wipe the only copy of the
            // shelf. So the menu states where the work is instead of offering a
            // button that must lie or destroy.
            //
            // It used to close with "Unset NEXT_PUBLIC_LOCAL_MODE to run against
            // Google sign-in" — an env var, in an account menu, addressed to
            // nobody who is looking at one. Leaving local mode is a deployment
            // act; the person here wants to know their work is somewhere.
            //
            // The archive IS offered here (AUP-B): this browser holding the only
            // copy is exactly the case a backup file exists for, and it needs
            // no session to end.
            <>
              <p className={al ? "k-tray__note" : "font-jetbrains px-3 py-2 text-content leading-snug text-white/45"}>
                Local studio — work lives in this browser&apos;s storage, not in an account.
              </p>
              <LocalArchiveItem uid={user.uid} al={al} itemRef={firstItemRef} />
            </>
          ) : (
            <button
              type="button"
              ref={firstItemRef}
              onClick={() => {
                // Focus to the trigger BEFORE the panel unmounts, so the dialog
                // records a live opener and hands focus back to the account
                // control on close rather than to <main>.
                triggerRef.current?.focus();
                setOpen(false);
                setConfirming(true);
              }}
              className={al ? "k-tray__item" : ITEM_CLASS}
            >
              Sign out
            </button>
          )}
        </div>
      )}
      {!LOCAL_MODE && (
        <SignOutDialog open={confirming} onClose={() => setConfirming(false)} uid={user.uid} email={user.email} />
      )}
    </div>
  );
}

const ITEM_CLASS =
  "w-full cursor-pointer rounded-lg px-3 py-2 text-left text-label text-white/80 transition hover:bg-white/5 disabled:cursor-wait disabled:text-white/40";

/** Local mode's one account act: save the shelf as a `.gravitone` file. Built on
 *  press (no dialog to build it behind), saved to the person's own disk. */
function LocalArchiveItem({
  uid,
  al,
  itemRef,
}: {
  uid: string;
  al: boolean;
  itemRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const announce = useAnnounce();
  const [building, setBuilding] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const run = async () => {
    setBuilding(true);
    setFailure(null);
    try {
      saveArchive(await buildArchive(uid));
    } catch (e) {
      const text = errorText(e);
      setFailure(text);
      announce({ key: `local-archive-failed:${Date.now()}`, text });
    } finally {
      setBuilding(false);
    }
  };
  return (
    <>
      <button
        type="button"
        ref={itemRef}
        onClick={() => void run()}
        disabled={building}
        aria-busy={building}
        className={al ? "k-tray__item" : ITEM_CLASS}
      >
        Download archive
      </button>
      {failure && (
        <p className={al ? "k-tray__note" : "font-jetbrains px-3 py-2 text-content leading-snug text-rose-200"}>
          {failure}
        </p>
      )}
    </>
  );
}
