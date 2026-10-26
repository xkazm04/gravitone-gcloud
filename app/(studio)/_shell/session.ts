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
// zod/mini, not classic zod: this file is in the shell's client bundle (see @gt/domain/door).
import { object, string } from "zod/mini";

import { parseJsonAt } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import { DEV_AUTH } from "@/lib/devAuth";
import { authClient, firebaseReady } from "@/lib/firebase";
import { LOCAL_MODE } from "@/lib/localMode";

/** True where a Firebase session exists to bridge at all. */
export const BRIDGED = firebaseReady && !DEV_AUTH && !LOCAL_MODE;

/** A refusal's body: app/_server/http.ts `envelope` - the sentence is `error`. */
const REFUSAL = object({ error: string() });

/** The server's sentence out of its envelope, else the body as it came (a proxy's page, a bare text). */
function refusalWords(body: string): string {
  const e = parseJsonAt("session refusal", REFUSAL, body);
  return e.ok ? e.value.error : body;
}

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
    return err(code, `session answered ${r.status}: ${refusalWords(await r.text())}`);
  } catch (cause) {
    return err("unavailable", "session unreachable", { cause });
  }
}

/**
 * Re-post on every rotation; `report` hears a refusal (the shell's toast). Returns the unsubscribe.
 *
 * Firebase calls the listener once on subscribe with the current user. When the layout has just
 * verified this browser's cookie (`cookieHeld`: it handed the shell an identity), that call carries
 * the token the server already holds, and posting it is a verified round trip for nothing - on a
 * first visit it is the second post after the handoff's. Only a rotation posts then. The price: a
 * token Firebase refreshed while the tab was closed reaches the server at the next rotation, the
 * cookie living its own token's life until then.
 */
export function subscribeSessionCookie(report: (message: string) => void, cookieHeld = false): () => void {
  if (!BRIDGED) return () => undefined;
  let initial = cookieHeld;
  return onIdTokenChanged(authClient(), (user) => {
    if (initial) {
      initial = false;
      return;
    }
    if (user === null) return;
    void user
      .getIdToken()
      .then(postSession)
      .then((r) => {
        if (!r.ok) report(r.error.message);
      }, (cause: unknown) => report(errorMessage(cause)));
  });
}
