// /projects - the composition list (plan §2.1; Phase 4 wave D). v1's shelf held this address
// until the cutover; it retired with the wizard and the studio (their addresses redirect:
// app/projects/new, app/studio/[projectId]).
//
// The prototype opened projects.html on its first project's plan (projects.js `fromHash`: no hash
// -> the first project), so this page is that Plan - the list beside it, the first row in the
// list's own order lit - and the list alone when nothing is composed yet. `?compose=1` (where
// v1's /projects/new lands) opens Compose over either.
import type { Metadata } from "next";

import { produceNow, serverProduce } from "./_port/port.ts";
import { PRODUCE_PORT } from "./_port/wire.ts";
import { ordered } from "./_plan/shelf.ts";
import { NoPlan } from "./_plan/NoPlan.tsx";
import { Plan } from "./_plan/Plan.tsx";

export const metadata: Metadata = { title: "Gravitone · Projects" };

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function ProjectsPage({ searchParams }: { readonly searchParams: Search }) {
  const q = await searchParams;
  const composing = q["compose"] === "1";
  const port = serverProduce();
  const read = port.listProjects();
  const list = read.ok ? read.value : { projects: [], truncated: false };
  const choices = port.composeChoices();
  const jobs = port.listJobs();
  const floorRuns = jobs.ok ? jobs.value.filter((j) => j.projectId === undefined && j.state !== "done").length : 0;
  const nowMs = produceNow();
  const first = ordered(list)[0];
  const view = first === undefined ? null : port.loadPlan({ id: first.id });
  if (view !== null && !view.ok) throw view.error;
  return view === null ? (
    <NoPlan list={list} choices={choices.ok ? choices.value : null} port={PRODUCE_PORT} nowMs={nowMs} floorRuns={floorRuns} composing={composing} />
  ) : (
    <Plan view={view.value} list={list} choices={choices.ok ? choices.value : null} port={PRODUCE_PORT} nowMs={nowMs} floorRuns={floorRuns} composed={false} composing={composing} />
  );
}
