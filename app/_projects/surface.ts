// What the race sheet is handed. The host (app/projects/ProjectsView.tsx) owns
// storage, navigation, the dialogs, the demo shelf and the synthetic fixture;
// the sheet owns the drawing and the shelf query it opens on.

import type { PhaseKey, Project } from "@/lib/projects";

export interface SurfaceProps {
  /** Never empty — the host draws the empty shelf itself. */
  projects: Project[];
  /** `step` opens the project AT that step (`/studio/<id>?step=`). */
  onOpen: (p: Project, step?: PhaseKey) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  onCreate: () => void;
  /** The host's tools, drawn beside the sheet's own create control rather than
   *  in a header of their own: the `demo N` chip and the quick-create glyph.
   *
   *  They land there because of where they have to SIT, not because a shelf
   *  needs to know about them. /projects once carried an `eyebrow + <h1>`
   *  header whose only other occupant was the expert-form button, and when the
   *  heading went (the nav marks the active module since 0ffc865) that button
   *  was left alone in a full-width band of nothing. Two create affordances
   *  differing only by weight say "primary" and "shortcut" when they are
   *  adjacent; a hundred pixels apart they are just two buttons. */
  aside?: React.ReactNode;
}
