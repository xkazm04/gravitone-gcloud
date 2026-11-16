"use client";

// THE RELEASE TAB (spark audio-distribution; the catalog since spark studio-to-release): every release, and the
// wizard that walks one. The draft lives in ./Session.tsx above the wizard (registry wizard-flows: one model owns
// every step). WP1 turns this tab into the catalog of stored releases by status, each opening into the studio's
// packaging stage; until then it is the wizard over the session, as before.
import { useCallback } from "react";

import type { ReleaseRead, ReleaseUrl } from "./_port/port.ts";
import type { ReleaseActs } from "./act.ts";
import { ReleaseSession } from "./Session.tsx";
import { Wizard } from "./wizard/Wizard.tsx";
import s from "./release.module.css";

const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

export function Release({ read, url, acts = null }: { readonly read: ReleaseRead; readonly url: ReleaseUrl; readonly acts?: ReleaseActs | null }) {
  const newId = useCallback(() => `rel-${hex12()}`, []);
  return (
    <section className={s.tab}>
      <ReleaseSession read={read} openId={url.release} acts={acts}>
        {(session) => <Wizard read={read} session={session} newId={newId} />}
      </ReleaseSession>
    </section>
  );
}
