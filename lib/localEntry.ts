// LOCAL ENTRY — the landing's "Enter locally" switch, judged on the server (operator, 2026-10-23:
// "bypassing google oauth if app running locally. So I can enter myself using my only local profile
// and db without auth").
//
// lib/localMode.ts is the same identity as a BUILD posture: NEXT_PUBLIC_LOCAL_MODE=1 and every visitor
// is the local owner. This is the RUNTIME door to that identity: a checkout with Firebase configured
// keeps Google sign-in, and the person at the machine may step past it. The studio's data is not
// scoped by uid (the kernel store is this machine's; a uid is only the actor on an act), so the local
// owner sees the same projects, Board and Library a Google sign-in does.
//
// The cookie (`gt_local=1`, lib/localMode.ts) is a CHOICE, not a credential: it carries no secret, and
// the server grants the local owner only while every condition below holds for THIS request -
//   1. the request reached the server on a loopback host (localhost, 127.x, ::1);
//   2. this is not a managed platform (lib/deployment.ts `localPosture`);
//   3. PRINCIPAL_MODE is legacy - verified mode cannot vouch for a person it never saw (localMode's rule);
//   4. LOCAL_ENTRY is not `off` - the kill switch.
//
// THE LIMIT, STATED. The host is read from the Host header, which a client on the LAN can forge, and
// Next fills x-forwarded-for from the socket only when the client sent none (base-server.js `??=`), so
// neither proves the socket is local. `next dev` listens on every interface: a studio reachable from
// the LAN binds loopback (`next dev -H 127.0.0.1`) or sets LOCAL_ENTRY=off. That is the legacy posture
// this lives in - its shared secret already ships to any browser that loads the page (the NEXT_PUBLIC_
// twin). Money still needs that secret: being local changes who you are, not what spending requires.
//
// Server-side only by use: it spells server env names, which a client module must not (check:bundle).

import { localPosture } from "./deployment.ts";
import { LOCAL_ENTRY_COOKIE } from "./localMode.ts";
import { principalMode } from "./principal.ts";

export function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "::1" || /^127(\.\d{1,3}){3}$/.test(h);
}

/** A Host header's hostname (`localhost:3000` -> `localhost`, `[::1]:3000` -> `[::1]`), or null. */
function hostnameOf(host: string | null | undefined): string | null {
  if (host === null || host === undefined || host.trim() === "") return null;
  try {
    return new URL(`http://${host.trim()}`).hostname;
  } catch {
    return null;
  }
}

/** Whether this request may step past sign-in at all: conditions 1-4 above. */
export function localEntryAvailable(host: string | null | undefined): boolean {
  if ((process.env["LOCAL_ENTRY"] ?? "").trim().toLowerCase() === "off") return false;
  if (localPosture() === "managed-platform") return false;
  if (principalMode() !== "legacy") return false;
  const name = hostnameOf(host);
  return name !== null && isLoopbackHost(name);
}

/** The local owner is granted: the choice was made in this browser AND the request may take it. */
export function localEntryGranted(choice: string | undefined, host: string | null | undefined): boolean {
  return choice === "1" && localEntryAvailable(host);
}

/** The local choice is readable by script on purpose (it is the client's hint, and holds nothing secret); Strict, so no other site carries it. */
export function localEntryCookie(on: boolean): string {
  return on ? `${LOCAL_ENTRY_COOKIE}=1; Path=/; SameSite=Strict; Max-Age=${30 * 24 * 3600}` : `${LOCAL_ENTRY_COOKIE}=; Path=/; SameSite=Strict; Max-Age=0`;
}
