"use client";

// A SECTION LINK OF THE STUDIO HEADER - the one place a header navigation is drawn, so what a
// click looks like while its route is still being read on the server has one home.
//
// Prefetch stays off, for the reason HeaderBar.tsx records: a switch is a soft navigation, and
// eight sections are not rendered ahead of a click (the Floor walks every v1 store).
// `aria-current` is the caller's, derived from the pathname, never held here.

import Link from "next/link";
import type { ReactNode } from "react";

export function NavLink({ href, current, className, children }: { readonly href: string; readonly current: boolean; readonly className?: string; readonly children: ReactNode }) {
  return (
    <Link className={className} href={href} prefetch={false} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
