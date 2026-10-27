// THE NEW WORLD'S SHELL - auth and chrome for every `(studio)` route (plan §3.3, §4).
//
// A Server Component: it asks the server who is here (Lot 8's `principal()`, which reads and
// re-verifies the session cookie, and answers the dev fixture under DEV_AUTH) before anything
// renders.
//
// v1 gated in the client (`AuthGate`), so every gated page shipped its markup to a browser
// that might not be signed in and then hid it. Here a page without a principal renders no
// page at all - only the handoff, which either completes the session or leaves for sign-in.
//
// NESTED UNDER v1's ROOT, FOR NOW. app/layout.tsx still owns <html> and <body> with v1's
// globals.css (Tailwind preflight), its providers and Firebase client; moving every v1 route
// into a group so this one could be a root layout is Phase 6 work. Until then the world is a
// root ELEMENT, `[data-world="next"]`, and every global rule this world brings is scoped to
// it (./_shell/world.css). What v1 leaks into it is measured and recorded in the Lot 9 report.

import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ErrorLine } from "@gt/ui/components/errorline/ErrorLine.tsx";
import { DEV_AUTH } from "@/lib/devAuth";

import { principal } from "../_server/principal.ts";
// The generated tokens (`:root` custom properties), through the package's own export.
import "@gt/ui/tokens.css";
import "./_shell/world.css";
import { AgentNav } from "./_shell/AgentNav.tsx";
import { Handoff } from "./_shell/Handoff.tsx";
import { Providers } from "./_shell/Providers.tsx";
import { StudioHeader } from "./_shell/StudioHeader.tsx";
import s from "./_shell/Shell.module.css";

// The page's identity for an agent's page bridge (athena-portable packages/athena-bridge/protocol.md
// `page`): its tools are catalogued as `host.gravitone.<name>` (./_shell/AgentNav.tsx).
export const metadata: Metadata = { other: { "athena:app": "gravitone", "athena:app-name": "Gravitone Studio" } };

// `sheet` is the Board's slot (./@sheet): a soft navigation to /board/<packet> draws the Board
// there, over the page `children` keeps mounted; every other address draws nothing in it.
export default async function StudioLayout({ children, sheet }: { readonly children: ReactNode; readonly sheet?: ReactNode }) {
  const who = await principal();
  // Two refusals, two meanings. 401: no cookie, or one the verifier rejected - the browser
  // may still hold a session, so the handoff decides. 503: the verifier could not reach its
  // keys - an outage is not a sign-out, and sending the operator to sign in again would not
  // fix it; the refusal's own words say what is down.
  return (
    <div data-world="next" className={s.world}>
      {who.kind === "refused" ? (
        who.status === 503 ? (
          <ErrorLine message={who.detail} live />
        ) : (
          <Handoff />
        )
      ) : (
        <Providers identity={"uid" in who ? who.uid : null}>
          <a className={s.skip} href="#content">
            Skip to content
          </a>
          <StudioHeader devAuth={DEV_AUTH} />
          <main id="content" className={s.main} tabIndex={-1}>
            {children}
          </main>
          {sheet}
          <AgentNav />
        </Providers>
      )}
    </div>
  );
}
