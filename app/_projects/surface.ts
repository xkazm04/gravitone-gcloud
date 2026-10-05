// What a /projects variant is handed. The host (app/projects/ProjectsView.tsx)
// owns storage, navigation, the dialogs and the synthetic fixture; a variant owns
// the drawing and the shelf query it opens on.

import type { PhaseKey, Project } from "@/lib/projects";

export interface SurfaceProps {
  /** Never empty — the host draws the empty shelf itself. */
  projects: Project[];
  /** `step` opens the project AT that step (`/studio/<id>?step=`). */
  onOpen: (p: Project, step?: PhaseKey) => void;
  onEdit: (p: Project) => void;
  onDelete: (p: Project) => void;
  /** The same writer the single delete uses, once per project, in order. */
  onDeleteMany: (ps: Project[]) => Promise<void>;
  onCreate: () => void;
  aside?: React.ReactNode;
}
