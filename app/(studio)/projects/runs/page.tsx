// /projects/runs - Runs, the day-line across every resource (plan §2.1; Phase 2, read-only).
//
// BESIDE v1's /projects. v1 owns `app/projects/page.tsx` (and `/projects/new`) until Phase 4;
// this route lives in the (studio) group at `projects/runs`, a sibling segment the two route
// trees do not share, so both resolve (COMMON decision 8, proved by `next build`).
//
// A Server Component: the data is read here, on the server, where the stores are (./_runs/
// load.ts), and handed to one client island. The selection arrives in the search params so a
// link can carry it (`/ledger` links a job here as `?job=<source>:<id>`), and the island keeps
// it there afterwards without asking the server again.
import type { Metadata } from "next";

import { DEFAULT_ZOOM, isZoom } from "@gt/ui/components/runs/dayline.ts";

import { loadRuns } from "./_runs/load.ts";
import { Runs } from "./_runs/Runs.tsx";

export const metadata: Metadata = { title: "Gravitone · Runs" };

type Search = Promise<Readonly<Record<string, string | string[] | undefined>>>;

export default async function RunsPage({ searchParams }: { readonly searchParams: Search }) {
  const q = await searchParams;
  const one = (k: string): string | null => {
    const v = q[k];
    return typeof v === "string" && v !== "" ? v : null;
  };
  const zoom = one("zoom");
  const data = await loadRuns();
  return <Runs data={data} initial={{ job: one("job"), project: one("project"), zoom: isZoom(zoom) ? zoom : DEFAULT_ZOOM }} />;
}
