"use client";

// THE FIRST POST. A page request reached the shell without a session cookie: either nobody
// is signed in (send them to sign in - v1's landing holds the only sign-in), or the browser
// is signed in and the server has not been told yet (the first visit since sign-in, or a
// cookie that expired with its token while the tab slept). Only the browser can tell the two
// apart, so the layout renders this instead of redirecting blind.
//
// Signed in: post the ID token, then refresh, and the layout renders again with a principal.
// The server's refusal is shown verbatim (an expired or foreign token is the operator's to
// see, not a spinner's to hide). Not signed in: replace, never push - a redirect is not a
// place the back button should return to (app-shell entitlement-gating).

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { useAuth } from "@/lib/useAuth";

import { BRIDGED, postSession } from "./session.ts";

export function Handoff() {
  const { user, authResolved } = useAuth();
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!authResolved) return;
    if (user === null || !BRIDGED) {
      router.replace("/");
      return;
    }
    let live = true;
    void user
      .getIdToken()
      .then(postSession)
      .then(
        (r) => {
          if (!live) return;
          if (r.ok) router.refresh();
          else setRefusal(r.error.message);
        },
        (cause: unknown) => {
          if (live) setRefusal(cause instanceof Error ? cause.message : String(cause));
        },
      );
    return () => {
      live = false;
    };
  }, [authResolved, user, router]);

  return refusal === null ? null : <ErrorLine message={refusal} live />;
}
