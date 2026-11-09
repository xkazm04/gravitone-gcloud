"use client";

// A SECTION LINK OF THE STUDIO HEADER - the one place a header navigation is drawn, so what a
// click looks like while its route is still being read on the server has one home.
//
// Prefetch stays off, for the reason HeaderBar.tsx records: a switch is a soft navigation, and
// eight sections are not rendered ahead of a click (the Floor walks every v1 store).
// `aria-current` is the caller's, derived from the pathname, never held here.
//
// THE CLICK IS ANSWERED ON THE LINK ITSELF. With prefetch off, nothing of the next section exists
// on the client until the server's first chunk arrives (the section's loading frame rides in it),
// and until then the old screen stood frozen with no sign the click was heard. `useLinkStatus`
// (next/link, readable only below a <Link>) is pending from the click until history updates; it
// shows only the LAST link clicked, so two quick clicks never leave two marks.
//
// The mark is one underline, always rendered and sized by the link, so pending moves no pixel of
// the nav (measured by the bounding boxes in the capture). It enters only after --dur-fast: a
// navigation that commits sooner never shows it. Assistive technology hears `aria-busy` on the
// link; the hook can only be read below the <Link>, so the mark sets it on its anchor.

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef, type ReactNode } from "react";

import s from "./Shell.module.css";

export function NavLink({ href, current, className, children }: { readonly href: string; readonly current: boolean; readonly className?: string; readonly children: ReactNode }) {
  return (
    <Link className={className} href={href} prefetch={false} aria-current={current ? "page" : undefined}>
      {children}
      <PendingMark />
    </Link>
  );
}

/** The underline that answers a click, and the link's `aria-busy` while it is pending. */
export function PendingMark() {
  const { pending } = useLinkStatus();
  const mark = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const link = mark.current?.closest("a");
    if (link === null || link === undefined || !pending) return;
    link.setAttribute("aria-busy", "true");
    return () => link.removeAttribute("aria-busy");
  }, [pending]);
  return <span ref={mark} className={s.pending} data-pending={pending ? "" : undefined} aria-hidden="true" />;
}
