// THE CLIENT HALF OF THE SESSION BRIDGE (Lot 8's app/_server/session.ts is the server half).
//
// The browser's Firebase session lives in its own IndexedDB, where a server render cannot
// see it; the server learns who is here only from the `gt_session` cookie, which carries
// the Firebase ID token itself and lives exactly as long as that token (about an hour).
// So the client owes the server two posts: the FIRST one (the shell's handoff, when a page
// request arrived without a cookie but the browser is signed in) and every ROTATION after
// it (Firebase's token-change event, about hourly). The server mints and extends nothing.
//
// The subscription sits beside v1's own (lib/sessionToken.ts `subscribeSessionToken`, which
// caches the same token for API headers) rather than inside it: that module is v1's, and the
// cookie is this world's. Both listen to the same Firebase event, so they cannot disagree
// about which token is current for longer than one post.
//
// Not posted: the dev fixture and the local owner. Neither has an ID token; the server
// resolves both postures itself (resolveSession), and a post would be refused as malformed.

import { onIdTokenChanged } from "firebase/auth";

import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { DEV_AUTH } from "@/lib/devAuth";
import { authClient, firebaseReady } from "@/lib/firebase";
import { LOCAL_MODE } from "@/lib/localMode";

/** True where a Firebase session exists to bridge at all. */
export const BRIDGED = firebaseReady && !DEV_AUTH && !LOCAL_MODE;

/** Hand the server the current ID token. The refusal is the server's own words. */
export async function postSession(token: string): Promise<Result<null>> {
  try {
    const r = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    });
    if (r.ok) return ok(null);
    const code = r.status === 401 ? "unauthenticated" : r.status === 403 ? "refused" : "unavailable";
    return err(code, `session answered ${r.status}: ${await r.text()}`);
  } catch (cause) {
    return err("unavailable", "session unreachable", { cause });
  }
}

/** Re-post on every rotation; `report` hears a refusal (the shell's toast). Returns the unsubscribe. */
export function subscribeSessionCookie(report: (message: string) => void): () => void {
  if (!BRIDGED) return () => undefined;
  return onIdTokenChanged(authClient(), (user) => {
    if (user === null) return;
    void user
      .getIdToken()
      .then(postSession)
      .then((r) => {
        if (!r.ok) report(r.error.message);
      }, (cause: unknown) => report(errorMessage(cause)));
  });
}
