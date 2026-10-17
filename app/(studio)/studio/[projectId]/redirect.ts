// Where a v1 studio address goes now (Phase 4 wave D; plan §5.7: deep links become redirects).
//
// v1 addressed one production as `/studio/<v1 id>?step=<step>` (StudioView, its stepper and
// studioNav.ts parked the step in the address so a bookmark reopened it). The studio retired; the
// production is a kernel Project and each step a Part with its own editor. The import names the
// Project `v1-<v1 id>` (lib/import/project.ts `kernelIdOf`), so a bookmark finds its Project
// without a lookup table:
//   · imported, and the step is a part of it with an editor -> that part's editor;
//   · imported, any other step (or none)                  -> the Project's Plan;
//   · not imported yet                                     -> /projects/import, which reads this
//     browser's v1 rows and imports them in one click (the rows live in the browser, so the server
//     cannot import on the redirect's behalf).
// A v1 recipe that has no part of the step's kind (an album video has no `script`) lands on the
// Plan rather than a 404: the address named a production that exists.
import { isEditorKind } from "@gt/domain/partView";

/** The imported Project as the redirect needs it, or null when no `v1-<id>` Project exists. */
export type ImportedPlan = {
  readonly id: string;
  readonly parts: readonly { readonly id: string; readonly kind: string }[];
} | null;

export const IMPORT_HREF = "/projects/import";

export function v1StudioTarget(input: { readonly step?: string | undefined; readonly plan: ImportedPlan }): string {
  const { plan, step } = input;
  if (plan === null) return IMPORT_HREF;
  const home = `/projects/${encodeURIComponent(plan.id)}`;
  if (step === undefined || !isEditorKind(step)) return home;
  // A part id is `<project id><sep><key>` (the Plan's editorHref slices the same way).
  const part = plan.parts.find((p) => p.kind === step);
  return part === undefined ? home : `${home}/${encodeURIComponent(part.id.slice(plan.id.length + 1))}`;
}
