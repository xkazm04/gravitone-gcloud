"use client";

// THE STUDIO'S PACKAGING AND RELEASE STAGES (spark studio-to-release): one surface, three stages - make, package,
// release. In package and release the conversation stays and the release's steps join it; the release stage is the
// wizard opened at its review (the Calendar slots and Schedule). The draft is the release session (../../_release/
// Session.tsx): on the fixture side nothing is written, on the real side every edit goes to the store with its
// version. `pv` picks the layout under test until the owner's pick.
import { useCallback, type ComponentType } from "react";

import { TabRail } from "@gt/ui/components/tabrail/TabRail.tsx";

import type { ReleaseRead } from "../../_release/_port/port.ts";
import type { ReleaseActs } from "../../_release/act.ts";
import { applyReleaseAct, createReleaseAct, releaseThisAct } from "../../_release/acts.ts";
import { ReleaseSession } from "../../_release/Session.tsx";
import { STUDIO_STAGES, studioHref, type PackagingVariant, type StudioUrl } from "../url.ts";
import { Dock } from "./dock/Dock.tsx";
import type { PackagingVariantProps } from "./props.ts";
import { Split } from "./split/Split.tsx";
import s from "./packaging.module.css";

const LAYOUTS: Readonly<Record<PackagingVariant, ComponentType<PackagingVariantProps>>> = { split: Split, dock: Dock };
const STAGE_LABEL = { make: "make", package: "package", release: "release" } as const;

const REAL_ACTS: ReleaseActs = { releaseThis: releaseThisAct, create: createReleaseAct, apply: applyReleaseAct };

const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");

export function Packaging({ url, read, thread }: { readonly url: StudioUrl; readonly read: ReleaseRead; readonly thread: React.ReactNode }) {
  const newId = useCallback(() => `rel-${hex12()}`, []);
  const Layout = LAYOUTS[url.packaging ?? "split"];
  const tabs = STUDIO_STAGES.map((st) => ({ id: st, label: STAGE_LABEL[st], href: studioHref({ ...url, stage: st }) }));
  return (
    <div className={s.packaging} data-stage={url.stage} data-layout={url.packaging ?? "split"}>
      <div className={s.rail}>
        <TabRail label="studio stage" mode="audio" tabs={tabs} current={url.stage ?? "make"} />
      </div>
      <ReleaseSession read={read} openId={url.release ?? null} acts={url.source === "fixture" ? null : REAL_ACTS}>
        {(session) => <Layout url={url} read={read} session={session} thread={thread} newId={newId} />}
      </ReleaseSession>
    </div>
  );
}
