"use client";

// THE STUDIO'S PACKAGING AND RELEASE STAGES (spark studio-to-release): one surface, three stages - make, package,
// release. In package and release the conversation stays and the release's steps join it; the release stage is the
// wizard opened at its review (the Calendar slots and Schedule). The draft is the release session (../../_release/
// Session.tsx): on the fixture side nothing is written, on the real side every edit goes to the store with its
// version. The layout is the dock (the owner's pick, 2026-11-17: the step in front, the conversation folded into
// the dock; the split it beat is commit 7a93c72a). The acts come from the server parent (Studio.tsx)
// as Server Action references: a value import of ../../_release/acts.ts here would pull its zod door into this client
// chunk (the client-closure gate).
import { useCallback } from "react";

import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import type { ReleaseRead } from "../../_release/_port/port.ts";
import type { ReleaseActs } from "../../_release/act.ts";
import { ReleaseSession } from "../../_release/Session.tsx";
import { STUDIO_STAGES, studioHref, type StudioUrl } from "../url.ts";
import { Dock } from "./dock/Dock.tsx";
import s from "./packaging.module.css";

const STAGE_LABEL = { make: "make", package: "package", release: "release" } as const;

const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

export function Packaging({ url, read, thread, acts }: { readonly url: StudioUrl; readonly read: ReleaseRead; readonly thread: React.ReactNode; readonly acts: ReleaseActs | null }) {
  const newId = useCallback(() => `rel-${hex12()}`, []);
  const tabs = STUDIO_STAGES.map((st) => ({ id: st, label: STAGE_LABEL[st], href: studioHref({ ...url, stage: st }) }));
  return (
    <div className={s.packaging} data-stage={url.stage} data-layout="dock">
      <div className={s.rail}>
        <TabRail label="studio stage" mode="audio" tabs={tabs} current={url.stage ?? "make"} />
      </div>
      <ReleaseSession read={read} openId={url.release ?? null} acts={acts}>
        {(session) => <Dock url={url} read={read} session={session} thread={thread} newId={newId} />}
      </ReleaseSession>
    </div>
  );
}
