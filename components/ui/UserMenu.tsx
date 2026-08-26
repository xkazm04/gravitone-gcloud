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

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { LOCAL_MODE } from "@/lib/localMode";
import { Button } from "./Primitives";

export default function UserMenu() {
  const { user, profile, loading, ready, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
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
    firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!ready) {
    return <span className="font-jetbrains text-[11px] text-white/40">auth off</span>;
  }
  if (loading) {
    return <span className="font-jetbrains text-[11px] text-white/50">…</span>;
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
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 rounded-full border border-white/12 py-1 pr-3 pl-1 transition hover:border-white/25"
      >
        {profile?.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photoURL}
            alt=""
            className="h-7 w-7 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-full bg-cyan-300 text-sm font-semibold text-slate-950">
            {initial}
          </span>
        )}
        <span className="hidden max-w-[140px] truncate text-sm text-white/90 sm:block">
          {profile?.displayName ?? user.email}
        </span>
      </button>

      {open && (
        <div
          style={{ "--gt-rise-y": "-6px", "--gt-rise-dur": "160ms" } as React.CSSProperties}
          className="gt-rise glass-panel absolute top-full right-0 z-50 mt-2 w-60 rounded-xl p-2"
        >
          <div className="px-3 py-2">
            <div className="truncate text-sm text-white">{profile?.displayName}</div>
            <div className="font-jetbrains truncate text-[11px] text-white/55">
              {LOCAL_MODE ? "this machine, this browser profile" : user.email}
            </div>
          </div>
          <div className="my-1 h-px bg-white/8" />
          {LOCAL_MODE ? (
            // No sign-out in local mode: there is no session to end, and the
            // eviction a real sign-out runs would wipe the only copy of the
            // shelf. Leaving local mode is an env change, and the menu says so
            // instead of offering a button that must lie or destroy.
            <p className="font-jetbrains px-3 py-2 text-[11px] leading-snug text-white/45">
              Local studio — work lives in this browser&apos;s storage. Unset NEXT_PUBLIC_LOCAL_MODE to
              run against Google sign-in.
            </p>
          ) : (
            <button
              ref={firstItemRef}
              onClick={() => void signOut()}
              className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/5"
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
