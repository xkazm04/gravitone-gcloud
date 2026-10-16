// THE STUDIO'S SECTIONS - one closed list the header draws and the kit reads (app-shell
// navigation-model: one registry carries label, order and reachability; active state is
// derived from the URL, never stored).
//
// The prototype's header (shell.js `NAV`) listed nine entries with Board, Runs and Calendar
// beside the pages; in the rebuild those are a sheet over the Floor, a Projects view and the
// Floor's rail (plan §2.1), so the header names pages only. Kit moves to the right edge as
// the prototype's `.kit-link` did.
//
// `built: false` draws a disabled link, never a dead one. A section whose route does not
// exist yet must not be a destination: a 404 behind a nav entry is the "hidden entry with a
// reachable destination" app-shell entitlement-gating forbids, from the other side. The
// Floor (Phase 3, `/floor`, plan §8.6) and the Ledger (Phase 2) flipped to `built: true` in
// the changes that shipped their pages. Projects and Library are v1's routes until their phases
// replace them, and are links out of this world until then.

export type Section = {
  readonly id: "floor" | "projects" | "runs" | "library" | "audio" | "ledger" | "kit";
  readonly label: string;
  readonly href: string;
  readonly built: boolean;
  /** Draws a separator before this entry (the prototype's `["sep"]` rows). */
  readonly group: "hub" | "work" | "record" | "system";
};

export const SECTIONS: readonly Section[] = [
  { id: "floor", label: "Floor", href: "/floor", built: true, group: "hub" },
  { id: "projects", label: "Projects", href: "/projects", built: true, group: "work" },
  // Runs is a Projects view (plan §2.1) the prototype's header also named on its own; it is
  // built in Phase 2 at /projects/runs while /projects is still v1's list.
  { id: "runs", label: "Runs", href: "/projects/runs", built: true, group: "work" },
  { id: "library", label: "Library", href: "/library", built: true, group: "record" },
  { id: "audio", label: "Audio", href: "/audio", built: true, group: "record" },
  { id: "ledger", label: "Ledger", href: "/ledger", built: true, group: "record" },
  { id: "kit", label: "Kit", href: "/kit", built: true, group: "system" },
];

/** The section a pathname is in: the longest href that prefixes it on a segment boundary. */
export function sectionOf(pathname: string): Section["id"] | null {
  let best: Section | null = null;
  for (const s of SECTIONS) {
    const hit = pathname === s.href || pathname.startsWith(`${s.href}/`);
    if (hit && (best === null || s.href.length > best.href.length)) best = s;
  }
  return best?.id ?? null;
}
