// The /foundry page's only way to the disk: the /api/foundry/* seams.
//
// Same access header as every other gated route (lib/imagingClient.ts), and
// for <img> tags — which cannot carry a header — the same public value as a
// query parameter (see app/api/foundry/file/route.ts for why that is honest).

import { accessHeader } from "@/lib/imagingClient";
import type { Catalogue, CommitResult, RunDetail, RunSummary, Verdicts } from "@/lib/foundry/types";
import type { TrainingCommitResult, TrainingCycleDetail, TrainingCycleSummary, TrainingVerdicts } from "@/lib/foundry/training/types";

export class FoundryRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { "content-type": "application/json", ...accessHeader(), ...(init.headers ?? {}) },
    });
  } catch {
    throw new FoundryRequestError("The studio could not be reached.", 0);
  }
  const json = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) throw new FoundryRequestError((json as { detail?: string }).detail ?? `HTTP ${res.status}`, res.status);
  return json as T;
}

export const fetchRuns = () => call<{ runs: RunSummary[] }>("/api/foundry/runs").then((r) => r.runs);
export const fetchRun = (id: string) => call<RunDetail>(`/api/foundry/runs/${encodeURIComponent(id)}`);
export const fetchCatalogue = () => call<Catalogue>("/api/foundry/styles");
export const saveVerdicts = (id: string, verdicts: Verdicts) =>
  call<{ ok: true }>(`/api/foundry/runs/${encodeURIComponent(id)}/verdicts`, {
    method: "PUT",
    body: JSON.stringify({ verdicts }),
  });
export const commitRun = (id: string, undecidedAs: "reject" | "leave") =>
  call<CommitResult>(`/api/foundry/runs/${encodeURIComponent(id)}/commit`, {
    method: "POST",
    body: JSON.stringify({ undecidedAs }),
  });

/* ── The Dojo's seams — the training loop's cycles, gated by hand ────────── */

export const fetchTrainingCycles = () => call<{ cycles: TrainingCycleSummary[] }>("/api/foundry/training").then((r) => r.cycles);
export const fetchTrainingCycle = (id: string) => call<TrainingCycleDetail>(`/api/foundry/training/${encodeURIComponent(id)}`);
export const saveTrainingVerdicts = (id: string, verdicts: TrainingVerdicts) =>
  call<{ verdicts: TrainingVerdicts }>(`/api/foundry/training/${encodeURIComponent(id)}/verdicts`, {
    method: "PUT",
    body: JSON.stringify({ verdicts }),
  }).then((r) => r.verdicts);
export const commitTrainingCycle = (id: string) =>
  call<TrainingCommitResult>(`/api/foundry/training/${encodeURIComponent(id)}/commit`, { method: "POST" });

/** URL of a run file, for an <img>. `kind` picks the output root — the
 *  forge's runs by default, the Extract module's with "extract", the Dojo's
 *  cycles with "training". */
export function fileUrl(run: string, rel: string, kind?: "extract" | "training"): string {
  const k = process.env.NEXT_PUBLIC_IMAGING_ACCESS_SECRET?.trim();
  const q = new URLSearchParams({ run, path: rel, ...(kind ? { kind } : {}), ...(k ? { k } : {}) });
  return `/api/foundry/file?${q.toString()}`;
}
