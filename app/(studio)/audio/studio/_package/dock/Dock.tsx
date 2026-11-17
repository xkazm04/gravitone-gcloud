"use client";

// PACKAGING LAYOUT "dock" (spark studio-to-release, WP6; its stage is Focus since prototype dock-package, 2026-11-17 -
// one lead per step, a quiet read, detail on click: ./focus/). The release's step takes the main frame and the
// conversation folds into the dock at the bottom. Folded, the studio host shows only what the make stage's dock
// shows - the agent's last reply, the listening pill and the line in - plus any banner (a real error is never
// folded away); the conversation picker, the answer cards and the next steps are one press away, and open as a
// drawer over the bottom of the frame with the step still above it, its share set by the grip (./Grip.tsx).
// Nothing is unmounted by the fold: the host's transport, draft and scroll survive a fold and an open, and the
// dock still sends.
//
// The host (../../_host/StudioHost.tsx) is drawn unchanged, so the fold is CSS over its documented marks:
// the dock marks itself `data-dock` (@gt/ui dock/Dock.tsx) and the banner is `role="status"`; everything else in
// the host's frame is hidden while folded. A `fold` prop on StudioHost would say this without reading its DOM
// shape (WP6 report).
//
// The handle carries the agent's pending proposals as a tally: what the conversation filled waits in the step
// above for the operator, so the count belongs beside the fold rather than in a sentence. The store's refusals
// are the wizard's own line (session.notice), not this layout's.
import { useId, useRef, useState, type CSSProperties } from "react";

import { Tally } from "@gt/ui/components/tally/Tally.tsx";
import { Toggle } from "@gt/ui/components/toggle/Toggle.tsx";

import type { PackagingVariantProps } from "../props.ts";
import { Grip, OPEN_DEFAULT } from "./Grip.tsx";
import { FocusStage } from "./focus/FocusStage.tsx";
import s from "./dock.module.css";

export function Dock({ url, read, session, thread, newId }: PackagingVariantProps) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState(OPEN_DEFAULT);
  const layout = useRef<HTMLDivElement | null>(null);
  const threadId = useId();
  const pending = session.pending.length;
  return (
    <div ref={layout} className={s.layout} data-layout="dock" data-open={open} style={{ "--dock-share": `${share}%` } as CSSProperties}>
      <div className={s.step}>
        <FocusStage read={read} session={session} newId={newId} {...(url.stage === "release" ? { startStep: "review" as const } : {})} />
      </div>
      <div className={s.handle}>
        {open && <Grip value={share} onChange={setShare} controls={threadId} frame={() => layout.current?.getBoundingClientRect() ?? null} />}
        <Toggle label="conversation" glyph={open ? "down" : "up"} on={open} onToggle={setOpen} controls={threadId} />
        {pending > 0 && <Tally value={pending} label="proposed" />}
      </div>
      <section id={threadId} className={s.thread} data-open={open} aria-label="conversation">
        {thread}
      </section>
    </div>
  );
}
