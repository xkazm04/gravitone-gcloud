"use client";

// The gate every signed-in route sits behind. ONE implementation, mounted per
// route rather than per component — the same shape the parent app used, and the
// thing StudioFrame's header comment said to add "when a real session exists".
//
// It FAILS CLOSED. `authResolved` is true either when Firebase has reported a
// session or when Firebase is not configured at all; in both cases a missing
// user bounces to the landing. A deployment that forgets its env therefore
// shows nobody the studio, instead of showing everybody the studio.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/useAuth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, authResolved } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authResolved && !user) router.replace("/");
  }, [authResolved, user, router]);

  if (!authResolved || !user) {
    return (
      <div className="font-jetbrains grid min-h-screen place-items-center bg-[var(--gt-ink)] text-[12px] tracking-[0.18em] text-white/55 uppercase">
        {authResolved ? "redirecting…" : "checking session…"}
      </div>
    );
  }

  return <>{children}</>;
}
