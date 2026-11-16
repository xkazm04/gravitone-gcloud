// RUNS' ADDRESS - pure, client-safe (../../../library/_library/url.ts is the pattern). Every key is
// WINDOWING: the same read seen differently, so the island writes it with history.replaceState
// and never asks the server again (./Runs.tsx). The server reads it once (../page.tsx) so a link
// - the header's needs chip, a part's failed job, a Ledger row - opens on the right view.
//
// Defaults are omitted: the bare address is every lane, nothing selected, 24h, every state, and a
// copied link carries only what was changed. An unknown value reads as the default, never as an
// error page.

import { DEFAULT_ZOOM, isZoom, type Zoom } from "@gt/ui/components/runs/dayline.ts";

import { isRunFilter, type RunFilter } from "./view.ts";

export type Selection = { readonly job: string | null; readonly project: string | null; readonly zoom: Zoom; readonly state: RunFilter | null };

type Params = Readonly<Record<string, string | readonly string[] | undefined>>;

const one = (v: string | readonly string[] | undefined): string | null => (typeof v === "string" && v !== "" ? v : null);

export function parseRuns(p: Params): Selection {
  const zoom = one(p["zoom"]);
  const state = one(p["state"]);
  return { job: one(p["job"]), project: one(p["project"]), zoom: isZoom(zoom) ? zoom : DEFAULT_ZOOM, state: isRunFilter(state) ? state : null };
}

/** The query string (no `?`), defaults left out. */
export function runsSearch(sel: Selection): string {
  const q = new URLSearchParams();
  if (sel.project !== null) q.set("project", sel.project);
  if (sel.job !== null) q.set("job", sel.job);
  if (sel.zoom !== DEFAULT_ZOOM) q.set("zoom", sel.zoom);
  if (sel.state !== null) q.set("state", sel.state);
  return q.toString();
}
