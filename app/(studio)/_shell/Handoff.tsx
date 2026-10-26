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

import { errorMessage } from "@gt/domain/errors";
import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { useAuth } from "@/lib/useAuth";

import { BRIDGED, postSession } from "./session.ts";

/** How long the refresh after a good post may take before the shell reads the cookie as dropped. */
export const REFRESH_MS = 10_000;

/**
 * The server answered 200 and set `gt_session`, the refresh went out, and the layout still rendered
 * this handoff: the next request arrived without the cookie. Reproducible over plain http on a
 * non-loopback address, where the cookie is Secure (app/_server/session.ts `secureFor`) and the
 * browser drops it.
 */
export const COOKIE_DROPPED = "the server set the gt_session cookie and the next request arrived without it - the browser dropped it (a Secure cookie over plain http on a non-loopback address)";

export function Handoff() {
  const { user, authResolved } = useAuth();
  const router = useRouter();
  const [refusal, setRefusal] = useState<string | null>(null);
  const [refreshed, setRefreshed] = useState(false);

  // A refresh that worked unmounts this component (the layout renders the shell), which clears the
  // timer; one still mounted when it fires means the refreshed request was refused again.
  useEffect(() => {
    if (!refreshed) return;
    const t = setTimeout(() => setRefusal(COOKIE_DROPPED), REFRESH_MS);
    return () => clearTimeout(t);
  }, [refreshed]);

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
          if (r.ok) {
            router.refresh();
            setRefreshed(true);
          } else setRefusal(r.error.message);
        },
        (cause: unknown) => {
          if (live) setRefusal(errorMessage(cause));
        },
      );
    return () => {
      live = false;
    };
  }, [authResolved, user, router]);

  return refusal === null ? null : <ErrorLine message={refusal} live />;
}
