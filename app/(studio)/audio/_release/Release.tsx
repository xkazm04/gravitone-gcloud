"use client";

// THE RELEASE TAB (spark audio-distribution; the catalog since spark studio-to-release): every stored release by where
// it stands (./catalog/), each opening into the studio's package stage; and the wizard on this tab for a release the
// URL opens (`r`) or one just made from the shelf. The draft lives in ./Session.tsx above both (registry wizard-flows:
// one model owns every step). On the real side the session writes through the release acts (./acts.ts); on the
// fixture nothing is written.
import { useCallback } from "react";

import type { ReleaseRead, ReleaseUrl } from "./_port/port.ts";
import type { ReleaseActs } from "./act.ts";
import { Catalog } from "./catalog/Catalog.tsx";
import { ReleaseSession } from "./Session.tsx";
import { Wizard } from "./wizard/Wizard.tsx";
import s from "./release.module.css";

// The Server Actions, reached by dynamic import: a static import would put ./acts.ts's doors (zod) in this island's
// first-load closure (tests/next-gates/client-closure.test.ts). A server parent may hand `acts` in instead.
const REAL_ACTS: ReleaseActs = {
  releaseThis: async (i) => (await import("./acts.ts")).releaseThisAct(i),
  create: async (i) => (await import("./acts.ts")).createReleaseAct(i),
  apply: async (i) => (await import("./acts.ts")).applyReleaseAct(i),
};

const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

export function Release({ read, url, acts }: { readonly read: ReleaseRead; readonly url: ReleaseUrl; readonly acts?: ReleaseActs | null }) {
  const newId = useCallback(() => `rel-${hex12()}`, []);
  const doors = acts !== undefined ? acts : read.source === "real" ? REAL_ACTS : null;
  return (
    <section className={s.tab}>
      <ReleaseSession read={read} openId={url.release} acts={doors}>
        {(session) => (session.state.openId === null ? <Catalog read={read} session={session} newId={newId} /> : <Wizard read={read} session={session} newId={newId} />)}
      </ReleaseSession>
    </section>
  );
}
