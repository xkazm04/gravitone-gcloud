// /projects/[id] - a project's PLAN (plan §2.1; Phase 4, L28; COMMON decision 11). `runs` and
// v1's `new` are static segments and win over this one; v1's shelf keeps `/projects` itself until
// the cutover wave.
//
// A Server Component: the plan, the composition list and Compose's choices are read here through
// the produce port (../_port/port.ts) and handed to one client island with the port's actions.
// An id the port does not know is a 404, not an empty plan.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { produceNow, serverProduce } from "../_port/port.ts";
import { PRODUCE_PORT } from "../_port/wire.ts";
import { Plan } from "../_plan/Plan.tsx";

export const metadata: Metadata = { title: "Gravitone · Plan" };

type Params = Promise<{ readonly id: string }>;
type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

const decoded = (raw: string): string => {
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

export default async function PlanPage({ params, searchParams }: { readonly params: Params; readonly searchParams: Search }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const port = serverProduce();
  const view = port.loadPlan({ id: decoded(id) });
  if (!view.ok) {
    if (view.error.code === "not-found") notFound();
    throw view.error;
  }
  const list = port.listProjects();
  const choices = port.composeChoices();
  const jobs = port.listJobs();
  const floorRuns = jobs.ok ? jobs.value.filter((j) => j.projectId === undefined && j.state !== "done").length : 0;
  return (
    <Plan
      view={view.value}
      list={list.ok ? list.value : { projects: [], truncated: false }}
      choices={choices.ok ? choices.value : null}
      port={PRODUCE_PORT}
      nowMs={produceNow()}
      floorRuns={floorRuns}
      composed={q["composed"] === "1"}
    />
  );
}
