"use client";

// The gate every signed-in route sits behind. ONE implementation, mounted per
// route rather than per component — the same shape the parent app used, and the
// thing StudioFrame's header comment said to add "when a real session exists".
//
// It FAILS CLOSED. `authResolved` is true either when Firebase has reported a
// session or when Firebase is not configured at all; in both cases a missing
// user bounces to the landing. A deployment that forgets its env therefore
// shows nobody the studio, instead of showing everybody the studio.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { FIXTURE_MODE } from "@/lib/fixtures/mode";
import { useAuth } from "@/lib/useAuth";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, authResolved } = useAuth();
  const router = useRouter();
  // Fixture mode only: the browser database is filled BEFORE any gated page
  // mounts, so no page reads an empty shelf and then a full one. Outside
  // fixture mode `seeded` starts true and the effect below never runs.
  const [seeded, setSeeded] = useState(!FIXTURE_MODE);
  const [seedError, setSeedError] = useState<string | null>(null);
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (authResolved && !user) router.replace("/");
  }, [authResolved, user, router]);

  useEffect(() => {
    if (!FIXTURE_MODE || !uid) return;
    let live = true;
    import("@/lib/fixtures/seedBrowser")
      .then((m) => m.ensureBrowserFixtures(uid))
      .then(() => live && setSeeded(true))
      .catch((e) => live && setSeedError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [uid]);

  if (seedError) {
    return (
      <div className="font-jetbrains grid min-h-screen place-items-center bg-[var(--gt-ink)] px-6 text-center text-label tracking-[0.18em] text-white/70 uppercase">
        {seedError}
      </div>
    );
  }

  if (!authResolved || !user || !seeded) {
    return (
      <div className="font-jetbrains grid min-h-screen place-items-center bg-[var(--gt-ink)] text-label tracking-[0.18em] text-white/55 uppercase">
        {authResolved && !user ? "redirecting…" : authResolved ? "seeding fixtures…" : "checking session…"}
      </div>
    );
  }

  return <>{children}</>;
}
