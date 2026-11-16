"use client";

// PACKAGING LAYOUT "split" (spark studio-to-release) - a WORKING STUB with the final signature; WP5 builds the layout.
import { Wizard } from "../../../_release/wizard/Wizard.tsx";
import type { PackagingVariantProps } from "../props.ts";
import s from "./split.module.css";

export function Split({ url, read, session, thread, newId }: PackagingVariantProps) {
  return (
    <div className={s.layout} data-layout="split">
      <div className={s.thread}>{thread}</div>
      <div className={s.step}>
        <Wizard read={read} session={session} newId={newId} {...(url.stage === "release" ? { startStep: "review" as const } : {})} />
      </div>
    </div>
  );
}
