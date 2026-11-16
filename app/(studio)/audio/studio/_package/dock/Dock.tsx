"use client";

// PACKAGING LAYOUT "dock" (spark studio-to-release) - a WORKING STUB with the final signature; WP6 builds the layout.
import { Wizard } from "../../../_release/wizard/Wizard.tsx";
import type { PackagingVariantProps } from "../props.ts";
import s from "./dock.module.css";

export function Dock({ url, read, session, thread, newId }: PackagingVariantProps) {
  return (
    <div className={s.layout} data-layout="dock">
      <div className={s.thread}>{thread}</div>
      <div className={s.step}>
        <Wizard read={read} session={session} newId={newId} {...(url.stage === "release" ? { startStep: "review" as const } : {})} />
      </div>
    </div>
  );
}
