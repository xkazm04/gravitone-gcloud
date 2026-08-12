"use client";

// The account control in the top nav — ported from the parent app's UserMenu,
// minus the API-key clipboard row and the consent badge (both belonged to the
// TTS backend), and minus framer-motion: this repo doesn't carry that
// dependency and a 160ms entrance is a keyframe, not a library.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { Button } from "./Primitives";

const MENU_IN = `@keyframes gt-menu-in{from{opacity:0;transform:translate3d(0,-6px,0)}to{opacity:1;transform:none}}`;

export default function UserMenu() {
  const { user, profile, loading, ready, signIn, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

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
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
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
          role="menu"
          style={{ animation: "gt-menu-in 160ms var(--gt-ease) both" }}
          className="glass-panel absolute top-full right-0 z-50 mt-2 w-60 rounded-xl p-2"
        >
          <style>{MENU_IN}</style>
          <div className="px-3 py-2">
            <div className="truncate text-sm text-white">{profile?.displayName}</div>
            <div className="font-jetbrains truncate text-[11px] text-white/55">{user.email}</div>
          </div>
          <div className="my-1 h-px bg-white/8" />
          <button
            role="menuitem"
            onClick={() => void signOut()}
            className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-white/80 transition hover:bg-white/5"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
