// /studio/<v1 id> - v1's studio, retired in Phase 4 wave D. A bookmark, a skill's link or a bell
// row from before the cutover is sent to the Project the production became (./redirect.ts).
import { redirect } from "next/navigation";

import { serverProduce } from "../../projects/_port/port.ts";
import { kernelIdOf } from "../../../../lib/import/project.ts";
import { v1StudioTarget, type ImportedPlan } from "./redirect.ts";

type Params = Promise<{ readonly projectId: string }>;
type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
/** The segment as the Plan page reads it: decoded when it can be, verbatim when it is malformed. */
const decoded = (raw: string): string => {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export default async function V1Studio({ params, searchParams }: { readonly params: Params; readonly searchParams: Search }) {
  const [{ projectId }, q] = await Promise.all([params, searchParams]);
  const view = serverProduce().loadPlan({ id: kernelIdOf(decoded(projectId)) });
  const plan: ImportedPlan = view.ok ? { id: view.value.project.id, parts: view.value.parts } : null;
  redirect(v1StudioTarget({ step: one(q["step"]), plan }));
}
